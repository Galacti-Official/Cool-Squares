import type { GeoElement, SelectedArea } from "./types";

const KEY = "coolsquares:session:v1";

export interface SessionData {
  v: 1;
  page: "results" | "editor";
  areas: SelectedArea[];
  plans: GeoElement[][];
  updatedAt: number;
}

function safeRead(): SessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1 || !Array.isArray(parsed.areas)) return null;
    return parsed as SessionData;
  } catch {
    return null;
  }
}

function safeWrite(data: SessionData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function loadSession(): SessionData | null {
  const data = safeRead();
  if (!data || data.areas.length === 0) return null;
  return data;
}

export function saveSession(input: {
  page: "results" | "editor";
  areas: SelectedArea[];
  plans?: GeoElement[][];
}): void {
  const prev = safeRead();
  safeWrite({
    v: 1,
    page: input.page,
    areas: input.areas,
    plans: input.plans ?? prev?.plans ?? [],
    updatedAt: Date.now(),
  });
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
