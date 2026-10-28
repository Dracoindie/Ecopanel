"use client";

import { createContext, useContext } from "react";
import type { AppDataMode } from "@/lib/server/config";

const AppModeContext = createContext<AppDataMode>("demo");

export function AppModeProvider({ mode, children }: { mode: AppDataMode; children: React.ReactNode }) {
  return <AppModeContext.Provider value={mode}>{children}</AppModeContext.Provider>;
}

export function useAppMode() {
  return useContext(AppModeContext);
}

export function useIsDatabaseMode() {
  return useAppMode() === "database";
}
