/* Utilidades de las funciones de Vercel: Cloudinary (almacenamiento), sesión del panel y respuestas.
   Los archivos que empiezan por "_" no se publican como rutas. Sin dependencias: solo Node 20+.
   Basado en el módulo de patrocinadores de Mangos Espaciales. */
const crypto = require('crypto');

const ROOT = 'biomarketing-tiendas';
const DATA_ID = `${ROOT}/config/landing.json`;
const LOGOS_FOLDER = `${ROOT}/logos`;
const VISITS_PREFIX = `${ROOT}/visitas/`;
const LEADS_PREFIX = `${ROOT}/leads/`;

// Acepta CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME) o las tres variables sueltas.
function creds() {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@([\w-]+)\s*$/.exec((process.env.CLOUDINARY_URL || '').trim().replace(/^CLOUDINARY_URL=/, ''));
  if (m) return { key: m[1], secret: m[2], cloud: m[3] };
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  return cloud && key && secret ? { cloud: cloud.trim(), key: key.trim(), secret: secret.trim() } : null;
}
const apiBase = () => 'https://api.cloudinary.com/v1_1/';
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const NOT_CONFIGURED = 'El almacenamiento aún no está conectado: falta la variable CLOUDINARY_URL en Vercel.';
function need() {
  const c = creds();
  if (!c) throw new HttpError(503, NOT_CONFIGURED);
  return c;
}

function signParams(params, secret) {
  const base = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== '').sort().map((k) => `${k}=${params[k]}`).join('&');
  return sha1(base + secret);
}

async function cloudFetch(url, opts) {
  let res;
  try { res = await fetch(url, opts); } catch (e) { throw new HttpError(502, 'No se pudo conectar con Cloudinary. Inténtalo de nuevo.'); }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}
