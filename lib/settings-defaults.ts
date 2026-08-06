/**
 * Constantes y tipos de configuración. Sin I/O y sin `server-only`: los importa
 * tanto el seed como los componentes de cliente (solo el tipo).
 */

export const SETTINGS_ID = "config";

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
