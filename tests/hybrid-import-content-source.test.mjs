import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const importer = fs.readFileSync("module/apps/importers.js", "utf8");
const settings = fs.readFileSync("module/settings.js", "utf8");

test("hybrid item matching uses only its configured sources and honors their priority", () => {
  assert.match(importer, /game\.items\.contents/);
  assert.match(importer, /contentSourceService\.getSourceIds\("characterImport"\)/);
  assert.doesNotMatch(importer, /contentSourceService\.getSourceIds\("skills"\)/);
  assert.match(importer, /for \(const pack of configuredPacks\)/);
  assert.match(importer, /highestPriority = Math\.min/);
});

test("world items and unrelated compendia are controlled by the centralized scope", () => {
  assert.match(importer, /hybridImportSearchAllCompendia/);
  assert.match(importer, /policy\.includeWorldItems/);
  assert.match(importer, /policy\.includeOtherCompendia/);
  assert.match(importer, /getHybridImportPolicy/);
  assert.match(settings, /"hybridImportSearchAllCompendia"[\s\S]*?default: false/);
  assert.match(settings, /HYBRID_IMPORT_SCOPE_SETTING[\s\S]*?default: ""/);
});

test("GUM character JSON restoration can opt into the same hybrid resolver", () => {
  assert.match(importer, /prepareGumCharacterImportData/);
  assert.match(importer, /mode: "gum-json"/);
  assert.match(importer, /resolveHybridSourceItem\(\{/);
  assert.match(importer, /Faithful\.Name/);
  assert.match(importer, /"gum-dialog", "gum-sheet-edit-dialog", "gum-character-json-import-dialog"/);
});

test("hybrid matching preserves descriptions authored in the GUM source", () => {
  assert.match(importer, /\["description", "chat_description"\]/);
  assert.match(importer, /mergedSystem\[field\] = foundry\.utils\.deepClone\(sourceText\)/);
});

test("hybrid matching keeps specialization as part of the identity", () => {
  assert.match(importer, /itemNameIdentities\(\{/);
  assert.match(importer, /identity\.nameNorm === wantedIdentity\.nameNorm[\s\S]*?identity\.specializationNorm === wantedIdentity\.specializationNorm/);
  assert.doesNotMatch(importer, /if \(!hit && wantedFullName\)/);
});

test("hybrid matching indexes aliases and preserves the canonical source name", () => {
  assert.match(importer, /"system\.aliases"/);
  assert.match(importer, /matchedBy\?\.startsWith\("alias"\)/);
  assert.match(importer, /merged\.flags\.gum\.hybridImport\.importedName = merged\.name/);
  assert.match(importer, /merged\.name = sourceItem\.name/);
});

test("ambiguous hybrid matches remain inline instead of choosing silently", () => {
  assert.match(importer, /Correspondência híbrida ambígua/);
  assert.match(importer, /return \{ item: null, matchedBy: null, ambiguity \}/);
});
