import { Suspense } from "react";
import { ApplicantsClient, ApplicantsSkeleton } from "@/components/hr/ApplicantsClient";
import { DatabaseApplicantsClient } from "@/components/hr/DatabaseApplicantsClient";
import { getDataMode } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function ApplicantsPage() {
  return (
    <Suspense fallback={<ApplicantsSkeleton />}>
      {getDataMode() === "database" ? <DatabaseApplicantsClient /> : <ApplicantsClient />}
    </Suspense>
  );
}
