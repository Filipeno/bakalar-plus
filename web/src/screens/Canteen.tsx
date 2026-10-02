// Jídelna: the school canteen (iCanteen). Public menu without login; with the canteen's own login also credit,
// ordering / cancelling and the meal exchange (burza). Every action that moves credit asks first.

import { useEffect, useState } from "preact/hooks";
import { fmtDate, t } from "../lib/i18n";
import { today } from "../lib/model";
import { settings, useData } from "../lib/store";
import {
  canteen, canteenAction, canteenLogin, canteenLogout, CanteenAuthError, cleanUrl, getAccount, getBurza, getMenu,
  getPublicMenu, guessCanteenUrl, type BurzaItem, type Meal, type MenuDay,
} from "../lib/canteen";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, Page, Segmented, Sheet, Spinner, Updated, errorText, usePullToRefresh } from "../ui/kit";
import { isTab } from "../ui/router";

const kc = (n?: number) => (n == null ? "" : `${n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`);

export function Canteen() {
  const st = canteen.value;
  const url = st?.url || guessCanteenUrl(settings.value.school?.url ?? "");
  const logged = !!st?.loggedIn;
  const [tab, setTab] = useState<"menu" | "burza">("menu");
  const [open, setOpen] = useState<{ meal?: Meal; burza?: BurzaItem } | null>(null);
  const [login, setLogin] = useState(false);

  const pub = useData<MenuDay[]>(!logged && url ? `cpub:${url}` : null, () => getPublicMenu(url), 3600_000);
  const menu = useData<MenuDay[]>(logged ? `cmenu:${url}` : null, getMenu, 5 * 60_000);
  const acc = useData(logged ? `cacc:${url}` : null, getAccount, 5 * 60_000);
  const burza = useData<BurzaItem[]>(logged ? `cburza:${url}` : null, getBurza, 2 * 60_000);
  const reload = () => { menu.reload(); acc.reload(); burza.reload(); pub.reload(); };
  usePullToRefresh(reload);

  const authLost = [menu.error, acc.error, burza.error].some((e) => e instanceof CanteenAuthError);
  const days = (logged ? menu.data : pub.data) ?? [];
  const td = today();
  const upcoming = days.filter((d) => d.date >= td);

  return (
    <Page title={t("canteen")} backable={!isTab("/canteen")}
      sub={logged ? [st?.user, acc.data?.credit != null ? t("canteenCredit", { c: kc(acc.data.credit) }) : ""].filter(Boolean).join(" · ") : t("canteenPublic")}
      actions={logged
        ? <button class="icon-btn" onClick={() => { canteenLogout(); }} aria-label={t("canteenLogout")}><Icon name="sign-out" size={22} /></button>
        : <button class="icon-btn" onClick={() => setLogin(true)} aria-label={t("canteenLogin")}><Icon name="sign-in" size={22} /></button>}>
      {(!logged || authLost) && (
        <div class="card canteen-login">
          <div class="grow">
            <b>{t(authLost ? "canteenExpired" : "canteenLoginTitle")}</b>
            <div class="hint">{t("canteenLoginHint")}</div>
          </div>
          <button class="btn small" onClick={() => setLogin(true)}>{t("canteenLogin")}</button>
        </div>
      )}

      {logged && (
        <div style={{ margin: "4px 0 12px" }}>
          <Segmented value={tab} onChange={setTab} options={[
            { v: "menu", label: t("canteenMenu") },
            { v: "burza", label: burza.data?.length ? `${t("canteenBurza")} (${burza.data.length})` : t("canteenBurza") },
          ]} />
        </div>
      )}

      {tab === "menu" || !logged ? (
        <>
          {(logged ? menu : pub).loading && !days.length && <Loading />}
          {[menu.error, pub.error].map((e) => e != null && !(e instanceof CanteenAuthError) && <ErrorBox error={e} onRetry={reload} />)}
          {(logged ? menu.data : pub.data) && !upcoming.length && <Empty icon="calendar-blank" text={t("canteenNoMenu")} />}
          {upcoming.map((d) => (
            <section class="section">
              <div class="section-head"><span class="label">{fmtDate(d.date, true)}</span></div>
              <div class="stack">
                {d.meals.map((m) => {
                  const fromBurza = logged && !m.ordered && burza.data?.some((b) => b.date === m.date && b.variant === m.variant);
                  return (
                    <button class={`row meal ${m.ordered ? "ordered" : ""}`} onClick={() => logged && setOpen({ meal: m })} disabled={!logged}>
                      {logged && <span class="row-icon"><Icon name={m.ordered ? "check-circle" : "circle"} size={22} fill={m.ordered} /></span>}
                      <span class="row-main">
                        <span class="row-sub meal-variant">{m.variant}{m.price != null ? ` · ${kc(m.price)}` : ""}</span>
                        <span class="row-title">{m.name}</span>
                        <span class="row-sub">
                          {[m.ordered ? (m.onBurza ? t("mealOnBurza") : t("mealOrdered")) : "", fromBurza ? t("mealInBurza") : "",
                            logged && !m.canChange && !m.burzaUrl ? t("mealLocked") : "", m.allergens.length ? t("mealAllergens", { a: m.allergens.join(", ") }) : ""]
                            .filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      ) : (
        <>
          {burza.loading && !burza.data && <Loading />}
          {burza.error != null && !(burza.error instanceof CanteenAuthError) && <ErrorBox error={burza.error} onRetry={burza.reload} />}
          {burza.data && !burza.data.length && <Empty icon="swap" text={t("burzaEmpty")} />}
          <div class="stack">
            {(burza.data ?? []).map((b) => (
              <button class="row" onClick={() => setOpen({ burza: b })}>
                <span class="row-icon"><Icon name="swap" size={20} /></span>
                <span class="row-main">
                  <span class="row-sub meal-variant">{fmtDate(b.date, true)} · {b.variant}{b.place ? ` · ${b.place}` : ""}</span>
                  <span class="row-title">{b.name}</span>
                  <span class="row-sub">{t("burzaCount", { n: b.count })}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {(logged ? menu.data : pub.data) && <Updated at={(logged ? menu : pub).at} loading={(logged ? menu : pub).loading} onRefresh={reload} />}
      <p class="hint" style={{ margin: "14px 4px" }}>{t("canteenFoot")}</p>

      <CanteenLogin open={login} url={url} onClose={() => setLogin(false)} onDone={() => { setLogin(false); setTimeout(reload, 50); }} />
      <MealSheet open={open} burza={burza.data ?? []} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />
    </Page>
  );
}

function CanteenLogin({ open, url, onClose, onDone }: { open: boolean; url: string; onClose: () => void; onDone: () => void }) {
  const [addr, setAddr] = useState(url);
  const [user, setUser] = useState(canteen.value?.user ?? "");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setAddr(url); setErr(""); setPass(""); } }, [open]);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const ok = await canteenLogin(cleanUrl(addr), user.trim(), pass);
      if (ok) { setPass(""); onDone(); } else setErr(t("canteenBadLogin"));
    } catch (x) { setErr((x as { code?: string }).code === "notcanteen" ? t("canteenNotFound") : errorText(x)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("canteenLoginTitle")}>
      <form class="form" onSubmit={submit} style={{ marginTop: "12px" }}>
        <label>{t("canteenAddress")}<input type="url" inputMode="url" autoComplete="url" required value={addr} onInput={(e) => setAddr((e.target as HTMLInputElement).value)} /></label>
        <label>{t("username")}<input autoComplete="username" autoCapitalize="none" required value={user} onInput={(e) => setUser((e.target as HTMLInputElement).value)} /></label>
        <label>{t("password")}<input type="password" autoComplete="current-password" required value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} /></label>
        <p class="hint">{t("canteenPrivacy")}</p>
        {err && <p class="hint err-text">{err}</p>}
        <button class="btn block" disabled={busy || !user.trim() || !pass}>{busy ? <Spinner small /> : t("canteenLogin")}</button>
      </form>
    </Sheet>
  );
}

/** Details of a meal (or an exchange offer) and the actions; each one needs a second tap because it moves credit. */
function MealSheet({ open, burza, onClose, onDone }: { open: { meal?: Meal; burza?: BurzaItem } | null; burza: BurzaItem[]; onClose: () => void; onDone: () => void }) {
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setSure(null); setErr(""); }, [open]);
  const m = open?.meal;
  const offer = open?.burza ?? (m && !m.ordered ? burza.find((b) => b.date === m.date && b.variant === m.variant) : undefined);

  const actions: { key: string; label: string; confirm: string; link: string; primary?: boolean }[] = [];
  if (m?.orderUrl && m.orderType === "make") actions.push({ key: "make", label: t("mealOrder"), confirm: t("mealOrderSure", { p: m.price != null ? kc(m.price) : "" }), link: m.orderUrl, primary: true });
  if (m?.orderUrl && m.orderType === "reorder") actions.push({ key: "reorder", label: t("mealReorder"), confirm: t("mealReorderSure"), link: m.orderUrl, primary: true });
  if (m?.orderUrl && m.orderType === "delete") actions.push({ key: "delete", label: t("mealCancel"), confirm: t("mealCancelSure"), link: m.orderUrl });
  if (m?.burzaUrl) actions.push(m.onBurza
    ? { key: "minus", label: t("mealFromBurza"), confirm: t("mealFromBurzaSure"), link: m.burzaUrl }
    : { key: "plus", label: t("mealToBurza"), confirm: t("mealToBurzaSure"), link: m.burzaUrl });
  if (offer) actions.push({ key: "take", label: t("burzaTake"), confirm: t("burzaTakeSure"), link: offer.url, primary: true });

  const run = async (a: (typeof actions)[number]) => {
    if (sure !== a.key) { setSure(a.key); return; }
    setBusy(true); setErr("");
    try { await canteenAction(a.link); onDone(); } catch (x) { setErr(errorText(x)); setSure(null); }
    setBusy(false);
  };

  const title = m ? `${m.variant} · ${fmtDate(m.date, true)}` : offer ? `${offer.variant} · ${fmtDate(offer.date, true)}` : "";
  return (
    <Sheet open={!!open} onClose={onClose} title={title} sub={m?.price != null ? kc(m.price) : offer?.place}>
      {(m || offer) && (
        <div>
          <p style={{ fontSize: "15px", margin: "10px 0 6px" }}>{m?.name ?? offer?.name}</p>
          {m?.allergens.length ? <p class="hint">{t("mealAllergens", { a: m.allergens.join(", ") })}</p> : null}
          <p class="hint">{m ? (m.ordered ? (m.onBurza ? t("mealOnBurza") : t("mealOrdered")) : t("mealNotOrdered")) : t("burzaCount", { n: offer!.count })}
            {m && !m.canChange && !m.burzaUrl ? ` · ${t("mealLocked")}` : ""}</p>
          {actions.length > 0 && (
            <div class="btn-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
              {actions.map((a) => (
                <button class={`btn ${a.primary ? "" : "line"} ${sure === a.key ? "danger" : ""}`} disabled={busy} onClick={() => run(a)}>
                  {busy && sure === a.key ? <Spinner small /> : sure === a.key ? a.confirm : a.label}
                </button>
              ))}
            </div>
          )}
          {err && <p class="hint err-text" style={{ marginTop: "10px" }}>{err}</p>}
        </div>
      )}
    </Sheet>
  );
}
