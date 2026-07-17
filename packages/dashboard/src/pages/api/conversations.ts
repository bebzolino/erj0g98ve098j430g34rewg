import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
      }

      const [conversations, accounts] = await Promise.all([
        prisma.conversation.findMany({
          where: { userId },
          orderBy: { timestamp: 'asc' },
        }),
        prisma.account.findMany({ select: { id: true, username: true } }),
      ]);
      const accountById = new Map(accounts.map((account) => [account.id, account.username] as const));

      return res.status(200).json(conversations.map((conversation) => ({
        ...conversation,
        accountUsername: conversation.accountId ? (accountById.get(conversation.accountId) || conversation.accountId) : null,
      })));
    }

    if (req.method === 'DELETE') {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId parameter' });
      }
      await prisma.conversation.deleteMany({ where: { userId } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
