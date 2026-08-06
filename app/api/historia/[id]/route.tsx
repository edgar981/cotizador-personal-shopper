import { NextResponse } from "next/server";
import { renderizarHistoria, type DatosHistoria } from "@/lib/historia";
import { normalizarRecorte } from "@/lib/recorte";
import { prisma } from "@/lib/prisma";
import { obtenerSesion } from "@/lib/session";
import { obtenerSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `id = "preview"` renderiza una cotización que todavía no se ha guardado. */
const ID_PREVIEW = "preview";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await obtenerSesion())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  let datos: DatosHistoria;

  if (id === ID_PREVIEW) {
    const q = new URL(request.url).searchParams;
    const settings = await obtenerSettings();
    datos = {
      nombre: q.get("nombre")?.trim() || "Producto",
      precio_cop: Number(q.get("precio_cop") ?? 0) || 0,
      historia_url: q.get("historia_url"),
      historia_recorte: leerRecorteDeQuery(q, "historia_recorte"),
      captura_url: q.get("captura_url"),
      recorte: leerRecorteDeQuery(q, "recorte"),
      imagen_url: q.get("imagen_url"),
      talla_notas: q.get("talla_notas"),
      ig_handle: settings.ig_handle,
      lema: settings.lema,
      color_marca: settings.color_marca,
    };
  } else {
    const cotizacion = await prisma.cotizacion.findUnique({ where: { id } });
    if (!cotizacion) {
      return NextResponse.json({ error: "No existe esa cotización" }, { status: 404 });
    }

    // La marca se toma del snapshot: la historia se regenera igual siempre.
    const snapshot = (cotizacion.desglose ?? {}) as Record<string, unknown>;
    const settings = await obtenerSettings();
    datos = {
      nombre: cotizacion.nombre,
      precio_cop: cotizacion.precio_cop,
      historia_url: cotizacion.historia_url,
      historia_recorte: normalizarRecorte(cotizacion.historia_recorte),
      captura_url: cotizacion.captura_url,
      recorte: normalizarRecorte(cotizacion.recorte),
      imagen_url: cotizacion.imagen_url,
      talla_notas: cotizacion.talla_notas,
      ig_handle: (snapshot.ig_handle as string) || settings.ig_handle,
      lema: (snapshot.lema as string) || settings.lema,
      color_marca: (snapshot.color_marca as string) || settings.color_marca,
    };
  }

  return renderizarHistoria(datos);
}

/** Los recortes llegan como `x,y,ancho,alto` en la previsualización. */
function leerRecorteDeQuery(q: URLSearchParams, clave: string) {
  const crudo = q.get(clave);
  if (!crudo) return null;
  const [x, y, ancho, alto] = crudo.split(",").map(Number);
  return normalizarRecorte({ x, y, ancho, alto });
}
