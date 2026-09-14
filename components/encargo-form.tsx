"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  actualizarEncargo,
  crearEncargo,
  type EntradaEncargo,
} from "@/app/actions/encargos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DESTINOS, requiereCiudad, type DestinoTipo } from "@/lib/encargos";
import { cn } from "@/lib/utils";

/** Todo se edita como texto y se convierte al enviar, igual que en /config. */
export type ValoresEncargo = {
  cliente_nombre: string;
  cliente_tel: string;
  cliente_notas: string;
  talla: string;
  color: string;
  cantidad: string;
  destino_tipo: DestinoTipo;
  destino_ciudad: string;
  destino_dir: string;
  precio_cop: string;
  envio_cop: string;
  abono_cop: string;
  guia: string;
  notas: string;
};

export type EnviosPorDestino = Record<DestinoTipo, number | null>;

/** Entero de COP; vacío es null (el campo es opcional), no cero. */
function aEntero(valor: string): number | null {
  const limpio = valor.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (!limpio.trim()) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n) : null;
}

type Props = {
  inicial: ValoresEncargo;
  /** Estimado del tramo nacional por destino, ya calculado en el servidor. */
  envios: EnviosPorDestino;
} & (
  | { modo: "crear"; cotizacionId: string; encargoId?: never }
  | { modo: "editar"; encargoId: string; cotizacionId?: never }
);

