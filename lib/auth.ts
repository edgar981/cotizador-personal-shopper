import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";

function createAuth({ allowSignUp }: { allowSignUp: boolean }) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      // Usuaria única: el registro solo ocurre en el seed, nunca por HTTP.
      disableSignUp: !allowSignUp,
    },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

/// Instancia que se monta en /api/auth/[...all]. No permite sign-up.
export const auth = createAuth({ allowSignUp: false });

/// Solo para prisma/seed.ts — crea la cuenta admin con el hash de Better Auth.
export const authWithSignUp = createAuth({ allowSignUp: true });
