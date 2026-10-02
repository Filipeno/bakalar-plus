import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon, type IconName } from "./icons";
import { back, pushCloser, route } from "./router";
import { wide as isWide } from "./layout";

const SIDEBAR = ["/today", "/timetable", "/grades", "/calendar", "/homework", "/messages", "/absence", "/where", "/compare", "/rooms", "/teachers", "/extras", "/settings", "/customize", "/more"];
import { t, type TKey } from "../lib/i18n";
import { online } from "../lib/store";
import { AuthError } from "../lib/bakalari";
import { NetError } from "../lib/net";
import { iosBrowser, isIos, isStandalone } from "../lib/push";
import { installUpdate, update, updating } from "../lib/update";

/**
 * A screen: sticky header (sub-line above the title), banners, content.
 * Android: back caret · title · actions in one row. iPhone: "‹ Back" and actions above a large title (see styles.css).
 */
export function Page({ title, sub, backable, actions, children, wide, smallTitle }: {
  title: ComponentChildren; sub?: ComponentChildren; backable?: boolean; actions?: ComponentChildren; children: ComponentChildren; wide?: boolean; smallTitle?: boolean;
}) {
  // Desktop: everything in the sidebar is a top-level destination, so no back button there.
  if (backable && isWide.value && SIDEBAR.includes(route.value.path)) backable = false;
  return (
    <div class={`page ${wide ? "wide" : ""}`}>
      <header class={`topbar ${smallTitle ? "small-title" : ""} ${backable || actions ? "" : "no-nav"}`}>
        {backable && (
          <button class="topbar-back" onClick={back} aria-label={t("back")}>
            <Icon name="caret-left" size={22} /><span>{t("back")}</span>
          </button>
        )}
        <div class="topbar-text">
          {sub && <div class="topbar-sub">{sub}</div>}
          <h1>{title}</h1>
        </div>
        <div class="topbar-actions">{actions}</div>
      </header>
      {!online.value && <div class="banner"><Icon name="wifi-slash" size={16} />{t("offline")}</div>}
      {update.value && (
        <div class="banner accent">
          <span class="grow">{updating.value === "permission" ? t("updateAllow") : updating.value === "error" ? t("updateFail") : t("updateAvail", { v: update.value.latest })}</span>
          <button class="btn small" disabled={updating.value === "busy"} onClick={installUpdate}>{updating.value === "busy" ? t("updateBusy") : t("updateNow")}</button>
        </div>
      )}
      <main class="content">{children}</main>
    </div>
  );
}

