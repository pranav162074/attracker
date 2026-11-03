import { forward, isApiPath } from './forward.ts';
import type { ForwardEnv } from './forward.ts';

type Env = ForwardEnv & { ASSETS: { fetch: (request: Request) => Promise<Response> } };

export default {
  fetch: (request: Request, env: Env) => (isApiPath(new URL(request.url).pathname) ? forward(request, env) : env.ASSETS.fetch(request)),
};
