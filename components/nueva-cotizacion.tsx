"use client";

import { ClipboardPaste, Crop, Download, ImageIcon, Loader2, RefreshCw, Share2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  actualizarCotizacion,
  guardarCotizacion,
  marcarHistoriaGenerada,
  type EntradaCotizacion,
} from "@/app/actions/cotizaciones";
import { Desglose, filasDesglose } from "@/components/desglose";
import { AjustarRecorte } from "@/components/ajustar-recorte";
import { SubirCaptura } from "@/components/subir-captura";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  borrarBorrador,
  guardarBorrador,
  leerBorrador,
  type BorradorCotizacion,
} from "@/lib/borrador";
import { compartir, descargar, nombreArchivo, usePuedeCompartir } from "@/lib/compartir";
import { comprimirImagen, ImagenInvalida } from "@/lib/comprimir-imagen";
import { calcularComision } from "@/lib/comision";
import { calcularCotizacion, formatearCOP, formatearTRM } from "@/lib/cotizador";
import { buscarZona, calcularEnvioNacional } from "@/lib/envio";
import { conformarAspecto, type Recorte } from "@/lib/recorte";
import type { SettingsPlano } from "@/lib/settings-defaults";
import type { Trm } from "@/lib/trm";

type Props = {
  settings: SettingsPlano;
  trm: Trm | null;
};

type Campos = {
  nombre: string;
  imagen_url: string;
  precio_usd: string;
  categoria: string;
  peso_lb: string;
  talla_notas: string;
};

type Origen = "url" | "captura";

/** Radix no admite `value=""` en un item; este centinela limpia la selección. */
const SIN_ZONA = "__sin_zona__";

/** Espera antes de escribir el borrador, para no tocar disco en cada tecla. */
const ESPERA_BORRADOR_MS = 500;

const CAMPOS_VACIOS: Campos = {
  nombre: "",
  imagen_url: "",
  precio_usd: "",
  categoria: "",
  peso_lb: "",
  talla_notas: "",
};

