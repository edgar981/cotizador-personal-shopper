/**
 * Genera capturas de prueba con ground truth conocido, para verificar la
 * extracción por visión sin depender de que un retailer nos deje entrar.
 *
 *   npx tsx scripts/generar-fixture-captura.tsx
 *
 * Escribe en test/fixtures/. El caso `promocion` es el del criterio de
 * aceptación 2: precio tachado + precio vigente + cuotas como distractor.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "@vercel/og";

const RAIZ = process.cwd();
const SALIDA = join(RAIZ, "test", "fixtures");

type Caso = {
  archivo: string;
  marca: string;
  nombre: string;
  precioTachado?: string;
  precioVigente: string;
  cuotas?: string;
  tallas: string[];
  color: string;
  /** Lo que la extracción DEBE devolver. */
  esperado: Record<string, unknown>;
};

const CASOS: Caso[] = [
  {
    archivo: "producto-promocion.png",
    marca: "adidas",
    nombre: "Samba OG Shoes",
    precioTachado: "$180.00",
    precioVigente: "$109.99",
    cuotas: "o 4 pagos sin interés de $27.50",
    tallas: ["7", "7.5", "8", "9", "10.5", "11"],
    color: "Cloud White / Core Black",
    esperado: { precio_usd: 109.99, categoria_sugerida: "tenis" },
  },
  {
    archivo: "producto-simple.png",
    marca: "Chanel",
    nombre: "Bleu de Chanel Eau de Parfum 100ml",
    precioVigente: "$175.00",
    tallas: ["100 ml"],
    color: "Frasco sellado",
    esperado: { precio_usd: 175, categoria_sugerida: "perfume" },
  },
];

async function main() {
  await mkdir(SALIDA, { recursive: true });
  const base = join(RAIZ, "assets", "fonts");
  const [regular, bold] = await Promise.all([
    readFile(join(base, "Inter-400.ttf")),
    readFile(join(base, "Inter-800.ttf")),
  ]);
  const fonts = [
    { name: "Inter", data: aArrayBuffer(regular), weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: aArrayBuffer(bold), weight: 800 as const, style: "normal" as const },
  ];

  const groundTruth: Record<string, unknown> = {};

  for (const caso of CASOS) {
    const imagen = new ImageResponse(<PaginaProducto caso={caso} />, {
      width: 900,
      height: 1600,
      fonts,
    });
    const png = Buffer.from(await imagen.arrayBuffer());
    await writeFile(join(SALIDA, caso.archivo), png);
    groundTruth[caso.archivo] = caso.esperado;
    console.log(`✓ ${caso.archivo} (${png.byteLength} bytes)`);
  }

  await writeFile(
    join(SALIDA, "ground-truth.json"),
    `${JSON.stringify(groundTruth, null, 2)}\n`,
  );
  console.log("✓ ground-truth.json");
}

function aArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/** Maqueta de página de producto, al estilo de un retailer de US. */
function PaginaProducto({ caso }: { caso: Caso }) {
  return (
    <div
      style={{
        width: 900,
        height: 1600,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF",
        fontFamily: "Inter",
        color: "#111111",
      }}
    >
      {/* Barra de navegación */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px 40px",
          borderBottom: "1px solid #E5E5E5",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>{caso.marca}</div>
        <div style={{ display: "flex", fontSize: 22, color: "#666666" }}>Bag (0)</div>
      </div>

      {/* Foto del producto (placeholder gris) */}
      <div
        style={{
          display: "flex",
          height: 620,
          margin: "0 40px",
          marginTop: 28,
          backgroundColor: "#F1F1F1",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", fontSize: 26, color: "#9A9A9A" }}>[ foto del producto ]</div>
      </div>

      {/* Detalle */}
      <div style={{ display: "flex", flexDirection: "column", padding: "36px 40px" }}>
        <div style={{ display: "flex", fontSize: 24, color: "#777777", marginBottom: 10 }}>
          {caso.marca}
        </div>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 800, marginBottom: 24 }}>
          {caso.nombre}
        </div>

        {/* Precios: tachado + vigente */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          {caso.precioTachado ? (
            <div
              style={{
                display: "flex",
                fontSize: 34,
                color: "#8A8A8A",
                textDecoration: "line-through",
                marginRight: 20,
              }}
            >
              {caso.precioTachado}
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, color: "#C81E1E" }}>
            {caso.precioVigente}
          </div>
        </div>

        {caso.cuotas ? (
          <div style={{ display: "flex", fontSize: 22, color: "#666666", marginBottom: 28 }}>
            {caso.cuotas}
          </div>
        ) : null}

        <div style={{ display: "flex", fontSize: 22, color: "#444444", marginBottom: 20 }}>
          Color: {caso.color}
        </div>

        <div style={{ display: "flex", fontSize: 22, color: "#444444", marginBottom: 14 }}>
          Tallas disponibles
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {caso.tallas.map((talla) => (
            <div
              key={talla}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #CCCCCC",
                borderRadius: 6,
                padding: "14px 22px",
                marginRight: 12,
                marginBottom: 12,
                fontSize: 24,
              }}
            >
              {talla}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#111111",
            color: "#FFFFFF",
            borderRadius: 8,
            padding: "26px 0",
            marginTop: 30,
            fontSize: 26,
            fontWeight: 800,
          }}
        >
          ADD TO BAG
        </div>
      </div>
    </div>
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
