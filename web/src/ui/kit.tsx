import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon, type IconName } from "./icons";
import { back, pushCloser } from "./router";
import { t } from "../lib/i18n";
import { online } from "../lib/store";
import { AuthError } from "../lib/bakalari";
import { NetError } from "../lib/net";

export function Page({ title, sub, backable, actions, children, wide }: {
  title: ComponentChildren; sub?: ComponentChildren; backable?: boolean; actions?: ComponentChildren; children: ComponentChildren; wide?: boolean;
}) {
  return (
    <div class={`page ${wide ? "wide" : ""}`}>
      <header class="topbar">
        {backable && <button class="icon-btn" onClick={back} aria-label={t("back")}><Icon name="back" /></button>}
        <div class="topbar-title">
          <h1>{title}</h1>
          {sub && <div class="topbar-sub">{sub}</div>}
        </div>
        <div class="topbar-actions">{actions}</div>
      </header>
      {!online.value && <div class="banner">{t("offline")}</div>}
      <main class="content">{children}</main>
    </div>
  );
}

export function Sheet({ open, onClose, title, children, full }: { open: boolean; onClose: () => void; title?: ComponentChildren; children: ComponentChildren; full?: boolean }) {
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) { setShown(true); return pushCloser(onClose); }
    const id = setTimeout(() => setShown(false), 220);
    return () => clearTimeout(id);
  }, [open]);
  if (!shown) return null;
  return (
    <div class={`sheet-wrap ${open ? "in" : "out"}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${full ? "full" : ""}`} role="dialog" aria-modal="true">
        <div class="sheet-grip" />
        {title && (
          <div class="sheet-head">
            <h2>{title}</h2>
            <button class="icon-btn" onClick={onClose} aria-label={t("close")}><Icon name="close" /></button>
          </div>
        )}
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, small }: { value: T; options: { v: T; label: ComponentChildren }[]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div class={`seg ${small ? "small" : ""}`} role="tablist">
      {options.map((o) => (
        <button role="tab" aria-selected={o.v === value} class={o.v === value ? "on" : ""} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

export const Spinner = ({ small }: { small?: boolean }) => <span class={`spinner ${small ? "small" : ""}`} aria-label={t("loading")} />;

export function Loading() {
  return <div class="center-box"><Spinner /></div>;
}

export function Empty({ icon = "info", text, children }: { icon?: IconName; text: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty-icon"><Icon name={icon} size={28} /></div>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function errorText(e: unknown): string {
  if (e instanceof AuthError) return e.code === "expired" ? t("expired") : e.code === "bad_login" ? t("badLogin") : t("errorGeneric", { e: e.message });
  if (e instanceof NetError && e.code === "offline") return t("offline");
  return t("errorGeneric", { e: (e as Error)?.message ?? String(e) });
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div class="error-box">
      <Icon name="alert" />
      <span class="grow">{errorText(error)}</span>
      {onRetry && <button class="btn small ghost" onClick={onRetry}>{t("retry")}</button>}
    </div>
  );
}

export function Section({ title, action, children }: { title?: ComponentChildren; action?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="section">
      {(title || action) && <div class="section-head"><h3>{title}</h3>{action}</div>}
      {children}
    </section>
  );
}

export function Row({ icon, title, sub, right, onClick, chevron, accent }: {
  icon?: IconName; title: ComponentChildren; sub?: ComponentChildren; right?: ComponentChildren; onClick?: () => void; chevron?: boolean; accent?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag class={`row ${onClick ? "tap" : ""}`} onClick={onClick}>
      {icon && <span class="row-icon" style={accent ? { color: accent, background: `${accent}1f` } : undefined}><Icon name={icon} size={20} /></span>}
      <span class="row-main">
        <span class="row-title">{title}</span>
        {sub && <span class="row-sub">{sub}</span>}
      </span>
      {right}
      {chevron && <Icon name="chev" size={18} class="muted" />}
    </Tag>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label class="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span />
    </label>
  );
}

/** Stable pleasant colour per subject abbreviation (same in every view, public or logged-in). */
export function subjectColor(key: string): string {
  let h = 0;
  for (const c of key.toUpperCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 62% 52%)`;
}

export function Updated({ at, loading, onRefresh }: { at?: number; loading?: boolean; onRefresh: () => void }) {
  return (
    <button class="updated" onClick={onRefresh} disabled={loading}>
      {loading ? <Spinner small /> : <Icon name="refresh" size={15} />}
      {at ? t("updatedAt", { t: new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : t("loading")}
    </button>
  );
}

/** Pull-to-refresh for touch screens. */
export function usePullToRefresh(onRefresh: () => void) {
  const start = useRef<number | null>(null);
  useEffect(() => {
    const down = (e: TouchEvent) => { start.current = window.scrollY <= 0 ? e.touches[0].clientY : null; };
    const up = (e: TouchEvent) => {
      if (start.current !== null && e.changedTouches[0].clientY - start.current > 110) onRefresh();
      start.current = null;
    };
    addEventListener("touchstart", down, { passive: true });
    addEventListener("touchend", up, { passive: true });
    return () => { removeEventListener("touchstart", down); removeEventListener("touchend", up); };
  }, [onRefresh]);
}
