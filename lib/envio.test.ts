import { describe, expect, it } from "vitest";
import { buscarZona, calcularEnvioNacional } from "./envio";
import { normalizarZonas, ZONAS_ENVIO_DEFAULT, type ZonaEnvio } from "./settings-defaults";

const bogota: ZonaEnvio = { nombre: "Bogotá", tarifa_base_cop: 12000, adicional_lb_cop: 2000 };

describe("calcularEnvioNacional", () => {
  it("suma la tarifa base y el adicional por libra", () => {
    // 12.000 + 2,6 × 2.000 = 17.200 → sube al múltiplo de 5.000
    expect(calcularEnvioNacional(bogota, 2.6, 5000)).toBe(20000);
  });

  it("no sube de múltiplo cuando el bruto cae exactamente en el límite", () => {
    // 12.000 + 4 × 2.000 = 20.000, que ya es múltiplo de 5.000
    expect(calcularEnvioNacional(bogota, 4, 5000)).toBe(20000);
  });

  it("con peso cero cobra solo la tarifa base", () => {
    expect(calcularEnvioNacional({ ...bogota, tarifa_base_cop: 15000 }, 0, 5000)).toBe(15000);
  });

  it("redondea hacia arriba con otros pasos", () => {
    // 22.000 + 1,5 × 3.000 = 26.500 → múltiplo de 1.000
    const resto: ZonaEnvio = {
      nombre: "Resto del país",
      tarifa_base_cop: 22000,
      adicional_lb_cop: 3000,
    };
    expect(calcularEnvioNacional(resto, 1.5, 1000)).toBe(27000);
  });

  it("trata un redondeo inválido como paso de 1", () => {
    expect(calcularEnvioNacional(bogota, 1, 0)).toBe(14000);
  });

  it("ignora pesos y tarifas negativas en vez de devolver valores absurdos", () => {
    expect(calcularEnvioNacional(bogota, -5, 1000)).toBe(12000);
    expect(calcularEnvioNacional({ ...bogota, tarifa_base_cop: -1 }, 0, 1000)).toBe(0);
  });

  it("nunca devuelve -0", () => {
    const gratis: ZonaEnvio = { nombre: "X", tarifa_base_cop: 0, adicional_lb_cop: 0 };
    expect(Object.is(calcularEnvioNacional(gratis, 0, 5000), -0)).toBe(false);
    expect(calcularEnvioNacional(gratis, 0, 5000)).toBe(0);
  });
});

describe("buscarZona", () => {
  it("encuentra la zona sin distinguir mayúsculas ni espacios", () => {
    expect(buscarZona(ZONAS_ENVIO_DEFAULT, "  bogotá ")?.nombre).toBe("Bogotá");
  });

  it("devuelve null cuando la zona ya no existe en la configuración", () => {
    expect(buscarZona(ZONAS_ENVIO_DEFAULT, "Medellín")).toBeNull();
    expect(buscarZona(ZONAS_ENVIO_DEFAULT, null)).toBeNull();
    expect(buscarZona(ZONAS_ENVIO_DEFAULT, "   ")).toBeNull();
  });
});

describe("normalizarZonas", () => {
  it("usa las zonas de referencia cuando la columna viene de antes de la migración", () => {
    expect(normalizarZonas(null)).toEqual(ZONAS_ENVIO_DEFAULT);
    expect(normalizarZonas(undefined)).toEqual(ZONAS_ENVIO_DEFAULT);
  });

  it("respeta el array vacío: borrar todas las zonas es una decisión", () => {
    expect(normalizarZonas([])).toEqual([]);
  });

  it("descarta filas incompletas, negativas o repetidas", () => {
    const zonas = normalizarZonas([
      { nombre: "Bogotá", tarifa_base_cop: 12000, adicional_lb_cop: 2000 },
      { nombre: "  ", tarifa_base_cop: 1, adicional_lb_cop: 1 },
      { nombre: "Cali", tarifa_base_cop: -1, adicional_lb_cop: 1 },
      { nombre: "Cali", tarifa_base_cop: 1, adicional_lb_cop: -1 },
      { nombre: "BOGOTÁ", tarifa_base_cop: 99999, adicional_lb_cop: 1 },
      { nombre: "Cali", tarifa_base_cop: 16000, adicional_lb_cop: 2500 },
    ]);

    expect(zonas).toEqual([
      { nombre: "Bogotá", tarifa_base_cop: 12000, adicional_lb_cop: 2000 },
      { nombre: "Cali", tarifa_base_cop: 16000, adicional_lb_cop: 2500 },
    ]);
  });

  it("acepta tarifas en cero (envío incluido o recogida en punto)", () => {
    expect(normalizarZonas([{ nombre: "Recoge", tarifa_base_cop: 0, adicional_lb_cop: 0 }])).toEqual(
      [{ nombre: "Recoge", tarifa_base_cop: 0, adicional_lb_cop: 0 }],
    );
  });
});
