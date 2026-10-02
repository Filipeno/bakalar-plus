// Small secrets kept on this device only (the canteen password, so the app can sign in again by itself).
// Android: the native side encrypts them with the Android Keystore. iPhone / web: AES-GCM with a key the browser
// generates and keeps in IndexedDB as non-extractable - page scripts can use it but never read it out, and the
// ciphertext alone (localStorage) is useless. Nothing here is ever sent to the Bakaláři+ server.

import { native } from "./native";

const DB = "bp-secrets", STORE = "keys", PREFIX = "bp.secret.";

function idb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

async function key(): Promise<CryptoKey> {
  const db = await idb();
  const get = (): Promise<CryptoKey | undefined> => new Promise((ok, fail) => {
    const q = db.transaction(STORE).objectStore(STORE).get("main");
    q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error);
  });
  let k = await get();
  if (!k) {
    k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((ok, fail) => {
      const q = db.transaction(STORE, "readwrite").objectStore(STORE).put(k, "main");
      q.onsuccess = () => ok(); q.onerror = () => fail(q.error);
    });
  }
  return k;
}

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function secretPut(name: string, value: string): Promise<void> {
  if (native) { await native.call("secretPut", { key: name, value }); return; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(value));
  localStorage.setItem(PREFIX + name, `${b64(iv)}.${b64(ct)}`);
}

export async function secretGet(name: string): Promise<string | null> {
  try {
    if (native) return await native.call<string | null>("secretGet", { key: name });
    const v = localStorage.getItem(PREFIX + name);
    if (!v) return null;
    const [iv, ct] = v.split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct)));
  } catch { return null; }   // key gone (storage cleared) or tampered: just sign in again
}

export async function secretDel(name: string): Promise<void> {
  if (native) { await native.call("secretDel", { key: name }).catch(() => {}); return; }
  localStorage.removeItem(PREFIX + name);
}
