# Cotizador Personal Shopper

Cotiza productos de retailers de US en pesos colombianos y genera la imagen de
historia de Instagram lista para publicar. Usuaria única, mobile-first.

## Puesta en marcha

1. Crea un proyecto **nuevo** en [Neon](https://neon.tech) y copia la cadena
   *pooled*.
2. Llena `.env` (usa `.env.example` como guía):

   ```
   DATABASE_URL=postgresql://...      # Neon, pooled
   BETTER_AUTH_SECRET=...             # openssl rand -base64 32
   BETTER_AUTH_URL=http://localhost:3000
   ADMIN_EMAIL=tu@correo.com
   ADMIN_PASSWORD=...
   ANTHROPIC_API_KEY=...              # lee las capturas (solo server-side)
   BLOB_READ_WRITE_TOKEN=...          # Vercel Blob, guarda las capturas
   ```

3. Instala, migra y siembra:

   ```bash
   npm install
   npx prisma migrate dev
   npm run db:seed
   npm run dev
   ```

El seed crea la fila de `Settings` con **valores iniciales de referencia** y la
cuenta admin (vía Better Auth, nunca hasheando a mano). Ajusta las tarifas
reales en `/config` antes de cotizar en serio.

## Flujo

| Pantalla | Ruta | Qué hace |
| --- | --- | --- |
| Nueva cotización | `/` | **Subes la captura** (o pegas el link), se pre-llena el formulario, ves el desglose en vivo, generas la historia y guardas. |
| Historial | `/historial` | Lista descendente. El detalle muestra el snapshot original (no recalcula). |
| Configuración | `/config` | Margen, tarifas, redondeo, pesos por categoría y marca. Solo afecta cotizaciones nuevas. |

## Cómo se calcula

`lib/cotizador.ts` es una función pura, sin I/O, con tests (`npm test`):

```
tax_usd        = precio_usd × sales_tax_pct
flete_usd      = peso_lb × tarifa_lb_usd
aterrizado_usd = precio_usd + tax_usd + flete_usd
trm_aplicada   = trm_oficial × (1 + trm_buffer_pct)
costo_cop      = aterrizado_usd × trm_aplicada
margen_cop     = costo_cop × margen_pct
precio_cop     = ceil((costo_cop + margen_cop) / redondeo_cop) × redondeo_cop
```

Cada cotización guarda el **snapshot completo** del cálculo, así que reabrir una
cotización vieja muestra los valores originales aunque la config haya cambiado.

## TRM

Se lee del dataset público `32sa-8pi3` de datos.gov.co (serie histórica de la
TRM). Se cachea una fila por día de consulta en la tabla `TrmCache`; si la API
falla se usa el último valor guardado y la UI muestra la fecha de vigencia.

## Los dos caminos de entrada

**Captura de pantalla (principal).** La usuaria toma el screenshot en la tienda
—donde la página sí carga— y lo sube. El navegador lo comprime (lado mayor a
2000px, JPEG ~0.85), se guarda en Blob y en paralelo lo lee un modelo de visión
que devuelve nombre, precio USD, marca, categoría, tallas **y el recuadro de la
foto del producto**. Funciona con cualquier retailer porque no hay nada que
evadir.

La captura completa hace falta para leer los datos, pero publicarla entera
sacaría media página del retailer (con su precio en dólares) en la historia. Por
eso guardamos **una sola imagen — la captura completa — más las coordenadas del
recorte**; la historia aplica el recorte al renderizar. Así se conserva la
evidencia de lo que viste ese día y el recorte se puede reajustar después sin
volver a subir nada.

- `POST /api/subir-captura` — multipart, guarda vía `lib/storage.ts`.
- `POST /api/extraer-imagen` — base64, llama a Claude (`claude-sonnet-4-6`).

La clave de Anthropic nunca sale del servidor. Si la lectura falla, el
formulario queda vacío con un aviso y **la captura subida se conserva**.

Sobre HEIC: iOS normalmente entrega JPEG desde el selector de fotos, pero si
llega HEIC el canvas del navegador puede no decodificarlo; en ese caso se
muestra "No pude leer esta imagen, intenta con una captura de pantalla".

### Recorte de la foto

`lib/recorte.ts` guarda el recuadro en fracciones 0..1 (`{x, y, ancho, alto}`),
así que no depende de la resolución: la captura que se muestra y la que se sube
a Blob son el mismo archivo, y las fracciones valen igual en ambas.

**Cambiar foto.** Si la captura no sirve como imagen publicable, en la sección
"Así saldrá la foto en la historia" se puede pegar (⌘V) o subir otra foto: pasa
a `historia_url` y reemplaza **solo el asset visual**. Los datos del formulario
y `captura_url` no se tocan — la evidencia original se conserva —, y "Volver a
la captura" deshace el reemplazo. La foto nueva usa el mismo ajuste de recorte
con proporción fija.

**El recuadro está bloqueado a la proporción del hueco de la historia**
(`SLOT_ANCHO / SLOT_ALTO`). Si fuera de proporción libre, la plantilla tendría
que recortarlo otra vez para encajarlo y lo publicado no coincidiría con lo
ajustado — así se perdía un 13,6% del alto. `conformarAspecto()` lo ajusta al
llegar del modelo y el redimensionado en la UI lo mantiene; `calcularTransformacion()`
usa una sola escala, sin `cover` encima.

El modelo tiende a devolver el recuadro más ancho de la cuenta; la instrucción
del prompt es explícita en que **dentro del recuadro no puede quedar texto
legible**, que es lo que lo ajusta al panel de la foto. Aun así, la vista previa
antes de publicar es la red de seguridad.

Detalle de satori: la caja del recorte no puede llevar `alignItems` ni
`justifyContent`, porque recentran al hijo y anulan los márgenes negativos con
los que se desplaza la imagen.

### Almacenamiento

`lib/storage.ts` es un adaptador con `put()` / `delete()`. La implementación de
v1.1 es Vercel Blob; **ningún otro módulo importa `@vercel/blob`**, así que
migrar a R2 es cambiar solo ese archivo.

## Extracción desde la URL

`POST /api/extraer` lee la página con un timeout de 8 s y saca nombre, imagen y
precio de **JSON-LD** (`@type: Product`) y, si falta algo, de **Open Graph**.

El parseo es genérico —**no hay una sola rama condicionada al dominio**— y
aguanta las variantes que se ven en el mundo real:

- **Estructura:** `@graph`, `mainEntity`, `itemListElement`, `hasVariant`, raíz como arreglo,
  varios bloques `ld+json` en la misma página (se queda con el nodo Product más
  completo, sin mezclar campos entre productos distintos), `@type` como string o
  arreglo, y un bloque roto que no invalida a los demás.
- **Ofertas:** `Offer` suelto, arreglo de ofertas, `AggregateOffer` con
  `lowPrice`, ofertas anidadas y precio dentro de `priceSpecification`.
- **`ProductGroup`:** cuando el grupo no trae `offers` propio, el precio se
  busca en `hasVariant[]` (un Product por talla o color). Si las variantes no
  coinciden se toma la más barata, mismo criterio que `AggregateOffer.lowPrice`.
  El `offers` del grupo, si existe, gana sobre las variantes.
- **Precios:** `"22.97"`, `"22,97"`, `"$22.97"`, `"USD 22.97"`, `"1.299,00"` y
  `"1,299.00"`. Con un solo separador manda cuántos dígitos lo siguen: tres son
  miles (`"1,299"` → 1299), uno o dos son decimales (`"22,97"` → 22.97). Los
  precios de retail no llevan tres decimales, así que la regla es segura aquí.
- **Moneda:** si `priceCurrency` no es USD, el precio se llena igual y se
  devuelve `moneda` para que el formulario avise ("Precio detectado en MXN…").
  Descartarlo sería peor: el dato correcto está ahí, solo hay que verificarlo.
- **Textos:** entidades HTML decodificadas en todos los campos (incluido el
  bloque Latin-1 completo, distinguiendo `&Aacute;` de `&aacute;`), espacios
  colapsados y rechazo de rellenos como `N/A`, `null` o `{{productName}}`.

Cuando un caso solo se resolvería con una regla por sitio, se deja sin resolver.

### Criterio de aceptación del parser

No basta con que salga un número: **el precio extraído debe coincidir con el
precio visible en la página**. Un extractor que devuelve un precio equivocado es
peor que uno que no devuelve nada, porque el error se propaga hasta la historia
publicada.

Cómo comprobarlo con un producto: abre la URL en el navegador, anota el precio
que se ve, y compáralo con lo que devuelve `extraerProducto(url)`. Los fixtures
de `lib/extraer.test.ts` cubren la forma del JSON-LD; esta comprobación cubre que
el dato además sea el correcto.

Última corrida (2026-08-05, seis productos de Nike con cuatro precios distintos:
60, 75, 115 y 125 USD): **6 de 6 coinciden**. Antes de soportar `hasVariant`,
Nike devolvía nombre e imagen pero nunca precio — el dato estaba bien, el parser
no bajaba a buscarlo.

Sin scraping por retailer, sin headless browser, sin bypass de anti-bot: si el
sitio bloquea el fetch o no expone esos datos, el formulario queda vacío con un
aviso y se llena a mano. Varios retailers grandes (adidas, Walmart, Zara,
Sephora, Macy's) responden 403 o una pantalla anti-bot a peticiones de servidor;
Nike y otros sitios con JSON-LD abierto sí funcionan.

## Imagen de historia

`GET /api/historia/[id]` renderiza un PNG de 1080×1920 con `@vercel/og`. Con
`id = preview` y query params (`nombre`, `precio_cop`, `captura_url`, `recorte`,
`imagen_url`, `talla_notas`) se previsualiza una cotización sin guardar. El
`recorte` va como `x,y,ancho,alto`.

La imagen se elige en este orden: `historia_url` (foto puesta a mano, recortada
si hay `historia_recorte`) → `captura_url` (Blob, recortada si hay `recorte`) →
`imagen_url` (hotlink al retailer, sin recortar, que ya viene encuadrada) →
bloque de color de marca con el nombre.

Nota sobre el hotlink: los CDN de adidas y Walmart **no** bloquean el fetch de
servidor. Lo que rompía las historias en v1 era la cabecera `Accept`: pedíamos
`image/avif,image/webp` y los CDN negociaban a ese formato, que satori no
decodifica. Ahora pedimos solo `png/jpeg/gif` y esas imágenes cargan bien.

Las fuentes (Inter, SIL OFL) van embebidas en `assets/fonts` porque satori no
hereda fuentes del sistema; `next.config.ts` las incluye en el bundle de la
función.

## Comandos

```bash
npm run dev        # desarrollo
npm test           # tests de lib/
npm run build      # prisma generate && prisma migrate deploy && next build
npm run db:seed    # settings + cuenta admin
```

Los iconos de la PWA se regeneran con `npx tsx scripts/generar-iconos.tsx`.

## Despliegue

Vercel, sin `vercel.json`. Configura en el proyecto: `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (la URL de producción), `ADMIN_EMAIL` y
`ADMIN_PASSWORD`. El script de build corre las migraciones.
