import { describe, expect, it } from "vitest";
import {
  aPrecio,
  esUrlHttpValida,
  extraerDeJsonLd,
  extraerDeOpenGraph,
  fusionar,
  monedaNoUsd,
} from "./extraer";

/** Envuelve un objeto JSON-LD en su etiqueta script. */
const ld = (datos: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(datos)}</script>`;

const BASE = "https://www.tienda.com/p/zapatilla";

describe("extraerDeJsonLd", () => {
  it("lee un Product plano", () => {
    const html = `
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product",
         "name":"Samba OG Shoes","image":"https://cdn.tienda.com/samba.jpg",
         "offers":{"@type":"Offer","price":"100.00","priceCurrency":"USD"}}
      </script>`;

    expect(extraerDeJsonLd(html, BASE)).toEqual({
      nombre: "Samba OG Shoes",
      imagen_url: "https://cdn.tienda.com/samba.jpg",
      precio_usd: 100,
    });
  });

  it("navega @graph, arrays de imagen y AggregateOffer", () => {
    const html = `
      <script type="application/ld+json">
        {"@graph":[
          {"@type":"WebSite","name":"Tienda"},
          {"@type":["Product","Thing"],
           "name":"Bolso Tote &amp; Co",
           "image":[{"url":"/img/tote.png"}],
           "offers":{"@type":"AggregateOffer","lowPrice":"249.99"}}
        ]}
      </script>`;

    expect(extraerDeJsonLd(html, BASE)).toEqual({
      nombre: "Bolso Tote & Co",
      imagen_url: "https://www.tienda.com/img/tote.png",
      precio_usd: 249.99,
    });
  });

  it("ignora JSON-LD malformado sin lanzar", () => {
    expect(extraerDeJsonLd(`<script type="application/ld+json">{roto</script>`, BASE)).toEqual({});
  });

  it("devuelve vacío cuando no hay Product", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","name":"Tienda"}</script>`;
    expect(extraerDeJsonLd(html, BASE)).toEqual({});
  });
});

describe("extraerDeOpenGraph", () => {
  it("lee og:title, og:image y product:price:amount", () => {
    const html = `
      <meta property="og:title" content="Perfume Bleu de Chanel 100ml">
      <meta property="og:image" content="//cdn.tienda.com/bleu.jpg">
      <meta property="product:price:amount" content="$1,299.00">`;

    expect(extraerDeOpenGraph(html, BASE)).toEqual({
      nombre: "Perfume Bleu de Chanel 100ml",
      imagen_url: "https://cdn.tienda.com/bleu.jpg",
      precio_usd: 1299,
    });
  });

  it("acepta atributos en cualquier orden", () => {
    const html = `<meta content="/r.png" name="twitter:image">`;
    expect(extraerDeOpenGraph(html, BASE).imagen_url).toBe("https://www.tienda.com/r.png");
  });

  it("interpreta precios en formato europeo", () => {
    const html = `<meta property="og:price:amount" content="1.299,50 USD">`;
    expect(extraerDeOpenGraph(html, BASE).precio_usd).toBe(1299.5);
  });

  it("decodifica entidades y colapsa espacios", () => {
    const html = `<meta property="og:title" content="Camiseta&nbsp;b&#225;sica &amp; c&#243;moda">`;
    expect(extraerDeOpenGraph(html, BASE).nombre).toBe("Camiseta básica & cómoda");
  });
});

describe("fusionar", () => {
  it("usa el <title> solo si además hay imagen o precio", () => {
    const conImagen = `<title>Reloj Casio A168</title><meta content="/r.png" name="twitter:image">`;
    expect(fusionar(conImagen, BASE)).toEqual({
      nombre: "Reloj Casio A168",
      imagen_url: "https://www.tienda.com/r.png",
      precio_usd: undefined,
    });
  });

  it("descarta el <title> de una pantalla anti-bot", () => {
    // Walmart y Foot Locker devuelven páginas así cuando bloquean el fetch.
    expect(fusionar("<title>Robot or human?</title>", BASE)).toEqual({
      nombre: undefined,
      imagen_url: undefined,
      precio_usd: undefined,
    });
  });

  it("JSON-LD gana sobre Open Graph", () => {
    const html = `
      <meta property="og:title" content="Título OG">
      <meta property="og:price:amount" content="10">
      <script type="application/ld+json">
        {"@type":"Product","name":"Nombre real","offers":{"price":"42.50"}}
      </script>`;
    const r = fusionar(html, BASE);
    expect(r.nombre).toBe("Nombre real");
    expect(r.precio_usd).toBe(42.5);
  });
});

