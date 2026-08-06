"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/session";
import { SETTINGS_ID } from "@/lib/settings-defaults";

const porcentaje = z
  .number()
  .min(0, "No puede ser negativo.")
  .max(500, "¿Seguro? Ese porcentaje es demasiado alto.");

const esquema = z.object({
  // Los porcentajes llegan de la UI como 25 (%), se guardan como 0.25.
  margen_pct: porcentaje,
  sales_tax_pct: porcentaje,
  trm_buffer_pct: porcentaje,
  tarifa_lb_usd: z.number().positive("La tarifa por libra debe ser mayor que 0."),
  redondeo_cop: z
    .number()
    .int("El redondeo debe ser un número entero.")
    .positive("El redondeo debe ser mayor que 0."),
  ig_handle: z.string().trim().min(2, "Escribe tu usuario de Instagram.").max(60),
  lema: z.string().trim().min(2, "Escribe un lema.").max(80),
  color_marca: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser un hex como #E11D74."),
  pesos_categoria: z
    .array(
      z.object({
        categoria: z.string().trim().min(1, "La categoría no puede ir vacía.").max(40),
        peso_lb: z.number().positive("Cada peso debe ser mayor que 0."),
      }),
    )
    .min(1, "Deja al menos una categoría."),
});

export type EntradaConfig = z.infer<typeof esquema>;

export type ResultadoConfig = { ok: true } | { ok: false; error: string };

export async function guardarConfig(entrada: EntradaConfig): Promise<ResultadoConfig> {
  await requerirSesion();

  const parseo = esquema.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parseo.data;

  const pesos: Record<string, number> = {};
  for (const { categoria, peso_lb } of d.pesos_categoria) {
    const clave = categoria.toLowerCase();
    if (pesos[clave] !== undefined) {
      return { ok: false, error: `La categoría "${categoria}" está repetida.` };
    }
    pesos[clave] = peso_lb;
  }

  const datos = {
    margen_pct: d.margen_pct / 100,
    sales_tax_pct: d.sales_tax_pct / 100,
    trm_buffer_pct: d.trm_buffer_pct / 100,
    tarifa_lb_usd: d.tarifa_lb_usd,
    redondeo_cop: d.redondeo_cop,
    pesos_categoria: pesos,
    ig_handle: d.ig_handle.startsWith("@") ? d.ig_handle : `@${d.ig_handle}`,
    lema: d.lema,
    color_marca: d.color_marca.toUpperCase(),
  };

  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...datos },
    update: datos,
  });

  revalidatePath("/config");
  revalidatePath("/");
  return { ok: true };
}
