import { computed, signal } from "@preact/signals";

export type Lang = "cs" | "en";

const cs = {
  appName: "Bakaláři+",
  // tabs
  tabToday: "Dnes", tabTimetable: "Rozvrh", tabGrades: "Známky", tabCalendar: "Kalendář", tabMore: "Více",
  // common
  loading: "Načítám…", retry: "Zkusit znovu", cancel: "Zrušit", save: "Uložit", delete: "Smazat", edit: "Upravit", close: "Zavřít",
  back: "Zpět", done: "Hotovo", search: "Hledat", add: "Přidat", offline: "Jsi offline – zobrazuji uložená data",
  schoolNotFound: "Na této adrese Bakaláři nejsou. Zkontroluj ji – je to adresa, kde se přihlašuješ.",
  unreachable: "Server neodpovídá – zkontroluj adresu, nebo to zkus za chvíli.",
  updatedAt: "Aktualizováno {t}", errorGeneric: "Něco se nepovedlo: {e}", noData: "Nic tu není",
  loginNeeded: "Pro tuhle část se přihlas svým účtem Bakalářů.", loginAction: "Přihlásit se",
  expired: "Přihlášení vypršelo, přihlas se znovu.",
  // onboarding
  welcomeTitle: "Rozvrh celé školy do kapsy",
  welcomeText: "Rozvrhy všech tříd, učitelů a učeben, suplování, známky, úkoly a společný kalendář třídy.",
  start: "Začít", pickSchool: "Najdi svou školu", townSearch: "Město (např. Praha)", schoolsIn: "Školy – {town}",
  manualUrl: "Zadat adresu ručně", schoolUrl: "Adresa Bakalářů školy", schoolUrlHint: "Např. bakalari.skola.cz – najdeš ji v adrese, kde se přihlašuješ.",
  checking: "Ověřuji…", continue: "Pokračovat",
  loginTitle: "Přihlášení", loginText: "Přihlášení odemkne tvůj rozvrh, známky, úkoly, zprávy a kalendář třídy. Heslo se posílá jen do Bakalářů tvé školy.",
  loginRelayNote: "Tahle škola neumožňuje přímé připojení z prohlížeče, takže přihlášení půjde přes náš server (heslo se neukládá). V aplikaci pro Android jde přímo.",
  username: "Uživatelské jméno", password: "Heslo", signIn: "Přihlásit", skipLogin: "Pokračovat bez přihlášení",
  badLogin: "Špatné jméno nebo heslo.", pickClass: "Která je tvoje třída?", pickClassHint: "Ukážu ti její rozvrh na hlavní obrazovce. Změníš to v nastavení.",
  publicOff: "Tahle škola nemá veřejný rozvrh, rozvrhy ostatních tříd a učitelů proto nepůjdou. Po přihlášení uvidíš svůj.",
  // today
  goodMorning: "Dobré ráno", goodDay: "Dobrý den", goodEvening: "Dobrý večer",
  now: "Teď", next: "Další", breakNow: "Přestávka", endsIn: "končí za {m} min", startsIn: "začíná za {m} min", at: "v {t}",
  noSchoolToday: "Dnes se neučí", schoolOver: "Vyučování skončilo", tomorrow: "Zítra", dayOff: "Volno",
  todayLessons: "Dnešní rozvrh", upcomingChanges: "Změny v rozvrhu", dueSoon: "Úkoly na nejbližší dny", upcoming: "Nadcházející",
  newGrades: "Nové známky", firstLesson: "Začínáš v {t}", dayStarts: "{d} začínáš v {t}", lessonsCount: "{n} hodin", lastEnds: "konec {t}",
  // timetable
  my: "Můj rozvrh", thisWeek: "Tento týden", nextWeek: "Příští týden", permanent: "Stálý",
  classes: "Třídy", teachers: "Učitelé", rooms: "Učebny", favourites: "Oblíbené", searchTarget: "Hledat třídu, učitele, učebnu",
  weekView: "Týden", dayView: "Den", noLessons: "Žádné hodiny", period: "{n}. hod", group: "Skupina", theme: "Téma", teacher: "Učitel",
  room: "Učebna", subject: "Předmět", openTimetable: "Rozvrh: {x}", cancelled: "Odpadá",
  change_substitution: "Suplování", change_room: "Změna učebny", change_removed: "Odpadá", change_added: "Navíc", change_joined: "Spojeno",
  change_absence: "Absence", change_other: "Změna", addFav: "Přidat do oblíbených", removeFav: "Odebrat z oblíbených",
  // grades
  average: "Průměr", overall: "Celkový průměr", weight: "váha {w}", noGrades: "Zatím žádné známky",
  calculator: "Kalkulačka známek", whatIf: "Co kdyby…", addMark: "Přidat známku", target: "Chci mít průměr", needed: "Potřebuješ",
  neededMark: "Známka s vahou {w}:", impossible: "S jednou známkou to nepůjde", alreadyThere: "To už máš 🎉", newAverage: "Nový průměr",
  pointsOnly: "Tento předmět se hodnotí body.", hypothetical: "Přidané (jen v kalkulačce)",
  // calendar
  classCalendar: "Kalendář třídy {c}", addEntry: "Přidat do kalendáře třídy", kind_test: "Test", kind_homework: "Úkol", kind_event: "Akce", kind_other: "Jiné",
  title: "Název", note: "Poznámka", date: "Datum", time: "Čas (nepovinné)", fromSchool: "Ze školy", fromClass: "Od spolužáků", addedBy: "přidal(a) {a}",
  report: "Nahlásit nevhodné", reported: "Nahlášeno, díky.", deleteConfirm: "Opravdu smazat?", noEvents: "Žádné akce",
  cloudOff: "Sdílený kalendář třídy je dostupný v aplikaci pro Android a ve webové verzi.", homeworkDue: "Úkol: {s}",
  // more
  homework: "Domácí úkoly", messages: "Zprávy", absence: "Absence", compare: "Společné volno", whereNow: "Kde je…",
  freeRooms: "Volné učebny", tools: "Nástroje", settings: "Nastavení", about: "O aplikaci",
  // homework / messages / absence
  hwTodo: "K odevzdání", hwAll: "Všechny",
  due: "do {d}", overdue: "Po termínu · {d}", overLimit: "{s}: {p} % – nad limitem {l} %", doneLabel: "Hotovo", noHomework: "Žádné úkoly", noMessages: "Žádné zprávy", noticeboard: "Nástěnka",
  missed: "Zameškáno", lessons: "hodin", lateCount: "pozdní příchody: {n}", unsolved: "Neomluvené hodiny: {n}", threshold: "Limit {p} %",
  // compare
  compareHint: "Vyber třídy nebo učitele a uvidíš, kdy mají všichni volno a kdy komu končí škola.",
  addToCompare: "Přidat", commonFree: "Společné volno", allFree: "všichni volno", endsAt: "Konec", nothingInCommon: "Žádné společné volno v době vyučování",
  // where
  whereHint: "Kde je teď učitel nebo třída?", rightNow: "Právě teď", free: "Volno", notInSchool: "Dnes už nic", nextLessonAt: "Další: {s} v {t} ({r})",
  pickTime: "Čas", // free rooms
  freeRoomsHint: "Stáhne rozvrhy všech učeben (jednou za týden, asi {mb} MB) a ukáže, které jsou volné.",
  download: "Stáhnout", freeAt: "Volné {p}", progress: "{a} z {b}",
  // settings
  language: "Jazyk", appearance: "Vzhled", themeAuto: "Podle systému", themeLight: "Světlý", themeDark: "Tmavý",
  school: "Škola", changeSchool: "Změnit školu", account: "Účet", logout: "Odhlásit", loggedAs: "Přihlášen(a): {n}",
  myClass: "Moje třída (bez přihlášení)", notifications: "Upozornění", notifyChanges: "Změny v rozvrhu", notifyGrades: "Nové známky",
  notifyHomework: "Nové úkoly", notifyMessages: "Nové zprávy", notifyEvening: "Večer připomenout zítřek", eveningAt: "Připomenutí v",
  notifyAndroidOnly: "Upozornění fungují v aplikaci pro Android.", widgetInfo: "Widget: dlouze podrž plochu → Widgety → Bakaláři+.",
  clearCache: "Smazat uložená data", cacheCleared: "Smazáno", version: "Verze {v}", updateAvail: "Nová verze {v}", updateNow: "Aktualizovat", updateAllowShort: "Povol instalaci a klepni znovu", updateBusy: "Stahuji…", updateAllow: "Povol instalaci z této aplikace a klepni znovu na Aktualizovat.", updateFail: "Aktualizace se nepovedla. Zkus to znovu.", updateCheck: "Hledat aktualizace", updateLatest: "Máš nejnovější verzi",  sourceCode: "Zdrojový kód na GitHubu",
  privacy: "Heslo zůstává v telefonu (šifrované klíčem Androidu). Kalendář třídy ukládá jen to, co do něj napíšete, a tvé jméno ve tvaru „Jan N.“.",
  pushTitle: "Upozornění", pushOn: "Zapnout upozornění", pushOff: "Vypnout upozornění", pushActive: "Upozornění jsou zapnutá",
  pushTest: "Poslat zkušební upozornění", pushTestSent: "Odesláno na {n} zařízení",
  pushIosHint: "Na iPhonu fungují jen v appce přidané na plochu (iOS 16.4+): v Safari Sdílet → Přidat na plochu, pak ji otevři z plochy.",
  pushUnsupported: "Tenhle prohlížeč upozornění neumí.",
  pushServerNote: "Server si podrží vlastní přihlašovací token (ne heslo), aby mohl hlídat nové známky a změny rozvrhu. Heslo jde jen do Bakalářů školy. Smažeš ho tlačítkem „Odhlásit a smazat moje data“.",
  pushLoginAgain: "Kvůli tomu se přihlas ještě jednou:",
  pushDenied: "Upozornění jsou zakázaná. Povol je v nastavení telefonu (iPhone: Nastavení → Oznámení → Bakaláři+).",
  pushRelogin: "Server se už nemůže přihlásit (změněné heslo?). Zapni upozornění znovu.",
  pushFailed: "Nepovedlo se zapnout upozornění ({e}).",
  deleteData: "Odhlásit a smazat moje data", deleteDataHint: "Smaže ze serveru přihlášení pro upozornění, tvoje zařízení, uložený stav a tvoje záznamy v kalendáři třídy, a odhlásí tě.",
  deleteDataSure: "Opravdu? Klepni znovu.", deleted: "Smazáno.",
  loginPushNote: "Pokud zapneš upozornění, server si drží přihlašovací token (ne heslo), aby je mohl posílat.",
  showWeekend: "Zobrazit víkend",
  iosBanner: "Nainstaluj si Bakaláři+ na iPhone", iosHow: "Jak", iosLater: "Později",
  iosTitle: "Přidání na plochu", iosWhy: "Na ploše běží na celou obrazovku, drží přihlášení a jen tak fungují oznámení.",
  iosS1: "Otevři tuto stránku v Safari.", iosS2: "Dole klepni na Sdílet (čtverec se šipkou nahoru; někdy pod ••• ).",
  iosS3: "Sjeď níže a zvol Přidat na plochu.", iosS4: "Nech zapnuté „Otevřít jako webovou aplikaci“ a klepni na Přidat.",
  iosS5: "Zavři Safari a otevři Bakaláři+ ikonou na ploše. Tam se přihlas znovu.",
  iosOther: "Jsi v jiném prohlížeči než Safari. Přidání na plochu funguje nejspolehlivěji v Safari, otevři tam tuto adresu.",
  iosInApp: "Jsi ve vestavěném prohlížeči jiné aplikace (Instagram, Messenger…). Klepni na ••• nebo ikonu kompasu a zvol Otevřít v Safari, nebo zkopíruj odkaz a vlož ho do Safari.",
  iosCopy: "Zkopírovat odkaz", iosCopied: "Zkopírováno",
  iosSeparate: "Appka na ploše má vlastní úložiště: přihlášení v prohlížeči se do ní nepřenese, přihlas se tam znovu.",
  // redesign
  customize: "Přizpůsobení", customizeSub: "Lišta, karty, barva, hustota",
  cTabs: "Dolní lišta", cTabsSub: "Vyber a seřaď až 4 sekce. Více je vždy poslední.", cHome: "Karty na Dnes", cAccent: "Barva akcentu",
  cDens: "Hustota rozvrhu", cStart: "Úvodní obrazovka", densComfort: "Volnější", densCompact: "Kompaktní", cardChanges: "Změny",
  moveUp: "Posunout nahoru", moveDown: "Posunout dolů",
  endsAtIn: "končí v {t} · za {m} min", startsAtIn: "začíná v {t} · za {m} min", topicLine: "Téma: {x}", nowKicker: "Teď · {p}. hodina", endsShort: "končí v {t}", minShort: "min", untilStart: "do začátku", lessonTopic: "Téma hodiny",
  hwOne: "Domácí úkol", openHw: "Otevřít v úkolech", legend: "Oranžově ohraničené hodiny mají změnu, přeškrtnuté odpadají.",
  calc: "Kalkulačka", newThisWeek: "Nové tento týden: {n}", goal: "Cíl (průměr)", goal1: "Na jedničku (≤1,5)", goal2: "Na dvojku (≤2,5)",
  goal3: "Na trojku (≤3,5)", nextWeight: "Váha další známky", needAtLeast: "Známka s vahou {w} nejhůř",
  calSchool: "Škola", calHw: "Úkoly", calClass: "Třída", visibleClass: "Uvidí to jen tvoje třída. Autor se ukáže jako „Jan N.“.",
  freeRoomsCount: "Volné učebny v {p}. hodině ({a}–{b}): {n}", occupied: "obsazeno", freeLow: "volno",
  cabinet: "Kabinet", cabinetX: "Kabinet {r}", cabinetUnknown: "Kabinet zatím nikdo nedoplnil", cabinetAdd: "Doplnit",
  cabinetPh: "Např. 305 nebo Kabinet fyziky", cabinetHint: "Uvidí to všichni ze školy, kdo mají Bakaláři+. Bakaláři kabinety neukazuje, proto je doplňujete vy.",
  groupsOf: "Skupiny třídy ({n} dělení)", groupsNone: "Vyber své skupiny, ať vidíš jen svoje hodiny", groupsAuto: "podle tvého rozvrhu",
  groupsHint: "Třída je na tyto předměty rozdělená. Vyber v každém řádku svou skupinu – hodiny ostatních skupin se schovají.",
  usualRoom: "Nejčastěji učí v učebně {r}",
  consultX: "Konzultace: {h}",
  groupsN: "{n} skupin", groupsFew: "{n} skupiny",
  hwDone: "Hotovo", hwUndone: "Ještě není hotové",
  teachersTitle: "Učitelé a kabinety", teachersSub: "Kabinety a konzultační hodiny", teachersSearch: "Hledat učitele nebo kabinet",
  teachersLogin: "Kabinety a konzultace vidí jen přihlášení studenti školy.", teachersKnown: "Kabinet známe u {a} z {b} učitelů.",
  cabinetNone: "kabinet nevíme", consult: "Konzultační hodiny", nothingFound: "Nic nenalezeno",
  groups: "Skupiny",
  rightNowPeriod: "Právě teď · {p}. hodina", atPeriod: "{p}. hodina · {t}", roomX: "Učebna {r}", untilT: "do {t}", nextRoomAt: "Další: učebna {r} v {t}",
  schoolEnds: "Škola končí", inClass: "hodina", openTimetableBtn: "Otevřít rozvrh",
  unofficial: "Neoficiální aplikace, není spojena s BAKALÁŘI software s.r.o.", unlockHint: "Odemkne známky, úkoly, zprávy a kalendář",
  pickSchoolSub: "Funguje pro školy z adresáře Bakalářů.", noSchoolsFound: "Nic nenalezeno", viewToggle: "Přepnout den / týden",
  themeLabel: "Motiv", needsPublic: "Jen u škol s veřejným rozvrhem", needsLogin: "Vyžaduje přihlášení",
  iosQ1: "V Safari klepni na Sdílet", iosQ2: "Vyber Přidat na plochu", iosQ3: "Otevři Bakaláři+ z plochy a přihlas se tam znovu",
  iosQPush: "Upozornění na iPhonu (iOS 16.4+) fungují jen v appce otevřené z plochy.", iosMore: "Podrobněji",
};

