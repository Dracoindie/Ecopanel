"use client";

import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseJobEditor } from "@/components/hr/DatabaseJobEditor";
import { JobEditor } from "@/components/hr/JobEditor";

export default function NewJobPage() {
  return useIsDatabaseMode() ? <DatabaseJobEditor /> : <JobEditor />;
}
