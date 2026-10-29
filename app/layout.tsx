import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { AppModeProvider } from "@/components/AppModeProvider";
import { DemoDataProvider } from "@/components/DemoDataProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { getDataMode } from "@/lib/server/config";
import "./globals.css";

export const dynamic = "force-dynamic";

// Headlines use Bricolage's width and optical-size axes as an expressive element; body/UI is Instrument Sans.
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "EchoPanel | Recruiting intelligence",
    template: "%s | EchoPanel"
  },
  description: "A connected recruiting workspace powered by EchoPanel.",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = getDataMode();
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AppModeProvider mode={mode}>
          <ToastProvider>
            <DemoDataProvider>{children}</DemoDataProvider>
          </ToastProvider>
        </AppModeProvider>
      </body>
    </html>
  );
}
