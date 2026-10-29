import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { fetchResendEmailStatus } from "@/lib/server/email/provider";

// Usage: tsx scripts/email-status.ts --message <EmailMessage id> [--env-file .env.live.local]
// Prints Resend's last event for a sent message. Read-only: never sends or writes.
function argValue(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

const envFile = argValue("--env-file") ?? ".env.local";
const messageId = argValue("--message");

async function main() {
  if (!messageId) throw new Error("--message <EmailMessage id> is required.");
  if (!existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
  process.loadEnvFile(envFile);
  const prisma = new PrismaClient();
  try {
    const message = await prisma.emailMessage.findUnique({
      where: { id: messageId },
      select: { id: true, kind: true, status: true, providerMessageId: true, acceptedAt: true }
    });
    if (!message) throw new Error("EmailMessage not found.");
    const local = { id: message.id, kind: message.kind, status: message.status, acceptedAt: message.acceptedAt?.toISOString() ?? null };
    if (!message.providerMessageId) {
      console.log(JSON.stringify({ ...local, resend: "not sent yet (no provider message id)" }));
      return;
    }
    const resend = await fetchResendEmailStatus(message.providerMessageId);
    console.log(JSON.stringify({ ...local, providerMessageId: message.providerMessageId, resend }));
    if (!resend.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "email-status failed");
  process.exitCode = 1;
});
