import { NextResponse } from "next/server";
import { renderizarHistoriaDoble, type ProductoHistoria } from "@/lib/historia-doble";
import { prisma } from "@/lib/prisma";
import { normalizarRecorte } from "@/lib/recorte";
import { obtenerSesion } from "@/lib/session";
import { obtenerSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Con tres productos el precio deja de leerse, y el precio es lo que vende. */
const PRODUCTOS = 2;

/** `GET /api/historia-doble?ids=<id1>,<id2>` */
export async function GET(request: Request) {
  if (!(await obtenerSesion())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const crudo = new URL(request.url).searchParams.get("ids") ?? "";
  // `Set` para que mandar el mismo id dos veces no cuente como dos productos.
  const ids = [...new Set(crudo.split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length !== PRODUCTOS) {
    return NextResponse.json(
      { error: "Elige exactamente 2 cotizaciones distintas." },
      { status: 400 },
    );
  }

  const filas = await prisma.cotizacion.findMany({ where: { id: { in: ids } } });
  if (filas.length !== PRODUCTOS) {
    return NextResponse.json({ error: "No existe alguna de esas cotizaciones" }, { status: 404 });
  }

  // Respetamos el orden en que la usuaria las eligió, no el de la consulta.
  const ordenadas = ids.map((id) => filas.find((fila) => fila.id === id)!);

  const productos = ordenadas.map(
    (c): ProductoHistoria => ({
      nombre: c.nombre,
      precio_cop: c.precio_cop,
      talla_notas: c.talla_notas,
      historia_url: c.historia_url,
      historia_recorte: normalizarRecorte(c.historia_recorte),
      captura_url: c.captura_url,
      recorte: normalizarRecorte(c.recorte),
      imagen_url: c.imagen_url,
    }),
  ) as [ProductoHistoria, ProductoHistoria];

  // La marca sale del snapshot de la primera, como en la historia simple, para
  // que una cotización vieja se regenere con la marca que tenía entonces.
  const settings = await obtenerSettings();
  const snapshot = (ordenadas[0].desglose ?? {}) as Record<string, unknown>;

  return renderizarHistoriaDoble({
    productos,
    ig_handle: (snapshot.ig_handle as string) || settings.ig_handle,
    lema: (snapshot.lema as string) || settings.lema,
    color_marca: (snapshot.color_marca as string) || settings.color_marca,
  });
}