export function EncargoForm({ inicial, envios, ...props }: Props) {
  const router = useRouter();
  const editando = props.modo === "editar";

  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [campos, setCampos] = useState<ValoresEncargo>(inicial);

  // Al editar, el envío guardado es un snapshot y manda sobre cualquier
  // sugerencia: se marca como tocado de entrada. Al crear, en cambio, el campo
  // sigue al destino mientras la usuaria no lo escriba a mano.
  const [envioTocado, setEnvioTocado] = useState(editando);

  function set(clave: keyof ValoresEncargo, valor: string) {
    setCampos((previo) => ({ ...previo, [clave]: valor }));
  }

  function cambiarApertura(valor: boolean) {
    // Abrir siempre parte de los valores del servidor: así cerrar sin guardar
    // no deja un borrador a medias para la próxima vez.
    if (valor) {
      setCampos(inicial);
      setEnvioTocado(editando);
    }
    setAbierto(valor);
  }

  function elegirDestino(destino: DestinoTipo) {
    setCampos((previo) => ({
      ...previo,
      destino_tipo: destino,
      // El envío acompaña al destino hasta que alguien lo escriba a mano.
      envio_cop: envioTocado ? previo.envio_cop : (envios[destino]?.toString() ?? ""),
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Dos avisos propios antes de ir al servidor, porque los mensajes que
    // devolvería zod para un campo vacío no dicen nada útil. El servidor vuelve
    // a validar todo de todas formas.
    const precio = aEntero(campos.precio_cop);
    if (precio === null) {
      toast.error("Ponle el precio del encargo.");
      return;
    }
    const cantidad = aEntero(campos.cantidad);
    if (cantidad === null) {
      toast.error("Ponle la cantidad.");
      return;
    }

    const entrada: EntradaEncargo = {
      cliente_nombre: campos.cliente_nombre,
      cliente_tel: campos.cliente_tel,
      cliente_notas: campos.cliente_notas,
      talla: campos.talla,
      color: campos.color,
      cantidad,
      destino_tipo: campos.destino_tipo,
      destino_ciudad: campos.destino_ciudad,
      destino_dir: campos.destino_dir,
      precio_cop: precio,
      envio_cop: aEntero(campos.envio_cop),
      abono_cop: aEntero(campos.abono_cop),
      guia: campos.guia,
      notas: campos.notas,
    };

    setGuardando(true);
    const resultado = editando
      ? await actualizarEncargo(props.encargoId, entrada)
      : await crearEncargo(props.cotizacionId, entrada);
    setGuardando(false);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }

    toast.success(editando ? "Encargo actualizado." : "Encargo creado.");
    setAbierto(false);
    router.refresh();
  }

  return (
    <Sheet open={abierto} onOpenChange={cambiarApertura}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={editando ? "outline" : "default"}
          className="h-11 w-full touch-manipulation"
        >
          {editando ? (
            <Pencil className="size-4" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          {editando ? "Editar encargo" : "Nuevo encargo"}
        </Button>
      </SheetTrigger>

      <SheetContent aria-describedby={undefined}>
        <SheetTitle>{editando ? "Editar encargo" : "Nuevo encargo"}</SheetTitle>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Scroll solo acá dentro: el pie con Guardar queda siempre a la vista. */}
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
            <Campo etiqueta="Clienta" id="cliente_nombre">
              <Input
                id="cliente_nombre"
                value={campos.cliente_nombre}
                onChange={(e) => set("cliente_nombre", e.target.value)}
                placeholder="Nombre de la clienta"
                autoCapitalize="words"
                className="h-11"
                required
              />
            </Campo>

            <Campo etiqueta="Teléfono" id="cliente_tel" opcional>
              <Input
                id="cliente_tel"
                value={campos.cliente_tel}
                onChange={(e) => set("cliente_tel", e.target.value)}
                type="tel"
                inputMode="tel"
                placeholder="300 000 0000"
                className="h-11"
              />
            </Campo>

            <div className="grid grid-cols-3 gap-2">
              <Campo etiqueta="Talla" id="talla" opcional>
                <Input
                  id="talla"
                  value={campos.talla}
                  onChange={(e) => set("talla", e.target.value)}
                  placeholder="8.5"
                  className="h-11"
                />
              </Campo>
              <Campo etiqueta="Color" id="color" opcional>
                <Input
                  id="color"
                  value={campos.color}
                  onChange={(e) => set("color", e.target.value)}
                  placeholder="Negro"
                  className="h-11"
                />
              </Campo>
              <Campo etiqueta="Cantidad" id="cantidad">
                <Input
                  id="cantidad"
                  value={campos.cantidad}
                  onChange={(e) => set("cantidad", e.target.value)}
                  inputMode="numeric"
                  className="h-11"
                />
              </Campo>
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
                Destino
              </p>
              {/* `flex-wrap`: las opciones bajan de línea, no se salen de pantalla. */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Destino">
                {DESTINOS.map((destino) => {
                  const elegido = destino.valor === campos.destino_tipo;
                  return (
                    <button
                      key={destino.valor}
                      type="button"
                      onClick={() => elegirDestino(destino.valor)}
                      aria-pressed={elegido}
                      className={cn(
                        "touch-manipulation rounded-full border px-3 py-2 text-xs font-medium transition-colors active:opacity-60",
                        elegido
                          ? "bg-primary text-primary-foreground border-transparent"
                          : "text-muted-foreground",
                      )}
                    >
                      {destino.etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>

            {requiereCiudad(campos.destino_tipo) ? (
              <Campo etiqueta="Ciudad" id="destino_ciudad">
                <Input
                  id="destino_ciudad"
                  value={campos.destino_ciudad}
                  onChange={(e) => set("destino_ciudad", e.target.value)}
                  placeholder="Medellín"
                  autoCapitalize="words"
                  className="h-11"
                  required
                />
              </Campo>
            ) : null}

            <Campo etiqueta="Dirección" id="destino_dir" opcional>
              <Textarea
                id="destino_dir"
                value={campos.destino_dir}
                onChange={(e) => set("destino_dir", e.target.value)}
                placeholder="Dirección de entrega"
                rows={2}
              />
            </Campo>

            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Precio (COP)" id="precio_cop">
                <Input
                  id="precio_cop"
                  value={campos.precio_cop}
                  onChange={(e) => set("precio_cop", e.target.value)}
                  inputMode="numeric"
                  className="h-11 tabular-nums"
                />
              </Campo>
              <Campo etiqueta="Envío (COP)" id="envio_cop" opcional>
                <Input
                  id="envio_cop"
                  value={campos.envio_cop}
                  onChange={(e) => {
                    setEnvioTocado(true);
                    set("envio_cop", e.target.value);
                  }}
                  inputMode="numeric"
                  className="h-11 tabular-nums"
                />
              </Campo>
            </div>

            <Campo etiqueta="Abono (COP)" id="abono_cop" opcional>
              <Input
                id="abono_cop"
                value={campos.abono_cop}
                onChange={(e) => set("abono_cop", e.target.value)}
                inputMode="numeric"
                className="h-11 tabular-nums"
              />
            </Campo>

            {/* Solo al editar: el formulario de crear se queda con lo que se pide
                por chat al confirmar, y estos dos aparecen después. La pantalla
                de detalle sí deja editar todo. */}
            {editando ? (
              <Campo etiqueta="Notas de la clienta" id="cliente_notas" opcional>
                <Textarea
                  id="cliente_notas"
                  value={campos.cliente_notas}
                  onChange={(e) => set("cliente_notas", e.target.value)}
                  placeholder="Lo que haya que recordar de ella"
                  rows={2}
                />
              </Campo>
            ) : null}

            {editando ? (
              <Campo etiqueta="Guía" id="guia" opcional>
                <Input
                  id="guia"
                  value={campos.guia}
                  onChange={(e) => set("guia", e.target.value)}
                  placeholder="Número de guía"
                  autoCapitalize="characters"
                  className="h-11"
                />
              </Campo>
            ) : null}

            <Campo etiqueta="Notas" id="notas" opcional>
              <Textarea
                id="notas"
                value={campos.notas}
                onChange={(e) => set("notas", e.target.value)}
                placeholder="Lo que haya que recordar de este encargo"
                rows={2}
              />
            </Campo>
          </div>

          <Button type="submit" className="h-11 shrink-0 touch-manipulation" disabled={guardando}>
            {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {editando ? "Guardar cambios" : "Crear encargo"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Campo({
  etiqueta,
  id,
  opcional,
  children,
}: {
  etiqueta: string;
  id: string;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs tracking-wide uppercase">
        {etiqueta}
        {opcional ? <span className="text-muted-foreground/60 normal-case"> (opcional)</span> : null}
      </Label>
      {children}
    </div>
  );
}
