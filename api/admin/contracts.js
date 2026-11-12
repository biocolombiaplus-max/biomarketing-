// GET /api/admin/contracts · lista · POST crea o edita (si no está firmado) · DELETE ?id=… elimina.
const crypto = require('crypto');
const { K, HttpError, requireAdmin, redis, readRecords, saveRecord, readBody, send, handler, cleanText } = require('../_lib/store');
const linkUrl = (u) => { u = String(u || '').trim(); if (u && !/^[a-z]+:/i.test(u)) u = 'https://' + u; return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 300) : ''; };
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
    if (b.action) {
      if (!okId(b.id)) throw new HttpError(400, 'Contrato inválido.');
      let c = {};
      try { c = JSON.parse((await redis('HGET', K.contracts, b.id)) || '{}'); } catch (e) {}
      if (!c.id) throw new HttpError(404, 'Ese contrato ya no existe.');
      if (b.action === 'deliver') {
        if (!c.signedAt) throw new HttpError(409, 'Primero el cliente debe firmar el contrato.');
        const url = linkUrl(b.url);
        if (!url) throw new HttpError(400, 'Escribe el link de la página entregada.');
        c.site = { url, admin: linkUrl(b.adminUrl) || url.replace(/\/$/, '') + '/admin', pass: cleanText(b.pass, 40) || '123456' };
        c.deliveredAt = c.deliveredAt || new Date().toISOString();
        if (c.status !== 'pagado') c.status = 'entregado';
      } else if (b.action === 'pay') {
        if (!c.signedAt) throw new HttpError(409, 'El contrato aún no está firmado.');
        const METHODS = ['Llave Breve', 'Nequi', 'Transferencia', 'Efectivo', 'Tarjeta / PSE'];
        const d = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : new Date().toISOString().slice(0, 10);
        c.payment = { method: METHODS.includes(b.method) ? b.method : 'Llave Breve', ref: cleanText(b.ref, 60), amount: Math.max(0, Math.round(Number(b.amount) || c.total)), date: d };
        c.paidAt = new Date().toISOString(); c.status = 'pagado';
      } else if (b.action === 'unpay') {
        delete c.payment; delete c.paidAt; c.status = c.deliveredAt ? 'entregado' : 'firmado';
      } else throw new HttpError(400, 'Acción inválida.');
      await saveRecord(K.contracts, c.id, c);
      return send(res, 200, { contract: { ...c, signature: c.signature ? true : '' } });
    }
    let prev = {};
    if (b.id) {
      if (!okId(b.id)) throw new HttpError(400, 'Contrato inválido.');
      try { prev = JSON.parse((await redis('HGET', K.contracts, b.id)) || '{}'); } catch (e) {}
      if (!prev.id) throw new HttpError(404, 'Ese contrato ya no existe.');
      if (prev.signedAt) throw new HttpError(409, 'Este contrato ya fue firmado y no se puede editar.');
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
