import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Primera barrera, optimista: solo mira la cookie de sesión para evitar pintar
 * la app a quien no ha entrado. La verificación real vive en el layout
 * protegido (`app/(app)/layout.tsx`) y en cada server action.
 */
export function proxy(request: NextRequest) {
  const tieneCookie = getSessionCookie(request);
  const { pathname, search } = request.nextUrl;
  const esLogin = pathname === "/login";

  // `/login` siempre pasa. Aquí solo tenemos la cookie, no sabemos si la sesión
  // sigue viva; si redirigiéramos a "/" por tenerla, una cookie vencida haría
  // un bucle infinito: "/" → /login (el layout no encuentra sesión) → "/" …
  // Quien decide es `app/login/page.tsx`, que sí consulta la sesión real.
  if (esLogin) return NextResponse.next();

  if (!tieneCookie) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Todo excepto los assets y el endpoint de autenticación.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|icons/|.*\\.png$|.*\\.svg$).*)",
  ],
};
