"use client";

import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseEmailCenterClient } from "@/components/hr/DatabaseEmailLog";
import { EmailCenterClient } from "@/components/hr/EmailCenterClient";

export default function EmailPage() {
  return useIsDatabaseMode() ? <DatabaseEmailCenterClient /> : <EmailCenterClient />;
}
