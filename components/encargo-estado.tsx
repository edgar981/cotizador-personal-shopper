"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cambiarEstadoEncargo } from "@/app/actions/encargos";
import { ESTADOS, type Estado } from "@/lib/encargos";
import { cn } from "@/lib/utils";

/**
 * Cambiar el estado a mano, hacia adelante o hacia atrás.
 *
 * No hay máquina de estados: en la operación real los paquetes se devuelven y
 * las marcas se corrigen, así que cualquier estado es alcanzable desde
 * cualquier otro. La marca de tiempo la escribe el servidor.
 */
export function EncargoEstado({ id, estado }: { id: string; estado: string }) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState<Estado | null>(null);

  async function cambiar(nuevo: Estado) {
    if (nuevo === estado || cambiando) return;

    setCambiando(nuevo);
    const resultado = await cambiarEstadoEncargo(id, nuevo);
    setCambiando(null);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    // `flex-wrap`: los siete estados bajan de línea en vez de salirse.
    <div className="flex flex-wrap gap-2" role="group" aria-label="Estado del encargo">
      {ESTADOS.map((opcion) => {
        const actual = opcion.valor === estado;
        return (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => cambiar(opcion.valor)}
            aria-pressed={actual}
            disabled={cambiando !== null}
            className={cn(
              "inline-flex touch-manipulation items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors active:opacity-60 disabled:opacity-50",
              actual
                ? "bg-primary text-primary-foreground border-transparent"
                : "text-muted-foreground",
            )}
          >
            {cambiando === opcion.valor ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : null}
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
