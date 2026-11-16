// GET /api/public/data · clientes y reseñas visibles para la landing (caché corta en el CDN de Vercel).
const { creds, readData, send, handler } = require('../_lib/store');
const serveImg = require('../_lib/img');
// También entrega las imágenes: /api/public/data?id=… (y /api/public/img?id=… por la regla de vercel.json)

module.exports = handler({
  async GET(req, res) {
    if (new URL(req.url, 'http://x').searchParams.get('id')) return serveImg(req, res);
    if (!creds()) return send(res, 200, { storage: null, clients: [], reviews: [], config: {} });
    const d = await readData();
    send(res, 200, {
      storage: 'redis',
      clients: d.clients.filter((c) => c.active !== false),
      reviews: d.config.showReviews === false ? [] : d.reviews.filter((r) => r.active !== false),
      config: d.config,
    }, 'public, s-maxage=30, stale-while-revalidate=300');
  },
});
