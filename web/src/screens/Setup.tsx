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
import { clearCache, expired, patchSettings, readCache, settings, user, writeCache } from "../lib/store";
import type { Target } from "../lib/model";
import { Icon } from "../ui/icons";
import { errorText, IosInstall, Page, Row, Section, Segmented, Sheet, Spinner, Switch } from "../ui/kit";
import { go, route, useBack } from "../ui/router";
import { TargetPicker } from "../ui/picker";

const REPO = "https://github.com/Filipeno/bakalar-plus";
declare const __APP_VERSION__: string;

// ---------------- onboarding ----------------

export function Welcome() {
  // "Change school" starts at the picker; reopened mid-setup with a school already picked: continue at the login step.
  const picked = settings.value.school?.url;
  const [step, setStep] = useState<"hello" | "school" | "login" | "class">(route.value.q.step === "school" ? "school" : picked ? "login" : "hello");
  const [dir, setDir] = useState<Directory | null>(() => (picked ? readCache<Directory>(`dir:${picked}`)?.v ?? null : null));
  const prev = { hello: "hello", school: "hello", login: "school", class: "login" } as const;
  useBack(step !== "hello", () => setStep(prev[step]), step);

  const finish = () => { patchSettings({ onboarded: true }); go("/today", undefined, true); };

  if (step === "hello") {
    return (
      <div class="welcome">
        <div class="welcome-art" aria-hidden="true">
          <div class="wa-card a"><i /><i /><i /></div>
          <div class="wa-card b"><i /><i /><i /></div>
          <div class="wa-card c"><i /><i /></div>
        </div>
        <h1>{t("appName")}</h1>
        <h2>{t("welcomeTitle")}</h2>
        <p>{t("welcomeText")}</p>
        <div class="welcome-lang">
          <Segmented small value={settings.value.lang} onChange={(v) => patchSettings({ lang: v })}
            options={[{ v: "auto", label: "Auto" }, { v: "cs", label: "Čeština" }, { v: "en", label: "English" }]} />
        </div>
        <IosInstall />
        <button class="btn block big" onClick={() => setStep("school")}>{t("start")}</button>
      </div>
    );
  }
  if (step === "school") {
    return (
      <Page title={t("pickSchool")}>
        <SchoolPicker onPicked={(d) => { setDir(d); setStep("login"); }} />
      </Page>
    );
  }
  if (step === "login") {
    return (
      <Page title={t("loginTitle")} sub={settings.value.school?.name}>
        <LoginForm onDone={finish} />
        <button class="btn block ghost" onClick={() => (dir ? setStep("class") : finish())}>{t("skipLogin")}</button>
      </Page>
    );
  }
  return (
    <Page title={t("pickClass")} sub={t("pickClassHint")}>
      <div class="class-grid">
        {dir?.classes.map((c) => (
          <button class="class-chip" onClick={() => { patchSettings({ myTarget: c }); finish(); }}>{c.name}</button>
        ))}
      </div>
    </Page>
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
        {err && <p class="error-text">{err}</p>}
        <button class="btn block" disabled={busy}>{busy ? <Spinner small /> : t("continue")}</button>
        <button type="button" class="btn block ghost" onClick={() => setManual(false)}>{t("back")}</button>
      </form>
    );
  }

  if (town) {
    const list = (schools ?? []).filter((s) => !filter || fold(s.name).includes(fold(filter)));
    return (
      <>
        <button class="link back-link" onClick={() => setTown(null)}><Icon name="back" size={16} />{t("schoolsIn", { town })}</button>
        {(schools?.length ?? 0) > 8 && (
          <div class="search-box"><Icon name="search" size={18} /><input type="search" value={filter} placeholder={t("search")} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} /></div>
        )}
        {!schools && !err && <div class="center-box"><Spinner /></div>}
        {busy && <div class="center-box"><Spinner /> <span class="muted">{t("checking")}</span></div>}
        {err && <p class="error-text">{err}</p>}
        <div class="card-list">
          {list.map((s) => <Row title={s.name} sub={s.url.replace(/^https:\/\//, "")} chevron onClick={() => !busy && choose(s.name, s.url)} />)}
        </div>
      </>
    );
  }

  return (
    <>
      <div class="search-box big">
        <Icon name="search" size={20} />
        <input type="search" autoFocus placeholder={t("townSearch")} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      {err && <p class="error-text">{err}</p>}
      <div class="card-list">
        {towns.map((tw) => <Row icon="pin" title={tw.name} right={<span class="muted small">{tw.count}</span>} chevron onClick={() => openTown(tw.name)} />)}
      </div>
      <button class="btn block ghost" onClick={() => setManual(true)}>{t("manualUrl")}</button>
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
      <p class="hint">{t("loginText")}</p>
      {!isAndroid && school && usesRelay(school) && <p class="banner soft">{t("loginRelayNote")}</p>}
      {!isAndroid && <p class="hint">{t("loginPushNote")}</p>}
      <label>{t("username")}<input autoComplete="username" autoCapitalize="off" autoCorrect="off" required value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} /></label>
      <label>{t("password")}<input type="password" autoComplete="current-password" required value={p} onInput={(e) => setP((e.target as HTMLInputElement).value)} /></label>
      {err && <p class="error-text">{err}</p>}
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
      <Section title={t("school")}>
        <div class="card-list">
          <Row icon="home" title={s.school?.name ?? "—"} sub={s.school?.url.replace(/^https:\/\//, "")}
            right={<button class="btn small ghost" onClick={() => { patchSettings({ onboarded: false }); go("/welcome", { step: "school" }, true); }}>{t("changeSchool")}</button>} />
        </div>
      </Section>

      <Section title={t("account")}>
        <div class="card-list">
          {user.value ? (
            <Row icon="user" title={user.value.name} sub={[user.value.classAbbrev, user.value.schoolName].filter(Boolean).join(" · ")}
              right={<button class="btn small ghost" onClick={logout}><Icon name="logout" size={16} />{t("logout")}</button>} />
          ) : (
            <Row icon="user" title={t("loginAction")} chevron onClick={() => go("/login")} />
          )}
          {user.value && <DeleteDataRow onDone={logout} />}
          {!user.value && s.publicOk && (
            <Row icon="users" title={t("myClass")} sub={s.myTarget?.name ?? "—"} chevron onClick={() => setPicker(true)} />
          )}
        </div>
      </Section>

      {!isAndroid && <WebPush />}
      {isAndroid && <Section title={t("notifications")}>
        <div class="card-list">
          <SwitchRow label={t("notifyChanges")} v={s.notify.changes} on={(v) => setNotify({ changes: v })} />
          {user.value && <SwitchRow label={t("notifyGrades")} v={s.notify.grades} on={(v) => setNotify({ grades: v })} />}
          {user.value && <SwitchRow label={t("notifyHomework")} v={s.notify.homework} on={(v) => setNotify({ homework: v })} />}
          {user.value && <SwitchRow label={t("notifyMessages")} v={s.notify.messages} on={(v) => setNotify({ messages: v })} />}
          <SwitchRow label={t("notifyEvening")} v={s.notify.evening} on={(v) => setNotify({ evening: v })} />
          {s.notify.evening && (
            <div class="row">
              <span class="row-main"><span class="row-title">{t("eveningAt")}</span></span>
              <select value={s.notify.eveningHour} onChange={(e) => setNotify({ eveningHour: +(e.target as HTMLSelectElement).value })}>
                {[16, 17, 18, 19, 20, 21].map((h) => <option value={h}>{h}:00</option>)}
              </select>
            </div>
          )}
        </div>
        <p class="hint">{t("widgetInfo")}</p>
      </Section>}

      <Section title={t("language")}>
        <Segmented value={s.lang} onChange={(v) => patchSettings({ lang: v })} options={[{ v: "auto", label: "Auto" }, { v: "cs", label: "Čeština" }, { v: "en", label: "English" }]} />
      </Section>
      <Section title={t("appearance")}>
        <Segmented value={s.theme} onChange={(v) => patchSettings({ theme: v })} options={[{ v: "auto", label: t("themeAuto") }, { v: "light", label: t("themeLight") }, { v: "dark", label: t("themeDark") }]} />
      </Section>

      <Section title={t("about")}>
        <div class="card-list">
          <Row icon="github" title={t("sourceCode")} chevron onClick={() => (native ? native.sync("openUrl", { url: REPO }) : open(REPO, "_blank"))} />
          {isAndroid && (update.value
            ? <Row icon="refresh" title={t("updateAvail", { v: update.value.latest })} onClick={() => updating.value !== "busy" && installUpdate()}
                right={<span class="link">{updating.value === "busy" ? t("updateBusy") : updating.value === "permission" ? t("updateAllowShort") : updating.value === "error" ? t("updateFail") : t("updateNow")}</span>} />
            : <Row icon="refresh" title={t("updateCheck")} onClick={async () => { setUpd(t("checking")); const i = await checkForUpdate(true); setUpd(i ? (i.newer ? "" : t("updateLatest")) : t("offline")); }} right={upd && <span class="muted small">{upd}</span>} />)}
          <Row icon="trash" title={t("clearCache")} onClick={() => { clearCache(); setMsg(t("cacheCleared")); }} right={msg && <span class="muted small">{msg}</span>} />
        </div>
        <p class="hint">{t("privacy")}</p>
        <p class="hint center">{t("appName")} · {t("version", { v: __APP_VERSION__ })}</p>
      </Section>
      <TargetPicker open={picker} onClose={() => setPicker(false)} kinds={["class"]} title={t("myClass")}
        onPick={(x) => x !== "my" && patchSettings({ myTarget: x as Target })} />
    </Page>
  );
}

function SwitchRow({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div class="row">
      <span class="row-main"><span class="row-title">{label}</span></span>
      <Switch checked={v} onChange={on} label={label} />
    </div>
  );
}

// ---------------- web push (iPhone PWA / desktop) ----------------

function WebPush() {
  const school = settings.value.school?.url ?? "";
  const [st, setSt] = useState<{ registered: boolean; status?: string; prefs?: push.PushPrefs } | null>(push.saved() ? { registered: true } : { registered: false });
  const [form, setForm] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [prefs, setPrefs] = useState<push.PushPrefs>({ grades: true, changes: true });
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
      await push.enablePush(school, u.trim(), p, prefs);     // asks for permission first, inside this gesture
      setP(""); setForm(false);
      setSt({ registered: true, status: "active", prefs });
    } catch (err) {
      const c = (err as push.PushError).code;
      setMsg(c === "denied" ? t("pushDenied") : c === "bad_login" ? t("badLogin") : t("pushFailed", { e: c ?? (err as Error).message }));
    }
    setBusy(false);
  };
  const changePrefs = (x: Partial<push.PushPrefs>) => { const n = { ...prefs, ...x }; setPrefs(n); if (st?.registered) push.setPushPrefs(n); };

  return (
    <Section title={t("pushTitle")}>
      {!push.pushSupported() && !iosNeedsInstall && <p class="hint">{t("pushUnsupported")}</p>}
      {iosNeedsInstall && <p class="banner soft">{t("pushIosHint")}</p>}
      {blocked && <p class="banner warn">{t("pushDenied")}</p>}
      {st?.status === "relogin" && <p class="banner warn">{t("pushRelogin")}</p>}
      {push.pushSupported() && !iosNeedsInstall && (
        <div class="card-list">
          <SwitchRow label={t("notifyChanges")} v={prefs.changes} on={(v) => changePrefs({ changes: v })} />
          {user.value && <SwitchRow label={t("notifyGrades")} v={prefs.grades} on={(v) => changePrefs({ grades: v })} />}
          {st?.registered && st.status !== "relogin" ? (
            <>
              <Row icon="bell" title={t("pushActive")} right={<button class="btn small ghost" onClick={async () => { await push.disablePush(); setSt({ registered: false }); }}>{t("pushOff")}</button>} />
              <Row icon="check" title={t("pushTest")} onClick={async () => setMsg(t("pushTestSent", { n: await push.sendTestPush() }))} />
            </>
          ) : user.value ? (
            <Row icon="bell" title={t("pushOn")} chevron onClick={() => setForm(true)} />
          ) : (
            <Row icon="user" title={t("loginNeeded")} chevron onClick={() => go("/login")} />
          )}
        </div>
      )}
      {msg && <p class="hint">{msg}</p>}
      <Sheet open={form} onClose={() => setForm(false)} title={t("pushOn")}>
        <form class="form" onSubmit={enable}>
          <p class="hint">{t("pushServerNote")}</p>
          <p class="hint"><b>{t("pushLoginAgain")}</b></p>
          <label>{t("username")}<input autoComplete="username" autoCapitalize="off" autoCorrect="off" required value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} /></label>
          <label>{t("password")}<input type="password" autoComplete="current-password" required value={p} onInput={(e) => setP((e.target as HTMLInputElement).value)} /></label>
          {msg && <p class="error-text">{msg}</p>}
          <button class="btn block" disabled={busy}>{busy ? <Spinner small /> : t("pushOn")}</button>
        </form>
      </Sheet>
    </Section>
  );
}

function DeleteDataRow({ onDone }: { onDone: () => Promise<void> | void }) {
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
    <Row icon="trash" accent="#ef4444" title={sure ? t("deleteDataSure") : t("deleteData")} sub={msg || t("deleteDataHint")} onClick={run} />
  );
}
