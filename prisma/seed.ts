import "dotenv/config";
import { authWithSignUp } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { SETTINGS_DEFAULTS, SETTINGS_ID } from "../lib/settings-defaults";

async function sembrarSettings() {
  const existente = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existente) {
    console.log("→ Settings ya existe, no se toca.");
    return;
  }
  await prisma.settings.create({
    data: { id: SETTINGS_ID, ...SETTINGS_DEFAULTS },
  });
  console.log("✓ Settings creado con valores iniciales de referencia (TODO(cliente)).");
}

async function sembrarAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("⚠ Falta ADMIN_EMAIL o ADMIN_PASSWORD: no se creó la cuenta admin.");
    return;
  }

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) {
    console.log(`→ La cuenta ${email} ya existe, no se toca.`);
    return;
  }

  // Nunca hasheamos a mano: Better Auth crea el usuario y su credencial.
  await authWithSignUp.api.signUpEmail({
    body: { email, password, name: "Personal Shopper" },
  });
  console.log(`✓ Cuenta admin creada: ${email}`);
}

async function main() {
  await sembrarSettings();
  await sembrarAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
