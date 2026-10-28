"use client";

import Link from "next/link";
import { ArrowRight, Clock3, FileText, Mail, Paperclip } from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { Avatar, Badge, EmailStatusBadge, Modal } from "@/components/ui";
import type { EmailMessage } from "@/lib/domain";
import { formatDate, formatTime } from "@/lib/format";
import { secondaryButton } from "@/lib/ui";

export function EmailDetailDialog({ email, onClose }: { email: EmailMessage | null; onClose: () => void }) {
  const store = useDemoData();
  const template = store.templates.find(item => item.id === email?.templateId);

  return (
    <Modal
      open={Boolean(email)}
      onClose={onClose}
      title={email?.subject ?? "Email activity"}
      description={email ? `Simulated email activity · ${formatDate(email.createdAt)} at ${formatTime(email.createdAt)}` : undefined}
      size="lg"
      footer={
        email ? (
          <>
            <button onClick={onClose} className={secondaryButton}>Close</button>
            <Link href={`/hr/email/compose?candidate=${email.candidateId}${email.templateId ? `&template=${email.templateId}` : ""}`} className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-xs font-semibold text-ink">Compose follow-up <ArrowRight size={13} /></Link>
          </>
        ) : undefined
      }
    >
      {email && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <EmailStatusBadge status={email.status} />
            {template && <Badge tone="violet">{template.name}</Badge>}
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

          {email.attachments.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">Attachment names</p>
              <div className="mt-2 space-y-1.5">
                {email.attachments.map(name => <div key={name} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[9px] text-slate-400"><Paperclip size={10} />{name}</div>)}
              </div>
              <p className="mt-1.5 text-[8px] text-slate-600">Demo metadata only; no file content was stored or transmitted.</p>
            </div>
          )}

          <div className="rounded-xl border border-amber-300/10 bg-amber-300/[0.025] p-3.5">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-200/70"><Mail size={11} /> Demo activity record</div>
            <p className="mt-2 text-[9px] leading-5 text-slate-500">
              {email.status === "Failed"
                ? "This failed status is seeded history for interface demonstration. No provider was contacted and no real delivery failure occurred."
                : email.status === "Draft"
                  ? "This draft exists only in browser memory. It has not been sent."
                  : "This message is shown as sent for interface demonstration only. No mail provider was contacted and nobody received it."}
            </p>
            <Link href={`/hr/applicants/${email.applicationId}`} className="mt-2 inline-flex items-center gap-1.5 text-[9px] text-amber-200/70 hover:text-white"><FileText size={10} /> Review candidate record <ArrowRight size={9} /></Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
