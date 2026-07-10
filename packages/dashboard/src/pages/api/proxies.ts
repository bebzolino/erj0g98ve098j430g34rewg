import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureDatabaseShape, prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

const allowedProxyTypes = new Set(['http', 'socks5']);

function maskProxy(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? '******' : '';
      parsed.password = parsed.password ? '******' : '';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://******:******@');
  }
}

function cleanProxyType(value: unknown): 'http' | 'socks5' {
  const type = String(value || 'http').trim().toLowerCase();
  if (!allowedProxyTypes.has(type)) {
    throw new Error('Proxy type must be HTTP or SOCKS5');
  }
  return type as 'http' | 'socks5';
}

function cleanProxyUrl(type: 'http' | 'socks5', value: string): string {
  let url = value.trim();
  if (!url) {
    throw new Error('Proxy URL is required');
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `${type}://${url}`;
  }
  const pattern = type === 'socks5' ? /^socks5:\/\/[^ ]+$/i : /^https?:\/\/[^ ]+$/i;
  if (!pattern.test(url)) {
    throw new Error(type === 'socks5' ? 'SOCKS5 proxy must use socks5://host:port' : 'HTTP proxy must use http:// or https://');
  }
  return url;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  try {
    await ensureDatabaseShape();

    if (req.method === 'GET') {
      const [proxies, accounts] = await Promise.all([
        prisma.proxy.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.account.findMany({ select: { id: true, username: true, proxyId: true }, orderBy: { createdAt: 'desc' } }),
      ]);
      return res.status(200).json({
        proxies: proxies.map((proxy) => ({ ...proxy, urlPreview: maskProxy(proxy.url), url: undefined })),
        accounts,
      });
    }

    if (req.method === 'POST') {
      const label = String(req.body.label || '').trim();
      const type = cleanProxyType(req.body.type);
      const url = cleanProxyUrl(type, String(req.body.url || ''));
      const proxy = await prisma.proxy.create({ data: { label, type, url } });
      return res.status(200).json({ ...proxy, urlPreview: maskProxy(proxy.url), url: undefined });
    }

    if (req.method === 'PATCH') {
      const proxyId = String(req.body.proxyId || '').trim();
      const accountIds = Array.isArray(req.body.accountIds) ? req.body.accountIds.map(String) : [];
      const proxy = await prisma.proxy.findUnique({ where: { id: proxyId } });
      if (!proxy) {
        return res.status(404).json({ error: 'Proxy not found' });
      }
      await prisma.$transaction([
        prisma.account.updateMany({ where: { proxyId, id: { notIn: accountIds } }, data: { proxyId: null } }),
        prisma.account.updateMany({ where: { id: { in: accountIds } }, data: { proxyId } }),
      ]);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const id = String(req.body.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Proxy ID is required' });
      }
      await prisma.proxy.deleteMany({ where: { id } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
