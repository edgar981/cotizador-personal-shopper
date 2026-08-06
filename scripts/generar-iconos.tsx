/**
 * Genera los iconos de la PWA con satori (el mismo motor de la historia).
 * Se corre a mano: `npx tsx scripts/generar-iconos.tsx`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "@vercel/og";

const RAIZ = process.cwd();
const SALIDA = join(RAIZ, "public", "icons");
const ACENTO = "#E11D74";

type Icono = { archivo: string; tamano: number; padding: number };

const ICONOS: Icono[] = [
  { archivo: "icon-192.png", tamano: 192, padding: 0 },
  { archivo: "icon-512.png", tamano: 512, padding: 0 },
  { archivo: "icon-maskable-512.png", tamano: 512, padding: 96 },
  { archivo: "apple-touch-icon.png", tamano: 180, padding: 0 },
];

async function main() {
  await mkdir(SALIDA, { recursive: true });
  const fuente = await readFile(join(RAIZ, "assets", "fonts", "Inter-800.ttf"));

  for (const { archivo, tamano, padding } of ICONOS) {
    const imagen = new ImageResponse(
      (
        <div
          style={{
            width: tamano,
            height: tamano,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0B0B0F",
            fontFamily: "Inter",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: tamano - padding,
              height: tamano - padding,
              borderRadius: (tamano - padding) * 0.28,
              backgroundColor: ACENTO,
              color: "#FFFFFF",
              fontSize: (tamano - padding) * 0.5,
              fontWeight: 800,
            }}
          >
            $
          </div>
        </div>
      ),
      {
        width: tamano,
        height: tamano,
        fonts: [
          {
            name: "Inter",
            data: fuente.buffer.slice(
              fuente.byteOffset,
              fuente.byteOffset + fuente.byteLength,
            ) as ArrayBuffer,
            weight: 800,
            style: "normal",
          },
        ],
      },
    );

    const png = Buffer.from(await imagen.arrayBuffer());
    await writeFile(join(SALIDA, archivo), png);
    console.log(`✓ ${archivo} (${png.byteLength} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
