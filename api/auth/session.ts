import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie, getSessionEmail, isAdminEmail } from '../_lib/session.js';

// Backs both /api/auth/me (GET) and /api/auth/logout (POST) — see vercel.json
// rewrites. Merged into one function to stay under the Hobby plan's 12
// Serverless Functions cap (this repo was already at the limit before OG
// previews added api/ssr.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  const email = await getSessionEmail(req);
  if (!isAdminEmail(email)) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(200).json({ email });
}
