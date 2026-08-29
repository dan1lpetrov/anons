import { readFileSync } from 'node:fs';
import path from 'node:path';

// Plain Vite SPA — no SSR framework. `/product/:id` and `/catalog/:categoryId`
// are rewritten (see vercel.json) to functions that serve this same built
// index.html shell with per-request <title>/OG tags spliced into <head>. The
// bundled JS reference is untouched, so a real visitor still loads and
// hydrates the exact same app; only the first HTML response — all a
// link-preview bot ever reads — differs per product/category.
let cachedShell: string | null = null;

function loadShell(): string {
  if (!cachedShell) {
    cachedShell = readFileSync(path.join(process.cwd(), 'dist', 'index.html'), 'utf8');
  }
  return cachedShell;
}

export interface ShellMeta {
  title: string;
  description?: string;
  image?: string;
  url: string;
  type?: string;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function renderShellWithMeta(meta: ShellMeta): string {
  const title = escapeAttr(meta.title);
  const description = meta.description ? escapeAttr(meta.description) : undefined;
  const image = meta.image ? escapeAttr(meta.image) : undefined;
  const url = escapeAttr(meta.url);

  const tags = [
    `<meta property="og:type" content="${meta.type ?? 'website'}">`,
    `<meta property="og:title" content="${title}">`,
    description && `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    image && `<meta property="og:image" content="${image}">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${title}">`,
    description && `<meta name="twitter:description" content="${description}">`,
    image && `<meta name="twitter:image" content="${image}">`,
  ]
    .filter(Boolean)
    .join('\n    ');

  return loadShell()
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace('</head>', `    ${tags}\n  </head>`);
}
