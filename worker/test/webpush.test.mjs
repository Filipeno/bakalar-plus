// Checks our WebCrypto push encryption + VAPID against independent implementations (http_ece, node:crypto).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ece from "http_ece";
import { encryptPayload, vapidAuth, b64u, fromB64u } from "../src/webpush.ts";

// a "browser" subscription
const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
const auth = crypto.randomBytes(16);
const sub = { endpoint: "https://web.push.apple.com/QK-abc", keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };

for (const msg of ["ahoj", JSON.stringify({ title: "Nová známka", body: "1 · Matematika – písemka ✓".repeat(20) })]) {
  const body = Buffer.from(await encryptPayload(sub, new TextEncoder().encode(msg)));
  const plain = ece.decrypt(body, { version: "aes128gcm", privateKey: ua, authSecret: auth });
  assert.equal(plain.toString("utf8"), msg);
}
console.log("✓ payload decrypts with http_ece");

// VAPID: sign with our code, verify with node:crypto
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const pubRaw = b64u(publicKey.export({ format: "der", type: "spki" }).subarray(-65));
const h = await vapidAuth(sub.endpoint, { publicKey: pubRaw, privateJwk: jwk, subject: "mailto:test@example.com" });
const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h);
assert.equal(k, pubRaw);
const [hd, cl, sig] = jwt.split(".");
const claims = JSON.parse(Buffer.from(fromB64u(cl)).toString());
assert.equal(claims.aud, "https://web.push.apple.com");
assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400);
assert.ok(crypto.verify("sha256", Buffer.from(`${hd}.${cl}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(fromB64u(sig))));
console.log("✓ VAPID JWT verifies");
