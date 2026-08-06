"use client";

import { Clock, LogOut, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", etiqueta: "Nueva", Icono: Sparkles },
  { href: "/historial", etiqueta: "Historial", Icono: Clock },
  { href: "/config", etiqueta: "Config", Icono: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function salir() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map(({ href, etiqueta, Icono }) => {
          const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors",
                activo ? "text-primary" : "text-muted-foreground",
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
          className="text-muted-foreground flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium"
        >
          <LogOut className="size-5" aria-hidden />
          Salir
        </button>
      </div>
    </nav>
  );
}
