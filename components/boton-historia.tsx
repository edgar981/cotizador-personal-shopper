"use client";

import { Download, ImageIcon, Loader2, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { compartir, descargar, nombreArchivo, usePuedeCompartir } from "@/lib/compartir";
import { cn } from "@/lib/utils";

/**
 * Regenera la historia de una cotización guardada. Usa los datos persistidos:
 * el servidor no recalcula nada.
 */
export function BotonHistoria({
  id,
  nombre,
  className,
}: {
  id: string;
  nombre: string;
  className?: string;
}) {
  const [generando, setGenerando] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const puedeCompartir = usePuedeCompartir();
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function generar() {
    setGenerando(true);
    try {
      const res = await fetch(`/api/historia/${id}`);
      if (!res.ok) throw new Error("fallo");
      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setPreview({ url, blob });
    } catch {
      toast.error("No pude generar la historia. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  }

  async function compartirHistoria() {
    if (!preview) return;
    const archivo = nombreArchivo(nombre);
    const ok = await compartir(preview.blob, archivo, nombre);
    if (!ok) descargar(preview.blob, archivo);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Button type="button" className="h-12 w-full" onClick={generar} disabled={generando}>
        {generando ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ImageIcon className="size-4" aria-hidden />
        )}
        Volver a generar historia
      </Button>

      {preview ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt="Historia generada"
              className="mx-auto w-full max-w-[260px] rounded-xl border"
            />
            <Button type="button" className="h-11" onClick={compartirHistoria}>
              {puedeCompartir ? (
                <Share2 className="size-4" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              {puedeCompartir ? "Compartir" : "Descargar"}
            </Button>
            {puedeCompartir ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => descargar(preview.blob, nombreArchivo(nombre))}
              >
                <Download className="size-4" aria-hidden />
                Descargar
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
