/**
 * Lógica del cotizador. Función pura, sin I/O: recibe el precio del producto y
 * los parámetros vigentes, devuelve el desglose completo en USD y COP.
 *
 * Se usa en tres lugares y siempre debe dar el mismo resultado:
 *  - el desglose en vivo del formulario (cliente),
 *  - el snapshot que se guarda en `Cotizacion` (servidor),
 *  - los tests unitarios.
 */

export type ParametrosCotizacion = {
  /** Precio de lista en el retailer de US. */
  precio_usd: number;
  /** Peso facturable del envío, en libras. */
  peso_lb: number;
  /** Sales tax US estimado, en fracción (0.07 = 7%). */
  sales_tax_pct: number;
  /** Tarifa del casillero por libra, en USD. */
  tarifa_lb_usd: number;
  /** TRM oficial del día (COP por USD). */
  trm_oficial: number;
  /** Colchón sobre la TRM oficial, en fracción (0.02 = 2%). */
  trm_buffer_pct: number;
  /** Margen sobre el costo aterrizado en COP, en fracción (0.25 = 25%). */
  margen_pct: number;
  /** Redondear el precio final hacia arriba a múltiplos de este valor. */
  redondeo_cop: number;
};

export type DesgloseCotizacion = {
  tax_usd: number;
  flete_usd: number;
  aterrizado_usd: number;
  trm_aplicada: number;
  costo_cop: number;
  margen_cop: number;
  /** Costo + margen antes de redondear. */
  subtotal_cop: number;
  /** Precio final redondeado que se publica. */
  precio_cop: number;
};

/**
 * Tolerancia para el redondeo final. Sin ella, un subtotal que cae exactamente
 * sobre un múltiplo (p. ej. 500000) puede quedar en 500000.0000000001 por error
 * de punto flotante y saltar al siguiente múltiplo.
 */
const EPSILON = 1e-9;

/** Redondea a `decimales` posiciones para evitar arrastrar ruido de punto flotante. */
function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

export function calcularCotizacion(p: ParametrosCotizacion): DesgloseCotizacion {
  const precio_usd = Math.max(0, p.precio_usd || 0);
  const peso_lb = Math.max(0, p.peso_lb || 0);

  const tax_usd = redondear(precio_usd * p.sales_tax_pct, 2);
  const flete_usd = redondear(peso_lb * p.tarifa_lb_usd, 2);
  const aterrizado_usd = redondear(precio_usd + tax_usd + flete_usd, 2);

  const trm_aplicada = redondear(p.trm_oficial * (1 + p.trm_buffer_pct), 2);
  const costo_cop = redondear(aterrizado_usd * trm_aplicada, 2);
  const margen_cop = redondear(costo_cop * p.margen_pct, 2);
  const subtotal_cop = redondear(costo_cop + margen_cop, 2);

  const paso = p.redondeo_cop > 0 ? p.redondeo_cop : 1;
  // Math.max evita que un subtotal de 0 devuelva -0.
  const precio_cop = Math.max(0, Math.ceil(subtotal_cop / paso - EPSILON) * paso);

  return {
    tax_usd,
    flete_usd,
    aterrizado_usd,
    trm_aplicada,
    costo_cop,
    margen_cop,
    subtotal_cop,
    precio_cop,
  };
}

/** Formatea un valor COP como `$ 1.234.000` (sin decimales). */
export function formatearCOP(valor: number): string {
  const entero = Math.round(valor);
  return `$ ${entero.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

/** Formatea una TRM como `$ 3.268,60`. */
export function formatearTRM(valor: number): string {
  return `$ ${valor.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Formatea un valor USD como `US$ 129.99`. */
export function formatearUSD(valor: number): string {
  return `US$ ${valor.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
