import { render } from "preact";
import { App } from "./app";
import { isAndroid } from "./lib/native";
import "./styles.css";

if (isAndroid) document.documentElement.classList.add("android");
render(<App />, document.getElementById("app")!);

// Offline support + push notifications for the web version (the Android app ships its files inside the APK
// and has native notifications).
if (!isAndroid && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
