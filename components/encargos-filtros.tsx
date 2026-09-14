"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  construirHrefEncargos,
  DESTINOS,
  etiquetaDestino,
  FILTRO_ESTADO_POR_DEFECTO,
  FILTROS_ESTADO,
  type DestinoTipo,
  type FiltroEstado,
  type FiltrosEncargos,
} from "@/lib/encargos";
import { cn } from "@/lib/utils";

function etiquetaEstadoFiltro(estado: FiltroEstado) {
  return FILTROS_ESTADO.find((f) => f.valor === estado)?.etiqueta ?? estado;
}

export function EncargosFiltros({ filtros }: { filtros: FiltrosEncargos }) {
  const router = useRouter();

  function irA(cambios: Partial<FiltrosEncargos>) {
    // Sin límite: cambiar de filtro vuelve al primer lote, porque quedarse en
    // `limite=120` pediría filas que ya no interesan.
    router.replace(construirHrefEncargos(filtros, cambios), { scroll: false });
  }

  const activos =
    (filtros.estado !== FILTRO_ESTADO_POR_DEFECTO ? 1 : 0) + (filtros.destino ? 1 : 0);

  return (
    <div className="mb-4 flex flex-col gap-3">
      <Panel filtros={filtros} activos={activos} onAplicar={irA} />

      {activos ? (
        <div className="flex flex-wrap gap-2">
          {filtros.estado !== FILTRO_ESTADO_POR_DEFECTO ? (
            <ChipActivo
              etiqueta={etiquetaEstadoFiltro(filtros.estado)}
              onQuitar={() => irA({ estado: FILTRO_ESTADO_POR_DEFECTO })}
            />
          ) : null}
          {filtros.destino ? (
            <ChipActivo
              etiqueta={etiquetaDestino(filtros.destino)}
              onQuitar={() => irA({ destino: "" })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Chip de un filtro aplicado. La X lo quita sin abrir el panel. */
function ChipActivo({ etiqueta, onQuitar }: { etiqueta: string; onQuitar: () => void }) {
  return (
    <span className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs font-medium">
      {etiqueta}
      <button
        type="button"
        onClick={onQuitar}
        className="flex size-5 touch-manipulation items-center justify-center rounded-full active:opacity-60"
      >
        <X className="size-3" aria-hidden />
        <span className="sr-only">Quitar filtro {etiqueta}</span>
      </button>
    </span>
  );
}

function Panel({
  filtros,
  activos,
  onAplicar,
}: {
  filtros: FiltrosEncargos;
  activos: number;
  onAplicar: (cambios: Partial<FiltrosEncargos>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // Dentro del panel nada se aplica hasta tocar "Aplicar": cerrar sin aplicar
  // deja todo como estaba.
  const [borrador, setBorrador] = useState<FiltrosEncargos>(filtros);

  function cambiarApertura(valor: boolean) {
    // Al abrir se resincroniza con lo aplicado, por si cambió desde los chips.
    if (valor) setBorrador(filtros);
    setAbierto(valor);
  }

  return (
    <Sheet open={abierto} onOpenChange={cambiarApertura}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={activos ? "default" : "outline"}
          className="h-11 w-full touch-manipulation"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {activos ? `Filtros · ${activos}` : "Filtros"}
        </Button>
      </SheetTrigger>

      <SheetContent aria-describedby={undefined}>
        <SheetTitle>Filtros</SheetTitle>

        {/* Scroll solo acá dentro: el pie con las acciones queda siempre fijo. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <Grupo
            etiqueta="Estado"
            opciones={FILTROS_ESTADO.map((f) => ({ valor: f.valor, etiqueta: f.etiqueta }))}
            activo={borrador.estado}
            onElegir={(estado) =>
              setBorrador((p) => ({ ...p, estado: estado as FiltroEstado }))
            }
          />

          <Grupo
            etiqueta="Destino"
            opciones={[
              { valor: "", etiqueta: "Todos" },
              ...DESTINOS.map((d) => ({ valor: d.valor, etiqueta: d.etiqueta })),
            ]}
            activo={borrador.destino}
            onElegir={(destino) =>
              setBorrador((p) => ({ ...p, destino: destino as "" | DestinoTipo }))
            }
          />
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 touch-manipulation"
            onClick={() => setBorrador({ estado: FILTRO_ESTADO_POR_DEFECTO, destino: "" })}
          >
            Limpiar
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 touch-manipulation"
            onClick={() => {
              onAplicar(borrador);
              setAbierto(false);
            }}
          >
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Grupo({
  etiqueta,
  opciones,
  activo,
  onElegir,
}: {
  etiqueta: string;
  opciones: Array<{ valor: string; etiqueta: string }>;
  activo: string;
  onElegir: (valor: string) => void;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">{etiqueta}</p>
      {/* `flex-wrap`: las opciones bajan de línea en vez de salirse de pantalla. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={etiqueta}>
        {opciones.map((opcion) => {
          const seleccionado = opcion.valor === activo;
          return (
            <button
              key={opcion.valor || "__todos__"}
              type="button"
              onClick={() => onElegir(opcion.valor)}
              aria-pressed={seleccionado}
              className={cn(
                "touch-manipulation rounded-full border px-3 py-2 text-xs font-medium transition-colors active:opacity-60",
                seleccionado
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "text-muted-foreground",
              )}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
