import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "@vercel/og";
import { formatearCOP } from "./cotizador";
import {
  calcularTransformacion,
  medidasImagen,
  SLOT_ALTO,
  SLOT_ANCHO,
  type Recorte,
} from "./recorte";

export const HISTORIA_ANCHO = 1080;
export const HISTORIA_ALTO = 1920;

const TIMEOUT_IMAGEN_MS = 6000;
const MAX_BYTES_IMAGEN = 6 * 1024 * 1024;

export type DatosHistoria = {
  nombre: string;
  precio_cop: number;
  /** Foto elegida a mano para la historia. Manda sobre todo lo demás. */
  historia_url?: string | null;
  /** Recuadro dentro de `historia_url`. */
  historia_recorte?: Recorte | null;
  /** Captura subida a Blob. Tiene prioridad sobre el hotlink. */
  captura_url?: string | null;
  /** Recuadro de la foto dentro de la captura. Null = captura completa. */
  recorte?: Recorte | null;
  imagen_url?: string | null;
  talla_notas?: string | null;
  ig_handle: string;
  lema: string;
  color_marca: string;
};

let fuentesCache: Array<{ name: string; data: ArrayBuffer; weight: 400 | 800 }> | null = null;

/**
 * Satori no hereda fuentes del sistema: hay que pasarle los binarios.
 * Inter (SIL OFL) va embebida en `assets/fonts` — ver `outputFileTracingIncludes`
 * en next.config.ts para que Vercel la incluya en el bundle de la función.
 */
async function cargarFuentes() {
  if (fuentesCache) return fuentesCache;
  const base = join(process.cwd(), "assets", "fonts");
  const [regular, extraBold] = await Promise.all([
    readFile(join(base, "Inter-400.ttf")),
    readFile(join(base, "Inter-800.ttf")),
  ]);
  fuentesCache = [
    { name: "Inter", data: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength) as ArrayBuffer, weight: 400 },
    { name: "Inter", data: extraBold.buffer.slice(extraBold.byteOffset, extraBold.byteOffset + extraBold.byteLength) as ArrayBuffer, weight: 800 },
  ];
  return fuentesCache;
}

/**
 * Descarga la imagen del retailer y la vuelve data URI. Si el sitio bloquea el
 * hotlinking o tarda demasiado, devolvemos null y la historia usa el fallback
 * de color de marca (riesgo aceptado en v1).
 */
type ImagenCargada = { dataUri: string; ancho: number; alto: number };

async function imagenComoDataUri(url?: string | null): Promise<ImagenCargada | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_IMAGEN_MS),
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        // Satori no decodifica avif ni webp. Si los pedimos, los CDN de los
        // retailers (adidas, Walmart) negocian a ese formato y la historia
        // termina cayendo al bloque de color aunque la imagen sí esté
        // disponible. Pedimos solo lo que satori sabe leer.
        accept: "image/png,image/jpeg,image/gif",
      },
    });
    if (!res.ok) return null;

    const tipo = res.headers.get("content-type") ?? "";
    // Satori no decodifica avif ni webp.
    if (!/^image\/(png|jpeg|jpg|gif)$/i.test(tipo.split(";")[0].trim())) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.byteLength || buffer.byteLength > MAX_BYTES_IMAGEN) return null;

    const medidas = medidasImagen(buffer);
    if (!medidas) return null;

    return {
      dataUri: `data:${tipo.split(";")[0].trim()};base64,${buffer.toString("base64")}`,
      ...medidas,
    };
  } catch {
    return null;
  }
}

function recortar(texto: string, maximo: number) {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}

/**
 * La captura en Blob va primero: es nuestro propio origen, sin anti-bot ni
 * negociación de formato. El hotlink al retailer queda de respaldo para las
 * cotizaciones creadas por el camino de URL.
 */
async function mejorImagen(
  datos: DatosHistoria,
): Promise<{ imagen: ImagenCargada; recorte: Recorte | null } | null> {
  // Orden: foto puesta a mano → captura recortada → hotlink del retailer (que
  // ya viene encuadrado en el producto, por eso va sin recorte).
  for (const [candidata, recorte] of [
    [datos.historia_url, datos.historia_recorte ?? null] as const,
    [datos.captura_url, datos.recorte ?? null] as const,
    [datos.imagen_url, null] as const,
  ]) {
    if (!candidata) continue;
    const imagen = await imagenComoDataUri(candidata);
    if (imagen) return { imagen, recorte };
  }
  return null;
}

