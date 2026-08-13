import { describe, expect, it } from "vitest";
import {
  construirHref,
  construirQuery,
  esPeriodo,
  FILTROS_VACIOS,
  hayFiltrosActivos,
  inicioDelDiaBogota,
  leerFiltros,
  LIMITE_MAXIMO,
  LOTE_HISTORIAL,
  rangoPeriodo,
} from "./historial-filtros";

/** 13 de agosto de 2026, 10:00 UTC = 05:00 en Bogotá. */
const MEDIA_MANANA = new Date("2026-08-13T10:00:00.000Z");

describe("inicioDelDiaBogota", () => {
  it("devuelve las 00:00 de Bogotá, que en UTC son las 05:00", () => {
    expect(inicioDelDiaBogota(MEDIA_MANANA).toISOString()).toBe("2026-08-13T05:00:00.000Z");
  });

  it("de madrugada UTC sigue siendo el día anterior en Bogotá", () => {
    // 04:00 UTC del 13 son las 23:00 del 12 en Bogotá: el día es el 12.
    const madrugada = new Date("2026-08-13T04:00:00.000Z");
    expect(inicioDelDiaBogota(madrugada).toISOString()).toBe("2026-08-12T05:00:00.000Z");
  });

  it("justo en el límite del día de Bogotá ya cuenta como el día nuevo", () => {
    const medianoche = new Date("2026-08-13T05:00:00.000Z");
    expect(inicioDelDiaBogota(medianoche).toISOString()).toBe("2026-08-13T05:00:00.000Z");
  });

  it("retrocede días cruzando el cambio de mes", () => {
    const dosDeAgosto = new Date("2026-08-02T10:00:00.000Z");
    expect(inicioDelDiaBogota(dosDeAgosto, 3).toISOString()).toBe("2026-07-30T05:00:00.000Z");
  });

  it("retrocede días cruzando el cambio de año", () => {
    const dosDeEnero = new Date("2026-01-02T10:00:00.000Z");
    expect(inicioDelDiaBogota(dosDeEnero, 3).toISOString()).toBe("2025-12-30T05:00:00.000Z");
  });
});

describe("rangoPeriodo", () => {
  it("'todo' no acota nada", () => {
    expect(rangoPeriodo("todo", MEDIA_MANANA)).toEqual({});
  });

  it("'hoy' arranca en la medianoche de Bogotá y no tiene tope", () => {
    const r = rangoPeriodo("hoy", MEDIA_MANANA);
    expect(r.gte?.toISOString()).toBe("2026-08-13T05:00:00.000Z");
    expect(r.lt).toBeUndefined();
  });

  it("'ayer' es un rango cerrado que termina donde empieza hoy", () => {
    const r = rangoPeriodo("ayer", MEDIA_MANANA);
    expect(r.gte?.toISOString()).toBe("2026-08-12T05:00:00.000Z");
    expect(r.lt?.toISOString()).toBe("2026-08-13T05:00:00.000Z");
  });

  it("'7dias' incluye hoy y los seis anteriores", () => {
    const r = rangoPeriodo("7dias", MEDIA_MANANA);
    expect(r.gte?.toISOString()).toBe("2026-08-07T05:00:00.000Z");
    expect(r.lt).toBeUndefined();
  });
});

describe("esPeriodo", () => {
  it("acepta los válidos y rechaza cualquier otra cosa", () => {
    expect(esPeriodo("hoy")).toBe(true);
    expect(esPeriodo("7dias")).toBe(true);
    expect(esPeriodo("ultimos-7")).toBe(false);
    expect(esPeriodo(undefined)).toBe(false);
    expect(esPeriodo("")).toBe(false);
  });
});

describe("hayFiltrosActivos", () => {
  it("sin filtros es falso", () => {
    expect(hayFiltrosActivos(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, q: "   " })).toBe(false);
  });

  it("cualquiera de los tres lo activa", () => {
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, q: "campus" })).toBe(true);
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, categoria: "tenis" })).toBe(true);
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, periodo: "hoy" })).toBe(true);
  });
});

describe("construirHref", () => {
  it("sin filtros deja la URL limpia", () => {
    expect(construirHref(FILTROS_VACIOS)).toBe("/historial");
  });

  it("omite el período por defecto y el primer lote", () => {
    expect(construirHref({ ...FILTROS_VACIOS, periodo: "todo" }, {}, 30)).toBe("/historial");
  });

  it("combina los tres criterios", () => {
    const href = construirHref({ q: "campus", categoria: "tenis", periodo: "7dias" });
    expect(href).toContain("q=campus");
    expect(href).toContain("categoria=tenis");
    expect(href).toContain("periodo=7dias");
  });

  it("aplica los cambios encima de los filtros actuales", () => {
    const actuales = { q: "campus", categoria: "tenis", periodo: "hoy" as const };
    expect(construirHref(actuales, { categoria: "" })).not.toContain("categoria");
    expect(construirHref(actuales, { periodo: "todo" })).not.toContain("periodo");
  });

  it("escapa el texto de búsqueda", () => {
    expect(construirHref({ ...FILTROS_VACIOS, q: "nike air & co" })).toContain(
      "q=nike+air+%26+co",
    );
  });

  it("incluye el límite solo cuando pasa del primer lote", () => {
    expect(construirHref(FILTROS_VACIOS, {}, 60)).toContain("limite=60");
  });
});

describe("leerFiltros", () => {
  it("sin params devuelve los filtros vacíos y el primer lote", () => {
    expect(leerFiltros({})).toEqual({ filtros: FILTROS_VACIOS, limite: LOTE_HISTORIAL });
  });

  it("recorta espacios del texto y de la categoría", () => {
    const { filtros } = leerFiltros({ q: "  campus ", categoria: " tenis " });
    expect(filtros.q).toBe("campus");
    expect(filtros.categoria).toBe("tenis");
  });

  it("descarta un período inválido en vez de pasarlo a la consulta", () => {
    expect(leerFiltros({ periodo: "ultimos-7" }).filtros.periodo).toBe("todo");
    expect(leerFiltros({ periodo: "'; DROP TABLE" }).filtros.periodo).toBe("todo");
    expect(leerFiltros({ periodo: "ayer" }).filtros.periodo).toBe("ayer");
  });

  it("acota el límite al tope y trata la basura como primer lote", () => {
    expect(leerFiltros({ limite: "99999" }).limite).toBe(LIMITE_MAXIMO);
    expect(leerFiltros({ limite: "-5" }).limite).toBe(LOTE_HISTORIAL);
    expect(leerFiltros({ limite: "abc" }).limite).toBe(LOTE_HISTORIAL);
    expect(leerFiltros({ limite: "60" }).limite).toBe(60);
  });

  it("va y vuelve: lo que construye la URL se relee igual", () => {
    const originales = { q: "campus", categoria: "tenis", periodo: "7dias" as const };
    const query = construirQuery(originales, {}, 90);
    const sp = Object.fromEntries(new URLSearchParams(query));

    const { filtros, limite } = leerFiltros(sp);
    expect(filtros).toEqual(originales);
    expect(limite).toBe(90);
  });
});

describe("construirQuery", () => {
  it("no lleva ruta ni signo de interrogación, para colgarla de otra URL", () => {
    expect(construirQuery(FILTROS_VACIOS)).toBe("");
    expect(construirQuery({ ...FILTROS_VACIOS, categoria: "tenis" })).toBe("categoria=tenis");
  });
});
