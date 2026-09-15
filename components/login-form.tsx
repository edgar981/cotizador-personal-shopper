"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  // Propio, y no el `pendiente` del useTransition: esa bandera solo se prende
  // cuando arranca la navegación, o sea DESPUÉS de que responde el servidor.
  // Durante toda la petición —que es la parte lenta— el botón se quedaba
  // diciendo "Entrar" como si no hubiera registrado el toque.
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Primero que nada, en el mismo tick del toque.
    setEnviando(true);
    setError(null);

    const datos = new FormData(event.currentTarget);
    const email = String(datos.get("email") ?? "");
    const password = String(datos.get("password") ?? "");

    const { error: fallo } = await signIn.email({ email, password });

    if (fallo) {
      setEnviando(false);
      setError("Correo o contraseña incorrectos.");
      return;
    }

    const destino = searchParams.get("next") ?? "/";
    startTransition(() => {
      router.replace(destino.startsWith("/") ? destino : "/");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}

          {/* Sigue ocupado hasta que la navegación termina: entre la respuesta
              del servidor y el cambio de pantalla no debe parecer que se soltó. */}
          <Button type="submit" disabled={enviando || pendiente} className="mt-2 h-11">
            {enviando || pendiente ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
