/**
 * Constantes y tipos de configuración. Sin I/O y sin `server-only`: los importa
 * tanto el seed como los componentes de cliente (solo el tipo).
 */

export const SETTINGS_ID = "config";

/** Una fila de la tabla del tramo nacional (Bogotá → destino final). */
export type ZonaEnvio = {
  nombre: string;
  tarifa_base_cop: number;
  adicional_lb_cop: number;
};

/**
 * Zonas iniciales de referencia. Los nombres y valores son estimaciones
 * nuestras, no tarifas reales de ninguna transportadora: se editan enteras
 * desde /config. TODO(cliente).
 */
export const ZONAS_ENVIO_DEFAULT: ZonaEnvio[] = [
  { nombre: "Bogotá", tarifa_base_cop: 12000, adicional_lb_cop: 2000 },
  { nombre: "Ciudades principales", tarifa_base_cop: 16000, adicional_lb_cop: 2500 },
  { nombre: "Resto del país", tarifa_base_cop: 22000, adicional_lb_cop: 3000 },
  { nombre: "Municipio", tarifa_base_cop: 20000, adicional_lb_cop: 3000 },
];

/** Valores iniciales de referencia. TODO(cliente): ajustar a tarifas reales. */
export const SETTINGS_DEFAULTS = {
  margen_pct: 0.25,
  tarifa_lb_usd: 6,
  sales_tax_pct: 0.07,
  trm_buffer_pct: 0.02,
  redondeo_cop: 5000,
  pesos_categoria: {
    tenis: 2.6,
    ropa: 1.1,
    perfume: 1.1,
    bolso: 2.2,
    maquillaje: 0.7,
    reloj: 1.1,
    suplementos: 1.5,
  } as Record<string, number>,
  zonas_envio: ZONAS_ENVIO_DEFAULT,
  ig_handle: "@tutienda",
  lema: "De USA a tu puerta",
  color_marca: "#E11D74",
};

export type SettingsPlano = {
  margen_pct: number;
  tarifa_lb_usd: number;
  sales_tax_pct: number;
  trm_buffer_pct: number;
  redondeo_cop: number;
  pesos_categoria: Record<string, number>;
  zonas_envio: ZonaEnvio[];
  ig_handle: string;
  lema: string;
  color_marca: string;
};

/** Normaliza el Json de Prisma a un mapa categoría → peso en libras. */
export function normalizarPesos(valor: unknown): Record<string, number> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const salida: Record<string, number> = {};
  for (const [categoria, peso] of Object.entries(valor as Record<string, unknown>)) {
    const n = Number(peso);
    if (categoria.trim() && Number.isFinite(n) && n > 0) salida[categoria.trim()] = n;
  }
  return salida;
}

/**
 * Normaliza el Json de Prisma a la tabla de zonas de envío.
 *
 * `null`/`undefined` significa que la fila es anterior a esta feature: se
 * arranca con las zonas de referencia para que la usuaria vea algo editable.
 * Un array vacío es distinto: es una decisión explícita (borró todas las
 * zonas) y se respeta dejando la sección apagada.
 */
export function normalizarZonas(valor: unknown): ZonaEnvio[] {
  if (valor === null || valor === undefined || !Array.isArray(valor)) {
    // Copia: quien reciba esto no debe poder mutar la constante del módulo.
    return ZONAS_ENVIO_DEFAULT.map((zona) => ({ ...zona }));
  }

  const salida: ZonaEnvio[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const fila = item as Record<string, unknown>;

    const nombre = typeof fila.nombre === "string" ? fila.nombre.trim() : "";
    const base = Number(fila.tarifa_base_cop);
    const adicional = Number(fila.adicional_lb_cop);
    if (!nombre) continue;
    if (!Number.isFinite(base) || base < 0) continue;
    if (!Number.isFinite(adicional) || adicional < 0) continue;
    // Sin duplicados: el nombre es la clave con la que se guarda la cotización.
    if (salida.some((z) => z.nombre.toLowerCase() === nombre.toLowerCase())) continue;

    salida.push({ nombre, tarifa_base_cop: base, adicional_lb_cop: adicional });
  }
  return salida;
}
