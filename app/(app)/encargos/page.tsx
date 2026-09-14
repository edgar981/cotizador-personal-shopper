import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Prisma } from "@/app/generated/prisma/client";
import { EncargosFiltros } from "@/components/encargos-filtros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatearCOP } from "@/lib/cotizador";
import {
  construirHrefEncargos,
  construirQueryEncargos,
  estadosDelFiltro,
  esTerminal,
  etiquetaDestino,
  etiquetaEstado,
  hayFiltrosActivos,
  leerFiltrosEncargos,
  LIMITE_MAXIMO_ENCARGOS,
  LOTE_ENCARGOS,
  type ParamsEncargos,
} from "@/lib/encargos";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Encargos · Cotizador" };

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Bogota",
});

type ItemEncargo = {
  id: string;
  cliente_nombre: string;
  producto: string;
  imagen: string | null;
  talla: string | null;
  cantidad: number;
  destino: string;
  estado: string;
  precio_cop: number;
  fecha: string;
};

export default async function EncargosPage({
  searchParams,
}: {
  searchParams: Promise<ParamsEncargos>;
}) {
  const { filtros, limite } = leerFiltrosEncargos(await searchParams);

  // Los dos criterios se aplican en SQL, sobre los índices de `estado` y
  // `(destino_tipo, estado)`.
  const estados = estadosDelFiltro(filtros.estado);
  const where: Prisma.EncargoWhereInput = {
    ...(estados ? { estado: { in: estados } } : {}),
    ...(filtros.destino ? { destino_tipo: filtros.destino } : {}),
  };

  const [encargos, total] = await Promise.all([
    prisma.encargo.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limite,
      select: {
        id: true,
        cliente_nombre: true,
        talla: true,
        cantidad: true,
        destino_tipo: true,
        destino_ciudad: true,
        estado: true,
        precio_cop: true,
        createdAt: true,
        cotizacion: { select: { nombre: true, imagen_url: true, captura_url: true } },
      },
    }),
    prisma.encargo.count({ where }),
  ]);

  // La fecha se formatea acá: así el cliente no arrastra la zona de Bogotá.
  const items: ItemEncargo[] = encargos.map((e) => ({
    id: e.id,
    cliente_nombre: e.cliente_nombre,
    producto: e.cotizacion.nombre,
    imagen: e.cotizacion.captura_url ?? e.cotizacion.imagen_url ?? null,
    talla: e.talla,
    cantidad: e.cantidad,
    destino: etiquetaDestino(e.destino_tipo, e.destino_ciudad),
    estado: e.estado,
    precio_cop: e.precio_cop,
    fecha: formatoFecha.format(e.createdAt),
  }));

  // Lo que hay que trabajar va primero; lo entregado y lo cancelado queda
  // abajo, bajo su propio título, y solo aparece cuando el filtro lo pide.
  const activos = items.filter((item) => !esTerminal(item.estado));
  const cerrados = items.filter((item) => esTerminal(item.estado));

  // Los filtros viajan colgados del enlace al detalle para que esa pantalla
  // pueda devolver exactamente a esta vista, incluido el lote ya cargado.
  const query = construirQueryEncargos(filtros, {}, limite);
  const queryFiltros = query ? `?${query}` : "";

  const filtrando = hayFiltrosActivos(filtros);
  const hayMas = items.length < total;
  const enElTope = limite >= LIMITE_MAXIMO_ENCARGOS;

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Encargos</h1>

      <EncargosFiltros filtros={filtros} />

      {items.length === 0 ? (
        filtrando ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
            <p className="text-muted-foreground text-sm">
              Ningún encargo coincide con lo que buscas.
            </p>
            <Button asChild variant="outline" className="mt-4 h-10">
              <Link href="/encargos">Limpiar filtros</Link>
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
            Todavía no hay encargos. Se crean desde el detalle de una cotización, en el
            historial.
          </p>
        )
      ) : (
        <>
          {filtrando ? (
            <p className="text-muted-foreground mb-2 text-xs">
              {total === 1 ? "1 resultado" : `${total} resultados`}
            </p>
          ) : null}

          {/* Los títulos solo aparecen cuando hay de los dos: con una sola
              sección, un encabezado suelto es ruido. */}
          <Grupo
            titulo={cerrados.length && activos.length ? "Activos" : null}
            items={activos}
            queryFiltros={queryFiltros}
          />
          <Grupo
            titulo={cerrados.length && activos.length ? "Entregados y cancelados" : null}
            items={cerrados}
            queryFiltros={queryFiltros}
          />

          {hayMas && !enElTope ? (
            <Button asChild variant="outline" className="mt-4 h-11 w-full">
              {/* `scroll={false}` para no saltar arriba al traer el lote. */}
              <Link
                href={construirHrefEncargos(filtros, {}, limite + LOTE_ENCARGOS)}
                scroll={false}
                prefetch={false}
              >
                Cargar más ({items.length} de {total})
              </Link>
            </Button>
          ) : hayMas ? (
            <p className="text-muted-foreground mt-4 rounded-md border border-dashed px-3 py-4 text-center text-xs">
              Mostrando los {items.length} más recientes de {total}. Usa los filtros para llegar
              a los más antiguos.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  items,
  queryFiltros,
}: {
  titulo: string | null;
  items: ItemEncargo[];
  /** Query string de los filtros (con `?`) o vacía, para volver a esta vista. */
  queryFiltros: string;
}) {
  if (!items.length) return null;

  return (
    <>
      {titulo ? (
        <p className="text-muted-foreground mt-4 mb-1 text-xs tracking-wide uppercase first:mt-0">
          {titulo}
        </p>
      ) : null}
      <ul className="divide-border divide-y">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/encargos/${item.id}${queryFiltros}`}
              className="flex touch-manipulation items-center gap-3 py-3 active:opacity-60"
            >
              <span className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                {item.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imagen}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">sin foto</span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.cliente_nombre}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {item.producto}
                </span>
                <span className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <Badge
                    variant={esTerminal(item.estado) ? "outline" : "secondary"}
                    className="font-normal"
                  >
                    {etiquetaEstado(item.estado)}
                  </Badge>
                  {[
                    item.talla ? `Talla ${item.talla}` : null,
                    item.cantidad > 1 ? `×${item.cantidad}` : null,
                    item.destino,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">
                  {formatearCOP(item.precio_cop)}
                </span>
                <span className="text-muted-foreground block text-xs">{item.fecha}</span>
              </span>

              <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
