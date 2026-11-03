import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const template = fs.readFileSync(new URL("../templates/apps/gm-screen.hbs", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const coreStyles = fs.readFileSync(new URL("../styles/styles.css", import.meta.url), "utf8");
const application = fs.readFileSync(new URL("../module/apps/gm-screen.js", import.meta.url), "utf8");
const macroBrowser = fs.readFileSync(new URL("../module/apps/gm-macro-browser.js", import.meta.url), "utf8");
const macroBrowserTemplate = fs.readFileSync(new URL("../templates/apps/gm-macro-browser.hbs", import.meta.url), "utf8");
const rollTableBrowser = fs.readFileSync(new URL("../module/apps/gm-roll-table-browser.js", import.meta.url), "utf8");
const rollTableBrowserTemplate = fs.readFileSync(new URL("../templates/apps/gm-roll-table-browser.hbs", import.meta.url), "utf8");
const pt = JSON.parse(fs.readFileSync(new URL("../lang/pt-BR.json", import.meta.url), "utf8"));
const en = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

test("GM Screen separates target actions, workspace navigation, and utility tools", () => {
    const sidebarEnd = template.indexOf("</aside>");
    const requestIndex = template.indexOf('class="gm-request-test"');
    const quickRollIndex = template.indexOf('data-utility-content="quick-roll"');
    const manualIndex = template.indexOf('data-utility-content="manual-modifier"');

    assert.ok(requestIndex > 0 && requestIndex < sidebarEnd);
    assert.ok(quickRollIndex > sidebarEnd);
    assert.ok(manualIndex > sidebarEnd);
    assert.match(template, /gm-main-toolbar[\s\S]*?gm-workspace-tabs[\s\S]*?screen-body[\s\S]*?gm-utility-dock/);
    assert.match(styles, /bulk-clear-layout-btn\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
    assert.match(styles, /gm-main-toolbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(120px, 1fr\) auto 32px auto auto 28px;/);
    assert.match(coreStyles, /dialog\.gum \.window-header[\s\S]*?color:\s*var\(--gum-text-claro/);
    assert.match(template, /data-utility-panel="quick-roll"/);
    assert.match(template, /data-utility-panel="manual-modifier"/);
});

test("GM Screen compact mode follows the application width and keeps one utility panel open", () => {
    assert.match(application, /width:\s*1200,[\s\S]*?minWidth:\s*720,[\s\S]*?minHeight:\s*420,[\s\S]*?resizable:\s*true/);
    assert.match(styles, /container-name:\s*gum-gm-screen/);
    assert.match(styles, /gm-screen \.window-content\s*\{[\s\S]*?min-width:\s*0;/);
    assert.match(styles, /gm-screen\.window-app \.window-resizable-handle\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?z-index:\s*100;[\s\S]*?pointer-events:\s*auto;/);
    assert.match(styles, /@container gum-gm-screen \(max-width:\s*900px\)/);
    assert.match(styles, /@container gum-gm-screen \(max-width:\s*700px\)/);
    assert.doesNotMatch(styles, /@container gum-gm-screen \(max-width:\s*540px\)\s*\{[\s\S]*?gm-screen-layout/);
    assert.match(styles, /gm-utility-toggle-row[\s\S]*?grid-template-columns:\s*repeat\(2,/);
    assert.match(application, /this\.utilityPanel = this\.utilityPanel === panel \? null : panel/);
    assert.match(application, /quickRollOpen:\s*this\.utilityPanel === "quick-roll"/);
    assert.match(application, /manualOpen:\s*this\.utilityPanel === "manual-modifier"/);
});

test("GM Screen keeps the monitor column at its fixed width and exposes the GM target marker", () => {
    assert.match(styles, /gm-screen \.gm-screen-layout\s*\{[\s\S]*?grid-template-columns:\s*290px minmax\(0, 1fr\)/);
    assert.doesNotMatch(styles, /grid-template-columns:\s*(?:minmax\(230px, 280px\)|220px) minmax\(0, 1fr\)/);
    assert.match(template, /monitor-card[\s\S]*?is-gm-target[\s\S]*?monitor-card-target-marker/);
    assert.match(template, /player-targeters[\s\S]*?player-target-dot/);
    assert.match(styles, /player-target-dot\s*\{[\s\S]*?background:\s*var\(--gm-player-target-color/);
    assert.match(styles, /monitor-card-target-marker\s*\{[\s\S]*?left:\s*7px;/);
    assert.match(styles, /passive-defenses\s*\{\s*justify-content:\s*space-between;/);
    assert.match(application, /Hooks\.on\("targetToken", this\._onTargetToken\)/);
    assert.match(application, /Hooks\.off\("targetToken", this\._onTargetToken\)/);
});

test("GM Screen preserves and reapplies its modifier search across renders", () => {
    assert.match(application, /this\.searchQuery = ""/);
    assert.match(template, /class="mod-search" value="\{\{searchQuery\}\}"/);
    assert.match(application, /html\.find\('\.mod-search'\)\.on\('input'/);
    assert.match(application, /this\._applyModifierSearch\(html\)/);
    assert.match(application, /normalize\("NFD"\)/);
});

test("all GM Screen localization keys exist in English and Portuguese", () => {
    const templateKeys = [...`${template}\n${macroBrowserTemplate}\n${rollTableBrowserTemplate}`.matchAll(/localize\s+["']([^"']+)["']/g)].map(match => match[1]);
    const applicationKeys = [...`${application}\n${macroBrowser}\n${rollTableBrowser}`.matchAll(/["'](GUM\.GMScreen\.[A-Za-z0-9.-]+)["']/g)].map(match => match[1]);
    const keys = [...templateKeys, ...applicationKeys];
    assert.ok(keys.length > 60);

    for (const key of new Set(keys)) {
        assert.equal(typeof pt[key], "string", `missing pt-BR key ${key}`);
        assert.equal(typeof en[key], "string", `missing en key ${key}`);
    }
});

test("the card quick-use menu is draggable and initially clamped to the viewport", () => {
    assert.match(application, /gum-ctx-header[\s\S]*?DragQuickMenuHint/);
    assert.match(application, /clampFloatingPanelPosition\(/);
    assert.match(application, /pointerdown\.gum-ctx-drag/);
    assert.match(application, /pointermove\.gum-ctx-drag/);
    assert.match(styles, /\.gum-ctx-header\s*\{[\s\S]*?cursor:\s*grab;/);
    assert.match(styles, /\.gum-ctx-menu\.is-dragging \.gum-ctx-header\s*\{ cursor:\s*grabbing; \}/);
});

