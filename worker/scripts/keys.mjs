// Prints fresh secrets for the Worker. Put each one in with `npx wrangler secret put NAME`
// (and into .dev.vars for `wrangler dev`). Never commit them.
import { webcrypto as c } from "node:crypto";
const b64u = (b) => Buffer.from(b).toString("base64url");
const kp = await c.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await c.subtle.exportKey("jwk", kp.privateKey);
const pub = await c.subtle.exportKey("raw", kp.publicKey);
console.log(`SESSION_SECRET=${b64u(c.getRandomValues(new Uint8Array(32)))}`);
console.log(`TOKEN_KEY=${b64u(c.getRandomValues(new Uint8Array(32)))}`);
console.log(`VAPID_PUBLIC=${b64u(pub)}`);
console.log(`VAPID_PRIVATE_JWK=${JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })}`);
