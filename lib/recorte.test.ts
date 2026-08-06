import { describe, expect, it } from "vitest";
import {
  ASPECTO_HISTORIA,
  calcularTransformacion,
  conformarAspecto,
  medidasImagen,
  normalizarRecorte,
  SLOT_ALTO,
  SLOT_ANCHO,
} from "./recorte";

describe("normalizarRecorte", () => {
  it("acepta un recuadro válido", () => {
    expect(normalizarRecorte({ x: 0.1, y: 0.2, ancho: 0.5, alto: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
      ancho: 0.5,
      alto: 0.4,
    });
  });

  it("encaja contra los bordes cuando el modelo se pasa", () => {
    // El modelo tiende a devolver recuadros un poco más grandes de la cuenta.
    expect(normalizarRecorte({ x: -0.05, y: 0.9, ancho: 0.5, alto: 0.4 })).toEqual({
      x: 0,
      y: 0.9,
      ancho: 0.45,
      alto: 0.1,
    });
  });

  it("descarta recuadros diminutos", () => {
    expect(normalizarRecorte({ x: 0.5, y: 0.5, ancho: 0.01, alto: 0.5 })).toBeNull();
  });

  it("descarta dimensiones no positivas", () => {
    expect(normalizarRecorte({ x: 0.1, y: 0.1, ancho: 0, alto: 0.5 })).toBeNull();
    expect(normalizarRecorte({ x: 0.1, y: 0.1, ancho: -0.3, alto: 0.5 })).toBeNull();
  });

  it("descarta lo que no es un recuadro", () => {
    expect(normalizarRecorte(null)).toBeNull();
    expect(normalizarRecorte("0.1,0.2")).toBeNull();
    expect(normalizarRecorte([0.1, 0.2, 0.5, 0.4])).toBeNull();
    expect(normalizarRecorte({ x: 0.1 })).toBeNull();
    expect(normalizarRecorte({ x: "a", y: 0.1, ancho: 0.5, alto: 0.5 })).toBeNull();
  });

  it("acepta números que llegan como texto", () => {
    expect(normalizarRecorte({ x: "0.1", y: "0.2", ancho: "0.5", alto: "0.4" })).toEqual({
      x: 0.1,
      y: 0.2,
      ancho: 0.5,
      alto: 0.4,
    });
  });
});

describe("conformarAspecto", () => {
  const aspectoPx = (r: { ancho: number; alto: number }, W: number, H: number) =>
    (r.ancho * W) / (r.alto * H);

  it("ensancha un recuadro angosto hasta la proporción del hueco", () => {
    // El caso real: el modelo devolvió 538×693 (0.776) para un hueco de 0.898.
    const r = conformarAspecto({ x: 0.15, y: 0.02, ancho: 0.42, alto: 0.77 }, 1280, 900);
    expect(aspectoPx(r, 1280, 900)).toBeCloseTo(ASPECTO_HISTORIA, 4);
    // Ensancha, nunca recorta el alto que ya tenía.
    expect(r.alto).toBeCloseTo(0.77, 4);
    expect(r.ancho).toBeGreaterThan(0.42);
  });

  it("estira en alto un recuadro achatado", () => {
    const r = conformarAspecto({ x: 0.1, y: 0.4, ancho: 0.8, alto: 0.2 }, 1000, 1000);
    expect(aspectoPx(r, 1000, 1000)).toBeCloseTo(ASPECTO_HISTORIA, 4);
    expect(r.ancho).toBeCloseTo(0.8, 4);
    expect(r.alto).toBeGreaterThan(0.2);
  });

  it("mantiene el centro", () => {
    const original = { x: 0.2, y: 0.3, ancho: 0.4, alto: 0.4 };
    const r = conformarAspecto(original, 1200, 900);
    expect(r.x + r.ancho / 2).toBeCloseTo(original.x + original.ancho / 2, 3);
    expect(r.y + r.alto / 2).toBeCloseTo(original.y + original.alto / 2, 3);
  });

  it("no se sale de la imagen aunque tenga que encoger", () => {
    const r = conformarAspecto({ x: 0, y: 0, ancho: 1, alto: 1 }, 1000, 1000);
    expect(aspectoPx(r, 1000, 1000)).toBeCloseTo(ASPECTO_HISTORIA, 4);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.ancho).toBeLessThanOrEqual(1.000001);
    expect(r.y + r.alto).toBeLessThanOrEqual(1.000001);
  });

  it("empuja hacia dentro un recuadro pegado al borde", () => {
    const r = conformarAspecto({ x: 0.9, y: 0.9, ancho: 0.1, alto: 0.1 }, 1000, 1000);
    expect(r.x + r.ancho).toBeLessThanOrEqual(1.000001);
    expect(r.y + r.alto).toBeLessThanOrEqual(1.000001);
  });

  it("deja igual lo que ya tiene la proporción correcta", () => {
    // 476×530 en una imagen de 1000×1000 ya está en 0.898.
    const original = { x: 0.1, y: 0.1, ancho: 0.476, alto: 0.53 };
    const r = conformarAspecto(original, 1000, 1000);
    expect(r.ancho).toBeCloseTo(original.ancho, 3);
    expect(r.alto).toBeCloseTo(original.alto, 3);
  });
});

