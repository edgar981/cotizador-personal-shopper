import { describe, expect, it } from "vitest";
import {
  campoMarca,
  construirHrefEncargos,
  DESTINOS,
  ESTADOS,
  ESTADOS_ACTIVOS,
  estadosDelFiltro,
  esTerminal,
  etiquetaDestino,
  etiquetaEstado,
  enviosSugeridos,
  envioSugerido,
  hayFiltrosActivos,
  leerFiltrosEncargos,
  LIMITE_MAXIMO_ENCARGOS,
  LOTE_ENCARGOS,
  MARCA_POR_ESTADO,
  requiereCiudad,
} from "./encargos";
import { ZONAS_ENVIO_DEFAULT, type ZonaEnvio } from "./settings-defaults";

describe("estados", () => {
  it("los activos son todos menos entregado y cancelado", () => {
    expect(ESTADOS_ACTIVOS).toEqual([
      "confirmado",
      "comprado",
      "en_casillero",
      "en_bogota",
      "despachado",
    ]);
  });

  it("reconoce los terminales", () => {
    expect(esTerminal("entregado")).toBe(true);
    expect(esTerminal("cancelado")).toBe(true);
    expect(esTerminal("despachado")).toBe(false);
  });

  it("muestra crudo un estado desconocido en vez de romperse", () => {
    expect(etiquetaEstado("en_bogota")).toBe("En Bogotá");
    expect(etiquetaEstado("inventado")).toBe("inventado");
  });

  it("cada estado tiene su marca de tiempo, menos confirmado", () => {
    // `confirmado` se lee de `createdAt`: una columna que siempre valdría lo
    // mismo solo se puede desincronizar.
    expect(campoMarca("confirmado")).toBeNull();
    expect(campoMarca("comprado")).toBe("comprado_at");
    expect(campoMarca("cancelado")).toBe("cancelado_at");

    for (const { valor } of ESTADOS) {
      if (valor === "confirmado") continue;
      expect(campoMarca(valor)).toBe(MARCA_POR_ESTADO[valor]);
    }
  });
});

describe("destinos", () => {
  it("solo otra ciudad exige decir cuál", () => {
    expect(requiereCiudad("bogota")).toBe(false);
    expect(requiereCiudad("san_marcos")).toBe(false);
    expect(requiereCiudad("otra_ciudad")).toBe(true);
  });

  it("en otra ciudad manda el nombre de la ciudad", () => {
    expect(etiquetaDestino("otra_ciudad", "Medellín")).toBe("Medellín");
    expect(etiquetaDestino("otra_ciudad", "  ")).toBe("Otra ciudad");
    expect(etiquetaDestino("otra_ciudad")).toBe("Otra ciudad");
    // La ciudad de un destino que no es "otra" es ruido y no se muestra.
    expect(etiquetaDestino("bogota", "Cali")).toBe("Bogotá");
    expect(etiquetaDestino("san_marcos")).toBe("San Marcos");
  });

  it("los tres destinos tienen etiqueta", () => {
    for (const { valor, etiqueta } of DESTINOS) {
      expect(etiquetaDestino(valor)).toBe(etiqueta);
    }
  });
});

describe("envioSugerido", () => {
  it("usa la zona que corresponde a cada destino", () => {
    const zonas = ZONAS_ENVIO_DEFAULT;
    expect(envioSugerido(zonas, 2.6, "bogota")).toBe(16000);
    expect(envioSugerido(zonas, 2.6, "san_marcos")).toBe(20000);
    expect(envioSugerido(zonas, 2.6, "otra_ciudad")).toBe(18500);
  });

  it("cae a la zona alternativa cuando la preferida ya no existe", () => {
    const zonas: ZonaEnvio[] = [
      { nombre: "Resto del país", tarifa_base_cop: 21000, adicional_lb_cop: 0 },
    ];
    expect(envioSugerido(zonas, 1, "san_marcos")).toBe(21000);
    expect(envioSugerido(zonas, 1, "otra_ciudad")).toBe(21000);
  });

  it("no sugiere nada si la tabla de zonas está vacía o no calza", () => {
    expect(envioSugerido([], 2, "bogota")).toBeNull();
    const otras: ZonaEnvio[] = [
      { nombre: "Costa", tarifa_base_cop: 30000, adicional_lb_cop: 0 },
    ];
    expect(envioSugerido(otras, 2, "bogota")).toBeNull();
  });

  it("devuelve los tres estimados de una sola vez", () => {
    expect(enviosSugeridos(ZONAS_ENVIO_DEFAULT, 2.6)).toEqual({
      bogota: 16000,
      san_marcos: 20000,
      otra_ciudad: 18500,
    });
  });
});

describe("filtros", () => {
  it("por defecto muestra solo los activos", () => {
    const { filtros, limite } = leerFiltrosEncargos({});
    expect(filtros).toEqual({ estado: "activos", destino: "" });
    expect(limite).toBe(LOTE_ENCARGOS);
    expect(hayFiltrosActivos(filtros)).toBe(false);
  });

  it("traduce el filtro a la lista de estados que pide", () => {
    expect(estadosDelFiltro("todos")).toBeNull();
    expect(estadosDelFiltro("activos")).toEqual([...ESTADOS_ACTIVOS]);
    expect(estadosDelFiltro("entregado")).toEqual(["entregado"]);
  });

  it("descarta valores inventados en la URL", () => {
    const { filtros } = leerFiltrosEncargos({ estado: "borrado", destino: "marte" });
    expect(filtros).toEqual({ estado: "activos", destino: "" });
  });

  it("acota el límite para que nadie pida 50.000 filas por la URL", () => {
    expect(leerFiltrosEncargos({ limite: "99999" }).limite).toBe(LIMITE_MAXIMO_ENCARGOS);
    expect(leerFiltrosEncargos({ limite: "-3" }).limite).toBe(LOTE_ENCARGOS);
    expect(leerFiltrosEncargos({ limite: "ochenta" }).limite).toBe(LOTE_ENCARGOS);
    expect(leerFiltrosEncargos({ limite: "80" }).limite).toBe(80);
  });

  it("omite los valores por defecto en la URL", () => {
    const base = { estado: "activos", destino: "" } as const;
    expect(construirHrefEncargos(base)).toBe("/encargos");
    expect(construirHrefEncargos(base, { destino: "san_marcos" })).toBe(
      "/encargos?destino=san_marcos",
    );
    expect(construirHrefEncargos(base, { estado: "todos" })).toBe("/encargos?estado=todos");
    expect(construirHrefEncargos(base, {}, LOTE_ENCARGOS)).toBe("/encargos");
    expect(construirHrefEncargos(base, {}, LOTE_ENCARGOS + 40)).toBe("/encargos?limite=80");
  });
});
