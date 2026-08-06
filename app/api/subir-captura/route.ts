import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { claveCaptura, storage } from "@/lib/storage";
import { diaBogota } from "@/lib/trm";
import { MIME_PERMITIDOS, type MimePermitido } from "@/lib/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

function esMimePermitido(valor: string): valor is MimePermitido {
  return (MIME_PERMITIDOS as readonly string[]).includes(valor);
}

export async function POST(request: Request) {
  if (!(await obtenerSesion())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let archivo: File | null;
  try {
    const datos = await request.formData();
    const valor = datos.get("archivo");
    archivo = valor instanceof File ? valor : null;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!archivo) {
    return NextResponse.json({ error: "Falta la captura" }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: "La captura pesa más de 10MB" }, { status: 413 });
  }
  if (!esMimePermitido(archivo.type)) {
    return NextResponse.json(
      { error: "Formato no soportado. Usa una captura JPG o PNG." },
      { status: 400 },
    );
  }

  try {
    const { url } = await storage.put(archivo, claveCaptura(archivo.type, diaBogota()));
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Falló la subida de la captura:", error);
    return NextResponse.json({ error: "No pude guardar la captura." }, { status: 502 });
  }
}
