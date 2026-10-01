import { useEffect, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { fold, normalizeSchoolUrl, schoolsIn, searchTowns, type School } from "../lib/schools";
import { fetchDirectory, PublicDisabled, type Directory } from "../lib/public";
import * as bk from "../lib/bakalari";
import { http, usesRelay } from "../lib/net";
import { native, isAndroid } from "../lib/native";
import { forgetCloud } from "../lib/cloud";
import * as push from "../lib/push";
import { checkForUpdate, installUpdate, update, updating } from "../lib/update";
import { clearCache, expired, patchSettings, readCache, schoolName, settings, user, writeCache } from "../lib/store";
import type { Target } from "../lib/model";
import { Icon } from "../ui/icons";
import { errorText, IosInstall, Page, Row, Section, Segmented, Sheet, Spinner, SwitchRow } from "../ui/kit";
import { go, route, useBack } from "../ui/router";
import { TargetPicker } from "../ui/picker";
import { ACCENTS, MAX_TABS, patchPrefs, prefs, SECTIONS, type CardKey } from "../ui/prefs";
import { available, SECTION_META, tabSections } from "../ui/sections";
import type { TKey } from "../lib/i18n";

const REPO = "https://github.com/Filipeno/bakalar-plus";
declare const __APP_VERSION__: string;

// ---------------- onboarding ----------------

function StepBack({ onClick }: { onClick: () => void }) {
  return <button class="welcome-back" onClick={onClick} aria-label={t("back")}><Icon name="caret-left" size={22} /><span>{t("back")}</span></button>;
}

export function Welcome() {
  // "Change school" starts at the picker; reopened mid-setup with a school already picked: continue at the login step.
  const picked = settings.value.school?.url;
  const [step, setStep] = useState<"hello" | "school" | "login" | "class">(route.value.q.step === "school" ? "school" : picked ? "login" : "hello");
  const [dir, setDir] = useState<Directory | null>(() => (picked ? readCache<Directory>(`dir:${picked}`)?.v ?? null : null));
  const [cls, setCls] = useState<Target | null>(settings.value.myTarget);
  const prev = { hello: "hello", school: "hello", login: "school", class: "login" } as const;
  useBack(step !== "hello", () => setStep(prev[step]), step);

  const finish = () => { patchSettings({ onboarded: true }); go("/today", undefined, true); };

  if (step === "hello") {
    return (
      <div class="welcome">
        <div class="welcome-hero">
          <div class="logo" aria-hidden="true">B+</div>
          <h1>{t("welcomeTitle")}</h1>
          <p class="lead">{t("welcomeText")}</p>
          <Segmented small fit value={settings.value.lang} onChange={(v) => patchSettings({ lang: v })}
            options={[{ v: "auto", label: "Auto" }, { v: "cs", label: "Čeština" }, { v: "en", label: "English" }]} />
          <IosInstall />
          <button class="btn block" style={{ marginTop: "12px" }} onClick={() => setStep("school")}>{t("start")}</button>
          <div class="fine">{t("unofficial")}</div>
        </div>
      </div>
    );
  }
  if (step === "school") {
    return (
      <div class="welcome">
        <StepBack onClick={() => setStep("hello")} />
        <h2>{t("pickSchool")}</h2>
        <p class="sub">{t("pickSchoolSub")}</p>
        <SchoolPicker onPicked={(d) => { setDir(d); setStep("login"); }} />
      </div>
    );
  }
  if (step === "login") {
    return (
      <div class="welcome">
        <StepBack onClick={() => setStep("school")} />
        <h2>{t("loginTitle")}</h2>
        <p class="sub">{settings.value.school?.name}</p>
        <LoginForm onDone={finish} />
        <button class="btn block ghost" style={{ marginTop: "8px" }} onClick={() => (dir ? setStep("class") : finish())}>{t("skipLogin")}</button>
      </div>
    );
  }
  return (
    <div class="welcome">
      <StepBack onClick={() => setStep("login")} />
      <h2>{t("pickClass")}</h2>
      <p class="sub">{t("pickClassHint")}</p>
      <div class="chips">
        {dir?.classes.map((c) => (
          <button class={`chip big ${cls?.id === c.id ? "on" : ""}`} onClick={() => setCls(c)}>{c.name}</button>
        ))}
      </div>
      <button class="btn block" style={{ marginTop: "24px" }} disabled={!cls} onClick={() => { patchSettings({ myTarget: cls }); finish(); }}>{t("done")}</button>
    </div>
  );
}

function SchoolPicker({ onPicked }: { onPicked: (dir: Directory | null) => void }) {
  const [q, setQ] = useState("");
  const [towns, setTowns] = useState<{ name: string; count: number }[]>([]);
  const [town, setTown] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[] | null>(null);
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useBack(manual || !!town, () => { setErr(""); if (manual) setManual(false); else setTown(null); }, `${manual}|${town}`);

  useEffect(() => {
    if (!q.trim()) { setTowns([]); return; }
    const id = setTimeout(() => searchTowns(q).then(setTowns).catch((e) => setErr(errorText(e))), 200);
    return () => clearTimeout(id);
  }, [q]);

  const openTown = async (name: string) => {
    setTown(name); setSchools(null); setErr("");
    try { setSchools(await schoolsIn(name)); } catch (e) { setErr(errorText(e)); }
  };

  const choose = async (name: string, rawUrl: string) => {
    setBusy(true); setErr("");
    try {
      const u = normalizeSchoolUrl(rawUrl);
      const r = await http({ url: `${u}/api`, headers: { Accept: "application/json" } });
      if (r.status !== 200 || !/ApiVersion/i.test(r.text)) throw new Error("not-bakalari");
      let dir: Directory | null = null;
      try { dir = await fetchDirectory(u); writeCache(`dir:${u}`, dir); } catch (e) { if (!(e instanceof PublicDisabled)) throw e; }
      if (settings.value.school?.url !== u) { await bk.logout().catch(() => {}); user.value = null; forgetCloud(); }
      patchSettings({ school: { url: u, name }, publicOk: !!dir, myTarget: null, favourites: [], compare: [] });
      onPicked(dir);
    } catch (e) { setErr((e as Error).message === "not-bakalari" ? t("schoolNotFound") : errorText(e)); }
    setBusy(false);
  };

  if (manual) {
    return (
      <form class="form" onSubmit={(e) => { e.preventDefault(); url && choose(new URL(normalizeSchoolUrl(url)).host, url); }}>
        <label>{t("schoolUrl")}<input inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="bakalari.skola.cz" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} /></label>
        <p class="hint">{t("schoolUrlHint")}</p>
        {err && <p class="hint err-text">{err}</p>}
        <button class="btn block" disabled={busy}>{busy ? <Spinner small /> : t("continue")}</button>
        <button type="button" class="btn block ghost" onClick={() => setManual(false)}>{t("back")}</button>
      </form>
    );
  }

  if (town) {
    const list = (schools ?? []).filter((s) => !filter || fold(s.name).includes(fold(filter)));
    return (
      <>
        <button class="link" style={{ marginBottom: "10px" }} onClick={() => setTown(null)}><Icon name="caret-left" size={14} />{t("schoolsIn", { town })}</button>
        {(schools?.length ?? 0) > 8 && (
          <div class="search"><Icon name="magnifying-glass" size={18} /><input type="search" value={filter} placeholder={t("search")} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} /></div>
        )}
        {!schools && !err && <div class="center-box"><Spinner /></div>}
        {busy && <div class="center-box"><Spinner /> <span class="hint">{t("checking")}</span></div>}
        {err && <p class="hint err-text">{err}</p>}
        <div class="pick-list">
          {list.map((s) => (
            <button class={`pick ${settings.value.school?.url === normalizeSchoolUrl(s.url) ? "on" : ""}`} onClick={() => !busy && choose(s.name, s.url)}>
              <span class="grow"><b>{s.name}</b><small>{s.url.replace(/^https:\/\//, "")}</small></span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div class="search">
        <Icon name="magnifying-glass" size={18} />
        <input type="search" autoFocus placeholder={t("townSearch")} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      {err && <p class="hint err-text" style={{ marginTop: "8px" }}>{err}</p>}
      <div class="pick-list">
        {towns.map((tw) => (
          <button class="pick" onClick={() => openTown(tw.name)}>
            <Icon name="map-pin" size={18} />
            <span class="grow"><b>{tw.name}</b></span>
            <small>{tw.count}</small>
            <Icon name="caret-right" size={16} />
          </button>
        ))}
        {q.trim().length > 1 && !towns.length && !err && <p class="hint">{t("noSchoolsFound")}</p>}
      </div>
      <button class="btn block ghost" style={{ marginTop: "10px" }} onClick={() => setManual(true)}>{t("manualUrl")}</button>
    </>
  );
}

export function LoginForm({ onDone }: { onDone: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const school = settings.value.school?.url ?? "";

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await bk.login(school, u.trim(), p);
      user.value = await bk.getUser();
      expired.value = false;
      setP("");
      onDone();
    } catch (e2) { setErr(errorText(e2)); }
    setBusy(false);
  };

  return (
    <form class="form" onSubmit={submit}>
      <input autoComplete="username" autoCapitalize="off" autoCorrect="off" required placeholder={t("username")} aria-label={t("username")}
        value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} />
      <input type="password" autoComplete="current-password" required placeholder={t("password")} aria-label={t("password")}
        value={p} onInput={(e) => setP((e.target as HTMLInputElement).value)} />
      <div class="lock-note" style={{ margin: "4px 0" }}>
        <Icon name="lock-key" size={18} />
        <span>
          {t("loginText")}
          {!isAndroid && school && usesRelay(school) && <><br />{t("loginRelayNote")}</>}
          {!isAndroid && <><br />{t("loginPushNote")}</>}
        </span>
      </div>
      {err && <p class="hint err-text">{err}</p>}
      <button class="btn block" disabled={busy}>{busy ? <Spinner small /> : t("signIn")}</button>
    </form>
  );
}

export function Login() {
  return (
    <Page title={t("loginTitle")} sub={settings.value.school?.name} backable>
      <LoginForm onDone={() => go("/today", undefined, true)} />
    </Page>
  );
}

// ---------------- settings ----------------

export function Settings() {
  const s = settings.value;
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState("");
  const [upd, setUpd] = useState("");
  const setNotify = async (p: Partial<typeof s.notify>) => {
    if (native && Object.values(p).some((v) => v === true)) await native.call("ensureNotifications").catch(() => {});
    patchSettings({ notify: { ...s.notify, ...p } });
  };
  const logout = async () => {
    await bk.logout().catch(() => {});
    user.value = null;
    forgetCloud();
    clearCache();
  };

  return (
    <Page title={t("settings")} backable>
      <Section title={t("appearance")}>
        <div class="stack">
          <div class="row">
            <span class="row-main"><span class="row-title">{t("language")}</span></span>
            <Segmented small value={s.lang} onChange={(v) => patchSettings({ lang: v })} options={[{ v: "auto", label: "Auto" }, { v: "cs", label: "CS" }, { v: "en", label: "EN" }]} />
          </div>
          <div class="row" style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
            <span class="row-title">{t("themeLabel")}</span>
            <Segmented value={s.theme} onChange={(v) => patchSettings({ theme: v })} options={[{ v: "auto", label: t("themeAuto") }, { v: "dark", label: t("themeDark") }, { v: "light", label: t("themeLight") }]} />
          </div>
          <Row big icon="sliders-horizontal" title={t("customize")} sub={t("customizeSub")} chevron onClick={() => go("/customize")} />
        </div>
      </Section>

      {!isAndroid && <WebPush />}
      {isAndroid && <Section title={t("notifications")}>
        <div class="stack">
          <SwitchRow label={t("notifyChanges")} v={s.notify.changes} on={(v) => setNotify({ changes: v })} />
          {user.value && <SwitchRow label={t("notifyGrades")} v={s.notify.grades} on={(v) => setNotify({ grades: v })} />}
          {user.value && <SwitchRow label={t("notifyHomework")} v={s.notify.homework} on={(v) => setNotify({ homework: v })} />}
          {user.value && <SwitchRow label={t("notifyMessages")} v={s.notify.messages} on={(v) => setNotify({ messages: v })} />}
          <SwitchRow label={t("notifyEvening")} v={s.notify.evening} on={(v) => setNotify({ evening: v })} />
          {s.notify.evening && (
            <div class="row">
              <span class="row-main"><span class="row-title">{t("eveningAt")}</span></span>
              <select class="input" style={{ width: "auto", padding: "6px 10px" }} value={s.notify.eveningHour} onChange={(e) => setNotify({ eveningHour: +(e.target as HTMLSelectElement).value })}>
                {[16, 17, 18, 19, 20, 21].map((h) => <option value={h}>{h}:00</option>)}
              </select>
            </div>
          )}
        </div>
        <p class="hint" style={{ marginTop: "8px" }}>{t("widgetInfo")}</p>
      </Section>}

      <Section title={t("school")}>
        <Row icon="house" title={s.school?.name ?? "—"} sub={s.school?.url.replace(/^https:\/\//, "")}
          right={<button class="btn small line" onClick={() => { patchSettings({ onboarded: false }); go("/welcome", { step: "school" }, true); }}>{t("changeSchool")}</button>} />
      </Section>

      <Section title={t("account")}>
        <div class="stack">
          {user.value ? (
            <div class="card">
              <div style={{ fontSize: "14px", fontWeight: 500 }}>{user.value.name}</div>
              <div class="hint">{[user.value.classAbbrev, schoolName()].filter(Boolean).join(" · ")}</div>
            </div>
          ) : (
            <Row icon="sign-in" title={t("loginAction")} sub={t("unlockHint")} chevron onClick={() => go("/login")} />
          )}
          {!user.value && s.publicOk && (
            <Row icon="users" title={t("myClass")} sub={s.myTarget?.name ?? "—"} chevron onClick={() => setPicker(true)} />
          )}
          {user.value && <button class="btn block line" onClick={logout}><Icon name="sign-out" size={18} />{t("logout")}</button>}
          {user.value && <DeleteData onDone={logout} />}
        </div>
      </Section>

      <Section title={t("about")}>
        <div class="stack">
          <Row icon="github-logo" title={t("sourceCode")} chevron onClick={() => (native ? native.sync("openUrl", { url: REPO }) : open(REPO, "_blank"))} />
          {isAndroid && (update.value
            ? <Row icon="arrows-clockwise" title={t("updateAvail", { v: update.value.latest })} onClick={() => updating.value !== "busy" && installUpdate()}
                right={<span class="link">{updating.value === "busy" ? t("updateBusy") : updating.value === "permission" ? t("updateAllowShort") : updating.value === "error" ? t("updateFail") : t("updateNow")}</span>} />
            : <Row icon="arrows-clockwise" title={t("updateCheck")} onClick={async () => { setUpd(t("checking")); const i = await checkForUpdate(true); setUpd(i ? (i.newer ? "" : t("updateLatest")) : t("offline")); }} right={upd && <span class="hint">{upd}</span>} />)}
          <Row icon="trash" title={t("clearCache")} onClick={() => { clearCache(); setMsg(t("cacheCleared")); }} right={msg && <span class="hint">{msg}</span>} />
        </div>
        <p class="hint" style={{ marginTop: "10px" }}>{t("privacy")}</p>
        <p class="hint">{t("unofficial")}</p>
        <p class="hint center" style={{ marginTop: "10px" }}>{t("appName")} · {t("version", { v: __APP_VERSION__ })}</p>
      </Section>
      <TargetPicker open={picker} onClose={() => setPicker(false)} kinds={["class"]} title={t("myClass")}
        onPick={(x) => x !== "my" && patchSettings({ myTarget: x as Target })} />
    </Page>
  );
}

// ---------------- customize ----------------

export function Customize() {
  const p = prefs.value;
  const av = available();
  const tabs = tabSections();
  const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr], j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
  const toggleTab = (k: (typeof SECTIONS)[number]) => {
    if (p.tabs.includes(k)) { if (p.tabs.length > 1) patchPrefs({ tabs: p.tabs.filter((z) => z !== k) }); }
    else if (p.tabs.length < MAX_TABS) patchPrefs({ tabs: [...p.tabs, k] });
  };
  const CARD_LABEL: Record<CardKey, TKey> = { changes: "cardChanges", hw: "homework", events: "tabCalendar", grades: "newGrades" };

  return (
    <Page title={t("customize")} sub={t("settings")} backable>
      <div class="label">{t("cTabs")}</div>
      <p class="hint" style={{ margin: "4px 0 8px" }}>{t("cTabsSub")}</p>
      <div class="tab-preview" aria-hidden="true">
        {tabs.map((k, i) => <div class={i === 0 ? "on" : ""}><Icon name={SECTION_META[k].icon} size={20} fill={i === 0} /><span>{t(SECTION_META[k].label)}</span></div>)}
        <div><Icon name="dots-three-outline" size={20} /><span>{t("tabMore")}</span></div>
      </div>
      <div class="stack tight">
        {SECTIONS.map((k) => {
          const on = p.tabs.includes(k), i = p.tabs.indexOf(k);
          return (
            <div class="cu-row">
              <button onClick={() => toggleTab(k)} aria-pressed={on} class={on || p.tabs.length < MAX_TABS ? "" : "dim"}>
                <Icon name={SECTION_META[k].icon} size={20} class="sect-icon" />
                <span>{t(SECTION_META[k].label)}{!av.includes(k) && <small class="hint" style={{ display: "block" }}>{k === "where" || k === "compare" ? t("needsPublic") : t("needsLogin")}</small>}</span>
                <Icon name={on ? "check-circle" : "circle"} size={20} fill={on} class="check" />
              </button>
              <button class={`arrow ${on ? "" : "hidden"}`} onClick={() => patchPrefs({ tabs: move(p.tabs, i, -1) })} aria-label={t("moveUp")}><Icon name="arrow-up" size={18} /></button>
              <button class={`arrow ${on ? "" : "hidden"}`} onClick={() => patchPrefs({ tabs: move(p.tabs, i, 1) })} aria-label={t("moveDown")}><Icon name="arrow-down" size={18} /></button>
            </div>
          );
        })}
      </div>

      <div class="label" style={{ margin: "20px 0 8px" }}>{t("cHome")}</div>
      <div class="stack tight">
        {p.cards.map((c, i) => (
          <div class="cu-row">
            <button onClick={() => patchPrefs({ cards: p.cards.map((z, j) => (j === i ? { ...z, on: !z.on } : z)) })} aria-pressed={c.on}>
              <Icon name={c.on ? "check-circle" : "circle"} size={20} fill={c.on} class="check" />
              <span>{t(CARD_LABEL[c.k])}</span>
            </button>
            <button class="arrow" onClick={() => patchPrefs({ cards: move(p.cards, i, -1) })} aria-label={t("moveUp")}><Icon name="arrow-up" size={18} /></button>
            <button class="arrow" onClick={() => patchPrefs({ cards: move(p.cards, i, 1) })} aria-label={t("moveDown")}><Icon name="arrow-down" size={18} /></button>
          </div>
        ))}
      </div>

      <div class="label" style={{ margin: "20px 0 8px" }}>{t("cAccent")}</div>
      <div class="swatches">
        {ACCENTS.map((a) => (
          <button class={`swatch-btn ${p.accent === a.k ? "on" : ""}`} style={{ background: `oklch(var(--subj-l) .13 ${a.h})` }}
            onClick={() => patchPrefs({ accent: a.k })} aria-label={a.k} aria-pressed={p.accent === a.k} />
        ))}
      </div>

      <div class="label" style={{ margin: "20px 0 8px" }}>{t("cDens")}</div>
      <Segmented value={p.density} onChange={(v) => patchPrefs({ density: v })} options={[{ v: "comfort", label: t("densComfort") }, { v: "compact", label: t("densCompact") }]} />

      <div class="label" style={{ margin: "20px 0 8px" }}>{t("cStart")}</div>
      <div class="chips">
        {tabs.map((k) => <button class={`chip ${p.start === k ? "on" : ""}`} onClick={() => patchPrefs({ start: k })}>{t(SECTION_META[k].label)}</button>)}
      </div>
    </Page>
  );
}

// ---------------- web push (iPhone PWA / desktop) ----------------

function WebPush() {
  const school = settings.value.school?.url ?? "";
  const [st, setSt] = useState<{ registered: boolean; status?: string; prefs?: push.PushPrefs } | null>(push.saved() ? { registered: true } : { registered: false });
  const [form, setForm] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [prefs_, setPrefs] = useState<push.PushPrefs>({ grades: true, changes: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    push.prefetchVapid();
    push.pushStatus().then((x) => { if (x) { setSt(x); if (x.prefs) setPrefs(x.prefs); } });
  }, []);

  const iosNeedsInstall = push.isIos() && !push.isStandalone();
  const blocked = typeof Notification !== "undefined" && Notification.permission === "denied";

  const enable = async (e: Event) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      await push.enablePush(school, u.trim(), p, prefs_);     // asks for permission first, inside this gesture
      setP(""); setForm(false);
      setSt({ registered: true, status: "active", prefs: prefs_ });
    } catch (err) {
      const c = (err as push.PushError).code;
      setMsg(c === "denied" ? t("pushDenied") : c === "bad_login" ? t("badLogin") : t("pushFailed", { e: c ?? (err as Error).message }));
    }
    setBusy(false);
  };
  const changePrefs = (x: Partial<push.PushPrefs>) => { const n = { ...prefs_, ...x }; setPrefs(n); if (st?.registered) push.setPushPrefs(n); };

  return (
    <Section title={t("pushTitle")}>
      {!push.pushSupported() && !iosNeedsInstall && <p class="hint">{t("pushUnsupported")}</p>}
      {iosNeedsInstall && <div class="banner accent"><Icon name="export" size={18} /><span class="grow">{t("pushIosHint")}</span></div>}
      {blocked && <div class="banner warn">{t("pushDenied")}</div>}
      {st?.status === "relogin" && <div class="banner warn">{t("pushRelogin")}</div>}
      {push.pushSupported() && !iosNeedsInstall && (
        <div class="stack">
          <SwitchRow label={t("notifyChanges")} v={prefs_.changes} on={(v) => changePrefs({ changes: v })} />
          {user.value && <SwitchRow label={t("notifyGrades")} v={prefs_.grades} on={(v) => changePrefs({ grades: v })} />}
          {st?.registered && st.status !== "relogin" ? (
            <>
              <Row icon="bell" title={t("pushActive")} right={<button class="btn small line" onClick={async () => { await push.disablePush(); setSt({ registered: false }); }}>{t("pushOff")}</button>} />
              <Row icon="check" title={t("pushTest")} onClick={async () => setMsg(t("pushTestSent", { n: await push.sendTestPush() }))} />
            </>
          ) : user.value ? (
            <Row icon="bell" title={t("pushOn")} chevron onClick={() => setForm(true)} />
          ) : (
            <Row icon="sign-in" title={t("loginNeeded")} chevron onClick={() => go("/login")} />
          )}
        </div>
      )}
      {msg && <p class="hint" style={{ marginTop: "8px" }}>{msg}</p>}
      <Sheet open={form} onClose={() => setForm(false)} title={t("pushOn")}>
        <form class="form" onSubmit={enable} style={{ marginTop: "10px" }}>
          <p class="hint">{t("pushServerNote")}</p>
          <p class="hint"><b>{t("pushLoginAgain")}</b></p>
          <input autoComplete="username" autoCapitalize="off" autoCorrect="off" required placeholder={t("username")} aria-label={t("username")} value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} />
          <input type="password" autoComplete="current-password" required placeholder={t("password")} aria-label={t("password")} value={p} onInput={(e) => setP((e.target as HTMLInputElement).value)} />
          {msg && <p class="hint err-text">{msg}</p>}
          <button class="btn block" disabled={busy}>{busy ? <Spinner small /> : t("pushOn")}</button>
        </form>
      </Sheet>
    </Section>
  );
}

function DeleteData({ onDone }: { onDone: () => Promise<void> | void }) {
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    if (!sure) { setSure(true); return; }
    try {
      await push.deleteServerData(settings.value.school?.url ?? "");
      await onDone();
      setMsg(t("deleted"));
    } catch (e) { setMsg(errorText(e)); }
    setSure(false);
  };
  return (
    <>
      <button class="btn block danger" onClick={run}><Icon name="trash" size={18} />{sure ? t("deleteDataSure") : t("deleteData")}</button>
      <p class="hint">{msg || t("deleteDataHint")}</p>
    </>
  );
}
