import { describe, expect, it } from "vitest";
import {
  CLIENTE_VACIO,
  normalizarDocumento,
  normalizarTelefono,
  parsearDatosCliente,
  sugerirDestino,
} from "./leer-cliente";

/**
 * Los cuatro mensajes reales que llegan por WhatsApp, con la respuesta que dio
 * el modelo para cada uno y lo que tiene que quedar después de normalizar.
 *
 * `mensaje` está acá para que se vea qué formato cubre cada caso; lo que se
 * ejecuta es la capa determinista —limpieza de la respuesta, dígitos, largos y
 * destino sugerido—, que es la única que puede fallar siempre igual. Que el
 * modelo separe bien la ciudad de la dirección se verifica contra la API.
 *
 * Si se cambia el prompt, hay que volver a correr estos mensajes contra la API
 * y actualizar `respuesta` con lo que devuelva. Los cuatro fallaron alguna vez:
 * el 2 mandaba la referencia a notas y el 4 le quitaba "Santa Marta" al nombre
 * de la sociedad portuaria.
 */
const CASOS = [
  {
    nombre: "1. etiquetado, ciudad al principio con el departamento abreviado",
    mensaje: `Nombre: Melissa Ruiz Vega
Cc. 1.123.123.836
Celular: 302 667 1234 
Dirección: Medellín, Ant. Urbanización Parque de Los Colores Cra.76 #53-89 (barrio Los colores)
Apto: interior 1900`,
    respuesta: `{"cliente_nombre": "Melissa Ruiz Vega", "cliente_doc": "1123123836", "cliente_tel": "3026671234", "destino_ciudad": "Medellín", "destino_dir": "Urbanización Parque de Los Colores Cra.76 #53-89 (barrio Los colores) interior 1900", "cliente_notas": null}`,
    esperado: {
      cliente_nombre: "Melissa Ruiz Vega",
      cliente_doc: "1123123836",
      cliente_tel: "3026671234",
      destino_ciudad: "Medellín",
      // El apartamento venía en su propia línea etiquetada y es dirección.
      destino_dir:
        "Urbanización Parque de Los Colores Cra.76 #53-89 (barrio Los colores) interior 1900",
      cliente_notas: null,
    },
    destino: "otra_ciudad",
  },
  {
    nombre: "2. ciudad al final tras guiones, con línea de referencia",
    mensaje: `Margarita Martinez 
Cc 1104123402
Teléfono/celular: 3115941234
Dirección: Escallon Villa Calle 30 D - KR 51 - 35  - Cartagena Bolívar
Referencia. Bajando la calle de la iglesia sagrada corazón de Jesús, tres casa después de la cuneta`,
    respuesta: `{"cliente_nombre": "Margarita Martinez", "cliente_doc": "1104123402", "cliente_tel": "3115941234", "destino_ciudad": "Cartagena", "destino_dir": "Escallon Villa Calle 30 D - KR 51 - 35, Bajando la calle de la iglesia sagrada corazón de Jesús, tres casa después de la cuneta", "cliente_notas": null}`,
    esperado: {
      cliente_nombre: "Margarita Martinez",
      cliente_doc: "1104123402",
      cliente_tel: "3115941234",
      // "Cartagena Bolívar": ciudad y departamento separados solo por un
      // espacio, y los guiones de la dirección no son el corte.
      destino_ciudad: "Cartagena",
      // El punto de referencia es dirección, no nota: es lo que lee el
      // mensajero para encontrar la casa.
      destino_dir:
        "Escallon Villa Calle 30 D - KR 51 - 35, Bajando la calle de la iglesia sagrada corazón de Jesús, tres casa después de la cuneta",
      cliente_notas: null,
    },
    destino: "otra_ciudad",
  },
  {
    nombre: "3. sin etiquetas, con comentario del producto y ciudad pegada al departamento",
    mensaje: `Para acá van los zapatos azules, mi nesgrito
Alberto Perez Perez
1.123.128.123
3115941234
Calle 29 # 20-51 Edificio Torres del Este, Apto 302B, Barrio San José
Monteria-Córdoba`,
    respuesta: `{"cliente_nombre": "Alberto Perez Perez", "cliente_doc": "1123128123", "cliente_tel": "3115941234", "destino_ciudad": "Monteria", "destino_dir": "Calle 29 # 20-51 Edificio Torres del Este, Apto 302B, Barrio San José", "cliente_notas": "Para acá van los zapatos azules, mi nesgrito"}`,
    esperado: {
      cliente_nombre: "Alberto Perez Perez",
      cliente_doc: "1123128123",
      cliente_tel: "3115941234",
      destino_ciudad: "Monteria",
      destino_dir: "Calle 29 # 20-51 Edificio Torres del Este, Apto 302B, Barrio San José",
      // Se copia tal cual, con el apodo y todo: es del cliente, no nuestro.
      cliente_notas: "Para acá van los zapatos azules, mi nesgrito",
    },
    destino: "otra_ciudad",
  },
  {
    nombre: "4. la ciudad también es parte del nombre del edificio",
    mensaje: `Te informo para esta dirección va el conjunto de camiseta negra y pantaloneta negra de hombre
Alberto Perez Perez
11444444444
3115941234
Carrera 1 #10A-12 Brr Centro - Edif Administrativo Soc. Portuaria Santa Marta
Santa Marta - Magdalena`,
    respuesta: `{"cliente_nombre": "Alberto Perez Perez", "cliente_doc": "11444444444", "cliente_tel": "3115941234", "destino_ciudad": "Santa Marta", "destino_dir": "Carrera 1 #10A-12 Brr Centro - Edif Administrativo Soc. Portuaria Santa Marta", "cliente_notas": "Te informo para esta dirección va el conjunto de camiseta negra y pantaloneta negra de hombre"}`,
    esperado: {
      cliente_nombre: "Alberto Perez Perez",
      // Once dígitos: no es una cédula típica, pero es lo que mandó el cliente
      // y recortarla sería peor que guardarla como viene.
      cliente_doc: "11444444444",
      cliente_tel: "3115941234",
      destino_ciudad: "Santa Marta",
      // "Soc. Portuaria Santa Marta" es el nombre del sitio: quitarle la ciudad
      // deja una dirección incompleta.
      destino_dir: "Carrera 1 #10A-12 Brr Centro - Edif Administrativo Soc. Portuaria Santa Marta",
      cliente_notas:
        "Te informo para esta dirección va el conjunto de camiseta negra y pantaloneta negra de hombre",
    },
    destino: "otra_ciudad",
  },
] as const;

