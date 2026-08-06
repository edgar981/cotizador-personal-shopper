import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { requerirSesion } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Verificación server-side real: el proxy solo mira la cookie.
  await requerirSesion();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="flex-1 pb-24">{children}</main>
      <AppNav />
    </div>
  );
}
