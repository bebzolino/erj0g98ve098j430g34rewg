import logging
import sys

import discord

from captcha import solve_captcha_with_anysolver
from utils import format_delay


class OutreachClient(discord.Client):
    def __init__(self, account: dict, state) -> None:
        super().__init__(captcha_handler=solve_captcha_with_anysolver)
        self.account = account
        self.state = state

    async def on_ready(self) -> None:
        await self.state.db.log(f'Logged in as {self.user} (account: {self.account.get("username") or self.account["id"]})', "success")

    async def on_member_join(self, member: discord.Member) -> None:
        if not self.state.is_primary(self.account["id"]):
            return
        guild_id = str(member.guild.id) if member.guild else ""
        user_id = str(member.id)
        if guild_id and await self.state.db.is_blacklisted("guild", guild_id):
            await self.state.db.log(f"Ignored {member.name} ({member.id}) because guild {guild_id} is blacklisted.", "info")
            return
        if await self.state.db.is_blacklisted("user", user_id):
            await self.state.db.log(f"Ignored blacklisted user {member.name} ({member.id}).", "info")
            return
        config = await self.state.db.fetch_config()
        await self.state.db.upsert_member_join(user_id, member.name, bool(config.get("enableFriendRequests")))
        await self.state.db.assign_account(user_id, self.account["id"])
        await self.state.db.log(f"Member joined server: {member.name} ({member.id})", "info")
        if config.get("enableFriendRequests"):
            friend_delay = self.state.friend_delay_seconds(config)
            await self.state.db.log(f"Friend request queued for {member.name} ({member.id}) in {format_delay(friend_delay)}.", "info")
        dm_delay = self.state.initial_delay_seconds(config)
        await self.state.db.log(f'Initial DM queued for {member.name} ({member.id}) in {format_delay(dm_delay)} (assigned account: "{self.account.get("username") or self.account["id"]}").', "info")

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