describe("parsearDatosCliente sobre los mensajes reales", () => {
  for (const caso of CASOS) {
    it(caso.nombre, () => {
      expect(parsearDatosCliente(caso.respuesta)).toEqual(caso.esperado);
    });

    it(`${caso.nombre} → destino sugerido`, () => {
      expect(sugerirDestino(caso.esperado.destino_ciudad, caso.esperado.destino_dir)).toBe(
        caso.destino,
      );
    });
  }
});

describe("parsearDatosCliente, red de seguridad", () => {
  it("normaliza aunque el modelo devuelva la cédula con puntos y el celular con +57", () => {
    // Con el prompt de hoy el modelo ya los devuelve limpios, pero eso no está
    // garantizado: la normalización es lo que sostiene el trato.
    const texto = `{"cliente_nombre":"Melissa Ruiz Vega","cliente_doc":"1.123.123.836","cliente_tel":"+57 302 667 1234","destino_ciudad":"Medellín","destino_dir":"Cra.76 #53-89","cliente_notas":null}`;
    expect(parsearDatosCliente(texto)).toEqual({
      cliente_nombre: "Melissa Ruiz Vega",
      cliente_doc: "1123123836",
      cliente_tel: "3026671234",
      destino_ciudad: "Medellín",
      destino_dir: "Cra.76 #53-89",
      cliente_notas: null,
    });
  });

  it("aguanta fences y preámbulo alrededor del JSON", () => {
    const conFences = [
      "```json",
      `{"cliente_nombre":"Margarita Martinez","cliente_doc":null,"cliente_tel":null,"destino_ciudad":null,"destino_dir":null,"cliente_notas":null}`,
      "```",
    ].join("\n");
    expect(parsearDatosCliente(conFences).cliente_nombre).toBe("Margarita Martinez");

    const conPreambulo = `Claro, acá van los datos:\n{"cliente_nombre":"Alberto Perez Perez","cliente_doc":null,"cliente_tel":null,"destino_ciudad":null,"destino_dir":null,"cliente_notas":null}`;
    expect(parsearDatosCliente(conPreambulo).cliente_nombre).toBe("Alberto Perez Perez");
  });

  it("no rompe con texto que no es JSON", () => {
    expect(parsearDatosCliente("No pude encontrar datos.")).toEqual(CLIENTE_VACIO);
    expect(parsearDatosCliente("")).toEqual(CLIENTE_VACIO);
  });

  it("descarta un arreglo o un valor suelto", () => {
    expect(parsearDatosCliente("[1,2,3]")).toEqual(CLIENTE_VACIO);
    expect(parsearDatosCliente("null")).toEqual(CLIENTE_VACIO);
  });

  it("ignora campos con tipo inesperado en vez de propagarlos", () => {
    const texto = `{"cliente_nombre":{"n":"Ana"},"cliente_doc":[],"cliente_tel":true,"destino_ciudad":12,"destino_dir":null,"cliente_notas":null}`;
    expect(parsearDatosCliente(texto)).toEqual(CLIENTE_VACIO);
  });

  it("recorta lo que se pase del largo que acepta la acción de guardar", () => {
    const largo = "x".repeat(400);
    const texto = JSON.stringify({ destino_dir: largo });
    expect(parsearDatosCliente(texto).destino_dir).toHaveLength(300);
  });
});

