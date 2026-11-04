# Bio Marketing — Landing de tiendas virtuales

Landing de venta del servicio de creación de tiendas virtuales y páginas web (planes Emprende, Crece y Pro Empresarial),
con panel administrativo en `/admin`.

- `index.html`: la landing.
- `admin.html`: panel (clave por defecto **123456**). Pestañas: Estadísticas, Clientes potenciales, Nuestros clientes, Reseñas y Ajustes.
- `pago-ok.html`: página a la que ePayco devuelve al cliente después de pagar.
- `api/`: funciones de Vercel (guardan todo en Cloudinary, sin base de datos aparte).
- `assets/`: logo y fotos.

## Configuración en Vercel (una sola vez)

1. **Cloudinary** (la misma cuenta de Mangos Espaciales sirve): en cloudinary.com → Settings → API Keys, copia la
   *API environment variable* (empieza por `cloudinary://`).
2. En Vercel → el proyecto → Settings → Environment Variables, crea:
   - `CLOUDINARY_URL` = el valor copiado.
   - `ADMIN_PASSWORD` = la clave del panel (opcional; si no la pones es `123456`).
3. Deployments → ⋯ → **Redeploy**.

Sin `CLOUDINARY_URL` la landing funciona igual, pero el panel no puede guardar ni mostrar estadísticas.

## Qué mide el panel

- Visitas por canal (Meta Ads, Instagram, Google, TikTok, WhatsApp, Directo…), ciudad, dispositivo y campaña (`utm_campaign`).
- Embudo: visitó → vio los planes → tocó comprar → dejó su WhatsApp → inició el pago → pagó.
- Clientes potenciales: nombre y WhatsApp de quien toca "Adquirir por WhatsApp" o "Pagar", con botón para recontactar
  los pagos abandonados y exportación a Excel (CSV).
