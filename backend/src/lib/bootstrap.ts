import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { env } from "../env";

/**
 * Creates the initial admin user from APP_EMAIL/APP_PASSWORD (and optional
 * APP_NAME) if no users exist yet. Safe to run on every startup - it's a
 * no-op once a user exists.
 */
export async function bootstrapAdminUser() {
  const existing = await prisma.user.count();
  if (existing > 0) return;

  if (!env.APP_EMAIL || !env.APP_PASSWORD) {
    console.warn(
      "No users exist and APP_EMAIL/APP_PASSWORD are not set - " +
        "set them in your environment to create the initial admin account."
    );
    return;
  }

  const passwordHash = await bcrypt.hash(env.APP_PASSWORD, 12);
  await prisma.user.create({
    data: {
      email: env.APP_EMAIL,
      name: env.APP_NAME,
      passwordHash,
      role: "admin",
    },
  });
  console.log(`Created initial admin user "${env.APP_EMAIL}"`);
}
