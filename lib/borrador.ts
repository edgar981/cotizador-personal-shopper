/**
 * Borrador de la cotización en curso, en localStorage.
 *
 * La usuaria arma una cotización con el cliente al teléfono: si sale de la
 * pantalla a medias, perdía la captura ya subida y todo lo escrito. Se guarda
 * uno solo a la vez y caduca a las 24 horas, porque un borrador viejo confunde
 * más de lo que ayuda.
 *
 * Acá vive la parte pura (validar y caducar); el acceso a localStorage va
 * envuelto en try/catch: Safari en modo privado lanza al escribir.
 */

import type { Recorte } from "./recorte";

export const CLAVE_BORRADOR = "cotizador:borrador:v1";

/** Un borrador de ayer ya no describe lo que la usuaria estaba haciendo. */
export const VIGENCIA_MS = 24 * 60 * 60 * 1000;

export type Medidas = { ancho: number; alto: number };

export type BorradorCotizacion = {
  /** Epoch en ms del último guardado. */
  guardadoEn: number;
  url: string;
  campos: {
    nombre: string;
    imagen_url: string;
    precio_usd: string;
    categoria: string;
    peso_lb: string;
    talla_notas: string;
  };
  origen: "url" | "captura";
  /** Ya está en Blob: es una URL remota, sobrevive al recargar. */
  capturaUrl: string | null;
  recorte: Recorte | null;
  medidasCaptura: Medidas | null;
  historiaUrl: string | null;
  historiaRecorte: Recorte | null;
  medidasHistoria: Medidas | null;
  zona: string;
  formVisible: boolean;
};

export function estaVigente(borrador: { guardadoEn: number }, ahora: number): boolean {
  const edad = ahora - borrador.guardadoEn;
  // Una marca futura (reloj cambiado) se trata como no vigente: es más seguro
  // descartar que restaurar algo que no se puede fechar.
  return edad >= 0 && edad < VIGENCIA_MS;
}

/**
 * Vale la pena guardar solo si hay algo que perder. Sin esto, entrar y salir de
 * la pantalla dejaría un borrador vacío y el aviso de "recuperado" saldría sin
 * que haya nada recuperado.
 */
export function tieneContenido(borrador: BorradorCotizacion): boolean {
  const c = borrador.campos;
  return Boolean(
    c.nombre.trim() ||
      c.precio_usd.trim() ||
      c.peso_lb.trim() ||
      c.categoria.trim() ||
      c.talla_notas.trim() ||
      c.imagen_url.trim() ||
      borrador.url.trim() ||
      borrador.capturaUrl ||
      borrador.historiaUrl,
  );
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function medidas(valor: unknown): Medidas | null {
  if (!valor || typeof valor !== "object") return null;
  const m = valor as Record<string, unknown>;
  const ancho = Number(m.ancho);
  const alto = Number(m.alto);
  if (!Number.isFinite(ancho) || !Number.isFinite(alto)) return null;
  if (ancho <= 0 || alto <= 0) return null;
  return { ancho, alto };
}

function recorte(valor: unknown): Recorte | null {
  if (!valor || typeof valor !== "object") return null;
  const r = valor as Record<string, unknown>;
  const nums = [r.x, r.y, r.ancho, r.alto].map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, ancho, alto] = nums;
  if (ancho <= 0 || alto <= 0) return null;
  return { x, y, ancho, alto };
}

function urlONulo(valor: unknown): string | null {
  const s = texto(valor).trim();
  return s ? s : null;
}

/**
 * Convierte lo que salga de localStorage en un borrador utilizable, o null.
 * Nunca lanza: un borrador corrupto no puede tumbar la pantalla principal.
 */
export function normalizarBorrador(valor: unknown, ahora: number): BorradorCotizacion | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const b = valor as Record<string, unknown>;

  const guardadoEn = Number(b.guardadoEn);
  if (!Number.isFinite(guardadoEn)) return null;
  if (!estaVigente({ guardadoEn }, ahora)) return null;

  const campos = (b.campos ?? {}) as Record<string, unknown>;
  const borrador: BorradorCotizacion = {
    guardadoEn,
    url: texto(b.url),
    campos: {
      nombre: texto(campos.nombre),
      imagen_url: texto(campos.imagen_url),
      precio_usd: texto(campos.precio_usd),
      categoria: texto(campos.categoria),
      peso_lb: texto(campos.peso_lb),
      talla_notas: texto(campos.talla_notas),
    },
    origen: b.origen === "captura" ? "captura" : "url",
    capturaUrl: urlONulo(b.capturaUrl),
    recorte: recorte(b.recorte),
    medidasCaptura: medidas(b.medidasCaptura),
    historiaUrl: urlONulo(b.historiaUrl),
    historiaRecorte: recorte(b.historiaRecorte),
    medidasHistoria: medidas(b.medidasHistoria),
    zona: texto(b.zona),
    formVisible: b.formVisible === true,
  };

  return tieneContenido(borrador) ? borrador : null;
}

// --------------------------------------------------------------- localStorage

export function leerBorrador(ahora: number = Date.now()): BorradorCotizacion | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_BORRADOR);
    if (!crudo) return null;
    const borrador = normalizarBorrador(JSON.parse(crudo), ahora);
    // Caducado o corrupto: se limpia para no volver a intentarlo cada vez.
    if (!borrador) window.localStorage.removeItem(CLAVE_BORRADOR);
    return borrador;
  } catch {
    return null;
  }
}

export function guardarBorrador(borrador: BorradorCotizacion): void {
  if (typeof window === "undefined") return;
  try {
    if (!tieneContenido(borrador)) {
      window.localStorage.removeItem(CLAVE_BORRADOR);
      return;
    }
    window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
  } catch {
    // Sin cuota o en modo privado: el borrador es una comodidad, no se avisa.
  }
}

export function borrarBorrador(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // Nada que hacer.
  }
}
