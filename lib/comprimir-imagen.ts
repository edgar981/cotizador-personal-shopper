"use client";

/**
 * Compresión en el cliente antes de subir. Las capturas de iPhone pesan varios
 * MB y no hace falta esa resolución.
 *
 * 2000px y no menos porque de esta misma imagen sale el recorte de la foto del
 * producto: si la foto ocupa ~40% del ancho, quedan ~800px para una caja de
 * 952px en la historia. Bajar de aquí se nota borroso al publicar.
 */

const LADO_MAXIMO = 2000;
const CALIDAD_JPEG = 0.85;
export const MAX_BYTES_ENTRADA = 10 * 1024 * 1024;

const TIPOS_ACEPTADOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export class ImagenInvalida extends Error {}

export type ImagenComprimida = {
  blob: Blob;
  /** Siempre "image/jpeg" tras la compresión. */
  mediaType: "image/jpeg";
  base64: string;
  ancho: number;
  alto: number;
};

function esTipoAceptado(tipo: string, nombre: string): boolean {
  if ((TIPOS_ACEPTADOS as readonly string[]).includes(tipo)) return true;
  // Safari a veces entrega HEIC con type vacío; caemos a la extensión.
  return !tipo && /\.(jpe?g|png|webp|heic|heif)$/i.test(nombre);
}

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new ImagenInvalida("No pude leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    // Pasa sobre todo con HEIC: el canvas del navegador no lo decodifica.
    img.onerror = () =>
      rechazar(new ImagenInvalida("No pude leer esta imagen, intenta con una captura de pantalla"));
    img.src = src;
  });
}

/**
 * Redimensiona el lado mayor a 1600px y exporta JPEG ~0.85.
 * Lanza `ImagenInvalida` con un mensaje mostrable si no se puede procesar.
 */
export async function comprimirImagen(archivo: File): Promise<ImagenComprimida> {
  if (!esTipoAceptado(archivo.type, archivo.name)) {
    throw new ImagenInvalida("Ese archivo no es una imagen que pueda leer (usa JPG o PNG).");
  }
  if (archivo.size > MAX_BYTES_ENTRADA) {
    throw new ImagenInvalida("La imagen pesa más de 10MB. Intenta con una captura más liviana.");
  }

  const dataUrl = await leerComoDataUrl(archivo);
  const img = await cargarImagen(dataUrl);

  if (!img.naturalWidth || !img.naturalHeight) {
    throw new ImagenInvalida("No pude leer esta imagen, intenta con una captura de pantalla");
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
  const alto = Math.max(1, Math.round(img.naturalHeight * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagenInvalida("No pude procesar esta imagen en este navegador.");

  // Fondo blanco: los PNG con transparencia quedarían negros en JPEG.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(img, 0, 0, ancho, alto);

  const blob = await new Promise<Blob | null>((resolver) =>
    canvas.toBlob(resolver, "image/jpeg", CALIDAD_JPEG),
  );
  if (!blob || !blob.size) {
    throw new ImagenInvalida("No pude leer esta imagen, intenta con una captura de pantalla");
  }

  const base64 = await blobABase64(blob);
  return { blob, mediaType: "image/jpeg", base64, ancho, alto };
}

async function blobABase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  }
  return btoa(binario);
}
