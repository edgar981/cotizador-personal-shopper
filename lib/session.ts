import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Verificación real de sesión en el servidor (no confiar solo en el proxy). */
export async function obtenerSesion() {
  return auth.api.getSession({ headers: await headers() });
}

/** Úsalo en layouts, páginas y route handlers protegidos. */
export async function requerirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  return sesion;
}
