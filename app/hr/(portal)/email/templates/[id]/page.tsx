"use client";

import { useParams } from "next/navigation";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseTemplateEditor } from "@/components/hr/DatabaseTemplateEditor";
import { TemplateEditorClient } from "@/components/hr/TemplateEditorClient";

export default function EmailTemplateEditorPage() {
  const params = useParams<{ id: string }>();
  return useIsDatabaseMode() ? <DatabaseTemplateEditor templateId={params.id} /> : <TemplateEditorClient />;
}
