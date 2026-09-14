/**
 * Dominio de los encargos: estados, destinos y los filtros de su lista.
 *
 * Una cotización es un producto publicado; un encargo es una persona pidiendo
 * ese producto, en una talla, para un destino. Varios clientes pueden pedir el
 * mismo producto: son varios encargos sobre la misma cotización, que nunca se
 * duplica.
 *
 * Puro y sin I/O a propósito: lo usan el servidor (para armar el `where` de
 * Prisma y decidir qué marca de tiempo escribir) y el cliente (el formulario y
 * los filtros). Igual que `lib/historial-filtros.ts`.
 */

import { buscarZona, calcularEnvioNacional, type ZonaEnvio } from "./envio";

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

/**
 * El recorrido normal es el orden de esta lista, pero NO es una máquina de
 * estados: se puede saltar y retroceder. En la operación real los paquetes se
 * devuelven y las marcas se corrigen, y un flujo rígido obligaría a inventar
 * transiciones falsas para arreglar un toque equivocado.
 */
export const ESTADOS = [
  { valor: "confirmado", etiqueta: "Confirmado" },
  { valor: "comprado", etiqueta: "Comprado" },
  { valor: "en_casillero", etiqueta: "En casillero" },
  { valor: "en_bogota", etiqueta: "En Bogotá" },
  { valor: "despachado", etiqueta: "Despachado" },
  { valor: "entregado", etiqueta: "Entregado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
] as const;

export type Estado = (typeof ESTADOS)[number]["valor"];

export const ESTADO_INICIAL: Estado = "confirmado";

/** Fuera del tablero: ya no hay nada que hacer con ellos. */
export const ESTADOS_TERMINALES: readonly Estado[] = ["entregado", "cancelado"];

export const ESTADOS_ACTIVOS: readonly Estado[] = ESTADOS.map((e) => e.valor).filter(
  (valor) => !ESTADOS_TERMINALES.includes(valor),
);

export function esEstado(valor: string | undefined | null): valor is Estado {
  return ESTADOS.some((e) => e.valor === valor);
}

export function esTerminal(estado: string): boolean {
  return ESTADOS_TERMINALES.includes(estado as Estado);
}

/** Si llegara un estado desconocido (fila vieja, dato a mano) se muestra crudo. */
export function etiquetaEstado(estado: string): string {
  return ESTADOS.find((e) => e.valor === estado)?.etiqueta ?? estado;
}

/**
 * Columna de marca de tiempo que corresponde a cada estado.
 *
 * `confirmado` no tiene: `createdAt` ya dice cuándo se confirmó, y una columna
 * extra que siempre valdría lo mismo solo se puede desincronizar.
 */
export const MARCA_POR_ESTADO = {
  comprado: "comprado_at",
  en_casillero: "en_casillero_at",
  en_bogota: "en_bogota_at",
  despachado: "despachado_at",
  entregado: "entregado_at",
  cancelado: "cancelado_at",
} as const satisfies Partial<Record<Estado, string>>;

export type CampoMarca = (typeof MARCA_POR_ESTADO)[keyof typeof MARCA_POR_ESTADO];

export function campoMarca(estado: Estado): CampoMarca | null {
  return estado in MARCA_POR_ESTADO
    ? MARCA_POR_ESTADO[estado as keyof typeof MARCA_POR_ESTADO]
    : null;
}

// ---------------------------------------------------------------------------
// Destinos
// ---------------------------------------------------------------------------

/**
 * San Marcos es su propio tipo y no "otra ciudad" porque tiene una regla
 * logística propia: ahí no se despacha uno por uno, se espera a que llegue todo
 * el lote y se manda junto. El tablero de la tajada 2 se apoya en esto.
 */
export const DESTINOS = [
  { valor: "bogota", etiqueta: "Bogotá" },
  { valor: "san_marcos", etiqueta: "San Marcos" },
  { valor: "otra_ciudad", etiqueta: "Otra ciudad" },
] as const;

export type DestinoTipo = (typeof DESTINOS)[number]["valor"];

export const DESTINO_POR_DEFECTO: DestinoTipo = "bogota";

export function esDestino(valor: string | undefined | null): valor is DestinoTipo {
  return DESTINOS.some((d) => d.valor === valor);
}

/** Solo "otra ciudad" necesita que digan cuál: las otras dos ya se nombran. */
export function requiereCiudad(destino: DestinoTipo): boolean {
  return destino === "otra_ciudad";
}

/** Para mostrar: en "otra ciudad" manda el nombre de la ciudad si lo hay. */
export function etiquetaDestino(destino: string, ciudad?: string | null): string {
  if (destino === "otra_ciudad" && ciudad?.trim()) return ciudad.trim();
  return DESTINOS.find((d) => d.valor === destino)?.etiqueta ?? destino;
}

// ---------------------------------------------------------------------------
// Envío sugerido
// ---------------------------------------------------------------------------

/**
 * Qué zona de la tabla de envío nacional corresponde a cada destino, en orden
 * de preferencia: la usuaria puede haber renombrado o borrado zonas en /config,
 * así que se toma la primera que exista y, si no hay ninguna, no se sugiere
 * nada. Es solo un pre-llenado — el campo queda editable.
 *
 * Los nombres son los de `ZONAS_ENVIO_DEFAULT`. `buscarZona` ignora mayúsculas
 * y espacios pero no tildes, de ahí el "Bogota" sin tilde como alternativa.
 */
export const ZONAS_POR_DESTINO: Record<DestinoTipo, readonly string[]> = {
  bogota: ["Bogotá", "Bogota"],
  san_marcos: ["Municipio", "Resto del país"],
  otra_ciudad: ["Ciudades principales", "Resto del país"],
};

/** Estimado del tramo nacional para ese destino, o null si no hay zona que valga. */
export function envioSugerido(
  zonas: ZonaEnvio[],
  peso_lb: number,
  destino: DestinoTipo,
): number | null {
  for (const nombre of ZONAS_POR_DESTINO[destino]) {
    const zona = buscarZona(zonas, nombre);
    if (zona) return calcularEnvioNacional(zona, peso_lb);
  }
  return null;
}

/**
 * Los tres estimados de una vez. El formulario los recibe ya calculados para
 * poder cambiar el envío al cambiar el destino sin volver al servidor.
 */
export function enviosSugeridos(
  zonas: ZonaEnvio[],
  peso_lb: number,
): Record<DestinoTipo, number | null> {
  return {
    bogota: envioSugerido(zonas, peso_lb, "bogota"),
    san_marcos: envioSugerido(zonas, peso_lb, "san_marcos"),
    otra_ciudad: envioSugerido(zonas, peso_lb, "otra_ciudad"),
  };
}

// ---------------------------------------------------------------------------
// Filtros de la lista
// ---------------------------------------------------------------------------

/** `activos` es todo lo que no está entregado ni cancelado; es lo que hay que trabajar. */
export type FiltroEstado = "activos" | "todos" | Estado;

export const FILTRO_ESTADO_POR_DEFECTO: FiltroEstado = "activos";

export const FILTROS_ESTADO: ReadonlyArray<{ valor: FiltroEstado; etiqueta: string }> = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "todos", etiqueta: "Todos" },
  ...ESTADOS.map((e) => ({ valor: e.valor as FiltroEstado, etiqueta: e.etiqueta })),
];

