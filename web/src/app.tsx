import { t } from "./lib/i18n";
import { expired, settings, user } from "./lib/store";
import { Icon } from "./ui/icons";
import { go, route } from "./ui/router";
import { sectionPath } from "./ui/prefs";
import { SECTION_META, tabSections } from "./ui/sections";
import { Today } from "./screens/Today";
import { Timetable } from "./screens/Timetable";
import { Grades } from "./screens/Grades";
import { Calendar } from "./screens/Calendar";
import { Absence, Homework, Messages, More } from "./screens/More";
import { Compare, FreeRooms, WhereNow } from "./screens/Tools";
import { Customize, Login, Settings, Welcome } from "./screens/Setup";

const SCREENS: Record<string, () => preact.JSX.Element> = {
  "/today": Today, "/timetable": Timetable, "/grades": Grades, "/calendar": Calendar, "/more": More,
  "/homework": Homework, "/messages": Messages, "/absence": Absence,
  "/compare": Compare, "/where": WhereNow, "/rooms": FreeRooms,
  "/settings": Settings, "/customize": Customize, "/login": Login, "/welcome": Welcome,
};

// Screens that keep the tab bar (everything reachable from a tab or from More); settings and sign-in hide it.
const WITH_TABS = ["/today", "/timetable", "/grades", "/calendar", "/homework", "/messages", "/where", "/compare", "/rooms", "/absence", "/more"];

export function App() {
  const s = settings.value;
  const path = route.value.path;
  if (!s.onboarded || !s.school) return <Welcome />;
  const Screen = SCREENS[path] ?? Today;
  const tabs = tabSections();
  const showTabs = WITH_TABS.includes(path);
  const cur = path === "/rooms" ? "/where" : path;
  const active = tabs.some((x) => sectionPath(x) === cur) ? cur : "/more";

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
            {[...tabs.map((x) => ({ path: sectionPath(x), ...SECTION_META[x] })), { path: "/more", icon: "dots-three-outline" as const, label: "tabMore" as const }].map((x) => {
              const on = active === x.path;
              return (
                <button class={on ? "on" : ""} onClick={() => go(x.path, undefined, true)} aria-current={on ? "page" : undefined}>
                  <Icon name={x.icon} size={22} fill={on} />
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
