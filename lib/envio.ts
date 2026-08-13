/**
 * Tramo nacional en Colombia (Bogotá → destino final).
 *
 * El casillero de US entrega solo en Bogotá; desde ahí un segundo envío lleva
 * el paquete al pueblo, a otra ciudad o dentro de Bogotá. Es una tabla de
 * tarifas editable, no una integración: las transportadoras piden credenciales
 * corporativas y esto es un estimado que la usuaria redondea al responder por
 * chat.
 *
 * IMPORTANTE: este valor NO entra en el precio publicado. `precio_cop` se
 * calcula en `lib/cotizador.ts` y no conoce este módulo. El envío nacional es
 * una referencia aparte para responder "¿cuánto me sale a mi ciudad?".
 */

import type { ZonaEnvio } from "./settings-defaults";

export type { ZonaEnvio };

/**
 * Copia deliberada de la tolerancia de `lib/cotizador.ts` en vez de importarla:
 * ese módulo es el cálculo del precio publicado y no se toca en esta iteración.
 * Sin la tolerancia, un bruto que cae justo sobre un múltiplo puede quedar en
 * 20000.0000000001 y saltar al siguiente.
 */
const EPSILON = 1e-9;

/**
 * Paso de redondeo del envío. A propósito NO es `redondeo_cop`.
 *
 * `redondeo_cop` (5.000) es del precio publicado: ahí redondear hacia arriba se
 * ve mejor y protege el margen. Sobre un envío ese mismo paso distorsiona
 * demasiado — 17.200 se convertía en 20.000, casi 3.000 de más sobre un número
 * que la usuaria le dice a una clienta como referencia. Con 500 el estimado
 * queda fino y sigue siendo un número redondo de decir por chat.
 *
 * Constante local y no campo de `Settings`: no hay evidencia de que necesite
 * configurarse, y cada campo extra en Config es ruido.
 */
export const REDONDEO_ENVIO_COP = 500;

/**
 * `tarifa_base_cop + (peso_lb × adicional_lb_cop)`, redondeado hacia arriba al
 * múltiplo de `REDONDEO_ENVIO_COP`.
 *
 * No recibe `redondeo_cop`: ese parámetro existía y se pasaba desde Settings,
 * pero su uso quedó exclusivo de `precio_cop`. Quitarlo de la firma hace que la
 * regla sea estructural y no una convención que se pueda romper sin querer.
 */
export function calcularEnvioNacional(zona: ZonaEnvio, peso_lb: number): number {
  const peso = Math.max(0, peso_lb || 0);
  const base = Math.max(0, zona.tarifa_base_cop || 0);
  const adicional = Math.max(0, zona.adicional_lb_cop || 0);

  const bruto = base + peso * adicional;

  // Math.max evita que un bruto de 0 devuelva -0.
  return Math.max(0, Math.ceil(bruto / REDONDEO_ENVIO_COP - EPSILON) * REDONDEO_ENVIO_COP);
}

/** Busca una zona por nombre, sin distinguir mayúsculas ni espacios sobrantes. */
export function buscarZona(zonas: ZonaEnvio[], nombre?: string | null): ZonaEnvio | null {
  if (!nombre) return null;
  const buscado = nombre.trim().toLowerCase();
  if (!buscado) return null;
  return zonas.find((z) => z.nombre.trim().toLowerCase() === buscado) ?? null;
}