describe("esUrlHttpValida", () => {
  it("acepta http y https, rechaza el resto", () => {
    expect(esUrlHttpValida("https://adidas.com/us/x")).toBe(true);
    expect(esUrlHttpValida("http://adidas.com")).toBe(true);
    expect(esUrlHttpValida("javascript:alert(1)")).toBe(false);
    expect(esUrlHttpValida("no soy una url")).toBe(false);
  });
});


describe("aPrecio", () => {
  it("lee decimales con punto o con coma", () => {
    expect(aPrecio("22.97")).toBe(22.97);
    expect(aPrecio("22,97")).toBe(22.97);
    expect(aPrecio(22.97)).toBe(22.97);
  });

  it("ignora símbolos y códigos de moneda alrededor", () => {
    expect(aPrecio("$22.97")).toBe(22.97);
    expect(aPrecio("USD 22.97")).toBe(22.97);
    expect(aPrecio("  $ 1,299.00 USD ")).toBe(1299);
    expect(aPrecio("MXN 499,90")).toBe(499.9);
  });

  it("resuelve miles y decimales cuando hay dos separadores", () => {
    expect(aPrecio("1.299,00")).toBe(1299);
    expect(aPrecio("1,299.00")).toBe(1299);
    expect(aPrecio("1.234.567,89")).toBe(1234567.89);
    expect(aPrecio("1,234,567.89")).toBe(1234567.89);
  });

  it("con un solo separador decide por los dígitos que le siguen", () => {
    // Tres dígitos detrás → separador de miles.
    expect(aPrecio("1,299")).toBe(1299);
    expect(aPrecio("1.299")).toBe(1299);
    // Uno o dos → separador decimal.
    expect(aPrecio("22,9")).toBe(22.9);
    expect(aPrecio("22.97")).toBe(22.97);
  });

  it("trata un separador repetido como miles", () => {
    expect(aPrecio("1.234.567")).toBe(1234567);
    expect(aPrecio("1,234,567")).toBe(1234567);
  });

  it("descarta lo que no es un precio usable", () => {
    expect(aPrecio("")).toBeUndefined();
    expect(aPrecio("gratis")).toBeUndefined();
    expect(aPrecio("0")).toBeUndefined();
    expect(aPrecio(-5)).toBeUndefined();
    expect(aPrecio(null)).toBeUndefined();
  });
});

describe("monedaNoUsd", () => {
  it("marca solo lo que no es USD", () => {
    expect(monedaNoUsd("USD")).toBeUndefined();
    expect(monedaNoUsd("usd")).toBeUndefined();
    expect(monedaNoUsd("MXN")).toBe("MXN");
    expect(monedaNoUsd("cop")).toBe("COP");
  });

  it("ignora valores que no son un código de tres letras", () => {
    expect(monedaNoUsd("dólares")).toBeUndefined();
    expect(monedaNoUsd("$")).toBeUndefined();
    expect(monedaNoUsd(42)).toBeUndefined();
  });
});

