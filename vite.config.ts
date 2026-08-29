import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// LOCAL DEV ONLY. `npm run dev` is plain Vite with no Vercel serverless
// functions and no working Postgres/Google OAuth, so products.ts's own
// `productSeeds` fallback is the only source for /api/products already —
// this plugin covers the two endpoints that fallback can't: banners (for
// testing the home banner carousel) and price history (for the product
// detail chart). Only wired up via configureServer, so it never runs
// during `vite build`.
function localApiMock(): Plugin {
  return {
    name: 'local-api-mock',
    configureServer(server) {
      let raw: any[] = [];
      try {
        const jsonlPath = fileURLToPath(new URL('../products.jsonl', import.meta.url));
        raw = readFileSync(jsonlPath, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l));
      } catch {
        raw = [];
      }

      server.middlewares.use('/api/banners', (_req, res) => {
        const banners = raw
          .filter((p) => p.colors?.[0]?.thumbnail)
          .slice(0, 3)
          .map((p, i) => ({
            id: i + 1,
            imageUrl: p.colors[0].thumbnail,
            title: p.title ?? '',
            subtitle: p.category === 'shoes' ? 'Нова колекція взуття' : 'Знижки цього тижня',
            linkCategoryId: null,
            sortOrder: i,
            active: true,
          }));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(banners));
      });

      server.middlewares.use('/api/price-history', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const productId = url.searchParams.get('productId');
        const colorId = url.searchParams.get('colorId');
        const product = raw.find((p) => p.product_id === productId);
        const color = product?.colors?.find((c: any) => (c.product_id || c.id) === colorId) ?? product?.colors?.[0];
        const pricing = color?.pricing;
        res.setHeader('Content-Type', 'application/json');

        if (!pricing || typeof pricing.sale_price !== 'number') {
          res.end(JSON.stringify({ points: [] }));
          return;
        }

        const day = 86400000;
        const now = Date.now();
        const salePrice = pricing.sale_price;

        // Mirrors prod's own two behaviors (api/price-history.ts): most
        // products only have the synthesized original->sale pair, but give
        // every 4th one a longer, dated history so the multi-point step-chart
        // path (not just the two-point cold-start layout) gets exercised too.
        const useMultiPoint = raw.indexOf(product) % 4 === 0;
        const points = useMultiPoint
          ? [
              { price: Math.round(salePrice * 1.15 * 100) / 100, recordedAt: new Date(now - 30 * day).toISOString() },
              { price: Math.round(salePrice * 1.08 * 100) / 100, recordedAt: new Date(now - 16 * day).toISOString() },
              { price: Math.round(salePrice * 1.03 * 100) / 100, recordedAt: new Date(now - 6 * day).toISOString() },
              { price: salePrice, recordedAt: new Date(now - 1 * day).toISOString() },
            ]
          : typeof pricing.original_price === 'number' && pricing.original_price !== salePrice
            ? [
                { price: pricing.original_price, recordedAt: null },
                { price: salePrice, recordedAt: new Date(now - 2 * day).toISOString() },
              ]
            : [];

        res.end(JSON.stringify({ points }));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApiMock()],
})