function aNumero(valor: string) {
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Antepone la marca solo si el nombre no la trae ya: el modelo suele devolver
 * marca "Nike" y nombre "Nike Promina", y quedaba "Nike Nike Promina".
 */
export function componerNombre(marca?: string | null, nombre?: string | null): string {
  const n = (nombre ?? "").trim();
  const m = (marca ?? "").trim();
  if (!m) return n;
  if (!n) return m;
  return n.toLowerCase().includes(m.toLowerCase()) ? n : `${m} ${n}`;
}

export function NuevaCotizacion({ settings, trm }: Props) {
  const router = useRouter();
  const categorias = useMemo(
    () => Object.keys(settings.pesos_categoria).sort(),
    [settings.pesos_categoria],
  );

  const [url, setUrl] = useState("");
  const [campos, setCampos] = useState<Campos>(CAMPOS_VACIOS);
  const [formVisible, setFormVisible] = useState(false);
  const [origen, setOrigen] = useState<Origen>("url");
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Zona del tramo nacional. Vive aparte del cálculo: cambiarla no toca el
   * precio publicado ni invalida la historia ya generada.
   */
  const [zona, setZona] = useState("");

  const [capturaUrl, setCapturaUrl] = useState<string | null>(null);
  const [capturaPreview, setCapturaPreview] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<Recorte | null>(null);
  const [ajustando, setAjustando] = useState(false);
  /**
   * Medidas de la captura ya comprimida. Es exactamente el archivo que va a
   * Blob, así que las fracciones del recorte valen igual en la vista previa y
   * en el render del servidor: no hay que reescalar nada.
   */
  const [medidasCaptura, setMedidasCaptura] = useState<{ ancho: number; alto: number } | null>(
    null,
  );

  /**
   * Foto puesta a mano para la historia. Reemplaza solo el asset visual: los
   * campos del formulario y `capturaUrl` se quedan como están.
   */
  const [historiaUrl, setHistoriaUrl] = useState<string | null>(null);
  const [historiaPreview, setHistoriaPreview] = useState<string | null>(null);
  const [historiaRecorte, setHistoriaRecorte] = useState<Recorte | null>(null);
  const [medidasHistoria, setMedidasHistoria] = useState<{ ancho: number; alto: number } | null>(
    null,
  );
  const [cambiandoFoto, setCambiandoFoto] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const historiaPreviewRef = useRef<string | null>(null);

  const [leyendoCaptura, setLeyendoCaptura] = useState(false);
  const [extrayendo, setExtrayendo] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);

  const puedeCompartir = usePuedeCompartir();
  const previewRef = useRef<string | null>(null);
  const capturaPreviewRef = useRef<string | null>(null);

  /**
   * Id de la cotización una vez persistida. Sirve para no crear duplicados: al
   * generar la historia se guarda automáticamente, y el botón Guardar posterior
   * no debe crear una segunda fila.
   */
  const [idGuardado, setIdGuardado] = useState<string | null>(null);
  /**
   * Payload serializado tal como quedó en la base. Comparar contra él dice si
   * el formulario cambió después de guardar, y evita rehacer el snapshot —y
   * con él la TRM— cuando en realidad no se tocó nada.
   */
  const [payloadGuardado, setPayloadGuardado] = useState<string | null>(null);
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);
  /** Hasta que no se intente restaurar, no se escribe: se pisaría el borrador. */
  const restauradoRef = useRef(false);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      if (capturaPreviewRef.current) URL.revokeObjectURL(capturaPreviewRef.current);
      if (historiaPreviewRef.current) URL.revokeObjectURL(historiaPreviewRef.current);
    };
  }, []);

  function aplicarBorrador(borrador: BorradorCotizacion) {
    setUrl(borrador.url);
    setCampos(borrador.campos);
    setOrigen(borrador.origen);
    setCapturaUrl(borrador.capturaUrl);
    setCapturaPreview(borrador.capturaUrl);
    setRecorte(borrador.recorte);
    setMedidasCaptura(borrador.medidasCaptura);
    setHistoriaUrl(borrador.historiaUrl);
    setHistoriaPreview(borrador.historiaUrl);
    setHistoriaRecorte(borrador.historiaRecorte);
    setMedidasHistoria(borrador.medidasHistoria);
    setZona(borrador.zona);
    setFormVisible(borrador.formVisible);
    setBorradorRecuperado(true);
  }

  function descartarBorrador() {
    borrarBorrador();
    setBorradorRecuperado(false);
    setUrl("");
    setCampos(CAMPOS_VACIOS);
    setOrigen("url");
    setFormVisible(false);
    setAviso(null);
    setZona("");

    if (capturaPreviewRef.current) {
      URL.revokeObjectURL(capturaPreviewRef.current);
      capturaPreviewRef.current = null;
    }
    setCapturaUrl(null);
    setCapturaPreview(null);
    setRecorte(null);
    setMedidasCaptura(null);
    setAjustando(false);

    quitarFotoHistoria();
  }

  /**
   * Restaura el borrador al montar. Va en un efecto y no en el render porque
   * localStorage no existe en el servidor: leerlo durante el render haría que
   * el HTML del servidor y el del cliente no coincidieran.
   *
   * Las vistas previas se reconstruyen desde las URL de Blob, que son remotas y
   * sobreviven; las locales (`createObjectURL`) mueren con la pestaña, por eso
   * no se guardan. Tampoco se tocan los refs de revocación: esas URL no son
   * nuestras y no hay que revocarlas.
   */
  useEffect(() => {
    const borrador = leerBorrador();
    restauradoRef.current = true;
    /* La regla apunta a las cascadas de renders. Acá es una lectura única de un
       sistema externo al montar: un solo render extra al entrar, y en render no
       se puede hacer sin romper la hidratación. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (borrador) aplicarBorrador(borrador);
  }, []);

  const zonaElegida = useMemo(
    () => buscarZona(settings.zonas_envio, zona),
    [settings.zonas_envio, zona],
  );
  const envioCop = useMemo(
    () => (zonaElegida ? calcularEnvioNacional(zonaElegida, aNumero(campos.peso_lb)) : null),
    [zonaElegida, campos.peso_lb],
  );

  /**
   * Escribe el borrador cuando algo cambia. Se salta mientras no se haya
   * intentado restaurar (pisaría lo guardado con el formulario vacío) y una vez
   * que la cotización ya está persistida (ya no hay nada que rescatar).
   */
  useEffect(() => {
    if (!restauradoRef.current || idGuardado) return;

    const id = setTimeout(() => {
      guardarBorrador({
        guardadoEn: Date.now(),
        url,
        campos,
        origen,
        capturaUrl,
        recorte,
        medidasCaptura,
        historiaUrl,
        historiaRecorte,
        medidasHistoria,
        zona,
        formVisible,
      });
    }, ESPERA_BORRADOR_MS);

    return () => clearTimeout(id);
  }, [
    url,
    campos,
    origen,
    capturaUrl,
    recorte,
    medidasCaptura,
    historiaUrl,
    historiaRecorte,
    medidasHistoria,
    zona,
    formVisible,
    idGuardado,
  ]);

  const calculo = useMemo(
    () =>
      calcularCotizacion({
        precio_usd: aNumero(campos.precio_usd),
        peso_lb: aNumero(campos.peso_lb),
        sales_tax_pct: settings.sales_tax_pct,
        tarifa_lb_usd: settings.tarifa_lb_usd,
        trm_oficial: trm?.valor ?? 0,
        trm_buffer_pct: settings.trm_buffer_pct,
        margen_pct: settings.margen_pct,
        redondeo_cop: settings.redondeo_cop,
      }),
    [campos.precio_usd, campos.peso_lb, settings, trm],
  );

  /**
   * Reparto del margen, en vivo. Va aparte de `calculo` a propósito: se deriva
   * de `margen_cop` y no toca `precio_cop` ni entra en la historia.
   */
  const comision = useMemo(
    () => calcularComision(calculo.margen_cop, settings.comision_pct),
    [calculo.margen_cop, settings.comision_pct],
  );

  function limpiarPreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPreview(null);
  }

  function actualizar(parcial: Partial<Campos>) {
    setCampos((previo) => ({ ...previo, ...parcial }));
    limpiarPreview();
  }

  function aplicarCategoria(categoria: string, campoActual: Campos["peso_lb"]) {
    const peso = settings.pesos_categoria[categoria];
    return { categoria, peso_lb: peso ? String(peso) : campoActual };
  }

  // ------------------------------------------------- foto de la historia

  function quitarFotoHistoria() {
    if (historiaPreviewRef.current) {
      URL.revokeObjectURL(historiaPreviewRef.current);
      historiaPreviewRef.current = null;
    }
    setHistoriaPreview(null);
    setHistoriaUrl(null);
    setHistoriaRecorte(null);
    setMedidasHistoria(null);
    setCambiandoFoto(false);
    limpiarPreview();
  }

  /**
   * Reemplaza el asset de la historia. No toca ni los campos del formulario ni
   * la captura original: solo cambia lo que se publica.
   */
  async function recibirFotoHistoria(archivo: File) {
    setSubiendoFoto(true);

    let comprimida;
    try {
      comprimida = await comprimirImagen(archivo);
    } catch (error) {
      setSubiendoFoto(false);
      toast.error(
        error instanceof ImagenInvalida
          ? error.message
          : "No pude leer esa imagen. Intenta con otra.",
      );
      return;
    }

    if (historiaPreviewRef.current) URL.revokeObjectURL(historiaPreviewRef.current);
    const local = URL.createObjectURL(comprimida.blob);
    historiaPreviewRef.current = local;
    setHistoriaPreview(local);
    setMedidasHistoria({ ancho: comprimida.ancho, alto: comprimida.alto });
    // Encuadre inicial: la imagen completa llevada a la proporción del hueco.
    setHistoriaRecorte(
      conformarAspecto({ x: 0, y: 0, ancho: 1, alto: 1 }, comprimida.ancho, comprimida.alto),
    );
    setCambiandoFoto(false);
    limpiarPreview();

    const formData = new FormData();
    formData.append("archivo", new File([comprimida.blob], "historia.jpg", { type: "image/jpeg" }));

    try {
      const res = await fetch("/api/subir-captura", { method: "POST", body: formData });
      const datos = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !datos.url) throw new Error(datos.error ?? "fallo");
      setHistoriaUrl(datos.url);
    } catch {
      toast.error("No pude guardar esa foto. La historia usará la captura.");
      quitarFotoHistoria();
    } finally {
      setSubiendoFoto(false);
    }
  }

  // ---------------------------------------------------------------- captura

  async function recibirCaptura(archivo: File) {
    setLeyendoCaptura(true);
    setAviso(null);
    limpiarPreview();
    setCapturaUrl(null);
    setRecorte(null);
    setAjustando(false);
    setMedidasCaptura(null);
    quitarFotoHistoria();

    let comprimida;
    try {
      comprimida = await comprimirImagen(archivo);
    } catch (error) {
      setLeyendoCaptura(false);
      toast.error(
        error instanceof ImagenInvalida
          ? error.message
          : "No pude leer esta imagen, intenta con una captura de pantalla",
      );
      return;
    }

    // Vista previa inmediata mientras suben y leen la captura.
    if (capturaPreviewRef.current) URL.revokeObjectURL(capturaPreviewRef.current);
    const previewLocal = URL.createObjectURL(comprimida.blob);
    capturaPreviewRef.current = previewLocal;
    setCapturaPreview(previewLocal);
    setMedidasCaptura({ ancho: comprimida.ancho, alto: comprimida.alto });
    setOrigen("captura");
    setCampos(CAMPOS_VACIOS);

    const formData = new FormData();
    formData.append("archivo", new File([comprimida.blob], "captura.jpg", { type: "image/jpeg" }));

    // Subida y lectura en paralelo: son independientes.
    const [subida, extraccion] = await Promise.allSettled([
      fetch("/api/subir-captura", { method: "POST", body: formData }).then(async (res) => {
        const datos = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !datos.url) throw new Error(datos.error ?? "fallo");
        return datos.url;
      }),
      fetch("/api/extraer-imagen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imagen_base64: comprimida.base64,
          media_type: comprimida.mediaType,
        }),
      }).then(async (res) => {
        const datos = (await res.json()) as {
          nombre?: string | null;
          precio_usd?: number | null;
          marca?: string | null;
          categoria_sugerida?: string | null;
          talla_notas?: string | null;
          recorte_producto?: Recorte | null;
          encontroAlgo?: boolean;
        };
        if (!res.ok) throw new Error("fallo");
        return datos;
      }),
    ]);

    if (subida.status === "fulfilled") {
      setCapturaUrl(subida.value);
    } else {
      toast.error("Guardé los datos pero no la imagen. La historia saldrá sin foto.");
    }

    if (extraccion.status === "fulfilled" && extraccion.value.encontroAlgo) {
      const d = extraccion.value;
      const nombre = componerNombre(d.marca, d.nombre);
      const categoria = d.categoria_sugerida ?? "";

      setCampos({
        ...CAMPOS_VACIOS,
        nombre,
        precio_usd: d.precio_usd ? String(d.precio_usd) : "",
        talla_notas: d.talla_notas ?? "",
        ...(categoria ? aplicarCategoria(categoria, "") : {}),
      });
      // A la proporción del hueco desde el principio: así lo que se ve en la
      // vista previa es ya lo que se publica.
      setRecorte(
        d.recorte_producto
          ? conformarAspecto(d.recorte_producto, comprimida.ancho, comprimida.alto)
          : null,
      );

      if (!d.precio_usd) setAviso("No distinguí el precio en la captura. Escríbelo tú.");
    } else {
      setAviso("No pude leer los datos de esta captura, llénalos a mano");
      setCampos(CAMPOS_VACIOS);
    }

    setLeyendoCaptura(false);
    setFormVisible(true);
  }

  // -------------------------------------------------------------------- url

  async function pegar() {
    try {
      const texto = await navigator.clipboard.readText();
      if (texto?.trim()) {
        setUrl(texto.trim());
        return;
      }
      toast.info("El portapapeles está vacío.");
    } catch {
      toast.info("Tu navegador no me dejó leer el portapapeles. Pega la URL a mano.");
    }
  }

  async function analizar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const limpia = url.trim();
    if (!limpia) return;

    setExtrayendo(true);
    setAviso(null);
    limpiarPreview();
    setOrigen("url");
    setCapturaUrl(null);
    setCapturaPreview(null);
    setRecorte(null);
    quitarFotoHistoria();

    try {
      const res = await fetch("/api/extraer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: limpia }),
      });
      const datos = (await res.json()) as {
        nombre?: string;
        imagen_url?: string;
        precio_usd?: number;
        moneda?: string;
        encontroAlgo?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setAviso(datos.error ?? "No pude leer esta página, llena los datos.");
        setCampos(CAMPOS_VACIOS);
      } else {
        if (!datos.encontroAlgo) {
          setAviso("No pude leer esta página, llena los datos.");
        } else if (!datos.precio_usd) {
          setAviso("No encontré el precio en la página. Escríbelo tú.");
        } else if (datos.moneda) {
          // El precio se llena igual, pero el cálculo asume dólares.
          setAviso(
            `Precio detectado en ${datos.moneda}, no en dólares. Verifícalo antes de cotizar.`,
          );
        }
        setCampos({
          ...CAMPOS_VACIOS,
          nombre: datos.nombre ?? "",
          imagen_url: datos.imagen_url ?? "",
          precio_usd: datos.precio_usd ? String(datos.precio_usd) : "",
        });
      }
    } catch {
      setAviso("No pude leer esta página, llena los datos.");
      setCampos(CAMPOS_VACIOS);
    } finally {
      setExtrayendo(false);
      setFormVisible(true);
    }
  }

  // ---------------------------------------------------------- historia/guardar

  function validar(): string | null {
    if (!campos.nombre.trim()) return "Ponle un nombre al producto.";
    if (!campos.categoria) return "Elige una categoría.";
    if (aNumero(campos.precio_usd) <= 0) return "Escribe el precio en USD.";
    if (aNumero(campos.peso_lb) <= 0) return "Escribe el peso en libras.";
    if (!trm) return "No tengo TRM disponible. Intenta de nuevo en un momento.";
    return null;
  }

  /**
   * Persiste la cotización una sola vez. Devuelve el id, o null si falló (el
   * error ya se avisó). Es la misma lógica de snapshot para el botón Guardar y
   * para el guardado automático al generar la historia.
   */
  function construirPayload(): EntradaCotizacion {
    return {
      url: url.trim(),
      nombre: campos.nombre.trim(),
      imagen_url: campos.imagen_url.trim() || null,
      captura_url: capturaUrl,
      imagen_origen: origen,
      recorte: origen === "captura" ? recorte : null,
      historia_url: historiaUrl,
      historia_recorte: historiaUrl ? historiaRecorte : null,
      categoria: campos.categoria,
      talla_notas: campos.talla_notas.trim() || null,
      precio_usd: aNumero(campos.precio_usd),
      peso_lb: aNumero(campos.peso_lb),
      // El servidor recalcula el envío con las tarifas vigentes; aquí solo va
      // la zona elegida.
      zona_envio: zonaElegida?.nombre ?? null,
    };
  }

  async function persistir(): Promise<string | null> {
    if (idGuardado) return idGuardado;

    const payload = construirPayload();
    const resultado = await guardarCotizacion(payload);

    if (!resultado.ok) {
      toast.error(resultado.error);
      return null;
    }

    setIdGuardado(resultado.id);
    setPayloadGuardado(JSON.stringify(payload));
    // Ya está a salvo en la base: el borrador local sobra.
    borrarBorrador();
    setBorradorRecuperado(false);
    return resultado.id;
  }

  async function generarHistoria() {
    const problema = validar();
    if (problema) {
      toast.error(problema);
      return;
    }

    setGenerando(true);
    try {
      // Se guarda ANTES de generar: si se publica, no se puede perder.
      const id = await persistir();
      if (!id) return;

      const params = new URLSearchParams({
        nombre: campos.nombre.trim(),
        precio_cop: String(calculo.precio_cop),
      });
      const comoLista = (r: Recorte) => [r.x, r.y, r.ancho, r.alto].join(",");
      if (historiaUrl) {
        params.set("historia_url", historiaUrl);
        if (historiaRecorte) params.set("historia_recorte", comoLista(historiaRecorte));
      }
      if (capturaUrl) params.set("captura_url", capturaUrl);
      if (capturaUrl && recorte) params.set("recorte", comoLista(recorte));
      if (campos.imagen_url.trim()) params.set("imagen_url", campos.imagen_url.trim());
      if (campos.talla_notas.trim()) params.set("talla_notas", campos.talla_notas.trim());

      const res = await fetch(`/api/historia/preview?${params.toString()}`);
      if (!res.ok) throw new Error("fallo");

      const blob = await res.blob();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const objectUrl = URL.createObjectURL(blob);
      previewRef.current = objectUrl;
      setPreview({ url: objectUrl, blob });

      // Se marca después de generar: si la imagen falla, la métrica no miente.
      await marcarHistoriaGenerada(id);
    } catch {
      toast.error("No pude generar la historia. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  }

  async function compartirHistoria() {
    if (!preview) return;
    const archivo = nombreArchivo(campos.nombre);
    const ok = await compartir(preview.blob, archivo, campos.nombre);
    if (!ok) descargar(preview.blob, archivo);
  }

  async function guardar() {
    const problema = validar();
    if (problema) {
      toast.error(problema);
      return;
    }

    setGuardando(true);

    // Ya existe la fila (se guardó al generar la historia): si el formulario
    // cambió desde entonces, se actualiza en vez de crear una segunda.
    if (idGuardado) {
      const payload = construirPayload();

      if (JSON.stringify(payload) === payloadGuardado) {
        setGuardando(false);
        toast.success("Esta cotización ya estaba guardada.");
        router.push("/historial");
        return;
      }

      const resultado = await actualizarCotizacion(idGuardado, payload);
      setGuardando(false);

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      setPayloadGuardado(JSON.stringify(payload));
      toast.success("Cotización actualizada.");
      router.push("/historial");
      return;
    }

    const id = await persistir();
    setGuardando(false);

    if (!id) return;
    toast.success("Cotización guardada.");
    router.push("/historial");
  }

  // Lo que se publica: la foto puesta a mano manda sobre la captura.
  const usandoFotoPropia = Boolean(historiaPreview);
  const imagenMostrada = historiaPreview ?? capturaPreview ?? (campos.imagen_url || null);
  const recorteActivo = usandoFotoPropia ? historiaRecorte : recorte;
  const medidasActivas = usandoFotoPropia ? medidasHistoria : medidasCaptura;
  // El ajuste solo aplica a imágenes nuestras, no al hotlink del retailer.
  // El ajuste solo aplica a imágenes nuestras: del hotlink del retailer no
  // conocemos las medidas en el cliente y ya viene encuadrado en el producto.
  const puedeAjustar = usandoFotoPropia || Boolean(capturaPreview);

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Nueva cotización</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {trm ? (
            <>
              TRM del {trm.vigencia}: {formatearTRM(trm.valor)}
              {trm.desdeCache ? " · valor guardado" : ""}
            </>
          ) : (
            "Sin TRM disponible ahora mismo."
          )}
        </p>
      </header>

      {/* Discreta a propósito: informa de algo que ya pasó, no pide decidir. */}
      {borradorRecuperado ? (
        <div className="text-muted-foreground mb-4 flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-xs">
          <span>Borrador recuperado</span>
          <button
            type="button"
            onClick={descartarBorrador}
            className="touch-manipulation font-medium underline underline-offset-4 active:opacity-60"
          >
            Descartar
          </button>
        </div>
      ) : null}

      {/* Acción primaria */}
      <SubirCaptura
        onArchivo={recibirCaptura}
        ocupado={leyendoCaptura}
        etiquetaOcupado="Leyendo la captura…"
        escuchaPegado={!cambiandoFoto}
      />

      {/* Acción secundaria, visualmente menor */}
      <details className="group mt-4">
        <summary className="text-muted-foreground marker:content-none cursor-pointer list-none text-center text-xs underline underline-offset-4">
          o pega el enlace del producto
        </summary>
        <form onSubmit={analizar} className="mt-3 flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-11"
          />
          <Button
            type="button"
            variant="outline"
            onClick={pegar}
            className="h-11 px-3"
            title="Pegar"
          >
            <ClipboardPaste className="size-4" aria-hidden />
            <span className="sr-only">Pegar</span>
          </Button>
          <Button type="submit" disabled={extrayendo || !url.trim()} className="h-11">
            {extrayendo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Leer"}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground mt-2 h-9 w-full text-xs"
          onClick={() => setFormVisible(true)}
        >
          O llena los datos a mano
        </Button>
      </details>

      {formVisible ? (
        <div className="mt-6 flex flex-col gap-5">
          {aviso ? (
            <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">{aviso}</p>
          ) : null}

          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              {ajustando && imagenMostrada && puedeAjustar ? (
                <AjustarRecorte
                  src={imagenMostrada}
                  inicial={recorteActivo}
                  origenAncho={medidasActivas?.ancho ?? 1}
                  origenAlto={medidasActivas?.alto ?? 1}
                  onConfirmar={(nuevo) => {
                    if (usandoFotoPropia) setHistoriaRecorte(nuevo);
                    else setRecorte(nuevo);
                    setAjustando(false);
                    limpiarPreview();
                  }}
                  onCancelar={() => setAjustando(false)}
                />
              ) : imagenMostrada ? (
                <div className="flex flex-col gap-2">
                  {/* Lo que se ve aquí es exactamente lo que saldrá en la historia. */}
                  <div
                    className="bg-muted relative mx-auto aspect-[952/1060] w-40 overflow-hidden rounded-lg"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagenMostrada}
                      alt=""
                      className="absolute max-w-none object-cover"
                      style={
                        puedeAjustar && recorteActivo
                          ? {
                              width: `${(1 / recorteActivo.ancho) * 100}%`,
                              height: `${(1 / recorteActivo.alto) * 100}%`,
                              left: `${(-recorteActivo.x / recorteActivo.ancho) * 100}%`,
                              top: `${(-recorteActivo.y / recorteActivo.alto) * 100}%`,
                            }
                          : { width: "100%", height: "100%", objectFit: "cover" }
                      }
                      onError={() => {
                        if (!capturaPreview) actualizar({ imagen_url: "" });
                      }}
                    />
                  </div>

                  <p className="text-muted-foreground text-center text-[11px]">
                    Así saldrá la foto en la historia
                    {usandoFotoPropia ? " · foto tuya" : ""}
                  </p>

                  <div className="flex flex-wrap justify-center gap-2">
                    {puedeAjustar ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 text-xs"
                        onClick={() => setAjustando(true)}
                      >
                        <Crop className="size-3.5" aria-hidden />
                        Ajustar recorte
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 text-xs"
                      onClick={() => setCambiandoFoto((previo) => !previo)}
                    >
                      <RefreshCw className="size-3.5" aria-hidden />
                      Cambiar foto
                    </Button>
                    {usandoFotoPropia ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-muted-foreground h-9 text-xs"
                        onClick={quitarFotoHistoria}
                      >
                        <X className="size-3.5" aria-hidden />
                        {capturaPreview ? "Volver a la captura" : "Quitar foto"}
                      </Button>
                    ) : null}
                  </div>

                  {cambiandoFoto ? (
                    <SubirCaptura
                      onArchivo={recibirFotoHistoria}
                      ocupado={subiendoFoto}
                      etiquetaOcupado="Subiendo la foto…"
                      titulo="Pega o elige la foto del producto"
                      descripcion="Solo cambia la imagen de la historia. Los datos y la captura original se quedan igual."
                      compacto
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={campos.nombre}
                  onChange={(e) => actualizar({ nombre: e.target.value })}
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="precio">Precio USD</Label>
                  <Input
                    id="precio"
                    value={campos.precio_usd}
                    onChange={(e) => actualizar({ precio_usd: e.target.value })}
                    inputMode="decimal"
                    placeholder="129.99"
                    className="h-11"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="peso">Peso (lb)</Label>
                  <Input
                    id="peso"
                    value={campos.peso_lb}
                    onChange={(e) => actualizar({ peso_lb: e.target.value })}
                    inputMode="decimal"
                    placeholder="2.6"
                    className="h-11"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="categoria">Categoría</Label>
                <Select
                  value={campos.categoria}
                  onValueChange={(categoria) => actualizar(aplicarCategoria(categoria, campos.peso_lb))}
                >
                  <SelectTrigger id="categoria" className="h-11 w-full">
                    <SelectValue placeholder="Elige una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((categoria) => (
                      <SelectItem key={categoria} value={categoria}>
                        {categoria} · {settings.pesos_categoria[categoria]} lb
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="talla">Talla / notas</Label>
                <Textarea
                  id="talla"
                  value={campos.talla_notas}
                  onChange={(e) => actualizar({ talla_notas: e.target.value })}
                  placeholder="Tallas 6 a 10 · color negro"
                  rows={2}
                />
              </div>

              {origen === "captura" ? (
                <div className="grid gap-2">
                  <Label htmlFor="url-opcional">
                    Link del producto{" "}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="url-opcional"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Para volver a comprarlo después"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    className="h-11"
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="imagen">Imagen (URL)</Label>
                  <Input
                    id="imagen"
                    value={campos.imagen_url}
                    onChange={(e) => actualizar({ imagen_url: e.target.value })}
                    placeholder="Opcional"
                    inputMode="url"
                    autoCapitalize="none"
                    className="h-11"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Desglose
                filas={filasDesglose({
                  precio_usd: aNumero(campos.precio_usd),
                  tax_usd: calculo.tax_usd,
                  flete_usd: calculo.flete_usd,
                  peso_lb: aNumero(campos.peso_lb),
                  trm_oficial: trm?.valor ?? 0,
                  trm_aplicada: calculo.trm_aplicada,
                  costo_cop: calculo.costo_cop,
                  margen_cop: calculo.margen_cop,
                  trm_vigencia: trm?.vigencia,
                  trm_desde_cache: trm?.desdeCache,
                  comision_pct: settings.comision_pct,
                  comision_cop: comision.comision_cop,
                  margen_neto_cop: comision.margen_neto_cop,
                })}
              />
              <div className="mt-4 border-t pt-4">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Precio a publicar
                </p>
                <p className="text-4xl font-semibold tabular-nums tracking-tight">
                  {formatearCOP(calculo.precio_cop)}
                </p>
              </div>

              {/* Referencia aparte, deliberadamente menor que el precio: no se
                  publica ni entra en el cálculo, solo sirve para responderle a
                  una clienta cuánto le sale hasta su ciudad. */}
              {settings.zonas_envio.length ? (
                <div className="mt-4 border-t pt-4">
                  <Label
                    htmlFor="zona"
                    className="text-muted-foreground text-xs tracking-wide uppercase"
                  >
                    Envío nacional
                  </Label>
                  <Select
                    value={zona}
                    onValueChange={(valor) => setZona(valor === SIN_ZONA ? "" : valor)}
                  >
                    <SelectTrigger id="zona" className="mt-2 h-10 w-full">
                      <SelectValue placeholder="Elige la zona de entrega" />
                    </SelectTrigger>
                    <SelectContent>
                      {settings.zonas_envio.map((z) => (
                        <SelectItem key={z.nombre} value={z.nombre}>
                          {z.nombre}
                        </SelectItem>
                      ))}
                      {zona ? <SelectItem value={SIN_ZONA}>Sin zona</SelectItem> : null}
                    </SelectContent>
                  </Select>

                  {zonaElegida && envioCop !== null ? (
                    <>
                      <p className="mt-2 text-sm">
                        Envío nacional a {zonaElegida.nombre}:{" "}
                        <span className="font-semibold tabular-nums">{formatearCOP(envioCop)}</span>
                      </p>
                      {/* Suma de referencia para responder por chat. Es solo
                          presentación: `precio_cop` no la conoce y lo que se
                          publica sigue siendo el precio de arriba. */}
                      <p className="mt-1 text-sm">
                        Total con envío a {zonaElegida.nombre}:{" "}
                        <span className="font-semibold tabular-nums">
                          {formatearCOP(calculo.precio_cop + envioCop)}
                        </span>
                      </p>
                    </>
                  ) : null}

                  <p className="text-muted-foreground mt-1 text-xs">
                    El envío no está incluido en el precio publicado.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={generarHistoria}
              disabled={generando}
            >
              {generando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ImageIcon className="size-4" aria-hidden />
              )}
              Generar historia
            </Button>
            <Button type="button" className="h-12" onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Guardar
            </Button>
          </div>

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
                    onClick={() => descargar(preview.blob, nombreArchivo(campos.nombre))}
                  >
                    <Download className="size-4" aria-hidden />
                    Descargar
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
