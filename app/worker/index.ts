import { forward, isApiPath, wake } from './forward.ts';
import type { ForwardEnv } from './forward.ts';

type Env = ForwardEnv & { ASSETS: { fetch: (request: Request) => Promise<Response> } };

type Waiter = { waitUntil: (promise: Promise<unknown>) => void };

export default {
  fetch: (request: Request, env: Env) => (isApiPath(new URL(request.url).pathname) ? forward(request, env) : env.ASSETS.fetch(request)),
  scheduled: (_event: unknown, env: Env, context: Waiter) => {
    context.waitUntil(wake(env));
  },
};
