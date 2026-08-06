/**
 * Recorte de la captura: guardamos la captura completa y, aparte, las
 * coordenadas del recuadro donde está la foto del producto. La historia aplica
 * el recorte al renderizar, así que ajustarlo después no requiere volver a
 * subir nada y la evidencia original (precio, promoción, tallas) se conserva.
 *
 * Las coordenadas van en fracciones de 0 a 1 para no depender de la resolución.
 */

export type Recorte = {
  /** Esquina superior izquierda, fracción del ancho total. */
  x: number;
  /** Esquina superior izquierda, fracción del alto total. */
  y: number;
  ancho: number;
  alto: number;
};

/** Un recuadro más pequeño que esto casi siempre es un error de lectura. */
const MINIMO = 0.05;

function aFraccion(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valida y encaja el recuadro dentro de la imagen. Devuelve `null` cuando no
 * se puede rescatar nada usable — quien llama decide (normalmente: usar la
 * captura completa).
 */
export function normalizarRecorte(valor: unknown): Recorte | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const bruto = valor as Record<string, unknown>;

  const x = aFraccion(bruto.x);
  const y = aFraccion(bruto.y);
  const ancho = aFraccion(bruto.ancho);
  const alto = aFraccion(bruto.alto);
  if (x === null || y === null || ancho === null || alto === null) return null;
  if (ancho <= 0 || alto <= 0) return null;

  // Recortamos contra los bordes en vez de descartar: el modelo suele pasarse
  // unos puntos, y un recuadro desbordado sigue siendo aprovechable.
  const x0 = Math.min(Math.max(x, 0), 1);
  const y0 = Math.min(Math.max(y, 0), 1);
  const x1 = Math.min(Math.max(x + ancho, 0), 1);
  const y1 = Math.min(Math.max(y + alto, 0), 1);

  const a = x1 - x0;
  const b = y1 - y0;
  if (a < MINIMO || b < MINIMO) return null;

  // Redondeamos para no arrastrar ruido de punto flotante hasta el Json.
  return { x: seis(x0), y: seis(y0), ancho: seis(a), alto: seis(b) };
}

function seis(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}

/** Hueco de la foto en la plantilla de historia (ver `lib/historia.tsx`). */
export const SLOT_ANCHO = 952;
export const SLOT_ALTO = 1060;
export const ASPECTO_HISTORIA = SLOT_ANCHO / SLOT_ALTO;

/**
 * Ajusta el recuadro a una proporción exacta sin perder nada de lo que ya
 * encerraba: agranda el lado que falta alrededor del mismo centro y, si se sale
 * de la imagen, encoge lo justo para volver a caber.
 *
 * Es lo que evita el "segundo recorte": si el recuadro y el hueco de la
 * plantilla tienen la misma proporción, mostrarlo no requiere recortar más.
 */
export function conformarAspecto(
  recorte: Recorte,
  origenAncho: number,
  origenAlto: number,
  aspecto: number = ASPECTO_HISTORIA,
): Recorte {
  let ancho = recorte.ancho * origenAncho;
  let alto = recorte.alto * origenAlto;

  // Agrandar el lado corto hasta alcanzar la proporción pedida.
  if (ancho / alto < aspecto) ancho = alto * aspecto;
  else alto = ancho / aspecto;

  // Si se pasó del tamaño de la imagen, encoger manteniendo la proporción.
  const exceso = Math.max(ancho / origenAncho, alto / origenAlto, 1);
  ancho /= exceso;
  alto /= exceso;

  // Mismo centro que el recuadro original, empujado hacia dentro si toca.
  const centroX = (recorte.x + recorte.ancho / 2) * origenAncho;
  const centroY = (recorte.y + recorte.alto / 2) * origenAlto;
  const x = Math.min(Math.max(centroX - ancho / 2, 0), origenAncho - ancho);
  const y = Math.min(Math.max(centroY - alto / 2, 0), origenAlto - alto);

  return {
    x: seis(x / origenAncho),
    y: seis(y / origenAlto),
    ancho: seis(ancho / origenAncho),
    alto: seis(alto / origenAlto),
  };
}

export type Transformacion = {
  /** Ancho al que hay que escalar la imagen completa. */
  ancho: number;
  alto: number;
  /** Desplazamiento a aplicar como margen negativo. */
  offsetX: number;
  offsetY: number;
  /** El recuadro ya conformado, que es el que realmente se muestra. */
  recorte: Recorte;
};

/**
 * Escala y desplaza la imagen completa para que el recuadro ocupe la caja
 * destino **exactamente**, sin recorte adicional.
 *
 * Antes esto hacía un `cover` (`Math.max` de las dos escalas + centrado), y
 * como el recuadro venía de proporción libre eso cortaba un segundo trozo: lo
 * que la usuaria ajustaba no era lo que salía publicado. Ahora el recuadro se
 * conforma primero a la proporción del destino y la escala es una sola.
 */
export function calcularTransformacion(
  recorte: Recorte,
  origenAncho: number,
  origenAlto: number,
  destinoAncho: number,
  destinoAlto: number,
): Transformacion {
  const conformado = conformarAspecto(
    recorte,
    origenAncho,
    origenAlto,
    destinoAncho / destinoAlto,
  );

  // Una sola escala: por construcción vale igual medida por ancho o por alto.
  const escala = destinoAncho / (conformado.ancho * origenAncho);

  return {
    ancho: Math.round(origenAncho * escala),
    alto: Math.round(origenAlto * escala),
    offsetX: Math.round(conformado.x * origenAncho * escala),
    offsetY: Math.round(conformado.y * origenAlto * escala),
    recorte: conformado,
  };
}

/**
 * Ancho y alto de un PNG o JPEG leyendo las cabeceras. Evita meter una
 * dependencia de imágenes solo para esto.
 */
export function medidasImagen(buffer: Buffer): { ancho: number; alto: number } | null {
  // PNG: firma de 8 bytes y luego IHDR con ancho/alto en big-endian.
  if (
    buffer.length >= 24 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
  }

  // JPEG: recorremos los marcadores hasta un SOF (que trae las dimensiones).
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marcador = buffer[i + 1];
      // Relleno y marcadores sin carga útil.
      if (marcador === 0xff || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
        i += 2;
        continue;
      }
      const longitud = buffer.readUInt16BE(i + 2);
      const esSof =
        marcador >= 0xc0 &&
        marcador <= 0xcf &&
        marcador !== 0xc4 && // tablas Huffman
        marcador !== 0xc8 &&
        marcador !== 0xcc; // definición aritmética
      if (esSof) {
        return { alto: buffer.readUInt16BE(i + 5), ancho: buffer.readUInt16BE(i + 7) };
      }
      i += 2 + longitud;
    }
  }

  return null;
}
