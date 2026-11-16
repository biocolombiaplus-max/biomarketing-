// Sirve logos y fotos subidos desde el panel (guardados en Redis). Lo usa /api/public/data?id=…
const { K, creds, redis, send } = require('./store');

module.exports = async function serveImg(req, res) {
    const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
    if (!/^[a-z0-9]{8,32}$/.test(id) || !creds()) return send(res, 404, { error: 'No encontrada.' });
    const raw = await redis('GET', K.img + id);
    const m = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,(.+)$/.exec(raw || '');
    if (!m) return send(res, 404, { error: 'No encontrada.' });
    res.statusCode = 200;
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (m[1] === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.end(Buffer.from(m[2], 'base64'));
};
