import { Skeleton } from "@/components/ui/skeleton";

// Fallback de ruta compartido por Nueva / Historial / Config. Al existir, la
// navegación entre pestañas es instantánea: React muestra este esqueleto de
// inmediato mientras el servidor renderiza la página (son `force-dynamic`), en
// vez de bloquear el toque hasta que llega el HTML. Mantiene el mismo ancho y
// el offset del notch del layout, así que no hay salto al aparecer la página.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      {/* Encabezado: título + línea secundaria, como en cada pantalla. */}
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-64" />

      {/* Bloque principal (captura / primera tarjeta). */}
      <Skeleton className="mt-6 h-40 w-full rounded-xl" />

      {/* Un par de bloques de contenido. */}
      <Skeleton className="mt-4 h-32 w-full rounded-xl" />
      <Skeleton className="mt-4 h-32 w-full rounded-xl" />
    </div>
  );
}
