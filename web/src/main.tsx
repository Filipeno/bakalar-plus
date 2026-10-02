import { render } from "preact";
import { App } from "./app";
import { isAndroid } from "./lib/native";
import { checkForUpdate } from "./lib/update";
import "./styles.css";

if (isAndroid) document.documentElement.classList.add("android");
// iOS ignores user-scalable=no in Safari: block the pinch gesture itself.
for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault());
render(<App />, document.getElementById("app")!);
if (isAndroid) void checkForUpdate(true);   // every start, so a new version is offered right away

// Offline support + push notifications for the web version (the Android app ships its files inside the APK
// and has native notifications).
if (!isAndroid && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
