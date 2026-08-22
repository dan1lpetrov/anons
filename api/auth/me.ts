import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionEmail, isAdminEmail } from '../_lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = await getSessionEmail(req);
  if (!isAdminEmail(email)) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(200).json({ email });
}
