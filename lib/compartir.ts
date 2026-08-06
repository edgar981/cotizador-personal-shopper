"use client";

/** Utilidades de cliente para bajar o compartir la imagen de la historia. */
import { useSyncExternalStore } from "react";

export function nombreArchivo(nombre: string): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 50) || "historia";
  return `${base}.png`;
}

export function descargar(blob: Blob, archivo: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = archivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Damos margen a Safari para iniciar la descarga antes de liberar el blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** true si se compartió, false si el navegador no lo soporta o se canceló. */
export async function compartir(blob: Blob, archivo: string, titulo: string) {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  const file = new File([blob], archivo, { type: "image/png" });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: titulo });
    return true;
  } catch {
    return false;
  }
}

const sinSuscripcion = () => () => {};

/**
 * Capacidad del navegador, no estado de React: se lee con
 * `useSyncExternalStore` para no hidratar distinto de lo que pintó el servidor.
 */
export function usePuedeCompartir(): boolean {
  return useSyncExternalStore(sinSuscripcion, puedeCompartirArchivos, () => false);
}

export function puedeCompartirArchivos() {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
  try {
    const file = new File([new Blob([new Uint8Array([0])])], "t.png", { type: "image/png" });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
