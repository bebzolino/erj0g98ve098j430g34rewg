import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

const allowedTypes = new Set(['user', 'guild', 'guild_whitelist']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      const entries = await prisma.blacklistEntry.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(entries);
    }

    if (req.method === 'POST') {
      const type = String(req.body.type || '').trim();
      const value = String(req.body.value || '').trim();
      const label = String(req.body.label || '').trim();

      if (!allowedTypes.has(type)) {
        return res.status(400).json({ error: 'Invalid blacklist type' });
      }
      if (!/^\d{5,30}$/.test(value)) {
        return res.status(400).json({ error: 'ID must contain only digits' });
      }

      const entry = await prisma.blacklistEntry.upsert({
        where: { type_value: { type, value } },
        update: { label },
        create: { type, value, label },
      });
      return res.status(200).json(entry);
    }

    if (req.method === 'DELETE') {
      const id = String(req.body.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Blacklist entry ID is required' });
      }
      await prisma.blacklistEntry.deleteMany({ where: { id } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
