import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';

interface BannerRow {
  id: number;
  imageUrl: string;
  title: string;
  subtitle: string;
  linkCategoryId: string | null;
  linkSaleId: string | null;
  linkUrl: string | null;
  sortOrder: number;
  active: boolean;
}

const SELECT_COLUMNS = `
  id, image_url AS "imageUrl", title, subtitle,
  link_category_id AS "linkCategoryId", link_sale_id AS "linkSaleId", link_url AS "linkUrl",
  sort_order AS "sortOrder", active
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Piggybacks image upload onto this function instead of its own api/ file —
  // Vercel Hobby caps serverless functions at 12 and this project is already
  // at that cap (see the "stay under Vercel Hobby's 12-function cap" commit).
  if (req.method === 'POST' && req.query.upload === '1') return handleUploadImage(req, res);

  await ensureSchema();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

// Client streams the raw file bytes with Content-Type set to the file's own
// mime type (e.g. image/png) — that's not one of the types Vercel auto-parses
// into req.body, so `req` is still a readable stream here and can be piped
// straight into Blob storage.
async function handleUploadImage(req: VercelRequest, res: VercelResponse) {
  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  const rawFilename = typeof req.query.filename === 'string' ? req.query.filename : '';
  const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'image';

  try {
    const blob = await put(`banners/${Date.now()}-${safeFilename}`, req, {
      access: 'public',
      contentType: req.headers['content-type'] || undefined,
    });
    return res.status(200).json({ url: blob.url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити зображення' });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const wantsAll = req.query.all === '1';

  if (wantsAll) {
    const email = await requireAdmin(req, res);
    if (!email) return; // requireAdmin already sent the 401 response

    try {
      const { rows } = await db.query<BannerRow>(
        `SELECT ${SELECT_COLUMNS} FROM banners ORDER BY sort_order ASC, id ASC`,
      );
      return res.status(200).json(rows);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Не вдалося завантажити банери' });
    }
  }

  try {
    const { rows } = await db.query<BannerRow>(
      `SELECT ${SELECT_COLUMNS} FROM banners WHERE active = true ORDER BY sort_order ASC, id ASC`,
    );
    // No caching, unlike /api/products — an admin edit (drag reorder, pause, delete) should be
    // visible on the storefront on the very next load, not after some TTL window. The banners
    // table is tiny and this query is cheap, so there's no real cost to skipping the cache.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити банери' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  const body = req.body ?? {};
  const { id, imageUrl, title, subtitle, linkCategoryId, linkSaleId, linkUrl, sortOrder, active } = body;

  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return res.status(400).json({ error: 'imageUrl обовʼязковий' });
  }

  // A banner links to at most one destination — a custom URL takes priority
  // over a sale, which takes priority over a category, if a client somehow
  // sends more than one.
  const normalizedUrl = typeof linkUrl === 'string' && linkUrl.trim() ? linkUrl.trim() : null;
  const normalizedSaleId = normalizedUrl ? null : typeof linkSaleId === 'string' && linkSaleId.trim() ? linkSaleId.trim() : null;

  const values = {
    imageUrl: imageUrl.trim(),
    title: typeof title === 'string' ? title : '',
    subtitle: typeof subtitle === 'string' ? subtitle : '',
    linkCategoryId:
      normalizedUrl || normalizedSaleId
        ? null
        : typeof linkCategoryId === 'string' && linkCategoryId.trim()
          ? linkCategoryId.trim()
          : null,
    linkSaleId: normalizedSaleId,
    linkUrl: normalizedUrl,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    active: typeof active === 'boolean' ? active : true,
  };

  try {
    if (typeof id === 'number') {
      await db.query(
        `UPDATE banners SET image_url = $2, title = $3, subtitle = $4, link_category_id = $5, link_sale_id = $6, link_url = $7, sort_order = $8, active = $9, updated_at = now()
         WHERE id = $1`,
        [id, values.imageUrl, values.title, values.subtitle, values.linkCategoryId, values.linkSaleId, values.linkUrl, values.sortOrder, values.active],
      );
      return res.status(200).json({ ok: true, id });
    }

    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO banners (image_url, title, subtitle, link_category_id, link_sale_id, link_url, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [values.imageUrl, values.title, values.subtitle, values.linkCategoryId, values.linkSaleId, values.linkUrl, values.sortOrder, values.active],
    );
    return res.status(200).json({ ok: true, id: rows[0].id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти банер' });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'id обовʼязковий' });
  }

  try {
    await db.query('DELETE FROM banners WHERE id = $1', [id]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося видалити банер' });
  }
}
