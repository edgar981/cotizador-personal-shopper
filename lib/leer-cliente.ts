import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { type DestinoTipo } from "./encargos";
// Se reutiliza el limpiador de la extracción por visión en vez de copiarlo: es
// el mismo problema (el modelo a veces envuelve el JSON en fences o preámbulo)
// y tener dos copias garantiza que una se quede atrás.
import { limpiarJson } from "./vision";

/**
 * Lectura de los datos de entrega desde el mensaje que el cliente manda por
 * WhatsApp.
 *
 * Hoy esos datos se transcriben a mano, y cada mensaje llega distinto: unos con
 * etiquetas, otros como líneas sueltas, la cédula con puntos o sin ellos, la
 * ciudad pegada al departamento. Una expresión regular no cubre eso; el modelo
 * sí, y el resultado siempre cae en un formulario editable.
 *
 * Nunca bloquea: si la API o el parseo fallan, los campos quedan vacíos y el
 * mensaje pegado se conserva para transcribirlo a mano.
 */

const MODELO = "claude-sonnet-4-6";

export type DatosCliente = {
  cliente_nombre: string | null;
  cliente_doc: string | null;
  cliente_tel: string | null;
  destino_ciudad: string | null;
  destino_dir: string | null;
  cliente_notas: string | null;
};

export const CLIENTE_VACIO: DatosCliente = {
  cliente_nombre: null,
  cliente_doc: null,
  cliente_tel: null,
  destino_ciudad: null,
  destino_dir: null,
  cliente_notas: null,
};

/** Tope del mensaje pegado. Un mensaje de datos de entrega no llega ni cerca. */
export const MAX_MENSAJE = 4000;

export const PROMPT = `Eres un asistente que lee mensajes de WhatsApp en los que un cliente colombiano manda sus datos para recibir un pedido.

Devuelve ÚNICAMENTE un objeto JSON con esta forma exacta, sin preámbulo, sin explicación y sin backticks:

{"cliente_nombre": string|null, "cliente_doc": string|null, "cliente_tel": string|null, "destino_ciudad": string|null, "destino_dir": string|null, "cliente_notas": string|null}

Reglas:
- Los mensajes llegan en formatos muy distintos: unos traen etiquetas ("Nombre:", "Cc.", "Cédula", "Celular:", "Tel", "Dirección:", "Dir") y otros son líneas sueltas sin ninguna etiqueta. Tienes que manejar los dos casos.
- "cliente_doc" es la cédula. Puede venir con puntos o sin ellos (1.123.123.836 o 1104123402). Devuélvela SOLO con dígitos.
- "cliente_tel" es el celular. En Colombia son 10 dígitos que empiezan por 3, a veces escritos con espacios (300 123 4567). Devuélvelo SOLO con dígitos. Si trae indicativo +57 al principio, quítalo.
- No confundas los dos números: el celular tiene 10 dígitos y empieza por 3; la cédula normalmente no empieza por 3 y puede tener entre 6 y 10 dígitos. Si el mensaje trae los dos, el que empieza por 3 con 10 dígitos es el celular.
- "destino_ciudad" va SEPARADA de la dirección, aunque en el mensaje vengan juntas. La ciudad puede estar al final de la línea de dirección, en una línea aparte, o pegada al departamento. Devuelve solo la ciudad, sin el departamento. Ojo: muchas veces NO hay coma que separe la dirección de la ciudad; si la línea termina con el nombre de un municipio, sepáralo igual.

Ejemplos de cómo separar dirección y ciudad:
- "Calle 10 # 5-40 apto 201, Medellín" → destino_dir "Calle 10 # 5-40 apto 201", destino_ciudad "Medellín".
- "Cra 15 # 9-22 Sincelejo" → destino_dir "Cra 15 # 9-22", destino_ciudad "Sincelejo". Sin coma, pero Sincelejo es el municipio.
- "Calle 7 # 3-18 barrio Centro, Cartagena-Bolívar" → destino_dir "Calle 7 # 3-18 barrio Centro", destino_ciudad "Cartagena".
- "Av 30 # 12-05 torre 2 apto 604" con "Valledupar - Cesar" en otra línea → destino_dir "Av 30 # 12-05 torre 2 apto 604", destino_ciudad "Valledupar".

La mayoría de los pedidos van a San Marcos (Sucre) o a Bogotá: si el mensaje nombra alguno de esos dos, esa es la ciudad, aunque venga pegada a la dirección.
- "destino_dir" es la dirección de entrega COMPLETA. Apartamento, interior, torre, edificio, manzana, barrio y puntos de referencia SON parte de la dirección, no notas: van todos dentro de este campo, aunque vengan en líneas aparte o con su propia etiqueta ("Apto:", "Referencia.", "Ref", "Punto de referencia"). Una línea que explica cómo llegar ("bajando la calle de la iglesia, tres casas después") es parte de la dirección.
- Si el nombre de la ciudad aparece DENTRO del nombre de un edificio, una empresa o un conjunto —"Soc. Portuaria Santa Marta", "Clínica Medellín", "Centro Comercial Bogotá"— déjalo ahí: eso es el nombre del sitio, no la ciudad de destino. La ciudad solo se separa cuando está puesta como ciudad de destino: al principio o al final de la línea de dirección, o en su propia línea.
- "cliente_notas" es solo para lo que no es dato de entrega: comentarios sobre el producto ("para acá van los zapatos azules"), sobre horarios o sobre a quién entregar. Cópialos tal como los escribió el cliente, sin reescribirlos. Nunca pongas ahí la dirección, la ciudad, el barrio, los puntos de referencia, la cédula ni el teléfono.
- Si el mensaje NO trae ningún dato de entrega (es saludo, conversación o una pregunta), devuelve TODOS los campos en null, incluido "cliente_notas". Una nota suelta sin datos no sirve de nada.
- Lo que no se distinga con claridad va en null. No inventes datos ni completes lo que falte.`;

