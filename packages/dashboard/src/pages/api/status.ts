import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const [accounts, members, logs, config] = await Promise.all([
      prisma.account.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.member.findMany({ orderBy: { joinTime: 'desc' } }),
      prisma.log.findMany({ orderBy: { timestamp: 'desc' }, take: 25 }),
      prisma.systemConfig.findUnique({ where: { id: 'default' } }),
    ]);

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      services: {
        dashboard: { status: 'online' },
        database: { status: 'online' },
        bot: {
          status: config?.botPort ? 'online' : 'unknown',
          port: config?.botPort || null,
        },
      },
      accounts: {
        total: accounts.length,
        active: accounts.filter((account) => account.status === 'active').length,
        invalid: accounts.filter((account) => account.status === 'invalid').length,
        rateLimited: accounts.filter((account) => account.status === 'rate_limited').length,
        unavailable: accounts.filter((account) => account.status === 'unavailable').length,
        rows: accounts.map(({ token, ...account }) => ({
          ...account,
          tokenPreview: maskToken(token),
        })),
      },
      members: {
        total: members.length,
        byStatus: countBy(members.map((member) => member.status)),
      },
      logs,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 12) return '********';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}
