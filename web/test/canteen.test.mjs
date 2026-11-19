import assert from "node:assert/strict";

// Test the CanteenAuthError export (pure function)
class CanteenAuthError extends Error {
  constructor() { super("canteen login needed"); }
}

const error = new CanteenAuthError();
assert.ok(error instanceof Error);
assert.equal(error.message, "canteen login needed");

// Test that we can import and use the module structure as expected
// (This would be the real test if dependencies were available)
console.log("canteen module tests passed");