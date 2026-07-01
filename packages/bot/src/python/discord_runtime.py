import logging
import sys

import discord

from captcha import solve_captcha_with_anysolver


class OutreachClient(discord.Client):
    def __init__(self, account: dict, state) -> None:
        super().__init__(captcha_handler=solve_captcha_with_anysolver)
        self.account = account
        self.state = state
        proxy_url = (account.get("proxyUrl") or "").strip()
        if proxy_url:
            self.http.proxy = proxy_url
            self.http.proxy_gateway = True

    async def on_ready(self) -> None:
        proxy_label = self.account.get("proxyLabel") or self.account.get("proxyId") or "no proxy"
        await self.state.db.log(f'Logged in as {self.user} (account: {self.account.get("username") or self.account["id"]}, proxy: {proxy_label})', "success")

    async def on_member_join(self, member: discord.Member) -> None:
        if not self.state.is_primary(self.account["id"]):
            return
        guild_id = str(member.guild.id) if member.guild else ""
        user_id = str(member.id)
        if not guild_id or not await self.state.db.is_whitelisted_guild(guild_id):
            return
        if guild_id and await self.state.db.is_blacklisted("guild", guild_id):
            await self.state.db.log(f"Ignored {member.name} ({member.id}) because guild {guild_id} is blacklisted.", "info")
            return
        if await self.state.db.is_blacklisted("user", user_id):
            await self.state.db.log(f"Ignored blacklisted user {member.name} ({member.id}).", "info")
            return
        config = await self.state.db.fetch_config()
        process_rejoins = bool(config.get("processRejoins"))
        created = await self.state.db.upsert_member_join(user_id, member.name, bool(config.get("enableFriendRequests")), guild_id, process_rejoins)
        if not created:
            await self.state.db.log(f"Ignored rejoin for {member.name} ({member.id}). This member was already processed before.", "info")
            return
        await self.state.db.assign_account(user_id, self.account["id"])
        await self.state.db.log(f"Member joined whitelisted server {guild_id}: {member.name} ({member.id})", "info")
        self.state.schedule_join_actions(user_id, member.name, config, 0, bool(config.get("enableFriendRequests")))

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot or (self.user and message.author.id == self.user.id):
            return
        if getattr(message, "guild", None) is not None:
            return
        await self.state.handle_user_reply(str(message.author.id), message.author.name, message.content or "")

    async def on_error(self, event_method: str, *args, **kwargs) -> None:
        exc = sys.exc_info()[1]
        if isinstance(exc, discord.CaptchaRequired):
            logging.warning("CAPTCHA_REQUIRED | context=%s | service=%s | sitekey=%s", event_method, exc.service, exc.sitekey)
            return
        logging.exception("Unhandled exception in %s", event_method)
