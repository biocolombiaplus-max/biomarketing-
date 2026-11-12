// GET /api/admin/contracts · lista · POST crea o edita (si no está firmado) · DELETE ?id=… elimina.
const crypto = require('crypto');
const { K, HttpError, requireAdmin, redis, readRecords, saveRecord, readBody, send, handler } = require('../_lib/store');
const { cleanContract } = require('../_lib/contract');

const okId = (id) => /^[a-f0-9]{24}$/.test(String(id || ''));

module.exports = handler({
  async GET(req, res) {
    requireAdmin(req);
    const list = (await readRecords(K.contracts)).map((c) => ({ ...c, signature: c.signature ? true : '' }));
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    send(res, 200, { contracts: list });
  },
  async POST(req, res) {
    requireAdmin(req);
    const b = await readBody(req, 60000);
    let prev = {};
    if (b.id) {
      if (!okId(b.id)) throw new HttpError(400, 'Contrato inválido.');
      try { prev = JSON.parse((await redis('HGET', K.contracts, b.id)) || '{}'); } catch (e) {}
      if (!prev.id) throw new HttpError(404, 'Ese contrato ya no existe.');
      if (prev.status === 'firmado') throw new HttpError(409, 'Este contrato ya fue firmado y no se puede editar.');
    }
    const id = prev.id || crypto.randomBytes(12).toString('hex');
    const c = { ...cleanContract(b, prev), id, status: 'pendiente' };
    if (!c.number) {
      const n = await redis('INCR', K.contracts + ':seq');
      c.number = 'BM-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0');
    }
    await saveRecord(K.contracts, id, c);
    send(res, 200, { contract: c });
  },
  async DELETE(req, res) {
    requireAdmin(req);
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    if (!okId(id)) throw new HttpError(400, 'Contrato inválido.');
    await redis('HDEL', K.contracts, id);
    send(res, 200, { ok: true });
  },
});
