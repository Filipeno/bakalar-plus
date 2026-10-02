import { signal } from "@preact/signals";
import { native } from "./native";

// Android only: the app checks GitHub for a newer release and installs it (Android asks the user to confirm).
export interface UpdateInfo { current: string; latest: string; newer: boolean; url: string; sha256: string; notes: string }

export const update = signal<UpdateInfo | null>(null);
export const updating = signal<"idle" | "busy" | "permission" | "error">("idle");

const CHECKED = "bp.updateChecked";
const EVERY = 6 * 3600_000;

/**
 * Checks GitHub. The app checks on every start (force) and, when it comes back to the foreground, at most every
 * 6 hours; the Settings button forces it too. Resolves to the info or null if unreachable.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (!native) return null;
  if (!force && Date.now() - Number(localStorage.getItem(CHECKED) || 0) < EVERY) return update.value;
  try {
    const info = await native.call<UpdateInfo>("updateCheck");
    localStorage.setItem(CHECKED, String(Date.now()));
    update.value = info.newer ? info : null;
    return info;
  } catch { return null; }
}

if (native) document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void checkForUpdate(); });

/** The startup prompt for a new version shows once per version and day ("Později" hides it until tomorrow). */
const PROMPTED = "bp.updatePrompted";
export const promptKey = (u: UpdateInfo) => `${u.latest}:${new Date().toDateString()}`;
export const wasPrompted = (u: UpdateInfo) => localStorage.getItem(PROMPTED) === promptKey(u);
export const markPrompted = (u: UpdateInfo) => localStorage.setItem(PROMPTED, promptKey(u));

export async function installUpdate() {
  const u = update.value;
  if (!native || !u) return;
  updating.value = "busy";
  try {
    const r = await native.call<string>("updateInstall", { url: u.url, sha256: u.sha256 });
    updating.value = r === "permission" ? "permission" : "idle";
  } catch { updating.value = "error"; }
}
