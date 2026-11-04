// GET/PUT /api/admin/data · clientes, reseñas y ajustes de la landing.
const { requireAdmin, readData, saveData, readBody, send, handler } = require('../_lib/store');

module.exports = handler({
  async GET(req, res) { requireAdmin(req); send(res, 200, await readData({ fresh: true })); },
  async PUT(req, res) { requireAdmin(req); send(res, 200, await saveData(await readBody(req))); },
});
