import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Desglose, filasDesglose } from "@/components/desglose";
import { BotonHistoria } from "@/components/boton-historia";
import { EncargoForm, type ValoresEncargo } from "@/components/encargo-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatearCOP } from "@/lib/cotizador";
import {
  DESTINO_POR_DEFECTO,
  enviosSugeridos,
  esTerminal,
  etiquetaDestino,
  etiquetaEstado,
} from "@/lib/encargos";
import { construirHref, leerFiltros, type ParamsHistorial } from "@/lib/historial-filtros";
import { prisma } from "@/lib/prisma";
import { obtenerSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detalle · Cotizador" };

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default async function DetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsHistorial>;
}) {
  const { id } = await params;
  const [c, settings] = await Promise.all([
    prisma.cotizacion.findUnique({
      where: { id },
      // Los encargos de esta cotización: una misma publicación puede tener
      // varios clientes, cada uno con su talla y su destino.
      include: { encargos: { orderBy: { createdAt: "asc" } } },
    }),
    obtenerSettings(),
  ]);
  if (!c) notFound();

  // Los filtros llegan colgados del enlace que trajo hasta acá: volver devuelve
  // a la misma vista filtrada y no al historial completo. Se parsean con el
  // mismo `leerFiltros` del listado, así un parámetro inválido no se propaga.
  const { filtros, limite } = leerFiltros(await searchParams);
  const hrefVolver = construirHref(filtros, {}, limite);

  const snapshot = (c.desglose ?? {}) as Record<string, unknown>;
  const trmVigencia = typeof snapshot.trm_vigencia === "string" ? snapshot.trm_vigencia : null;

  // El pct sale del snapshot, no de la config vigente: una cotización vieja
  // debe mostrar la comisión que tenía entonces.
  const comisionSnapshot = (snapshot.comision ?? {}) as Record<string, unknown>;
  const comisionPct =
    typeof comisionSnapshot.pct === "number" ? comisionSnapshot.pct : null;

  // El envío se pre-llena con la zona que corresponde al destino; el precio,
  // con el publicado. Los dos quedan editables y se guardan como snapshot del
  // encargo: si la cotización se regenera con otra TRM, no lo arrastra.
  const envios = enviosSugeridos(settings.zonas_envio, c.peso_lb);
  const inicial: ValoresEncargo = {
    cliente_nombre: "",
    cliente_doc: "",
    cliente_tel: "",
    cliente_notas: "",
    talla: "",
    color: "",
    cantidad: "1",
    destino_tipo: DESTINO_POR_DEFECTO,
    destino_ciudad: "",
    destino_dir: "",
    precio_cop: String(c.precio_cop),
    envio_cop: envios[DESTINO_POR_DEFECTO]?.toString() ?? "",
    abono_cop: "",
    guia: "",
    notas: "",
  };

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <Link
        href={hrefVolver}
        className="text-muted-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Historial
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {c.captura_url || c.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.captura_url ?? c.imagen_url ?? ""}
              alt=""
              className="bg-muted mx-auto max-h-56 rounded-lg object-contain"
            />
          ) : null}

          <div>
            <h1 className="text-lg font-semibold leading-snug">{c.nombre}</h1>
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="font-normal">
                {c.categoria}
              </Badge>
              <span>{formatoFecha.format(c.createdAt)}</span>
            </div>
            {c.talla_notas ? (
              <p className="text-muted-foreground mt-2 text-sm">{c.talla_notas}</p>
            ) : null}
          </div>

          {c.url ? (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground inline-flex items-center gap-1.5 text-xs underline underline-offset-4"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Ver en la tienda
            </a>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-6">
          <p className="text-muted-foreground mb-3 text-xs uppercase tracking-wide">
            Desglose al momento de cotizar
          </p>
          <Desglose
            filas={filasDesglose({
              precio_usd: c.precio_usd,
              tax_usd: c.tax_usd,
              flete_usd: c.flete_usd,
              peso_lb: c.peso_lb,
              trm_oficial: c.trm_oficial,
              trm_aplicada: c.trm_aplicada,
              costo_cop: c.costo_cop,
              margen_cop: c.margen_cop,
              trm_vigencia: trmVigencia,
              comision_pct: comisionPct,
              comision_cop: c.comision_cop,
              margen_neto_cop: c.margen_neto_cop,
            })}
          />
          <div className="mt-4 border-t pt-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Precio publicado
            </p>
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {formatearCOP(c.precio_cop)}
            </p>
          </div>

          {/* Estimado congelado al cotizar: si las tarifas cambiaron después,
              esta cotización conserva el suyo. */}
          {c.zona_envio && c.envio_nacional_cop !== null ? (
            <div className="mt-4 border-t pt-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Envío nacional a {c.zona_envio}
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatearCOP(c.envio_nacional_cop)}
              </p>
              {/* Suma de referencia sobre el snapshot guardado, igual que en la
                  pantalla de cotizar: `precio_cop` no la conoce. */}
              <p className="mt-2 text-sm">
                Total con envío a {c.zona_envio}:{" "}
                <span className="font-semibold tabular-nums">
                  {formatearCOP(c.precio_cop + c.envio_nacional_cop)}
                </span>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                El envío no está incluido en el precio publicado.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Encargos</p>
            {c.encargos.length ? (
              <span className="text-muted-foreground text-xs">
                {c.encargos.length === 1 ? "1 encargo" : `${c.encargos.length} encargos`}
              </span>
            ) : null}
          </div>

          {c.encargos.length ? (
            <ul className="divide-border -my-1 divide-y">
              {c.encargos.map((encargo) => (
                <li key={encargo.id}>
                  <Link
                    href={`/encargos/${encargo.id}`}
                    className="flex touch-manipulation items-center gap-3 py-3 active:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {encargo.cliente_nombre}
                      </span>
                      <span className="text-muted-foreground mt-1 block truncate text-xs">
                        {[
                          encargo.talla ? `Talla ${encargo.talla}` : null,
                          encargo.cantidad > 1 ? `×${encargo.cantidad}` : null,
                          etiquetaDestino(encargo.destino_tipo, encargo.destino_ciudad),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Badge
                      variant={esTerminal(encargo.estado) ? "outline" : "secondary"}
                      className="shrink-0 font-normal"
                    >
                      {etiquetaEstado(encargo.estado)}
                    </Badge>
                    <ChevronRight
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nadie ha pedido este producto todavía.
            </p>
          )}

          <EncargoForm modo="crear" cotizacionId={c.id} inicial={inicial} envios={envios} />
        </CardContent>
      </Card>

      <BotonHistoria id={c.id} nombre={c.nombre} className="mt-4" />
    </div>
  );
}
