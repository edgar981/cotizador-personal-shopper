"use client";

import { Clock, LogOut, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", etiqueta: "Nueva", Icono: Sparkles },
  { href: "/historial", etiqueta: "Historial", Icono: Clock },
  { href: "/config", etiqueta: "Config", Icono: Settings },
];

function esActivo(href: string, ruta: string) {
  return href === "/" ? ruta === "/" : ruta.startsWith(href);
}

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Estas rutas son `force-dynamic` y se renderizan en el servidor en cada
  // navegación: `usePathname()` no cambia hasta que la página llega, así que el
  // resaltado se sentía "muerto" tras el toque. Guardamos el destino apenas se
  // toca para marcarlo activo al instante, sin esperar al render del servidor.
  const [destino, setDestino] = useState<string | null>(null);

  // Cuando el pathname cambia, la navegación terminó (aplica también al botón
  // atrás y a router.push): soltamos el estado optimista y volvemos a seguir el
  // pathname real. Se ajusta en render, no en un efecto, para no encadenar
  // renders (patrón "You Might Not Need an Effect").
  const [rutaVista, setRutaVista] = useState(pathname);
  if (pathname !== rutaVista) {
    setRutaVista(pathname);
    setDestino(null);
  }

  async function salir() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  // El destino optimista manda sobre el pathname mientras la página carga.
  const rutaResaltada = destino ?? pathname;

  return (
    <nav className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map(({ href, etiqueta, Icono }) => {
          const activo = esActivo(href, rutaResaltada);
          const cargando = destino === href;
          return (
            <Link
              key={href}
              href={href}
              prefetch
              onClick={() => setDestino(href)}
              aria-current={activo ? "page" : undefined}
              className={cn(
                // `touch-manipulation` quita el retardo de ~300ms de iOS;
                // `active:` da respuesta visual inmediata al toque.
                "flex flex-1 touch-manipulation flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors active:opacity-60",
                activo ? "text-primary" : "text-muted-foreground",
                cargando && "animate-pulse",
              )}
            >
              <Icono className="size-5" aria-hidden />
              {etiqueta}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={salir}
          className="text-muted-foreground flex flex-1 touch-manipulation flex-col items-center gap-1 py-3 text-[11px] font-medium active:opacity-60"
        >
          <LogOut className="size-5" aria-hidden />
          Salir
        </button>
      </div>
    </nav>
  );
}
