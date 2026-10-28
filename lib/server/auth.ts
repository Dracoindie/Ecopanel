import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getAppUrl, getAuthSecret, getDatabaseUrl } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";

function createAuth() {
  return betterAuth({


      appName: "EchoPanel",
      baseURL: getAppUrl(),
      secret: getAuthSecret(),
      database: prismaAdapter(getPrisma(), {
        provider: "postgresql",
        transaction: true
      }),
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        minPasswordLength: 12,
        maxPasswordLength: 128
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24
      },
      advanced: {
        defaultCookieAttributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/"
        }
      },
      trustedOrigins: [getAppUrl()],
      // Better Auth's built-in limiter is per-process memory. Authentication
      // POSTs are limited by the shared PostgreSQL limiter in the route wrapper.
      rateLimit: {
        enabled: false
      }
  });
}

let authInstance: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  if (!authInstance) {
    getDatabaseUrl();
    authInstance = createAuth();
  }
  return authInstance;
}
