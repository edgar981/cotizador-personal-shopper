import { describe, expect, it } from "vitest";
import { buscarZona, calcularEnvioNacional } from "./envio";
import { normalizarZonas, ZONAS_ENVIO_DEFAULT, type ZonaEnvio } from "./settings-defaults";

const bogota: ZonaEnvio = { nombre: "Bogotá", tarifa_base_cop: 12000, adicional_lb_cop: 2000 };

describe("calcularEnvioNacional", () => {
  it("redondea a 500 y no al redondeo del precio publicado", () => {
    // 12.000 + 2,6 × 2.000 = 17.200. Con el paso de 5.000 daba 20.000, casi
    // 3.000 de más; con 500 queda en 17.500.
    expect(calcularEnvioNacional(bogota, 2.6)).toBe(17500);
  });

  it("no sube de múltiplo cuando el bruto cae exactamente en el límite", () => {
    // 12.000 + 1,25 × 2.000 = 14.500, que ya es múltiplo de 500.
    expect(calcularEnvioNacional(bogota, 1.25)).toBe(14500);
  });

  it("tampoco sube cuando el bruto es la tarifa base y ya es múltiplo de 500", () => {
    expect(calcularEnvioNacional({ ...bogota, adicional_lb_cop: 0 }, 3.4)).toBe(12000);
  });

  it("con peso cero cobra solo la tarifa base", () => {
    expect(calcularEnvioNacional({ ...bogota, tarifa_base_cop: 15000 }, 0)).toBe(15000);
  });

  it("con tarifa plana (adicional 0) el peso no cambia el envío", () => {
    const plana: ZonaEnvio = { nombre: "Bogotá", tarifa_base_cop: 16000, adicional_lb_cop: 0 };
    expect(calcularEnvioNacional(plana, 0.5)).toBe(16000);
    expect(calcularEnvioNacional(plana, 2.6)).toBe(16000);
    expect(calcularEnvioNacional(plana, 12)).toBe(16000);
  });

  it("ignora pesos y tarifas negativas en vez de devolver valores absurdos", () => {
    expect(calcularEnvioNacional(bogota, -5)).toBe(12000);
    expect(calcularEnvioNacional({ ...bogota, tarifa_base_cop: -1 }, 0)).toBe(0);
  });

  it("nunca devuelve -0", () => {
    const gratis: ZonaEnvio = { nombre: "X", tarifa_base_cop: 0, adicional_lb_cop: 0 };
    expect(Object.is(calcularEnvioNacional(gratis, 0), -0)).toBe(false);
    expect(calcularEnvioNacional(gratis, 0)).toBe(0);
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
