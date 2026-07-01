import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

async function ensureRuntimeColumns() {
  await prisma.$executeRawUnsafe('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "processRejoins" BOOLEAN NOT NULL DEFAULT FALSE');
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
