"use client";

import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseEmailActivityClient } from "@/components/hr/DatabaseEmailLog";
import { EmailActivityClient } from "@/components/hr/EmailActivityClient";

export default function EmailActivityPage() {
  return useIsDatabaseMode() ? <DatabaseEmailActivityClient /> : <EmailActivityClient />;
}
