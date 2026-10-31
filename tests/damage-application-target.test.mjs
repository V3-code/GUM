import assert from "node:assert/strict";
import test from "node:test";

import { resolveDamageApplicationTarget } from "../module/utils/damage-application-target.mjs";

const token = id => ({ id, actor: { id: `actor-${id}` } });

test("damage application prioritizes a Foundry target over the controlled token", () => {
  const targeted = token("targeted");
  const controlled = token("controlled");
  assert.deepEqual(resolveDamageApplicationTarget({
    targetedTokens: [targeted],
    controlledTokens: [controlled]
  }), { token: targeted, source: "target", reason: null });
});

test("damage application falls back to exactly one controlled token", () => {
  const controlled = token("controlled");
  assert.deepEqual(resolveDamageApplicationTarget({ controlledTokens: [controlled] }), {
    token: controlled,
    source: "controlled",
    reason: null
  });
});

test("damage application uses the card-bound target before the controlled token", () => {
  const preferred = token("bound");
  const controlled = token("controlled");
  assert.deepEqual(resolveDamageApplicationTarget({
    preferredTokens: [preferred],
    controlledTokens: [controlled]
  }), { token: preferred, source: "preferred", reason: null });
});

test("an explicitly targeted token overrides the card-bound target", () => {
  const targeted = token("targeted");
  assert.equal(resolveDamageApplicationTarget({
    targetedTokens: [targeted],
    preferredTokens: [token("bound")]
  }).token, targeted);
});

test("damage application rejects ambiguous or missing destinations", () => {
  assert.equal(resolveDamageApplicationTarget({ targetedTokens: [token("a"), token("b")] }).reason, "multiple-targets");
  assert.equal(resolveDamageApplicationTarget({ preferredTokens: [token("a"), token("b")] }).reason, "multiple-preferred");
  assert.equal(resolveDamageApplicationTarget({ controlledTokens: [token("a"), token("b")] }).reason, "multiple-controlled");
  assert.equal(resolveDamageApplicationTarget().reason, "missing-target");
});
