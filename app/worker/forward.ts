export type ForwardEnv = { API_ORIGIN: string; PROXY_SECRET: string };

export const API_PREFIX = '/api';

const DROPPED = ['host', 'x-attracker-proxy', 'x-attracker-client-ip', 'cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'];

export const isApiPath = (pathname: string) => pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

export const forward = async (request: Request, env: ForwardEnv, send: typeof fetch = fetch) => {
  if (!env.API_ORIGIN || !env.PROXY_SECRET) {
    return Response.json({ error: 'not_configured', message: 'The website is not connected to the attracker server yet' }, { status: 503 });
  }
  const url = new URL(request.url);
  const target = new URL(env.API_ORIGIN);
  target.pathname = url.pathname.slice(API_PREFIX.length) || '/';
  target.search = url.search;

  const headers = new Headers(request.headers);
  const visitor = request.headers.get('cf-connecting-ip');
  for (const name of DROPPED) headers.delete(name);
  headers.set('x-attracker-proxy', env.PROXY_SECRET);
  if (visitor) headers.set('x-attracker-client-ip', visitor);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    return await send(target.toString(), {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch {
    return Response.json({ error: 'server_unreachable', message: 'The attracker server did not answer. Try again in a minute.' }, { status: 502 });
  }
};