/** Bottom sheet. Registers with the Android back button while open. */
export function Sheet({ open, onClose, title, sub, children, full, closeButton = true }: {
  open: boolean; onClose: () => void; title?: ComponentChildren; sub?: ComponentChildren; children: ComponentChildren; full?: boolean; closeButton?: boolean;
}) {
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
            <h3>{title}</h3>
            {closeButton && <button class="icon-btn" onClick={onClose} aria-label={t("close")}><Icon name="x" size={20} /></button>}
          </div>
        )}
        {sub && <div class="sheet-sub">{sub}</div>}
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, small, fit }: {
  value: T; options: { v: T; label: ComponentChildren }[]; onChange: (v: T) => void; small?: boolean; fit?: boolean;
}) {
  return (
    <div class={`seg ${small ? "small" : ""} ${fit ? "fit" : ""}`} role="tablist">
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

export function Empty({ icon = "info", text, children, small }: { icon?: IconName; text: ComponentChildren; children?: ComponentChildren; small?: boolean }) {
  return (
    <div class={`empty ${small ? "small" : ""}`}>
      {!small && <Icon name={icon} size={40} />}
      <p>{text}</p>
      {children}
    </div>
  );
}

export function errorText(e: unknown): string {
  if (e instanceof AuthError && e.code === "offline") return t(navigator.onLine ? "unreachable" : "offline");
  if (e instanceof AuthError) return e.code === "expired" ? t("expired") : e.code === "bad_login" ? t("badLogin") : t("errorGeneric", { e: e.message });
  if (e instanceof NetError && e.code === "offline") return t("offline");
  if (e instanceof NetError && e.code === "unreachable") return t("unreachable");
  return t("errorGeneric", { e: (e as Error)?.message ?? String(e) });
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div class="error-box">
      <Icon name="warning" size={20} />
      <span class="grow">{errorText(error)}</span>
      {onRetry && <button class="btn small ghost" onClick={onRetry}>{t("retry")}</button>}
    </div>
  );
}

/** Small uppercase label with an optional link on the right, then the content. */
export function Section({ title, action, children }: { title?: ComponentChildren; action?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="section">
      {(title || action) && <div class="section-head"><span class="label">{title}</span>{action}</div>}
      {children}
    </section>
  );
}

export function SectionLink({ label, onClick }: { label: ComponentChildren; onClick: () => void }) {
  return <button class="link" onClick={onClick}>{label}</button>;
}

export function Row({ icon, iconColor, iconFill, title, sub, right, badge, onClick, chevron, big, class: cls }: {
  icon?: IconName; iconColor?: string; iconFill?: boolean; title: ComponentChildren; sub?: ComponentChildren; right?: ComponentChildren; badge?: ComponentChildren;
  onClick?: () => void; chevron?: boolean; big?: boolean; class?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag class={`row ${big ? "big" : ""} ${cls ?? ""}`} onClick={onClick}>
      {icon && <span class="row-icon" style={iconColor ? { color: iconColor } : undefined}><Icon name={icon} size={big ? 22 : 20} fill={iconFill} /></span>}
      <span class="row-main">
        <span class="row-title">{title}</span>
        {sub && <span class="row-sub">{sub}</span>}
      </span>
      {badge && <span class="row-badge">{badge}</span>}
      {right}
      {chevron && <Icon name="caret-right" size={16} class="chev" />}
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

export function SwitchRow({ label, v, on, sub }: { label: string; v: boolean; on: (v: boolean) => void; sub?: ComponentChildren }) {
  return (
    <div class="row">
      <span class="row-main"><span class="row-title">{label}</span>{sub && <span class="row-sub">{sub}</span>}</span>
      <Switch checked={v} onChange={on} label={label} />
    </div>
  );
}

/** Stable colour per subject abbreviation (same in every view, public or logged-in). Lightness follows the theme. */
export function subjectColor(key: string): string {
  let h = 0;
  for (const c of key.toUpperCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `oklch(var(--subj-l) .11 ${h % 360})`;
}

export function Updated({ at, loading, onRefresh }: { at?: number; loading?: boolean; onRefresh: () => void }) {
  return (
    <button class="updated" onClick={onRefresh} disabled={loading}>
      {loading ? <Spinner small /> : <Icon name="arrows-clockwise" size={14} />}
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

/** iPhone only, in a browser tab (not the installed app): how to add the page to the home screen. */
export function IosInstall({ dismissible }: { dismissible?: boolean }) {
  const [hidden, setHidden] = useState(() => !!dismissible && localStorage.getItem("bp.iosTip") === "1");
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!isIos() || isStandalone() || hidden) return null;
  const br = iosBrowser();
  const copy = () => navigator.clipboard?.writeText(location.origin).then(() => setCopied(true)).catch(() => {});
  const steps = (br === "safari" ? ["iosS2", "iosS3", "iosS4", "iosS5"] : ["iosS1", "iosS2", "iosS3", "iosS4", "iosS5"]) as TKey[];
  return (
    <div class="install-card">
      <div class="ic-head"><Icon name="export" size={20} />{t("iosTitle")}</div>
      {br !== "safari" && <p class="hint" style={{ marginTop: "8px", color: "var(--wn)" }}>{t(br === "inapp" ? "iosInApp" : "iosOther")}</p>}
      <ol>{(more ? steps : (["iosQ1", "iosQ2", "iosQ3"] as TKey[])).map((k) => <li>{t(k)}</li>)}</ol>
      <p class="hint" style={{ marginTop: "8px" }}>{more ? `${t("iosWhy")} ${t("iosSeparate")}` : t("iosQPush")}</p>
      <div class="ic-foot">
        {br !== "safari" && <button class="btn small" onClick={copy}><Icon name="copy" size={16} />{copied ? t("iosCopied") : t("iosCopy")}</button>}
        {!more && <button class="link" onClick={() => setMore(true)}>{t("iosMore")}</button>}
        {dismissible && <button class="link" style={{ marginLeft: "auto", color: "var(--mu)" }} onClick={() => { localStorage.setItem("bp.iosTip", "1"); setHidden(true); }}>{t("iosLater")}</button>}
      </div>
    </div>
  );
}

/** "Sign in" empty state for login-only screens. */
export function NeedLogin({ onLogin }: { onLogin: () => void }) {
  return (
    <div class="empty">
      <Icon name="lock-key" size={40} />
      <p>{t("loginNeeded")}</p>
      <button class="btn" onClick={onLogin}>{t("loginAction")}</button>
    </div>
  );
}
