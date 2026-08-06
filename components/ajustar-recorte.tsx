"use client";

import { Check, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ASPECTO_HISTORIA, conformarAspecto, type Recorte } from "@/lib/recorte";

/** Lado menor del recuadro, en fracción de la imagen. */
const MINIMO = 0.08;

type Arrastre = { tipo: "mover" | "esquina"; x: number; y: number; inicio: Recorte };

function encajar(valor: number, min: number, max: number) {
  return Math.min(Math.max(valor, min), max);
}

/**
 * Ajuste del recuadro sobre la captura completa. Un dedo dentro mueve, la
 * manija de la esquina redimensiona.
 *
 * El recuadro está **bloqueado a la proporción del hueco de la historia**: si
 * fuera libre, la plantilla tendría que recortarlo otra vez para encajarlo y lo
 * publicado no coincidiría con lo ajustado.
 */
export function AjustarRecorte({
  src,
  inicial,
  origenAncho,
  origenAlto,
  onConfirmar,
  onCancelar,
}: {
  src: string;
  inicial: Recorte | null;
  /** Medidas reales de la captura, para razonar la proporción en píxeles. */
  origenAncho: number;
  origenAlto: number;
  onConfirmar: (recorte: Recorte | null) => void;
  onCancelar: () => void;
}) {
  // La proporción en fracciones no es la misma que en píxeles: depende de las
  // medidas de la captura. Este factor convierte de una a otra.
  const razon = (origenAncho || 1) / (origenAlto || 1);

  /** Alto en fracción que mantiene el aspecto pedido para un ancho dado. */
  const altoPara = (ancho: number) => (ancho * razon) / ASPECTO_HISTORIA;

  const [recorte, setRecorte] = useState<Recorte>(() =>
    conformarAspecto(
      inicial ?? { x: 0.1, y: 0.1, ancho: 0.8, alto: 0.8 },
      origenAncho || 1,
      origenAlto || 1,
    ),
  );

  const contenedorRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<Arrastre | null>(null);

  function medidas() {
    const rect = contenedorRef.current?.getBoundingClientRect();
    return { ancho: rect?.width || 1, alto: rect?.height || 1 };
  }

  function iniciar(tipo: Arrastre["tipo"], evento: React.PointerEvent) {
    evento.preventDefault();
    evento.stopPropagation();
    (evento.target as HTMLElement).setPointerCapture?.(evento.pointerId);
    arrastreRef.current = { tipo, x: evento.clientX, y: evento.clientY, inicio: recorte };
  }

  function mover(evento: React.PointerEvent) {
    const arrastre = arrastreRef.current;
    if (!arrastre) return;
    const { ancho, alto } = medidas();
    const dx = (evento.clientX - arrastre.x) / ancho;
    const dy = (evento.clientY - arrastre.y) / alto;

    if (arrastre.tipo === "mover") {
      setRecorte({
        ...arrastre.inicio,
        x: encajar(arrastre.inicio.x + dx, 0, 1 - arrastre.inicio.ancho),
        y: encajar(arrastre.inicio.y + dy, 0, 1 - arrastre.inicio.alto),
      });
      return;
    }

    // Redimensionar manteniendo la proporción: el ancho manda y el alto se
    // deriva, acotado para no salirse por abajo ni por la derecha.
    const maximoPorAncho = 1 - arrastre.inicio.x;
    const maximoPorAlto = (1 - arrastre.inicio.y) / (razon / ASPECTO_HISTORIA);
    const nuevoAncho = encajar(
      arrastre.inicio.ancho + dx,
      MINIMO,
      Math.min(maximoPorAncho, maximoPorAlto),
    );

    setRecorte({
      ...arrastre.inicio,
      ancho: nuevoAncho,
      alto: altoPara(nuevoAncho),
    });
  }

  function soltar() {
    arrastreRef.current = null;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Arrastra el recuadro sobre la foto del producto. Eso es exactamente lo que saldrá en la
        historia.
      </p>

      <div
        ref={contenedorRef}
        className="relative touch-none overflow-hidden rounded-lg border select-none"
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="block w-full" draggable={false} />

        {/* Velo sobre lo que queda fuera */}
        <div className="pointer-events-none absolute inset-0 bg-black/50" />
        <div
          className="pointer-events-none absolute overflow-hidden"
          style={{
            left: `${recorte.x * 100}%`,
            top: `${recorte.y * 100}%`,
            width: `${recorte.ancho * 100}%`,
            height: `${recorte.alto * 100}%`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="absolute max-w-none"
            draggable={false}
            style={{
              width: `${(1 / recorte.ancho) * 100}%`,
              height: `${(1 / recorte.alto) * 100}%`,
              left: `${(-recorte.x / recorte.ancho) * 100}%`,
              top: `${(-recorte.y / recorte.alto) * 100}%`,
            }}
          />
        </div>

        {/* Marco arrastrable */}
        <div
          className="border-primary absolute cursor-move border-2"
          style={{
            left: `${recorte.x * 100}%`,
            top: `${recorte.y * 100}%`,
            width: `${recorte.ancho * 100}%`,
            height: `${recorte.alto * 100}%`,
          }}
          onPointerDown={(e) => iniciar("mover", e)}
        >
          <div
            className="bg-primary absolute -right-3 -bottom-3 size-6 cursor-se-resize rounded-full border-2 border-white"
            onPointerDown={(e) => iniciar("esquina", e)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={() => onConfirmar(null)}>
          <RotateCcw className="size-4" aria-hidden />
          Usar completa
        </Button>
        <Button type="button" className="h-11" onClick={() => onConfirmar(recorte)}>
          <Check className="size-4" aria-hidden />
          Listo
        </Button>
      </div>
      <Button type="button" variant="ghost" className="h-9 text-xs" onClick={onCancelar}>
        Cancelar
      </Button>
    </div>
  );
}
