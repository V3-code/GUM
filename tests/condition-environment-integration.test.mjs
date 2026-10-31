import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../scripts/main.js", import.meta.url), "utf8");

test("token movement emits normalized region enter and exit condition events", () => {
  assert.match(main, /Hooks\.on\("moveToken"[\s\S]*collectRegionConditionTransitions\(token, priorRegionIds\)/);
  assert.match(main, /buildRegionConditionEvent\(\{[\s\S]*phase: transition\.phase[\s\S]*region: transition\.region/);
});

test("token creation inside a region emits an enter condition event", () => {
  assert.match(main, /Hooks\.on\("createToken"[\s\S]*phase: "enter"[\s\S]*region,[\s\S]*token/);
});

test("scene darkness and world time changes are routed to condition actors", () => {
  assert.match(main, /Hooks\.on\("preUpdateScene"[\s\S]*gumPreviousDarknessLevel/);
  assert.match(main, /Hooks\.on\("updateScene"[\s\S]*buildSceneDarknessConditionEvent[\s\S]*collectSceneConditionActors/);
  assert.match(main, /Hooks\.on\("updateWorldTime"[\s\S]*buildWorldTimeConditionEvent[\s\S]*getWorldStatusRuntimeActors/);
});
