// POST /api/public/epayco · crea una sesión de pago de ePayco (Smart Checkout v2), igual que juridicosweb:
// login con las claves pública + privada (solo en el servidor) → sesión de pago → la landing abre el checkout.
// Variables en Vercel: EPAYCO_PUBLIC_KEY, EPAYCO_PRIVATE_KEY (obligatoria), EPAYCO_TEST (opcional, "true" para pruebas).
const { HttpError, readBody, send, handler, cleanText } = require('../_lib/store');

// Los precios se calculan aquí (no se confía en el valor que manda el navegador).
const PLANS = { 'Emprende': 198000, 'Crece': 490000, 'Pro Empresarial': 890000 };
const DOMINIO = 85000;

const keys = () => ({
  pub: (process.env.EPAYCO_PUBLIC_KEY || '347e56166b7cbd26c7257d8689033fba').trim(),
  priv: (process.env.EPAYCO_PRIVATE_KEY || '').trim(),
  test: /^(1|true|si|sí)$/i.test(process.env.EPAYCO_TEST || ''),
});

let tokenCache = null;
async function login(k) {
  if (tokenCache && Date.now() - tokenCache.at < 10 * 60000) return tokenCache.token;
  const r = await fetch('https://apify.epayco.co/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${k.pub}:${k.priv}`).toString('base64') },
    body: '{}',
  });
  const d = await r.json().catch(() => ({}));
  if (!d.token) { console.error('[epayco] login', r.status, JSON.stringify(d).slice(0, 200)); throw new HttpError(502, 'ePayco no aceptó las llaves (' + String(d.textResponse || d.message || d.error || ('HTTP ' + r.status)).slice(0, 100) + '). Revisa EPAYCO_PUBLIC_KEY y EPAYCO_PRIVATE_KEY en Vercel.'); }
  tokenCache = { at: Date.now(), token: d.token };
  return d.token;
}

module.exports = handler({
  async POST(req, res) {
    const k = keys();
    if (!k.priv) throw Object.assign(new HttpError(503, 'Falta la variable EPAYCO_PRIVATE_KEY en Vercel.'), {});
    const b = await readBody(req, 4000);
    const price = PLANS[b.plan];
    if (!price) throw new HttpError(400, 'Plan inválido.');
    const amount = (b.full ? price : price / 2) + (b.dom ? DOMINIO : 0);
    const desc = `Tienda virtual Plan ${b.plan} - ${b.full ? 'Pago total' : 'Anticipo 50%'}${b.dom ? ' + Dominio 1 año' : ''}`;
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'biomarketing-casl.vercel.app';
    const back = `https://${host}/pago-ok.html`;
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '127.0.0.1';
    const name = cleanText(b.name, 60);
    const body = {
      test: k.test,
      ip,
      name: 'Bio Marketing',
      description: desc,
      invoice: 'BM-' + Date.now(),
      currency: 'COP',
      amount,
      taxBase: 0,
      tax: 0,
      taxIco: 0,
      country: 'CO',
      lang: 'ES',
      checkout_version: '2',
      response: back,
      confirmation: back,
      extra1: b.plan,
      extra2: b.full ? 'total' : 'anticipo',
      extra3: b.dom ? 'dominio' : 'sin-dominio',
      billing: { email: '', name, address: 'Colombia', typeDoc: 'CC', numberDoc: '', mobilePhone: String(b.phone || '').replace(/\D/g, '').slice(-10) },
    };
    let token = await login(k);
    let r = await fetch('https://apify.epayco.co/payment/session/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    if (r.status === 401) { tokenCache = null; token = await login(k); r = await fetch('https://apify.epayco.co/payment/session/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }); }
    const d = await r.json().catch(() => ({}));
    const sessionId = (d.data && d.data.sessionId) || d.sessionId || '';
    if (!sessionId) { console.error('[epayco] session', r.status, JSON.stringify(d).slice(0, 300)); throw new HttpError(502, 'ePayco no pudo crear la sesión de pago: ' + String(d.textResponse || d.message || r.status).slice(0, 120)); }
    send(res, 200, { sessionId, test: k.test, amount, description: desc });
  },
});
