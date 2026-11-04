// GET /api/admin/stats · visitas y clientes potenciales para el panel de estadísticas.
const { requireAdmin, VISITS_PREFIX, LEADS_PREFIX, listContext, send, handler } = require('../_lib/store');

let cache = null;
module.exports = handler({
  async GET(req, res) {
    requireAdmin(req);
    const fresh = /fresh=1/.test(req.url || '');
    if (!fresh && cache && Date.now() - cache.at < 20000) return send(res, 200, cache.data);
    const [visits, leads] = await Promise.all([listContext(VISITS_PREFIX), listContext(LEADS_PREFIX)]);
    const data = { visits, leads, at: new Date().toISOString() };
    cache = { at: Date.now(), data };
    send(res, 200, data);
  },
});
