import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Desglose, filasDesglose } from "@/components/desglose";
import { BotonHistoria } from "@/components/boton-historia";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatearCOP } from "@/lib/cotizador";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detalle · Cotizador" };

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default async function DetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await prisma.cotizacion.findUnique({ where: { id } });
  if (!c) notFound();

  const snapshot = (c.desglose ?? {}) as Record<string, unknown>;
  const trmVigencia = typeof snapshot.trm_vigencia === "string" ? snapshot.trm_vigencia : null;

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <Link
        href="/historial"
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
              <p className="text-muted-foreground mt-1 text-xs">
                No incluido en el precio publicado.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <BotonHistoria id={c.id} nombre={c.nombre} className="mt-4" />
    </div>
  );
}
