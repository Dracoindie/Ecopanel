import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { cvDownloadability } from "@/lib/server/cv/policy";
import { getCvStorage } from "@/lib/server/cv/storage";
import type { CvScanStatus } from "@/lib/server/cv/scanner";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { logError } from "@/lib/server/logger";
import { getCvForDownload } from "@/lib/server/recruitment/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;

  const rate = await enforceRateLimit(request, "cvDownload", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const cv = await getCvForDownload(auth.context.organization.id, params.id);
    if (cv.deletedAt) return apiError(410, "This CV has been deleted.", "CV_DELETED");

    const policy = cvDownloadability(cv.scanStatus as CvScanStatus);
    if (!policy.allowed) return apiError(403, policy.reason, "CV_DOWNLOAD_BLOCKED");

    const buffer = await getCvStorage().read(cv.storageKey);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    if (checksum !== cv.checksum || buffer.length !== cv.sizeBytes) {
      logError("Stored CV integrity check failed", {
        requestId: request.headers.get("x-request-id") ?? undefined,
        cvId: cv.id,
        organizationId: auth.context.organization.id
      });
      return apiError(500, "The stored CV failed an integrity check.", "CV_INTEGRITY_FAILED");
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": cv.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": contentDisposition(cv.originalFilename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"
      }
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return apiError(410, "The stored CV file is no longer available.", "CV_FILE_MISSING");
    }
    return apiErrorResponse(error, request);
  }
}
