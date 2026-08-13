import type { Prisma } from "@/app/generated/prisma/client";
import { HistorialLista, type ItemHistorial } from "@/components/historial-lista";
import {
  construirHref,
  construirQuery,
  leerFiltros,
  LIMITE_MAXIMO,
  LOTE_HISTORIAL,
  rangoPeriodo,
  type ParamsHistorial,
} from "@/lib/historial-filtros";
import { prisma } from "@/lib/prisma";
import { obtenerSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historial · Cotizador" };

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<ParamsHistorial>;
}) {
  const { filtros, limite } = leerFiltros(await searchParams);

  // Los tres criterios se aplican en SQL. No se traen todas las filas para
  // filtrarlas en el cliente: ya hay cientos y crecen ~100 por semana.
  const rango = rangoPeriodo(filtros.periodo, new Date());
  const where: Prisma.CotizacionWhereInput = {
    // `mode: "insensitive"` genera ILIKE. No usamos unaccent: la extensión está
    // disponible en Neon pero no instalada, y habilitarla es DDL (migración).
    // Los nombres vienen de retailers de US y casi nunca traen tildes.
    ...(filtros.q ? { nombre: { contains: filtros.q, mode: "insensitive" } } : {}),
    ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(rango.gte || rango.lt
      ? {
          createdAt: {
            ...(rango.gte ? { gte: rango.gte } : {}),
            ...(rango.lt ? { lt: rango.lt } : {}),
          },
        }
      : {}),
  };

  const [cotizaciones, total, settings] = await Promise.all([
    prisma.cotizacion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limite,
      select: {
        id: true,
        nombre: true,
        imagen_url: true,
        captura_url: true,
        categoria: true,
        precio_cop: true,
        createdAt: true,
      },
    }),
    prisma.cotizacion.count({ where }),
    obtenerSettings(),
  ]);

  // La fecha se formatea aquí: así el cliente no arrastra la zona de Bogotá.
  const items: ItemHistorial[] = cotizaciones.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    imagen: c.captura_url ?? c.imagen_url ?? null,
    categoria: c.categoria,
    precio_cop: c.precio_cop,
    fecha: formatoFecha.format(c.createdAt),
  }));

  // Los chips salen de la config, no de una lista fija en código.
  const categorias = Object.keys(settings.pesos_categoria).sort();

  // Cada "Cargar más" pide un lote más desde el principio, así que el tope
  // acota el costo de la consulta. Al llegar ahí no se ofrece otro lote: un
  // botón que no carga nada es peor que no tenerlo. Para llegar más atrás están
  // los filtros, que es justo para lo que sirven.
  const hayMas = items.length < total;
  const enElTope = limite >= LIMITE_MAXIMO;

  // Los filtros viajan colgados del enlace al detalle para que esa pantalla
  // pueda devolver exactamente a esta vista, incluido el lote ya cargado.
  const query = construirQuery(filtros, {}, limite);

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <HistorialLista
        items={items}
        filtros={filtros}
        categorias={categorias}
        total={total}
        hrefCargarMas={hayMas && !enElTope ? construirHref(filtros, {}, limite + LOTE_HISTORIAL) : null}
        enElTope={hayMas && enElTope}
        queryFiltros={query ? `?${query}` : ""}
      />
    </div>
  );
}
