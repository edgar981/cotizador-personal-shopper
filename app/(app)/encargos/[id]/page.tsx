import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncargoEstado } from "@/components/encargo-estado";
import { EncargoForm, type ValoresEncargo } from "@/components/encargo-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatearCOP } from "@/lib/cotizador";
import {
  construirHrefEncargos,
  enviosSugeridos,
  esDestino,
  esTerminal,
  etiquetaDestino,
  etiquetaEstado,
  leerFiltrosEncargos,
  MARCA_POR_ESTADO,
  DESTINO_POR_DEFECTO,
  type ParamsEncargos,
} from "@/lib/encargos";
import { prisma } from "@/lib/prisma";
import { obtenerSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Encargo · Cotizador" };

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default async function EncargoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ParamsEncargos>;
}) {
  const { id } = await params;
  const [encargo, settings] = await Promise.all([
    prisma.encargo.findUnique({
      where: { id },
      include: {
        cotizacion: {
          select: {
            id: true,
            nombre: true,
            imagen_url: true,
            captura_url: true,
            peso_lb: true,
          },
        },
      },
    }),
    obtenerSettings(),
  ]);
  if (!encargo) notFound();

  // Los filtros llegan colgados del enlace que trajo hasta acá: volver devuelve
  // a la misma vista filtrada y no a la lista completa.
  const { filtros, limite } = leerFiltrosEncargos(await searchParams);
  const hrefVolver = construirHrefEncargos(filtros, {}, limite);

  const imagen = encargo.cotizacion.captura_url ?? encargo.cotizacion.imagen_url ?? null;
  const envios = enviosSugeridos(settings.zonas_envio, encargo.cotizacion.peso_lb);

  // Un destino desconocido (fila editada a mano) no debe romper el formulario.
  const destino = esDestino(encargo.destino_tipo) ? encargo.destino_tipo : DESTINO_POR_DEFECTO;

  const inicial: ValoresEncargo = {
    cliente_nombre: encargo.cliente_nombre,
    cliente_doc: encargo.cliente_doc ?? "",
    cliente_tel: encargo.cliente_tel ?? "",
    cliente_notas: encargo.cliente_notas ?? "",
    talla: encargo.talla ?? "",
    color: encargo.color ?? "",
    cantidad: String(encargo.cantidad),
    destino_tipo: destino,
    destino_ciudad: encargo.destino_ciudad ?? "",
    destino_dir: encargo.destino_dir ?? "",
    precio_cop: String(encargo.precio_cop),
    envio_cop: encargo.envio_cop?.toString() ?? "",
    abono_cop: encargo.abono_cop?.toString() ?? "",
    guia: encargo.guia ?? "",
    notas: encargo.notas ?? "",
  };

  // Marcas escritas hasta ahora, en el orden del recorrido. "Confirmado" sale
  // de `createdAt`: no tiene columna propia.
  const marcas: Array<{ etiqueta: string; fecha: string }> = [
    { etiqueta: "Confirmado", fecha: formatoFecha.format(encargo.createdAt) },
    ...Object.entries(MARCA_POR_ESTADO)
      .map(([estado, campo]) => {
        const valor = encargo[campo];
        return valor ? { etiqueta: etiquetaEstado(estado), fecha: formatoFecha.format(valor) } : null;
      })
      .filter((marca) => marca !== null),
  ];

  const datos: Array<{ etiqueta: string; valor: string }> = [
    { etiqueta: "Destino", valor: etiquetaDestino(encargo.destino_tipo, encargo.destino_ciudad) },
    ...(encargo.destino_dir ? [{ etiqueta: "Dirección", valor: encargo.destino_dir }] : []),
    ...(encargo.talla ? [{ etiqueta: "Talla", valor: encargo.talla }] : []),
    ...(encargo.color ? [{ etiqueta: "Color", valor: encargo.color }] : []),
    ...(encargo.cantidad > 1 ? [{ etiqueta: "Cantidad", valor: String(encargo.cantidad) }] : []),
    { etiqueta: "Precio", valor: formatearCOP(encargo.precio_cop) },
    ...(encargo.cantidad > 1
      ? [{ etiqueta: "Total", valor: formatearCOP(encargo.precio_cop * encargo.cantidad) }]
      : []),
    ...(encargo.envio_cop !== null
      ? [{ etiqueta: "Envío", valor: formatearCOP(encargo.envio_cop) }]
      : []),
    ...(encargo.abono_cop !== null
      ? [{ etiqueta: "Abono", valor: formatearCOP(encargo.abono_cop) }]
      : []),
    ...(encargo.guia ? [{ etiqueta: "Guía", valor: encargo.guia }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <Link
        href={hrefVolver}
        className="text-muted-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Encargos
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center gap-3">
            <span className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              {imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagen} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-muted-foreground text-xs">sin foto</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg leading-snug font-semibold">{encargo.cliente_nombre}</h1>
              <p className="text-muted-foreground mt-1 truncate text-sm">
                {encargo.cotizacion.nombre}
              </p>
            </div>
            <Badge
              variant={esTerminal(encargo.estado) ? "outline" : "secondary"}
              className="shrink-0 font-normal"
            >
              {etiquetaEstado(encargo.estado)}
            </Badge>
          </div>

          {encargo.cliente_doc ? (
            <p className="text-muted-foreground text-sm">CC {encargo.cliente_doc}</p>
          ) : null}

          {encargo.cliente_tel ? (
            <a
              href={`tel:${encargo.cliente_tel.replace(/\s+/g, "")}`}
              className="text-muted-foreground text-sm underline underline-offset-4"
            >
              {encargo.cliente_tel}
            </a>
          ) : null}

          {encargo.cliente_notas ? (
            <p className="text-muted-foreground text-sm">{encargo.cliente_notas}</p>
          ) : null}

          <Link
            href={`/historial/${encargo.cotizacion.id}`}
            className="text-muted-foreground inline-flex items-center gap-1.5 text-xs underline underline-offset-4"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Ver la cotización
          </Link>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-6">
          <p className="text-muted-foreground mb-3 text-xs tracking-wide uppercase">
            Datos del encargo
          </p>
          <dl className="divide-border divide-y text-sm">
            {datos.map((fila) => (
              <div key={fila.etiqueta} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground shrink-0">{fila.etiqueta}</dt>
                <dd className="min-w-0 text-right font-medium tabular-nums">{fila.valor}</dd>
              </div>
            ))}
          </dl>

          {encargo.notas ? (
            <p className="text-muted-foreground mt-4 border-t pt-4 text-sm">{encargo.notas}</p>
          ) : null}

          {/* Los valores son un snapshot del momento de confirmar: si la
              cotización se regenera con otra TRM, el encargo no se mueve. */}
          <p className="text-muted-foreground mt-4 text-xs">
            Precio y envío son los que se le prometieron al cliente; no cambian si la
            cotización se actualiza.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Estado</p>
          <EncargoEstado id={encargo.id} estado={encargo.estado} />

          <dl className="divide-border divide-y text-sm">
            {marcas.map((marca) => (
              <div key={marca.etiqueta} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{marca.etiqueta}</dt>
                <dd className="text-muted-foreground text-xs">{marca.fecha}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="mt-4">
        <EncargoForm modo="editar" encargoId={encargo.id} inicial={inicial} envios={envios} />
      </div>
    </div>
  );
}
