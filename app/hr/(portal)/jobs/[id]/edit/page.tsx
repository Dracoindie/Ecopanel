"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseJobEditor } from "@/components/hr/DatabaseJobEditor";
import { JobEditor } from "@/components/hr/JobEditor";
import { EmptyState } from "@/components/ui";
import { secondaryButton } from "@/lib/ui";

export default function EditJobPage() {
  const params = useParams<{ id: string }>();
  return useIsDatabaseMode() ? <DatabaseJobEditor jobId={params.id} /> : <DemoEditJobPage />;
}

function DemoEditJobPage() {
  const params = useParams<{ id: string }>();
  const { jobs } = useDemoData();
  const job = jobs.find(item => item.id === params.id);

  if (!job) {
    return (
      <EmptyState
        title="Job not found"
        description="The demo role may have been removed."
        action={<Link href="/hr/jobs" className={secondaryButton}><ArrowLeft size={13} /> Back to jobs</Link>}
      />
    );
  }

  return <JobEditor job={job} />;
}

