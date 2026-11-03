import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { CONTENT_SOURCE_PURPOSES } from "../module/services/content-source-service.mjs";

const languages = ["en", "pt-BR"];
const catalogs = Object.fromEntries(languages.map(language => [
  language,
  JSON.parse(fs.readFileSync(`lang/${language}.json`, "utf8"))
]));
const contentSourceTemplate = fs.readFileSync("templates/apps/content-source-config.hbs", "utf8");
const styles = fs.readFileSync("styles/styles.css", "utf8");
const settingsSource = fs.readFileSync("module/settings.js", "utf8");
const importerSource = fs.readFileSync("module/apps/importers.js", "utf8");
const contentSourceApp = fs.readFileSync("module/apps/content-source-config.js", "utf8");

test("content source names and descriptions are available in every supported language", () => {
  for (const definition of Object.values(CONTENT_SOURCE_PURPOSES)) {
    for (const language of languages) {
      assert.ok(catalogs[language][definition.label], `${definition.label} is missing from ${language}`);
      assert.ok(catalogs[language][definition.description], `${definition.description} is missing from ${language}`);
    }
  }
});

test("the system does not distribute content compendiums", () => {
  const manifest = JSON.parse(fs.readFileSync("system.json", "utf8"));
  assert.deepEqual(manifest.packs, []);
});

test("status automation is the localized public name while stable binding IDs remain unchanged", () => {
  assert.equal(catalogs.en["GUM.ContentSources.Purposes.StatusAutomations.Name"], "Status Automations");
  assert.equal(catalogs["pt-BR"]["GUM.ContentSources.Purposes.StatusAutomations.Name"], "Automações de Status");
  assert.ok(CONTENT_SOURCE_PURPOSES.statusBindings);
  assert.deepEqual(CONTENT_SOURCE_PURPOSES.statusBindings.defaults, []);
});

test("library and character import actions are available in every supported language", () => {
  const keys = [
    "GUM.LibraryImport.ImportLibrary",
    "GUM.LibraryImport.ImportCharacter",
    "GUM.LibraryImport.ImportIntoCompendium"
  ];
  for (const key of keys) {
    for (const language of languages) assert.ok(catalogs[language][key], `${key} is missing from ${language}`);
  }
  assert.equal(catalogs.en["GUM.LibraryImport.ImportLibrary"], "Import Library");
  assert.equal(catalogs.en["GUM.LibraryImport.ImportCharacter"], "Import Character");
});

test("content source groups use a compact header grid and distinct card styling", () => {
  assert.match(contentSourceTemplate, /class="content-source-purpose-copy"/);
  assert.match(contentSourceTemplate, /class="content-source-restore"/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(7\.5rem, 0\.25fr\)/);
  assert.match(styles, /border-left:\s*3px solid/);
  assert.match(styles, /content-source-purpose:nth-of-type\(3n \+ 2\)/);
});

test("content source window has a bounded scroll area and a fixed GUM footer", () => {
  assert.match(contentSourceApp, /classes: \["gum", "gum-dialog", "gum-sheet-edit-dialog", "content-source-config"\]/);
  assert.match(contentSourceApp, /width: 720/);
  assert.match(contentSourceApp, /height: 740/);
  assert.match(contentSourceApp, /scrollY: \["\.content-source-scroll"\]/);
  assert.match(contentSourceApp, /this\.render\(false\)/);
  assert.match(contentSourceTemplate, /class="content-source-scroll"/);
  assert.match(contentSourceTemplate, /class="sheet-footer content-source-footer flexrow"/);
  assert.match(styles, /#gum-content-source-config\.app\.window-app \.window-content[\s\S]*?overflow: hidden/);
  assert.match(styles, /\.content-source-config \.content-source-scroll[\s\S]*?overflow-y: auto/);
  assert.match(styles, /\.content-source-config \.sheet-footer[\s\S]*?flex: 0 0 auto/);
  assert.match(styles, /\.source-details strong,[\s\S]*?text-overflow: ellipsis/);
});

test("system settings and compendium context actions have translations in every language", () => {
  const keys = new Set([
    ...settingsSource.matchAll(/"(GUM\.Settings\.[^"]+)"/g),
    ...importerSource.matchAll(/"(GUM\.LibraryImport\.[^"]+)"/g)
  ].map(match => match[1]));
  assert.ok(keys.size > 30);
  for (const key of keys) {
    for (const language of languages) assert.ok(catalogs[language][key], `${key} is missing from ${language}`);
  }
});
