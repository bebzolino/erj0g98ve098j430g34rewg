import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }

    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { timestamp: 'asc' },
    });

    return res.status(200).json(conversations);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
