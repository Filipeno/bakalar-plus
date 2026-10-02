import { update, updating, installUpdate, markPrompted, wasPrompted } from "../lib/update";
import { t } from "../lib/i18n";
import { Icon } from "./icons";
import { Sheet } from "./kit";

/** Android: when a newer version is found at start, ask once (per version and day) instead of only showing the banner. */
export function UpdatePrompt() {
  const u = update.value;
  const open = !!u && !wasPrompted(u) && updating.value !== "busy";
  if (!u) return null;
  const later = () => { markPrompted(u); update.value = { ...u }; };
  const notes = u.notes.replace(/\*\*/g, "").replace(/\r/g, "").trim();
  return (
    <Sheet open={open} onClose={later} title={t("updateTitle", { v: u.latest })} sub={t("updateFrom", { v: u.current })}>
      {notes && <p class="pre" style={{ fontSize: "14px", marginTop: "10px" }}>{notes}</p>}
      <div class="btn-row" style={{ marginTop: "18px" }}>
        <button class="btn" onClick={() => { markPrompted(u); void installUpdate(); }}><Icon name="arrow-down" size={18} />{t("updateNow")}</button>
        <button class="btn line" onClick={later}>{t("later")}</button>
      </div>
    </Sheet>
  );
}
