"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calcularCotizacion } from "@/lib/cotizador";
import { prisma } from "@/lib/prisma";
import { normalizarRecorte } from "@/lib/recorte";
import { requerirSesion } from "@/lib/session";
import { obtenerSettings } from "@/lib/settings";
import { obtenerTrm } from "@/lib/trm";

const esquema = z.object({
  // Opcional en el flujo por captura: la usuaria puede no tener el link a mano.
  url: z.string().trim().max(2000).default(""),
  nombre: z.string().trim().min(1, "Ponle un nombre al producto.").max(200),
  imagen_url: z.string().trim().max(2000).optional().nullable(),
  captura_url: z.string().trim().max(2000).optional().nullable(),
  imagen_origen: z.enum(["url", "captura"]).default("url"),
  recorte: z
    .object({ x: z.number(), y: z.number(), ancho: z.number(), alto: z.number() })
    .nullable()
    .optional(),
  historia_url: z.string().trim().max(2000).optional().nullable(),
  historia_recorte: z
    .object({ x: z.number(), y: z.number(), ancho: z.number(), alto: z.number() })
    .nullable()
    .optional(),
  categoria: z.string().trim().min(1, "Elige una categoría.").max(60),
  talla_notas: z.string().trim().max(300).optional().nullable(),
  precio_usd: z.number().positive("El precio en USD debe ser mayor que 0."),
  peso_lb: z.number().positive("El peso debe ser mayor que 0."),
});

export type EntradaCotizacion = z.infer<typeof esquema>;

export type ResultadoGuardar =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Persiste la cotización. El cálculo se rehace en el servidor con la config y
 * la TRM vigentes: lo que el cliente muestra es solo previsualización.
 */
export async function guardarCotizacion(
  entrada: EntradaCotizacion,
): Promise<ResultadoGuardar> {
  await requerirSesion();

  const parseo = esquema.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const datos = parseo.data;

  const [settings, trm] = await Promise.all([obtenerSettings(), obtenerTrm()]);
  if (!trm) {
    return {
      ok: false,
      error: "No pude obtener la TRM y no hay ningún valor guardado. Intenta de nuevo.",
    };
  }

  const parametros = {
    precio_usd: datos.precio_usd,
    peso_lb: datos.peso_lb,
    sales_tax_pct: settings.sales_tax_pct,
    tarifa_lb_usd: settings.tarifa_lb_usd,
    trm_oficial: trm.valor,
    trm_buffer_pct: settings.trm_buffer_pct,
    margen_pct: settings.margen_pct,
    redondeo_cop: settings.redondeo_cop,
  };
  const calculo = calcularCotizacion(parametros);

  const cotizacion = await prisma.cotizacion.create({
    data: {
      url: datos.url,
      nombre: datos.nombre,
      imagen_url: datos.imagen_url || null,
      captura_url: datos.captura_url || null,
      imagen_origen: datos.imagen_origen,
      recorte: normalizarRecorte(datos.recorte) ?? undefined,
      historia_url: datos.historia_url || null,
      historia_recorte: normalizarRecorte(datos.historia_recorte) ?? undefined,
      categoria: datos.categoria,
      talla_notas: datos.talla_notas || null,
      precio_usd: datos.precio_usd,
      peso_lb: datos.peso_lb,
      tax_usd: calculo.tax_usd,
      flete_usd: calculo.flete_usd,
      trm_oficial: trm.valor,
      trm_aplicada: calculo.trm_aplicada,
      costo_cop: calculo.costo_cop,
      margen_cop: calculo.margen_cop,
      precio_cop: calculo.precio_cop,
      desglose: {
        parametros,
        calculo,
        trm_vigencia: trm.vigencia,
        trm_desde_cache: trm.desdeCache,
        // Snapshot de la marca para que la historia se regenere igual siempre.
        ig_handle: settings.ig_handle,
        lema: settings.lema,
        color_marca: settings.color_marca,
      },
    },
    select: { id: true },
  });

  revalidatePath("/historial");
  return { ok: true, id: cotizacion.id };
}
