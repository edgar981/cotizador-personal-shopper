import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { normalizarRecorte, type Recorte } from "./recorte";

/**
 * Extracción de datos de producto desde una captura de pantalla.
 *
 * El bloqueo anti-bot es contra el servidor, no contra la usuaria: la página
 * carga perfecto en su iPhone. La captura evita el problema de raíz.
 */

const MODELO = "claude-sonnet-4-6";

/** Formatos que acepta la API de visión. */
export const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type MimePermitido = (typeof MIME_PERMITIDOS)[number];

export type ProductoDeCaptura = {
  nombre: string | null;
  precio_usd: number | null;
  marca: string | null;
  categoria_sugerida: string | null;
  talla_notas: string | null;
  /** Recuadro de la foto del producto dentro de la captura. */
  recorte_producto: Recorte | null;
};

export const PRODUCTO_VACIO: ProductoDeCaptura = {
  nombre: null,
  precio_usd: null,
  marca: null,
  categoria_sugerida: null,
  talla_notas: null,
  recorte_producto: null,
};

function construirPrompt(categorias: string[]): string {
  const lista = categorias.length ? categorias.join(", ") : "sin categorías configuradas";

  return `Eres un asistente que lee capturas de pantalla de páginas de producto de tiendas de Estados Unidos.

Devuelve ÚNICAMENTE un objeto JSON con esta forma exacta, sin preámbulo, sin explicación y sin backticks:

{"nombre": string|null, "precio_usd": number|null, "marca": string|null, "categoria_sugerida": string|null, "talla_notas": string|null, "recorte_producto": {"x": number, "y": number, "ancho": number, "alto": number}|null}

Reglas:
- Si hay varios precios (por ejemplo uno tachado y otro de promoción), devuelve el precio VIGENTE que pagaría el comprador hoy, nunca el original tachado.
- Ignora precios que no correspondan al producto principal: cuotas o financiación ("4 pagos de $32.50"), precios de productos relacionados o recomendados, y totales del carrito.
- "precio_usd" debe ser un número sin símbolo de moneda y sin separadores de miles. Ejemplo: 1299.00 para "$1,299.00".
- "categoria_sugerida" debe ser exactamente una de estas categorías: ${lista}. Si ninguna encaja, devuelve null.
- "talla_notas" es texto libre y corto con tallas, colores o referencia visibles. Si no hay, null.
- "marca" es la marca del producto si se distingue.
- Si la imagen NO es una página de producto, devuelve todos los campos en null.
- No inventes valores. Si un dato no se distingue con claridad en la imagen, ese campo va en null.

Sobre "recorte_producto": es el rectángulo de la FOTO PRINCIPAL del producto dentro de la captura, en fracciones de 0 a 1 respecto al ancho y alto totales de la imagen ("x" e "y" son la esquina superior izquierda).

Este recorte se publica solo, sin nada alrededor, así que la regla que manda es: DENTRO DEL RECUADRO NO PUEDE QUEDAR NINGÚN TEXTO LEGIBLE. Nada de nombre, precio, descuento, tallas, botones, encabezados, menús ni miniaturas de otras fotos.

Para lograrlo:
1. Ubica el panel de la foto del producto y fíjate dónde termina, es decir dónde empieza la columna o el bloque de texto con el nombre y el precio.
2. Cierra el recuadro ANTES de ese borde, no después.
3. Repasa mentalmente los cuatro lados: si en alguno entra texto, encoge ese lado.

Prefiere siempre un recuadro pequeño y limpio a uno grande con texto: recortar de más solo pierde fondo, recortar de menos arruina la publicación. Si no hay una foto de producto clara, devuelve null.`;
}

/** Quita fences ```json y cualquier texto alrededor del objeto JSON. */
export function limpiarJson(texto: string): string {
  let limpio = texto.trim();

  const fence = limpio.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) limpio = fence[1].trim();

  // Si el modelo agregó preámbulo, nos quedamos con el primer objeto balanceado.
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio !== -1 && fin > inicio) limpio = limpio.slice(inicio, fin + 1);

  return limpio;
}

function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : null;
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function aTexto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.replace(/\s+/g, " ").trim();
  return texto ? texto.slice(0, maximo) : null;
}

/**
 * Parseo defensivo: cualquier salida inesperada se convierte en campos vacíos
 * en vez de romper el flujo.
 */
export function parsearRespuesta(texto: string, categorias: string[]): ProductoDeCaptura {
  let datos: unknown;
  try {
    datos = JSON.parse(limpiarJson(texto));
  } catch {
    return { ...PRODUCTO_VACIO };
  }
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return { ...PRODUCTO_VACIO };

  const d = datos as Record<string, unknown>;
  const sugerida = aTexto(d.categoria_sugerida, 40)?.toLowerCase() ?? null;

  return {
    nombre: aTexto(d.nombre, 200),
    precio_usd: aNumero(d.precio_usd),
    marca: aTexto(d.marca, 60),
    // Solo aceptamos una categoría que realmente exista en la configuración.
    categoria_sugerida: sugerida && categorias.includes(sugerida) ? sugerida : null,
    talla_notas: aTexto(d.talla_notas, 300),
    recorte_producto: normalizarRecorte(d.recorte_producto),
  };
}

/**
 * Nunca lanza: si falla la API o el parseo, devuelve campos vacíos y la usuaria
 * llena el formulario a mano (la captura subida se conserva igual).
 */
export async function extraerDeCaptura(
  imagenBase64: string,
  mediaType: MimePermitido,
  categorias: string[],
): Promise<ProductoDeCaptura> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Falta ANTHROPIC_API_KEY: no se puede leer la captura.");
    return { ...PRODUCTO_VACIO };
  }

  const client = new Anthropic({ apiKey });

  try {
    const respuesta = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      // Sin pensamiento extendido: es una lectura directa y la usuaria está
      // esperando. `medium` porque el precio es plata: distinguir el tachado
      // del vigente importa más que ahorrar unos segundos. Si quieres más
      // velocidad baja a "low"; si falla en promociones raras, sube a
      // { type: "adaptive" }.
      thinking: { type: "disabled" },
      output_config: { effort: "medium" },
      system: construirPrompt(categorias),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imagenBase64 } },
            { type: "text", text: "Extrae los datos del producto de esta captura." },
          ],
        },
      ],
    });

    if (respuesta.stop_reason === "refusal") return { ...PRODUCTO_VACIO };

    // Puede venir más de un bloque; nos quedamos con el texto.
    const texto = respuesta.content
      .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === "text")
      .map((bloque) => bloque.text)
      .join("")
      .trim();

    if (!texto) return { ...PRODUCTO_VACIO };
    return parsearRespuesta(texto, categorias);
  } catch (error) {
    console.error("Falló la lectura de la captura:", error);
    return { ...PRODUCTO_VACIO };
  }
}
