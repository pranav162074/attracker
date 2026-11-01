export type ApiUrlInput = {
  configured?: string | undefined;
  platform: string;
  dev: boolean;
  hostUri?: string | null | undefined;
  port?: number;
};

export const resolveApiUrl = ({ configured, platform, dev, hostUri, port = 4000 }: ApiUrlInput) => {
  const value = configured?.trim();
  if (value) return value.replace(/\/+$/, '');
  if (platform === 'web') return dev ? `http://localhost:${port}` : '/api';
  if (dev && hostUri) {
    const host = hostUri.replace(/^[a-z]+:\/\//i, '').split('/')[0]?.replace(/:\d+$/, '');
    if (host) return `http://${host}:${port}`;
  }
  return null;
};
