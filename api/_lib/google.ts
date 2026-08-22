import type { VercelRequest } from '@vercel/node';

export function getBaseUrl(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

export function getRedirectUri(req: VercelRequest): string {
  return `${getBaseUrl(req)}/api/auth/callback`;
}

export function randomState(): string {
  return crypto.randomUUID();
}
