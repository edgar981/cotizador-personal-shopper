"use client";

import { Check, Download, Layers, Loader2, Share2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HistorialFiltros } from "@/components/historial-filtros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { compartir, descargar, nombreArchivo, usePuedeCompartir } from "@/lib/compartir";
import { formatearCOP } from "@/lib/cotizador";
import { hayFiltrosActivos, type FiltrosHistorial } from "@/lib/historial-filtros";
import { cn } from "@/lib/utils";

export type ItemHistorial = {
  id: string;
  nombre: string;
  /** Ya resuelta en el servidor: captura si existe, si no el hotlink. */
  imagen: string | null;
  categoria: string;
  precio_cop: number;
  /** Preformateada en el servidor para no arrastrar zonas horarias al cliente. */
  fecha: string;
};

/** La historia doble lleva exactamente dos productos. */
const PRODUCTOS = 2;

export function HistorialLista({
  items,
  filtros,
  categorias,
  total,
  hrefCargarMas,
  enElTope,
  queryFiltros,
}: {
  items: ItemHistorial[];
  filtros: FiltrosHistorial;
  categorias: string[];
  /** Cuántas coinciden con los filtros, no cuántas se están mostrando. */
  total: number;
  /** Null cuando ya se ven todas las que coinciden, o cuando se llegó al tope. */
  hrefCargarMas: string | null;
  /** Hay más resultados pero se alcanzó el tope de filas por consulta. */
  enElTope: boolean;
  /** Query string de los filtros (con `?`) o vacía. Se cuelga del enlace al
   *  detalle para que su botón de volver regrese a esta misma vista. */
  queryFiltros: string;
}) {
  const [seleccionando, setSeleccionando] = useState(false);
  /** Array y no Set: el orden es el que sale en la historia. */
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [generando, setGenerando] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);

  const puedeCompartir = usePuedeCompartir();
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const filtrando = hayFiltrosActivos(filtros);

  function alternar(id: string) {
    setSeleccion((previo) =>
      previo.includes(id) ? previo.filter((x) => x !== id) : [...previo, id],
    );
  }

  function salirDeSeleccion() {
    setSeleccionando(false);
    setSeleccion([]);
  }

  function limpiarPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreview(null);
  }

  // Un solo motivo a la vez, en el idioma de la usuaria.
  const motivo =
    seleccion.length === 0
      ? "Toca 2 cotizaciones para combinarlas."
      : seleccion.length === 1
        ? "Falta 1: la historia doble lleva exactamente 2."
        : seleccion.length > PRODUCTOS
          ? `Tienes ${seleccion.length} seleccionadas. Deja solo 2.`
          : null;

  const elegidas = seleccion
    .map((id) => items.find((item) => item.id === id))
    .filter((item) => item !== undefined);

  async function generar() {
    if (seleccion.length !== PRODUCTOS) return;

    setGenerando(true);
    try {
      const res = await fetch(`/api/historia-doble?ids=${seleccion.join(",")}`);
      if (!res.ok) throw new Error("fallo");

      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setPreview({ url, blob });
      setSeleccionando(false);
      // La vista previa se pinta arriba; la acción salió de la barra de abajo.
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("No pude generar la historia doble. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  }

  const nombreDescarga = () =>
    nombreArchivo(elegidas.map((item) => item.nombre).join(" y ") || "historia-doble");

  async function compartirHistoria() {
    if (!preview) return;
    const archivo = nombreDescarga();
    const ok = await compartir(preview.blob, archivo, "Historia");
    if (!ok) descargar(preview.blob, archivo);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>

        {items.length >= PRODUCTOS ? (
          <Button
            type="button"
            variant={seleccionando ? "secondary" : "outline"}
            className="h-10 touch-manipulation"
            onClick={() => (seleccionando ? salirDeSeleccion() : setSeleccionando(true))}
          >
            {seleccionando ? (
              <>
                <X className="size-4" aria-hidden />
                Cancelar
              </>
            ) : (
              <>
                <Layers className="size-4" aria-hidden />
                Combinar
              </>
            )}
          </Button>
        ) : null}
      </div>

      <HistorialFiltros filtros={filtros} categorias={categorias} />

      {preview ? (
        <Card className="mb-5">
          <CardContent className="flex flex-col gap-3 pt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt="Historia con dos productos"
              className="mx-auto w-full max-w-[260px] rounded-xl border"
            />
            <Button type="button" className="h-11" onClick={compartirHistoria}>
              {puedeCompartir ? (
                <Share2 className="size-4" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              {puedeCompartir ? "Compartir" : "Descargar"}
            </Button>
            {puedeCompartir ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => descargar(preview.blob, nombreDescarga())}
              >
                <Download className="size-4" aria-hidden />
                Descargar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground h-9 text-xs"
              onClick={limpiarPreview}
            >
              Cerrar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {items.length === 0 ? (
        filtrando ? (
          // Vacío por los filtros, no por falta de cotizaciones.
          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
            <p className="text-muted-foreground text-sm">
              Ninguna cotización coincide con lo que buscas.
            </p>
            <Button asChild variant="outline" className="mt-4 h-10">
              <Link href="/historial">Limpiar filtros</Link>
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
            Todavía no has guardado ninguna cotización.
          </p>
        )
      ) : (
        <>
          {filtrando ? (
            <p className="text-muted-foreground mb-2 text-xs">
              {total === 1 ? "1 resultado" : `${total} resultados`}
            </p>
          ) : null}

          <ul className={cn("divide-border divide-y", seleccionando && "pb-28")}>
            {items.map((item) => {
              const elegida = seleccion.includes(item.id);
              const orden = seleccion.indexOf(item.id) + 1;

              const contenido = (
                <>
                  <span className="bg-muted relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg">
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

                    {seleccionando ? (
                      <span
                        className={cn(
                          "absolute inset-0 flex items-center justify-center text-sm font-semibold transition-colors",
                          elegida ? "bg-primary/70 text-primary-foreground" : "bg-black/35",
                        )}
                      >
                        {elegida ? orden : <Check className="size-4 opacity-40" aria-hidden />}
                      </span>
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.nombre}</span>
                    <span className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="font-normal">
                        {item.categoria}
                      </Badge>
                      {item.fecha}
                    </span>
                  </span>

                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatearCOP(item.precio_cop)}
                  </span>
                </>
              );

              return (
                <li key={item.id}>
                  {seleccionando ? (
                    <button
                      type="button"
                      onClick={() => alternar(item.id)}
                      aria-pressed={elegida}
                      className="flex w-full touch-manipulation items-center gap-3 py-3 text-left active:opacity-60"
                    >
                      {contenido}
                    </button>
                  ) : (
                    <Link
                      href={`/historial/${item.id}${queryFiltros}`}
                      className="flex touch-manipulation items-center gap-3 py-3 active:opacity-60"
                    >
                      {contenido}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          {hrefCargarMas ? (
            <Button
              asChild
              variant="outline"
              className={cn("mt-4 h-11 w-full", seleccionando && "mb-28")}
            >
              {/* `scroll={false}` para no saltar arriba al traer el lote. */}
              <Link href={hrefCargarMas} scroll={false} prefetch={false}>
                Cargar más ({items.length} de {total})
              </Link>
            </Button>
          ) : enElTope ? (
            <p
              className={cn(
                "text-muted-foreground mt-4 rounded-md border border-dashed px-3 py-4 text-center text-xs",
                seleccionando && "mb-28",
              )}
            >
              Mostrando las {items.length} más recientes de {total}. Usa la búsqueda o los filtros
              para llegar a las más antiguas.
            </p>
          ) : null}
        </>
      )}

      {/* Barra de acción, por encima del tab bar (6rem + su safe area). Los `_`
          son espacios: `calc()` los exige alrededor del `+`. */}
      {seleccionando ? (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-[calc(6rem_+_env(safe-area-inset-bottom))] z-30 border-t backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-5 py-3">
            <p className="text-muted-foreground min-w-0 flex-1 text-xs">
              {motivo ??
                (elegidas.length === seleccion.length
                  ? elegidas.map((item) => item.nombre).join(" + ")
                  : `${seleccion.length} seleccionadas`)}
            </p>
            <Button
              type="button"
              className="h-11 shrink-0 touch-manipulation"
              onClick={generar}
              disabled={seleccion.length !== PRODUCTOS || generando}
            >
              {generando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Layers className="size-4" aria-hidden />
              )}
              Generar
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
