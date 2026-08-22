import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedirectUri, randomState } from '../_lib/google.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID env var is not set' });
  }

  const state = randomState();
  const secure = process.env.VERCEL_ENV ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `anons_oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${secure}`,
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: 'openid email',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });

  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}
