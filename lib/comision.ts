/**
 * Reparto del margen: cuánto de lo que deja una cotización se va en comisión y
 * cuánto queda limpio.
 *
 * Se calcula sobre `margen_cop`, NO sobre `precio_cop`: es una porción de lo
 * que la cotización gana, no del precio que paga la clienta. Por eso el precio
 * publicado no cambia y la comisión nunca sale en la historia — es información
 * interna del negocio.
 *
 * Vive aparte de `lib/cotizador.ts`, que sigue siendo solo el cálculo del
 * precio publicado y no se toca.
 */

export type DesgloseComision = {
  comision_cop: number;
  /** Lo que queda del margen después de la comisión. */
  margen_neto_cop: number;
};

/** Copia local: `lib/cotizador.ts` no se modifica en esta iteración. */
function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/**
 * `comision_cop = margen_cop × comision_pct`, y el neto es el resto.
 *
 * `comision_pct` va en fracción (0.1 = 10%), como los demás porcentajes de
 * Settings. El neto se calcula restando la comisión ya redondeada para que
 * las dos líneas sumen exactamente el margen y el desglose cuadre a la vista.
 */
export function calcularComision(margen_cop: number, comision_pct: number): DesgloseComision {
  const margen = Math.max(0, margen_cop || 0);
  const pct = Math.max(0, comision_pct || 0);

  const comision_cop = redondear(margen * pct, 2);
  const margen_neto_cop = redondear(margen - comision_cop, 2);

  return { comision_cop, margen_neto_cop };
}

/** Fracción (0.1) a porcentaje para mostrar (10). Sin decimales de ruido. */
export function porcentajeVisible(fraccion: number): number {
  return Math.round((fraccion || 0) * 10000) / 100;
}
