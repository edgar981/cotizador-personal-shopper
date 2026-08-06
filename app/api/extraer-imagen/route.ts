import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { obtenerSettings } from "@/lib/settings";
import { extraerDeCaptura, MIME_PERMITIDOS, type MimePermitido } from "@/lib/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~10MB de imagen ≈ 13.4MB en base64. */
const MAX_BASE64 = 14 * 1024 * 1024;

function esMimePermitido(valor: unknown): valor is MimePermitido {
  return typeof valor === "string" && (MIME_PERMITIDOS as readonly string[]).includes(valor);
}

export async function POST(request: Request) {
  if (!(await obtenerSesion())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let cuerpo: { imagen_base64?: unknown; media_type?: unknown };
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { imagen_base64: imagen, media_type: mediaType } = cuerpo;

  if (typeof imagen !== "string" || !imagen) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  }
  if (imagen.length > MAX_BASE64) {
    return NextResponse.json({ error: "La imagen es demasiado grande" }, { status: 413 });
  }
  if (!esMimePermitido(mediaType)) {
    return NextResponse.json({ error: "Formato de imagen no soportado" }, { status: 400 });
  }

  const settings = await obtenerSettings();
  const categorias = Object.keys(settings.pesos_categoria);

  // Nunca bloquea el flujo: si falla, devuelve campos vacíos.
  const producto = await extraerDeCaptura(imagen, mediaType, categorias);
  const encontroAlgo = Object.values(producto).some((valor) => valor !== null);

  return NextResponse.json({ ...producto, encontroAlgo });
}
