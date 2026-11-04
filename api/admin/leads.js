// PUT /api/admin/leads · marca un cliente potencial como contactado o le agrega una nota.
// DELETE /api/admin/leads?id=… · lo elimina.
const { requireAdmin, LEADS_PREFIX, HttpError, uploadJson, destroyRaw, contextString, cleanText, readBody, send, handler } = require('../_lib/store');

const okId = (id) => /^[a-z0-9]{10,24}$/.test(String(id || ''));
module.exports = handler({
  async PUT(req, res) {
    requireAdmin(req);
    const b = await readBody(req);
    if (!okId(b.id)) throw new HttpError(400, 'Registro inválido.');
    const keep = ['id', 'name', 'phone', 'plan', 'amount', 'kind', 'status', 'src', 'cmp', 'sid', 'ref', 'city', 'created'];
    const ctx = {};
    keep.forEach((k) => { if (b[k] !== undefined) ctx[k] = cleanText(b[k], 80); });
    ctx.updated = new Date().toISOString();
    ctx.contacted = b.contacted ? cleanText(b.contacted, 30) : '';
    ctx.note = cleanText(b.note, 180);
    await uploadJson(`${LEADS_PREFIX}${b.id}.json`, { v: 1 }, { context: contextString(ctx) });
    send(res, 200, { ok: true, lead: ctx });
  },
  async DELETE(req, res) {
    requireAdmin(req);
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    if (!okId(id)) throw new HttpError(400, 'Registro inválido.');
    await destroyRaw(`${LEADS_PREFIX}${id}.json`);
    send(res, 200, { ok: true });
  },
});
