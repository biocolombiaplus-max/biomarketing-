# Bio Marketing — Landing de tiendas virtuales

Landing de venta del servicio de creación de tiendas virtuales y páginas web (planes Emprende, Crece y Pro Empresarial),
con panel administrativo en `/admin`.

- `index.html`: la landing.
- `admin.html`: panel (clave por defecto **123456**). Pestañas: Estadísticas, Clientes potenciales, Nuestros clientes, Reseñas y Ajustes.
- `pago-ok.html`: página a la que ePayco devuelve al cliente después de pagar.
- `api/`: funciones de Vercel. Guardan todo (clientes, reseñas, imágenes, visitas y clientes potenciales) en **Upstash Redis**, gratis.
- `assets/`: logo y fotos.

## Configuración en Vercel (una sola vez)

1. En Vercel → el proyecto → pestaña **Storage** → **Create Database** → **Upstash for Redis** → plan **Free** → **Create**.
2. Conéctala al proyecto (Production y Preview). Vercel crea solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. Opcional: en Settings → Environment Variables crea `ADMIN_PASSWORD` con la clave del panel (si no, es `123456`).
4. Deployments → ⋯ → **Redeploy**.

Sin la base de datos la landing funciona igual, pero el panel no puede guardar ni mostrar estadísticas.
El plan gratis de Upstash incluye unas 500.000 operaciones al mes: cada visita usa de 1 a 4.

## Qué mide el panel

- Visitas por canal (Meta Ads, Instagram, Google, TikTok, WhatsApp, Directo…), ciudad, dispositivo y campaña (`utm_campaign`).
- Embudo: visitó → vio los planes → tocó comprar → dejó su WhatsApp → inició el pago → pagó.
- Clientes potenciales: nombre y WhatsApp de quien toca "Adquirir por WhatsApp" o "Pagar", con botón para recontactar
  los pagos abandonados y exportación a Excel (CSV).