describe("normalizarDocumento", () => {
  it("quita puntos y espacios", () => {
    expect(normalizarDocumento("1.123.123.836")).toBe("1123123836");
    expect(normalizarDocumento(" 1104123402 ")).toBe("1104123402");
    expect(normalizarDocumento("Cc. 1.123.128.123")).toBe("1123128123");
  });

  it("acepta un número, no solo texto", () => {
    expect(normalizarDocumento(1104123402)).toBe("1104123402");
  });

  it("descarta lo que no tiene largo de documento", () => {
    expect(normalizarDocumento("123")).toBeNull();
    expect(normalizarDocumento("sin cédula")).toBeNull();
    expect(normalizarDocumento(null)).toBeNull();
  });
});

describe("normalizarTelefono", () => {
  it("deja solo dígitos", () => {
    expect(normalizarTelefono("302 667 1234")).toBe("3026671234");
    expect(normalizarTelefono("3115941234")).toBe("3115941234");
  });

  it("quita el indicativo del país", () => {
    expect(normalizarTelefono("+57 311 594 1234")).toBe("3115941234");
    expect(normalizarTelefono("573115941234")).toBe("3115941234");
  });

  it("acepta un fijo con indicativo de ciudad", () => {
    // Descartarlo por no empezar en 3 perdería un teléfono bueno para la guía.
    expect(normalizarTelefono("604 3456789")).toBe("6043456789");
  });

  it("descarta lo que no alcanza a ser un teléfono", () => {
    expect(normalizarTelefono("300")).toBeNull();
    expect(normalizarTelefono("no tengo")).toBeNull();
  });
});

describe("sugerirDestino", () => {
  it("no distingue mayúsculas ni tildes", () => {
    expect(sugerirDestino("BOGOTÁ")).toBe("bogota");
    expect(sugerirDestino("bogota d.c.")).toBe("bogota");
    expect(sugerirDestino("san marcos")).toBe("san_marcos");
    expect(sugerirDestino("SAN MARCOS - SUCRE")).toBe("san_marcos");
  });

  it("cualquier otra ciudad cae en otra_ciudad", () => {
    expect(sugerirDestino("Medellín")).toBe("otra_ciudad");
    expect(sugerirDestino("Cartagena")).toBe("otra_ciudad");
    expect(sugerirDestino("Monteria")).toBe("otra_ciudad");
    expect(sugerirDestino("Santa Marta")).toBe("otra_ciudad");
  });

  it("sin ciudad no sugiere nada y el destino elegido se queda como está", () => {
    expect(sugerirDestino(null)).toBeNull();
    expect(sugerirDestino("")).toBeNull();
    expect(sugerirDestino("   ")).toBeNull();
    expect(sugerirDestino(undefined)).toBeNull();
  });

  it("si no hubo ciudad, rescata San Marcos o Bogotá de la dirección", () => {
    // Cuando el municipio viene pegado al final de la línea sin coma, el modelo
    // a veces lo deja adentro; San Marcos es justo el destino con regla propia.
    expect(sugerirDestino(null, "Cra 8 # 20-15 San Marcos")).toBe("san_marcos");
    expect(sugerirDestino(null, "Calle 45 #12-30 apto 402 Bogota")).toBe("bogota");
  });

  it("no inventa una ciudad a partir de una dirección cualquiera", () => {
    // Sin ciudad y sin uno de los dos nombres conocidos no hay nada que
    // afirmar: adivinar mandaría el encargo al grupo de despacho equivocado.
    expect(sugerirDestino(null, "Cra 15 # 9-22 barrio El Prado")).toBeNull();
    expect(sugerirDestino("", "")).toBeNull();
  });

  it("la ciudad manda sobre la dirección cuando hay las dos", () => {
    // "Soc. Portuaria Santa Marta" dentro de la dirección no debe pesar más que
    // la ciudad leída.
    expect(sugerirDestino("Medellín", "Cra 8 # 20-15 San Marcos")).toBe("otra_ciudad");
  });
});
