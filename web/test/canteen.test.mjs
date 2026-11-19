import assert from "node:assert/strict";
import { CanteenAuthError, guessCanteenUrl, cleanUrl, parsePublicMenu, parseMenu, parseAccount, parseBurza } from "../src/lib/canteen.ts";

// Test CanteenAuthError
const error = new CanteenAuthError();
assert.ok(error instanceof Error);
assert.equal(error.message, "canteen login needed");

// Test guessCanteenUrl function
assert.equal(guessCanteenUrl("https://bakalar.trebesin.cz"), "https://jidelna.trebesin.cz");
assert.equal(guessCanteenUrl("https://school.edu"), "https://jidelna.edu");
assert.equal(guessCanteenUrl("bakalar.trebesin.cz"), "https://jidelna.trebesin.cz");

// Test cleanUrl function
assert.equal(cleanUrl("https://example.com"), "https://example.com");
assert.equal(cleanUrl("http://example.com"), "https://example.com");
assert.equal(cleanUrl("example.com"), "https://example.com");
assert.equal(cleanUrl("example.com/"), "https://example.com");

// Test parsePublicMenu with sample HTML
const publicMenuHtml = `
<div class="jidelnicekDen">
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
assert.equal(publicMenu.length, 0); // No date in sample

// Test parseMenu with sample HTML
const menuHtml = `
<div class="jidelnicekItemWrapper">
  <div class="jidWrapCenter">
    <span class="textGrey">1, 3</span>
    <span>Polévka</span>
  </div>
  <span class="smallBoldTitle">Oběd 1</span>
</div>
`;
const menu = parseMenu(menuHtml);
assert.ok(Array.isArray(menu));
assert.equal(menu.length, 0); // No date in sample

// Test parseAccount with sample HTML
const accountHtml = `
<div id="Kredit">123.45</div>
<div id="PoslObj">15. 12. 2026</div>
`;
const account = parseAccount(accountHtml);
assert.equal(account.credit, 123.45);
assert.equal(account.orderedUntil, "2026-12-15");

// Test parseBurza with sample HTML
const burzaHtml = `
<table>
  <tr class="mouseOutRow">
    <td>15. 12. 2026</td>
    <td>Oběd 1</td>
    <td>Polévka</td>
    <td>Ulice 123</td>
    <td>2</td>
  </tr>
</table>
`;
const burza = parseBurza(burzaHtml);
assert.ok(Array.isArray(burza));
assert.equal(burza.length, 1);
assert.equal(burza[0].date, "2026-12-15");
assert.equal(burza[0].variant, "Oběd 1");
assert.equal(burza[0].name, "Polévka");
assert.equal(burza[0].place, "Ulice 123");
assert.equal(burza[0].count, 2);

console.log("canteen module tests passed");