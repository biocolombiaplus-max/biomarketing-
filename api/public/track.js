// POST /api/public/track · registra una visita a la landing (un registro por visita, se actualiza
// a medida que el visitante avanza en el embudo). Sin cookies de terceros ni datos personales.
const { K, HttpError, creds, saveRecord, cleanText, readBody, send, handler } = require('../_lib/store');

const SOURCES = ['Meta Ads', 'Facebook', 'Instagram', 'Google Ads', 'Google', 'TikTok', 'WhatsApp', 'YouTube', 'Directo', 'Otro'];

module.exports = handler({
  async POST(req, res) {
    if (!creds()) return send(res, 200, { ok: false });
    const b = await readBody(req, 4000);
    const sid = String(b.sid || '');
    if (!/^[a-z0-9]{10,24}$/.test(sid)) throw new HttpError(400, 'Visita inválida.');
    const h = (k) => { try { return decodeURIComponent(String(req.headers[k] || '')); } catch (e) { return ''; } };
    const start = Number(b.start) > 1.7e12 && Number(b.start) <= Date.now() + 6e4 ? Number(b.start) : Date.now();
    await saveRecord(K.visits, sid, {
      sid,
      t: new Date(start).toISOString(),
      u: new Date().toISOString(),
      st: Math.max(1, Math.min(6, parseInt(b.step, 10) || 1)),
      src: SOURCES.includes(b.src) ? b.src : 'Otro',
      cmp: cleanText(b.cmp, 60),
      dev: b.dev === 'mobile' ? 'mobile' : b.dev === 'tablet' ? 'tablet' : 'desktop',
      plan: cleanText(b.plan, 30),
      from: String(b.from || '').replace(/[^a-z]/g, '').slice(0, 20),
      city: cleanText(h('x-vercel-ip-city'), 40),
      ctry: cleanText(h('x-vercel-ip-country'), 4),
    });
    send(res, 200, { ok: true });
  },
});
