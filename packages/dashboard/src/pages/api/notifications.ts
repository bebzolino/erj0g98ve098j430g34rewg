import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { sentAt: 'desc' },
      take: 25,
      include: {
        member: {
          select: { username: true, userId: true },
        },
      },
    });

    return res.status(200).json({
      notifications: notifications.map((notification) => ({
        id: notification.id,
        userId: notification.userId,
        username: notification.member?.username || notification.member?.userId || notification.userId,
        sentAt: notification.sentAt,
        status: notification.status,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
