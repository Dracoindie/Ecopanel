import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EchoPanel | Adaptive AI interviews", description: "The candidate doesn't follow the interview. Their answers generate it.", manifest: "/manifest.webmanifest" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
