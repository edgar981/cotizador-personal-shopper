"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { calcularComision } from "@/lib/comision";
import { calcularCotizacion } from "@/lib/cotizador";
import { buscarZona, calcularEnvioNacional } from "@/lib/envio";
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
  /// Nombre de la zona del tramo nacional. Opcional: la usuaria solo la elige
  /// cuando una clienta pregunta por su ciudad.
  zona_envio: z.string().trim().max(40).optional().nullable(),
});

export type EntradaCotizacion = z.infer<typeof esquema>;

export type ResultadoGuardar =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Rehace el snapshot completo con la config y la TRM vigentes, y devuelve los
 * campos tal como van a la tabla.
 *
 * Lo comparten crear y actualizar: si cada uno armara el suyo, actualizar
 * podría dejar una fila con un desglose distinto al de una recién creada.
 * Devuelve null si no hay TRM, que es el único caso en que no se puede cotizar.
 */
async function construirSnapshot(
  datos: EntradaCotizacion,
  /** Solo al actualizar: la marca de publicación que traía el desglose. */
  historiaGeneradaAt?: string,
) {
  const [settings, trm] = await Promise.all([obtenerSettings(), obtenerTrm()]);
  if (!trm) return null;

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

  // Tramo nacional: se resuelve contra las tarifas vigentes y se congela como
  // snapshot, igual que el precio. Deliberadamente fuera de `calculo`: no toca
  // `costo_cop`, `margen_cop` ni `precio_cop`.
  const zona = buscarZona(settings.zonas_envio, datos.zona_envio);
  const envio_nacional_cop = zona ? calcularEnvioNacional(zona, datos.peso_lb) : null;

  // Reparto del margen. Derivado de `margen_cop`, nunca de `precio_cop`: es
  // información interna y no altera lo que se publica.
  const comision = calcularComision(calculo.margen_cop, settings.comision_pct);

  return {
    url: datos.url,
    nombre: datos.nombre,
    imagen_url: datos.imagen_url || null,
    captura_url: datos.captura_url || null,
    imagen_origen: datos.imagen_origen,
    // `DbNull` y no `undefined`: en un update `undefined` significa "no toques
    // este campo", así que quitar el recorte no lo borraría y la fila quedaría
    // con el encuadre viejo. `DbNull` pone NULL en los dos caminos.
    recorte: normalizarRecorte(datos.recorte) ?? Prisma.DbNull,
    historia_url: datos.historia_url || null,
    historia_recorte: normalizarRecorte(datos.historia_recorte) ?? Prisma.DbNull,
    categoria: datos.categoria,
    talla_notas: datos.talla_notas || null,
    precio_usd: datos.precio_usd,
    peso_lb: datos.peso_lb,
    zona_envio: zona?.nombre ?? null,
    envio_nacional_cop,
    comision_cop: comision.comision_cop,
    margen_neto_cop: comision.margen_neto_cop,
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
      // Tarifa exacta usada, para poder auditar un estimado viejo aunque la
      // tabla de zonas haya cambiado después.
      envio: zona ? { ...zona, envio_nacional_cop } : null,
      // El pct va al snapshot para poder etiquetar la línea en el detalle
      // aunque la comisión configurada cambie después.
      comision: { pct: settings.comision_pct, ...comision },
      // Snapshot de la marca para que la historia se regenere igual siempre.
      ig_handle: settings.ig_handle,
      lema: settings.lema,
      color_marca: settings.color_marca,
      // El snapshot se rehace entero, pero haberse publicado no se deshace.
      ...(historiaGeneradaAt ? { historia_generada_at: historiaGeneradaAt } : {}),
    },
  };
}

const SIN_TRM =
  "No pude obtener la TRM y no hay ningún valor guardado. Intenta de nuevo.";

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

  const snapshot = await construirSnapshot(parseo.data);
  if (!snapshot) return { ok: false, error: SIN_TRM };

  const cotizacion = await prisma.cotizacion.create({
    data: snapshot,
    select: { id: true },
  });

  revalidatePath("/historial");
  return { ok: true, id: cotizacion.id };
}

/**
 * Reescribe una cotización ya guardada con los valores nuevos, rehaciendo el
 * snapshot igual que al crearla.
 *
 * Existe porque generar la historia guarda: si después se corrige un campo, esa
 * corrección tiene que llegar a la fila que ya existe en vez de perderse o de
 * crear un duplicado.
 */
export async function actualizarCotizacion(
  id: string,
  entrada: EntradaCotizacion,
): Promise<ResultadoGuardar> {
  await requerirSesion();

  const parseo = esquema.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const existente = await prisma.cotizacion.findUnique({
    where: { id },
    select: { desglose: true },
  });
  if (!existente) return { ok: false, error: "Esa cotización ya no existe." };

  // La marca de publicación se rescata del desglose anterior y se reinyecta.
  const previo = (existente.desglose ?? {}) as Record<string, unknown>;
  const marca =
    typeof previo.historia_generada_at === "string" ? previo.historia_generada_at : undefined;

  const snapshot = await construirSnapshot(parseo.data, marca);
  if (!snapshot) return { ok: false, error: SIN_TRM };

  await prisma.cotizacion.update({ where: { id }, data: snapshot });

  revalidatePath("/historial");
  revalidatePath(`/historial/${id}`);
  return { ok: true, id };
}

/**
 * Deja constancia de que esta cotización llegó a publicarse.
 *
 * Se escribe dentro de `desglose`, el Json de auditoría que ya existe, en vez
 * de una columna nueva: el modelo de datos no cambia y no hace falta migración.
 * Si algún día la métrica se consulta seguido, conviene subirlo a columna con
 * índice; hoy se lee con `desglose->>'historia_generada_at'`.
 *
 * Se conserva la PRIMERA vez: la métrica es "cuándo se publicó", no "cuándo se
 * volvió a generar la imagen".
 */
export async function marcarHistoriaGenerada(id: string): Promise<void> {
  await requerirSesion();

  const fila = await prisma.cotizacion.findUnique({
    where: { id },
    select: { desglose: true },
  });
  if (!fila) return;

  const desglose = (fila.desglose ?? {}) as Record<string, unknown>;
  if (desglose.historia_generada_at) return;

  await prisma.cotizacion.update({
    where: { id },
    data: { desglose: { ...desglose, historia_generada_at: new Date().toISOString() } },
  });

  revalidatePath("/historial");
}
