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
  // Tope 100 y no 500 como los demás: es una porción del margen, y más del
  // 100% dejaría un margen neto negativo, que no significa nada.
  comision_pct: z
    .number()
    .min(0, "No puede ser negativo.")
    .max(100, "La comisión no puede pasar del 100% del margen."),
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
  // Sin mínimo: dejar la tabla vacía apaga el estimador de envío nacional.
  zonas_envio: z
    .array(
      z.object({
        nombre: z.string().trim().min(1, "El nombre de la zona no puede ir vacío.").max(40),
        tarifa_base_cop: z
          .number()
          .min(0, "La tarifa base no puede ser negativa.")
          .max(10_000_000, "¿Seguro? Esa tarifa es demasiado alta."),
        adicional_lb_cop: z
          .number()
          .min(0, "El adicional por libra no puede ser negativo.")
          .max(10_000_000, "¿Seguro? Ese adicional es demasiado alto."),
      }),
    )
    .default([]),
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

  // El nombre es la clave con la que cada cotización guarda su zona: no puede
  // haber dos iguales. Se conserva tal como se escribió (es una etiqueta que
  // se muestra), pero se compara sin distinguir mayúsculas.
  const vistas = new Set<string>();
  for (const { nombre } of d.zonas_envio) {
    const clave = nombre.toLowerCase();
    if (vistas.has(clave)) {
      return { ok: false, error: `La zona "${nombre}" está repetida.` };
    }
    vistas.add(clave);
  }
  // Los pesos colombianos no tienen centavos; redondeamos en vez de rechazar.
  const zonas = d.zonas_envio.map((z) => ({
    nombre: z.nombre,
    tarifa_base_cop: Math.round(z.tarifa_base_cop),
    adicional_lb_cop: Math.round(z.adicional_lb_cop),
  }));

  const datos = {
    margen_pct: d.margen_pct / 100,
    sales_tax_pct: d.sales_tax_pct / 100,
    trm_buffer_pct: d.trm_buffer_pct / 100,
    comision_pct: d.comision_pct / 100,
    tarifa_lb_usd: d.tarifa_lb_usd,
    redondeo_cop: d.redondeo_cop,
    pesos_categoria: pesos,
    zonas_envio: zonas,
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
