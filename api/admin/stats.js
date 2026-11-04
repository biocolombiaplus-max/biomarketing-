// GET /api/admin/stats · visitas y clientes potenciales para el panel de estadísticas.
// De paso borra las visitas de hace más de 180 días para que la base no crezca sin límite.
const { K, requireAdmin, readRecords, redis, send, handler } = require('../_lib/store');

const KEEP_MS = 180 * 864e5;
module.exports = handler({
  async GET(req, res) {
    requireAdmin(req);
    const [visits, leads] = await Promise.all([readRecords(K.visits), readRecords(K.leads)]);
    const old = visits.filter((v) => Date.now() - new Date(v.t) > KEEP_MS).map((v) => v.sid);
    if (old.length) redis('HDEL', K.visits, ...old.slice(0, 1000)).catch(() => {});
    send(res, 200, { visits: visits.filter((v) => !old.includes(v.sid)), leads, at: new Date().toISOString() });
  },
});
