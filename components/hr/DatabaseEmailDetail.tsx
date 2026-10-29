"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Clock3, FileText, Loader2, Mail, Paperclip, RotateCw } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Avatar, Badge, ConfirmDialog, Modal } from "@/components/ui";
import { emailStatusLabel, emailStatusTone, normalizeEmailStatus } from "@/lib/email-status";
import { formatDate, formatTime } from "@/lib/format";
import { secondaryButton } from "@/lib/ui";

export interface DatabaseEmailRecord {
  id: string;
  applicationId: string | null;
  candidateId: string | null;
  jobId: string | null;
  interviewId: string | null;
  templateId: string | null;
  templateName: string | null;
  kind: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  preview: string;
  status: string;
  providerName: string | null;
  providerMode: string | null;
  providerMessageId: string | null;
  failureCode: string | null;
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: string[];
  isDemo: boolean;
}

function deliveredAt(email: DatabaseEmailRecord) {
  return email.deliveredAt ?? email.complainedAt ?? email.bouncedAt ?? email.failedAt ?? email.acceptedAt ?? email.sentAt;
}

function deliveryDescription(email: DatabaseEmailRecord) {
  if (email.isDemo) {
    return "This is a historical seeded record. It is not evidence that a provider accepted or delivered a real email.";
  }
  switch (normalizeEmailStatus(email.status)) {
    case "Draft":
      return "This draft is stored in PostgreSQL and is not in the delivery queue.";
    case "Queued":
      return `This message is in the durable outbox. A worker will attempt delivery after ${formatDate(email.availableAt)} at ${formatTime(email.availableAt)}.`;
    case "Sending":
      return "A worker is currently waiting for the provider response. The outcome is not yet confirmed.";
    case "Sent":
      return "The provider accepted this message. Delivery has not been confirmed by a verified provider webhook.";
    case "Delivered":
      return "A verified provider webhook confirmed delivery.";
    case "Bounced":
      return "A verified provider webhook reported that the message bounced.";
    case "Complained":
      return "A verified provider webhook reported a spam complaint.";
    case "Failed":
      return email.failureCode === "AMBIGUOUS_SEND"
        ? "The provider outcome is uncertain. Do not retry blindly; check the provider dashboard first."
        : "The provider reported a definite failure, or retry attempts were exhausted.";
    case "Cancelled":
      return "This queued message was cancelled because the related workflow changed.";
  }
}

