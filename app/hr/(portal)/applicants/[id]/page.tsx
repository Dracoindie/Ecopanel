import DemoApplicantDetailClient from "@/components/hr/DemoApplicantDetailClient";
import { DatabaseApplicantDetailClient } from "@/components/hr/DatabaseApplicantDetailClient";
import { getDataMode } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function CandidateProfilePage() {
  return getDataMode() === "database" ? <DatabaseApplicantDetailClient /> : <DemoApplicantDetailClient />;
}