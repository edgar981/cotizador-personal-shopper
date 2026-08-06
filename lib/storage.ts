import "server-only";
import { del, put } from "@vercel/blob";

/**
 * Adaptador de almacenamiento, agnóstico de proveedor.
 *
 * Ningún otro módulo debe importar `@vercel/blob` directamente: cuando migremos
 * a R2 (u otro), solo cambia este archivo.
 */

export type ArchivoSubido = { url: string };

export interface Almacenamiento {
  put(file: File | Buffer, key: string): Promise<ArchivoSubido>;
  delete(url: string): Promise<void>;
}

const vercelBlob: Almacenamiento = {
  async put(file, key) {
    const { url } = await put(key, file, {
      access: "public",
      // La clave ya viene con sufijo único desde `claveCaptura`.
      addRandomSuffix: false,
      contentType: file instanceof File ? file.type || undefined : undefined,
    });
    return { url };
  },

  async delete(url) {
    await del(url);
  },
};

export const storage: Almacenamiento = vercelBlob;

/** Clave única para una captura: `capturas/<fecha>/<uuid>.<ext>`. */
export function claveCaptura(mimeType: string, hoy: string): string {
  const extension =
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mimeType] ?? "jpg";
  return `capturas/${hoy}/${crypto.randomUUID()}.${extension}`;
}
