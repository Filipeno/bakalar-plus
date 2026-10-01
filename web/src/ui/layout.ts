import { signal } from "@preact/signals";

// Desktop layout (sidebar, two-column screens, side panels) from 1024 px; phones and tablets keep the tab bar.
const mq = typeof matchMedia !== "undefined" ? matchMedia("(min-width: 1024px)") : null;
export const wide = signal(!!mq?.matches);
const apply = () => { document.documentElement.dataset.layout = wide.value ? "desktop" : "mobile"; };
mq?.addEventListener("change", (e) => { wide.value = e.matches; apply(); });
apply();
