import { PrismaClient } from "@prisma/client";
import { AppConfigurationError, getDatabaseUrl, isDatabaseMode } from "@/lib/server/config";

const globalForPrisma = globalThis as unknown as { ecopanelPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!isDatabaseMode()) {
    throw new AppConfigurationError("Database access is disabled because APP_DATA_MODE is not 'database'.");
  }
  getDatabaseUrl();

  if (!globalForPrisma.ecopanelPrisma) {
    globalForPrisma.ecopanelPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
    });
  }
  return globalForPrisma.ecopanelPrisma;
}

export async function disconnectPrisma() {
  if (globalForPrisma.ecopanelPrisma) {
    await globalForPrisma.ecopanelPrisma.$disconnect();
    globalForPrisma.ecopanelPrisma = undefined;
  }
}
