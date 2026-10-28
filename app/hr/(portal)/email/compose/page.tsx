"use client";

import { Suspense } from "react";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { ComposeClient, ComposeSkeleton } from "@/components/hr/ComposeClient";
import { DatabaseComposeClient } from "@/components/hr/DatabaseComposeClient";

export default function ComposePage() {
  const database = useIsDatabaseMode();
  return (
    <Suspense fallback={<ComposeSkeleton />}>
      {database ? <DatabaseComposeClient /> : <ComposeClient />}
    </Suspense>
  );
}
