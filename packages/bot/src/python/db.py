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

    async def ensure_schema(self) -> None:
        await self.run(self._ensure_schema)

    def _ensure_schema(self) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "SystemConfig" (
                        id TEXT PRIMARY KEY DEFAULT 'default',
                        "welcomeMessage" TEXT NOT NULL DEFAULT 'Hey! Welcome.\n\nHave you played Crystal PvP before?\n\nReply here if you''d like help getting started.',
                        "initialMessageVariants" TEXT NOT NULL DEFAULT '[]',
                        "followupMessage" TEXT NOT NULL DEFAULT 'Just checking in!\n\nIf you''d like help getting started, feel free to reply.',
                        "initialDelayMinutes" INTEGER NOT NULL DEFAULT 15,
                        "followupDelayHours" INTEGER NOT NULL DEFAULT 24,
                        "enableAi" BOOLEAN NOT NULL DEFAULT TRUE,
                        "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
                        "telegramBotToken" TEXT NOT NULL DEFAULT '',
                        "telegramChatId" TEXT NOT NULL DEFAULT '',
                        "typingSimulation" BOOLEAN NOT NULL DEFAULT TRUE,
                        "enableFriendRequests" BOOLEAN NOT NULL DEFAULT FALSE,
                        "processRejoins" BOOLEAN NOT NULL DEFAULT FALSE,
                        "skipAutomessagesAfterInbound" BOOLEAN NOT NULL DEFAULT TRUE,
                        "rotateDeliveryAccounts" BOOLEAN NOT NULL DEFAULT TRUE,
                        "fixedDeliveryAccountId" TEXT NOT NULL DEFAULT '',
                        "userToken" TEXT NOT NULL DEFAULT '',
                        "geminiApiKey" TEXT NOT NULL DEFAULT '',
                        "enablePings" BOOLEAN NOT NULL DEFAULT FALSE,
                        "pingChannelId" TEXT NOT NULL DEFAULT '',
                        "pingMessage" TEXT NOT NULL DEFAULT 'Hey <@{userId}>, just following up — did you get a chance to see the last message?',
                        "pingDelayHours" INTEGER NOT NULL DEFAULT 48,
                        "captchaSolver" TEXT NOT NULL DEFAULT '',
                        "captchaKey" TEXT NOT NULL DEFAULT '',
                        "friendRequestDelayMinutes" INTEGER NOT NULL DEFAULT 0,
                        "typingSpeedMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
                        "capsolverKey" TEXT NOT NULL DEFAULT '',
                        "anysolverKey" TEXT NOT NULL DEFAULT '',
                        "captchaProxy" TEXT NOT NULL DEFAULT '',
                        "botPort" INTEGER NOT NULL DEFAULT 3001,
                        "safetyMinInitialDmDelayMinutes" INTEGER NOT NULL DEFAULT 10,
                        "safetyMinFriendRequestDelayMinutes" INTEGER NOT NULL DEFAULT 30,
                        "safetyDmCooldownSeconds" INTEGER NOT NULL DEFAULT 120,
                        "safetyFriendRequestCooldownSeconds" INTEGER NOT NULL DEFAULT 900,
                        "safetyDmCooldownMinMs" INTEGER NOT NULL DEFAULT 120000,
                        "safetyDmCooldownMaxMs" INTEGER NOT NULL DEFAULT 240000,
                        "safetyFriendRequestCooldownMinMs" INTEGER NOT NULL DEFAULT 900000,
                        "safetyFriendRequestCooldownMaxMs" INTEGER NOT NULL DEFAULT 1800000,
                        "safetyFailureCooldownMinutes" INTEGER NOT NULL DEFAULT 30,
                        "safetyMaxDmPerHour" INTEGER NOT NULL DEFAULT 6,
                        "safetyMaxFriendRequestsPerHour" INTEGER NOT NULL DEFAULT 2,
                        "queueScanIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
                        "queueDmSpreadSeconds" INTEGER NOT NULL DEFAULT 120,
                        "queueFriendRequestSpreadSeconds" INTEGER NOT NULL DEFAULT 900
                    )
                    """
                )
                cur.execute('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "processRejoins" BOOLEAN NOT NULL DEFAULT FALSE')
                cur.execute('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "skipAutomessagesAfterInbound" BOOLEAN NOT NULL DEFAULT TRUE')
                cur.execute('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "initialMessageVariants" TEXT NOT NULL DEFAULT \'[]\'')
                cur.execute('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "rotateDeliveryAccounts" BOOLEAN NOT NULL DEFAULT TRUE')
                cur.execute('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "fixedDeliveryAccountId" TEXT NOT NULL DEFAULT \'\'')
                cur.execute('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "telegramBotToken" TEXT NOT NULL DEFAULT \'\'')
                cur.execute('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT NOT NULL DEFAULT \'\'')
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "Account" (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                        token TEXT NOT NULL,
                        username TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'active',
                        "proxyId" TEXT,
                        "lastUsedAt" TIMESTAMPTZ,
                        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "Proxy" (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                        label TEXT NOT NULL DEFAULT '',
                        url TEXT NOT NULL,
                        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute('ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "proxyId" TEXT')
                cur.execute(
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname = 'Account_proxyId_fkey'
                        ) THEN
                            ALTER TABLE "Account"
                            ADD CONSTRAINT "Account_proxyId_fkey"
                            FOREIGN KEY ("proxyId") REFERENCES "Proxy"(id)
                            ON DELETE SET NULL ON UPDATE CASCADE;
                        END IF;
                    END $$;
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "Member" (
                        "userId" TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        "guildId" TEXT,
                        "joinTime" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        status TEXT NOT NULL DEFAULT 'pending',
                        "interestScore" DOUBLE PRECISION,
                        "interestLevel" TEXT,
                        sentiment TEXT,
                        tags TEXT,
                        "isToxic" BOOLEAN NOT NULL DEFAULT FALSE,
                        "assignedAccountId" TEXT REFERENCES "Account"(id) ON DELETE SET NULL ON UPDATE CASCADE,
                        "friendRequestStatus" TEXT NOT NULL DEFAULT 'idle'
                    )
                    """
                )
                cur.execute('ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "guildId" TEXT')
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "Conversation" (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                        "userId" TEXT NOT NULL REFERENCES "Member"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
                        message TEXT NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        direction TEXT NOT NULL,
                        "accountId" TEXT
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "Notification" (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                        "userId" TEXT NOT NULL REFERENCES "Member"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
                        "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        status TEXT NOT NULL
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "Log" (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                        message TEXT NOT NULL,
                        level TEXT NOT NULL DEFAULT 'info',
                        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "BlacklistEntry" (
                        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                        type TEXT NOT NULL,
                        value TEXT NOT NULL,
                        label TEXT NOT NULL DEFAULT '',
                        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute(
                    'CREATE UNIQUE INDEX IF NOT EXISTS "BlacklistEntry_type_value_key" ON "BlacklistEntry" (type, value)'
                )
                cur.execute(
                    'INSERT INTO "SystemConfig" (id) VALUES (%s) ON CONFLICT (id) DO NOTHING',
                    ("default",),
                )
            conn.commit()
        logging.info("Database schema is ready.")

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

    async def is_whitelisted_guild(self, guild_id: str) -> bool:
        return await self.run(self._is_whitelisted_guild, guild_id)

    def _is_whitelisted_guild(self, guild_id: str) -> bool:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT COUNT(*) FROM "BlacklistEntry" WHERE type = %s AND value = %s',
                    ("guild_whitelist", guild_id),
                )
                return int(cur.fetchone()[0]) > 0

    async def whitelisted_guilds(self) -> list[str]:
        return await self.run(self._whitelisted_guilds)

    def _whitelisted_guilds(self) -> list[str]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT value FROM "BlacklistEntry" WHERE type = %s ORDER BY "createdAt" ASC',
                    ("guild_whitelist",),
                )
                return [str(row[0]) for row in cur.fetchall()]

    async def fetch_accounts(self, statuses: tuple[str, ...]) -> list[dict]:
        return await self.run(self._fetch_accounts, statuses)

    def _fetch_accounts(self, statuses: tuple[str, ...]) -> list[dict]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT a.id, a.token, a.username, a.status, a."proxyId", p.url AS "proxyUrl", p.label AS "proxyLabel"
                    FROM "Account" a
                    LEFT JOIN "Proxy" p ON p.id = a."proxyId"
                    WHERE a.status = ANY(%s)
                    ORDER BY a."lastUsedAt" ASC NULLS FIRST, a."createdAt" ASC
                    """,
                    (list(statuses),),
                )
                columns = [desc.name for desc in cur.description]
                return [dict(zip(columns, row)) for row in cur.fetchall()]

    async def fetch_account(self, account_id: str) -> dict | None:
        return await self.run(self._fetch_account, account_id)

    def _fetch_account(self, account_id: str) -> dict | None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT a.id, a.token, a.username, a.status, a."proxyId", p.url AS "proxyUrl", p.label AS "proxyLabel"
                    FROM "Account" a
                    LEFT JOIN "Proxy" p ON p.id = a."proxyId"
                    WHERE a.id = %s
                    """,
                    (account_id,),
                )
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

    async def choose_delivery_account(self, config: dict | None = None) -> str | None:
        return await self.run(self._choose_delivery_account, config or {})

    def _choose_delivery_account(self, config: dict) -> str | None:
        if config.get("rotateDeliveryAccounts") is False:
            account_id = str(config.get("fixedDeliveryAccountId") or "").strip()
            if not account_id:
                return None
            with self.connect() as conn:
                with conn.cursor() as cur:
                    cur.execute('SELECT id FROM "Account" WHERE id = %s AND status = %s LIMIT 1', (account_id, "active"))
                    row = cur.fetchone()
                    if not row:
                        return None
                    cur.execute('UPDATE "Account" SET "lastUsedAt" = NOW() WHERE id = %s', (account_id,))
                conn.commit()
                return account_id
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM "Account"
                    WHERE status = %s
                    ORDER BY "lastUsedAt" ASC NULLS FIRST, "createdAt" ASC
                    LIMIT 1
                    """,
                    ("active",),
                )
                row = cur.fetchone()
                if not row:
                    return None
                account_id = row[0]
                cur.execute('UPDATE "Account" SET "lastUsedAt" = NOW() WHERE id = %s', (account_id,))
            conn.commit()
            return account_id

    async def upsert_member_join(
        self,
        user_id: str,
        username: str,
        friend_request_pending: bool,
        guild_id: str | None = None,
        process_rejoins: bool = False,
    ) -> bool:
        return await self.run(self._upsert_member_join, user_id, username, friend_request_pending, guild_id, process_rejoins)

    def _upsert_member_join(self, user_id: str, username: str, friend_request_pending: bool, guild_id: str | None, process_rejoins: bool) -> bool:
        friend_status = FRIEND_PENDING if friend_request_pending else FRIEND_IDLE
        with self.connect() as conn:
            with conn.cursor() as cur:
                if process_rejoins:
                    cur.execute(
                        """
                        INSERT INTO "Member" ("userId", username, "guildId", status, "friendRequestStatus", "joinTime")
                        VALUES (%s, %s, %s, %s, %s, NOW())
                        ON CONFLICT ("userId") DO UPDATE
                        SET username = EXCLUDED.username,
                            "guildId" = COALESCE(EXCLUDED."guildId", "Member"."guildId"),
                            status = EXCLUDED.status,
                            "friendRequestStatus" = EXCLUDED."friendRequestStatus",
                            "joinTime" = NOW()
                        RETURNING "userId"
                        """,
                        (user_id, username, guild_id, MEMBER_PENDING, friend_status),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO "Member" ("userId", username, "guildId", status, "friendRequestStatus", "joinTime")
                        VALUES (%s, %s, %s, %s, %s, NOW())
                        ON CONFLICT ("userId") DO NOTHING
                        RETURNING "userId"
                        """,
                        (user_id, username, guild_id, MEMBER_PENDING, friend_status),
                    )
                created = cur.fetchone() is not None
            conn.commit()
            return created

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
                cur.execute('SELECT "userId", username, "guildId", "joinTime", "friendRequestStatus" FROM "Member" WHERE status = %s', (MEMBER_PENDING,))
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

    async def has_inbound_conversation(self, user_id: str) -> bool:
        return await self.run(self._has_inbound_conversation, user_id)

    def _has_inbound_conversation(self, user_id: str) -> bool:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT COUNT(*) FROM "Conversation" WHERE "userId" = %s AND direction = %s',
                    (user_id, DIR_INBOUND),
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

    async def clear_assigned_account(self, user_id: str, account_id: str | None = None) -> None:
        await self.run(self._clear_assigned_account, user_id, account_id)

    def _clear_assigned_account(self, user_id: str, account_id: str | None) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                if account_id:
                    cur.execute(
                        'UPDATE "Member" SET "assignedAccountId" = NULL WHERE "userId" = %s AND "assignedAccountId" = %s',
                        (user_id, account_id),
                    )
                else:
                    cur.execute('UPDATE "Member" SET "assignedAccountId" = NULL WHERE "userId" = %s', (user_id,))
            conn.commit()
