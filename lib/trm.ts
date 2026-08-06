import "server-only";
import { prisma } from "./prisma";

/**
 * TRM oficial (Superfinanciera / Banco de la República) publicada en
 * datos.gov.co, dataset `32sa-8pi3` (serie histórica de la TRM).
 *
 * Se cachea una fila por día de consulta. Si la API falla, se usa el último
 * valor cacheado y la UI muestra la fecha de vigencia de esa TRM.
 */
const TRM_ENDPOINT = "https://www.datos.gov.co/resource/32sa-8pi3.json";
const TIMEOUT_MS = 8000;

export type Trm = {
  /** Valor en COP por USD. */
  valor: number;
  /** Fecha de vigencia de la TRM, "YYYY-MM-DD". */
  vigencia: string;
  /** true cuando la API falló y se usó el último valor conocido. */
  desdeCache: boolean;
};

/** Fecha de hoy en Bogotá como "YYYY-MM-DD". */
export function diaBogota(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

async function consultarApi(dia: string): Promise<{ valor: number; vigencia: string } | null> {
  const url = new URL(TRM_ENDPOINT);
  url.searchParams.set("$where", `vigenciadesde <= '${dia}T00:00:00.000'`);
  url.searchParams.set("$order", "vigenciadesde DESC");
  url.searchParams.set("$limit", "1");

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const filas = (await res.json()) as Array<{ valor?: string; vigenciadesde?: string }>;
  const fila = filas?.[0];
  const valor = Number(fila?.valor);
  if (!fila?.vigenciadesde || !Number.isFinite(valor) || valor <= 0) return null;

  return { valor, vigencia: fila.vigenciadesde.slice(0, 10) };
}

/**
 * Devuelve la TRM vigente hoy. Nunca lanza: si no hay API ni caché, devuelve
 * `null` y quien llama decide qué mostrar.
 */
export async function obtenerTrm(): Promise<Trm | null> {
  const dia = diaBogota();

  const cacheHoy = await prisma.trmCache.findUnique({ where: { dia } }).catch(() => null);
  if (cacheHoy) {
    return { valor: cacheHoy.valor, vigencia: cacheHoy.vigencia, desdeCache: false };
  }

  try {
    const fresca = await consultarApi(dia);
    if (fresca) {
      await prisma.trmCache
        .upsert({
          where: { dia },
          create: { dia, valor: fresca.valor, vigencia: fresca.vigencia },
          update: { valor: fresca.valor, vigencia: fresca.vigencia },
        })
        .catch(() => null);
      return { ...fresca, desdeCache: false };
    }
  } catch {
    // La API falló o se pasó del timeout: caemos al último valor conocido.
  }

  const ultima = await prisma.trmCache
    .findFirst({ orderBy: { dia: "desc" } })
    .catch(() => null);
  if (ultima) {
    return { valor: ultima.valor, vigencia: ultima.vigencia, desdeCache: true };
  }

  return null;
}
