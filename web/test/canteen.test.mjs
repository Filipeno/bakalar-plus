import assert from "node:assert/strict";
import { guessCanteenUrl, cleanUrl } from "../src/lib/canteen.ts";

// Test the pure functions that are exported by canteen.ts

// Test guessCanteenUrl function with various inputs
assert.equal(guessCanteenUrl("https://bakalar.trebesin.cz"), "https://jidelna.trebesin.cz");
assert.equal(guessCanteenUrl("https://school.example.com"), "https://jidelna.example.com");
assert.equal(guessCanteenUrl("http://example.org"), "https://jidelna.example.org");

// Test cleanUrl function with various inputs
assert.equal(cleanUrl("https://example.com"), "https://example.com");
assert.equal(cleanUrl("http://example.com"), "https://example.com");
assert.equal(cleanUrl("example.com"), "https://example.com");

console.log("canteen tests passed");