// POST /api/public/lead · guarda un cliente potencial (nombre + WhatsApp) cuando toca
// "Adquirir por WhatsApp" o "Pagar". Si vuelve a enviarse el mismo id, se actualiza (por ejemplo, al pagar).
const { LEADS_PREFIX, HttpError, creds, uploadJson, contextString, cleanText, readBody, send, handler } = require('../_lib/store');

const KINDS = ['whatsapp', 'pago'];
const STATUS = ['whatsapp', 'pago_iniciado', 'pagado', 'pago_rechazado'];

module.exports = handler({
  async POST(req, res) {
    if (!creds()) return send(res, 200, { ok: false });
    const b = await readBody(req);
    if (b.website) throw new HttpError(400, 'Solicitud inválida.'); // campo trampa para robots
    const id = String(b.id || '');
    if (!/^[a-z0-9]{10,24}$/.test(id)) throw new HttpError(400, 'Registro inválido.');
    const phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 18);
    const name = cleanText(b.name, 60);
    if (name.length < 2) throw new HttpError(400, 'Escribe tu nombre.');
    if (phone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Escribe un número de WhatsApp válido.');
    const h = (k) => { try { return decodeURIComponent(String(req.headers[k] || '')); } catch (e) { return ''; } };
    const created = Number(b.created) > 1.7e12 && Number(b.created) <= Date.now() + 6e4 ? Number(b.created) : Date.now();
    const ctx = {
      id, name, phone,
      plan: cleanText(b.plan, 30),
      amount: Math.max(0, Math.min(1e8, Math.round(Number(b.amount) || 0))),
      kind: KINDS.includes(b.kind) ? b.kind : 'whatsapp',
      status: STATUS.includes(b.status) ? b.status : 'whatsapp',
      src: cleanText(b.src, 20),
      cmp: cleanText(b.cmp, 60),
      sid: String(b.sid || '').replace(/[^a-z0-9]/g, '').slice(0, 24),
      ref: cleanText(b.ref, 40),
      city: cleanText(h('x-vercel-ip-city'), 40),
      created: new Date(created).toISOString(),
      updated: new Date().toISOString(),
      contacted: '',
      note: '',
    };
    await uploadJson(`${LEADS_PREFIX}${id}.json`, { v: 1 }, { context: contextString(ctx) });
    send(res, 200, { ok: true });
  },
});
