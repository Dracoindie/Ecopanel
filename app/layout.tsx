import type { Metadata } from "next";
import { AppModeProvider } from "@/components/AppModeProvider";
import { DemoDataProvider } from "@/components/DemoDataProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { getDataMode } from "@/lib/server/config";
import "./globals.css";

export const dynamic = "force-dynamic";

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
    <html lang="en">
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