describe("extraerDeJsonLd — variantes estructurales", () => {
  it("@type como arreglo", () => {
    const html = ld({
      "@type": ["Product", "Thing"],
      name: "Samba OG",
      offers: { "@type": "Offer", price: "100.00", priceCurrency: "USD" },
    });
    expect(extraerDeJsonLd(html, BASE).nombre).toBe("Samba OG");
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBe(100);
  });

  it("@graph como contenedor", () => {
    const html = ld({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Tienda" },
        { "@type": "Product", name: "Bolso Tote", offers: { price: "249.99" } },
      ],
    });
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({
      nombre: "Bolso Tote",
      precio_usd: 249.99,
    });
  });

  it("@graph anidado dentro de mainEntity", () => {
    const html = ld({
      "@type": "WebPage",
      mainEntity: { "@type": "Product", name: "Reloj Casio", offers: { price: 59 } },
    });
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({ nombre: "Reloj Casio", precio_usd: 59 });
  });

  it("itemListElement como contenedor", () => {
    const html = ld({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", item: { "@type": "Thing", name: "otro" } },
        { "@type": "Product", name: "Perfume Bleu", offers: { price: "175" } },
      ],
    });
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({ nombre: "Perfume Bleu", precio_usd: 175 });
  });

  it("varios bloques ld+json: se queda con el más completo", () => {
    const html = [
      ld({ "@type": "Product", name: "Solo nombre" }),
      ld({ "@type": "Organization", name: "Tienda" }),
      ld({
        "@type": "Product",
        name: "Producto completo",
        image: "https://cdn.tienda.com/x.jpg",
        offers: { price: "80" },
      }),
    ].join("");
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({
      nombre: "Producto completo",
      precio_usd: 80,
      imagen_url: "https://cdn.tienda.com/x.jpg",
    });
  });

  it("un bloque roto no invalida los siguientes", () => {
    const html =
      `<script type="application/ld+json">{esto no es json</script>` +
      ld({ "@type": "Product", name: "Sigue funcionando", offers: { price: "10" } });
    expect(extraerDeJsonLd(html, BASE).nombre).toBe("Sigue funcionando");
  });

  it("raíz como arreglo", () => {
    const html = ld([
      { "@type": "BreadcrumbList" },
      { "@type": "Product", name: "Desde arreglo", offers: { price: "12,50" } },
    ]);
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({
      nombre: "Desde arreglo",
      precio_usd: 12.5,
    });
  });
});

describe("extraerDeJsonLd — variantes de offers", () => {
  const conOferta = (offers: unknown) => ld({ "@type": "Product", name: "X", offers });

  it("Offer suelto", () => {
    expect(extraerDeJsonLd(conOferta({ "@type": "Offer", price: "42.50" }), BASE).precio_usd).toBe(
      42.5,
    );
  });

  it("arreglo de Offers: toma el primero utilizable", () => {
    const html = conOferta([{ "@type": "Offer" }, { "@type": "Offer", price: "31.99" }]);
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBe(31.99);
  });

  it("AggregateOffer con lowPrice y sin price", () => {
    const html = conOferta({ "@type": "AggregateOffer", lowPrice: "59.90", highPrice: "89.90" });
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBe(59.9);
  });

  it("AggregateOffer que envuelve Offers concretos", () => {
    const html = conOferta({
      "@type": "AggregateOffer",
      offers: [{ "@type": "Offer", price: "77.00" }],
    });
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBe(77);
  });

  it("ProductGroup sin offers propio: precio desde hasVariant", () => {
    // El patrón de Nike: el grupo no tiene precio, cada variante sí.
    const html = ld({
      "@type": "ProductGroup",
      name: "Air Force 1 '07",
      hasVariant: [
        { "@type": "Product", name: "… talla 5", offers: { "@type": "Offer", price: 115, priceCurrency: "USD" } },
        { "@type": "Product", name: "… talla 6", offers: { "@type": "Offer", price: 115, priceCurrency: "USD" } },
      ],
    });
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({
      nombre: "Air Force 1 '07",
      precio_usd: 115,
    });
  });

  it("con variantes a distinto precio toma la más barata", () => {
    const html = ld({
      "@type": "ProductGroup",
      name: "Camiseta",
      hasVariant: [
        { "@type": "Product", offers: { price: 39.99 } },
        { "@type": "Product", offers: { price: 24.99 } },
        { "@type": "Product", offers: { price: 34.99 } },
      ],
    });
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBe(24.99);
  });

  it("el offers propio del grupo gana sobre las variantes", () => {
    const html = ld({
      "@type": "ProductGroup",
      name: "Bolso",
      offers: { "@type": "AggregateOffer", lowPrice: 200 },
      hasVariant: [{ "@type": "Product", offers: { price: 999 } }],
    });
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBe(200);
  });

  it("hereda la moneda de la variante elegida", () => {
    const html = ld({
      "@type": "ProductGroup",
      hasVariant: [{ "@type": "Product", offers: { price: "1.399,00", priceCurrency: "MXN" } }],
    });
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({ precio_usd: 1399, moneda: "MXN" });
  });

  it("hasVariant sin ofertas usables no rompe nada", () => {
    const html = ld({
      "@type": "ProductGroup",
      name: "Sin precio",
      hasVariant: [{ "@type": "Product" }, "basura", null],
    });
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({ nombre: "Sin precio" });
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBeUndefined();
  });

  it("precio dentro de priceSpecification", () => {
    const html = conOferta({
      "@type": "Offer",
      priceSpecification: { "@type": "UnitPriceSpecification", price: "18.25" },
    });
    expect(extraerDeJsonLd(html, BASE).precio_usd).toBe(18.25);
  });
});

