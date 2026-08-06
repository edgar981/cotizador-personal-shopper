import { ConfigForm } from "@/components/config-form";
import { obtenerSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración · Cotizador" };

export default async function ConfigPage() {
  const settings = await obtenerSettings();
  return <ConfigForm settings={settings} />;
}
