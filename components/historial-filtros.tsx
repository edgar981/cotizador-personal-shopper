"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  construirHref,
  PERIODO_POR_DEFECTO,
  PERIODOS,
  type FiltrosHistorial,
  type Periodo,
} from "@/lib/historial-filtros";
import { cn } from "@/lib/utils";

/** Espera antes de navegar mientras se escribe, para no pedir por cada tecla. */
const ESPERA_MS = 300;

function etiquetaPeriodo(periodo: Periodo) {
  return PERIODOS.find((p) => p.valor === periodo)?.etiqueta ?? periodo;
}

export function HistorialFiltros({
  filtros,
  categorias,
}: {
  filtros: FiltrosHistorial;
  categorias: string[];
}) {
  const router = useRouter();
  const { q, categoria, periodo } = filtros;
  const [texto, setTexto] = useState(q);

  // Si `q` cambia por fuera (botón atrás, "Limpiar filtros"), el input se pone
  // al día. Se ajusta en render y no en un efecto para no encadenar renders
  // (patrón "You Might Not Need an Effect").
  const [qVisto, setQVisto] = useState(q);
  if (q !== qVisto) {
    setQVisto(q);
    setTexto(q);
  }

  // Se navega al soltar el teclado, no en cada tecla. Las dependencias son
  // primitivas: `filtros` es un objeto nuevo en cada render del servidor y
  // reiniciaría el temporizador sin motivo.
  useEffect(() => {
    if (texto.trim() === q) return;
    const id = setTimeout(() => {
      // `construirHref` omite el límite: cambiar de filtro vuelve al primer
      // lote, porque quedarse en `limite=120` pediría filas que ya no interesan.
      router.replace(construirHref({ q, categoria, periodo }, { q: texto }), { scroll: false });
    }, ESPERA_MS);
    return () => clearTimeout(id);
  }, [texto, q, categoria, periodo, router]);

  function irA(cambios: Partial<FiltrosHistorial>) {
    router.replace(construirHref(filtros, cambios), { scroll: false });
  }

  // El contador y los chips cuentan lo que vive en el panel. La búsqueda no
  // suma: está siempre a la vista y se borra con su propia X.
  const activos = (categoria ? 1 : 0) + (periodo !== PERIODO_POR_DEFECTO ? 1 : 0);

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre…"
            type="search"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Buscar por nombre de producto"
            // Se mantiene `type="search"` por el teclado de búsqueda en iOS,
            // pero se oculta la X nativa de WebKit: ya hay una propia y salían
            // las dos juntas.
            className="h-11 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:[-webkit-appearance:none]"
          />
          {texto ? (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                irA({ q: "" });
              }}
              className="text-muted-foreground absolute top-1/2 right-2 flex size-7 -translate-y-1/2 touch-manipulation items-center justify-center rounded-md active:opacity-60"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">Borrar búsqueda</span>
            </button>
          ) : null}
        </div>

        <PanelFiltros
          filtros={filtros}
          categorias={categorias}
          activos={activos}
          onAplicar={irA}
        />
      </div>

      {activos ? (
        <div className="flex flex-wrap gap-2">
          {categoria ? (
            <ChipActivo etiqueta={categoria} onQuitar={() => irA({ categoria: "" })} />
          ) : null}
          {periodo !== PERIODO_POR_DEFECTO ? (
            <ChipActivo
              etiqueta={etiquetaPeriodo(periodo)}
              onQuitar={() => irA({ periodo: PERIODO_POR_DEFECTO })}
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

function PanelFiltros({
  filtros,
  categorias,
  activos,
  onAplicar,
}: {
  filtros: FiltrosHistorial;
  categorias: string[];
  activos: number;
  onAplicar: (cambios: Partial<FiltrosHistorial>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // Borrador: dentro del panel nada se aplica hasta tocar "Aplicar". Así
  // cerrar sin aplicar deja todo como estaba.
  const [borrador, setBorrador] = useState({
    categoria: filtros.categoria,
    periodo: filtros.periodo,
  });

  function cambiarApertura(valor: boolean) {
    // Al abrir se resincroniza con lo aplicado: evita arrastrar un borrador
    // viejo si los filtros cambiaron desde los chips.
    if (valor) setBorrador({ categoria: filtros.categoria, periodo: filtros.periodo });
    setAbierto(valor);
  }

  return (
    <Sheet open={abierto} onOpenChange={cambiarApertura}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={activos ? "default" : "outline"}
          className="h-11 shrink-0 touch-manipulation"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {activos ? `Filtros · ${activos}` : "Filtros"}
        </Button>
      </SheetTrigger>

      <SheetContent aria-describedby={undefined}>
        <SheetTitle>Filtros</SheetTitle>

        {/* Scroll solo aquí dentro: el pie con las acciones queda siempre fijo. */}
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {categorias.length ? (
            <Grupo
              etiqueta="Categoría"
              opciones={[
                { valor: "", etiqueta: "Todas" },
                ...categorias.map((c) => ({ valor: c, etiqueta: c })),
              ]}
              activo={borrador.categoria}
              onElegir={(categoria) => setBorrador((p) => ({ ...p, categoria }))}
            />
          ) : null}

          <Grupo
            etiqueta="Período"
            opciones={PERIODOS.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta }))}
            activo={borrador.periodo}
            onElegir={(periodo) =>
              setBorrador((p) => ({ ...p, periodo: periodo as Periodo }))
            }
          />
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 touch-manipulation"
            onClick={() => setBorrador({ categoria: "", periodo: PERIODO_POR_DEFECTO })}
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
              key={opcion.valor || "__todas__"}
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