describe("calcularTransformacion", () => {
  it("hace que el recuadro ocupe el hueco exacto, sin recorte extra", () => {
    const recorte = { x: 0.15, y: 0.02, ancho: 0.42, alto: 0.77 };
    const t = calcularTransformacion(recorte, 1280, 900, SLOT_ANCHO, SLOT_ALTO);

    // La región visible es exactamente el recuadro conformado.
    const visibleX = t.offsetX / t.ancho;
    const visibleY = t.offsetY / t.alto;
    const visibleAncho = SLOT_ANCHO / t.ancho;
    const visibleAlto = SLOT_ALTO / t.alto;

    expect(visibleX).toBeCloseTo(t.recorte.x, 3);
    expect(visibleY).toBeCloseTo(t.recorte.y, 3);
    expect(visibleAncho).toBeCloseTo(t.recorte.ancho, 3);
    expect(visibleAlto).toBeCloseTo(t.recorte.alto, 3);
  });

  it("no pierde alto: el bug era un cover encima del recuadro", () => {
    const recorte = { x: 0.15, y: 0.02, ancho: 0.42, alto: 0.77 };
    const t = calcularTransformacion(recorte, 1280, 900, SLOT_ANCHO, SLOT_ALTO);
    // Antes se veía solo 599 de 693 px de alto (13.6% perdido).
    const altoVisiblePx = (SLOT_ALTO / t.alto) * 900;
    expect(altoVisiblePx).toBeGreaterThanOrEqual(0.77 * 900 - 1);
  });

  it("un recuadro que ya cuadra se escala y nada más", () => {
    const recorte = conformarAspecto({ x: 0.1, y: 0.1, ancho: 0.5, alto: 0.5 }, 1000, 1000);
    const t = calcularTransformacion(recorte, 1000, 1000, SLOT_ANCHO, SLOT_ALTO);
    expect(t.recorte.ancho).toBeCloseTo(recorte.ancho, 5);
    expect(t.recorte.alto).toBeCloseTo(recorte.alto, 5);
    expect(SLOT_ANCHO / t.ancho).toBeCloseTo(recorte.ancho, 4);
  });

  it("sin recorte usa la imagen completa conformada al hueco", () => {
    const t = calcularTransformacion({ x: 0, y: 0, ancho: 1, alto: 1 }, 1080, 1080, SLOT_ANCHO, SLOT_ALTO);
    expect((t.recorte.ancho * 1080) / (t.recorte.alto * 1080)).toBeCloseTo(ASPECTO_HISTORIA, 4);
  });
});

describe("medidasImagen", () => {
  it("lee un PNG", () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(0x0d0a1a0a, 4);
    png.writeUInt32BE(1234, 16);
    png.writeUInt32BE(5678, 20);
    expect(medidasImagen(png)).toEqual({ ancho: 1234, alto: 5678 });
  });

  it("lee un JPEG saltando marcadores", () => {
    // SOI + APP0 (16 bytes) + SOF0 con 800×600.
    const partes = [
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)]),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, ...new Array(8).fill(0)]),
    ];
    expect(medidasImagen(Buffer.concat(partes))).toEqual({ ancho: 800, alto: 600 });
  });

  it("devuelve null con algo que no es imagen", () => {
    expect(medidasImagen(Buffer.from("no soy una imagen"))).toBeNull();
  });
});
