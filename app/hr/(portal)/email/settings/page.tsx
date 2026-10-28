"use client";

import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseEmailSettingsClient } from "@/components/hr/DatabaseEmailSettingsClient";
import { EmailSettingsClient } from "@/components/hr/EmailSettingsClient";

export default function EmailSettingsPage() {
  return useIsDatabaseMode() ? <DatabaseEmailSettingsClient /> : <EmailSettingsClient />;
}
