import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";

/**
 * Origen en el que vive la app, que Better Auth usa para emitir y validar las
 * cookies de sesión. Cada entorno tiene el suyo:
 *
 *  - producción: el dominio fijo de `BETTER_AUTH_URL`.
 *  - preview: cada rama se despliega en una URL distinta, así que no puede ser
 *    un valor fijo; sale de `VERCEL_BRANCH_URL` (que viene sin protocolo).
 *  - local: el puerto del dev server.
 *
 * Si en preview faltara `VERCEL_BRANCH_URL`, se devuelve `undefined` en vez de
 * armar `https://undefined`: sin `baseURL`, Better Auth lo deduce de las
 * cabeceras de la petición, que es un respaldo razonable.
 */
function resolverBaseURL(): string | undefined {
  if (process.env.VERCEL_ENV === "production") return process.env.BETTER_AUTH_URL;

  if (process.env.VERCEL_ENV === "preview") {
    const rama = process.env.VERCEL_BRANCH_URL;
    return rama ? `https://${rama}` : undefined;
  }

  return "http://localhost:3001";
}

function createAuth({ allowSignUp }: { allowSignUp: boolean }) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      // Usuaria única: el registro solo ocurre en el seed, nunca por HTTP.
      disableSignUp: !allowSignUp,
    },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: resolverBaseURL(),
    plugins: [nextCookies()],
  });
}

/// Instancia que se monta en /api/auth/[...all]. No permite sign-up.
export const auth = createAuth({ allowSignUp: false });

/// Solo para prisma/seed.ts — crea la cuenta admin con el hash de Better Auth.
export const authWithSignUp = createAuth({ allowSignUp: true });
