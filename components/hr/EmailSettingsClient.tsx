"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Mail,
  RotateCcw,
  Save,
  ServerOff,
  ShieldCheck
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useToast } from "@/components/ToastProvider";
import { Badge, ConfirmDialog, DemoBanner, PageHeader } from "@/components/ui";
import type { MailSettings } from "@/lib/domain";
import { seedMailSettings } from "@/lib/demo-data";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailSettingsClient() {
  const store = useDemoData();
  const { toast } = useToast();
  const [settings, setSettings] = useState<MailSettings>({ ...store.mailSettings });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (field: keyof MailSettings, value: string) => {
    setSettings(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: "" }));
    setSaved(false);
  };

  const save = () => {
    const next: Record<string, string> = {};
    if (settings.senderName.trim().length < 2) next.senderName = "Add a sender name.";
    if (!emailPattern.test(settings.senderAddress)) next.senderAddress = "Enter a valid example sender address.";
    if (settings.replyTo && !emailPattern.test(settings.replyTo)) next.replyTo = "Enter a valid reply-to address.";
    if (!settings.signature.trim()) next.signature = "Add a signature or short closing.";
    setErrors(next);
    if (Object.keys(next).length) return;
    store.updateMailSettings({
      ...settings,
      senderName: settings.senderName.trim(),
      senderAddress: settings.senderAddress.trim(),
      replyTo: settings.replyTo.trim(),
      signature: settings.signature.trim()
    });
    setSaved(true);
    toast("Demo mail settings saved for this browser session.");
  };

  const reset = () => {
    setSettings({ ...seedMailSettings });
    store.updateMailSettings({ ...seedMailSettings });
    setResetOpen(false);
    setSaved(false);
    setErrors({});
    toast("Demo mail settings restored to seed values.");
  };

  return (
    <div className="space-y-5">
      <Link href="/hr/email" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Email centre</Link>
      <PageHeader
        eyebrow="Email & Communications"
        title="Email settings"
        description="Configure the sender identity shown in the demo composer. Provider credentials are intentionally out of scope for this frontend phase."
        actions={<button onClick={() => setResetOpen(true)} className={secondaryButton}><RotateCcw size={13} /> Reset defaults</button>}
      />

      <DemoBanner compact>No mail provider is connected. These settings only affect preview and simulated activity labels. Do not enter real credentials or sensitive secrets.</DemoBanner>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div><h2 className="text-sm font-semibold text-white">Sender identity</h2><p className="mt-1 text-[10px] text-slate-500">Used for previews and future provider configuration.</p></div>
            {saved ? <Badge tone="mint" dot>Saved this session</Badge> : <Badge tone="slate">Demo values</Badge>}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Sender name</span>
              <input value={settings.senderName} onChange={event => update("senderName", event.target.value)} className={inputClass} placeholder="Maya Chen" />
              {errors.senderName && <p className="mt-1 text-[10px] text-rose-200">{errors.senderName}</p>}
            </label>
            <label className="block">
              <span className={labelClass}>Sender address</span>
              <input type="email" value={settings.senderAddress} onChange={event => update("senderAddress", event.target.value)} className={inputClass} placeholder="talent@example.com" />
              {errors.senderAddress && <p className="mt-1 text-[10px] text-rose-200">{errors.senderAddress}</p>}
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Reply-to address</span>
              <input type="email" value={settings.replyTo} onChange={event => update("replyTo", event.target.value)} className={inputClass} placeholder="talent@example.com" />
              {errors.replyTo ? <p className="mt-1 text-[10px] text-rose-200">{errors.replyTo}</p> : <p className="mt-1 text-[8px] text-slate-600">Use an example domain only. No mail will be sent.</p>}
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Signature</span>
              <textarea value={settings.signature} onChange={event => update("signature", event.target.value)} rows={5} className={`${inputClass} resize-y leading-6`} placeholder="Name, team, company" />
              {errors.signature && <p className="mt-1 text-[10px] text-rose-200">{errors.signature}</p>}
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <p className="max-w-md text-[8px] leading-4 text-slate-600">Settings reset on refresh. This interface never stores credentials, API keys, or provider tokens.</p>
            <button onClick={save} className={primaryButton}><Save size={13} /> Save demo settings</button>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-5">
            <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[10px] font-semibold text-amber-200/80"><ServerOff size={13} /> Provider connection</div><Badge tone="amber">Not connected</Badge></div>
            <p className="mt-3 text-[10px] leading-5 text-slate-500">Phase 1 runs entirely on the client with seeded data. Emails can be composed and recorded as simulated activity, but no provider is called.</p>
            <div className="mt-3 space-y-2 text-[9px] text-slate-600">
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> SMTP / API credentials: none requested</div>
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> Outbound delivery: disabled</div>
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> Webhook tracking: not configured</div>
            </div>
            <p className="mt-3 border-t border-amber-300/10 pt-3 text-[8px] leading-4 text-slate-600">Provider setup, secrets management, consent, and delivery tracking belong to Phase 2.</p>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/60 p-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300"><ShieldCheck size={13} className="text-mint" /> Safety boundaries</div>
            <div className="mt-3 space-y-2.5 text-[9px] leading-4 text-slate-500">
              <p className="flex gap-2"><CheckCircle2 size={11} className="mt-0.5 shrink-0 text-mint/60" /> Use fictional candidate and company data only.</p>
              <p className="flex gap-2"><CheckCircle2 size={11} className="mt-0.5 shrink-0 text-mint/60" /> Attachment names are metadata; no file content is retained.</p>
              <p className="flex gap-2"><CheckCircle2 size={11} className="mt-0.5 shrink-0 text-mint/60" /> Simulated sent states are never described as real delivery.</p>
            </div>
            <Link href="/hr/email/templates" className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.07] px-3 py-2.5 text-[9px] text-slate-400 hover:text-white"><span className="inline-flex items-center gap-2"><Mail size={11} /> Manage templates</span><ArrowRight size={10} /></Link>
          </section>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-[8px] leading-4 text-slate-600">
            Demo provider state: <span className="text-slate-400">{settings.provider}</span> · <span className="text-slate-400">{settings.deliveryStatus}</span>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={reset}
        title="Reset email settings?"
        description="This restores the fictional seed sender identity and signature. Your current demo edits will be discarded."
        confirmLabel="Reset defaults"
        tone="danger"
      />
    </div>
  );
}
