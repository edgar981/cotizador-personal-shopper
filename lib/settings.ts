import "server-only";
import { prisma } from "./prisma";
import { normalizarPesos, normalizarZonas, SETTINGS_DEFAULTS, SETTINGS_ID } from "./settings-defaults";

export {
  SETTINGS_DEFAULTS,
  SETTINGS_ID,
  ZONAS_ENVIO_DEFAULT,
  normalizarPesos,
  normalizarZonas,
  type SettingsPlano,
  type ZonaEnvio,
} from "./settings-defaults";

import type { SettingsPlano } from "./settings-defaults";

/**
 * Devuelve la fila singleton de configuración, creándola con los defaults si
 * todavía no existe (la app nunca debe quedarse sin config).
 */
export async function obtenerSettings(): Promise<SettingsPlano> {
  const fila = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...SETTINGS_DEFAULTS },
    update: {},
  });

  return {
    margen_pct: fila.margen_pct,
    tarifa_lb_usd: fila.tarifa_lb_usd,
    sales_tax_pct: fila.sales_tax_pct,
    trm_buffer_pct: fila.trm_buffer_pct,
    redondeo_cop: fila.redondeo_cop,
    comision_pct: fila.comision_pct,
    pesos_categoria: normalizarPesos(fila.pesos_categoria),
    zonas_envio: normalizarZonas(fila.zonas_envio),
    ig_handle: fila.ig_handle,
    lema: fila.lema,
    color_marca: fila.color_marca,
  };
}
