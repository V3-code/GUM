import assert from "node:assert/strict";
import test from "node:test";

import {
  HYBRID_IMPORT_SCOPES,
  hybridImportScopeCapabilities,
  normalizeHybridImportScope
} from "../module/utils/hybrid-import-policy.mjs";

test("hybrid matching scopes expose progressively broader sources", () => {
  assert.deepEqual(HYBRID_IMPORT_SCOPES, ["off", "configured", "configured-world", "all"]);
  assert.deepEqual(hybridImportScopeCapabilities("off"), {
    scope: "off", enabled: false, includeWorldItems: false, includeOtherCompendia: false
  });
  assert.deepEqual(hybridImportScopeCapabilities("configured"), {
    scope: "configured", enabled: true, includeWorldItems: false, includeOtherCompendia: false
  });
  assert.deepEqual(hybridImportScopeCapabilities("configured-world"), {
    scope: "configured-world", enabled: true, includeWorldItems: true, includeOtherCompendia: false
  });
  assert.deepEqual(hybridImportScopeCapabilities("all"), {
    scope: "all", enabled: true, includeWorldItems: true, includeOtherCompendia: true
  });
});

test("legacy broad-search setting is used only while the new scope is unset", () => {
  assert.equal(normalizeHybridImportScope("", { legacySearchAll: false }), "configured");
  assert.equal(normalizeHybridImportScope("", { legacySearchAll: true }), "all");
  assert.equal(normalizeHybridImportScope("off", { legacySearchAll: true }), "off");
});
