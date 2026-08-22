import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getRedirectUri } from '../_lib/google';
import { createSessionCookie, isAdminEmail, parseCookies } from '../_lib/session';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  const cookies = parseCookies(req.headers.cookie);
  const expectedState = cookies['anons_oauth_state'];

  if (error) return redirectWithError(res, error);
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(res, 'invalid_state');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google OAuth env vars are not set' });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) return redirectWithError(res, 'token_exchange_failed');
    const tokenBody = (await tokenRes.json()) as { id_token?: string };
    if (!tokenBody.id_token) return redirectWithError(res, 'no_id_token');

    const { payload } = await jwtVerify(tokenBody.id_token, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    });

    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!payload.email_verified || !email) return redirectWithError(res, 'email_not_verified');
    if (!isAdminEmail(email)) return redirectWithError(res, 'forbidden');

    const cookie = await createSessionCookie(email);
    res.setHeader('Set-Cookie', [
      cookie,
      `anons_oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
    ]);
    res.writeHead(302, { Location: '/admin.html' });
    return res.end();
  } catch (err) {
    console.error(err);
    return redirectWithError(res, 'unexpected_error');
  }
}

function redirectWithError(res: VercelResponse, reason: string) {
  res.setHeader('Set-Cookie', `anons_oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.writeHead(302, { Location: `/admin.html?error=${encodeURIComponent(reason)}` });
  res.end();
}
