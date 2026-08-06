import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatearCOP } from "@/lib/cotizador";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historial · Cotizador" };

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

export default async function HistorialPage() {
  const cotizaciones = await prisma.cotizacion.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      nombre: true,
      imagen_url: true,
      captura_url: true,
      categoria: true,
      precio_cop: true,
      createdAt: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Historial</h1>

      {cotizaciones.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          Todavía no has guardado ninguna cotización.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {cotizaciones.map((c) => (
            <li key={c.id}>
              <Link href={`/historial/${c.id}`} className="flex items-center gap-3 py-3">
                <span className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                  {c.captura_url || c.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.captura_url ?? c.imagen_url ?? ""}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">sin foto</span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.nombre}</span>
                  <span className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                    <Badge variant="secondary" className="font-normal">
                      {c.categoria}
                    </Badge>
                    {formatoFecha.format(c.createdAt)}
                  </span>
                </span>

                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatearCOP(c.precio_cop)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
