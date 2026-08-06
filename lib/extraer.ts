import "server-only";

/**
 * Extracción de datos de producto desde la URL del retailer.
 *
 * Solo dos fuentes, en cascada: JSON-LD (`@type: Product`) y Open Graph.
 * Sin scraping por retailer, sin headless browser, sin bypass de anti-bot.
 * Si el sitio no expone ninguna de las dos, la usuaria llena el formulario.
 */

const TIMEOUT_MS = 8000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export type ProductoExtraido = {
  nombre?: string;
  imagen_url?: string;
  precio_usd?: number;
  /**
   * Moneda detectada cuando NO es USD. El precio se llena igual — descartarlo
   * sería peor — pero la UI avisa para que se verifique antes de cotizar.
   */
  moneda?: string;
};

export function esUrlHttpValida(valor: string): boolean {
  try {
    const u = new URL(valor);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Entidades HTML con nombre. El bloque Latin-1 (160–255) va generado en orden
 * de code point; los acentos son lo que más aparece en catálogos en español y
 * portugués, y sin ellos el nombre llega con "&aacute;" en medio.
 *
 * Ojo con las mayúsculas: `&Aacute;` y `&aacute;` son letras distintas, así que
 * la búsqueda es sensible a mayúsculas y solo cae a minúsculas para las pocas
 * entidades que los sitios escriben indistintamente (&AMP;, &NBSP;).
 */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml".split(
    " ",
  );

const ENTIDADES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bull: "•",
  euro: "€",
  trade: "™",
  ...Object.fromEntries(
    LATIN1.map((nombre, indice) => [nombre, String.fromCodePoint(160 + indice)]),
  ),
};

/** `nbsp` y demás espacios raros cuentan como espacio, no como carácter. */
function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(
      /&([a-zA-Z][a-zA-Z0-9]*);/g,
      (coincidencia, nombre: string) =>
        ENTIDADES[nombre] ?? ENTIDADES[nombre.toLowerCase()] ?? coincidencia,
    );
}

/**
 * Valores que algunos sitios dejan en las metaetiquetas cuando no tienen dato.
 * Tomarlos como nombre real sería peor que dejar el campo vacío.
 */
const MARCADORES_VACIOS = new Set([
  "-", "--", "n/a", "na", "null", "undefined", "none", "sin titulo", "sin título",
  "product", "producto", "product name", "nombre del producto", "title", "untitled",
]);

function esMarcador(texto: string): boolean {
  const normalizado = texto.toLowerCase().trim();
  if (MARCADORES_VACIOS.has(normalizado)) return true;
  // Plantillas sin renderizar: {{name}}, ${name}, %s, <%= name %>.
  return /^(\{\{.*\}\}|\$\{.*\}|%[sd]|<%.*%>)$/.test(normalizado);
}

function limpiarTexto(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  // `nbsp` y demás espacios unicode se colapsan como cualquier espacio.
  const texto = decodificarEntidades(valor).replace(/\s+/gu, " ").trim();
  if (!texto || esMarcador(texto)) return undefined;
  return texto.slice(0, 200);
}


/**
 * Normaliza un precio escrito en cualquier locale a número.
 *
 * El caso difícil es un solo separador: "1,299" y "1.299" son mil doscientos
 * noventa y nueve, mientras que "22,97" y "22.97" son veintidós con noventa y
 * siete. La regla que los distingue es cuántos dígitos vienen detrás:
 *
 * - dos separadores distintos → el ÚLTIMO es el decimal ("1.299,00", "1,299.00")
 * - el mismo separador repetido → todos son de miles ("1.234.567")
 * - un separador con exactamente 3 dígitos detrás → miles ("1,299")
 * - un separador con 1 o 2 dígitos detrás → decimal ("22,97")
 *
 * Los precios de retail no llevan 3 decimales, así que la penúltima regla es
 * segura en este dominio.
 */
export function aPrecio(valor: unknown): number | undefined {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : undefined;
  if (typeof valor !== "string") return undefined;

  // Fuera símbolos, códigos de moneda y espacios: solo dígitos y separadores.
  const limpio = valor.replace(/[^\d.,]/g, "");
  if (!limpio || !/\d/.test(limpio)) return undefined;

  const comas = (limpio.match(/,/g) ?? []).length;
  const puntos = (limpio.match(/\./g) ?? []).length;

  let normalizado: string;

  if (comas > 0 && puntos > 0) {
    // El separador que aparece más a la derecha es el decimal.
    const decimal = limpio.lastIndexOf(",") > limpio.lastIndexOf(".") ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    normalizado = limpio.split(miles).join("").replace(decimal, ".");
  } else if (comas + puntos === 0) {
    normalizado = limpio;
  } else {
    const separador = comas > 0 ? "," : ".";
    const repetido = comas + puntos > 1;
    const decimales = limpio.length - limpio.lastIndexOf(separador) - 1;
    // Repetido, o con 3 dígitos detrás → es separador de miles.
    normalizado =
      repetido || decimales === 3
        ? limpio.split(separador).join("")
        : limpio.replace(separador, ".");
  }

  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Código de moneda de 3 letras, o undefined. Solo marcamos lo que no es USD. */
export function monedaNoUsd(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const codigo = valor.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(codigo)) return undefined;
  return codigo === "USD" ? undefined : codigo;
}

