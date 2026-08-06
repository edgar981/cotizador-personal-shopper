"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Acción primaria: subir la captura. En móvil el input abre cámara/galería;
 * en escritorio además se puede pegar (⌘V) o arrastrar y soltar.
 */
export function SubirCaptura({
  onArchivo,
  ocupado,
  etiquetaOcupado,
  titulo = "Subir captura de pantalla",
  descripcion = "Toma la captura en la tienda y súbela. También puedes pegarla o arrastrarla.",
  compacto = false,
  /** Con `false` no escucha el pegado: evita que dos zonas se peleen el ⌘V. */
  escuchaPegado = true,
}: {
  onArchivo: (archivo: File) => void;
  ocupado: boolean;
  etiquetaOcupado: string;
  titulo?: string;
  descripcion?: string;
  compacto?: boolean;
  escuchaPegado?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const recibir = useCallback(
    (archivo: File | null | undefined) => {
      if (archivo) onArchivo(archivo);
    },
    [onArchivo],
  );

  // Pegar desde el portapapeles (⌘V) en cualquier parte de la pantalla.
  useEffect(() => {
    if (!escuchaPegado) return;

    function alPegar(evento: ClipboardEvent) {
      const objetivo = evento.target as HTMLElement | null;
      // No robamos el pegado cuando está escribiendo en un campo.
      if (objetivo && /^(INPUT|TEXTAREA)$/.test(objetivo.tagName)) return;

      const item = [...(evento.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith("image/"),
      );
      const archivo = item?.getAsFile();
      if (archivo) {
        evento.preventDefault();
        recibir(archivo);
      }
    }

    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [recibir, escuchaPegado]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        recibir(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          recibir(e.target.files?.[0]);
          // Permite volver a elegir el mismo archivo.
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors",
          compacto ? "px-4 py-6" : "px-5 py-10",
          arrastrando ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          ocupado ? "opacity-70" : "active:bg-muted/50",
        )}
      >
        {ocupado ? (
          <>
            <Loader2
              className={cn("text-muted-foreground animate-spin", compacto ? "size-5" : "size-7")}
              aria-hidden
            />
            <span className="text-sm font-medium">{etiquetaOcupado}</span>
          </>
        ) : (
          <>
            <ImageUp
              className={cn("text-muted-foreground", compacto ? "size-5" : "size-7")}
              aria-hidden
            />
            <span className={compacto ? "text-sm font-semibold" : "text-base font-semibold"}>
              {titulo}
            </span>
            <span className="text-muted-foreground text-xs">{descripcion}</span>
          </>
        )}
      </button>
    </div>
  );
}
