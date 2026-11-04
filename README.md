# Bio Marketing — Landing de tiendas virtuales

Landing de venta del servicio de creación de tiendas virtuales y páginas web (planes Emprende, Crece y Pro Empresarial).

- `index.html`: la landing.
- `pago-ok.html`: página a la que ePayco devuelve al cliente después de pagar.
- `assets/`: logo y fotos.

## Publicar en Vercel
Importa este repositorio en Vercel, deja Root Directory en `./` y Application Preset en **Other**, y dale **Deploy**. No necesita build.

## Editar
En `index.html`, el bloque `CONFIG` del script final tiene el número de WhatsApp, el valor del dominio, las credenciales de ePayco y los mensajes de WhatsApp. Los precios de cada plan están en el atributo `data-price` de cada `<article class="plan">` y en el texto visible del precio.
