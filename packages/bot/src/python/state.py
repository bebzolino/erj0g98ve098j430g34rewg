import asyncio
import logging
from datetime import datetime, timezone

import discord

from ai_classifier import classify_reply
from discord_runtime import OutreachClient
from status import (
    DIR_INBOUND,
    DIR_OUTBOUND,
    FRIEND_FAILED,
    FRIEND_PENDING,
    FRIEND_SENT,
    MEMBER_FAILED_DM,
    MEMBER_FAILED_FOLLOWUP,
    MEMBER_FIRST_DM_SENT,
    MEMBER_PENDING,
    MEMBER_PINGED,
    MEMBER_REPLIED,
    MEMBER_STOPPED,
    STATUS_ACTIVE,
    STATUS_INVALID,
    STATUS_RATE_LIMITED,
    STATUS_UNAVAILABLE,
)
from utils import format_delay, parse_timestamp, positive_int, utc_now

MAX_SCHEDULE_AHEAD_SECONDS = 3600


class BotState:
    def __init__(self, db) -> None:
        self.db = db
        self.current_config: dict = {}
        self.clients: dict[str, OutreachClient] = {}
        self.primary_account_id: str | None = None
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.next_slot_at = {"account_action": 0.0}

    def is_primary(self, account_id: str) -> bool:
        return self.primary_account_id == account_id

    async def start(self) -> None:
        await self.start_clients()
        asyncio.create_task(self.queue_loop())
        asyncio.create_task(self.account_sync_loop())

    async def start_clients(self) -> None:
        accounts = await self.db.fetch_accounts((STATUS_ACTIVE,))
        active_ids = {account["id"] for account in accounts}
        for account_id, client in list(self.clients.items()):
            account = next((row for row in accounts if row["id"] == account_id), None)
            if account and account.get("token") == client.account.get("token"):
                continue
            await self.stop_client(account_id, "account was removed, disabled, or its token changed")

        for account in accounts:
            existing = self.clients.get(account["id"])
            if existing and existing.account.get("token") == account.get("token"):
                existing.account = account
                continue
            client = OutreachClient(account, self)
            self.clients[account["id"]] = client
            if self.primary_account_id is None or self.primary_account_id not in active_ids:
                self.primary_account_id = account["id"]
            await self.db.log(f'Loading Discord account "{account.get("username") or account["id"]}" without restart.', "info")
            asyncio.create_task(self.login_client(client))

        if self.primary_account_id not in self.clients:
            self.primary_account_id = next(iter(self.clients), None)

    async def stop_client(self, account_id: str, reason: str) -> None:
        client = self.clients.pop(account_id, None)
        if not client:
            return
        name = client.account.get("username") or account_id
        try:
            if not client.is_closed():
                await client.close()
        except Exception:
            logging.exception("CLIENT_CLOSE_FAILED")
        await self.db.log(f'Disconnected Discord account "{name}" because {reason}.', "info")
        if self.primary_account_id == account_id:
            self.primary_account_id = next(iter(self.clients), None)

    async def login_client(self, client: OutreachClient) -> None:
        account = client.account
        try:
            await client.start(account["token"])
        except Exception as exc:
            reason = str(exc)
            status = STATUS_INVALID if "401" in reason or "invalid" in reason.lower() or "token" in reason.lower() else STATUS_UNAVAILABLE
            await self.db.set_account_status(account["id"], status, f"Discord login failed: {reason}")
            self.clients.pop(account["id"], None)

    async def account_sync_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            await self.start_clients()

    async def queue_loop(self) -> None:
        while True:
            try:
                await self.scan_queue()
            except Exception:
                logging.exception("QUEUE_SCAN_FAILED")
            config = await self.db.fetch_config()
            await asyncio.sleep(max(1, positive_int(config.get("queueScanIntervalSeconds"), 60)))

    async def scan_queue(self) -> None:
        config = await self.db.fetch_config()
        self.current_config = config
        for member in await self.db.pending_members():
            user_id = member["userId"]
            if await self.db.is_blacklisted("user", user_id):
                await self.db.update_member_status(user_id, MEMBER_STOPPED)
                await self.db.log(f"Skipped blacklisted user {member.get('username') or user_id} ({user_id}).", "info")
                continue
            join_time = parse_timestamp(member["joinTime"])
            joined_seconds_ago = max(0, (utc_now() - join_time).total_seconds())
            delay = max(0, self.initial_delay_seconds(config) - joined_seconds_ago)
            self.schedule_once(user_id, member.get("username") or user_id, "initial_dm", delay, self.send_initial_dm)
            if member.get("friendRequestStatus") == FRIEND_PENDING:
                delay = max(0, self.friend_delay_seconds(config) - joined_seconds_ago)
                self.schedule_once(user_id, member.get("username") or user_id, "friend_request", delay, self.send_friend_request)

        for member in await self.db.members_with_last_outbound(MEMBER_FIRST_DM_SENT):
            if await self.db.has_reply_after(member["userId"], member["lastOutboundAt"]):
                continue
            delay = max(0, positive_int(config.get("followupDelayHours"), 24) * 3600 - (utc_now() - parse_timestamp(member["lastOutboundAt"])).total_seconds())
            if delay > MAX_SCHEDULE_AHEAD_SECONDS:
                continue
            self.schedule_once(member["userId"], member.get("username") or member["userId"], "followup_dm", delay, self.send_followup_dm)

        if config.get("enablePings"):
            for member in await self.db.members_with_last_outbound(MEMBER_STOPPED):
                if await self.db.has_reply_after(member["userId"], member["lastOutboundAt"]):
                    continue
                delay = max(0, positive_int(config.get("pingDelayHours"), 48) * 3600 - (utc_now() - parse_timestamp(member["lastOutboundAt"])).total_seconds())
                if delay > MAX_SCHEDULE_AHEAD_SECONDS:
                    continue
                self.schedule_once(member["userId"], member.get("username") or member["userId"], "ping_dm", delay, self.send_ping)

    def schedule_once(self, user_id: str, username: str, kind: str, delay_seconds: float, callback) -> None:
        key = f"{user_id}:{kind}"
        if key in self.tasks:
            return
        loop = asyncio.get_running_loop()
        earliest = loop.time() + max(0, delay_seconds)
        slot = max(earliest, self.next_slot_at.get("account_action", 0.0))
        self.next_slot_at["account_action"] = slot + self.spread_seconds(kind)
        final_delay = max(0, slot - loop.time())
        task = asyncio.create_task(self.run_scheduled(username, user_id, kind, final_delay, callback))
        self.tasks[key] = task
        task.add_done_callback(lambda _: self.tasks.pop(key, None))
        run_at = datetime.fromtimestamp(utc_now().timestamp() + final_delay, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        label = self.task_label(kind)
        asyncio.create_task(self.db.log(f"{label} queued for {username} ({user_id}). Planned in {format_delay(final_delay)} at {run_at}.", "info"))

    async def run_scheduled(self, username: str, user_id: str, kind: str, delay_seconds: float, callback) -> None:
        await asyncio.sleep(delay_seconds)
        ok = await callback(user_id)
        await self.db.log(f"{self.task_label(kind)} {'sent' if ok else 'failed'} for {username} ({user_id}).", "success" if ok else "error")

    def initial_delay_seconds(self, config: dict) -> int:
        return max(positive_int(config.get("initialDelayMinutes"), 0), positive_int(config.get("safetyMinInitialDmDelayMinutes"), 0)) * 60

    def friend_delay_seconds(self, config: dict) -> int:
        return max(positive_int(config.get("friendRequestDelayMinutes"), 0), positive_int(config.get("safetyMinFriendRequestDelayMinutes"), 30)) * 60

    def spread_seconds(self, kind: str) -> int:
        if kind == "friend_request":
            return positive_int(self.current_config.get("queueFriendRequestSpreadSeconds"), 900)
        return positive_int(self.current_config.get("queueDmSpreadSeconds"), 120)

    def task_label(self, kind: str) -> str:
        labels = {
            "initial_dm": "Initial DM",
            "followup_dm": "Follow-up DM",
            "ping_dm": "Ping DM",
            "friend_request": "Friend request",
        }
        return labels.get(kind, kind.replace("_", " ").title())

    async def choose_account(self, user_id: str) -> tuple[str, OutreachClient] | None:
        member = await self.db.fetch_member(user_id)
        assigned = member.get("assignedAccountId") if member else None
        if assigned and assigned in self.clients:
            account = await self.db.fetch_account(assigned)
            if account and account.get("status") == STATUS_ACTIVE:
                return assigned, self.clients[assigned]
        for account in await self.db.fetch_accounts((STATUS_ACTIVE,)):
            client = self.clients.get(account["id"])
            if client:
                await self.db.assign_account(user_id, account["id"])
                return account["id"], client
        return None

    async def send_dm(self, user_id: str, message: str, success_status: str, fail_status: str, log_label: str) -> bool:
        if await self.db.is_blacklisted("user", user_id):
            await self.db.update_member_status(user_id, MEMBER_STOPPED)
            await self.db.log(f"{log_label} skipped for blacklisted user {user_id}.", "info")
            return False
        selected = await self.choose_account(user_id)
        member = await self.db.fetch_member(user_id)
        username = (member or {}).get("username") or user_id
        if not selected:
            await self.db.update_member_status(user_id, fail_status)
            await self.db.log(f"{log_label} failed for {username}: no active Discord account available.", "error")
            return False
        account_id, client = selected
        try:
            recipient = await client.fetch_user(int(user_id))
            await recipient.send(message)
        except discord.Forbidden as exc:
            await self.db.update_member_status(user_id, fail_status)
            await self.db.log(f"{log_label} failed for {username}: Discord did not allow a DM to this user ({exc}). Account stays active.", "error")
            return False
        except discord.HTTPException as exc:
            if getattr(exc, "status", None) == 401:
                await self.db.set_account_status(account_id, STATUS_INVALID, "Discord rejected the token while sending a DM (401 Unauthorized).")
            elif getattr(exc, "status", None) == 429:
                await self.db.set_account_status(account_id, STATUS_RATE_LIMITED, "Discord rate limited this account.")
            else:
                await self.db.log(f"{log_label} failed for {username}: Discord API error {getattr(exc, 'status', 'unknown')} ({exc}).", "error")
            await self.db.update_member_status(user_id, fail_status)
            return False
        except Exception as exc:
            await self.db.update_member_status(user_id, fail_status)
            await self.db.log(f"{log_label} failed for {username}: {exc}", "error")
            return False
        await self.db.create_conversation(user_id, message, DIR_OUTBOUND, account_id)
        await self.db.update_member_status(user_id, success_status)
        return True

    async def send_initial_dm(self, user_id: str) -> bool:
        member = await self.db.fetch_member(user_id)
        if not member or member.get("status") not in {MEMBER_PENDING, MEMBER_FAILED_DM}:
            return False
        config = await self.db.fetch_config()
        return await self.send_dm(user_id, config.get("welcomeMessage") or "", MEMBER_FIRST_DM_SENT, MEMBER_FAILED_DM, "Initial DM")

    async def send_followup_dm(self, user_id: str) -> bool:
        member = await self.db.fetch_member(user_id)
        if not member or member.get("status") != MEMBER_FIRST_DM_SENT:
            return False
        config = await self.db.fetch_config()
        return await self.send_dm(user_id, config.get("followupMessage") or "", MEMBER_STOPPED, MEMBER_FAILED_FOLLOWUP, "Follow-up DM")

    async def send_ping(self, user_id: str) -> bool:
        member = await self.db.fetch_member(user_id)
        if not member or member.get("status") != MEMBER_STOPPED:
            return False
        config = await self.db.fetch_config()
        return await self.send_dm(user_id, (config.get("pingMessage") or "").replace("{userId}", user_id), MEMBER_PINGED, MEMBER_STOPPED, "Ping")

    async def send_friend_request(self, user_id: str) -> bool:
        if await self.db.is_blacklisted("user", user_id):
            await self.db.update_friend_status(user_id, FRIEND_FAILED)
            await self.db.log(f"Friend request skipped for blacklisted user {user_id}.", "info")
            return False
        selected = await self.choose_account(user_id)
        if not selected:
            await self.db.update_friend_status(user_id, FRIEND_FAILED)
            return False
        account_id, client = selected
        try:
            recipient = await client.fetch_user(int(user_id))
            if not hasattr(recipient, "send_friend_request"):
                raise RuntimeError("discord.py-self user object has no send_friend_request method")
            await recipient.send_friend_request()
        except discord.Forbidden as exc:
            await self.db.log(f"Friend request failed for {user_id}: Discord did not allow a friend request to this user ({exc}). Account stays active.", "error")
            await self.db.update_friend_status(user_id, FRIEND_FAILED)
            return False
        except discord.HTTPException as exc:
            if getattr(exc, "status", None) == 401:
                await self.db.set_account_status(account_id, STATUS_INVALID, "Discord rejected the token while sending a friend request.")
            elif getattr(exc, "status", None) == 429:
                await self.db.set_account_status(account_id, STATUS_RATE_LIMITED, "Discord rate limited this account.")
            else:
                await self.db.log(f"Friend request failed for {user_id}: Discord API error {getattr(exc, 'status', 'unknown')} ({exc}).", "error")
            await self.db.update_friend_status(user_id, FRIEND_FAILED)
            return False
        except Exception as exc:
            await self.db.log(f"Friend request failed for {user_id}: {exc}", "error")
            await self.db.update_friend_status(user_id, FRIEND_FAILED)
            return False
        await self.db.update_friend_status(user_id, FRIEND_SENT)
        return True

    async def handle_user_reply(self, user_id: str, username: str, content: str) -> None:
        if await self.db.is_blacklisted("user", user_id):
            await self.db.log(f"Ignored reply from blacklisted user {username} ({user_id}).", "info")
            return
        await self.db.create_conversation(user_id, content, DIR_INBOUND)
        if not await self.db.fetch_member(user_id):
            await self.db.upsert_member_join(user_id, username, False)
        await self.db.update_member_status(user_id, MEMBER_REPLIED)
        config = await self.db.fetch_config()
        try:
            result = await classify_reply(config, username, content)
        except Exception as exc:
            await self.db.log(f"AI classification failed for {username} ({user_id}): {exc}", "error")
            result = None
        if result:
            await self.db.update_member_ai(user_id, result)
            await self.db.log(
                f"AI classified reply from {username}: {result['interestLevel']} "
                f"({result['interestScore']:.2f}), {result['sentiment']}.",
                "info",
            )
        await self.db.log(f'Reply received from {username} ({user_id}): "{content}"', "info")
