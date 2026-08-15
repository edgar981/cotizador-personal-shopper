"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { guardarConfig } from "@/app/actions/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsPlano } from "@/lib/settings-defaults";

type FilaPeso = { categoria: string; peso_lb: string };
type FilaZona = { nombre: string; tarifa_base_cop: string; adicional_lb_cop: string };

function aNumero(valor: string) {
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Los porcentajes se guardan como fracción y se editan como porcentaje. */
function aPorcentaje(fraccion: number) {
  return String(Math.round(fraccion * 10000) / 100);
}

export function ConfigForm({ settings }: { settings: SettingsPlano }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const [campos, setCampos] = useState({
    margen_pct: aPorcentaje(settings.margen_pct),
    comision_pct: aPorcentaje(settings.comision_pct),
    sales_tax_pct: aPorcentaje(settings.sales_tax_pct),
    trm_buffer_pct: aPorcentaje(settings.trm_buffer_pct),
    tarifa_lb_usd: String(settings.tarifa_lb_usd),
    redondeo_cop: String(settings.redondeo_cop),
    ig_handle: settings.ig_handle,
    lema: settings.lema,
    color_marca: settings.color_marca,
  });

  const [pesos, setPesos] = useState<FilaPeso[]>(() => {
    const filas = Object.entries(settings.pesos_categoria).map(([categoria, peso_lb]) => ({
      categoria,
      peso_lb: String(peso_lb),
    }));
    return filas.length ? filas : [{ categoria: "", peso_lb: "" }];
  });

  const [zonas, setZonas] = useState<FilaZona[]>(() =>
    settings.zonas_envio.map((z) => ({
      nombre: z.nombre,
      tarifa_base_cop: String(z.tarifa_base_cop),
      adicional_lb_cop: String(z.adicional_lb_cop),
    })),
  );

  function set(clave: keyof typeof campos, valor: string) {
    setCampos((previo) => ({ ...previo, [clave]: valor }));
  }

  function setPeso(indice: number, parcial: Partial<FilaPeso>) {
    setPesos((previo) =>
      previo.map((fila, i) => (i === indice ? { ...fila, ...parcial } : fila)),
    );
  }

  function setZona(indice: number, parcial: Partial<FilaZona>) {
    setZonas((previo) => previo.map((fila, i) => (i === indice ? { ...fila, ...parcial } : fila)));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuardando(true);

    const resultado = await guardarConfig({
      margen_pct: aNumero(campos.margen_pct),
      comision_pct: aNumero(campos.comision_pct),
      sales_tax_pct: aNumero(campos.sales_tax_pct),
      trm_buffer_pct: aNumero(campos.trm_buffer_pct),
      tarifa_lb_usd: aNumero(campos.tarifa_lb_usd),
      redondeo_cop: aNumero(campos.redondeo_cop),
      ig_handle: campos.ig_handle,
      lema: campos.lema,
      color_marca: campos.color_marca,
      pesos_categoria: pesos
        .filter((fila) => fila.categoria.trim() || fila.peso_lb.trim())
        .map((fila) => ({ categoria: fila.categoria, peso_lb: aNumero(fila.peso_lb) })),
      // Las filas en blanco se descartan: son las que quedaron de un "Agregar
      // zona" que la usuaria no llegó a llenar.
      zonas_envio: zonas
        .filter(
          (fila) =>
            fila.nombre.trim() || fila.tarifa_base_cop.trim() || fila.adicional_lb_cop.trim(),
        )
        .map((fila) => ({
          nombre: fila.nombre,
          tarifa_base_cop: aNumero(fila.tarifa_base_cop),
          adicional_lb_cop: aNumero(fila.adicional_lb_cop),
        })),
    });

    setGuardando(false);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }
    toast.success("Configuración guardada.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-lg px-5 pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
      <p className="bg-muted text-muted-foreground mt-3 rounded-md px-3 py-2 text-xs">
        Valores iniciales de referencia — ajústalos a tus tarifas reales.
      </p>

      <Card className="mt-5">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="margen">Margen (%)</Label>
              <Input
                id="margen"
                value={campos.margen_pct}
                onChange={(e) => set("margen_pct", e.target.value)}
                inputMode="decimal"
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tax">Sales tax (%)</Label>
              <Input
                id="tax"
                value={campos.sales_tax_pct}
                onChange={(e) => set("sales_tax_pct", e.target.value)}
                inputMode="decimal"
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="buffer">Colchón TRM (%)</Label>
              <Input
                id="buffer"
                value={campos.trm_buffer_pct}
                onChange={(e) => set("trm_buffer_pct", e.target.value)}
                inputMode="decimal"
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tarifa">Tarifa por libra (USD)</Label>
              <Input
                id="tarifa"
                value={campos.tarifa_lb_usd}
                onChange={(e) => set("tarifa_lb_usd", e.target.value)}
                inputMode="decimal"
                className="h-11"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="comision">Comisión (% del margen)</Label>
            <Input
              id="comision"
              value={campos.comision_pct}
              onChange={(e) => set("comision_pct", e.target.value)}
              inputMode="decimal"
              className="h-11"
            />
            <p className="text-muted-foreground text-xs">
              Se descuenta del margen, no del precio. No cambia lo que paga la clienta ni sale
              en la historia.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="redondeo">Redondear precio a múltiplos de (COP)</Label>
            <Input
              id="redondeo"
              value={campos.redondeo_cop}
              onChange={(e) => set("redondeo_cop", e.target.value)}
              inputMode="numeric"
              className="h-11"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <Label>Peso por categoría (lb)</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              Al elegir la categoría en una cotización, el peso se pre-llena con este valor.
            </p>
          </div>

          {pesos.map((fila, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <Input
                value={fila.categoria}
                onChange={(e) => setPeso(indice, { categoria: e.target.value })}
                placeholder="categoría"
                autoCapitalize="none"
                className="h-11 flex-1"
                aria-label={`Categoría ${indice + 1}`}
              />
              <Input
                value={fila.peso_lb}
                onChange={(e) => setPeso(indice, { peso_lb: e.target.value })}
                placeholder="lb"
                inputMode="decimal"
                className="h-11 w-20"
                aria-label={`Peso de la categoría ${indice + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                onClick={() => setPesos((previo) => previo.filter((_, i) => i !== indice))}
                disabled={pesos.length === 1}
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">Quitar categoría</span>
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setPesos((previo) => [...previo, { categoria: "", peso_lb: "" }])}
          >
            <Plus className="size-4" aria-hidden />
            Agregar categoría
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <Label>Envío nacional en Colombia</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              El casillero entrega en Bogotá; desde ahí sale el envío al destino final. Estos
              valores son de referencia — ajústalos a lo que te cobran de verdad.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              No se suma al precio publicado: sirve para responder rápido cuánto sale a cada
              ciudad.
            </p>
          </div>

          {zonas.length ? (
            <div className="text-muted-foreground grid grid-cols-[1fr_5.5rem_5.5rem_2.75rem] items-center gap-2 text-[11px]">
              <span>Zona</span>
              <span>Base</span>
              <span>Por libra</span>
              <span />
            </div>
          ) : null}

          {zonas.map((fila, indice) => (
            <div
              key={indice}
              className="grid grid-cols-[1fr_5.5rem_5.5rem_2.75rem] items-center gap-2"
            >
              <Input
                value={fila.nombre}
                onChange={(e) => setZona(indice, { nombre: e.target.value })}
                placeholder="Bogotá"
                className="h-11"
                aria-label={`Nombre de la zona ${indice + 1}`}
              />
              <Input
                value={fila.tarifa_base_cop}
                onChange={(e) => setZona(indice, { tarifa_base_cop: e.target.value })}
                placeholder="12000"
                inputMode="numeric"
                className="h-11"
                aria-label={`Tarifa base de la zona ${indice + 1}`}
              />
              <Input
                value={fila.adicional_lb_cop}
                onChange={(e) => setZona(indice, { adicional_lb_cop: e.target.value })}
                placeholder="2000"
                inputMode="numeric"
                className="h-11"
                aria-label={`Adicional por libra de la zona ${indice + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                onClick={() => setZonas((previo) => previo.filter((_, i) => i !== indice))}
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">Quitar zona</span>
              </Button>
            </div>
          ))}

          {zonas.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs">
              Sin zonas configuradas. El estimado de envío no aparecerá al cotizar.
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() =>
              setZonas((previo) => [
                ...previo,
                { nombre: "", tarifa_base_cop: "", adicional_lb_cop: "" },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            Agregar zona
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid gap-2">
            <Label htmlFor="ig">Instagram</Label>
            <Input
              id="ig"
              value={campos.ig_handle}
              onChange={(e) => set("ig_handle", e.target.value)}
              placeholder="@tutienda"
              autoCapitalize="none"
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lema">Lema</Label>
            <Input
              id="lema"
              value={campos.lema}
              onChange={(e) => set("lema", e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="color">Color de marca</Label>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                value={campos.color_marca}
                onChange={(e) => set("color_marca", e.target.value)}
                placeholder="#E11D74"
                autoCapitalize="none"
                className="h-11 flex-1"
              />
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(campos.color_marca) ? campos.color_marca : "#E11D74"}
                onChange={(e) => set("color_marca", e.target.value.toUpperCase())}
                className="size-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                aria-label="Elegir color de marca"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="mt-5 h-12 w-full" disabled={guardando}>
        {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Guardar configuración
      </Button>
    </form>
  );
}
