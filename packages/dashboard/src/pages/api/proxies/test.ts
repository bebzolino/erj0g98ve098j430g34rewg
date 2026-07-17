import type { NextApiRequest, NextApiResponse } from 'next';
import net from 'node:net';
import { prisma } from 'shared';
import { requireAuth } from '../../../lib/auth';

function parseProxy(value: string) {
  const url = new URL(value);
  const port = Number(url.port || (url.protocol.startsWith('socks') ? '1080' : '80'));
  if (!url.hostname || !Number.isFinite(port)) {
    throw new Error('Proxy URL is invalid');
  }
  return {
    host: url.hostname,
    port,
    type: url.protocol.replace(':', ''),
    auth: url.username || url.password ? `${url.username}:${url.password}` : '',
  };
}

function probe(host: string, port: number, timeoutMs = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });

    const done = (error?: Error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve(Date.now() - started);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done());
    socket.once('timeout', () => done(new Error('Proxy connection timed out')));
    socket.once('error', (error) => done(error));
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const id = String(req.body.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Proxy ID is required' });
    }

    const proxy = await prisma.proxy.findUnique({ where: { id } });
    if (!proxy) {
      return res.status(404).json({ error: 'Proxy not found' });
    }

    const url = proxy.url.trim();
    const parsed = parseProxy(url);
    const latencyMs = await probe(parsed.host, parsed.port);
    return res.status(200).json({
      id,
      status: 'online',
      latencyMs,
      detail: `${parsed.type.toUpperCase()} reachable${parsed.auth ? ' with auth' : ''}`,
    });
  } catch (error: any) {
    return res.status(200).json({
      id: String(req.body.id || '').trim(),
      status: 'failed',
      error: error.message,
    });
  }
}
