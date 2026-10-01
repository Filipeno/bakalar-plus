import { t } from "./lib/i18n";
import { expired, schoolName, settings, user } from "./lib/store";
import { Icon } from "./ui/icons";
import { go, route } from "./ui/router";
import { sectionPath } from "./ui/prefs";
import { SECTION_META, available, tabSections } from "./ui/sections";
import type { IconName } from "./ui/icons";
import type { TKey } from "./lib/i18n";
import { Today } from "./screens/Today";
import { Timetable } from "./screens/Timetable";
import { Grades } from "./screens/Grades";
import { Calendar } from "./screens/Calendar";
import { Absence, Homework, Messages, More } from "./screens/More";
import { Compare, FreeRooms, Teachers, WhereNow } from "./screens/Tools";
import { Customize, Login, Settings, Welcome } from "./screens/Setup";
import { wide } from "./ui/layout";
import { useMessages } from "./lib/data";

const SCREENS: Record<string, () => preact.JSX.Element> = {
  "/today": Today, "/timetable": Timetable, "/grades": Grades, "/calendar": Calendar, "/more": More,
  "/homework": Homework, "/messages": Messages, "/absence": Absence,
  "/compare": Compare, "/where": WhereNow, "/rooms": FreeRooms, "/teachers": Teachers,
  "/settings": Settings, "/customize": Customize, "/login": Login, "/welcome": Welcome,
};

// Screens that keep the tab bar (everything reachable from a tab or from More); settings and sign-in hide it.
const WITH_TABS = ["/today", "/timetable", "/grades", "/calendar", "/homework", "/messages", "/where", "/compare", "/rooms", "/teachers", "/absence", "/more"];

export function App() {
  const s = settings.value;
  const path = route.value.path;
  if (!s.onboarded || !s.school) return <Welcome />;
  const Screen = SCREENS[path] ?? Today;
  const tabs = tabSections();
  const showTabs = WITH_TABS.includes(path);
  const cur = path === "/rooms" ? "/where" : path;
  const active = tabs.some((x) => sectionPath(x) === cur) ? cur : "/more";

  const nav = [...tabs.map((x) => ({ path: sectionPath(x), ...SECTION_META[x] })), { path: "/more", icon: "dots-three-outline" as const, label: "tabMore" as const }];

  if (wide.value) {
    return (
      <div class="app desktop">
        <Sidebar active={cur} />
        <div class="desk-main">
          {expired.value && user.value && (
            <button class="banner warn top" onClick={() => { expired.value = false; go("/login"); }}>
              <Icon name="warning" size={18} /> {t("expired")}
            </button>
          )}
          <Screen key={path} />
        </div>
      </div>
    );
  }

  return (
    <div class={`app ${showTabs ? "with-tabs" : ""}`}>
      {expired.value && user.value && (
        <button class="banner warn top" onClick={() => { expired.value = false; go("/login"); }}>
          <Icon name="warning" size={18} /> {t("expired")}
        </button>
      )}
      <Screen key={path} />
      {showTabs && (
        <nav class="tabbar">
          <div class="tabbar-in">
            {nav.map((x) => {
              const on = active === x.path;
              return (
                <button class={on ? "on" : ""} onClick={() => go(x.path, undefined, true)} aria-current={on ? "page" : undefined}>
                  <span class="tab-ic"><Icon name={x.icon} size={22} fill={on} /></span>
                  <span>{t(x.label)}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

/** Desktop: every section in a left sidebar instead of the tab bar + More. */
function Sidebar({ active }: { active: string }) {
  const u = user.value;
  const msgs = useMessages();
  const unread = u ? (msgs.data ?? []).filter((m) => !m.read && !m.board).length : 0;
  const av = available();
  const item = (path: string, icon: IconName, label: TKey, badge?: string) => (
    <button class={`side-item ${active === path ? "on" : ""}`} onClick={() => go(path, undefined, true)} aria-current={active === path ? "page" : undefined}>
      <Icon name={icon} size={20} fill={active === path} /><span class="grow">{t(label)}</span>{badge && <span class="side-badge">{badge}</span>}
    </button>
  );
  const main = (["today", "timetable", "grades", "calendar"] as const).filter((s) => s === "today" || av.includes(s));
  const school = (["homework", "messages"] as const).filter((s) => av.includes(s));
  const tools = (["where", "compare"] as const).filter((s) => av.includes(s));
  return (
    <aside class="sidebar">
      <div class="side-brand"><span class="side-logo">B+</span><span class="grow"><b>{t("appName")}</b><small class="ellipsis">{schoolName()}</small></span></div>
      <div class="side-group">
        {main.map((s) => item(sectionPath(s), SECTION_META[s].icon, SECTION_META[s].label))}
      </div>
      {(school.length > 0 || u) && (
        <div class="side-group">
          <div class="side-label">{t("school")}</div>
          {school.map((s) => item(sectionPath(s), SECTION_META[s].icon, SECTION_META[s].label, s === "messages" && unread ? String(unread) : undefined))}
          {u && item("/absence", "clock-countdown", "absence")}
        </div>
      )}
      {tools.length > 0 && (
        <div class="side-group">
          <div class="side-label">{t("tools")}</div>
          {tools.map((s) => item(sectionPath(s), SECTION_META[s].icon, SECTION_META[s].label))}
          {settings.value.publicOk && item("/rooms", "door-open", "freeRooms")}
          {settings.value.publicOk && item("/teachers", "user", "teachersTitle")}
        </div>
      )}
      <div class="side-foot">
        {item("/settings", "gear", "settings")}
        {item("/customize", "sliders-horizontal", "customize")}
        {u
          ? <div class="side-user"><span class="side-av">{initials(u.name)}</span><span class="grow"><b class="ellipsis">{u.name.split(",")[0]}</b><small>{u.classAbbrev}</small></span></div>
          : item("/login", "sign-in", "loginAction")}
      </div>
    </aside>
  );
}

const initials = (name: string) => name.split(",")[0].trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
