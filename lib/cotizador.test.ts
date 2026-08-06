import { describe, expect, it } from "vitest";
import {
  calcularCotizacion,
  formatearCOP,
  type ParametrosCotizacion,
} from "./cotizador";

const base: ParametrosCotizacion = {
  precio_usd: 100,
  peso_lb: 2.6,
  sales_tax_pct: 0.07,
  tarifa_lb_usd: 6,
  trm_oficial: 4000,
  trm_buffer_pct: 0.02,
  margen_pct: 0.25,
  redondeo_cop: 5000,
};

describe("calcularCotizacion", () => {
  it("calcula el desglose completo de un par de tenis", () => {
    const r = calcularCotizacion(base);

    expect(r.tax_usd).toBe(7);
    expect(r.flete_usd).toBe(15.6);
    expect(r.aterrizado_usd).toBe(122.6);
    expect(r.trm_aplicada).toBe(4080);
    expect(r.costo_cop).toBeCloseTo(500208, 2);
    expect(r.margen_cop).toBeCloseTo(125052, 2);
    expect(r.subtotal_cop).toBeCloseTo(625260, 2);
    // 625.260 / 5.000 = 125,052 → sube al múltiplo 126
    expect(r.precio_cop).toBe(630000);
  });

  it("no sube de múltiplo cuando el subtotal cae exactamente en el límite", () => {
    const r = calcularCotizacion({
      ...base,
      peso_lb: 0,
      sales_tax_pct: 0,
      tarifa_lb_usd: 0,
      trm_buffer_pct: 0,
    });

    // 100 USD × 4.000 = 400.000 de costo; +25% = 500.000, múltiplo exacto de 5.000
    expect(r.subtotal_cop).toBe(500000);
    expect(r.precio_cop).toBe(500000);
  });

  it("sube al siguiente múltiplo apenas se pasa del límite", () => {
    const r = calcularCotizacion({
      ...base,
      precio_usd: 100.01,
      peso_lb: 0,
      sales_tax_pct: 0,
      tarifa_lb_usd: 0,
      trm_buffer_pct: 0,
    });

    expect(r.subtotal_cop).toBe(500050);
    expect(r.precio_cop).toBe(505000);
  });

  it("aplica TRM real, margen y redondeo a 1.000 en un perfume", () => {
    const r = calcularCotizacion({
      precio_usd: 89.99,
      peso_lb: 1.1,
      sales_tax_pct: 0.07,
      tarifa_lb_usd: 6,
      trm_oficial: 3204.51,
      trm_buffer_pct: 0.02,
      margen_pct: 0.3,
      redondeo_cop: 1000,
    });

    expect(r.tax_usd).toBe(6.3);
    expect(r.flete_usd).toBe(6.6);
    expect(r.aterrizado_usd).toBe(102.89);
    expect(r.trm_aplicada).toBe(3268.6);
    expect(r.precio_cop).toBe(438000);
    expect(r.precio_cop % 1000).toBe(0);
  });

  it("no redondea cuando redondeo_cop es 0", () => {
    const r = calcularCotizacion({ ...base, redondeo_cop: 0 });
    expect(r.precio_cop).toBe(Math.ceil(r.subtotal_cop));
  });

  it("trata precio y peso vacíos como cero", () => {
    const r = calcularCotizacion({ ...base, precio_usd: NaN, peso_lb: NaN });
    expect(r.precio_cop).toBe(0);
    expect(r.costo_cop).toBe(0);
  });
});

describe("formatearCOP", () => {
  it("usa punto como separador de miles", () => {
    expect(formatearCOP(1234000)).toBe("$ 1.234.000");
    expect(formatearCOP(630000)).toBe("$ 630.000");
  });
});
