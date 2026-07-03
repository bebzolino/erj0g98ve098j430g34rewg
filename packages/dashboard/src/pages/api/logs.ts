import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      const logs = await prisma.log.findMany({
        orderBy: { timestamp: 'desc' },
        take: 100,
      });
      return res.status(200).json(logs.reverse());
    }

    if (req.method === 'DELETE') {
      // Clear logs option
      await prisma.log.deleteMany();
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
