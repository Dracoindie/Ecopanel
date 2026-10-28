import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";
import { getResendWebhookSecret } from "@/lib/server/email/config";
import { EmailWebhookError, processResendWebhook, verifySvixSignature } from "@/lib/server/email/webhook";
import { enforceRateLimit } from "@/lib/server/http";
import { logWarn } from "@/lib/server/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rate = await enforceRateLimit(request, "emailWebhook");
  if ("response" in rate) return rate.response;

  const secret = getResendWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Email webhooks are not configured.", code: "WEBHOOK_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const payload = await request.text();
  try {
    verifySvixSignature({
      secret,
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
      payload
    });
    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new EmailWebhookError("Webhook payload is not valid JSON.", 400, "INVALID_WEBHOOK_PAYLOAD");
    }
    const result = await processResendWebhook(getPrisma(), {
      eventId: request.headers.get("svix-id")!,
      payload: event
    });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailWebhookError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    logWarn("Resend webhook processing failed", { error });
    return NextResponse.json(
      { error: "Webhook processing failed.", code: "WEBHOOK_PROCESSING_FAILED" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
