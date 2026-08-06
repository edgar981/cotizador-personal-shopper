import { describe, expect, it } from "vitest";
import { limpiarJson, parsearRespuesta } from "./vision";

const CATEGORIAS = ["tenis", "ropa", "perfume", "bolso", "maquillaje", "reloj", "suplementos"];

describe("limpiarJson", () => {
  it("quita fences de ```json", () => {
    expect(limpiarJson('```json\n{"nombre":"X"}\n```')).toBe('{"nombre":"X"}');
  });

  it("quita fences sin lenguaje", () => {
    expect(limpiarJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("descarta el preámbulo antes del objeto", () => {
    expect(limpiarJson('Claro, aquí tienes:\n{"a":1}')).toBe('{"a":1}');
  });

  it("deja intacto un JSON limpio", () => {
    expect(limpiarJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe("parsearRespuesta", () => {
  it("lee una respuesta completa", () => {
    const texto = `{"nombre":"Samba OG","precio_usd":100,"marca":"adidas","categoria_sugerida":"tenis","talla_notas":"US 7 a 11","recorte_producto":{"x":0.1,"y":0.05,"ancho":0.5,"alto":0.6}}`;
    expect(parsearRespuesta(texto, CATEGORIAS)).toEqual({
      nombre: "Samba OG",
      precio_usd: 100,
      marca: "adidas",
      categoria_sugerida: "tenis",
      talla_notas: "US 7 a 11",
      recorte_producto: { x: 0.1, y: 0.05, ancho: 0.5, alto: 0.6 },
    });
  });

  it("normaliza un precio que llegó como texto con separadores", () => {
    const texto = `{"precio_usd":"$1,299.00"}`;
    expect(parsearRespuesta(texto, CATEGORIAS).precio_usd).toBe(1299);
  });

  it("descarta una categoría que no está en la configuración", () => {
    const texto = `{"categoria_sugerida":"electrónica"}`;
    expect(parsearRespuesta(texto, CATEGORIAS).categoria_sugerida).toBeNull();
  });

  it("acepta la categoría sin importar mayúsculas", () => {
    const texto = `{"categoria_sugerida":"Tenis"}`;
    expect(parsearRespuesta(texto, CATEGORIAS).categoria_sugerida).toBe("tenis");
  });

  it("devuelve todo vacío si el JSON está roto", () => {
    expect(parsearRespuesta("{roto", CATEGORIAS)).toEqual({
      nombre: null,
      precio_usd: null,
      marca: null,
      categoria_sugerida: null,
      talla_notas: null,
      recorte_producto: null,
    });
  });

  it("devuelve todo vacío si la respuesta no es un objeto", () => {
    expect(parsearRespuesta("[1,2,3]", CATEGORIAS).nombre).toBeNull();
    expect(parsearRespuesta('"solo texto"', CATEGORIAS).nombre).toBeNull();
  });

  it("trata un precio de 0 o negativo como ausente", () => {
    expect(parsearRespuesta('{"precio_usd":0}', CATEGORIAS).precio_usd).toBeNull();
    expect(parsearRespuesta('{"precio_usd":-5}', CATEGORIAS).precio_usd).toBeNull();
  });

  it("descarta un recuadro inservible sin tumbar el resto", () => {
    // Un recuadro diminuto suele ser un error de lectura; el resto sigue sirviendo.
    const texto = `{"nombre":"Perfume","precio_usd":175,"recorte_producto":{"x":0.5,"y":0.5,"ancho":0.01,"alto":0.01}}`;
    const r = parsearRespuesta(texto, CATEGORIAS);
    expect(r.recorte_producto).toBeNull();
    expect(r.precio_usd).toBe(175);
  });

  it("encaja un recuadro que se sale de la imagen", () => {
    const texto = `{"recorte_producto":{"x":0.8,"y":0.1,"ancho":0.5,"alto":0.5}}`;
    expect(parsearRespuesta(texto, CATEGORIAS).recorte_producto).toEqual({
      x: 0.8,
      y: 0.1,
      ancho: 0.2,
      alto: 0.5,
    });
  });

  it("respeta los null que devuelve el modelo para una imagen no-producto", () => {
    const texto = `{"nombre":null,"precio_usd":null,"marca":null,"categoria_sugerida":null,"talla_notas":null,"recorte_producto":null}`;
    const r = parsearRespuesta(texto, CATEGORIAS);
    expect(Object.values(r).every((v) => v === null)).toBe(true);
  });
});
