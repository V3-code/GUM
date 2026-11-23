import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sheetSource = readFileSync(new URL("../module/actor/gurps-actor-sheet.js", import.meta.url), "utf8");
const importerSource = readFileSync(new URL("../module/apps/importers.js", import.meta.url), "utf8");

test("a ficha oferece importação do GCS vinculada ao ator aberto", () => {
  assert.match(sheetSource, /_getHeaderButtons\(\)[\s\S]*canUserImportIntoActor\(game\.user, this\.actor\)/);
  assert.match(sheetSource, /importFromGCS\(\{ actor: this\.actor \}\)/);
});

test("a atualização preserva a propriedade e reconcilia documentos incorporados", () => {
  assert.match(importerSource, /buildGCSActorReconciliation\(Array\.from\(actor\.items \|\| \[\]\), actorData\.items \|\| \[\]\)/);
  assert.doesNotMatch(importerSource, /actor\.update\(\{[\s\S]{0,500}ownership:/);
  assert.match(importerSource, /actor\.updateEmbeddedDocuments\("Item", updates\)/);
  assert.match(importerSource, /actor\.deleteEmbeddedDocuments\("Item", removals\)/);
});

test("a importação dirigida não cria outro ator", () => {
  assert.match(importerSource, /if \(actor\) \{[\s\S]*updateActorFromGCS\(actor, actorData, file\.name\)[\s\S]*\} else \{[\s\S]*Actor\.create\(actorData\)/);
});

test("a criação pelo diretório aguarda a inicialização das automações dos itens incorporados", () => {
  assert.match(importerSource, /const created = await Actor\.create\(actorData\);[\s\S]{0,300}syncActorItemAutomations\(created, \{ mode: "initial" \}\)/);
});
