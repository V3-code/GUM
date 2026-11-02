import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
    moveEntryById,
    moveUuidBetweenGroups,
    normalizeMacroExecutionMode,
    planGMScreenMacroExecution
} from "../module/utils/gm-screen-layout.mjs";

const application = fs.readFileSync(new URL("../module/apps/gm-screen.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/apps/gm-screen.hbs", import.meta.url), "utf8");
const macroBrowser = fs.readFileSync(new URL("../module/apps/gm-macro-browser.js", import.meta.url), "utf8");

test("layout entries can be moved to a bounded target index", () => {
    const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(moveEntryById(entries, "a", 2).map(entry => entry.id), ["b", "c", "a"]);
    assert.deepEqual(moveEntryById(entries, "c", -5).map(entry => entry.id), ["c", "a", "b"]);
    assert.deepEqual(entries.map(entry => entry.id), ["a", "b", "c"], "the helper must not mutate the original array");
});

test("items move within and between groups without duplicates", () => {
    const source = { items: ["one", "two", "three"] };
    assert.equal(moveUuidBetweenGroups(source, source, "one", 2), true);
    assert.deepEqual(source.items, ["two", "three", "one"]);

    const target = { items: ["two", "other"] };
    assert.equal(moveUuidBetweenGroups(source, target, "two", 1), true);
    assert.deepEqual(source.items, ["three", "one"]);
    assert.deepEqual(target.items, ["other", "two"]);
});

test("the GM Screen exposes an explicit, local layout editor", () => {
    assert.match(application, /this\.layoutEditMode = false/);
    assert.match(application, /GM_SCREEN_LAYOUT_DRAG_TYPE/);
    assert.match(application, /if \(!this\.layoutEditMode\) return;/);
    assert.match(template, /class="layout-edit-toggle/);
    assert.match(template, /class="layout-drag-handle group-drag-handle"/);
    assert.match(template, /class="layout-drag-handle item-drag-handle"/);
    assert.match(template, /LayoutEditingActive/);
});

test("macro execution modes validate and partition GM targets", () => {
    const first = { id: "first" };
    const second = { id: "second" };
    assert.equal(normalizeMacroExecutionMode("unknown"), "standard");
    assert.deepEqual(planGMScreenMacroExecution("single-target", []).reason, "single-target");
    assert.deepEqual(planGMScreenMacroExecution("single-target", [first]).executions, [{ target: first, targets: [first] }]);
    assert.deepEqual(planGMScreenMacroExecution("each-target", [first, second]).executions, [
        { target: first, targets: [first] },
        { target: second, targets: [second] }
    ]);
    assert.deepEqual(planGMScreenMacroExecution("standard", [first, second]).executions, [
        { target: null, targets: [first, second] }
    ]);
});

test("macro cards use explicit execution and remain separate from modifier selection", () => {
    assert.match(application, /macro\.documentName !== "Macro"/);
    assert.match(application, /if \(btn\.data\('documentName'\) === 'Macro'\) return/);
    assert.match(application, /this\._runningMacros\.has\(executionKey\)/);
    assert.match(application, /macro\.execute\(\{ targets, origin, gmScreen \}\)/);
    assert.match(template, /class="macro-run-btn/);
    assert.match(template, /class="macro-execution-mode"/);
    assert.match(macroBrowser, /game\.macros/);
});