export async function renderizarHistoria(datos: DatosHistoria): Promise<ImageResponse> {
  const [fonts, imagen] = await Promise.all([cargarFuentes(), mejorImagen(datos)]);

  const acento = datos.color_marca || "#E11D74";
  const nombre = recortar(datos.nombre, 70);

  // El hueco de la foto vive en lib/recorte.ts: el ajuste en el cliente usa la
  // misma proporción, y así lo recortado y lo publicado coinciden.
  const CAJA_ANCHO = SLOT_ANCHO;
  const CAJA_ALTO = SLOT_ALTO;
  const encuadre = imagen
    ? calcularTransformacion(
        imagen.recorte ?? { x: 0, y: 0, ancho: 1, alto: 1 },
        imagen.imagen.ancho,
        imagen.imagen.alto,
        CAJA_ANCHO,
        CAJA_ALTO,
      )
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: HISTORIA_ANCHO,
          height: HISTORIA_ALTO,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0B0B0F",
          color: "#FFFFFF",
          fontFamily: "Inter",
        }}
      >
        {/* Encabezado: handle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "64px 64px 40px 64px",
          }}
        >
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -0.5 }}>
            {datos.ig_handle}
          </div>
        </div>

        {/* Imagen del producto, dominante */}
        <div
          style={{
            display: "flex",
            flex: 1,
            width: CAJA_ANCHO,
            maxHeight: CAJA_ALTO,
            margin: "0 64px",
            borderRadius: 48,
            overflow: "hidden",
            backgroundColor: imagen ? "#FFFFFF" : acento,
            alignItems: "center",
            justifyContent: "center",
            padding: imagen ? 0 : 72,
          }}
        >
          {imagen ? (
            // Caja de recorte propia: sin `alignItems`/`justifyContent`, que
            // recentran al hijo y anulan los márgenes negativos. Escalamos y
            // desplazamos la imagen completa para que el recuadro del producto
            // llene la caja, y el `overflow: hidden` hace de tijera.
            <div
              style={{
                display: "flex",
                width: CAJA_ANCHO,
                height: CAJA_ALTO,
                overflow: "hidden",
              }}
            >
              {/* Esto lo renderiza satori, no el DOM: next/image no aplica. */}
              {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
              <img
                src={imagen.imagen.dataUri}
                width={encuadre!.ancho}
                height={encuadre!.alto}
                style={{
                  marginLeft: `${-encuadre!.offsetX}px`,
                  marginTop: `${-encuadre!.offsetY}px`,
                  flexShrink: 0,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                textAlign: "center",
                fontSize: 76,
                fontWeight: 800,
                lineHeight: 1.15,
                color: "#FFFFFF",
              }}
            >
              {nombre}
            </div>
          )}
        </div>

        {/* Pie: nombre, tallas, precio y lema */}
        <div style={{ display: "flex", flexDirection: "column", padding: "48px 64px 72px 64px" }}>
          <div
            style={{
              display: "flex",
              width: 140,
              height: 12,
              borderRadius: 999,
              backgroundColor: acento,
              marginBottom: 28,
            }}
          />

          <div
            style={{
              display: "flex",
              fontSize: 50,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: -1,
              marginBottom: datos.talla_notas ? 14 : 24,
            }}
          >
            {nombre}
          </div>

          {datos.talla_notas ? (
            <div
              style={{
                display: "flex",
                fontSize: 34,
                color: "#A9A9B8",
                lineHeight: 1.25,
                marginBottom: 24,
              }}
            >
              {recortar(datos.talla_notas, 90)}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              fontSize: 128,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1,
              marginBottom: 28,
            }}
          >
            {formatearCOP(datos.precio_cop)}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: acento }}>
              {datos.lema}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: "#71717F" }}>Precio en COP</div>
          </div>
        </div>
      </div>
    ),
    {
      width: HISTORIA_ANCHO,
      height: HISTORIA_ALTO,
      fonts: fonts.map((f) => ({ ...f, style: "normal" as const })),
    },
  );
}