/** Solo los dígitos, o null si no quedó ninguno. */
function soloDigitos(valor: unknown): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const digitos = String(valor).replace(/\D/g, "");
  return digitos || null;
}

/**
 * Cédula: solo dígitos. Se descarta lo que no tenga largo de documento — así un
 * número suelto que el modelo confundió no entra como cédula.
 */
export function normalizarDocumento(valor: unknown): string | null {
  const digitos = soloDigitos(valor);
  if (!digitos) return null;
  return digitos.length >= 5 && digitos.length <= 15 ? digitos : null;
}

/**
 * Celular: solo dígitos, sin el indicativo del país. No se exige que empiece
 * por 3 ni que tenga diez dígitos: un fijo con indicativo de ciudad también
 * sirve para que la transportadora llame, y descartarlo perdería un dato bueno.
 */
export function normalizarTelefono(valor: unknown): string | null {
  let digitos = soloDigitos(valor);
  if (!digitos) return null;
  if (digitos.length === 12 && digitos.startsWith("57")) digitos = digitos.slice(2);
  return digitos.length >= 7 && digitos.length <= 12 ? digitos : null;
}

function aTexto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.replace(/\s+/g, " ").trim();
  return texto ? texto.slice(0, maximo) : null;
}

/** Minúsculas y sin tildes, para comparar nombres de ciudad. */
function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Los dos destinos con nombre propio, buscados dentro de un texto cualquiera. */
function destinoConocido(texto: string | null | undefined): DestinoTipo | null {
  if (!texto?.trim()) return null;
  const plana = plano(texto);
  if (plana.includes("san marcos")) return "san_marcos";
  if (plana.includes("bogota")) return "bogota";
  return null;
}

/**
 * Destino que corresponde a la ciudad leída. Es una sugerencia: el selector
 * queda editable, y por eso ante la duda se cae en "otra ciudad", que es el
 * caso que siempre pide escribir la ciudad a mano.
 *
 * Si no hubo ciudad se mira la dirección, porque cuando el municipio viene
 * pegado al final de la línea ("Cra 8 # 20-15 San Marcos") el modelo a veces lo
 * deja ahí adentro. Ahí solo se reconocen San Marcos y Bogotá: cualquier otra
 * palabra suelta dentro de una dirección no alcanza para afirmar que es una
 * ciudad, y equivocarse mandaría el encargo al grupo de despacho equivocado.
 *
 * Devuelve null cuando no hay nada que sugerir, y entonces el destino que ya
 * estuviera elegido se queda como está.
 */
export function sugerirDestino(
  ciudad: string | null | undefined,
  direccion?: string | null,
): DestinoTipo | null {
  const porCiudad = destinoConocido(ciudad);
  if (porCiudad) return porCiudad;
  if (ciudad?.trim()) return "otra_ciudad";
  return destinoConocido(direccion);
}

/**
 * Parseo defensivo: cualquier salida inesperada se convierte en campos vacíos
 * en vez de romper el flujo. Los largos son los mismos que valida la acción de
 * guardar, para que lo leído nunca se rechace después por pasarse.
 */
export function parsearDatosCliente(texto: string): DatosCliente {
  let datos: unknown;
  try {
    datos = JSON.parse(limpiarJson(texto));
  } catch {
    return { ...CLIENTE_VACIO };
  }
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return { ...CLIENTE_VACIO };

  const d = datos as Record<string, unknown>;

  return {
    cliente_nombre: aTexto(d.cliente_nombre, 120),
    cliente_doc: normalizarDocumento(d.cliente_doc),
    cliente_tel: normalizarTelefono(d.cliente_tel),
    destino_ciudad: aTexto(d.destino_ciudad, 80),
    destino_dir: aTexto(d.destino_dir, 300),
    cliente_notas: aTexto(d.cliente_notas, 500),
  };
}

/**
 * Nunca lanza: si falla la API o el parseo, devuelve campos vacíos y el
 * formulario se llena a mano (el mensaje pegado se conserva).
 */
export async function leerDatosDeMensaje(mensaje: string): Promise<DatosCliente> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Falta ANTHROPIC_API_KEY: no se puede leer el mensaje.");
    return { ...CLIENTE_VACIO };
  }

  const client = new Anthropic({ apiKey });

  try {
    const respuesta = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      // Sin pensamiento extendido: es una lectura corta y la usuaria está
      // esperando con el cliente al otro lado del chat.
      thinking: { type: "disabled" },
      output_config: { effort: "medium" },
      system: PROMPT,
      messages: [
        {
          role: "user",
          // El mensaje va delimitado para que el modelo no confunda una
          // instrucción escrita por el cliente con una orden nuestra.
          content: `Extrae los datos de este mensaje:\n\n<mensaje>\n${mensaje}\n</mensaje>`,
        },
      ],
    });

    if (respuesta.stop_reason === "refusal") return { ...CLIENTE_VACIO };

    const texto = respuesta.content
      .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === "text")
      .map((bloque) => bloque.text)
      .join("")
      .trim();

    if (!texto) return { ...CLIENTE_VACIO };
    return parsearDatosCliente(texto);
  } catch (error) {
    console.error("Falló la lectura del mensaje del cliente:", error);
    return { ...CLIENTE_VACIO };
  }
}
