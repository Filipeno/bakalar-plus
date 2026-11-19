import assert from "node:assert/strict";
import { CanteenAuthError, guessCanteenUrl, cleanUrl, parsePublicMenu, parseMenu, parseAccount, parseBurza } from "../src/lib/canteen.ts";

// Test CanteenAuthError class
const error = new CanteenAuthError();
assert.ok(error instanceof Error);
assert.equal(error.message, "canteen login needed");

// Test guessCanteenUrl function with various inputs
assert.equal(guessCanteenUrl("https://bakalar.trebesin.cz"), "https://jidelna.trebesin.cz");
assert.equal(guessCanteenUrl("https://school.edu"), "https://jidelna.edu");
assert.equal(guessCanteenUrl("bakalar.trebesin.cz"), "https://jidelna.trebesin.cz");

// Test cleanUrl function with various inputs
assert.equal(cleanUrl("https://example.com"), "https://example.com");
assert.equal(cleanUrl("http://example.com"), "https://example.com");
assert.equal(cleanUrl("example.com"), "https://example.com");
assert.equal(cleanUrl("example.com/"), "https://example.com");

// Test parsePublicMenu with sample HTML - checking array structure
const publicMenuHtml = `
<div class="jidelnicekDen day-2026-12-15">
  <div class="container">
    <span class="smallBoldTitle">Oběd 1</span>
    <div class="jidelnicekItem">
      <span class="textGrey">1, 3</span>
      <span>Polévka</span>
    </div>
  </div>
</div>
`;
const publicMenu = parsePublicMenu(publicMenuHtml);
assert.ok(Array.isArray(publicMenu));

// Test parseAccount with sample HTML
const accountHtml = `
<div id="Kredit">123.45</div>
<div id="PoslObj">15. 12. 2026</div>
`;
const account = parseAccount(accountHtml);
assert.equal(account.credit, 123.45);
assert.equal(account.orderedUntil, "2026-12-15");

console.log("canteen module tests passed");