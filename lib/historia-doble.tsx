import "server-only";
import { ImageResponse } from "@vercel/og";
import { formatearCOP } from "./cotizador";
import {
  cargarFuentes,
  HISTORIA_ALTO,
  HISTORIA_ANCHO,
  mejorImagen,
  recortar,
  type FuentesImagen,
} from "./historia";
import { ASPECTO_HISTORIA, calcularTransformacion } from "./recorte";

/**
 * Historia con dos productos.
 *
 * La usuaria ya publicaba dos productos en una sola historia superponiendo dos
 * imágenes generadas por separado. Esta plantilla lo hace a propósito.
 *
 * Vive en su propio módulo: la plantilla de un producto (`lib/historia.tsx`) no
 * se toca, solo se reutilizan sus ayudantes (fuentes, descarga de imagen y
 * cascada de fuentes de foto).
 */

export type ProductoHistoria = FuentesImagen & {
  nombre: string;
  precio_cop: number;
  talla_notas?: string | null;
};

export type DatosHistoriaDoble = {
  /** Exactamente dos: con tres el precio deja de leerse, y el precio es lo que vende. */
  productos: [ProductoHistoria, ProductoHistoria];
  ig_handle: string;
  lema: string;
  color_marca: string;
};

/**
 * Hueco de la foto en cada tarjeta. La proporción es la MISMA que la del hueco
 * de la historia simple (`ASPECTO_HISTORIA`), solo que a menor escala: como los
 * recortes guardados ya vienen conformados a esa proporción, encajan sin cortar
 * nada de más. Es lo aprendido con el recorte, aplicado aquí.
 */
const SLOT_ALTO = 580;
const SLOT_ANCHO = Math.round(SLOT_ALTO * ASPECTO_HISTORIA);

/** Con dos productos hay menos ancho por nombre: cortamos antes que en la simple. */
const MAX_NOMBRE = 42;
const MAX_TALLA = 60;

export async function renderizarHistoriaDoble(
  datos: DatosHistoriaDoble,
): Promise<ImageResponse> {
  const [fonts, imagenes] = await Promise.all([
    cargarFuentes(),
    // Las dos fotos en paralelo: son descargas independientes.
    Promise.all(datos.productos.map((producto) => mejorImagen(producto))),
  ]);

  const acento = datos.color_marca || "#E11D74";

  return new ImageResponse(
    (
      <div
        style={{
          width: HISTORIA_ANCHO,
          height: HISTORIA_ALTO,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0B0B0F",
          color: "#FFFFFF",
          fontFamily: "Inter",
        }}
      >
        {/* Encabezado: handle una sola vez para las dos tarjetas */}
        <div style={{ display: "flex", alignItems: "center", padding: "56px 64px 28px 64px" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -0.5 }}>
            {datos.ig_handle}
          </div>
        </div>

        {/* Las dos tarjetas, apiladas */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: 40,
            padding: "0 64px",
          }}
        >
          {datos.productos.map((producto, indice) => {
            const cargada = imagenes[indice];
            const nombre = recortar(producto.nombre, MAX_NOMBRE);
            const encuadre = cargada
              ? calcularTransformacion(
                  cargada.recorte ?? { x: 0, y: 0, ancho: 1, alto: 1 },
                  cargada.imagen.ancho,
                  cargada.imagen.alto,
                  SLOT_ANCHO,
                  SLOT_ALTO,
                )
              : null;

            return (
              <div
                key={indice}
                style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                {/* Foto */}
                <div
                  style={{
                    display: "flex",
                    width: SLOT_ANCHO,
                    height: SLOT_ALTO,
                    borderRadius: 36,
                    overflow: "hidden",
                    backgroundColor: cargada ? "#FFFFFF" : acento,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: cargada ? 0 : 48,
                  }}
                >
                  {cargada && encuadre ? (
                    // Misma técnica que la historia simple: escalamos la imagen
                    // completa y la desplazamos con márgenes negativos; el
                    // `overflow: hidden` hace de tijera. Sin `alignItems` aquí,
                    // que recentraría al hijo y anularía los márgenes.
                    <div
                      style={{
                        display: "flex",
                        width: SLOT_ANCHO,
                        height: SLOT_ALTO,
                        overflow: "hidden",
                      }}
                    >
                      {/* Lo renderiza satori, no el DOM: next/image no aplica. */}
                      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
                      <img
                        src={cargada.imagen.dataUri}
                        width={encuadre.ancho}
                        height={encuadre.alto}
                        style={{
                          marginLeft: `${-encuadre.offsetX}px`,
                          marginTop: `${-encuadre.offsetY}px`,
                          flexShrink: 0,
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        textAlign: "center",
                        fontSize: 48,
                        fontWeight: 800,
                        lineHeight: 1.15,
                        color: "#FFFFFF",
                      }}
                    >
                      {nombre}
                    </div>
                  )}
                </div>

                {/* Texto de la tarjeta: el precio manda dentro de ella */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "100%",
                    marginTop: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 38,
                      fontWeight: 800,
                      lineHeight: 1.15,
                      letterSpacing: -0.5,
                      textAlign: "center",
                    }}
                  >
                    {nombre}
                  </div>

                  {producto.talla_notas ? (
                    <div
                      style={{
                        display: "flex",
                        fontSize: 26,
                        color: "#A9A9B8",
                        lineHeight: 1.25,
                        marginTop: 6,
                        textAlign: "center",
                      }}
                    >
                      {recortar(producto.talla_notas, MAX_TALLA)}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      fontSize: 76,
                      fontWeight: 800,
                      letterSpacing: -2,
                      lineHeight: 1,
                      marginTop: 10,
                    }}
                  >
                    {formatearCOP(producto.precio_cop)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pie: lema y marca, una sola vez */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "28px 64px 60px 64px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 140,
              height: 12,
              borderRadius: 999,
              backgroundColor: acento,
              marginBottom: 20,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: acento }}>
              {datos.lema}
            </div>
            <div style={{ display: "flex", fontSize: 30, color: "#71717F" }}>Precio en COP</div>
          </div>
        </div>
      </div>
    ),
    {
      width: HISTORIA_ANCHO,
      height: HISTORIA_ALTO,
      fonts: fonts.map((f) => ({ ...f, style: "normal" as const })),
    },
  );
}