type Dict = typeof cs;

const en: Dict = {
  appName: "Bakaláři+",
  tabToday: "Today", tabTimetable: "Timetable", tabGrades: "Grades", tabCalendar: "Calendar", tabMore: "More",
  loading: "Loading…", retry: "Try again", cancel: "Cancel", save: "Save", delete: "Delete", edit: "Edit", close: "Close",
  back: "Back", done: "Done", search: "Search", add: "Add", offline: "You're offline – showing saved data",
  schoolNotFound: "No Bakaláři at this address. Check it – it's the address where you sign in.",
  unreachable: "The server doesn't answer – check the address or try again later.",
  updatedAt: "Updated {t}", errorGeneric: "Something went wrong: {e}", noData: "Nothing here",
  loginNeeded: "Sign in with your Bakaláři account for this part.", loginAction: "Sign in",
  expired: "Your sign-in expired, please sign in again.",
  welcomeTitle: "Your whole school's timetable in your pocket",
  welcomeText: "Timetables of every class, teacher and room, substitutions, grades, homework and a shared class calendar.",
  start: "Get started", pickSchool: "Find your school", townSearch: "Town (e.g. Praha)", schoolsIn: "Schools – {town}",
  manualUrl: "Enter the address", schoolUrl: "Your school's Bakaláři address", schoolUrlHint: "E.g. bakalari.school.cz – it's the address where you sign in.",
  checking: "Checking…", continue: "Continue",
  loginTitle: "Sign in", loginText: "Signing in unlocks your timetable, grades, homework, messages and the class calendar. Your password only goes to your school's Bakaláři.",
  loginRelayNote: "This school doesn't allow direct browser connections, so sign-in goes through our server (the password isn't stored). The Android app connects directly.",
  username: "Username", password: "Password", signIn: "Sign in", skipLogin: "Continue without signing in",
  badLogin: "Wrong username or password.", pickClass: "Which class are you in?", pickClassHint: "Its timetable goes on the home screen. You can change it in settings.",
  publicOff: "This school doesn't publish its timetable, so other classes and teachers aren't available. Sign in to see yours.",
  goodMorning: "Good morning", goodDay: "Hello", goodEvening: "Good evening",
  now: "Now", next: "Next", breakNow: "Break", endsIn: "ends in {m} min", startsIn: "starts in {m} min", at: "at {t}",
  noSchoolToday: "No school today", schoolOver: "School's over", tomorrow: "Tomorrow", dayOff: "Day off",
  todayLessons: "Today", upcomingChanges: "Timetable changes", dueSoon: "Homework due soon", upcoming: "Coming up",
  newGrades: "New grades", firstLesson: "Starts at {t}", dayStarts: "{d} you start at {t}", lessonsCount: "{n} lessons", lastEnds: "ends {t}",
  my: "My timetable", thisWeek: "This week", nextWeek: "Next week", permanent: "Permanent",
  classes: "Classes", teachers: "Teachers", rooms: "Rooms", favourites: "Favourites", searchTarget: "Search class, teacher, room",
  weekView: "Week", dayView: "Day", noLessons: "No lessons", period: "Period {n}", group: "Group", theme: "Topic", teacher: "Teacher",
  room: "Room", subject: "Subject", openTimetable: "Timetable: {x}", cancelled: "Cancelled",
  change_substitution: "Substitution", change_room: "Room change", change_removed: "Cancelled", change_added: "Extra", change_joined: "Merged",
  change_absence: "Absence", change_other: "Change", addFav: "Add to favourites", removeFav: "Remove from favourites",
  average: "Average", overall: "Overall average", weight: "weight {w}", noGrades: "No grades yet",
  calculator: "Grade calculator", whatIf: "What if…", addMark: "Add a grade", target: "Target average", needed: "You need",
  neededMark: "A grade with weight {w}:", impossible: "Not possible with one grade", alreadyThere: "You're already there 🎉", newAverage: "New average",
  pointsOnly: "This subject is graded with points.", hypothetical: "Added (calculator only)",
  classCalendar: "{c} class calendar", addEntry: "Add to class calendar", kind_test: "Test", kind_homework: "Homework", kind_event: "Event", kind_other: "Other",
  title: "Title", note: "Note", date: "Date", time: "Time (optional)", fromSchool: "From school", fromClass: "From classmates", addedBy: "added by {a}",
  report: "Report as inappropriate", reported: "Reported, thanks.", deleteConfirm: "Really delete?", noEvents: "No events",
  cloudOff: "The shared class calendar works in the Android app and the web version.", homeworkDue: "Homework: {s}",
  homework: "Homework", messages: "Messages", absence: "Absence", compare: "Free time together", whereNow: "Where is…",
  freeRooms: "Free rooms", tools: "Tools", settings: "Settings", about: "About",
  hwTodo: "To do", hwAll: "All",
  due: "due {d}", overdue: "Overdue · {d}", overLimit: "{s}: {p} % – over the {l} % limit", doneLabel: "Done", noHomework: "No homework", noMessages: "No messages", noticeboard: "Notice board",
  missed: "Missed", lessons: "lessons", lateCount: "late: {n}", unsolved: "Unexcused lessons: {n}", threshold: "Limit {p} %",
  compareHint: "Pick classes or teachers to see when everyone is free and when school ends for each.",
  addToCompare: "Add", commonFree: "Free together", allFree: "all free", endsAt: "Ends", nothingInCommon: "No common free period during school hours",
  whereHint: "Where is a teacher or class right now?", rightNow: "Right now", free: "Free", notInSchool: "Nothing more today", nextLessonAt: "Next: {s} at {t} ({r})",
  pickTime: "Time",
  freeRoomsHint: "Downloads the timetables of all rooms (once a week, about {mb} MB) and shows which are free.",
  download: "Download", freeAt: "Free {p}", progress: "{a} of {b}",
  language: "Language", appearance: "Appearance", themeAuto: "System", themeLight: "Light", themeDark: "Dark",
  school: "School", changeSchool: "Change school", account: "Account", logout: "Sign out", loggedAs: "Signed in: {n}",
  myClass: "My class (without sign-in)", notifications: "Notifications", notifyChanges: "Timetable changes", notifyGrades: "New grades",
  notifyHomework: "New homework", notifyMessages: "New messages", notifyEvening: "Evening reminder for tomorrow", eveningAt: "Reminder at",
  notifyAndroidOnly: "Notifications work in the Android app.", widgetInfo: "Widget: long-press the home screen → Widgets → Bakaláři+.",
  clearCache: "Clear saved data", cacheCleared: "Cleared", version: "Version {v}", updateAvail: "New version {v}", updateNow: "Update", updateAllowShort: "Allow installs, then tap again", updateBusy: "Downloading…", updateAllow: "Allow installs from this app, then tap Update again.", updateFail: "The update failed. Try again.", updateCheck: "Check for updates", updateLatest: "You have the latest version",  sourceCode: "Source code on GitHub",
  privacy: "Your password stays on the phone (encrypted with an Android key). The class calendar only stores what you write and your name as “Jan N.”.",
  pushTitle: "Notifications", pushOn: "Turn on notifications", pushOff: "Turn off notifications", pushActive: "Notifications are on",
  pushTest: "Send a test notification", pushTestSent: "Sent to {n} device(s)",
  pushIosHint: "On iPhone they only work in the app added to the home screen (iOS 16.4+): in Safari Share → Add to Home Screen, then open it from there.",
  pushUnsupported: "This browser can't show notifications.",
  pushServerNote: "The server keeps its own sign-in token (not your password) to watch for new grades and timetable changes. The password only goes to your school's Bakaláři. “Sign out and delete my data” removes it.",
  pushLoginAgain: "For that, sign in once more:",
  pushDenied: "Notifications are blocked. Allow them in the phone settings (iPhone: Settings → Notifications → Bakaláři+).",
  pushRelogin: "The server can't sign in any more (changed password?). Turn notifications on again.",
  pushFailed: "Couldn't turn on notifications ({e}).",
  deleteData: "Sign out and delete my data", deleteDataHint: "Deletes the notifications sign-in, your devices, saved state and your class-calendar entries from the server, and signs you out.",
  deleteDataSure: "Sure? Tap again.", deleted: "Deleted.",
  loginPushNote: "If you turn on notifications, the server keeps a sign-in token (not your password) so it can send them.",
  showWeekend: "Show weekend",
  iosBanner: "Install Bakaláři+ on your iPhone", iosHow: "How", iosLater: "Later",
  iosTitle: "Add to Home Screen", iosWhy: "On the home screen it runs full screen, keeps you signed in and it's the only way to get notifications.",
  iosS1: "Open this page in Safari.", iosS2: "Tap Share at the bottom (square with an arrow pointing up; sometimes under •••).",
  iosS3: "Scroll down and choose Add to Home Screen.", iosS4: "Keep “Open as Web App” on and tap Add.",
  iosS5: "Close Safari and open Bakaláři+ from the icon on your home screen. Sign in again there.",
  iosOther: "You're not in Safari. Adding to the home screen works most reliably in Safari, so open this address there.",
  iosInApp: "You're in another app's built-in browser (Instagram, Messenger…). Tap ••• or the compass icon and choose Open in Safari, or copy the link and paste it into Safari.",
  iosCopy: "Copy link", iosCopied: "Copied",
  iosSeparate: "The home-screen app has its own storage: a sign-in made in the browser doesn't carry over, so sign in there again.",
  customize: "Customize", customizeSub: "Tab bar, cards, colour, density",
  cTabs: "Bottom tab bar", cTabsSub: "Pick and order up to 4 sections. More is always last.", cHome: "Cards on Today", cAccent: "Accent colour",
  cDens: "Timetable density", cStart: "Start screen", densComfort: "Comfortable", densCompact: "Compact", cardChanges: "Changes",
  moveUp: "Move up", moveDown: "Move down",
  endsAtIn: "ends {t} · in {m} min", startsAtIn: "starts {t} · in {m} min", topicLine: "Topic: {x}", nowKicker: "Now · period {p}", endsShort: "ends {t}", minShort: "min", untilStart: "until start", lessonTopic: "Lesson topic",
  hwOne: "Homework", openHw: "Open in homework", legend: "Outlined lessons have a change, struck-through ones are cancelled.",
  calc: "Calculator", newThisWeek: "New this week: {n}", goal: "Goal (average)", goal1: "For a 1 (≤1.5)", goal2: "For a 2 (≤2.5)",
  goal3: "For a 3 (≤3.5)", nextWeight: "Weight of next grade", needAtLeast: "Worst grade with weight {w}",
  calSchool: "School", calHw: "Homework", calClass: "Class", visibleClass: "Only your class can see it. The author shows as “Jan N.”.",
  freeRoomsCount: "Free rooms in period {p} ({a}–{b}): {n}", occupied: "occupied", freeLow: "free",
  cabinet: "Cabinet", cabinetX: "Cabinet {r}", cabinetUnknown: "Nobody has added this cabinet yet", cabinetAdd: "Add",
  cabinetPh: "E.g. 305 or Physics cabinet", cabinetHint: "Everyone from your school who uses Bakaláři+ will see it. Bakaláři doesn't show cabinets, so students fill them in.",
  groupsOf: "Class groups ({n} splits)", groupsNone: "Pick your groups to see only your lessons", groupsAuto: "from your timetable",
  groupsHint: "The class is split for these subjects. Pick your group in each row and the other groups' lessons are hidden.",
  usualRoom: "Usually teaches in room {r}",
  consultX: "Consultations: {h}",
  groupsN: "{n} groups", groupsFew: "{n} groups",
  hwDone: "Done", hwUndone: "Not done yet",
  teachersTitle: "Teachers and cabinets", teachersSub: "Cabinets and consultation hours", teachersSearch: "Search a teacher or cabinet",
  teachersLogin: "Cabinets and consultation hours are visible to signed-in students of the school.", teachersKnown: "Cabinet known for {a} of {b} teachers.",
  cabinetNone: "cabinet unknown", consult: "Consultation hours", nothingFound: "Nothing found",
  groups: "Groups",
  rightNowPeriod: "Right now · period {p}", atPeriod: "Period {p} · {t}", roomX: "Room {r}", untilT: "until {t}", nextRoomAt: "Next: room {r} at {t}",
  schoolEnds: "School ends", inClass: "class", openTimetableBtn: "Open timetable",
  unofficial: "Unofficial app, not affiliated with BAKALÁŘI software s.r.o.", unlockHint: "Unlocks grades, homework, messages and calendar",
  pickSchoolSub: "Works for schools in the Bakaláři directory.", noSchoolsFound: "Nothing found", viewToggle: "Switch day / week",
  themeLabel: "Theme", needsPublic: "Only for schools with a public timetable", needsLogin: "Needs sign-in",
  iosQ1: "In Safari tap Share", iosQ2: "Choose Add to Home Screen", iosQ3: "Open Bakaláři+ from the Home Screen and sign in there again",
  iosQPush: "Notifications on iPhone (iOS 16.4+) only work in the app opened from the Home Screen.", iosMore: "More detail",
};

