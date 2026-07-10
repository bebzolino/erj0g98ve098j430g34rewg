import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureDatabaseShape, prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      await ensureDatabaseShape();
      const accounts = await prisma.account.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(accounts.map(({ token, ...account }) => ({
        ...account,
        tokenPreview: maskToken(token),
      })));
    }

    if (req.method === 'POST') {
      await ensureDatabaseShape();
      const { token, username } = req.body;
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }
      const discordIdentity = await fetchDiscordIdentity(token);
      const account = await prisma.account.create({
        data: {
          token,
          username: username || discordIdentity?.username || '',
          status: discordIdentity ? 'active' : 'invalid',
        },
      });
      return res.status(200).json(account);
    }

    if (req.method === 'DELETE') {
      await ensureDatabaseShape();
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Account ID is required' });
      }
      await prisma.account.deleteMany({ where: { id } });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PATCH') {
      await ensureDatabaseShape();
      const id = String(req.body.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Account ID is required' });
      }
      const account = await prisma.account.update({
        where: { id },
        data: {
          blocksAutomessagesOnInbound: Boolean(req.body.blocksAutomessagesOnInbound),
        },
      });
      const { token, ...safeAccount } = account;
      return res.status(200).json({
        ...safeAccount,
        tokenPreview: maskToken(token),
      });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('Error in accounts api:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function fetchDiscordIdentity(token: string): Promise<{ username: string } | null> {
  try {
    const response = await fetch('https://discord.com/api/v9/users/@me', {
      headers: {
        authorization: token,
      },
    });
    if (!response.ok) return null;
    const data: any = await response.json();
    const username = data.global_name || data.username;
    return username ? { username } : null;
  } catch {
    return null;
  }
}

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 12) return '********';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}
