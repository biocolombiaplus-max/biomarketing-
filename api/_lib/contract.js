// Limpieza y validación de los contratos (acuerdo de servicio y compromiso de pago).
const { HttpError, cleanText } = require('./store');

const num = (v, max = 1e9) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const PAY_TERMS = ['al_entregar', '1_dia', '3_dias', '5_dias'];
const CYCLES = ['unico', 'mensual', 'anual'];
// Suma un período (año o mes) a una fecha AAAA-MM-DD
function addCycle(d, cy) {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  const t = cy === 'mensual' ? new Date(Date.UTC(y, m, Math.min(day, 28 + (day > 28 ? 0 : 0)))) : new Date(Date.UTC(y + 1, m - 1, day));
  if (cy === 'mensual') { const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(day, last)); }
  return t.toISOString().slice(0, 10);
}
const baseDate = (c) => String(c.deliveredAt || c.paidAt || c.signedAt || c.createdAt).slice(0, 10);
const nextOf = (c, cy) => (c.next && c.next[cy]) || addCycle(baseDate(c), cy);

function cleanContract(b, prev = {}) {
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12)
    .map((it) => ({ name: cleanText(it.name, 90), detail: cleanText(it.detail, 160), price: num(it.price), cycle: CYCLES.includes(it.cycle) ? it.cycle : 'unico' }))
    .filter((it) => it.name);
  if (!items.length) throw new HttpError(400, 'Agrega al menos un servicio con su valor.');
  const c = b.client || {};
  const client = {
    business: cleanText(c.business, 90), doc: cleanText(c.doc, 30), rep: cleanText(c.rep, 70), repDoc: cleanText(c.repDoc, 30),
    phone: String(c.phone || '').replace(/[^\d+]/g, '').slice(0, 16), email: cleanText(c.email, 90), city: cleanText(c.city, 50),
    address: cleanText(c.address, 120), sector: cleanText(c.sector, 50),
  };
  if (client.business.length < 2) throw new HttpError(400, 'Escribe el nombre del negocio o empresa.');
  if (client.rep.length < 3) throw new HttpError(400, 'Escribe el nombre de quien firma.');
  const p = b.provider || {};
  return {
    plan: cleanText(b.plan, 40),
    items,
    total: items.reduce((a, it) => a + it.price, 0),
    delivery: cleanText(b.delivery, 60) || 'El mismo día',
    payTerm: PAY_TERMS.includes(b.payTerm) ? b.payTerm : 'al_entregar',
    adjustments: num(b.adjustments, 10),
    notes: cleanText(b.notes, 600),
    scope: String(b.scope || '').replace(/[\u0000-\u0008\u000b-\u001f<>]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500),
    client,
    provider: { name: cleanText(p.name, 80) || 'Bio Marketing', doc: cleanText(p.doc, 30), city: cleanText(p.city, 50) || 'Cúcuta', phone: cleanText(p.phone, 20) || '350 545 7420', email: cleanText(p.email, 90), llave: cleanText(p.llave, 40) || '@OTO262', holder: cleanText(p.holder, 60) || 'Juan Cáceres' },
    number: prev.number || '',
    createdAt: prev.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Lo que ve el cliente (sin datos internos)
function publicView(c) {
  const { id, number, plan, items, total, delivery, payTerm, adjustments, notes, scope, client, provider, createdAt, status, signedAt, signature, signer, deliveredAt, site, paidAt, payment } = c;
  return { id, number, plan, items, total, delivery, payTerm, adjustments, notes, scope, client, provider, createdAt, status, signedAt, signature, signer, deliveredAt, site: site ? { url: site.url } : undefined, paidAt, payment: payment ? { method: payment.method, date: payment.date } : undefined };
}

module.exports = { cleanContract, publicView, addCycle, nextOf, CYCLES };
