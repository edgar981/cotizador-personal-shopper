import { describe, expect, it } from "vitest";
import { calcularComision, porcentajeVisible } from "./comision";

describe("calcularComision", () => {
  it("reparte el margen según el porcentaje", () => {
    // 125.052 × 10% = 12.505,20 → quedan 112.546,80
    const r = calcularComision(125052, 0.1);
    expect(r.comision_cop).toBeCloseTo(12505.2, 2);
    expect(r.margen_neto_cop).toBeCloseTo(112546.8, 2);
  });

  it("las dos líneas siempre suman el margen", () => {
    for (const [margen, pct] of [
      [125052, 0.1],
      [333333.33, 0.15],
      [1, 0.33],
      [99999.99, 0.075],
    ] as const) {
      const r = calcularComision(margen, pct);
      expect(r.comision_cop + r.margen_neto_cop).toBeCloseTo(margen, 2);
    }
  });

  it("con 0% la comisión es cero y el neto es todo el margen", () => {
    expect(calcularComision(125052, 0)).toEqual({
      comision_cop: 0,
      margen_neto_cop: 125052,
    });
  });

  it("con 100% no queda nada de neto", () => {
    expect(calcularComision(80000, 1)).toEqual({
      comision_cop: 80000,
      margen_neto_cop: 0,
    });
  });

  it("con margen cero no hay nada que repartir", () => {
    expect(calcularComision(0, 0.2)).toEqual({ comision_cop: 0, margen_neto_cop: 0 });
  });

  it("ignora entradas negativas en vez de devolver valores absurdos", () => {
    expect(calcularComision(-5000, 0.1)).toEqual({ comision_cop: 0, margen_neto_cop: 0 });
    expect(calcularComision(10000, -0.1)).toEqual({ comision_cop: 0, margen_neto_cop: 10000 });
  });

  it("no arrastra ruido de punto flotante", () => {
    const r = calcularComision(0.1 + 0.2, 0.1);
    expect(r.comision_cop).toBe(0.03);
    expect(r.margen_neto_cop).toBe(0.27);
  });

  it("no depende del precio publicado: solo del margen", () => {
    // El mismo margen da la misma comisión aunque el precio fuera otro.
    expect(calcularComision(50000, 0.12)).toEqual(calcularComision(50000, 0.12));
    expect(calcularComision(50000, 0.12).comision_cop).toBe(6000);
  });
});

describe("porcentajeVisible", () => {
  it("pasa de fracción a porcentaje sin decimales de ruido", () => {
    expect(porcentajeVisible(0.1)).toBe(10);
    expect(porcentajeVisible(0.075)).toBe(7.5);
    expect(porcentajeVisible(0)).toBe(0);
    expect(porcentajeVisible(1)).toBe(100);
  });
});
