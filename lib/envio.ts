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
 * `tarifa_base_cop + (peso_lb × adicional_lb_cop)`, redondeado hacia arriba al
 * múltiplo de `redondeo_cop` (el mismo de Settings que usa el precio).
 */
export function calcularEnvioNacional(
  zona: ZonaEnvio,
  peso_lb: number,
  redondeo_cop: number,
): number {
  const peso = Math.max(0, peso_lb || 0);
  const base = Math.max(0, zona.tarifa_base_cop || 0);
  const adicional = Math.max(0, zona.adicional_lb_cop || 0);

  const bruto = base + peso * adicional;
  const paso = redondeo_cop > 0 ? redondeo_cop : 1;

  // Math.max evita que un bruto de 0 devuelva -0.
  return Math.max(0, Math.ceil(bruto / paso - EPSILON) * paso);
}

/** Busca una zona por nombre, sin distinguir mayúsculas ni espacios sobrantes. */
export function buscarZona(zonas: ZonaEnvio[], nombre?: string | null): ZonaEnvio | null {
  if (!nombre) return null;
  const buscado = nombre.trim().toLowerCase();
  if (!buscado) return null;
  return zonas.find((z) => z.nombre.trim().toLowerCase() === buscado) ?? null;
}
