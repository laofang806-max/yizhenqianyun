import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export function jsonReply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of req) {
    const chunk = Buffer.from(part); size += chunk.length;
    if (size > 16_384) throw new Error('请求内容过大。');
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求格式不正确。');
  return value as Record<string, unknown>;
}

export function localAuthApi(): Plugin {
  const sessions = new Map<string, { user: string; expires: number }>();
  const attempts = new Map<string, { count: number; reset: number }>();
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!path.startsWith('/api/')) { next(); return; }
    const token = /(?:^|;\s*)xiangxiu_session=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';
    const now = Date.now();
    sessions.forEach((session, id) => { if (session.expires <= now) sessions.delete(id); });
    const session = sessions.get(token);
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
      jsonReply(res, 403, { error: '请从当前上位机页面操作。' }); return;
    }
    if (path === '/api/auth/session' && req.method === 'GET') {
      jsonReply(res, 200, { authenticated: !!session, user: session?.user ?? '' }); return;
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      sessions.delete(token);
      res.setHeader('Set-Cookie', 'xiangxiu_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      jsonReply(res, 200, { ok: true }); return;
    }
    if (path === '/api/auth/login' && req.method === 'POST') {
      void (async () => {
        const ip = req.socket.remoteAddress ?? 'local';
        let limit = attempts.get(ip);
        if (!limit || limit.reset < now) { limit = { count: 0, reset: now + 60_000 }; attempts.set(ip, limit); }
        if (++limit.count > 10) { jsonReply(res, 429, { error: '尝试次数较多，请一分钟后重试。' }); return; }
        try {
          const body = await readJson(req);
          const account = JSON.parse(readFileSync(resolve(process.cwd(), '.local-admin.json'), 'utf8')) as { username: string; salt: string; hash: string };
          const password = typeof body.password === 'string' ? body.password : '';
          const actual = scryptSync(password, account.salt, 64);
          const expected = Buffer.from(account.hash, 'hex');
          if (body.username !== account.username || !timingSafeEqual(actual, expected)) {
            jsonReply(res, 401, { error: '账号或密码不正确，请重新输入。' }); return;
          }
          if (token) sessions.delete(token);
          const id = randomBytes(32).toString('hex');
          sessions.set(id, { user: account.username, expires: Date.now() + 8 * 60 * 60_000 });
          attempts.delete(ip);
          res.setHeader('Set-Cookie', `xiangxiu_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
          jsonReply(res, 200, { authenticated: true, user: account.username });
        } catch {
          jsonReply(res, 503, { error: '登录服务暂不可用，请检查本机账号配置。' });
        }
      })();
      return;
    }
    if (!session) { jsonReply(res, 401, { error: '请先登录上位机。' }); return; }
    next();
  };
  return { name: 'xiangxiu-local-auth', configureServer: s => { s.middlewares.use(middleware); }, configurePreviewServer: s => { s.middlewares.use(middleware); } };
}
