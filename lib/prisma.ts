import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function crearCliente(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL en el entorno.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function cliente(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = crearCliente();
  return globalForPrisma.prisma;
}

/**
 * Se conecta perezosamente: `next build` importa estos módulos sin tener
 * DATABASE_URL disponible y no debe reventar por eso.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_objetivo, propiedad) {
    const real = cliente();
    const valor = Reflect.get(real, propiedad, real);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});
