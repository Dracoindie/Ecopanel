import { allowUnscannedCvDownloads } from "@/lib/server/config";
import type { CvScanStatus } from "@/lib/server/cv/scanner";

export type CvDownloadability = { allowed: true } | { allowed: false; reason: string };

export function cvDownloadability(status: CvScanStatus): CvDownloadability {
  if (status === "CLEAN") return { allowed: true };
  if (status === "INFECTED") return { allowed: false, reason: "This file failed malware scanning and cannot be downloaded." };
  if (status === "PENDING") return { allowed: false, reason: "The malware scan is still in progress. Download is blocked." };
  if (status === "SCAN_FAILED") return { allowed: false, reason: "The malware scan did not complete. Download is blocked." };
  if (allowUnscannedCvDownloads()) {
    return { allowed: true };
  }
  return { allowed: false, reason: "This file has not been scanned. Download is blocked until scanning is configured." };
}

export function cvStorageStatusLabel(status: CvScanStatus) {
  if (status === "CLEAN") return "Private storage · scanned";
  if (status === "INFECTED") return "Blocked · malware detected";
  if (status === "PENDING") return "Scanning · download blocked";
  if (status === "SCAN_FAILED") return "Blocked · scan failed";
  return allowUnscannedCvDownloads() ? "Private storage · unscanned (development)" : "Pending scan · download blocked";
}
