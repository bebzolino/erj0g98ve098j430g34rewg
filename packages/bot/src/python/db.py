import asyncio
import json
import logging
import uuid

import psycopg

from status import DIR_INBOUND, DIR_OUTBOUND, FRIEND_IDLE, FRIEND_PENDING, MEMBER_PENDING


class Database:
    def __init__(self, url: str) -> None:
        self.url = url

    def connect(self):
        return psycopg.connect(self.url)

    async def run(self, fn, *args):
        return await asyncio.to_thread(fn, *args)

    async def fetch_config(self) -> dict:
        return await self.run(self._fetch_config)

    def _fetch_config(self) -> dict:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT * FROM "SystemConfig" WHERE id = %s', ("default",))
                row = cur.fetchone()
                if row is None:
                    return {}
                return dict(zip([desc.name for desc in cur.description], row))

    async def log(self, message: str, level: str = "info") -> None:
        await self.run(self._log, message, level)

    def _log(self, message: str, level: str) -> None:
        logging.info("[DB_LOG][%s] %s", level.upper(), message)
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'INSERT INTO "Log" (id, message, level) VALUES (%s, %s, %s)',
                    (str(uuid.uuid4()), message, level),
                )
            conn.commit()

    async def is_blacklisted(self, entry_type: str, value: str) -> bool:
        return await self.run(self._is_blacklisted, entry_type, value)

    def _is_blacklisted(self, entry_type: str, value: str) -> bool:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT COUNT(*) FROM "BlacklistEntry" WHERE type = %s AND value = %s',
                    (entry_type, value),
                )
                return int(cur.fetchone()[0]) > 0

    async def fetch_accounts(self, statuses: tuple[str, ...]) -> list[dict]:
        return await self.run(self._fetch_accounts, statuses)

    def _fetch_accounts(self, statuses: tuple[str, ...]) -> list[dict]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT id, token, username, status FROM "Account" WHERE status = ANY(%s) ORDER BY "lastUsedAt" ASC NULLS FIRST, "createdAt" ASC',
                    (list(statuses),),
                )
                columns = [desc.name for desc in cur.description]
                return [dict(zip(columns, row)) for row in cur.fetchall()]

    async def fetch_account(self, account_id: str) -> dict | None:
        return await self.run(self._fetch_account, account_id)

    def _fetch_account(self, account_id: str) -> dict | None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT id, token, username, status FROM "Account" WHERE id = %s', (account_id,))
                row = cur.fetchone()
                if not row:
                    return None
                return dict(zip([desc.name for desc in cur.description], row))

    async def set_account_status(self, account_id: str, status: str, reason: str) -> None:
        await self.run(self._set_account_status, account_id, status)
        account = await self.fetch_account(account_id)
        name = (account or {}).get("username") or account_id
        await self.log(f'Account "{name}" is now {status.replace("_", " ")}. {reason}', "error")

    def _set_account_status(self, account_id: str, status: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('UPDATE "Account" SET status = %s WHERE id = %s', (status, account_id))
            conn.commit()

    async def upsert_member_join(self, user_id: str, username: str, friend_request_pending: bool) -> None:
        await self.run(self._upsert_member_join, user_id, username, friend_request_pending)

    def _upsert_member_join(self, user_id: str, username: str, friend_request_pending: bool) -> None:
        friend_status = FRIEND_PENDING if friend_request_pending else FRIEND_IDLE
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO "Member" ("userId", username, status, "friendRequestStatus", "joinTime")
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT ("userId") DO UPDATE
                    SET username = EXCLUDED.username,
                        status = EXCLUDED.status,
                        "friendRequestStatus" = EXCLUDED."friendRequestStatus",
                        "joinTime" = NOW()
                    """,
                    (user_id, username, MEMBER_PENDING, friend_status),
                )
            conn.commit()

    async def fetch_member(self, user_id: str) -> dict | None:
        return await self.run(self._fetch_member, user_id)

    def _fetch_member(self, user_id: str) -> dict | None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT * FROM "Member" WHERE "userId" = %s', (user_id,))
                row = cur.fetchone()
                if not row:
                    return None
                return dict(zip([desc.name for desc in cur.description], row))

    async def pending_members(self) -> list[dict]:
        return await self.run(self._pending_members)

    def _pending_members(self) -> list[dict]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT "userId", username, "joinTime", "friendRequestStatus" FROM "Member" WHERE status = %s', (MEMBER_PENDING,))
                columns = [desc.name for desc in cur.description]
                return [dict(zip(columns, row)) for row in cur.fetchall()]

    async def members_with_last_outbound(self, status: str) -> list[dict]:
        return await self.run(self._members_with_last_outbound, status)

    def _members_with_last_outbound(self, status: str) -> list[dict]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT m."userId", m.username, MAX(c.timestamp) AS "lastOutboundAt"
                    FROM "Member" m
                    JOIN "Conversation" c ON c."userId" = m."userId"
                    WHERE m.status = %s AND c.direction = %s
                    GROUP BY m."userId", m.username
                    """,
                    (status, DIR_OUTBOUND),
                )
                columns = [desc.name for desc in cur.description]
                return [dict(zip(columns, row)) for row in cur.fetchall() if row[2] is not None]

    async def has_reply_after(self, user_id: str, timestamp) -> bool:
        return await self.run(self._has_reply_after, user_id, timestamp)

    def _has_reply_after(self, user_id: str, timestamp) -> bool:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT COUNT(*) FROM "Conversation" WHERE "userId" = %s AND direction = %s AND timestamp > %s',
                    (user_id, DIR_INBOUND, timestamp),
                )
                return int(cur.fetchone()[0]) > 0

    async def create_conversation(self, user_id: str, message: str, direction: str, account_id: str | None = None) -> None:
        await self.run(self._create_conversation, user_id, message, direction, account_id)

    def _create_conversation(self, user_id: str, message: str, direction: str, account_id: str | None) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'INSERT INTO "Conversation" (id, "userId", message, direction, "accountId") VALUES (%s, %s, %s, %s, %s)',
                    (str(uuid.uuid4()), user_id, message, direction, account_id),
                )
            conn.commit()

    async def update_member_status(self, user_id: str, status: str) -> None:
        await self.run(self._update_member_status, user_id, status)

    def _update_member_status(self, user_id: str, status: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('UPDATE "Member" SET status = %s WHERE "userId" = %s', (status, user_id))
            conn.commit()

    async def update_member_ai(self, user_id: str, result: dict) -> None:
        await self.run(self._update_member_ai, user_id, result)

    def _update_member_ai(self, user_id: str, result: dict) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE "Member"
                    SET "interestScore" = %s,
                        "interestLevel" = %s,
                        sentiment = %s,
                        "isToxic" = %s,
                        tags = %s
                    WHERE "userId" = %s
                    """,
                    (
                        result.get("interestScore"),
                        result.get("interestLevel"),
                        result.get("sentiment"),
                        bool(result.get("isToxic")),
                        json.dumps(result.get("tags") or []),
                        user_id,
                    ),
                )
            conn.commit()

    async def update_friend_status(self, user_id: str, status: str) -> None:
        await self.run(self._update_friend_status, user_id, status)

    def _update_friend_status(self, user_id: str, status: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('UPDATE "Member" SET "friendRequestStatus" = %s WHERE "userId" = %s', (status, user_id))
            conn.commit()

    async def assign_account(self, user_id: str, account_id: str) -> None:
        await self.run(self._assign_account, user_id, account_id)

    def _assign_account(self, user_id: str, account_id: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('UPDATE "Member" SET "assignedAccountId" = %s WHERE "userId" = %s', (account_id, user_id))
                cur.execute('UPDATE "Account" SET "lastUsedAt" = NOW() WHERE id = %s', (account_id,))
            conn.commit()
