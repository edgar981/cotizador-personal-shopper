import { NextResponse } from "next/server";
import { leerDatosDeMensaje, MAX_MENSAJE, sugerirDestino } from "@/lib/leer-cliente";
import { obtenerSesion } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lee el mensaje que el cliente mandó por WhatsApp y devuelve los campos del
 * encargo. La clave de la API vive solo acá, igual que en /api/extraer-imagen.
 */
export async function POST(request: Request) {
  if (!(await obtenerSesion())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let cuerpo: { texto?: unknown };
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
  if (!texto) {
    return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 });
  }
  if (texto.length > MAX_MENSAJE) {
    return NextResponse.json({ error: "El mensaje es demasiado largo" }, { status: 413 });
  }

  // Nunca bloquea el flujo: si falla, devuelve campos vacíos y la usuaria
  // transcribe a mano con el mensaje todavía pegado en pantalla.
  const datos = await leerDatosDeMensaje(texto);
  const encontroAlgo = Object.values(datos).some((valor) => valor !== null);

  return NextResponse.json({
    ...datos,
    destino_sugerido: sugerirDestino(datos.destino_ciudad, datos.destino_dir),
    encontroAlgo,
  });
}
