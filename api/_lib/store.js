/* Utilidades de las funciones de Vercel: almacenamiento en Upstash Redis (gratis, se conecta desde
   Vercel → Storage), sesión del panel y respuestas. Los archivos que empiezan por "_" no son rutas.
   Sin dependencias: solo Node 20+ y la API REST de Upstash. */
const crypto = require('crypto');

const K = { data: 'bm:data', visits: 'bm:visits', leads: 'bm:leads', img: 'bm:img:' };

// Vercel crea KV_REST_API_URL / KV_REST_API_TOKEN al conectar Upstash; también se aceptan las de Upstash.
// Si al conectar se usó otro prefijo (por ejemplo STORAGE_), se busca cualquier par *_REST_API_URL / *_REST_API_TOKEN.
function creds() {
  const env = process.env;
  let url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '';
  let token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) {
    const key = Object.keys(env).find((k) => /_REST_API_URL$/.test(k) && env[k.replace(/_URL$/, '_TOKEN')]);
    if (key) { url = env[key]; token = env[key.replace(/_URL$/, '_TOKEN')]; }
  }
  url = String(url).trim().replace(/\/$/, ''); token = String(token).trim();
  return url && token ? { url, token } : null;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const NOT_CONFIGURED = 'El almacenamiento aún no está conectado: conecta Upstash Redis en Vercel → Storage.';
function need() {
  const c = creds();
  if (!c) throw new HttpError(503, NOT_CONFIGURED);
  return c;
}

async function redisCall(path, body) {
  const c = need();
  let res;
  try {
    res = await fetch(c.url + path, { method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { throw new HttpError(502, 'No se pudo conectar con la base de datos. Inténtalo de nuevo.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new HttpError(502, res.status === 401 ? 'Upstash rechazó las credenciales: revisa la conexión en Vercel → Storage.' : 'La base de datos respondió con un error' + (data.error ? `: ${data.error}` : '.'));
  return data;
}
const redis = async (...cmd) => (await redisCall('', cmd)).result;
const pipeline = async (cmds) => (await redisCall('/pipeline', cmds)).map((r) => r.result);

/* ---------- Datos de la landing: clientes y reseñas ---------- */
const SPEEDS = ['lento', 'normal', 'rapido'];
const DEFAULT_DATA = { clients: [], reviews: [], config: { speed: 'normal', showReviews: true } };

let cache = null;
async function readData({ fresh } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 15000) return cache.data;
  const raw = await redis('GET', K.data);
  let file = {};
  try { file = raw ? JSON.parse(raw) : {}; } catch (e) {}
  const data = { clients: file.clients || [], reviews: file.reviews || [], config: { ...DEFAULT_DATA.config, ...(file.config || {}) } };
  cache = { at: Date.now(), data };
  return data;
}

const clampInt = (v, min, max, def) => (v === '' || v == null || !isFinite(Number(v)) ? def : Math.max(min, Math.min(max, Math.round(Number(v)))));
// Imagen: enlace https o una imagen guardada en el panel (/api/public/img?id=…)
const imgUrl = (u) => { u = String(u || '').trim(); if (/^\/api\/public\/img\?id=[a-z0-9]{8,32}$/.test(u)) return u; return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 600) : ''; };
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
      id: cleanId(x.id, i, 'cl'), name: cleanText(x.name, 60), logo: imgUrl(x.logo), url: linkUrl(x.url), category: cleanText(x.category, 40),
      bg: ['white', 'dark', 'pink', 'yellow'].includes(x.bg) ? x.bg : 'white', active: x.active !== false,
    })).filter((x) => x.logo),
    reviews: reviews.map((r, i) => ({
      id: cleanId(r.id, i, 'rv'), name: cleanText(r.name, 60), business: cleanText(r.business, 70), text: cleanText(r.text, 600),
      rating: clampInt(r.rating, 1, 5, 5), photo: imgUrl(r.photo), url: linkUrl(r.url), active: r.active !== false,
    })).filter((r) => r.name && r.text),
    config: { speed: SPEEDS.includes(c.speed) ? c.speed : 'normal', showReviews: c.showReviews !== false },
  };
}
async function saveData(body) {
  const data = cleanData(body);
  await redis('SET', K.data, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  cache = { at: Date.now(), data };
  return data;
}

/* ---------- Visitas y clientes potenciales (un hash con un JSON por registro) ---------- */
const saveRecord = (key, id, obj) => redis('HSET', key, id, JSON.stringify(obj));
async function readRecords(key) {
  const flat = (await redis('HGETALL', key)) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch (e) {} }
  return out;
}

/* ---------- Sesión del panel ----------
   Token sin estado: vencimiento + firma HMAC con la clave del panel y el token de la base de datos.
   La clave se define con ADMIN_PASSWORD en Vercel (por defecto 123456). */
const SESSION_MS = 12 * 60 * 60 * 1000;
const adminPassword = () => process.env.ADMIN_PASSWORD || '123456';
const tokenKey = () => `${adminPassword()}::${(creds() || {}).token || 'sin-base-de-datos'}`;
const hmac = (s) => crypto.createHmac('sha256', tokenKey()).update(s).digest('hex');
const same = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
function makeToken() { const exp = String(Date.now() + SESSION_MS); return `${exp}.${hmac(exp)}`; }
function requireAdmin(req) {
  const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || Number(exp) < Date.now() || !same(sig, hmac(exp))) throw new HttpError(401, 'Tu sesión terminó. Ingresa de nuevo.');
}

/* ---------- HTTP ---------- */
async function readBody(req, max = 1e6) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch (e) { throw new HttpError(400, 'Solicitud inválida.'); } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw new HttpError(413, 'Solicitud demasiado grande.'); chunks.push(c); }
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

module.exports = { K, HttpError, creds, need, redis, pipeline, readData, saveData, saveRecord, readRecords, cleanText, adminPassword, same, makeToken, requireAdmin, readBody, send, handler };