const dicts: Record<Lang, Dict> = { cs, en };

export const langSetting = signal<"auto" | Lang>("auto");
export const lang = computed<Lang>(() =>
  langSetting.value !== "auto" ? langSetting.value : navigator.language.toLowerCase().startsWith("cs") || navigator.language.toLowerCase().startsWith("sk") ? "cs" : "en");

export type TKey = keyof Dict;

export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s = dicts[lang.value][key] ?? cs[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

const DAYS = { cs: ["po", "út", "st", "čt", "pá", "so", "ne"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };
const DAYS_LONG = { cs: ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"], en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] };
export const dayShort = (dow: number) => DAYS[lang.value][dow - 1];
export const dayLong = (dow: number) => DAYS_LONG[lang.value][dow - 1];

/** "út 29. 9." / "Tue 29/9" */
export function fmtDate(iso: string, long = false): string {
  const [, m, d] = iso.split("-").map(Number);
  const dow = ((new Date(iso + "T12:00").getDay() + 6) % 7) + 1;
  const name = long ? dayLong(dow) : dayShort(dow);
  return lang.value === "cs" ? `${name} ${d}. ${m}.` : `${name} ${d}/${m}`;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fmtRelDay(iso: string, todayIso: string): string {
  const diff = Math.round((+new Date(iso + "T12:00") - +new Date(todayIso + "T12:00")) / 86400000);
  if (diff === 0) return lang.value === "cs" ? "dnes" : "today";
  if (diff === 1) return lang.value === "cs" ? "zítra" : "tomorrow";
  if (diff === -1) return lang.value === "cs" ? "včera" : "yesterday";
  return fmtDate(iso);
}
