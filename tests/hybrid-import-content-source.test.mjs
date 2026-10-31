import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const importer = fs.readFileSync("module/apps/importers.js", "utf8");
const settings = fs.readFileSync("module/settings.js", "utf8");

test("hybrid character import searches world items before configured sources", () => {
  assert.match(importer, /game\.items\.contents/);
  assert.match(importer, /contentSourceService\.getSourceIds\("skills"\)/);
  assert.match(importer, /contentSourceService\.getSourceIds\("characterImport"\)/);
  assert.match(importer, /highestPriority = Math\.min/);
});

test("searching unrelated compendia is explicit and disabled by default", () => {
  assert.match(importer, /hybridImportSearchAllCompendia/);
  assert.match(importer, /searchAllCompendia\s*\? game\.packs\.filter/);
  assert.match(settings, /"hybridImportSearchAllCompendia"[\s\S]*?default: false/);
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
