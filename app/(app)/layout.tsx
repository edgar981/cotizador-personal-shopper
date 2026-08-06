import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { requerirSesion } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Verificación server-side real: el proxy solo mira la cookie.
  await requerirSesion();

  return (
    // En standalone (añadida al inicio en iOS) el viewport llega hasta los
    // bordes por `viewport-fit=cover`: hay que apartar el contenido del notch
    // arriba (padding-top del contenedor que envuelve todos los headers) y
    // dejar sitio abajo para el tab bar fijo.
    <div className="flex min-h-full flex-1 flex-col pt-[env(safe-area-inset-top)]">
      {/* 6rem es el alto del tab bar; se le suma el inset inferior porque la
          barra crece con él, y sin esa reserva el final del contenido queda
          tapado. Los `_` son espacios: `calc()` exige espacios alrededor del
          `+`, y sin ellos la declaración es inválida y el navegador la
          descarta (el contenido quedaba debajo de la barra). */}
      <main className="flex-1 pb-[calc(6rem_+_env(safe-area-inset-bottom))]">{children}</main>
      <AppNav />
    </div>
  );
}
