// PUT /api/admin/leads · marca un cliente potencial como contactado o le agrega una nota.
// DELETE /api/admin/leads?id=… · lo elimina.
const { K, requireAdmin, HttpError, redis, saveRecord, cleanText, readBody, send, handler } = require('../_lib/store');

const okId = (id) => /^[a-z0-9]{10,24}$/.test(String(id || ''));
module.exports = handler({
  async PUT(req, res) {
    requireAdmin(req);
    const b = await readBody(req, 8000);
    if (!okId(b.id)) throw new HttpError(400, 'Registro inválido.');
    let prev = {};
    try { prev = JSON.parse((await redis('HGET', K.leads, b.id)) || '{}'); } catch (e) {}
    if (!prev.id) throw new HttpError(404, 'Ese cliente potencial ya no existe.');
    const lead = { ...prev, contacted: b.contacted ? cleanText(b.contacted, 30) : '', note: cleanText(b.note, 180), updatedPanel: new Date().toISOString() };
    await saveRecord(K.leads, b.id, lead);
    send(res, 200, { ok: true, lead });
  },
  async DELETE(req, res) {
    requireAdmin(req);
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    if (!okId(id)) throw new HttpError(400, 'Registro inválido.');
    await redis('HDEL', K.leads, id);
    send(res, 200, { ok: true });
  },
});
