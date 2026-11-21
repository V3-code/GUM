import assert from "node:assert/strict";
import test from "node:test";

import { parseGCSDamageParts, parseGCSDamageType } from "../module/utils/gcs-damage.mjs";

test("GCS import preserves damage labels instead of translating their abbreviations", () => {
  assert.equal(parseGCSDamageType("cr"), "cr");
  assert.equal(parseGCSDamageType("pi+"), "pi+");
  assert.equal(parseGCSDamageType("pi ++"), "pi++");
  assert.equal(parseGCSDamageType("cr ex"), "cr ex");
});

test("GCS damage parsing preserves piercing grades and decorated types", () => {
  assert.deepEqual(parseGCSDamageParts({ base: "2d", type: "pi++" }), {
    formula: "2d",
    type: "pi++",
    scaling: ""
  });
  assert.deepEqual(parseGCSDamageParts({ base: "sw+2", type: "cr ex" }), {
    formula: "sw+2",
    type: "cr ex",
    scaling: ""
  });
});
