// GET /api/public/contract?id=… · documento para el cliente · POST firma (una sola vez).
const { K, HttpError, creds, redis, saveRecord, cleanText, readBody, send, handler } = require('../_lib/store');
const { publicView } = require('../_lib/contract');

const okId = (id) => /^[a-f0-9]{24}$/.test(String(id || ''));
async function load(id) {
  if (!okId(id)) throw new HttpError(404, 'Este documento no existe o el link está incompleto.');
  if (!creds()) throw new HttpError(503, 'El almacenamiento no está conectado.');
  let c = {};
  try { c = JSON.parse((await redis('HGET', K.contracts, id)) || '{}'); } catch (e) {}
  if (!c.id) throw new HttpError(404, 'Este documento no existe o fue eliminado.');
  return c;
}

module.exports = handler({
  async GET(req, res) {
    const c = await load(new URL(req.url, 'http://x').searchParams.get('id'));
    send(res, 200, { contract: publicView(c) });
  },
  async POST(req, res) {
    const b = await readBody(req, 400000);
    const c = await load(b.id);
    if (c.signedAt) throw new HttpError(409, 'Este documento ya fue firmado.');
    const sig = String(b.signature || '');
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 800) throw new HttpError(400, 'Dibuja tu firma en el recuadro.');
    if (sig.length > 350000) throw new HttpError(413, 'La firma es muy pesada. Inténtalo de nuevo.');
    const name = cleanText(b.name, 70), doc = String(b.doc || '').replace(/[^\dA-Za-z]/g, '').slice(0, 20);
    if (name.length < 3) throw new HttpError(400, 'Escribe tu nombre completo.');
    if (doc.length < 5) throw new HttpError(400, 'Escribe tu número de documento.');
    if (b.accept !== true) throw new HttpError(400, 'Debes aceptar los términos del documento.');
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const signed = { ...c, status: 'firmado', signature: sig, signedAt: new Date().toISOString(), signer: { name, doc, ip: ip.slice(0, 45), ua: String(req.headers['user-agent'] || '').slice(0, 160) } };
    await saveRecord(K.contracts, c.id, signed);
    send(res, 200, { contract: publicView(signed) });
  },
});