export function esFiltroEstado(valor: string | undefined | null): valor is FiltroEstado {
  return FILTROS_ESTADO.some((f) => f.valor === valor);
}

/**
 * Qué estados pide el filtro, o null para "todos" (sin condición). Devuelve una
 * lista y no un `where` de Prisma para que este módulo siga siendo puro y lo
 * pueda importar el cliente.
 */
export function estadosDelFiltro(filtro: FiltroEstado): Estado[] | null {
  if (filtro === "todos") return null;
  if (filtro === "activos") return [...ESTADOS_ACTIVOS];
  return [filtro];
}

export type FiltrosEncargos = {
  estado: FiltroEstado;
  /** Vacío = cualquier destino. */
  destino: "" | DestinoTipo;
};

export function hayFiltrosActivos(filtros: FiltrosEncargos): boolean {
  return filtros.estado !== FILTRO_ESTADO_POR_DEFECTO || Boolean(filtros.destino);
}

/** Cuántas filas se piden por lote, y el tope por consulta. */
export const LOTE_ENCARGOS = 40;
export const LIMITE_MAXIMO_ENCARGOS = 300;

/** Los query params tal como llegan, sin validar. */
export type ParamsEncargos = {
  estado?: string;
  destino?: string;
  limite?: string;
};

export function leerFiltrosEncargos(sp: ParamsEncargos): {
  filtros: FiltrosEncargos;
  limite: number;
} {
  const pedido = Number.parseInt(sp.limite ?? "", 10);
  return {
    filtros: {
      estado: esFiltroEstado(sp.estado) ? sp.estado : FILTRO_ESTADO_POR_DEFECTO,
      destino: esDestino(sp.destino) ? sp.destino : "",
    },
    limite: Math.min(
      Number.isFinite(pedido) && pedido > 0 ? pedido : LOTE_ENCARGOS,
      LIMITE_MAXIMO_ENCARGOS,
    ),
  };
}

/** Solo la query string, sin ruta ni `?`, para colgarla de cualquier URL. */
export function construirQueryEncargos(
  filtros: FiltrosEncargos,
  cambios: Partial<FiltrosEncargos> = {},
  limite?: number,
): string {
  const v = { ...filtros, ...cambios };
  const params = new URLSearchParams();

  if (v.estado !== FILTRO_ESTADO_POR_DEFECTO) params.set("estado", v.estado);
  if (v.destino) params.set("destino", v.destino);
  if (limite && limite > LOTE_ENCARGOS) params.set("limite", String(limite));

  return params.toString();
}

/** URL de la lista con los filtros aplicados; los valores por defecto se omiten. */
export function construirHrefEncargos(
  filtros: FiltrosEncargos,
  cambios: Partial<FiltrosEncargos> = {},
  limite?: number,
): string {
  const cadena = construirQueryEncargos(filtros, cambios, limite);
  return cadena ? `/encargos?${cadena}` : "/encargos";
}
