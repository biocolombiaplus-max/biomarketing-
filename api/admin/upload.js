// POST /api/admin/upload · guarda una imagen (logo o foto) que el panel ya redujo de tamaño.
const crypto = require('crypto');
const { K, HttpError, requireAdmin, need, redis, readBody, send, handler } = require('../_lib/store');

module.exports = handler({
  async POST(req, res) {
    requireAdmin(req);
    need();
    const { data } = await readBody(req, 1.5e6);
    if (!/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(String(data || ''))) throw new HttpError(400, 'La imagen no es válida.');
    if (data.length > 1.4e6) throw new HttpError(413, 'La imagen es muy pesada. Usa una de menos de 1 MB.');
    const id = crypto.randomBytes(9).toString('hex');
    await redis('SET', K.img + id, data);
    send(res, 200, { url: `/api/public/img?id=${id}` });
  },
});
