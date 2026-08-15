import { describe, expect, it } from "vitest";
import {
  estaVigente,
  normalizarBorrador,
  tieneContenido,
  VIGENCIA_MS,
  type BorradorCotizacion,
} from "./borrador";

const AHORA = new Date("2026-08-13T10:00:00.000Z").getTime();

function borrador(parcial: Partial<BorradorCotizacion> = {}): BorradorCotizacion {
  return {
    guardadoEn: AHORA,
    url: "",
    campos: {
      nombre: "Nike Campus",
      imagen_url: "",
      precio_usd: "129.99",
      categoria: "tenis",
      peso_lb: "2.6",
      talla_notas: "",
    },
    origen: "captura",
    capturaUrl: "https://blob.example.com/captura.jpg",
    recorte: { x: 0.1, y: 0.1, ancho: 0.8, alto: 0.8 },
    medidasCaptura: { ancho: 1170, alto: 2532 },
    historiaUrl: null,
    historiaRecorte: null,
    medidasHistoria: null,
    zona: "Bogotá",
    formVisible: true,
    ...parcial,
  };
}

describe("estaVigente", () => {
  it("acepta uno recién guardado", () => {
    expect(estaVigente({ guardadoEn: AHORA }, AHORA)).toBe(true);
  });

  it("acepta uno de hace 23 horas y rechaza el de 25", () => {
    expect(estaVigente({ guardadoEn: AHORA - 23 * 3600_000 }, AHORA)).toBe(true);
    expect(estaVigente({ guardadoEn: AHORA - 25 * 3600_000 }, AHORA)).toBe(false);
  });

  it("el límite exacto de 24 horas ya no vale", () => {
    expect(estaVigente({ guardadoEn: AHORA - VIGENCIA_MS }, AHORA)).toBe(false);
    expect(estaVigente({ guardadoEn: AHORA - VIGENCIA_MS + 1 }, AHORA)).toBe(true);
  });

  it("descarta una marca en el futuro en vez de darla por buena", () => {
    expect(estaVigente({ guardadoEn: AHORA + 3600_000 }, AHORA)).toBe(false);
  });
});

describe("tieneContenido", () => {
  it("un borrador en blanco no vale la pena", () => {
    const vacio = borrador({
      campos: {
        nombre: "",
        imagen_url: "",
        precio_usd: "",
        categoria: "",
        peso_lb: "",
        talla_notas: "",
      },
      capturaUrl: null,
      historiaUrl: null,
    });
    expect(tieneContenido(vacio)).toBe(false);
  });

  it("una captura ya subida basta aunque no haya nada escrito", () => {
    const soloCaptura = borrador({
      campos: {
        nombre: "",
        imagen_url: "",
        precio_usd: "",
        categoria: "",
        peso_lb: "",
        talla_notas: "",
      },
    });
    expect(tieneContenido(soloCaptura)).toBe(true);
  });

  it("solo espacios no cuenta como contenido", () => {
    const espacios = borrador({
      campos: {
        nombre: "   ",
        imagen_url: "",
        precio_usd: " ",
        categoria: "",
        peso_lb: "",
        talla_notas: "",
      },
      capturaUrl: null,
    });
    expect(tieneContenido(espacios)).toBe(false);
  });
});

describe("normalizarBorrador", () => {
  it("va y vuelve por JSON sin perder nada", () => {
    const original = borrador();
    const vuelta = normalizarBorrador(JSON.parse(JSON.stringify(original)), AHORA);
    expect(vuelta).toEqual(original);
  });

  it("descarta el caducado", () => {
    const viejo = borrador({ guardadoEn: AHORA - 25 * 3600_000 });
    expect(normalizarBorrador(JSON.parse(JSON.stringify(viejo)), AHORA)).toBeNull();
  });

  it("no revienta con basura", () => {
    expect(normalizarBorrador(null, AHORA)).toBeNull();
    expect(normalizarBorrador("texto", AHORA)).toBeNull();
    expect(normalizarBorrador([], AHORA)).toBeNull();
    expect(normalizarBorrador({}, AHORA)).toBeNull();
    expect(normalizarBorrador({ guardadoEn: "ayer" }, AHORA)).toBeNull();
  });

  it("rellena los campos que falten en vez de dejarlos undefined", () => {
    const parcial = normalizarBorrador(
      { guardadoEn: AHORA, campos: { nombre: "Solo el nombre" } },
      AHORA,
    );
    expect(parcial?.campos.precio_usd).toBe("");
    expect(parcial?.campos.talla_notas).toBe("");
    expect(parcial?.origen).toBe("url");
    expect(parcial?.capturaUrl).toBeNull();
    expect(parcial?.formVisible).toBe(false);
  });

  it("tira recortes y medidas inválidos sin tirar el borrador entero", () => {
    const sucio = normalizarBorrador(
      {
        guardadoEn: AHORA,
        campos: { nombre: "Nike" },
        recorte: { x: 0, y: 0, ancho: 0, alto: 1 },
        medidasCaptura: { ancho: -5, alto: 100 },
      },
      AHORA,
    );
    expect(sucio?.campos.nombre).toBe("Nike");
    expect(sucio?.recorte).toBeNull();
    expect(sucio?.medidasCaptura).toBeNull();
  });

  it("un borrador vigente pero vacío se descarta", () => {
    expect(normalizarBorrador({ guardadoEn: AHORA, campos: {} }, AHORA)).toBeNull();
  });
});
