"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LayoutTemplate,
  Mail,
  PenLine,
  Save,
  ServerOff,
  ShieldCheck
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

interface Settings {
  senderName: string;
  senderAddress: string;
  replyTo: string;
  signature: string;
  provider: string;
  deliveryStatus: string;
  providerConfigured: boolean;
  providerMode: "disabled" | "test" | "live";
  fromAddress: string | null;
  webhookConfigured: boolean;
  configurationIssue: string | null;
  updatedAt: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DatabaseEmailSettingsClient() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/hr/email/settings", { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { settings?: Settings; error?: string };
        if (!response.ok || !body.settings) throw new Error(body.error || "Email settings could not be loaded.");
        return body.settings;
      })
      .then(loaded => { if (active) { setSettings(loaded); setError(""); } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Email settings could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const update = (field: keyof Settings, value: string) => {
    setSettings(current => current ? { ...current, [field]: value } : current);
    setErrors(current => ({ ...current, [field]: "" }));
    setSaved(false);
  };

  const save = async () => {
    if (!settings) return;
    const next: Record<string, string> = {};
    if (settings.senderName.trim().length < 2) next.senderName = "Add a sender name.";
    if (!EMAIL_PATTERN.test(settings.senderAddress)) next.senderAddress = "Enter a valid sender address.";
    if (settings.replyTo && !EMAIL_PATTERN.test(settings.replyTo)) next.replyTo = "Enter a valid reply-to address.";
    if (!settings.signature.trim()) next.signature = "Add a signature or short closing.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const response = await fetch("/api/hr/email/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: settings.senderName.trim(),
          senderAddress: settings.senderAddress.trim(),
          replyTo: settings.replyTo.trim(),
          signature: settings.signature.trim()
        })
      });
      const body = await response.json() as { settings?: Settings; error?: string };
      if (!response.ok || !body.settings) throw new Error(body.error || "Email settings could not be saved.");
      setSettings(body.settings);
      setSaved(true);
      toast(body.settings.providerConfigured
        ? "Sender settings saved. Provider delivery uses the configured environment sender."
        : "Sender settings saved. Delivery stays queued until a provider is configured.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Email settings could not be saved.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-4"><div className="h-10 w-52 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-[420px] animate-pulse rounded-2xl bg-white/[0.03]" /></div>;
  }

  if (error || !settings) {
    return <EmptyState title="Settings unavailable" description={error || "Email settings could not be loaded."} icon={Mail} action={<Link href="/hr/email" className={secondaryButton}><ArrowLeft size={13} /> Email centre</Link>} />;
  }

  return (
    <div className="space-y-5">
      <Link href="/hr/email" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Email centre</Link>
      <PageHeader
        eyebrow="Email & Communications"
        title="Email settings"
        description="Configure the organization sender identity. Provider credentials stay server-side in environment variables and are never stored here."
        actions={<button onClick={save} disabled={saving} className={primaryButton}><Save size={13} /> {saving ? "Saving..." : "Save settings"}</button>}
      />

      <div className={`rounded-xl border px-4 py-2.5 text-[10px] leading-5 ${settings.providerConfigured ? "border-mint/15 bg-mint/[0.035] text-mint/80" : "border-amber-300/15 bg-amber-300/[0.04] text-amber-200/75"}`}>
        {settings.providerConfigured
          ? settings.providerMode === "test"
            ? "Delivery is configured in test mode. Messages are redirected to the designated test inbox."
            : "Delivery is configured for live email through Resend. Only the server environment holds the API key."
          : "No mail provider is configured. These values shape previews and stored messages; nothing is delivered until the server environment is configured."}
        {settings.configurationIssue && <span className="block">{settings.configurationIssue}</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div><h2 className="text-sm font-semibold text-white">Sender identity</h2><p className="mt-1 text-[10px] text-slate-500">Used for composer previews and persisted message records.</p></div>
            {saved ? <Badge tone="mint" dot>Saved</Badge> : <Badge tone="slate">PostgreSQL</Badge>}
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
              {errors.senderAddress ? <p className="mt-1 text-[10px] text-rose-200">{errors.senderAddress}</p> : <p className="mt-1 text-[8px] text-slate-600">The provider sends from EMAIL_FROM. This address is retained as the organization sender identity.</p>}
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Reply-to address</span>
              <input type="email" value={settings.replyTo} onChange={event => update("replyTo", event.target.value)} className={inputClass} placeholder="talent@example.com" />
              {errors.replyTo ? <p className="mt-1 text-[10px] text-rose-200">{errors.replyTo}</p> : <p className="mt-1 text-[8px] text-slate-600">Used as the reply-to address on delivered messages when configured.</p>}
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Signature</span>
              <textarea value={settings.signature} onChange={event => update("signature", event.target.value)} rows={4} className={`${inputClass} resize-y`} placeholder="Best regards, Talent team" />
              {errors.signature && <p className="mt-1 text-[10px] text-rose-200">{errors.signature}</p>}
            </label>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <h2 className="text-sm font-semibold text-white">Provider status</h2>
            <div className="mt-4 space-y-3 text-[10px]">
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Provider</span><span className={`inline-flex items-center gap-1.5 ${settings.providerConfigured ? "text-mint" : "text-amber-200/80"}`}>{settings.providerConfigured ? <CheckCircle2 size={11} /> : <ServerOff size={11} />} {settings.provider}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Mode</span><span className="text-slate-300">{settings.providerMode === "live" ? "Live" : settings.providerMode === "test" ? "Test inbox" : "Disabled"}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Delivery</span><span className="text-slate-300">{settings.deliveryStatus}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Provider from</span><span className="truncate text-slate-400">{settings.fromAddress ?? "Not configured"}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Webhook</span><span className={settings.webhookConfigured ? "text-mint" : "text-slate-400"}>{settings.webhookConfigured ? "Configured" : "Not configured"}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Last updated</span><span className="text-slate-400">{settings.updatedAt ? new Date(settings.updatedAt).toLocaleDateString("en-GB") : "Not saved"}</span></div>
            </div>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-3.5 text-[9px] leading-5 text-slate-500">
              Queued messages are delivered by the separate email worker. Sent means the provider accepted the message; Delivered requires a verified webhook.
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/60 p-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300"><ShieldCheck size={12} className="text-mint" /> Safety boundary</div>
            <p className="mt-2 text-[9px] leading-5 text-slate-600">Settings are organization-scoped and require an HR session. No secrets are stored by this screen.</p>
          </section>

          <div className="flex flex-col gap-2">
            <Link href="/hr/email/templates" className="flex items-center justify-between rounded-xl border border-white/[0.07] px-3.5 py-3 text-[10px] text-slate-400 hover:text-white"><span className="inline-flex items-center gap-2"><LayoutTemplate size={12} /> Review templates</span><ArrowRight size={11} /></Link>
            <Link href="/hr/email/compose" className="flex items-center justify-between rounded-xl border border-mint/10 bg-mint/[0.03] px-3.5 py-3 text-[10px] text-mint/80 hover:text-white"><span className="inline-flex items-center gap-2"><PenLine size={12} /> Open composer</span><ArrowRight size={11} /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
