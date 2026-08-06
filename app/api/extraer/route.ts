import { NextResponse } from "next/server";
import { esUrlHttpValida, extraerProducto } from "@/lib/extraer";
import { obtenerSesion } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await obtenerSesion())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let url: unknown;
  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (typeof url !== "string" || !esUrlHttpValida(url)) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  // Nunca bloquea el flujo: si falla, devuelve campos vacíos.
  const producto = await extraerProducto(url);
  const encontroAlgo = Boolean(producto.nombre || producto.imagen_url || producto.precio_usd);

  return NextResponse.json({ ...producto, encontroAlgo });
}