export function DatabaseEmailDetail({
  email,
  onClose,
  onChanged
}: {
  email: DatabaseEmailRecord | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [retryOpen, setRetryOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const canRetry = Boolean(
    email &&
    normalizeEmailStatus(email.status) === "Failed" &&
    email.failureCode !== "AMBIGUOUS_SEND" &&
    !email.providerMessageId
  );

  const retry = async () => {
    if (!email) return;
    setRetrying(true);
    try {
      const response = await fetch(`/api/hr/email/messages/${encodeURIComponent(email.id)}/retry`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The message could not be requeued.");
      toast("Message requeued. The email worker will retry it when delivery is available.");
      setRetryOpen(false);
      onChanged?.();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "The message could not be requeued.", "error");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <Modal
        open={Boolean(email)}
        onClose={onClose}
        title={email?.subject ?? "Email activity"}
        description={email ? `${emailStatusLabel(email.status, { isDemo: email.isDemo })} - ${formatDate(email.createdAt)} at ${formatTime(email.createdAt)}` : undefined}
        size="lg"
        footer={
          email ? (
            <>
              <button onClick={onClose} className={secondaryButton}>Close</button>
              {canRetry && (
                <button onClick={() => setRetryOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-2.5 text-xs font-semibold text-amber-100">
                  <RotateCw size={13} /> Requeue failure
                </button>
              )}
              <Link href={`/hr/email/compose?candidate=${email.candidateId ?? ""}${email.templateId ? `&template=${email.templateId}` : ""}`} className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-xs font-semibold text-ink">Compose follow-up</Link>
            </>
          ) : undefined
        }
      >
        {email && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={emailStatusTone(email.status)}>{emailStatusLabel(email.status, { isDemo: email.isDemo })}</Badge>
              {email.templateName && <Badge tone="violet">{email.templateName}</Badge>}
              {email.isDemo && <Badge tone="amber">Seeded demo</Badge>}
              {email.providerMode === "test" && <Badge tone="sky">Test delivery</Badge>}
              <span className="font-mono text-[8px] text-slate-600">{email.id}</span>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
              <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
                <Avatar name={email.recipientName} tone="violet" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-slate-200">{email.recipientName}</p>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500">{email.recipientEmail}</p>
                </div>
                <div className="text-right text-[8px] text-slate-600"><Clock3 size={10} className="ml-auto mb-1" />{formatDate(email.createdAt)}<br />{formatTime(email.createdAt)}</div>
              </div>
              <div className="pt-3">
                <p className="text-sm font-semibold text-white">{email.subject}</p>
                <p className="mt-3 whitespace-pre-wrap text-[11px] leading-6 text-slate-400">{email.body}</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400"><Mail size={11} /> Delivery record</div>
                {email.providerName && <span className="text-[8px] text-slate-600">{email.providerName}{email.providerMode ? ` - ${email.providerMode}` : ""}</span>}
              </div>
              <p className="mt-2 text-[9px] leading-5 text-slate-500">{deliveryDescription(email)}</p>
              <div className="mt-3 grid gap-2 text-[9px] sm:grid-cols-2">
                <div className="flex justify-between gap-3 rounded-lg border border-white/[0.05] px-2.5 py-1.5"><span className="text-slate-600">Attempts</span><span className="text-slate-400">{email.attempts} of {email.maxAttempts}</span></div>
                <div className="flex justify-between gap-3 rounded-lg border border-white/[0.05] px-2.5 py-1.5"><span className="text-slate-600">Provider result</span><span className="truncate text-slate-400">{deliveredAt(email) ? `${formatDate(deliveredAt(email)!)} ${formatTime(deliveredAt(email)!)}` : "Pending"}</span></div>
                {email.failureCode && <div className="flex justify-between gap-3 rounded-lg border border-rose-400/10 px-2.5 py-1.5"><span className="text-slate-600">Failure code</span><span className="text-rose-200/80">{email.failureCode}</span></div>}
                {email.providerMessageId && <div className="flex justify-between gap-3 rounded-lg border border-white/[0.05] px-2.5 py-1.5"><span className="text-slate-600">Provider id</span><span className="truncate font-mono text-[8px] text-slate-500">{email.providerMessageId}</span></div>}
              </div>
              {email.lastError && <p className="mt-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] px-2.5 py-2 text-[8px] leading-4 text-amber-100/70">{email.lastError}</p>}
            </div>

            {email.attachments.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">Attachment names</p>
                <div className="mt-2 space-y-1.5">
                  {email.attachments.map(name => <div key={name} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[9px] text-slate-400"><Paperclip size={10} />{name}</div>)}
                </div>
                <p className="mt-1.5 text-[8px] text-slate-600">Names only. No file content is stored or transmitted.</p>
              </div>
            )}

            {email.applicationId && (
              <Link href={`/hr/applicants/${email.applicationId}`} className="inline-flex items-center gap-1.5 text-[9px] text-slate-500 hover:text-white"><FileText size={10} /> Review candidate record</Link>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={retryOpen}
        onClose={() => setRetryOpen(false)}
        onConfirm={() => { void retry(); }}
        title="Requeue this failed message?"
        description="The message will return to the durable outbox and may be sent by an email worker. Retry only after confirming the previous failure was definite."
        confirmLabel={retrying ? "Requeuing..." : "Requeue message"}
        busy={retrying}
      />
    </>
  );
}
