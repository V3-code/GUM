import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActorEffectTarget,
  buildActorEffectTargets,
  getActorEvaluationKey,
  isActorContextAvailable,
  isMissingSyntheticActorContextError
} from "../module/utils/condition-actor-context.mjs";

test("world actor remains the sole effect owner even when it has active tokens", () => {
  const syntheticActor = { id: "actor-1", uuid: "Scene.scene.Token.token.Actor.actor-1" };
  const actor = {
    id: "actor-1",
    uuid: "Actor.actor-1",
    name: "Herói",
    img: "hero.webp",
    isToken: false,
    getActiveTokens: () => [{ actor: syntheticActor }]
  };

  const targets = buildActorEffectTargets(actor);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].actor, actor);
  assert.equal(targets[0].id, null);
});

test("synthetic actor retains its own token as effect and visual context", () => {
  const actor = { id: "actor-1", uuid: "Scene.scene.Token.token.Actor.actor-1", isToken: true };
  const tokenObject = { id: "token", actor };
  const tokenDocument = { id: "token", actor, object: tokenObject };
  tokenDocument.parent = { tokens: new Map([[tokenDocument.id, tokenDocument]]) };
  actor.token = tokenDocument;

  assert.equal(buildActorEffectTarget(actor), tokenObject);
});

test("separate unlinked token actors have separate evaluation keys", () => {
  const worldActor = { id: "actor-1", uuid: "Actor.actor-1" };
  const firstTokenActor = { id: "actor-1", uuid: "Scene.scene.Token.first.Actor.actor-1", isToken: true };
  const secondTokenActor = { id: "actor-1", uuid: "Scene.scene.Token.second.Actor.actor-1", isToken: true };

  assert.notEqual(getActorEvaluationKey(worldActor), getActorEvaluationKey(firstTokenActor));
  assert.notEqual(getActorEvaluationKey(firstTokenActor), getActorEvaluationKey(secondTokenActor));
});

test("missing actors do not produce effect targets or evaluation keys", () => {
  assert.equal(buildActorEffectTarget(null), null);
  assert.deepEqual(buildActorEffectTargets(null), []);
  assert.equal(getActorEvaluationKey(null), null);
});

test("status reconciliation skips orphaned synthetic token actors", () => {
  const liveToken = { id: "live", parent: null };
  const scene = { tokens: new Map([[liveToken.id, liveToken]]) };
  liveToken.parent = scene;

  assert.equal(isActorContextAvailable({ id: "world", isToken: false }), true);
  assert.equal(isActorContextAvailable({ isToken: true, token: liveToken }), true);

  scene.tokens.delete(liveToken.id);
  assert.equal(isActorContextAvailable({ isToken: true, token: liveToken }), false);
  assert.equal(isActorContextAvailable({ isToken: true, token: null }), false);
  assert.equal(isActorContextAvailable(null), false);
});

test("ActiveEffects embedded in Items are not treated as Actor runtime effects", () => {
  assert.equal(isActorContextAvailable({ documentName: "Item", isToken: false }), false);
  assert.equal(isActorContextAvailable({ documentName: "Actor", isToken: false }), true);
});

test("effect targets and backend race errors reject orphaned synthetic actors", () => {
  const token = { id: "gone", parent: null };
  const scene = { tokens: new Map() };
  token.parent = scene;
  const actor = { isToken: true, token };
  const error = new Error("undefined id [gone] does not exist in the EmbeddedCollection collection.");
  error.stack = `${error.message}\n    at Scene.getEmbeddedDocument (foundry.mjs:1:1)`;

  assert.equal(buildActorEffectTarget(actor), null);
  assert.deepEqual(buildActorEffectTargets(actor), []);
  assert.equal(isMissingSyntheticActorContextError(error, actor), true);
  assert.equal(isMissingSyntheticActorContextError(error, { isToken: false }), false);
});
