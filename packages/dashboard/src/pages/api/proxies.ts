import type { NextApiRequest, NextApiResponse } from 'next';
import { ensureDatabaseShape, prisma } from 'shared';

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

function cleanProxyUrl(value: string): string {
  const url = value.trim();
  if (!/^https?:\/\/[^ ]+$/i.test(url)) {
    throw new Error('Proxy must start with http:// or https://');
  }
  return url;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      const url = cleanProxyUrl(String(req.body.url || ''));
      const proxy = await prisma.proxy.create({ data: { label, url } });
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
