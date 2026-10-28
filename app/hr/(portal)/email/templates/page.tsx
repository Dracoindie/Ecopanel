"use client";

import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseEmailTemplatesClient } from "@/components/hr/DatabaseEmailTemplatesClient";
import { EmailTemplatesClient } from "@/components/hr/EmailTemplatesClient";

export default function EmailTemplatesPage() {
  return useIsDatabaseMode() ? <DatabaseEmailTemplatesClient /> : <EmailTemplatesClient />;
}
