import { t, type TKey } from "./lib/i18n";
import { expired, settings, user } from "./lib/store";
import { Icon, type IconName } from "./ui/icons";
import { go, route, TABS } from "./ui/router";
import { Today } from "./screens/Today";
import { Timetable } from "./screens/Timetable";
import { Grades } from "./screens/Grades";
import { Calendar } from "./screens/Calendar";
import { Absence, Homework, Messages, More } from "./screens/More";
import { Compare, FreeRooms, WhereNow } from "./screens/Tools";
import { Login, Settings, Welcome } from "./screens/Setup";

const SCREENS: Record<string, () => preact.JSX.Element> = {
  "/today": Today, "/timetable": Timetable, "/grades": Grades, "/calendar": Calendar, "/more": More,
  "/homework": Homework, "/messages": Messages, "/absence": Absence,
  "/compare": Compare, "/where": WhereNow, "/rooms": FreeRooms,
  "/settings": Settings, "/login": Login, "/welcome": Welcome,
};

const TAB_META: { path: string; icon: IconName; label: TKey; needsLogin?: boolean }[] = [
  { path: "/today", icon: "home", label: "tabToday" },
  { path: "/timetable", icon: "grid", label: "tabTimetable" },
  { path: "/grades", icon: "star", label: "tabGrades", needsLogin: true },
  { path: "/calendar", icon: "cal", label: "tabCalendar", needsLogin: true },
  { path: "/more", icon: "more", label: "tabMore" },
];

export function App() {
  const s = settings.value;
  const path = route.value.path;
  if (!s.onboarded || !s.school) return <Welcome />;
  const Screen = SCREENS[path] ?? Today;
  const tabs = TAB_META.filter((x) => !x.needsLogin || user.value);
  const showTabs = TABS.includes(path);

  return (
    <div class={`app ${showTabs ? "with-tabs" : ""}`}>
      {expired.value && user.value && (
        <button class="banner warn top" onClick={() => { expired.value = false; go("/login"); }}>
          <Icon name="alert" size={18} /> {t("expired")}
        </button>
      )}
      <Screen key={path} />
      {showTabs && (
        <nav class="tabbar">
          {tabs.map((x) => (
            <button class={path === x.path ? "on" : ""} onClick={() => go(x.path, undefined, true)} aria-current={path === x.path ? "page" : undefined}>
              <span class="tab-icon"><Icon name={x.icon} size={22} filled={path === x.path && x.icon === "star"} /></span>
              <span>{t(x.label)}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
