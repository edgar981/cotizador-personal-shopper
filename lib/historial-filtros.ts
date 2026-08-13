/**
 * Filtros del historial: períodos en zona horaria de Bogotá y construcción de
 * la URL que los transporta.
 *
 * Puro y sin I/O a propósito: lo usan la página (servidor, para armar el
 * `where` de Prisma) y los chips (cliente, para navegar). Los filtros viven en
 * query params para que ir al detalle y volver con el botón atrás los conserve.
 */

export type Periodo = "todo" | "hoy" | "ayer" | "7dias";

export const PERIODO_POR_DEFECTO: Periodo = "todo";

export const PERIODOS: ReadonlyArray<{ valor: Periodo; etiqueta: string }> = [
  { valor: "todo", etiqueta: "Todo" },
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ayer", etiqueta: "Ayer" },
  { valor: "7dias", etiqueta: "Últimos 7 días" },
];

export function esPeriodo(valor: string | undefined | null): valor is Periodo {
  return PERIODOS.some((p) => p.valor === valor);
}

/**
 * Colombia no tiene horario de verano: es UTC-5 todo el año desde 1993. Por eso
 * alcanza un desplazamiento fijo y no hace falta una librería de zonas.
 */
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

/**
 * Instante UTC en que empieza, en Bogotá, el día que contiene a `momento`
 * (o el de `diasAtras` días antes).
 */
export function inicioDelDiaBogota(momento: Date, diasAtras = 0): Date {
  // Corrido -5h, la fecha UTC de este instante es la fecha de pared en Bogotá.
  const pared = new Date(momento.getTime() - OFFSET_BOGOTA_MS);
  const inicio = Date.UTC(
    pared.getUTCFullYear(),
    pared.getUTCMonth(),
    // Date.UTC normaliza solo el desbordamiento de mes y año.
    pared.getUTCDate() - diasAtras,
  );
  return new Date(inicio + OFFSET_BOGOTA_MS);
}

export type RangoFechas = { gte?: Date; lt?: Date };

/** Rango `[gte, lt)` del período, o vacío para "Todo". */
export function rangoPeriodo(periodo: Periodo, ahora: Date): RangoFechas {
  const hoy = inicioDelDiaBogota(ahora);
  switch (periodo) {
    case "hoy":
      return { gte: hoy };
    case "ayer":
      return { gte: inicioDelDiaBogota(ahora, 1), lt: hoy };
    case "7dias":
      // Hoy más los seis días anteriores: siete días de calendario.
      return { gte: inicioDelDiaBogota(ahora, 6) };
    default:
      return {};
  }
}

/** Cuántas filas se piden por lote. */
export const LOTE_HISTORIAL = 30;

export type FiltrosHistorial = {
  q: string;
  categoria: string;
  periodo: Periodo;
};

export const FILTROS_VACIOS: FiltrosHistorial = {
  q: "",
  categoria: "",
  periodo: PERIODO_POR_DEFECTO,
};

export function hayFiltrosActivos(filtros: FiltrosHistorial): boolean {
  return Boolean(filtros.q.trim() || filtros.categoria) || filtros.periodo !== PERIODO_POR_DEFECTO;
}

/** Tope de filas por consulta, para que nadie pida 50.000 por la URL. */
export const LIMITE_MAXIMO = 300;

/** Los query params tal como llegan, sin validar. */
export type ParamsHistorial = {
  q?: string;
  categoria?: string;
  periodo?: string;
  limite?: string;
};

/**
 * Lee y sanea los query params. Lo usan las dos pantallas —el listado para
 * consultar, el detalle para reconstruir el enlace de volver— y por eso vive
 * acá: si cada una parseara por su lado, un período inválido podría filtrarse
 * en una y no en la otra.
 */
export function leerFiltros(sp: ParamsHistorial): {
  filtros: FiltrosHistorial;
  limite: number;
} {
  const pedido = Number.parseInt(sp.limite ?? "", 10);
  return {
    filtros: {
      q: (sp.q ?? "").trim(),
      categoria: (sp.categoria ?? "").trim(),
      periodo: esPeriodo(sp.periodo) ? sp.periodo : PERIODO_POR_DEFECTO,
    },
    limite: Math.min(
      Number.isFinite(pedido) && pedido > 0 ? pedido : LOTE_HISTORIAL,
      LIMITE_MAXIMO,
    ),
  };
}

/**
 * Solo la query string, sin ruta ni `?`. Sirve para colgarla de cualquier URL
 * —por ejemplo la del detalle, que así puede devolver a los filtros activos.
 */
export function construirQuery(
  filtros: FiltrosHistorial,
  cambios: Partial<FiltrosHistorial> = {},
  limite?: number,
): string {
  const v = { ...filtros, ...cambios };
  const params = new URLSearchParams();

  if (v.q.trim()) params.set("q", v.q.trim());
  if (v.categoria) params.set("categoria", v.categoria);
  if (v.periodo !== PERIODO_POR_DEFECTO) params.set("periodo", v.periodo);
  if (limite && limite > LOTE_HISTORIAL) params.set("limite", String(limite));

  return params.toString();
}

/**
 * URL del historial con los filtros aplicados. Los valores por defecto se
 * omiten para que la URL quede limpia cuando no hay nada filtrado.
 */
export function construirHref(
  filtros: FiltrosHistorial,
  cambios: Partial<FiltrosHistorial> = {},
  limite?: number,
): string {
  const cadena = construirQuery(filtros, cambios, limite);
  return cadena ? `/historial?${cadena}` : "/historial";
}
