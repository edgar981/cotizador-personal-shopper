import { formatearCOP, formatearTRM, formatearUSD } from "@/lib/cotizador";
import { cn } from "@/lib/utils";

export type FilaDesglose = {
  etiqueta: string;
  valor: string;
  nota?: string;
};

export function filasDesglose(d: {
  precio_usd: number;
  tax_usd: number;
  flete_usd: number;
  peso_lb: number;
  trm_oficial: number;
  trm_aplicada: number;
  costo_cop: number;
  margen_cop: number;
  trm_vigencia?: string | null;
  trm_desde_cache?: boolean;
}): FilaDesglose[] {
  return [
    { etiqueta: "Producto", valor: formatearUSD(d.precio_usd) },
    { etiqueta: "Sales tax", valor: formatearUSD(d.tax_usd) },
    {
      etiqueta: "Flete casillero",
      valor: formatearUSD(d.flete_usd),
      nota: `${d.peso_lb} lb`,
    },
    {
      etiqueta: "TRM aplicada",
      valor: formatearTRM(d.trm_aplicada),
      nota: [
        d.trm_vigencia ? `TRM del ${d.trm_vigencia}` : null,
        d.trm_desde_cache ? "valor guardado" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    { etiqueta: "Costo aterrizado", valor: formatearCOP(d.costo_cop) },
    { etiqueta: "Tu margen", valor: formatearCOP(d.margen_cop) },
  ];
}

export function Desglose({
  filas,
  className,
}: {
  filas: FilaDesglose[];
  className?: string;
}) {
  return (
    <dl className={cn("divide-border divide-y text-sm", className)}>
      {filas.map((fila) => (
        <div key={fila.etiqueta} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted-foreground">
            {fila.etiqueta}
            {fila.nota ? (
              <span className="text-muted-foreground/70 ml-1.5 text-xs">({fila.nota})</span>
            ) : null}
          </dt>
          <dd className="font-medium tabular-nums">{fila.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
