import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importer = readFileSync(new URL("../module/apps/importers.js", import.meta.url), "utf8");
const main = readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles/styles.css", import.meta.url), "utf8");

test("o diretório de compêndios oferece importação global e contextual", () => {
  assert.match(importer, /renderCompendiumDirectory/);
  assert.match(importer, /getCompendiumContextOptions/);
  assert.match(importer, /getCompendiumDirectoryEntryContext/);
  assert.match(importer, /Hooks\.on\("getCompendiumDirectoryEntryContext", registerCompendiumContextOptions\)/);
  assert.match(importer, /Hooks\.on\("getCompendiumContextOptions", registerCompendiumContextOptions\)/);
  assert.match(importer, /GUM\.LibraryImport\.ImportIntoCompendium/);
  assert.match(importer, /importFromJson\(\{ pack \}\)/);
});

test("o diretório oferece importação em lote de Modelos GCS para um compêndio", () => {
  assert.match(importer, /gum-compendium-import-templates-button/);
  assert.match(importer, /ImportTemplatesIntoCompendium/);
  assert.match(importer, /importGCSTemplatesToCompendium\(\{ pack \}\)/);
  assert.match(importer, /input\.multiple = true/);
  assert.match(importer, /createGCSTemplatesInCompendium\(pack, templates\)/);
});

test("a importação permite criar um compêndio mundial de Item", () => {
  assert.match(importer, /CreateNewCompendium/);
  assert.match(importer, /foundry\?\.documents\?\.collections\?\.CompendiumCollection/);
  assert.match(importer, /CompendiumClass\.createCompendium\(\{ label, type: "Item" \}\)/);
  assert.doesNotMatch(importer, /createCompendium\(\{[^}]*package:/);
});

test("a janela de importação é localizada e explica a sincronização por ID", () => {
  assert.match(importer, /SelectImportDestination/);
  assert.match(importer, /RemoveMissingLabel/);
  assert.match(importer, /previewCompendiumJsonSynchronization/);
  assert.match(importer, /SameNameDifferentId/);
});

test("os botões de importação dos diretórios ocupam uma linha independente", () => {
  assert.match(importer, /headerActions\.append\(row\)/);
  assert.match(main, /headerActions\.append\(row\)/);
});

test("o menu contextual oferece campos legados e modernos do Foundry", () => {
  assert.match(importer, /label: importLabel/);
  assert.match(importer, /condition: visible,[\s\S]*visible,[\s\S]*callback: entry => activate\(entry\),[\s\S]*onClick: \(_event, entry\) => activate\(entry\)/);
});

test("o menu contextual permite exportar e limpar compêndios de Item para o mestre", () => {
  assert.match(importer, /GUM\.LibraryImport\.ExportCompendium/);
  assert.match(importer, /GUM\.LibraryImport\.ClearCompendium/);
  assert.match(importer, /confirmAndClearCompendium/);
  assert.match(importer, /Item\.deleteDocuments/);
  assert.match(importer, /Folder\.deleteDocuments/);
});

test("a janela de destino usa formulário e seletor visual de modo", () => {
  assert.match(importer, /gum-compendium-import-form/);
  assert.match(importer, /gum-import-mode-picker/);
  assert.match(importer, /gum-compendium-import-dialog/);
  assert.match(importer, /classes: \["dialog", "gum", "gum-compendium-import-dialog"\]/);
  assert.match(importer, /width: 620/);
});

test("criar novo compêndio é o destino padrão quando o usuário pode criá-lo", () => {
  assert.match(importer, /const preferNewBundlePack = canCreatePack;/);
  assert.match(importer, /value="new" \$\{preferNewBundlePack \|\| !allItemPacks\.length \? "checked" : ""\}/);
});

test("o diretório de atores distingue importações GCS e JSON do GUM", () => {
  assert.match(main, /GUM\.LibraryImport\.ImportGCSCharacter/);
  assert.match(main, /GUM\.LibraryImport\.ImportGumCharacter/);
  assert.doesNotMatch(main, /> Importar do GCS/);
});

test("os menus de compêndio usam opções com fundo escuro e texto legível", () => {
  assert.match(styles, /gum-compendium-import-dialog select option,[\s\S]*background-color: #181b20;[\s\S]*color: #f0ede7;/);
  assert.match(styles, /content-source-add select option,[\s\S]*background-color: #181b20;[\s\S]*color: #f0ede7;/);
  assert.match(styles, /color-scheme: dark;/);
});
