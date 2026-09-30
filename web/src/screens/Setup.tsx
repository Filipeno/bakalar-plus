import { useEffect, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { fold, normalizeSchoolUrl, schoolsIn, searchTowns, type School } from "../lib/schools";
import { fetchDirectory, PublicDisabled, type Directory } from "../lib/public";
import * as bk from "../lib/bakalari";
import { http, usesRelay } from "../lib/net";
import { native, isAndroid } from "../lib/native";
import { forgetCloud } from "../lib/cloud";
import { clearCache, expired, patchSettings, settings, user, writeCache } from "../lib/store";
import type { Target } from "../lib/model";
import { Icon } from "../ui/icons";
import { errorText, Page, Row, Section, Segmented, Spinner, Switch } from "../ui/kit";
import { go } from "../ui/router";
import { TargetPicker } from "../ui/picker";

const REPO = "https://github.com/Filipeno/bakalar-plus";
declare const __APP_VERSION__: string;

// ---------------- onboarding ----------------

export function Welcome() {
  const [step, setStep] = useState<"hello" | "school" | "login" | "class">("hello");
  const [dir, setDir] = useState<Directory | null>(null);

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
      if (r.status !== 200 || !/ApiVersion/i.test(r.text)) throw new Error(t("schoolUrlHint"));
      let dir: Directory | null = null;
      try { dir = await fetchDirectory(u); writeCache(`dir:${u}`, dir); } catch (e) { if (!(e instanceof PublicDisabled)) throw e; }
      if (settings.value.school?.url !== u) { await bk.logout().catch(() => {}); user.value = null; forgetCloud(); }
      patchSettings({ school: { url: u, name }, publicOk: !!dir, myTarget: null, favourites: [], compare: [] });
      onPicked(dir);
    } catch (e) { setErr(errorText(e)); }
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
            right={<button class="btn small ghost" onClick={() => { patchSettings({ onboarded: false }); go("/welcome", undefined, true); }}>{t("changeSchool")}</button>} />
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
          {!user.value && s.publicOk && (
            <Row icon="users" title={t("myClass")} sub={s.myTarget?.name ?? "—"} chevron onClick={() => setPicker(true)} />
          )}
        </div>
      </Section>

      <Section title={t("notifications")}>
        {!isAndroid && <p class="hint">{t("notifyAndroidOnly")}</p>}
        <div class={`card-list ${isAndroid ? "" : "disabled"}`}>
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
        {isAndroid && <p class="hint">{t("widgetInfo")}</p>}
      </Section>

      <Section title={t("language")}>
        <Segmented value={s.lang} onChange={(v) => patchSettings({ lang: v })} options={[{ v: "auto", label: "Auto" }, { v: "cs", label: "Čeština" }, { v: "en", label: "English" }]} />
      </Section>
      <Section title={t("appearance")}>
        <Segmented value={s.theme} onChange={(v) => patchSettings({ theme: v })} options={[{ v: "auto", label: t("themeAuto") }, { v: "light", label: t("themeLight") }, { v: "dark", label: t("themeDark") }]} />
      </Section>

      <Section title={t("about")}>
        <div class="card-list">
          <Row icon="github" title={t("sourceCode")} chevron onClick={() => (native ? native.sync("openUrl", { url: REPO }) : open(REPO, "_blank"))} />
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
