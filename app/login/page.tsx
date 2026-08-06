import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { obtenerSesion } from "@/lib/session";

export const metadata = { title: "Entrar · Cotizador" };

export default async function LoginPage() {
  if (await obtenerSesion()) redirect("/");

  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Cotizador</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            De USA a tu puerta, en menos de un minuto.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
