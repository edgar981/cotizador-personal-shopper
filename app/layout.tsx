import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cotizador",
  description: "Cotiza productos de US en COP y arma la historia de Instagram.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    // `default` y no `black-translucent`: con translucent el contenido se mete
    // debajo de la barra de estado y el reloj se dibuja en BLANCO, invisible
    // sobre el fondo claro de la app. Con `default` la barra queda opaca, con
    // texto oscuro legible, y el contenido empieza por debajo del notch.
    statusBarStyle: "default",
    title: "Cotizador",
  },
  other: {
    // `appleWebApp.capable` solo emite `mobile-web-app-capable`, que iOS
    // entiende desde Safari 17.4. El nombre con prefijo `apple-` sigue siendo
    // el que reconocen las versiones anteriores, y sin él la app se abre en
    // Safari en vez de en pantalla completa.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
