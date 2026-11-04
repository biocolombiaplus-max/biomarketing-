// GET /api/public/epayco-js?f=checkout-v2 | checkout · entrega el script oficial de ePayco desde este mismo dominio.
// Se usa solo como respaldo cuando el navegador no puede descargarlo directo de checkout.epayco.co
// (bloqueadores de anuncios o restricciones por dominio). El contenido es el original de ePayco, sin cambios.
const FILES = { 'checkout-v2': 'https://checkout.epayco.co/checkout-v2.js', 'checkout': 'https://checkout.epayco.co/checkout.js' };

module.exports = async (req, res) => {
  const f = new URL(req.url, 'http://x').searchParams.get('f');
  const src = FILES[f];
  const fail = (status, error) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({ error })); };
  if (!src) return fail(404, 'Archivo no permitido.');
  try {
    const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 (BioMarketing landing)', Accept: '*/*' } });
    const body = await r.text();
    if (!r.ok || body.length < 200) return fail(502, `ePayco respondió ${r.status} al pedir ${f}.js`);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
    res.end(body);
  } catch (e) {
    fail(502, `No se pudo descargar ${f}.js desde ePayco (${e.message}).`);
  }
};
