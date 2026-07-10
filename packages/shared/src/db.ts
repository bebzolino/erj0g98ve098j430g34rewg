import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

async function ensureRuntimeColumns() {
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;
  await prisma.$executeRaw`ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "processRejoins" BOOLEAN NOT NULL DEFAULT FALSE`;
  await prisma.$executeRaw`ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "skipAutomessagesAfterInbound" BOOLEAN NOT NULL DEFAULT TRUE`;
  await prisma.$executeRaw`ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "initialMessageVariants" TEXT NOT NULL DEFAULT '[]'`;
  await prisma.$executeRaw`ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "rotateDeliveryAccounts" BOOLEAN NOT NULL DEFAULT TRUE`;
  await prisma.$executeRaw`ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "fixedDeliveryAccountId" TEXT NOT NULL DEFAULT ''`;
  await prisma.$executeRaw`ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "telegramBotToken" TEXT NOT NULL DEFAULT ''`;
  await prisma.$executeRaw`ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT NOT NULL DEFAULT ''`;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "Proxy" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      label TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'http',
      url TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await prisma.$executeRaw`ALTER TABLE "Proxy" ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'http'`;
  await prisma.$executeRaw`ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "proxyId" TEXT`;
  await prisma.$executeRaw`
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
  `;
}

export async function getOrCreateConfig() {
  await ensureRuntimeColumns();
  const config = await prisma.systemConfig.findUnique({
    where: { id: 'default' },
  });
  if (config) {
    return config;
  }
  return await prisma.systemConfig.create({
    data: { id: 'default' },
  });
}

export async function ensureDatabaseShape() {
  await ensureRuntimeColumns();
}

export async function logToDb(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  console.log(`[DB_LOG][${level.toUpperCase()}] ${message}`);
  try {
    await prisma.log.create({
      data: { message, level }
    });
  } catch (err) {
    console.error('Failed to write log to database:', err);
  }
}

export * from '@prisma/client';
