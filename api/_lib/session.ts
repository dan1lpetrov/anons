import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify, SignJWT } from 'jose';

const SESSION_COOKIE = 'anons_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 днів

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set');
  return new TextEncoder().encode(secret);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export async function createSessionCookie(email: string): Promise<string> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const secure = process.env.VERCEL_ENV ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.VERCEL_ENV ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export async function getSessionEmail(req: VercelRequest): Promise<string | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export function isAdminEmail(email: string | null): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !email) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const email = await getSessionEmail(req);
  if (!isAdminEmail(email)) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return email;
}
