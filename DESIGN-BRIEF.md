# Technical brief: Bakaláři+ (UI-only redesign)

## Goal
Replace the whole UI layer. Keep all logic, data flow and platform integrations working exactly as they do now. Do not change anything in `web/src/lib/`, `worker/`, `gateway/` or `android/`. The new UI calls the existing signals, hooks and functions.

## Stack
- Preact 10 with `@preact/signals`, TypeScript, Vite, in `web/`. One global stylesheet, `web/src/styles.css`, using CSS variables and light/dark via `[data-theme]`.
- No router library. Hash router in `web/src/ui/router.ts`: `route` signal, `go(path, q?, replace?)`, `back()`, `TABS`.
- **Back handling:** anything that closes on the Android back gesture must register with `pushCloser(fn)` or `useBack(active, fn, key)`. Android calls `window.__bpBack()`, which runs the closers, then history, then `/today`, and returns `false` when nothing is left. New modals, sheets and multi-step flows must use this.
- i18n is in `web/src/lib/i18n.ts`: a typed `cs` dictionary, a matching `en` dictionary, and `t("key", {vars})`. Every user-visible string goes through `t()` with both languages. Czech is the source language.
- Theme: `settings.theme` is auto, light or dark; `data-theme` is set on `<html>`.

## Screens and routes (`web/src/app.tsx`)
- Tabs: `/today`, `/timetable`, `/grades` (login required), `/calendar` (login required), `/more`.
- Sub-pages: `/homework`, `/messages`, `/absence`, `/compare`, `/where`, `/rooms`, `/settings`, `/login`, `/welcome`.
- If `!settings.onboarded || !settings.school`, only `<Welcome />` renders (steps: hello, school, login, class).
- Login-only tabs are hidden while `user.value` is null. There is a public mode that shows timetables without login. Keep it.
- `expired` + `user`: show a top warning that opens `/login`.

## State and data (use these, don't re-implement)
- `lib/store.ts`: `settings` and `patchSettings`, `user`, `online`, `expired`, `readCache`/`writeCache`, `useData(key, fetcher, ttl)` returning `{data, error, loading, at, reload}` (stale-while-revalidate, localStorage cache), `resumeTick`.
- `lib/data.ts`: `useWeek(source, term)`, `useDirectory()`, `useMarks()`, `useHomework()`, `useMessages()`, `useEvents()`, `useAbsence()`, `findTeacher`, `findRoom`, `findClass`.
- `lib/model.ts`: types `Lesson`, `Day`, `Week`, `Hour`, `Target`, `Change` (`substitution`, `room`, `removed`, `added`, `joined`, `absence`, `other`) and the date helpers.
- Errors: show them with `errorText(e)` from `ui/kit.tsx` (separates offline, server unreachable, school not found).

## Platforms (same code, three runtimes)
1. **Web / PWA** (Cloudflare Worker static assets). Service worker is network-first. Web Push only here (`lib/push.ts`).
2. **Android APK.** The web build is bundled in assets and served from `https://app.bakalarplus.cz/` in a WebView. `isAndroid` (`lib/native.ts`) is true there. The `BPNative` bridge handles sign-in, sync, widgets, notifications and the updater. Update UI uses `lib/update.ts` and only shows when `isAndroid`.
3. **iPhone** as a home-screen PWA. In a plain browser tab it shows `<IosInstall />` (`ui/kit.tsx`), using `isIos`, `isStandalone`, `iosBrowser` from `lib/push.ts`.

Branch on `isAndroid` for notifications, updates and web push, as the current code does.

## Hard constraints
- No pinch or double-tap zoom: `touch-action: manipulation`, the viewport meta tag, and the gesture blocking in `main.tsx`.
- Inputs at `font-size: 16px` or larger (iOS zooms into smaller ones).
- Safe-area insets (`env(safe-area-inset-*)`). On Android the native side already pads the WebView, so don't double-pad.
- Offline is a normal state: show cached data with the offline banner, never a blank screen.
- Czech text runs 20-30% longer than English; nothing may overflow.
- Privacy: passwords are never stored or logged, they go only to the school's Bakaláři (directly or via the relay). Keep the existing explanatory copy on the login and push screens.
- Keep the bundle small, no heavy UI libraries.
- Must build with `npm run build` in `web/` and pass `npx tsc --noEmit`.

## May change
`styles.css`, everything in `ui/`, the JSX and layout of everything in `screens/`, component structure, animations, icons. New components are fine.

## Must not break
- The signal and hook contracts above, the route paths, the i18n mechanism (add keys freely; remove a key from both languages).
- `window.__bpBack` and `pushCloser` behaviour.
- Exports other code imports. If you rename one, update every import.

## Deliverable
Change only the UI layer. Run `npm run build` and `npx tsc --noEmit` and fix errors. List the files changed and any old UI behaviour you had to reproduce or drop.