function aUrlAbsoluta(valor: unknown, base: string): string | undefined {
  if (typeof valor !== "string" || !valor.trim()) return undefined;
  try {
    const u = new URL(valor.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Aplana el JSON-LD a una lista de nodos, entrando por los contenedores
 * estándar de schema.org. Son genéricos: ningún sitio recibe trato especial.
 */
const CONTENEDORES = ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement"] as const;

function aplanarNodos(raiz: unknown, salida: unknown[] = [], profundidad = 0): unknown[] {
  if (profundidad > 8 || raiz === null || typeof raiz !== "object") return salida;
  if (Array.isArray(raiz)) {
    for (const item of raiz) aplanarNodos(item, salida, profundidad + 1);
    return salida;
  }
  salida.push(raiz);
  const nodo = raiz as Record<string, unknown>;
  for (const clave of CONTENEDORES) {
    if (nodo[clave]) aplanarNodos(nodo[clave], salida, profundidad + 1);
  }
  return salida;
}

function esProducto(nodo: unknown): nodo is Record<string, unknown> {
  if (!nodo || typeof nodo !== "object") return false;
  const tipo = (nodo as Record<string, unknown>)["@type"];
  const tipos = Array.isArray(tipo) ? tipo : [tipo];
  return tipos.some(
    (t) => typeof t === "string" && ["product", "productgroup"].includes(t.toLowerCase()),
  );
}

/** `image` puede ser string, array, o un ImageObject con `url`. */
function imagenDeNodo(valor: unknown): unknown {
  if (Array.isArray(valor)) return imagenDeNodo(valor[0]);
  if (valor && typeof valor === "object") return (valor as Record<string, unknown>).url;
  return valor;
}

type PrecioDetectado = { precio: number; moneda?: string };

/**
 * `offers` puede ser un Offer suelto, un arreglo de ellos, o un AggregateOffer
 * (que trae `lowPrice`/`highPrice` en vez de `price`). También se mira
 * `priceSpecification`, que es donde algunos ponen el precio real.
 */
function precioDeOferta(valor: unknown, profundidad = 0): PrecioDetectado | undefined {
  if (profundidad > 4 || !valor) return undefined;

  if (Array.isArray(valor)) {
    for (const item of valor) {
      const encontrado = precioDeOferta(item, profundidad + 1);
      if (encontrado) return encontrado;
    }
    return undefined;
  }
  if (typeof valor !== "object") return undefined;

  const oferta = valor as Record<string, unknown>;
  const especificacion = oferta.priceSpecification;

  const precio =
    aPrecio(oferta.price) ??
    aPrecio(oferta.lowPrice) ??
    precioDeOferta(especificacion, profundidad + 1)?.precio ??
    // Ofertas anidadas: un AggregateOffer puede envolver Offers concretos.
    precioDeOferta(oferta.offers, profundidad + 1)?.precio;

  if (precio === undefined) return undefined;

  const moneda =
    monedaNoUsd(oferta.priceCurrency) ??
    monedaNoUsd((especificacion as Record<string, unknown> | undefined)?.priceCurrency);

  return { precio, moneda };
}

/**
 * Precio de un nodo Product/ProductGroup.
 *
 * Un `ProductGroup` suele no tener `offers` propio: cuelga un `hasVariant[]`
 * con un Product por talla o color, y el precio vive en cada variante. Si las
 * variantes no coinciden en precio se toma el más bajo, igual que con
 * `AggregateOffer.lowPrice`, que es el criterio que ya usábamos.
 */
function precioDeProducto(producto: Record<string, unknown>): PrecioDetectado | undefined {
  const propio = precioDeOferta(producto.offers);
  if (propio) return propio;

  const variantes = producto.hasVariant;
  if (!Array.isArray(variantes)) return undefined;

  let mejor: PrecioDetectado | undefined;
  for (const variante of variantes) {
    if (!variante || typeof variante !== "object") continue;
    const encontrado = precioDeOferta((variante as Record<string, unknown>).offers);
    if (encontrado && (!mejor || encontrado.precio < mejor.precio)) mejor = encontrado;
  }
  return mejor;
}

/** Cuántos de los tres campos trae un candidato: sirve para quedarse con el mejor. */
function completitud(p: ProductoExtraido): number {
  return (p.nombre ? 1 : 0) + (p.precio_usd ? 1 : 0) + (p.imagen_url ? 1 : 0);
}

/**
 * Recorre TODOS los bloques `ld+json` de la página (no solo el primero) y se
 * queda con el nodo Product más completo.
 *
 * No mezcla campos entre nodos distintos: una página puede describir varios
 * productos (recomendados, "otros colores") y combinarlos daría un Frankenstein
 * con el nombre de uno y el precio de otro.
 */
export function extraerDeJsonLd(html: string, base: string): ProductoExtraido {
  const bloques = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  let mejor: ProductoExtraido = {};

  for (const bloque of bloques) {
    let datos: unknown;
    try {
      datos = JSON.parse(bloque[1].trim());
    } catch {
      // Un bloque roto no invalida los demás.
      continue;
    }

    for (const nodo of aplanarNodos(datos)) {
      if (!esProducto(nodo)) continue;
      const producto = nodo as Record<string, unknown>;
      const oferta = precioDeProducto(producto);

      const candidato: ProductoExtraido = {
        nombre: limpiarTexto(producto.name),
        imagen_url: aUrlAbsoluta(imagenDeNodo(producto.image), base),
        precio_usd: oferta?.precio,
        moneda: oferta?.moneda,
      };

      if (completitud(candidato) > completitud(mejor)) mejor = candidato;
      // Los tres campos: no hay nada mejor que encontrar.
      if (completitud(mejor) === 3) return mejor;
    }
  }

  return mejor;
}

function meta(html: string, propiedad: string): string | undefined {
  // El orden de los atributos varía: buscamos la etiqueta y luego el content.
  const patron = new RegExp(
    `<meta[^>]+(?:property|name)=["']${propiedad.replace(/[:.]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const etiqueta = html.match(patron)?.[0];
  if (!etiqueta) return undefined;
  const content = etiqueta.match(/content=["']([^"']*)["']/i)?.[1];
  return limpiarTexto(content);
}

/** Título del documento. Solo sirve de último recurso: ver `fusionar`. */
export function tituloDocumento(html: string): string | undefined {
  return limpiarTexto(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

export function extraerDeOpenGraph(html: string, base: string): ProductoExtraido {
  const titulo = meta(html, "og:title") ?? meta(html, "twitter:title");

  const imagen =
    meta(html, "og:image:secure_url") ??
    meta(html, "og:image") ??
    meta(html, "twitter:image");

  const precio =
    meta(html, "og:price:amount") ??
    meta(html, "product:price:amount") ??
    meta(html, "twitter:data1");

  const moneda = monedaNoUsd(
    meta(html, "og:price:currency") ?? meta(html, "product:price:currency"),
  );

  return {
    nombre: titulo,
    moneda: aPrecio(precio) === undefined ? undefined : moneda,
    imagen_url: aUrlAbsoluta(imagen, base),
    precio_usd: aPrecio(precio),
  };
}

/**
 * Combina las dos fuentes. El `<title>` del documento solo se usa cuando la
 * página además expuso imagen o precio: si no, casi siempre estamos leyendo una
 * pantalla anti-bot ("Robot or human?") y es mejor devolver vacío que basura.
 */
export function fusionar(html: string, base: string): ProductoExtraido {
  const jsonLd = extraerDeJsonLd(html, base);
  const og = extraerDeOpenGraph(html, base);

  const imagen_url = jsonLd.imagen_url ?? og.imagen_url;
  // La moneda tiene que venir de la MISMA fuente que el precio: mezclarlas
  // avisaría de una moneda que no corresponde al número que se muestra.
  const { precio_usd, moneda } =
    jsonLd.precio_usd !== undefined
      ? { precio_usd: jsonLd.precio_usd, moneda: jsonLd.moneda }
      : { precio_usd: og.precio_usd, moneda: og.moneda };
  const nombre =
    jsonLd.nombre ?? og.nombre ?? (imagen_url || precio_usd ? tituloDocumento(html) : undefined);

  return { nombre, imagen_url, precio_usd, moneda };
}

/**
 * Nunca lanza: cualquier fallo devuelve `{}` y el formulario queda vacío.
 */
export async function extraerProducto(url: string): Promise<ProductoExtraido> {
  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return {};
    const tipo = res.headers.get("content-type") ?? "";
    if (!tipo.includes("html") && !tipo.includes("xml")) return {};
    html = await res.text();
  } catch {
    return {};
  }

  return fusionar(html, url);
}
