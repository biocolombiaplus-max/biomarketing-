// POST /api/admin/upload-signature · firma para que el panel suba la imagen directo a Cloudinary
// (el archivo no pasa por Vercel y el secreto nunca sale del servidor).
const { need, requireAdmin, signParams, apiBase, LOGOS_FOLDER, send, handler } = require('../_lib/store');

module.exports = handler({
  async POST(req, res) {
    requireAdmin(req);
    const c = need();
    const params = { folder: LOGOS_FOLDER, timestamp: Math.floor(Date.now() / 1000) };
    send(res, 200, { uploadUrl: `${apiBase()}${c.cloud}/image/upload`, apiKey: c.key, ...params, signature: signParams(params, c.secret) });
  },
});
