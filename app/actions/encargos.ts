"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  campoMarca,
  DESTINOS,
  ESTADO_INICIAL,
  ESTADOS,
  requiereCiudad,
  type DestinoTipo,
  type Estado,
} from "@/lib/encargos";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/session";

/** Texto opcional: se recorta y lo vacío se guarda como null, nunca como "". */
const texto = (max: number) => z.string().trim().max(max).optional().nullable();

/** Pesos colombianos: enteros, sin centavos. */
const cop = (mensaje: string) =>
  z
    .number()
    .int(mensaje)
    .min(0, "No puede ser negativo.")
    .max(100_000_000, "¿Seguro? Ese valor es demasiado alto.");

const destinos = DESTINOS.map((d) => d.valor) as [DestinoTipo, ...DestinoTipo[]];
const estados = ESTADOS.map((e) => e.valor) as [Estado, ...Estado[]];

const esquema = z
  .object({
    cliente_nombre: z.string().trim().min(1, "Ponle el nombre de la clienta.").max(120),
    cliente_tel: texto(40),
    cliente_notas: texto(500),

    talla: texto(40),
    color: texto(40),
    cantidad: z
      .number()
      .int("La cantidad debe ser un número entero.")
      .min(1, "La cantidad mínima es 1.")
      .max(99, "¿Seguro? Esa cantidad es demasiado alta."),

    destino_tipo: z.enum(destinos),
    destino_ciudad: texto(80),
    destino_dir: texto(300),

    precio_cop: cop("El precio debe ser un número entero."),
    envio_cop: cop("El envío debe ser un número entero.").nullable().optional(),
    abono_cop: cop("El abono debe ser un número entero.").nullable().optional(),

    guia: texto(60),
    notas: texto(500),
  })
  // Bogotá y San Marcos ya se nombran solos; "otra ciudad" sin ciudad no sirve
  // para nada cuando llegue el paquete.
  .refine((d) => !requiereCiudad(d.destino_tipo) || Boolean(d.destino_ciudad?.trim()), {
    path: ["destino_ciudad"],
    message: "Dime a qué ciudad va.",
  });

export type EntradaEncargo = z.infer<typeof esquema>;

export type ResultadoEncargo = { ok: true; id: string } | { ok: false; error: string };

/**
 * Pasa de lo validado a lo que va a la tabla: los textos vacíos quedan en null
 * y la ciudad se descarta cuando el destino no es "otra ciudad" (si alguien
 * escribió una ciudad y luego cambió el destino, ese dato ya no significa nada).
 */
function aFila(d: EntradaEncargo) {
  const limpio = (valor?: string | null) => valor?.trim() || null;

  return {
    cliente_nombre: d.cliente_nombre,
    cliente_tel: limpio(d.cliente_tel),
    cliente_notas: limpio(d.cliente_notas),
    talla: limpio(d.talla),
    color: limpio(d.color),
    cantidad: d.cantidad,
    destino_tipo: d.destino_tipo,
    destino_ciudad: requiereCiudad(d.destino_tipo) ? limpio(d.destino_ciudad) : null,
    destino_dir: limpio(d.destino_dir),
    precio_cop: d.precio_cop,
    envio_cop: d.envio_cop ?? null,
    abono_cop: d.abono_cop ?? null,
    guia: limpio(d.guia),
    notas: limpio(d.notas),
  };
}

function revalidar(id: string, cotizacionId: string) {
  revalidatePath("/encargos");
  revalidatePath(`/encargos/${id}`);
  revalidatePath(`/historial/${cotizacionId}`);
}

/**
 * Crea el encargo sobre una cotización existente.
 *
 * `precio_cop` y `envio_cop` llegan del formulario ya pre-llenados con los de la
 * cotización, pero se guardan como snapshot propio: si la cotización se
 * regenera con otra TRM, el encargo conserva lo que se le prometió a la clienta.
 */
export async function crearEncargo(
  cotizacionId: string,
  entrada: EntradaEncargo,
): Promise<ResultadoEncargo> {
  await requerirSesion();

  const parseo = esquema.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    select: { id: true },
  });
  if (!cotizacion) return { ok: false, error: "Esa cotización ya no existe." };

  const encargo = await prisma.encargo.create({
    data: { ...aFila(parseo.data), cotizacionId, estado: ESTADO_INICIAL },
    select: { id: true },
  });

  revalidar(encargo.id, cotizacionId);
  return { ok: true, id: encargo.id };
}

/**
 * Reescribe los datos del encargo. No toca el estado ni la cotización: el
 * estado tiene su propia acción porque además escribe marcas de tiempo, y
 * mover un encargo de cotización sería otro encargo.
 */
export async function actualizarEncargo(
  id: string,
  entrada: EntradaEncargo,
): Promise<ResultadoEncargo> {
  await requerirSesion();

  const parseo = esquema.safeParse(entrada);
  if (!parseo.success) {
    return { ok: false, error: parseo.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const existente = await prisma.encargo.findUnique({
    where: { id },
    select: { cotizacionId: true },
  });
  if (!existente) return { ok: false, error: "Ese encargo ya no existe." };

  await prisma.encargo.update({ where: { id }, data: aFila(parseo.data) });

  revalidar(id, existente.cotizacionId);
  return { ok: true, id };
}

/**
 * Cambia el estado y escribe la marca de tiempo que le corresponde.
 *
 * Se puede avanzar y retroceder libremente. La marca se REESCRIBE cada vez que
 * el encargo entra al estado: si se marcó "despachado" por error y tres días
 * después se despacha de verdad, la fecha buena es la última. Retroceder no
 * borra las marcas ya escritas — acá no se borra nada.
 */
export async function cambiarEstadoEncargo(
  id: string,
  estado: string,
): Promise<ResultadoEncargo> {
  await requerirSesion();

  const parseo = z.enum(estados).safeParse(estado);
  if (!parseo.success) return { ok: false, error: "Ese estado no existe." };

  const existente = await prisma.encargo.findUnique({
    where: { id },
    select: { cotizacionId: true, estado: true },
  });
  if (!existente) return { ok: false, error: "Ese encargo ya no existe." };

  const campo = campoMarca(parseo.data);

  await prisma.encargo.update({
    where: { id },
    data: {
      estado: parseo.data,
      ...(campo ? { [campo]: new Date() } : {}),
    },
  });

  revalidar(id, existente.cotizacionId);
  return { ok: true, id };
}
