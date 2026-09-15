"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cambiarEstadoEncargo } from "@/app/actions/encargos";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADOS } from "@/lib/encargos";

/**
 * Actualiza el estado del encargo.
 *
 * Es un desplegable y no una fila de botones porque la pregunta no es "cuál de
 * estos siete", sino "en qué va esto": se ve el estado actual y al tocarlo
 * aparecen los demás. Igual se puede avanzar y retroceder libremente — en la
 * operación real los paquetes se devuelven y las marcas se corrigen, así que
 * cualquier estado es alcanzable desde cualquier otro. La marca de tiempo la
 * escribe el servidor.
 */
export function EncargoEstado({ id, estado }: { id: string; estado: string }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  // Actualización optimista: el desplegable muestra el estado nuevo apenas se
  // elige, sin esperar al servidor ni al `router.refresh()` que vuelve a pintar
  // la pantalla. Antes había que esperar el viaje completo para ver el cambio,
  // y el toque parecía no haber entrado.
  const [elegido, setElegido] = useState<string | null>(null);

  // Cuando llega el estado nuevo del servidor se suelta el optimista y se
  // vuelve a seguir la verdad. Se ajusta en render y no en un efecto, para no
  // encadenar renders (patrón "You Might Not Need an Effect").
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    setElegido(null);
  }

  const actual = elegido ?? estado;

  async function cambiar(nuevo: string) {
    if (nuevo === actual || guardando) return;

    setElegido(nuevo);
    setGuardando(true);

    try {
      const resultado = await cambiarEstadoEncargo(id, nuevo);
      if (!resultado.ok) {
        // Se revierte a lo que dice el servidor: mostrar un estado que no se
        // guardó es peor que no haberlo mostrado.
        setElegido(null);
        toast.error(resultado.error);
        return;
      }
      // Trae las marcas de tiempo y el resto de la pantalla al día.
      router.refresh();
    } catch {
      // Se cayó la red o el servidor: la acción ni siquiera alcanzó a
      // responder. Sin este catch el optimismo se quedaría mostrando un estado
      // que nunca se guardó, y encima con el "Guardando…" pegado para siempre.
      setElegido(null);
      toast.error("No pude guardar el estado. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={actual} onValueChange={cambiar} disabled={guardando}>
        <SelectTrigger
          className="h-12 w-full text-base font-medium"
          aria-label="Estado del encargo"
        >
          <SelectValue placeholder="Sin estado" />
        </SelectTrigger>
        <SelectContent>
          {ESTADOS.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor} className="py-2.5 text-base">
              {opcion.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {guardando ? (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Guardando…
          </>
        ) : (
          "Tócalo para actualizarlo. Se puede volver atrás si algo se marcó por error."
        )}
      </p>
    </div>
  );
}