function cloudError(data, status) {
  const msg = (data && data.error && data.error.message) || '';
  if (status === 401 || /api_key|signature|credentials/i.test(msg)) return 'Cloudinary rechazó las credenciales: revisa CLOUDINARY_URL en Vercel.';
  if (status === 420 || status === 429) return 'Cloudinary está limitando las solicitudes. Espera un momento.';
  return 'Cloudinary respondió con un error' + (msg ? `: ${msg}` : '.');
}
// Contexto de Cloudinary: "clave=valor|clave2=valor2"; "=" y "|" se escapan.
const ctxValue = (v) => String(v ?? '').replace(/[|=]/g, (ch) => '\\' + ch).slice(0, 200);
const contextString = (obj) => Object.entries(obj).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${ctxValue(v)}`).join('|');

async function uploadJson(publicId, obj, extra = {}) {
  const c = need();
  const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), overwrite: 'true', invalidate: 'true', ...extra };
  const body = new URLSearchParams({ ...params, file: 'data:application/json;base64,' + Buffer.from(JSON.stringify(obj)).toString('base64'), api_key: c.key, signature: signParams(params, c.secret) });
  const { res, data } = await cloudFetch(`${apiBase()}${c.cloud}/raw/upload`, { method: 'POST', body });
  if (!res.ok) throw new HttpError(502, cloudError(data, res.status));
  return data;
}
async function adminGet(path) {
  const c = need();
  const { res, data } = await cloudFetch(`${apiBase()}${c.cloud}/${path}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${c.key}:${c.secret}`).toString('base64') } });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, cloudError(data, res.status));
  return data;
}
async function destroyRaw(publicId) {
  const c = need();
  const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), invalidate: 'true' };
  const body = new URLSearchParams({ ...params, api_key: c.key, signature: signParams(params, c.secret) });
  const { res, data } = await cloudFetch(`${apiBase()}${c.cloud}/raw/destroy`, { method: 'POST', body });
  if (!res.ok) throw new HttpError(502, cloudError(data, res.status));
  return data;
}
// Lista los archivos de una carpeta con su contexto (máx. 20 páginas de 500).
async function listContext(prefix) {
  const out = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ prefix, max_results: '500', context: 'true' });
    if (cursor) q.set('next_cursor', cursor);
    const d = await adminGet(`resources/raw/upload?${q}`);
    if (!d) break;
    for (const r of d.resources || []) out.push({ ...((r.context && r.context.custom) || {}), _created: r.created_at });
    cursor = d.next_cursor;
    if (!cursor) break;
  }
  return out;
}
async function getJson(url) {
  const { res, data } = await cloudFetch(url, { cache: 'no-store' });
  if (!res.ok) throw new HttpError(502, 'No se pudo leer el archivo en Cloudinary.');
  return data;
}

/* ---------- Datos de la landing: clientes y reseñas ---------- */
const SPEEDS = ['lento', 'normal', 'rapido'];
const DEFAULT_DATA = { clients: [], reviews: [], config: { speed: 'normal', showReviews: true } };

let cache = null;
async function readData({ fresh } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 15000) return cache.data;
  const meta = await adminGet(`resources/raw/upload/${DATA_ID}`);
  const file = meta ? await getJson(meta.secure_url) : {};
  const data = { ...DEFAULT_DATA, ...file, config: { ...DEFAULT_DATA.config, ...(file.config || {}) } };
  cache = { at: Date.now(), data };
  return data;
}

const clampInt = (v, min, max, def) => (v === '' || v == null || !isFinite(Number(v)) ? def : Math.max(min, Math.min(max, Math.round(Number(v)))));
const httpsUrl = (u) => { u = String(u || '').trim(); return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 600) : ''; };
const linkUrl = (u) => { u = String(u || '').trim(); if (u && !/^[a-z]+:/i.test(u)) u = 'https://' + u; return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 600) : ''; };
const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanId = (id, i, p) => String(id || `${p}${Date.now().toString(36)}${i}`).replace(/[^\w-]/g, '').slice(0, 24);

function cleanData(body) {
  const clients = Array.isArray(body.clients) ? body.clients.slice(0, 120) : null;
  const reviews = Array.isArray(body.reviews) ? body.reviews.slice(0, 120) : null;
  if (!clients || !reviews) throw new HttpError(400, 'Datos inválidos.');
  const c = body.config || {};
  return {
    clients: clients.map((x, i) => ({
      id: cleanId(x.id, i, 'cl'),
      name: cleanText(x.name, 60),
      logo: httpsUrl(x.logo),
      url: linkUrl(x.url),
      category: cleanText(x.category, 40),
      bg: ['white', 'dark', 'pink', 'yellow'].includes(x.bg) ? x.bg : 'white',
      active: x.active !== false,
    })).filter((x) => x.logo),
    reviews: reviews.map((r, i) => ({
      id: cleanId(r.id, i, 'rv'),
      name: cleanText(r.name, 60),
      business: cleanText(r.business, 70),
      text: cleanText(r.text, 600),
      rating: clampInt(r.rating, 1, 5, 5),
      photo: httpsUrl(r.photo),
      url: linkUrl(r.url),
      active: r.active !== false,
    })).filter((r) => r.name && r.text),
    config: { speed: SPEEDS.includes(c.speed) ? c.speed : 'normal', showReviews: c.showReviews !== false },
  };
}
async function saveData(body) {
  const data = cleanData(body);
  await uploadJson(DATA_ID, { ...data, updatedAt: new Date().toISOString() });
  cache = { at: Date.now(), data };
  return data;
}

/* ---------- Sesión del panel ----------
   Token sin estado: vencimiento + firma HMAC con la clave del panel y el secreto de Cloudinary.
   La clave se define con ADMIN_PASSWORD en Vercel (por defecto 123456). */
const SESSION_MS = 12 * 60 * 60 * 1000;
const adminPassword = () => process.env.ADMIN_PASSWORD || '123456';
const tokenKey = () => `${adminPassword()}::${(creds() || {}).secret || 'sin-cloudinary'}`;
const hmac = (s) => crypto.createHmac('sha256', tokenKey()).update(s).digest('hex');
const same = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
function makeToken() { const exp = String(Date.now() + SESSION_MS); return `${exp}.${hmac(exp)}`; }
function requireAdmin(req) {
  const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || Number(exp) < Date.now() || !same(sig, hmac(exp))) throw new HttpError(401, 'Tu sesión terminó. Ingresa de nuevo.');
}

/* ---------- HTTP ---------- */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch (e) { throw new HttpError(400, 'Solicitud inválida.'); } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 1e6) throw new HttpError(413, 'Solicitud demasiado grande.'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { throw new HttpError(400, 'Solicitud inválida.'); }
}
function send(res, status, data, cacheHeader) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheHeader || 'no-store');
  res.end(JSON.stringify(data));
}
function handler(methods) {
  return async (req, res) => {
    const fn = methods[req.method];
    if (!fn) { res.setHeader('Allow', Object.keys(methods).join(', ')); return send(res, 405, { error: 'Método no permitido.' }); }
    try { await fn(req, res); } catch (e) {
      const status = e.status || 500;
      if (status >= 500 && status !== 503) console.error('[api]', req.url, e.message);
      send(res, status, { error: e instanceof HttpError ? e.message : 'Error inesperado. Inténtalo de nuevo.', ...(status === 503 ? { code: 'not_configured' } : {}) });
    }
  };
}

module.exports = { LOGOS_FOLDER, VISITS_PREFIX, LEADS_PREFIX, contextString, uploadJson, destroyRaw, listContext, cleanText, HttpError, creds, need, apiBase, signParams, readData, saveData, adminPassword, same, makeToken, requireAdmin, readBody, send, handler };