describe("moneda distinta de USD", () => {
  it("llena el precio igual y marca la moneda", () => {
    const html = ld({
      "@type": "Product",
      name: "Samba OG",
      offers: { price: "1.399,00", priceCurrency: "MXN" },
    });
    expect(extraerDeJsonLd(html, BASE)).toMatchObject({ precio_usd: 1399, moneda: "MXN" });
  });

  it("no marca nada cuando es USD", () => {
    const html = ld({ "@type": "Product", offers: { price: "10", priceCurrency: "USD" } });
    expect(extraerDeJsonLd(html, BASE).moneda).toBeUndefined();
  });

  it("lee la moneda desde priceSpecification", () => {
    const html = ld({
      "@type": "Product",
      offers: { priceSpecification: { price: "990", priceCurrency: "COP" } },
    });
    expect(extraerDeJsonLd(html, BASE).moneda).toBe("COP");
  });

  it("Open Graph también reporta la moneda", () => {
    const html = `<meta property="og:price:amount" content="499,90">
      <meta property="og:price:currency" content="MXN">`;
    expect(extraerDeOpenGraph(html, BASE)).toMatchObject({ precio_usd: 499.9, moneda: "MXN" });
  });

  it("fusionar toma la moneda de la misma fuente que el precio", () => {
    // JSON-LD gana en precio; la moneda de OG no debe colarse.
    const html =
      ld({ "@type": "Product", name: "P", offers: { price: "20", priceCurrency: "USD" } }) +
      `<meta property="og:price:amount" content="500"><meta property="og:price:currency" content="MXN">`;
    const r = fusionar(html, BASE);
    expect(r.precio_usd).toBe(20);
    expect(r.moneda).toBeUndefined();
  });
});

describe("nombres robustos", () => {
  it("decodifica entidades también en JSON-LD", () => {
    const html = ld({ "@type": "Product", name: "Camiseta b&aacute;sica &amp; c&oacute;moda" });
    expect(extraerDeJsonLd(html, BASE).nombre).toBe("Camiseta básica & cómoda");
  });

  it("distingue mayúsculas en las entidades acentuadas", () => {
    // &Aacute; es Á y &aacute; es á: bajar todo a minúsculas las confundía.
    const html = ld({ "@type": "Product", name: "&Aacute;GUILA y &aacute;guila", offers: { price: 1 } });
    expect(extraerDeJsonLd(html, BASE).nombre).toBe("ÁGUILA y águila");
  });

  it("colapsa espacios y recorta", () => {
    const html = ld({ "@type": "Product", name: "  Reloj   Casio\n A168  ", offers: { price: 1 } });
    expect(extraerDeJsonLd(html, BASE).nombre).toBe("Reloj Casio A168");
  });

  it("ignora marcadores de relleno", () => {
    for (const relleno of ["", "  ", "-", "N/A", "null", "undefined", "{{productName}}", "%s"]) {
      const html = ld({ "@type": "Product", name: relleno, offers: { price: "10" } });
      expect(extraerDeJsonLd(html, BASE).nombre).toBeUndefined();
    }
  });

  it("un marcador en og:title no tapa un nombre real del JSON-LD", () => {
    const html =
      `<meta property="og:title" content="N/A">` +
      ld({ "@type": "Product", name: "Nombre real", offers: { price: "10" } });
    expect(fusionar(html, BASE).nombre).toBe("Nombre real");
  });
});
