import { calculateItemTraitCost, importGCSTraitCost, importGCSModifier } from "../utils/trait-cost.mjs";
import { getBodyProfile } from "../config/body-profiles.js";
import { buildGCSActorReconciliation } from "../utils/gcs-actor-reconciliation.mjs";
import { canUserCreateActors, canUserImportIntoActor } from "../utils/actor-creation-permission.mjs";
import { contentSourceService } from "../services/content-source-service.mjs";
import { prepareGCSActorItemChanges } from "../utils/gcs-container-reconciliation.mjs";
import { buildCompendiumLibraryExport, parseCompendiumLibraryExport, previewCompendiumJsonSynchronization, sortCompendiumFoldersParentFirst } from "../utils/compendium-library-json.mjs";
import { GUM_ITEM_BUNDLE_VERSION, parseItemBundle, prepareItemBundle, previewItemBundleSynchronization, stableBundleDocumentId } from "../utils/item-bundle-json.mjs";
import { itemNameIdentities, itemNameIdentity, normalizeItemAliases, normalizeItemName } from "../utils/item-name-aliases.mjs";
import { HYBRID_IMPORT_SCOPE_SETTING, hybridImportScopeCapabilities, normalizeHybridImportScope } from "../utils/hybrid-import-policy.mjs";

const GCS_LIBRARY_TYPES_BY_EXTENSION = {
    skl: "skill", spl: "spell", eqp: "equipment", adq: "advantage",
    adm: "modifier", eqm: "eqp_modifier"
};

function inferGCSLibraryItemType(extension, importEntries, pack = null) {
    const packType = {
        skills: "skill", advantages: "advantage", disadvantages: "disadvantage",
        spells: "spell", powers: "power", equipment: "equipment",
        modifiers: "modifier", eqp_modifiers: "eqp_modifier"
    }[pack?.metadata?.name];
    return packType || GCS_LIBRARY_TYPES_BY_EXTENSION[extension] || importEntries[0]?.itemData?.type || null;
}

export async function createWorldItemCompendium(label) {
    const CompendiumClass = globalThis.foundry?.documents?.collections?.CompendiumCollection
        ?? globalThis.CompendiumCollection;
    if (!CompendiumClass?.createCompendium) {
        throw new Error("The Foundry CompendiumCollection API is not available.");
    }
    // Foundry generates the world pack name and package metadata server-side.
    // Passing manifest-only fields such as `package` fails schema validation in V13+.
    return CompendiumClass.createCompendium({ label, type: "Item" });
}
/**
 * Lida com a importação de um arquivo JSON (formato customizado) OU
 * um arquivo de Biblioteca GCS (.skl, .spl, .eqp, .adq, .adm, .eqm) para um compêndio.
 */
export async function importFromJson({ pack: fixedPack = null } = {}) {
    const t = key => game.i18n.localize(`GUM.LibraryImport.${key}`);
    const format = (key, data) => game.i18n.format(`GUM.LibraryImport.${key}`, data);
    // 1. Cria um elemento <input> de arquivo, escondido
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json, .gcs, .skl, .spl, .eqp, .adq, .adm, .eqm';

    // 2. Adiciona um "listener"
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
            return ui.notifications.info("Importação cancelada.");
        }

        // 3. Lê o arquivo
        const fileContent = await file.text();
        let data;
        try {
            data = JSON.parse(fileContent);
        } catch (err) {
            console.error("GUM | Erro ao processar arquivo de biblioteca:", err);
            return ui.notifications.error("O arquivo está corrompido ou não é um JSON válido.");
        }

        const extension = (file.name?.split('.')?.pop() || '').toLowerCase();

        // 5. Determina o que importar
        let importEntries = [];
        let compendiumFolders = [];
        let portableLibrary = null;
        let itemBundle = null;
        try {
            itemBundle = parseItemBundle(data);
            portableLibrary = itemBundle ? null : parseCompendiumLibraryExport(data);
        } catch (err) {
            return ui.notifications.error(err.message);
        }

        if (itemBundle) {
            importEntries = Object.entries(itemBundle.documents).map(([key, itemData]) => ({ key, itemData, folderPath: [] }));
        } else if (portableLibrary) {
            if (portableLibrary.documentType !== "Item") {
                return ui.notifications.error(`O arquivo contém documentos do tipo "${portableLibrary.documentType}", mas este importador aceita apenas Itens.`);
            }
            importEntries = portableLibrary.documents.map(item => ({ itemData: item, folderPath: [] }));
            compendiumFolders = portableLibrary.folders;
        } else if (data?.type && data?.system && data?.name) {
            importEntries = [{ itemData: data, folderPath: [] }];
        } else if (Array.isArray(data)) {
            const looksLikeGCSRows = data.some(entry =>
                entry && typeof entry === "object" && (
                    Array.isArray(entry.children) ||
                    Array.isArray(entry.modifiers) ||
                    entry.base_points !== undefined ||
                    entry.points_per_level !== undefined ||
                    entry.reference !== undefined
                )
            );

            importEntries = looksLikeGCSRows
                ? collectGCSImportEntries(data)
                : data.map(item => ({ itemData: item, folderPath: [] })); // Formato JSON Simples
        } else if (data.rows && Array.isArray(data.rows)) {
            importEntries = collectGCSImportEntries(data.rows); // Formato de Biblioteca GCS (com children)
        } else if (
            Array.isArray(data.skills) ||
            Array.isArray(data.spells) ||
            Array.isArray(data.equipment) ||
            Array.isArray(data.traits) ||
            Array.isArray(data.modifiers)
        ) {
            const roots = data.skills || data.spells || data.equipment || data.traits || data.modifiers || [];
            importEntries = collectGCSImportEntries(roots);
        } else {
            return ui.notifications.error("O formato do JSON não foi reconhecido. Esperando uma lista de itens ou um objeto GCS com uma propriedade 'rows'.");
        }

        if (importEntries.length === 0 && !portableLibrary && !itemBundle) {
            return ui.notifications.error("Nenhum item encontrado no arquivo.");
        }

        const isCompendiumJson = !itemBundle && (Boolean(portableLibrary) || Boolean(data?.type && data?.system && data?.name) || (
            Array.isArray(data) && importEntries.some(entry =>
                entry?.itemData && typeof entry.itemData === "object" &&
                (entry.itemData._id || entry.itemData.system)
            )
        ));

        if (isCompendiumJson) {
            const missingIds = importEntries.filter(entry => !entry.itemData._id);
            if (missingIds.length) {
                return ui.notifications.error(`Importação cancelada: ${missingIds.length} documento(s) não possuem o campo "_id".`);
            }

            const seenIds = new Set();
            const duplicateIds = new Set();
            for (const { itemData } of importEntries) {
                if (seenIds.has(itemData._id)) duplicateIds.add(itemData._id);
                seenIds.add(itemData._id);
            }
            if (duplicateIds.size) {
                return ui.notifications.error(`Importação cancelada: IDs repetidos no JSON: ${[...duplicateIds].join(", ")}.`);
            }
        }

        // 6. Pergunta ao usuário para qual compêndio importar
        const allItemPacks = game.packs.filter(p => p.metadata.type === "Item");

        const packOptions = allItemPacks.map(pack => {
            return `<option value="${pack.collection}">${pack.title}</option>`;
        }).join('');

        const inferredType = inferGCSLibraryItemType(extension, importEntries, fixedPack);
        const typeField = GCS_LIBRARY_TYPES_BY_EXTENSION[extension] ? `
            <div class="form-group">
                <label>${t("LibraryType")}</label>
                <select name="library-item-type">
                    ${[
                        "skill", "spell", "equipment", "advantage", "disadvantage", "modifier", "eqp_modifier"
                    ].map(value => `<option value="${value}" ${value === inferredType ? "selected" : ""}>${t(`ItemType.${value}`)}</option>`).join("")}
                </select>
            </div>` : "";
        const canCreatePack = Boolean(game.user?.isGM && !fixedPack);
        const preferNewBundlePack = canCreatePack;
        const destinationFields = fixedPack ? `
            <div class="gum-import-destination-summary">
                <i class="fas fa-book"></i>
                <span><small>${t("SelectedDestination")}</small><strong>${escapeImportHTML(fixedPack.title)}</strong></span>
            </div>
        ` : `
            <div class="gum-import-mode-picker">
                ${allItemPacks.length ? `<label><input type="radio" name="destination-mode" value="existing" ${preferNewBundlePack ? "" : "checked"}>
                    <span><i class="fas fa-book"></i> ${t("UseExistingCompendium")}</span></label>` : ''}
                ${canCreatePack ? `<label><input type="radio" name="destination-mode" value="new" ${preferNewBundlePack || !allItemPacks.length ? "checked" : ""}>
                    <span><i class="fas fa-folder-plus"></i> ${t("CreateNewCompendium")}</span></label>` : ''}
            </div>
            ${allItemPacks.length ? `<div class="form-group" data-destination="existing" ${preferNewBundlePack ? 'style="display:none"' : ''}>
                <label>${t("TemplateDestination")}</label><select name="compendium-target">${packOptions}</select>
            </div>` : ""}
            ${canCreatePack ? `<div class="form-group" data-destination="new" ${allItemPacks.length && !preferNewBundlePack ? 'style="display:none"' : ''}>
                <label>${t("NewCompendiumName")}</label><input type="text" name="new-compendium-name" value="${escapeImportHTML(file.name.replace(/\.[^.]+$/, ""))}">
            </div>` : ""}`;

        new Dialog({
            title: t("SelectImportDestination"),
            content: `
                <form class="gum-compendium-import-form">
                    <div class="gum-import-file-summary">
                        <i class="fas fa-file-import"></i>
                        <span><strong>${format("ItemsFound", { count: importEntries.length })}</strong><small>${escapeImportHTML(file.name)}</small></span>
                    </div>
                    ${typeField}
                    ${destinationFields}
                    ${itemBundle ? `<p class="hint"><strong>${t("BundleTitle")}</strong> ${format("BundleHint", { root: itemBundle.documents[itemBundle.root].name })}</p>` : ""}
                    ${(isCompendiumJson || itemBundle) ? `
                    <section class="gum-import-sync-preview" data-sync-preview aria-live="polite"></section>
                    ` : ""}
                    ${isCompendiumJson ? `
                    <div class="form-group gum-import-remove-missing" style="margin-top: 10px;">
                        <label>
                            <input type="checkbox" name="remove-missing">
                            ${t("RemoveMissingLabel")}
                        </label>
                        <p class="hint">${t("RemoveMissingHint")}</p>
                    </div>` : ""}
                </form>
            `,
            buttons: {
                import: {
                    icon: '<i class="fas fa-file-import"></i>',
                    label: t("Import"),
                    callback: async (html) => {
                        const mode = fixedPack ? "fixed" : html.find('[name="destination-mode"]:checked').val();
                        let pack = fixedPack;
                        if (mode === "existing") pack = game.packs.get(html.find('[name="compendium-target"]').val());
                        if (mode === "new") {
                            const label = String(html.find('[name="new-compendium-name"]').val() || "").trim();
                            if (!label) return ui.notifications.error(t("NewCompendiumNameRequired"));
                            pack = await createWorldItemCompendium(label);
                        }
                        if (!pack) {
                            return ui.notifications.error(t("Errors.CompendiumNotFound"));
                        }
                        
                        if (itemBundle) {
                            await synchronizeItemBundle(pack, itemBundle);
                        } else if (isCompendiumJson) {
                            const removeMissing = Boolean(html.find('input[name="remove-missing"]').prop('checked'));
                            await synchronizeCompendiumJson(pack, importEntries, {
                                removeMissing,
                                folders: portableLibrary ? compendiumFolders : null
                            });
                        } else {
                            const selectedType = html.find('[name="library-item-type"]').val() || inferredType;
                            await importToCompendium(pack, importEntries, { itemType: selectedType });
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: t("Cancel")
                }
            },
            default: "import",
            render: html => {
                const preview = html.find("[data-sync-preview]");
                const updateSyncPreview = async pack => {
                    if (!preview.length) return;
                    if (!pack) return preview.empty();
                    try {
                        const existingDocuments = await pack.getDocuments();
                        const preparedBundle = itemBundle ? prepareItemBundle(itemBundle, pack.collection) : null;
                        const summary = itemBundle
                            ? previewItemBundleSynchronization(existingDocuments, preparedBundle)
                            : previewCompendiumJsonSynchronization(existingDocuments, importEntries.map(entry => entry.itemData));
                        const folderSummary = itemBundle
                            ? previewItemBundleFolderSynchronization(pack.folders, prepareItemBundleFolders(preparedBundle), preparedBundle.id)
                            : null;
                        const collision = itemBundle
                            ? (summary.collisions.length || folderSummary.collisions.length
                                ? `<p class="gum-import-sync-warning"><i class="fas fa-triangle-exclamation"></i> ${format("BundleCollision", { count: summary.collisions.length + folderSummary.collisions.length })}</p>`
                                : "")
                            : (summary.sameNameDifferentId
                                ? `<p class="gum-import-sync-warning"><i class="fas fa-triangle-exclamation"></i> ${format("SameNameDifferentId", { count: summary.sameNameDifferentId })}</p>`
                                : "");
                        preview.html(`<strong>${itemBundle ? t("BundlePreviewTitle") : t("SyncPreviewTitle")}</strong><p>${itemBundle ? t("BundleMatchingRule") : t("SyncMatchingRule")}</p><dl>
                            <div><dt>${t("SyncUpdates")}</dt><dd>${summary.updates}</dd></div>
                            <div><dt>${t("SyncCreates")}</dt><dd>${summary.creates}</dd></div>
                            ${folderSummary ? `<div><dt>${t("BundleFoldersExisting")}</dt><dd>${folderSummary.existing}</dd></div>
                            <div><dt>${t("BundleFoldersCreate")}</dt><dd>${folderSummary.creates}</dd></div>` : ""}
                        </dl>${collision}`);
                    } catch (error) {
                        console.warn("GUM | Unable to preview compendium synchronization:", error);
                        preview.html(`<p class="gum-import-sync-warning">${t("SyncPreviewUnavailable")}</p>`);
                    }
                };
                const updateSelectedPackPreview = () => {
                    const mode = fixedPack ? "fixed" : html.find('[name="destination-mode"]:checked').val();
                    const pack = fixedPack || (mode === "existing" ? game.packs.get(html.find('[name="compendium-target"]').val()) : null);
                    return updateSyncPreview(pack);
                };
                html.find('[name="destination-mode"]').on("change", event => {
                    const mode = event.currentTarget.value;
                    html.find('[data-destination]').hide();
                    html.find(`[data-destination="${mode}"]`).show();
                    updateSelectedPackPreview();
                });
                html.find('[name="compendium-target"]').on("change", updateSelectedPackPreview);
                updateSelectedPackPreview();
            }
        }, {
            classes: ["dialog", "gum", "gum-compendium-import-dialog"],
            width: 620
        }).render(true);
    };

    // 7. "Clica" no input escondido
    input.click();
}

/**
 * Função auxiliar que TRADUZ e importa os dados para um compêndio.
 * (VERSÃO 3 - CORRIGIDA)
 */
async function importToCompendium(pack, importEntries, { itemType: requestedItemType = null } = {}) {
    if (!pack || !importEntries) return;
    
    ui.notifications.info(`Traduzindo ${importEntries.length} itens do GCS/JSON...`);
    const itemsToCreate = [];
    let packWasLocked = pack.locked;
    
    const packName = pack.metadata.name; 
    const packNameToType = {
        "skills": "skill",
        "advantages": "advantage",
        "disadvantages": "disadvantage",
        "spells": "spell",
        "powers": "power",
        "equipment": "equipment",
        "modifiers": "modifier",
        "eqp_modifiers": "eqp_modifier"
    };

    let itemType = requestedItemType || packNameToType[packName];
    let isGenericJson = false;
    
    if (!itemType) {
        console.warn(`GUM | O compêndio "${pack.title}" não tem um tradutor GCS mapeado. Os dados JSON serão importados "como estão".`);
        const firstItemType = importEntries[0]?.itemData?.type;
        if (!firstItemType) {
            return ui.notifications.error("O JSON não tem um 'type' e o compêndio não é padrão. Importação cancelada.");
        }
        itemType = firstItemType; // Usa o tipo do primeiro item
        isGenericJson = true; // Marca que não precisamos de tradução
    }

    // ✅ INÍCIO DA CORREÇÃO: Detecta o formato do arquivo
    // Verifica o primeiro item. Se ele tiver a chave "system",
    // asumimos que o arquivo inteiro já está no formato do Foundry.
    const isFoundryFormat = importEntries[0]?.itemData?.system && importEntries[0]?.itemData?.type;
    
    if (isFoundryFormat) {
         console.log("GUM | Detectado JSON pré-formatado. Importando diretamente.");
         isGenericJson = true; // Trata como genérico para pular a tradução
    }
    // ✅ FIM DA CORREÇÃO

     try {
        // Pastas de compêndio também respeitam lock; precisamos liberar antes de criar a árvore.
        await pack.configure({ locked: false });

const folderCache = new Map();
let lastGCSBaseSkill = null;

for (const entry of importEntries) {
    let gcsItemData = entry?.itemData;
    const folderPath = Array.isArray(entry?.folderPath) ? entry.folderPath : [];

    if (!gcsItemData) continue;

    let foundryItemData = null;

    // Se for genérico ou pré-formatado, não traduz.
    if (isGenericJson) {
        foundryItemData = gcsItemData;
    }

    // Caso contrário, traduz.
    else if (itemType === "skill") {
        gcsItemData = resolveGCSImportSkill(
            gcsItemData,
            lastGCSBaseSkill
        );

    foundryItemData =
        parseGCSLibrarySkill(gcsItemData);

    /*
    * Garante o nome da perícia-base também quando
    * uma técnica é importada diretamente para
    * o compêndio de perícias.
    */
    enforceGCSTechniqueBaseOnImportedItem(
        foundryItemData,
        gcsItemData
    );

// Guarda a última perícia normal como possível base
        // para técnicas que usam marcadores como @perícia@.
        if (!isGCSTechnique(gcsItemData)) {
            lastGCSBaseSkill = {
                name: gcsItemData.name,
                specialization: gcsItemData.specialization || ""
            };
        }
    } else if (itemType === "advantage" || itemType === "disadvantage") {
                foundryItemData = parseGCSLibraryTrait(gcsItemData);
            } else if (itemType === "equipment") {
                foundryItemData = parseGCSLibraryEquipment(gcsItemData);
            } else if (itemType === "spell") {
                foundryItemData = parseGCSLibrarySpell(gcsItemData);
            } else if (itemType === "modifier") {
                foundryItemData = parseGCSLibraryModifier(gcsItemData);
            } else if (itemType === "eqp_modifier") {
                foundryItemData = parseGCSLibraryEquipmentModifier(gcsItemData);
            }

            if (foundryItemData) {
                // Garante que o tipo do item seja o tipo esperado pelo compêndio
                // (Se for genérico, o tipo já deve estar correto no JSON)
                if(!isGenericJson) {
                    foundryItemData.type = itemType;
                }
                const folderId = await ensureCompendiumFolderPath(pack, folderPath, folderCache);
                if (folderId) foundryItemData.folder = folderId;
                applyAutoPointsBaselineOnImport(foundryItemData);
                itemsToCreate.push(foundryItemData);
            }
        }

        if (itemsToCreate.length === 0) {
            return ui.notifications.warn("Nenhum item pôde ser traduzido. A importação foi cancelada.");
        }
        ui.notifications.info(`Iniciando importação de ${itemsToCreate.length} itens traduzidos para "${pack.title}".`);
        
        await Item.createDocuments(itemsToCreate, { pack: pack.collection });

        ui.notifications.info(`Importação concluída! ${itemsToCreate.length} itens adicionados a "${pack.title}".`);
    } catch (err) {
        if (err.name === "DataModelValidationError") {
             console.error("GUM | Erro de Validação de Dados:", err.message, itemsToCreate[0]);
             ui.notifications.error("Erro de Validação: O JSON parece ser para o tipo errado de item. Verifique o console (F12).");
        } else {
            console.error(`GUM | Falha ao importar para ${pack.collection}:`, err);
            ui.notifications.error(`Falha ao importar para ${pack.title}.`);
        }
    } finally {
        await pack.configure({ locked: packWasLocked });
    }
}

function escapeImportHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function chooseGCSActorChanges(plan) {
    const typeLabels = {
        attribute: "Atributos",
        skill: "Perícias",
        advantage: "Vantagens",
        disadvantage: "Desvantagens",
        spell: "Magias",
        power: "Poderes",
        equipment: "Equipamentos",
        money_source: "Recursos monetários"
    };
    const section = (title, entries, kind, checked, open = false) => {
        if (!entries.length) return "";
        const groups = new Map();
        entries.forEach((entry, index) => {
            const item = entry.incoming || entry;
            const type = item.type || "other";
            if (!groups.has(type)) groups.set(type, []);
            groups.get(type).push({ item, index });
        });
        const categories = [...groups.entries()].map(([type, rows]) => `<details class="template-review-category" open><summary><span>${typeLabels[type] || type}</span><strong>${rows.length}</strong></summary><ul class="template-review-list">${rows.map(({ item, index }) => `<li><label class="template-review-card gcs-import-review-card"><input type="checkbox" name="${kind}" value="${index}" ${checked ? "checked" : ""}><span class="template-review-card__main"><strong>${escapeImportHTML(item.name)}</strong><small>${escapeImportHTML(typeLabels[item.type] || item.type || "Item")}</small></span></label></li>`).join("")}</ul></details>`).join("");
        return `<details class="template-review-section gcs-import-review-section" ${open ? "open" : ""}><summary><span>${title}</span><strong>${entries.length}</strong></summary>${categories}</details>`;
    };
    const unchanged = plan.unchanged.map(entry => `<li>${escapeImportHTML(entry.incoming.name)}</li>`).join("");
    const total = plan.additions.length + plan.updates.length + plan.removals.length;
    const height = Math.max(460, Math.min(840, 280 + total * 26));
    const content = `<form class="template-apply-block-dialog template-apply-block-dialog--review gcs-actor-import-review">
        <header class="template-flow-header"><span class="template-flow-eyebrow">GCS</span><h2>Revisar importação</h2><p>Os dados gerais da ficha serão atualizados. Selecione os itens que deseja aplicar.</p></header>
        <div class="template-review-body">
          ${section("Adicionar", plan.additions, "additions", true)}
          ${section("Atualizar", plan.updates, "updates", true)}
          ${section("Remover (desmarcado por segurança)", plan.removals, "removals", false)}
          ${unchanged ? `<details class="template-review-section gcs-import-review-section"><summary><span>Sem alterações</span><strong>${plan.unchanged.length}</strong></summary><ul class="template-review-list gcs-import-unchanged">${unchanged}</ul></details>` : ""}
        </div>
    </form>`;

    return new Promise(resolve => {
        new Dialog({
            title: "Importação do GCS",
            content,
            buttons: {
                import: {
                    icon: '<i class="fas fa-file-import"></i>',
                    label: "Aplicar importação",
                    callback: html => {
                        const selected = kind => new Set(Array.from($(html).find(`input[name="${kind}"]:checked`)).map(input => Number(input.value)));
                        resolve({ additions: selected("additions"), updates: selected("updates"), removals: selected("removals") });
                    }
                },
                cancel: { label: "Cancelar", callback: () => resolve(null) }
            },
            default: "import",
            close: () => resolve(null)
        }, {
            classes: ["dialog", "gum", "template-apply-dialog", "gcs-actor-import-review-dialog", "gum-sheet-edit-dialog"],
            width: 640,
            height,
            resizable: true
        }).render(true);
    });
}

async function updateActorFromGCS(actor, actorData, fileName) {
    if (!canUserImportIntoActor(game.user, actor)) {
        ui.notifications.error("Sua permissão sobre esta ficha foi removida antes da importação.");
        return false;
    }
    const plan = buildGCSActorReconciliation(Array.from(actor.items || []), actorData.items || []);
    const selection = await chooseGCSActorChanges(plan);
    if (!selection) return false;

    await actor.update({
        name: actorData.name,
        img: actorData.img,
        "prototypeToken.texture.src": actorData.prototypeToken["texture.src"],
        system: actorData.system,
        "flags.gum.gcsImport": {
            fileName,
            importedAt: new Date().toISOString()
        }
    });

    const { additions, updates, removals } = prepareGCSActorItemChanges(plan, selection, {
        randomID: () => foundry.utils.randomID()
    });

    if (additions.length) await actor.createEmbeddedDocuments("Item", additions, { keepId: true });
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    if (removals.length) await actor.deleteEmbeddedDocuments("Item", removals);
    return true;
}


/**
 * Importa um arquivo .gcs, criando um Ator ou atualizando exclusivamente o Ator informado.
 */
export async function importFromGCS({ actor = null } = {}) {
    if (actor && !canUserImportIntoActor(game.user, actor)) {
        return ui.notifications.error("Você não tem permissão para importar nesta ficha.");
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gcs'; 

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
            return ui.notifications.info("Importação cancelada.");
        }

        const fileContent = await file.text();
        
        try {
            const gcsData = JSON.parse(fileContent); 
            const actorData = await parseGCSCharacter(gcsData, actor ? {
                fallbackActorImage: actor.img,
                fallbackTokenImage: actor.prototypeToken?.texture?.src,
                fallbackBodyProfileId: actor.system.combat?.body_profile || "humanoid"
            } : {});
            if (actor) {
                const imported = await updateActorFromGCS(actor, actorData, file.name);
                if (imported) ui.notifications.info(`Ficha "${actor.name}" atualizada com sucesso!`);
            } else {
                await Actor.create(actorData);
                ui.notifications.info(`Personagem "${actorData.name}" importado com sucesso!`);
            }
        } catch (err) {
            console.error("GUM | Erro ao processar arquivo GCS:", err);
            ui.notifications.error("Ocorreu um erro ao processar o arquivo GCS. Verifique o console (F12).");
        }
    };
    input.click();
}

/**
 * Importa um arquivo de template GCS (.gct/.gcs) e cria um Item de tipo "template"
 * com blocos no formato esperado pelo GUM.
 */
export async function importTemplateFromGCS() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gct,.gcs,.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return ui.notifications.info("Importação cancelada.");

        try {
            const fileContent = await file.text();
            const gcsData = JSON.parse(fileContent);
            const templateItemData = await parseGCSTemplate(gcsData, file.name);
            if (!templateItemData) {
                return ui.notifications.error("Não foi possível interpretar este arquivo como template GCS.");
            }

            const created = await Item.create(templateItemData);
            ui.notifications.info(`Template "${created.name}" importado com sucesso!`);
            created.sheet?.render(true);
        } catch (err) {
            console.error("GUM | Erro ao importar template GCS:", err);
            ui.notifications.error("Falha ao importar template GCS. Verifique o console (F12).");
        }
    };

    input.click();
}

function nativeGUMTemplatesFromData(data) {
    const portable = parseCompendiumLibraryExport(data);
    if (portable && portable.documentType !== "Item") throw new Error(`Unsupported document type: ${portable.documentType}`);
    const documents = portable ? portable.documents : Array.isArray(data) ? data : [data];
    const sources = documents.filter(source => source?.type === "template");
    if (!sources.length) return null;
    if (sources.some(source => !Array.isArray(source.system?.blocks))) {
        throw new Error(game.i18n.localize("GUM.LibraryImport.InvalidTemplateFile"));
    }
    return sources.map(source => {
        const template = foundry.utils.deepClone(source);
        delete template.folder;
        delete template._stats;
        return template;
    });
}

async function readGCSTemplateFiles(files) {
    const templates = [];
    for (const file of files) {
        let data;
        try {
            data = JSON.parse(await file.text());
        } catch (error) {
            throw new Error(`${file.name}: ${game.i18n.localize("GUM.LibraryImport.InvalidTemplateFile")}`, { cause: error });
        }
        let nativeTemplates;
        try {
            nativeTemplates = nativeGUMTemplatesFromData(data);
        } catch (error) {
            throw new Error(`${file.name}: ${error.message}`, { cause: error });
        }
        if (nativeTemplates) {
            templates.push(...nativeTemplates);
            continue;
        }
        const sources = Array.isArray(data) ? data : [data];
        for (const source of sources) {
            if (!source || typeof source !== "object" || Array.isArray(source)) {
                throw new Error(`${file.name}: ${game.i18n.localize("GUM.LibraryImport.InvalidTemplateFile")}`);
            }
            let template;
            try {
                template = await parseGCSTemplate(source, file.name);
            } catch (error) {
                throw new Error(`${file.name}: ${error.message}`, { cause: error });
            }
            if (!template) throw new Error(`${file.name}: ${game.i18n.localize("GUM.LibraryImport.InvalidTemplateFile")}`);
            templates.push(template);
        }
    }
    return templates;
}

function chooseGCSTemplateCompendium(templates, fixedPack = null) {
    const t = key => game.i18n.localize(`GUM.LibraryImport.${key}`);
    const availablePacks = game.packs.filter(pack => pack.metadata.type === "Item");
    const options = availablePacks.map(pack => `<option value="${escapeImportHTML(pack.collection)}">${escapeImportHTML(pack.title)}</option>`).join("");
    const names = templates.map(template => `<li>${escapeImportHTML(template.name)}</li>`).join("");
    const destination = fixedPack
        ? `<p>${t("TemplateDestination")}: <strong>${escapeImportHTML(fixedPack.title)}</strong></p>`
        : `<div class="form-group"><label>${t("TemplateDestination")}</label><select name="template-pack-mode">
            ${availablePacks.length ? `<option value="existing">${t("UseExistingCompendium")}</option>` : ""}
            <option value="new" ${availablePacks.length ? "" : "selected"}>${t("CreateNewCompendium")}</option>
          </select></div>
          ${availablePacks.length ? `<div class="form-group" data-template-destination="existing"><label>${t("TemplateDestination")}</label><select name="template-pack">${options}</select></div>` : ""}
          <div class="form-group" data-template-destination="new" ${availablePacks.length ? 'style="display:none"' : ""}>
            <label>${t("NewTemplateCompendiumName")}</label><input type="text" name="template-pack-name" value="${escapeImportHTML(t("NewTemplateCompendiumDefault"))}">
          </div>`;
    return new Promise(resolve => new Dialog({
        title: t("ImportTemplates"),
        content: `<form class="gum-compendium-import-form"><p>${game.i18n.format("GUM.LibraryImport.TemplatesFound", { count: templates.length })}</p>
            <ul>${names}</ul>${destination}</form>`,
        buttons: {
            import: { label: t("ImportTemplates"), icon: '<i class="fas fa-file-import"></i>', callback: html => {
                if (fixedPack) return resolve({ pack: fixedPack });
                const mode = html.find('[name="template-pack-mode"]').val();
                if (mode === "new") {
                    const name = String(html.find('[name="template-pack-name"]').val() || "").trim();
                    if (!name) {
                        ui.notifications.warn(t("NewTemplateCompendiumNameRequired"));
                        return resolve(null);
                    }
                    return resolve({ name });
                }
                resolve({ pack: game.packs.get(html.find('[name="template-pack"]').val()) });
            } },
            cancel: { label: game.i18n.localize("GUM.Template.Cancel"), callback: () => resolve(null) }
        },
        default: "import",
        close: () => resolve(null),
        render: html => html.find('[name="template-pack-mode"]').on("change", event => {
            html.find('[data-template-destination]').hide();
            html.find(`[data-template-destination="${event.currentTarget.value}"]`).show();
        })
    }, { classes: ["dialog", "gum", "gum-compendium-import-dialog"], width: 520 }).render(true));
}

async function createGCSTemplatesInCompendium(pack, templates) {
    const idMap = new Map();
    const prepared = templates.map(source => {
        const template = foundry.utils.deepClone(source);
        const oldId = template._id;
        template._id = foundry.utils.randomID();
        if (oldId && !idMap.has(oldId)) idMap.set(oldId, template._id);
        return template;
    });
    const rewriteBlocks = blocks => {
        for (const block of blocks || []) for (const entry of block.contents || []) {
            if (entry.kind === "template") {
                const oldId = entry.templateId || entry.sourceId || String(entry.uuid || entry.templateUuid || "").split(".").at(-1);
                const newId = idMap.get(oldId);
                if (newId) {
                    entry.sourceId = newId;
                    entry.templateId = newId;
                    entry.uuid = `Compendium.${pack.collection}.Item.${newId}`;
                    entry.templateUuid = entry.uuid;
                }
            }
            rewriteBlocks(entry.subBlocks);
        }
    };
    for (const template of prepared) rewriteBlocks(template.system?.blocks);
    const wasLocked = Boolean(pack.locked);
    try {
        if (wasLocked) await pack.configure({ locked: false });
        await Item.createDocuments(prepared, { pack: pack.collection, keepId: true });
    } finally {
        if (wasLocked) await pack.configure({ locked: true });
    }
}

export async function importGCSTemplatesToCompendium({ pack: fixedPack = null } = {}) {
    if (!game.user?.isGM) return;
    if (fixedPack && fixedPack.metadata?.type !== "Item") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gct,.gcs,.json";
    input.multiple = true;
    input.onchange = async event => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        try {
            const templates = await readGCSTemplateFiles(files);
            if (!templates.length) return ui.notifications.warn(game.i18n.localize("GUM.LibraryImport.NoTemplatesFound"));
            const destination = await chooseGCSTemplateCompendium(templates, fixedPack);
            if (!destination) return;
            const pack = destination.pack || await createWorldItemCompendium(destination.name);
            if (!pack || pack.metadata?.type !== "Item") throw new Error(game.i18n.localize("GUM.LibraryImport.Errors.CompendiumNotFound"));
            await createGCSTemplatesInCompendium(pack, templates);
            ui.notifications.info(game.i18n.format("GUM.LibraryImport.TemplatesImported", { count: templates.length, name: pack.title }));
        } catch (error) {
            console.error("GUM | Falha ao importar Modelos GCS para compêndio:", error);
            ui.notifications.error(game.i18n.format("GUM.LibraryImport.TemplateImportFailed", { error: error.message }));
        }
    };
    input.click();
}

/**
 * Achata bibliotecas GCS com rows/children em uma lista simples.
 * Mantém apenas linhas que parecem ser itens importáveis e ignora
 * nós puramente organizacionais.
 */
function collectGCSImportEntries(rows, collector = [], folderPath = [], inherited = []) {
    for (const row of rows || []) {
        const copy = foundry.utils.deepClone(row);
        const children = Array.isArray(copy.children) ? copy.children : [];
        const containerName = getGCSRowLabel(copy);
        const isContainer = children.length > 0;

        if (isContainer) {
            const nextPath = containerName ? [...folderPath, containerName] : folderPath;
            collectGCSImportEntries(children, collector, nextPath, [...inherited, ...(copy.modifiers || [])]);
            continue;
        }

        if (!isImportableGCSRow(copy, false)) continue;

        copy._inheritedModifiers = inherited;
        const expandedRows = expandChoiceModifiersAsIndividualRows(copy);
        for (const expanded of expandedRows) {
            collector.push({
                itemData: expanded,
                folderPath: [...folderPath]
            });
        }
    }
    return collector;
}

function parseCostAdjustmentValue(rawValue) {
    if (rawValue === null || rawValue === undefined) return 0;
    if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : 0;
    const normalized = String(rawValue).replace(/[^\d.+-]/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}


function formatGCSImportNoteValue(value) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
        return value.map(formatGCSImportNoteValue).filter(Boolean).join("\n\n");
    }
    if (typeof value === "object") {
        return String(value.text || value.notes || value.note || value.description || value.value || "").trim();
    }
    return String(value || "").trim();
}

function getGCSItemNotes(gcsNode) {
    const noteFields = [
        gcsNode?.notes,
        gcsNode?.local_notes,
        gcsNode?.note,
        gcsNode?.vtt_notes,
        gcsNode?.vtt_note,
        gcsNode?.vttNotes,
        gcsNode?.vttNote
    ];

    const seen = new Set();
    return noteFields
        .map(formatGCSImportNoteValue)
        .filter(Boolean)
        .filter(text => {
            const key = text.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join("\n\n");
}

function applyGCSImportedDescriptions(template, notes) {
    const text = String(notes || "").trim();
    if (!text) return template;

    template.description = text;
    template.chat_description = text;
    return template;
}

function expandChoiceModifiersAsIndividualRows(row) {
    const modifiers = Array.isArray(row?.modifiers) ? row.modifiers : [];
    if (!modifiers.length) return [row];

    const basePoints = Number(row.base_points || 0) + Number(row.points_per_level || 0) * Number(row.levels || 0);
    const hasEnabledModifier = modifiers.some(mod => !mod?.disabled);
    const hasAnyCostOption = modifiers.some(mod => parseCostAdjustmentValue(mod?.cost_adj ?? mod?.cost ?? 0) !== 0);

    if (basePoints !== 0 || hasEnabledModifier || !hasAnyCostOption) return [row];

    return modifiers.map(mod => {
        const optionName = String(mod?.name || "").trim();
        const clone = foundry.utils.deepClone(row);
        const rowLabel = getGCSRowLabel(row);
        clone.name = optionName ? `${rowLabel} (${optionName})` : rowLabel;
        clone.modifiers = [{ ...mod, disabled: false }];
        if (getGCSItemNotes(mod)) {
            const notes = [getGCSItemNotes(clone), getGCSItemNotes(mod)]
                .map(text => String(text || "").trim())
                .filter(Boolean)
                .join("\n");
            if (notes) clone.local_notes = notes;
        }
        return clone;
    });
}

function isImportableGCSRow(row, hadChildren = false) {
    const rowLabel = getGCSRowLabel(row);
    if (!row || !rowLabel) return false;

    const hasRealContent =
        row.description ||
        row.reference ||
        row.notes ||
        row.local_notes ||
        row.note ||
        row.vtt_notes ||
        row.vtt_note ||
        row.vttNotes ||
        row.vttNote ||
        row.features ||
        row.cost !== undefined ||
        row.cost_adj !== undefined ||
        row.value !== undefined ||
        row.base_value !== undefined ||
        row.base_points !== undefined ||
        row.points !== undefined ||
        row.points_per_level !== undefined ||
        row.difficulty ||
        row.spell_class ||
        row.weapons ||
        row.levels !== undefined ||
        row.base_weight !== undefined ||
        row.weight !== undefined ||
        row.quantity !== undefined;

    if (!hasRealContent && hadChildren) return false;

    return Boolean(hasRealContent);
}

function getGCSRowLabel(row) {
    return String(row?.name || row?.description || "").trim();
}

async function ensureCompendiumFolderPath(pack, folderPath = [], folderCache = new Map()) {
    if (!pack || !Array.isArray(folderPath) || folderPath.length === 0) return null;

    const sanitizedPath = folderPath.map(part => String(part || "").trim()).filter(Boolean);
    if (!sanitizedPath.length) return null;

    const cacheKey = sanitizedPath.join(" / ");
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

    let parentId = null;
    let currentPath = [];

    for (const segment of sanitizedPath) {
        currentPath.push(segment);
        const partialKey = currentPath.join(" / ");
        if (folderCache.has(partialKey)) {
            parentId = folderCache.get(partialKey);
            continue;
        }

        const existing = (pack.folders ?? []).find(folder =>
            folder.type === "Item" &&
            folder.name === segment &&
            ((folder.folder?.id ?? folder.folder ?? null) === parentId)
        );

        if (existing) {
            parentId = existing.id;
            folderCache.set(partialKey, existing.id);
            continue;
        }

        const created = await Folder.create(
            {
                name: segment,
                type: "Item",
                folder: parentId
            },
            {
                pack: pack.collection
            }
        );

        parentId = created?.id || null;
        folderCache.set(partialKey, parentId);
    }

    folderCache.set(cacheKey, parentId);
    return parentId;
}


// =============================================================
// DICIONÁRIO DE TRADUÇÃO DE DANOS
// =============================================================

const GCS_ALL_DR_KEY = "all";

const GCS_FIXED_LOCATION_ID_MAP = {
    skull: "head",
    brain: "head",
    head: "head",
    eye: "eyes",
    eyes: "eyes",
    face: "face",
    jaw: "face",
    nose: "face",
    ear: "face",
    neck: "neck",
    torso: "torso",
    chest: "torso",
    abdomen: "torso",
    vitals: "vitals",
    groin: "groin"
};

const GCS_BODY_PROFILE_ALIASES = {
    humanoid: "humanoid", humanoide: "humanoid",
    quadruped: "quadruped", quadrupede: "quadruped",
    hexapod: "hexapod", hexapode: "hexapod",
    centauroid: "centauroid", centauroide: "centauroid",
    avian: "avian", aviario: "avian",
    vermiform: "vermiform", vermiforme: "vermiform",
    octopod: "octopod", octopode: "octopod",
    cancroid: "cancroid", cancroide: "cancroid",
    ichthyoid: "ichthyoid", ictioide: "ichthyoid",
    arachnid: "arachnid", aracnideo: "arachnid",
    amorphous: "amorphous", amorfo: "amorphous"
};

function normalizeGCSLocationId(locationId) {
    return String(locationId || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s-]+/g, "_");
}

function inferGUMBodyProfileIdFromGCS(bodyType, fallbackProfileId = "humanoid") {
    const candidates = typeof bodyType === "string"
        ? [bodyType]
        : [bodyType?.id, bodyType?.type, bodyType?.name, bodyType?.label, bodyType?.body_plan];

    for (const candidate of candidates) {
        const normalized = normalizeGCSLocationId(candidate).replace(/_/g, "");
        if (GCS_BODY_PROFILE_ALIASES[normalized]) return GCS_BODY_PROFILE_ALIASES[normalized];
    }
    return getBodyProfile(fallbackProfileId).id;
}

function matchesProfileLocation(key, family, side = null, ordinal = null) {
    const parts = key.split("_");
    if (parts[0] !== family) return false;
    if (side && !parts.includes(side)) return false;
    if (ordinal && parts.at(-1) !== ordinal) return false;
    return true;
}

function getGUMBodyLocationKeysForGCS(locationId, profileId = "humanoid") {
    const normalized = normalizeGCSLocationId(locationId);
    const profile = getBodyProfile(profileId);
    const profileKeys = Object.keys(profile?.locations || {});

    if (!normalized || normalized === GCS_ALL_DR_KEY) return profileKeys;
    if (profile?.locations?.[normalized]) return [normalized];

    const fixedLocation = GCS_FIXED_LOCATION_ID_MAP[normalized];
    if (fixedLocation && profile?.locations?.[fixedLocation]) return [fixedLocation];

    const sideMatch = normalized.match(/^(left|right)_(arm|hand|leg|foot|wing|tail|tentacle|pincer|fin|paw)$/);
    if (sideMatch) {
        const side = sideMatch[1] === "left" ? "l" : "r";
        return profileKeys.filter(key => matchesProfileLocation(key, sideMatch[2], side));
    }

    const limbPositionMatch = normalized.match(/^(fore|front|hind|rear)_?(leg|foot)$/);
    if (limbPositionMatch) {
        const ordinal = ["fore", "front"].includes(limbPositionMatch[1]) ? "1" : "2";
        return profileKeys.filter(key => matchesProfileLocation(key, limbPositionMatch[2], null, ordinal));
    }

    const numberedMatch = normalized.match(/^(arm|hand|leg|foot|wing|tail|tentacle|pincer|fin|paw|horn|shoulder|chest|abdomen|joint|spine|artery|jaw|nose|ear)_(\d+)$/);
    if (numberedMatch) {
        const [, base, index] = numberedMatch;
        return profileKeys.filter(key => matchesProfileLocation(key, base, null, index));
    }

    const family = ({ arms: "arm", hands: "hand", legs: "leg", feet: "foot", wings: "wing", tails: "tail", tentacles: "tentacle", pincers: "pincer", fins: "fin", paws: "paw" })[normalized] || normalized;
    const familyKeys = profileKeys.filter(key => matchesProfileLocation(key, family));
    if (familyKeys.length) return familyKeys;

    return [];
}

function getGCSFeatureAmount(feature, owner = null) {
    const rawAmount = feature?.amount ?? feature?.bonus ?? feature?.value ?? 0;
    let amount = Number(rawAmount) || 0;
    if (feature?.per_level) {
        const levels = Number(owner?.levels ?? owner?.level ?? 0) || 0;
        amount *= Math.max(0, levels);
    }
    return amount;
}

function getGCSDrKey(specialization) {
    const spec = String(specialization || "").trim().toLowerCase();
    if (!spec || spec === GCS_ALL_DR_KEY) return "base";
    return GCS_DAMAGE_TYPE_MAP[spec] || spec;
}

function addGCSDrBonusToLocations(target, locations, amount, specialization = "", profileId = "humanoid") {
    const numericAmount = Number(amount) || 0;
    if (!numericAmount) return;

    const drKey = getGCSDrKey(specialization);
    const locationIds = Array.isArray(locations) && locations.length ? locations : ["torso"];
    const resolvedKeys = new Set();
    for (const locationId of locationIds) {
        for (const key of getGUMBodyLocationKeysForGCS(locationId, profileId)) {
            resolvedKeys.add(key);
        }
    }

    for (const key of resolvedKeys) {
        target[key] = target[key] || {};
        target[key][drKey] = (Number(target[key][drKey]) || 0) + numericAmount;
    }
}

function getGCSBodyLocationReferenceIds(location) {
    const label = normalizeGCSLocationId(`${location?.table_name || ""} ${location?.choice_name || ""}`)
        .replace(/foreleg/g, "fore_leg")
        .replace(/hindleg/g, "hind_leg")
        .replace(/forefoot/g, "fore_foot")
        .replace(/hindfoot/g, "hind_foot");
    const sideMatch = label.match(/(?:^|_)(left|right)_(?:(fore|front|hind|rear)_)?(arm|hand|leg|foot)(?:_|$)/);
    if (sideMatch) {
        const side = sideMatch[1] === "left" ? "l" : "r";
        const ordinal = sideMatch[2] ? (["fore", "front"].includes(sideMatch[2]) ? "1" : "2") : null;
        return [ordinal ? `${sideMatch[3]}_${side}_${ordinal}` : `${sideMatch[3]}_${side}`];
    }
    const limbPositionMatch = label.match(/(?:^|_)(fore|front|hind|rear)_(leg|foot)(?:_|$)/);
    if (limbPositionMatch) return [`${limbPositionMatch[1]}_${limbPositionMatch[2]}`];
    return [location?.id];
}

function collectGCSBodyTypeDR(bodyType, target = {}, profileId = "humanoid") {
    for (const location of bodyType?.locations || []) {
        if (location?.dr_bonus) {
            addGCSDrBonusToLocations(target, getGCSBodyLocationReferenceIds(location), location.dr_bonus, "", profileId);
        }
        if (location?.sub_table) {
            collectGCSBodyTypeDR(location.sub_table, target, profileId);
        }
    }
    return target;
}

function addGCSDrObjectToLocations(target, locations, drObject, profileId = "humanoid") {
    if (drObject === null || drObject === undefined) return;

    if (typeof drObject !== "object") {
        addGCSDrBonusToLocations(target, locations, drObject, "", profileId);
        return;
    }

    for (const [specialization, amount] of Object.entries(drObject)) {
        addGCSDrBonusToLocations(target, locations, amount, specialization, profileId);
    }
}

function collectGCSBodyTypeCalculatedDR(bodyType, target = {}, profileId = "humanoid") {
    for (const location of bodyType?.locations || []) {
        const calculatedDR = location?.calc?.dr;
        if (calculatedDR !== null && calculatedDR !== undefined) {
            addGCSDrObjectToLocations(target, getGCSBodyLocationReferenceIds(location), calculatedDR, profileId);
        }
        if (location?.sub_table) {
            collectGCSBodyTypeCalculatedDR(location.sub_table, target, profileId);
        }
    }
    return target;
}

function collectGCSEquipmentDRBonuses(equipment, target = {}, profileId = "humanoid", inheritedEquipped = false) {
    for (const node of equipment || []) {
        const isEquipped = node?.equipped === true || (inheritedEquipped && node?.equipped !== false);
        if (isEquipped) {
            for (const feature of node?.features || []) {
                if (feature?.type !== "dr_bonus") continue;
                addGCSDrBonusToLocations(
                    target,
                    feature.locations || (feature.location ? [feature.location] : ["torso"]),
                    getGCSFeatureAmount(feature, node),
                    feature.specialization,
                    profileId
                );
            }
        }

        if (Array.isArray(node?.children)) {
            collectGCSEquipmentDRBonuses(node.children, target, profileId, isEquipped);
        }
    }
    return target;
}

function subtractGCSDrObjects(totalDR, armorDR) {
    const nativeDR = {};
    const locationKeys = new Set([
        ...Object.keys(totalDR || {}),
        ...Object.keys(armorDR || {})
    ]);

    for (const locationKey of locationKeys) {
        const totalLocationDR = totalDR?.[locationKey] || {};
        const armorLocationDR = armorDR?.[locationKey] || {};
        const drKeys = new Set([
            ...Object.keys(totalLocationDR),
            ...Object.keys(armorLocationDR)
        ]);

        for (const drKey of drKeys) {
            const nativeAmount = (Number(totalLocationDR[drKey]) || 0) - (Number(armorLocationDR[drKey]) || 0);
            if (nativeAmount <= 0) continue;
            nativeDR[locationKey] = nativeDR[locationKey] || {};
            nativeDR[locationKey][drKey] = nativeAmount;
        }
    }

    return nativeDR;
}

function collectGCSTraitDRBonuses(traits, target = {}, profileId = "humanoid") {
    for (const trait of traits || []) {
        if (trait?.disabled) continue;
        for (const feature of trait?.features || []) {
            if (feature?.type !== "dr_bonus") continue;
            addGCSDrBonusToLocations(
                target,
                feature.locations || (feature.location ? [feature.location] : ["torso"]),
                getGCSFeatureAmount(feature, trait),
                feature.specialization,
                profileId
            );
        }
        if (Array.isArray(trait?.children)) {
            collectGCSTraitDRBonuses(trait.children, target, profileId);
        }
    }
    return target;
}

function collectImportedGCSNativeDR(gcsData, profileId = "humanoid") {
    const bodyType = gcsData?.settings?.body_type || gcsData?.body_type;
    const calculatedTotalDR = {};
    collectGCSBodyTypeCalculatedDR(bodyType, calculatedTotalDR, profileId);

    let nativeDR = {};
    if (Object.keys(calculatedTotalDR).length > 0) {
        const equippedArmorDR = {};
        collectGCSEquipmentDRBonuses(gcsData?.equipment || [], equippedArmorDR, profileId);
        collectGCSEquipmentDRBonuses(gcsData?.other_equipment || [], equippedArmorDR, profileId);
        nativeDR = subtractGCSDrObjects(calculatedTotalDR, equippedArmorDR);
    } else {
        collectGCSBodyTypeDR(bodyType, nativeDR, profileId);
        collectGCSTraitDRBonuses(gcsData?.traits || [], nativeDR, profileId);
    }

    return Object.fromEntries(Object.entries(nativeDR).filter(([, drObject]) => Object.keys(drObject || {}).length > 0));
}


const GCS_DAMAGE_TYPE_MAP = {
    // PT-BR (GCS) -> PT-BR (Sistema)
    "cont": "cont",
    "corte": "cort",
    "cort": "cort",
    "perf": "perf",
    "pa": "pa",
    "pa-": "pa-",
    "pa+": "pa+",
    "pa++": "pa++",
    "qmd": "qmd",
    "cor": "cor",
    "tox": "tox",
    // EN (GCS) -> PT-BR (Sistema)
    "cr": "cont",
    "cut": "cort",
    "imp": "perf",
    "pi": "pa",
    "pi-": "pa-",
    "pi+": "pa+",
    "pi++": "pa++",
    "burn": "qmd",
    "corr": "cor",
    "tox": "tox"
};

// =============================================================
// FUNÇÕES "TRADUTORAS" DE BIBLIOTECA
// =============================================================
let LEGACY_SYSTEM_TEMPLATE_CACHE;

function getLegacySystemTemplateRoot() {
    if (LEGACY_SYSTEM_TEMPLATE_CACHE !== undefined) return LEGACY_SYSTEM_TEMPLATE_CACHE;
    LEGACY_SYSTEM_TEMPLATE_CACHE = game.system.template ?? null;
    return LEGACY_SYSTEM_TEMPLATE_CACHE;
}

function isUsableTemplate(candidate, entryType) {
    if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") return false;

    // Em perícias, precisamos de `predefined` para mapear defaults vindos do GCS.
    if (entryType === "skill" && !candidate.predefined) return false;

    return true;
}

function getSystemTemplate(documentType, entryType) {
    // `game.model` contém o modelo já expandido (incluindo os templates
    // declarados em template.json) nas versões atuais do Foundry. Já
    // `game.system.documentTypes` descreve os tipos, mas não garante que
    // traga os campos do modelo.
    const fromGameModel = game.model?.[documentType]?.[entryType];
    if (isUsableTemplate(fromGameModel, entryType)) {
        return foundry.utils.deepClone(fromGameModel);
    }

    const docTypeEntry = game.system.documentTypes?.[documentType]?.[entryType];
    const fromDocumentTypes = docTypeEntry?.template ?? docTypeEntry;
    if (isUsableTemplate(fromDocumentTypes, entryType)) {
        return foundry.utils.deepClone(fromDocumentTypes);
    }

    const legacyRoot = getLegacySystemTemplateRoot();
    const legacyTemplate = legacyRoot?.[documentType]?.[entryType];
    if (isUsableTemplate(legacyTemplate, entryType)) {
        return foundry.utils.deepClone(legacyTemplate);
    }

    console.warn(`GUM | Template não encontrado para ${documentType}.${entryType}. Usando objeto vazio.`);
    return {};
}


function parseGCSLibraryTrait(gcsTrait) {
    const pricing = importGCSTraitCost(gcsTrait, gcsTrait._inheritedModifiers || []);
    const provisional = { system: pricing };
    const type = calculateItemTraitCost(provisional).finalPoints < 0 ? "disadvantage" : "advantage";
    const template = Object.assign(getSystemTemplate("Item", type), pricing);
    template.block_id = type === "advantage" ? "block2" : "block3";
    template.ref = gcsTrait.reference || "";
    applyGCSImportedDescriptions(template, getGCSItemNotes(gcsTrait));
    return { name: gcsTrait.name, type, system: template };
}

function parseAttributeTemplateEntryFromGCSTrait(gcsTrait) {
    if (!gcsTrait?.name) return null;

    const name = String(gcsTrait.name).trim();
    if (!name) return null;

    const lowered = name.toLowerCase();
    let sign = 0;
    if (/^(increase|increased|increasing)\b/.test(lowered)) sign = 1;
    if (/^(decrease|decreased|decreasing)\b/.test(lowered)) sign = -1;
    if (!sign) return null;

    const keyMap = [
        { pattern: /basic\s*speed/, key: "basic_speed" },
        { pattern: /basic\s*move|\bmove\b/, key: "move" },
        { pattern: /hit\s*points|\bhp\b/, key: "hp" },
        { pattern: /fatigue\s*points|\bfp\b/, key: "fp" },
        { pattern: /perception|\bper\b/, key: "per" },
        { pattern: /\bwill\b/, key: "will" },
        { pattern: /strength|\bst\b/, key: "st" },
        { pattern: /dexterity|\bdx\b/, key: "dx" },
        { pattern: /intelligence|\biq\b/, key: "iq" },
        { pattern: /health|\bht\b/, key: "ht" }
    ];

    const attrMatch = keyMap.find(entry => entry.pattern.test(lowered));
    if (!attrMatch) return null;

    const levelsNumber = Number(gcsTrait.levels);
    const trailingRaw = name.match(/(-?\d+(?:[\.,]\d+)?)\s*$/)?.[1] || "";
    const trailingNumber = Number(String(trailingRaw).replace(",", "."));
    const absoluteAmount = Number.isFinite(levelsNumber)
        ? Math.abs(levelsNumber)
        : (Number.isFinite(trailingNumber) ? Math.abs(trailingNumber) : 1);

    const attributes = {
        st: 0,
        dx: 0,
        iq: 0,
        ht: 0,
        will: 0,
        per: 0,
        hp: 0,
        fp: 0,
        basic_speed: 0,
        move: 0
    };
    attributes[attrMatch.key] = (absoluteAmount || 1) * sign;

    return {
        id: foundry.utils.randomID(),
        kind: "attribute",
        label: name,
        attributes,
        costs: {},
        linkSecondary: ["st", "dx", "iq", "ht"].includes(attrMatch.key),
        cost: calculateItemTraitCost({ type: "advantage", system: importGCSTraitCost(gcsTrait, gcsTrait._inheritedModifiers || []) }).finalPoints
    };
}

/**
 * Reúne os pré-definidos do GCS.
 *
 * Perícias comuns normalmente utilizam "defaults".
 * Técnicas normalmente utilizam "default", no singular.
 */
function getGCSDefaults(gcsSkill) {
    const defaults = [];

    if (
        gcsSkill?.default &&
        typeof gcsSkill.default === "object"
    ) {
        defaults.push(gcsSkill.default);
    }

    if (Array.isArray(gcsSkill?.defaults)) {
        defaults.push(...gcsSkill.defaults);
    }

    return defaults.filter(Boolean);
}

/**
 * Identifica se uma entrada de perícia do GCS é uma técnica.
 *
 * Perícias comuns:
 * difficulty: "dx/e", "iq/h", "ht/a" etc.
 *
 * Técnicas:
 * difficulty: "a" ou "h".
 */
function isGCSTechnique(gcsSkill) {
    const difficulty = String(
        gcsSkill?.difficulty || ""
    ).trim().toLowerCase();

    if (!difficulty) return false;

    return (
        !difficulty.includes("/") &&
        ["a", "h", "e", "vh"].includes(difficulty)
    );
}

/**
 * Preenche o campo da perícia-base da técnica.
 *
 * O código procura diferentes nomes possíveis porque o template
 * do sistema pode ter mudado entre versões.
 */
function setGCSImportedTechniqueBaseSkill(template, skillName) {
    const resolvedName = String(skillName || "").trim();

    if (!resolvedName) return;

    const candidates = [
        "base_skill",
        "base_skill_name",
        "technique_base_skill",
        "parent_skill",
        "skill_name"
    ];

    const existingKey = candidates.find(key =>
        Object.prototype.hasOwnProperty.call(template, key)
    );

    template[existingKey || "base_skill"] = resolvedName;
}

/**
 * Normaliza o nome de uma chave de substituição do GCS.
 *
 * Isso permite reconhecer igualmente:
 * "perícia", "Perícia", "pericia" etc.
 */
function normalizeGCSReplacementKey(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

/**
 * Aplica os valores do campo "replacements" do GCS.
 *
 * Exemplo:
 *
 * replacements: {
 *     "GdB ou GdP": "GdP",
 *     "perícia": "Faca"
 * }
 *
 * Nome:
 * Ataque Direcionado (@perícia@/@GdB ou GdP@/Frestas Vitais)
 *
 * Resultado:
 * Ataque Direcionado (Faca/GdP/Frestas Vitais)
 */
function applyGCSNamedReplacements(
    value,
    replacements = {}
) {
    let text = String(value ?? "").trim();

    if (!text || !replacements) {
        return text;
    }

    const replacementMap = new Map();

    /*
     * Formato padrão atual do GCS:
     *
     * replacements: {
     *     "perícia": "Faca"
     * }
     */
    if (
        typeof replacements === "object" &&
        !Array.isArray(replacements)
    ) {
        for (const [
            rawKey,
            rawValue
        ] of Object.entries(replacements)) {
            const key =
                normalizeGCSReplacementKey(rawKey);

            const value =
                typeof rawValue === "object"
                    ? String(
                        rawValue?.value ??
                        rawValue?.replacement ??
                        rawValue?.text ??
                        rawValue?.name ??
                        ""
                    ).trim()
                    : String(rawValue ?? "").trim();

            if (key && value) {
                replacementMap.set(key, value);
            }
        }
    }

    /*
     * Compatibilidade defensiva com uma possível lista:
     *
     * replacements: [
     *     { key: "perícia", value: "Faca" }
     * ]
     */
    if (Array.isArray(replacements)) {
        for (const entry of replacements) {
            const rawKey =
                entry?.key ??
                entry?.placeholder ??
                entry?.name ??
                "";

            const rawValue =
                entry?.value ??
                entry?.replacement ??
                entry?.text ??
                "";

            const key =
                normalizeGCSReplacementKey(rawKey);

            const replacement =
                String(rawValue ?? "").trim();

            if (key && replacement) {
                replacementMap.set(
                    key,
                    replacement
                );
            }
        }
    }

    if (!replacementMap.size) {
        return text;
    }

    /*
     * Procura qualquer trecho entre arrobas:
     *
     * @perícia@
     * @GdB ou GdP@
     * @especialização@
     */
    return text.replace(
        /@([^@]+)@/gu,
        (fullMatch, placeholderName) => {
            const key =
                normalizeGCSReplacementKey(
                    placeholderName
                );

            return replacementMap.has(key)
                ? replacementMap.get(key)
                : fullMatch;
        }
    );
}

/**
 * Substitui marcadores de perícia, especialização
 * e valores registrados no campo replacements do GCS.
 */
function replaceGCSSkillPlaceholders(
    value,
    {
        baseSkill = "",
        specialization = "",
        replacements = {}
    } = {}
) {
    /*
     * Primeiro usa as substituições específicas gravadas
     * no próprio item do GCS.
     */
    let text = applyGCSNamedReplacements(
        value,
        replacements
    );

    if (!text) return "";

    const resolvedBaseSkill = String(
        baseSkill || ""
    ).trim();

    const resolvedSpecialization = String(
        specialization || ""
    ).trim();

    /*
     * Fallback para arquivos que usam marcadores, mas não
     * registram o campo replacements.
     */
    if (resolvedBaseSkill) {
        text = text.replace(
            /@(?:perícia|pericia|skill)@/giu,
            resolvedBaseSkill
        );
    }

    if (resolvedSpecialization) {
        text = text.replace(
            /@(?:especialização|especializacao|specialization)@/giu,
            resolvedSpecialization
        );
    }

    return text
        .replace(/\(\s*\)/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

/**
 * Normaliza uma perícia ou técnica recebida do GCS.
 *
 * Também usa a perícia anterior como contexto quando o GCS
 * deixa o nome-base representado apenas por @perícia@.
 */
function resolveGCSImportSkill(
    gcsSkill,
    contextBaseSkill = null
) {
    const clone =
        foundry.utils.deepClone(
            gcsSkill || {}
        );

    const technique =
        isGCSTechnique(clone);

    const defaults =
        getGCSDefaults(clone);

    // Decode criteria before placeholder replacement can stringify the objects.
    for (const entry of defaults) {
        entry.name = readGCSDefaultText(entry.name);
        entry.specialization = readGCSDefaultText(entry.specialization, { allowAny: true });
    }

    const replacements =
        clone.replacements || {};

    const primaryDefault =
        defaults.find(entry =>
            String(entry?.type || "")
                .trim()
                .toLowerCase() === "skill"
        ) ||
        defaults[0] ||
        null;

    /*
     * Aplica replacements antes de decidir qual é
     * a perícia-base.
     *
     * @perícia@ passa a ser "Faca", por exemplo.
     */
    const defaultNameRaw =
        applyGCSNamedReplacements(
            primaryDefault?.name || "",
            replacements
        ).trim();

    const defaultIsPlaceholder =
        /@(?:perícia|pericia|skill)@/iu
            .test(defaultNameRaw);

    const contextName = String(
        contextBaseSkill?.name ||
        contextBaseSkill ||
        ""
    ).trim();

    const contextSpecialization = String(
        contextBaseSkill?.specialization || ""
    ).trim();

    const baseSkill =
        defaultNameRaw &&
        !defaultIsPlaceholder
            ? defaultNameRaw
            : contextName;

    const rawSpecialization = String(
        clone.specialization ||
        primaryDefault?.specialization ||
        contextSpecialization ||
        ""
    ).trim();

    const specialization =
        applyGCSNamedReplacements(
            rawSpecialization,
            replacements
        ).trim();

    /*
     * Resolve o nome completo do item.
     *
     * Exemplo:
     *
     * Ataque Direcionado
     * (@perícia@/@GdB ou GdP@/Frestas Vitais)
     *
     * torna-se:
     *
     * Ataque Direcionado
     * (Faca/GdP/Frestas Vitais)
     */
    clone.name =
        replaceGCSSkillPlaceholders(
            clone.name,
            {
                baseSkill,
                specialization,
                replacements
            }
        );

    if (clone.specialization) {
        clone.specialization =
            replaceGCSSkillPlaceholders(
                clone.specialization,
                {
                    baseSkill,
                    specialization,
                    replacements
                }
            );
    }

    /*
     * Resolve também os nomes dos pré-definidos.
     */
    for (const entry of defaults) {
        if (
            !entry ||
            typeof entry !== "object"
        ) {
            continue;
        }

        entry.name =
            replaceGCSSkillPlaceholders(
                entry.name,
                {
                    baseSkill,
                    specialization,
                    replacements
                }
            );

        if (entry.specialization) {
            entry.specialization =
                replaceGCSSkillPlaceholders(
                    entry.specialization,
                    {
                        baseSkill,
                        specialization,
                        replacements
                    }
                );
        }
    }

    if (
        clone.default &&
        defaults.length
    ) {
        clone.default =
            defaults[0];
    }

    if (Array.isArray(clone.defaults)) {
        clone.defaults =
            defaults.slice(
                clone.default ? 1 : 0
            );
    }

    clone._gumTechniqueImport = {
        isTechnique: technique,
        baseSkill,
        specialization
    };

    return clone;
}

/**
 * Obtém os dados definitivos da perícia-base de uma técnica do GCS.
 *
 * Exemplo do GCS:
 *
 * default: {
 *     type: "skill",
 *     name: "Faca",
 *     specialization: "",
 *     modifier: -4
 * }
 */
function getGCSTechniqueBaseImportData(gcsSkill) {
    if (!isGCSTechnique(gcsSkill)) return null;

    const defaults = getGCSDefaults(gcsSkill);

    const skillDefault =
        defaults.find(entry =>
            String(entry?.type || "")
                .trim()
                .toLowerCase() === "skill"
        ) ||
        defaults[0] ||
        null;

    const importInfo =
        gcsSkill?._gumTechniqueImport || {};

    let baseSkillName = String(
        skillDefault?.name ||
        importInfo.baseSkill ||
        ""
    ).trim();

    // Caso ainda exista um marcador como @perícia@,
    // usa o nome já resolvido durante a importação.
    if (
        /@(?:perícia|pericia|skill)@/iu.test(
            baseSkillName
        )
    ) {
        baseSkillName = String(
            importInfo.baseSkill || ""
        ).trim();
    }

    const baseSpecialization = String(
        skillDefault?.specialization || ""
    ).trim();

    // Monta, por exemplo:
    // Arma de Arremesso (Faca)
    if (
        baseSkillName &&
        baseSpecialization &&
        !baseSkillName.toLowerCase().endsWith(
            `(${baseSpecialization.toLowerCase()})`
        )
    ) {
        baseSkillName =
            `${baseSkillName} (${baseSpecialization})`;
    }

    const parsedModifier = Number(
        skillDefault?.modifier ?? 0
    );

    return {
        baseSkillName,

        modifier:
            Number.isFinite(parsedModifier)
                ? parsedModifier
                : 0
    };
}

/**
 * Reaplica os dados da técnica sobre o item final.
 *
 * Esta função é executada depois da importação híbrida,
 * impedindo que uma versão antiga do item restaure
 * "skill" no lugar do nome real da perícia-base.
 */
function enforceGCSTechniqueBaseOnImportedItem(
    itemData,
    gcsSkill
) {
    if (
        !itemData ||
        itemData.type !== "skill"
    ) {
        return itemData;
    }

    const techniqueBase =
        getGCSTechniqueBaseImportData(gcsSkill);

    if (!techniqueBase?.baseSkillName) {
        return itemData;
    }

    itemData.system =
        itemData.system || {};

    itemData.system.base_attribute =
        techniqueBase.baseSkillName;

    itemData.system.nh_mod =
        techniqueBase.modifier;

    /*
    * Reaplica também o nível adquirido da técnica,
    * impedindo que uma versão antiga do compêndio
    * restaure o calc.rsl final diretamente.
    */
    itemData.system.skill_level =
        extractGCSTechniqueImprovementLevel(
            gcsSkill
        );

    return itemData;
}

export function parseGCSLibrarySkill(gcsSkill) {
    const resolvedSkill = resolveGCSImportSkill(gcsSkill);
    let template = getSystemTemplate("Item", "skill");

    if (!template.predefined) {
        template.predefined = Object.fromEntries(
            Array.from({ length: 6 }, (_, index) => [
                `slot${index + 1}`,
                { name: "", specialization: "", modifier: 0 }
            ])
        );
    }

    const importInfo =
        resolvedSkill._gumTechniqueImport || {};

    const isTechnique = Boolean(
        importInfo.isTechnique
    );

    const specialization = String(
        resolvedSkill.specialization ||
        importInfo.specialization ||
        ""
    ).trim();

    const rawName = String(
        resolvedSkill.name || "Perícia"
    ).trim();

    const resolvedRelativeLevel =
    isTechnique
        ? extractGCSTechniqueImprovementLevel(
            resolvedSkill
        )
        : extractGCSRelativeLevel(
            resolvedSkill
        );

    template.points =
        Number(resolvedSkill.points) || 0;

    template.skill_level =
        resolvedRelativeLevel;

    template.ref =
        resolvedSkill.reference || "";

    template.specialization = specialization;

    template.group =
        resolvedSkill.tags?.[0] ||
        template.group ||
        "";

    applyGCSImportedDescriptions(
        template,
        getGCSItemNotes(resolvedSkill)
    );

    template.difficulty_manual =
        resolvedSkill.difficulty || "";

// Técnicas usam uma perícia como base.
if (isTechnique) {
    const rawDifficulty = String(
        resolvedSkill.difficulty || "h"
    ).trim().toLowerCase();

    /*
     * Técnicas do GCS normalmente armazenam sua perícia-base
     * no campo "default", no formato:
     *
     * default: {
     *     type: "skill",
     *     name: "Faca",
     *     specialization: "",
     *     modifier: -4
     * }
     */
    const techniqueDefaults = getGCSDefaults(resolvedSkill);

    const techniqueBaseDefault =
        techniqueDefaults.find(gcsDefault =>
            String(gcsDefault?.type || "")
                .trim()
                .toLowerCase() === "skill"
        ) ||
        techniqueDefaults[0] ||
        null;

    const rawBaseSkillName = String(
        techniqueBaseDefault?.name ||
        importInfo.baseSkill ||
        ""
    ).trim();

    const baseSkillSpecialization = String(
        techniqueBaseDefault?.specialization || ""
    ).trim();

    /*
     * Caso a perícia-base também tenha especialização,
     * monta o nome no formato esperado pelo sistema:
     *
     * Arma de Arremesso (Faca)
     */
    const alreadyHasSpecialization =
        baseSkillSpecialization &&
        rawBaseSkillName.toLowerCase().endsWith(
            `(${baseSkillSpecialization.toLowerCase()})`
        );

    const resolvedBaseSkillName =
        baseSkillSpecialization &&
        !alreadyHasSpecialization
            ? `${rawBaseSkillName} (${baseSkillSpecialization})`
            : rawBaseSkillName;

    const rawBaseModifier =
        techniqueBaseDefault?.modifier;

    const parsedBaseModifier =
        Number(rawBaseModifier);

    /*
     * IMPORTANTE:
     *
     * system.base_attribute guarda diretamente o nome da
     * perícia-base. Não deve receber a palavra "skill".
     *
     * A própria ficha reconhece esse texto como uma perícia
     * e seleciona automaticamente "Perícia" no seletor.
     */
    template.base_attribute =
        resolvedBaseSkillName;

    /*
     * O modificador informado no default da técnica do GCS
     * vai para o campo "Modificador Base" do GUM.
     */
    template.nh_mod =
        Number.isFinite(parsedBaseModifier)
            ? parsedBaseModifier
            : 0;

    // Técnica média ou técnica difícil.
    template.difficulty =
        rawDifficulty === "a"
            ? "TecM"
            : "TecD";
}

    // Perícias normais continuam usando atributo/dificuldade.
    else if (resolvedSkill.difficulty) {
        const parts = String(
            resolvedSkill.difficulty
        ).toLowerCase().split("/");

        if (parts.length === 2) {
            template.base_attribute =
                parts[0].trim();

            template.difficulty =
                normalizeGCSDifficulty(parts[1]);
        }
    }

    // Agora considera tanto "default" quanto "defaults".
    mapGCSDefaultsToPredefined(
        template,
        getGCSDefaults(resolvedSkill)
    );

    delete resolvedSkill._gumTechniqueImport;

    return applyAutoPointsBaselineOnImport({
        name: rawName,
        type: "skill",
        system: template
    });
}

function extractGCSRelativeLevel(gcsNode) {
    const directCandidates = [
        gcsNode?.relative_level,
        gcsNode?.levels,
        gcsNode?.calc?.relative_level,
        gcsNode?.calc?.rsl,
        gcsNode?.calc?.relative
    ];

    for (const candidate of directCandidates) {
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return candidate;
        }

        if (typeof candidate === "string") {
            const raw = candidate.trim();
            if (!raw) continue;

            if (/^[+-]?\d+$/.test(raw)) {
                return Number(raw);
            }

            const withAttribute = raw.match(/(?:st|dx|iq|ht|per|will|vont)\s*([+-]\d+)/i);
            if (withAttribute?.[1]) {
                return Number(withAttribute[1]);
            }

            const trailingSigned = raw.match(/([+-]\d+)\s*$/);
            if (trailingSigned?.[1]) {
                return Number(trailingSigned[1]);
            }
        }
    }

    return 0;
}

/**
 * Converte o nível relativo final de uma técnica no GCS
 * para o nível de aprimoramento utilizado pelo GUM.
 *
 * No GCS:
 *   perícia-base 17
 *   modificador do pré-definido -4
 *   nível final da técnica 16
 *   calc.rsl = -1
 *
 * No GUM:
 *   base_attribute = "Faca"
 *   nh_mod = -4
 *   skill_level = 3
 *
 * Resultado:
 *   17 - 4 + 3 = 16
 */
function extractGCSTechniqueImprovementLevel(gcsSkill) {
    const defaults = getGCSDefaults(gcsSkill);

    const techniqueBaseDefault =
        defaults.find(gcsDefault =>
            String(gcsDefault?.type || "")
                .trim()
                .toLowerCase() === "skill"
        ) ||
        defaults[0] ||
        null;

    const parsedDefaultModifier = Number(
        techniqueBaseDefault?.modifier ?? 0
    );

    const defaultModifier =
        Number.isFinite(parsedDefaultModifier)
            ? parsedDefaultModifier
            : 0;

    /*
     * Verifica se o GCS realmente forneceu um nível relativo.
     * Isso é necessário porque extractGCSRelativeLevel()
     * devolve 0 também quando não encontra nenhum valor.
     */
    const relativeCandidates = [
        gcsSkill?.relative_level,
        gcsSkill?.levels,
        gcsSkill?.calc?.relative_level,
        gcsSkill?.calc?.rsl,
        gcsSkill?.calc?.relative
    ];

    const hasExplicitRelativeLevel =
        relativeCandidates.some(candidate => {
            if (
                candidate === null ||
                candidate === undefined
            ) {
                return false;
            }

            if (
                typeof candidate === "number"
            ) {
                return Number.isFinite(candidate);
            }

            return String(candidate).trim() !== "";
        });

    if (hasExplicitRelativeLevel) {
        const finalRelativeLevel =
            extractGCSRelativeLevel(gcsSkill);

        /*
         * O GCS fornece o resultado final em relação
         * à perícia-base.
         *
         * O GUM já aplica nh_mod separadamente, então
         * precisamos retirar o modificador-base:
         *
         * -1 - (-4) = 3
         */
        return Math.max(
            0,
            finalRelativeLevel - defaultModifier
        );
    }

    /*
     * Fallback para arquivos antigos do GCS que não tragam
     * calc.rsl. Nesse caso, recuperamos o aprimoramento
     * por meio dos pontos investidos.
     */
    const points = Number(
        gcsSkill?.points ??
        gcsSkill?.calc?.points ??
        0
    ) || 0;

    const difficulty = String(
        gcsSkill?.difficulty || ""
    ).trim().toLowerCase();

    // Técnica Média: 1 ponto por nível comprado.
    if (difficulty === "a") {
        return Math.max(0, points);
    }

    /*
     * Técnica Difícil:
     * o primeiro ponto mantém a técnica no nível inicial;
     * cada ponto seguinte representa +1.
     */
    return Math.max(0, points - 1);
}


function calculateAutoSkillPointsForImport(rawDifficulty, relativeLevel = 0) {
    const rl = parseInt(relativeLevel, 10) || 0;
    const normalized = ({
        "E": "F", "A": "M", "H": "D", "VH": "MD"
    })[rawDifficulty] || rawDifficulty || "M";

    const tables = {
        "F": { 0: 1, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
        "M": { "-1": 1, 0: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 },
        "D": { "-2": 1, "-1": 2, 0: 4, 1: 8, 2: 12, 3: 16, 4: 20, 5: 24 },
        "MD": { "-3": 1, "-2": 2, "-1": 4, 0: 8, 1: 12, 2: 16, 3: 20, 4: 24, 5: 28 },
        "TecM": {},
        "TecD": {}
    };

    if (normalized === "TecM") return Math.max(0, rl);
    if (normalized === "TecD") return rl > 0 ? rl + 1 : 0;

    const table = tables[normalized] || tables["M"];
    const keys = Object.keys(table).map(k => parseInt(k, 10));
    const minKey = Math.min(...keys);
    const maxKey = Math.max(...keys);

    if (rl < minKey) return 0;
    if (rl in table) return table[rl];

   const base = table[maxKey];
    return base + (rl - maxKey) * 4;
}

function calculateRelativeLevelFromImportPoints(rawDifficulty, points = 0) {
    const pts = Number(points) || 0;
    if (pts <= 0) return 0;

    const normalized = ({
        "E": "F", "A": "M", "H": "D", "VH": "MD"
    })[rawDifficulty] || rawDifficulty || "M";

    if (normalized === "TecM") return Math.floor(pts);
    if (normalized === "TecD") return pts >= 2 ? Math.floor(pts - 1) : 0;

    const tables = {
        "F": { 0: 1, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
        "M": { "-1": 1, 0: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 },
        "D": { "-2": 1, "-1": 2, 0: 4, 1: 8, 2: 12, 3: 16, 4: 20, 5: 24 },
        "MD": { "-3": 1, "-2": 2, "-1": 4, 0: 8, 1: 12, 2: 16, 3: 20, 4: 24, 5: 28 }
    };

    const table = tables[normalized] || tables["M"];
    let bestLevel = 0;
    let bestCost = 0;

    for (const [levelRaw, costRaw] of Object.entries(table)) {
        const level = Number(levelRaw);
        const cost = Number(costRaw) || 0;
        if (cost <= pts && cost >= bestCost) {
            bestCost = cost;
            bestLevel = level;
        }
    }

    const maxLevel = Math.max(...Object.keys(table).map(Number));
    const maxCost = Number(table[maxLevel]) || bestCost;
    if (pts > maxCost) {
        return maxLevel + Math.floor((pts - maxCost) / 4);
    }

    return bestLevel;
}


function applyAutoPointsBaselineOnImport(itemData) {
    if (!itemData?.system) return itemData;

    const type = itemData.type;
    if (!["skill", "spell", "power"].includes(type)) return itemData;

    const difficulty = itemData.system.difficulty || "M";
    const parsedRelativeLevel = Number(itemData.system.skill_level);
    const relativeLevel = Number.isFinite(parsedRelativeLevel) ? parsedRelativeLevel : 0;
    const pointsField = (type === "power") ? "points_skill" : "points";
    const parsedPoints = Number(itemData.system[pointsField]);
    const hasImportedPoints = Number.isFinite(parsedPoints) && parsedPoints > 0;

    itemData.system.auto_points = true;
    itemData.system.cost_mode = itemData.system.cost_mode || "standard";
    itemData.system.skill_level = relativeLevel;

    if (!hasImportedPoints) {
        const baselinePoints = calculateAutoSkillPointsForImport(difficulty, relativeLevel);
        itemData.system[pointsField] = baselinePoints;
    }

    return itemData;
}


function normalizeGCSDifficulty(rawDifficulty) {
    const difficulty = String(rawDifficulty || "").trim().toLowerCase();
    const difficultyMap = {
        "e": "E",
        "a": "A",
        "h": "H",
        "vh": "VH"
    };

    return difficultyMap[difficulty] || "A";
}

function mapGCSDefaultsToPredefined(template, defaults) {
    if (!Array.isArray(defaults) || defaults.length === 0 || !template?.predefined) return;

    const predefinedSlots = ["slot1", "slot2", "slot3", "slot4", "slot5", "slot6"];
    let slotIndex = 0;

    for (const gcsDefault of defaults) {
        if (slotIndex >= predefinedSlots.length) break;

        const slotKey = predefinedSlots[slotIndex];
        const normalizedDefault = normalizeGCSDefault(gcsDefault);
        if (!normalizedDefault) continue;

        template.predefined[slotKey] = normalizedDefault;
        slotIndex += 1;
    }
}

/**
 * Reaplica os pré-definidos do GCS sobre o item final
 * criado durante a importação de uma ficha de personagem.
 *
 * Isso é necessário porque a importação de personagem pode
 * mesclar o item traduzido com uma versão existente no mundo
 * ou em um compêndio.
 */
function applyGCSDefaultsToImportedCharacterSkill(
    itemData,
    gcsSkill
) {
    if (
        !itemData ||
        itemData.type !== "skill"
    ) {
        return itemData;
    }

    const defaults =
        getGCSDefaults(gcsSkill);

    /*
     * Se o GCS não informou nenhum pré-definido,
     * preservamos os dados existentes no item.
     */
    if (!defaults.length) {
        return itemData;
    }

    itemData.system =
        itemData.system || {};

    /*
     * Cria uma estrutura limpa com os seis campos usados
     * pelo sistema. Isso evita que pré-definidos antigos
     * de um item do compêndio permaneçam após a mesclagem.
     */
    const predefined = {};

    for (let index = 1; index <= 6; index++) {
        predefined[`slot${index}`] = {
            name: "",
            specialization: "",
            modifier: 0
        };
    }

    itemData.system.predefined =
        predefined;

    /*
     * Usa a função já existente para normalizar:
     *
     * - atributos, como DX, IQ e HT;
     * - nomes de perícias;
     * - especializações;
     * - modificadores.
     */
    mapGCSDefaultsToPredefined(
        itemData.system,
        defaults
    );

    return itemData;
}

// GCS versions store default names either as strings or as text criteria.
// GUM references concrete names; other comparisons cannot be treated as equality.
function readGCSDefaultText(value, { allowAny = false } = {}) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object" && !Array.isArray(value)) {
        if (value.compare === "any" && allowAny) return "";
        if (value.compare === "is" && (value.qualifier == null || typeof value.qualifier === "string")) {
            return value.qualifier ?? "";
        }
    }
    throw new Error(`Pré-definido GCS não suportado: critério "${value?.compare ?? typeof value}". É necessário um nome exato (is).`);
}

function normalizeGCSDefault(gcsDefault) {
    if (!gcsDefault || !gcsDefault.type) return null;

    const defaultType = String(gcsDefault.type).toLowerCase();
    const modifier = Number(gcsDefault.modifier) || 0;

    if (defaultType === "skill") {
        return {
            name: readGCSDefaultText(gcsDefault.name),
            specialization: readGCSDefaultText(gcsDefault.specialization, { allowAny: true }),
            modifier
        };
    }

    const gcsAttributeMap = {
        "st": "ST",
        "dx": "DX",
        "iq": "IQ",
        "ht": "HT",
        "per": "Per",
        "will": "Vont"
    };

    if (gcsAttributeMap[defaultType]) {
        return {
            name: gcsAttributeMap[defaultType],
            specialization: "",
            modifier
        };
    }

    return {
        name: (readGCSDefaultText(gcsDefault.name) || gcsDefault.type || "").toUpperCase(),
        specialization: readGCSDefaultText(gcsDefault.specialization, { allowAny: true }),
        modifier
    };
}

function formatGCSDefaultRollReference(gcsDefault) {
    const normalizedDefault = normalizeGCSDefault(gcsDefault);
    if (!normalizedDefault?.name) return "";

    const baseName = normalizedDefault.specialization
        ? `${normalizedDefault.name} (${normalizedDefault.specialization})`
        : normalizedDefault.name;
    const modifier = Number(normalizedDefault.modifier) || 0;
    const signedModifier = modifier > 0 ? `+${modifier}` : (modifier < 0 ? String(modifier) : "");

    return `${baseName}${signedModifier}`.trim();
}

function formatGCSDefaultsRollReferenceList(defaults) {
    if (!Array.isArray(defaults) || defaults.length === 0) return "";

    const seen = new Set();
    const references = [];

    for (const gcsDefault of defaults) {
        const reference = formatGCSDefaultRollReference(gcsDefault);
        const key = reference.toLowerCase();
        if (!reference || seen.has(key)) continue;

        seen.add(key);
        references.push(reference);
    }

    return references.join(", ");
}


function parseGCSLibrarySpell(gcsSpell) {
    let template = getSystemTemplate("Item", "spell");

    template.points = gcsSpell.points || 1;
    template.ref = gcsSpell.reference || "";
    applyGCSImportedDescriptions(template, getGCSItemNotes(gcsSpell));
    
    template.spell_class = gcsSpell.spell_class || "Regular";
    template.spell_school = gcsSpell.college?.[0] || "Geral"; 
    template.casting_time = gcsSpell.casting_time || "1s";
    template.duration = gcsSpell.duration || "";
    template.mana_cost = gcsSpell.casting_cost || "";
    template.mana_maint = gcsSpell.maintenance_cost || "";

    template.difficulty_manual = gcsSpell.difficulty || "";
    if (gcsSpell.difficulty) {
        const parts = gcsSpell.difficulty.toLowerCase().split('/');
        if (parts.length === 2) {
            template.base_attribute = parts[0].trim();
            template.difficulty = normalizeGCSDifficulty(parts[1]);
        }
    }

    if (gcsSpell.weapons?.length > 0) {
        const gcsWeapon = gcsSpell.weapons[0]; 
        const defaultSkill = readGCSDefaultText(gcsWeapon.defaults?.find(d => d.type === "skill")?.name) || gcsWeapon.defaults?.[0]?.type || "DX";
        
        if (!template.attack_roll) {
            template.attack_roll = { skill_name: "", skill_level_mod: 0 };
        }
        
        template.attack_roll.skill_name = defaultSkill;

        const gcsDamage = parseGCSDamageParts(gcsWeapon.damage);
        const gcsDamageType = gcsDamage.type;
        
        let damageFormula = "";
        const gcsBase = gcsDamage.formula || ""; 
        const gcsSt = gcsWeapon.damage?.st;
        
        if (gcsSt) {
            damageFormula = gcsSt;
            if (gcsBase && gcsBase !== "0") {
                 let mod = gcsBase.toString();
                 if (mod[0] !== '+' && mod[0] !== '-') {
                     mod = `+${mod}`;
                 }
                 damageFormula += mod; 
            }
        } else {
            damageFormula = gcsBase; 
        }

        damageFormula = damageFormula.replace("sw", "gdb").replace("thr", "gdp");
        damageFormula = damageFormula.replace(/d(?!b|p|\d)/g, "d6");
        
        if (!template.damage) {
            template.damage = { formula: "", type: "", armor_divisor: 1 };
        }
        template.damage.formula = damageFormula;
        template.damage.type = gcsDamageType;
        template.damage.scaling = gcsDamage.scaling || "";
    }

    return applyAutoPointsBaselineOnImport({
        name: gcsSpell.name,
        type: "spell",
        system: template
    });
}

function parseGCSLibraryModifier(gcsMod) {
    const template = Object.assign(getSystemTemplate("Item", "modifier"), importGCSModifier(gcsMod));
    const notes = getGCSItemNotes(gcsMod);
    template.applied_effect = notes;
    applyGCSImportedDescriptions(template, notes);
    return { name: gcsMod.name || "Modificador", type: "modifier", system: template };
}

function parseGCSLibraryEquipmentModifier(gcsMod) {
    let template = getSystemTemplate("Item", "eqp_modifier");

    const rawCost = gcsMod.cost || "";
    const rawCostType = gcsMod.cost_type || "";
    const rawWeight = gcsMod.weight || "";
    const rawWeightType = gcsMod.weight_type || "";
    const rawRef = gcsMod.reference || "";
    const rawNotes = getGCSItemNotes(gcsMod);

    const stageFromGCS = (value, suffix) => ({
        [`to_original_${suffix}`]: "original",
        [`to_base_${suffix}`]: "base",
        [`to_final_base_${suffix}`]: "final_base",
        [`to_final_${suffix}`]: "final"
    })[String(value || "").toLowerCase()] || "base";

    // Preserva a expressão do GCS; o resolvedor central é a única camada que a interpreta.
    const rawCostStr = String(rawCost).trim();
    const rawWeightStr = String(rawWeight).trim();
    template.adjustment_schema = 1;
    template.enabled = gcsMod.disabled !== true;
    template.level = 1;
    const costStage = stageFromGCS(rawCostType, "cost");
    const normalizedCost = rawCostStr.replace("*", "x");
    const bareBaseCost = costStage === "base" && /^[+-]?\d+(?:[.,]\d+)?$/.test(normalizedCost);
    template.cost_adjustment = bareBaseCost
        ? `${Number(normalizedCost.replace(",", ".")) >= 0 ? "+" : ""}${normalizedCost} CF`
        : (normalizedCost || "0 CF");
    template.cost_factor = /cf$/i.test(template.cost_adjustment) ? Number.parseFloat(template.cost_adjustment.replace(",", ".")) || 0 : 0;
    template.weight_mod = rawWeightStr.replace("*", "x") || "x1";
    template.cost_adjustment_data = {
        expression: template.cost_adjustment,
        stage: costStage,
        per_level: gcsMod.cost_is_per_level === true,
        per_weight: gcsMod.cost_is_per_pound === true,
        per_weight_unit: gcsMod.cost_is_per_pound === true ? "lb" : "kg"
    };
    template.weight_adjustment_data = {
        expression: template.weight_mod,
        stage: stageFromGCS(rawWeightType, "weight"),
        per_level: gcsMod.weight_is_per_level === true
    };

    template.ref = rawRef;

    const qualifier = criterion => String(criterion?.qualifier ?? criterion ?? "").trim();
    const selectorForWeaponFeature = feature => {
        if (feature.selection_type === "weapons_with_required_skill") return { selector_field: "skill_name", selector_value: qualifier(feature.name) };
        if (feature.selection_type === "weapons_with_name") return { selector_field: "mode", selector_value: qualifier(feature.name) };
        return { selector_field: "all", selector_value: "" };
    };
    const weaponPaths = {
        weapon_bonus: "damage_formula", weapon_acc_bonus: "accuracy", weapon_scope_acc_bonus: "accuracy",
        weapon_dr_divisor_bonus: "armor_divisor", weapon_min_st_bonus: "min_strength", weapon_recoil_bonus: "rcl",
        weapon_bulk_bonus: "mag", weapon_parry_bonus: "parry_bonus", weapon_block_bonus: "block_bonus",
        weapon_effective_st_bonus: "effective_st_bonus", weapon_effective_strength_bonus: "effective_st_bonus"
    };
    const featureAmount = feature => {
        const raw = feature?.amount?.value ?? feature?.amount ?? feature?.bonus?.value ?? feature?.bonus ?? feature?.value ?? 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const ownerFeature = (id, feature, kind, { nameValue = "", nameCompare = "is", situation = "" } = {}) => ({
        id,
        label: feature.name || feature.situation || `Feature GCS: ${feature.type}`,
        enabled: true,
        type: "owner_modifier",
        owner_kind: kind,
        name_compare: nameCompare,
        name_value: nameValue,
        situation,
        value: featureAmount(feature),
        per_level: feature.per_level === true || feature.leveled === true
    });
    const structuredFeatures = {};
    const unmappedFeatures = [];
    for (const [index, feature] of (gcsMod.features || []).entries()) {
        const id = `gcs-${index}`;
        if (feature?.type === "skill_bonus") {
            const supportedSelection = !feature.selection_type || feature.selection_type === "skills_with_name";
            const comparison = String(feature.name?.compare || "is");
            if (!supportedSelection || !["is", "contains"].includes(comparison)) {
                unmappedFeatures.push(foundry.utils.deepClone(feature));
                continue;
            }
            const skillName = qualifier(feature.name || feature.skill || feature.specialization);
            structuredFeatures[id] = ownerFeature(id, feature, "skill", {
                nameValue: skillName,
                nameCompare: comparison
            });
            continue;
        }
        if (feature?.type === "attribute_bonus") {
            const attribute = String(feature.attribute || feature.attribute_id || feature.name || "").trim().toLowerCase();
            structuredFeatures[id] = ownerFeature(id, feature, "attribute", { nameValue: attribute });
            continue;
        }
        if (feature?.type === "conditional_modifier") {
            structuredFeatures[id] = ownerFeature(id, feature, "conditional", { situation: String(feature.situation || feature.name || "").trim() });
            continue;
        }
        if (feature?.type === "reaction_bonus") {
            structuredFeatures[id] = ownerFeature(id, feature, "reaction", { situation: String(feature.situation || feature.name || "").trim() });
            continue;
        }
        if (feature?.type === "dr_bonus") {
            const locations = Array.isArray(feature.locations) && feature.locations.length ? feature.locations : ["all"];
            locations.forEach((location, locationIndex) => {
                const featureId = `${id}-dr-${locationIndex}`;
                structuredFeatures[featureId] = {
                    id: featureId, label: `RD importada (${location})`, enabled: true, type: "equipment_dr",
                    location: String(location).toLowerCase() === "all" ? "all" : String(location),
                    damage_type: !feature.specialization || String(feature.specialization).toLowerCase() === "all" ? "base" : feature.specialization,
                    operation: "add", value: featureAmount(feature), per_level: feature.per_level === true
                };
            });
            continue;
        }
        if (feature?.type === "equipment_max_uses_bonus" && !String(feature.amount || "").includes("%")) {
            const expression = String(feature.amount ?? "+0").trim();
            const multiply = /^[x×*]/i.test(expression) || /[x×]$/i.test(expression);
            structuredFeatures[id] = {
                id, label: "Usos máximos importados", enabled: true, type: "equipment_property", path: "max_uses",
                operation: multiply ? "multiply" : "add", value: Number(expression.replace(/[x×*]/gi, "")) || 0,
                per_level: feature.per_level === true
            };
            continue;
        }
        const weaponPath = weaponPaths[feature?.type];
        if (weaponPath && feature.percent !== true && !feature.dice) {
            structuredFeatures[id] = {
                id, label: `Feature GCS: ${feature.type}`, enabled: true, type: "attack_property", attack_type: "all",
                ...selectorForWeaponFeature(feature), path: weaponPath, operation: "add", value: featureAmount(feature),
                per_level: feature.per_level === true || feature.leveled === true
            };
            continue;
        }
        unmappedFeatures.push(feature);
    }
    template.features_data = { ...(template.features_data || {}), ...structuredFeatures };
    template.gcs_features_unmapped = unmappedFeatures;

    // Notas narrativas pertencem à descrição; dados mecânicos ficam nas features estruturadas.
    template.description = rawNotes;
    template.group = String(gcsMod.group || gcsMod.category || "").trim();

    return {
        name: gcsMod.name || "Modificador de Equipamento",
        type: "eqp_modifier",
        system: template
    };
}



function normalizeGCSDamageFormula(value) {
    return String(value || "")
        .trim()
        .replace(/\bthr\b/gi, "gdp")
        .replace(/\bsw\b/gi, "gdb")
        .replace(/d(?!b|p|\d)/gi, "d6");
}

function extractGCSDamageScaling(value) {
    const raw = String(value || "");
    if (!raw.trim()) return { cleaned: "", scaling: "" };

    const scalingPattern = /([+\-]\s*(?:(?:\d+)?d(?:\d+)?|\d+)(?:[+\-]\d+)?\s*(?:\/\s*[\p{L}_-]+|\b(?:per|por)\s+[\p{L}_-]+))/iu;
    const match = raw.match(scalingPattern);
    if (!match) return { cleaned: raw.trim(), scaling: "" };

    return {
        cleaned: raw.replace(match[0], "").replace(/\s{2,}/g, " ").trim(),
        scaling: normalizeGCSDamageFormula(match[1].replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim())
    };
}


function parseGCSDamageType(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const baseType = raw
        .split("+")[0]
        .split("/")[0]
        .trim();

    return GCS_DAMAGE_TYPE_MAP[baseType.toLowerCase()] || baseType;
}


function parseGCSDamageParts(damage = {}) {
    const baseScaling = extractGCSDamageScaling(damage.base);
    const typeScaling = extractGCSDamageScaling(damage.type);

    let formula = baseScaling.cleaned;
    let type = parseGCSDamageType(typeScaling.cleaned);
    const scaling = baseScaling.scaling || typeScaling.scaling;

    if (!type && formula) {
        const combinedMatch = formula.match(/^([+\-]?(?:\d+)?d(?:\d+)?(?:[+\-]\d+)?|[+\-]?\d+)\s+(.+)$/i);
        if (combinedMatch) {
            formula = combinedMatch[1].trim();
            type = parseGCSDamageType(combinedMatch[2]);
        }
    }

    return { formula, type, scaling };
}

function parseGCSLibraryEquipment(gcsEquip, { bodyProfileId = "humanoid" } = {}) {
    if (!gcsEquip.description) return null; 
    
    let type, template;
    const isArmor = gcsEquip.features?.some(f => f.type === "dr_bonus");
    
    if (isArmor) {
        type = "equipment";
        template = getSystemTemplate("Item", "equipment");

        if (!template.dr_locations || typeof template.dr_locations !== "object") {
        template.dr_locations = {};
    }
        
        for (const feature of gcsEquip.features || []) {
            if (feature.type === "dr_bonus") {
                addGCSDrBonusToLocations(
                    template.dr_locations,
                    feature.locations || (feature.location ? [feature.location] : ["torso"]),
                    getGCSFeatureAmount(feature, gcsEquip),
                    feature.specialization,
                    bodyProfileId
                );
            }
        }
    }
    else {
        type = "equipment";
        template = getSystemTemplate("Item", "equipment"); 
    }

    template.quantity = gcsEquip.quantity || 1;
    template.level = String(gcsEquip.level ?? gcsEquip.calc?.level ?? "").trim();
    template.points = Number(gcsEquip.points ?? gcsEquip.calc?.points) || 0;
    template.ref = gcsEquip.reference || "";
    template.cost = parseFloat(gcsEquip.value || gcsEquip.base_value) || 0;
    
    const weightString = gcsEquip.weight || gcsEquip.base_weight || "0";
    const weightValue = parseFloat(weightString.split(' ')[0]) || 0;
    
    if (weightString.includes('lb')) {
        template.weight = weightValue / 2; // Converte lb para kg
    } else {
        template.weight = weightValue;
    }
    
    template.tech_level = gcsEquip.tech_level || "";
    template.legality_class = gcsEquip.legality_class || "";
    const equipmentNotes = getGCSItemNotes(gcsEquip);
    applyGCSImportedDescriptions(template, equipmentNotes);
    
    if (gcsEquip.weapons?.length > 0) {
        template.melee_attacks = {};
        template.ranged_attacks = {};
        
        for (const gcsWeapon of gcsEquip.weapons) {
            const newAttackId = foundry.utils.randomID();
            
            const defaultSkill = formatGCSDefaultsRollReferenceList(gcsWeapon.defaults) || "DX";
            
            const gcsDamage = parseGCSDamageParts(gcsWeapon.damage);
            const weaponNotes = getGCSItemNotes(gcsWeapon);

            let damageFormula = "";
             const gcsBase = gcsDamage.formula;
            const gcsSt = gcsWeapon.damage?.st;
            
            if (gcsSt) {
                damageFormula = gcsSt;
                if (gcsBase && gcsBase !== "0") {
                     let mod = gcsBase.toString();
                     if (mod[0] !== '+' && mod[0] !== '-') {
                         mod = `+${mod}`;
                     }
                     damageFormula += mod; 
                }
            } else {
                damageFormula = gcsBase; 
            }

            damageFormula = damageFormula.replace("sw", "gdb").replace("thr", "gdp");
            damageFormula = damageFormula.replace(/d(?!b|p|\d)/g, "d6");

            const attackNotes = weaponNotes || equipmentNotes;
            const attackData = {
                mode: gcsWeapon.usage || "Ataque",
                skill_name: defaultSkill,
                damage_formula: damageFormula,
                damage_type: gcsDamage.type,
                damage_scaling: gcsDamage.scaling || "",
                min_strength: gcsWeapon.strength || "0",
                description: attackNotes,
                chat_description: attackNotes
            };

            if (gcsWeapon.reach !== undefined || gcsWeapon.parry !== undefined) {
                attackData.reach = gcsWeapon.reach || "C";
                attackData.parry = gcsWeapon.calc?.parry || gcsWeapon.parry || "0";
                attackData.block = gcsWeapon.calc?.block || gcsWeapon.block || "0";
                attackData.parry_default = true;
                attackData.block_default = true;
                if (gcsWeapon.calc?.parry) attackData.gcs_calculated_parry = gcsWeapon.calc.parry;
                if (gcsWeapon.calc?.block) attackData.gcs_calculated_block = gcsWeapon.calc.block;
                
                template.melee_attacks[newAttackId] = {
                    ...(getSystemTemplate("Item", "attack_melee") || {}),
                    ...attackData
                };
            }
            else if (gcsWeapon.accuracy !== undefined || gcsWeapon.range !== undefined) {
                attackData.accuracy = gcsWeapon.accuracy || "0";
                attackData.range = gcsWeapon.range || "";
                attackData.rof = gcsWeapon.rate_of_fire || "1";
                attackData.shots = gcsWeapon.shots || "1(3i)";
                attackData.rcl = gcsWeapon.recoil || "1";
                template.ranged_attacks[newAttackId] = {
                    ...(getSystemTemplate("Item", "attack_ranged") || {}),
                    ...attackData
                };
            }
        }
    }
    
    return {
        name: gcsEquip.description,
        type: type,
        system: template
    };
}

const HYBRID_IMPORTABLE_ITEM_TYPES = new Set(["skill", "spell", "power", "advantage", "disadvantage", "equipment"]);
let HYBRID_ITEM_INDEX_CACHE = { key: null, entries: null };

function normalizeHybridText(value) {
    return normalizeItemName(value);
}

function buildIndexEntryFromItemDocument(item, sourceType, packCollection = "", priority = 0) {
    return {
        sourceType,
        priority,
        packCollection,
        id: item.id,
        uuid: item.uuid,
        type: item.type,
        name: item.name,
        identities: itemNameIdentities({
            name: item.name,
            specialization: item.system?.specialization,
            aliases: item.system?.aliases
        }),
        refNorm: normalizeHybridText(item.system?.ref)
    };
}

export function invalidateHybridItemIndex() {
    HYBRID_ITEM_INDEX_CACHE = { key: null, entries: null };
}

export function getHybridImportPolicy() {
    const scope = normalizeHybridImportScope(game.settings.get("gum", HYBRID_IMPORT_SCOPE_SETTING), {
        legacySearchAll: game.settings.get("gum", "hybridImportSearchAllCompendia") === true
    });
    return hybridImportScopeCapabilities(scope);
}

async function buildHybridItemIndex() {
    const configuredPackIds = contentSourceService.getSourceIds("characterImport")
        .filter((id, index, ids) => ids.indexOf(id) === index);
    const policy = getHybridImportPolicy();
    const cacheKey = JSON.stringify({
        scope: policy.scope,
        worldItems: policy.includeWorldItems ? game.items.contents.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type,
            ref: item.system?.ref,
            specialization: item.system?.specialization,
            aliases: normalizeItemAliases(item.system?.aliases)
        })) : [],
        configuredPackIds
    });
    if (HYBRID_ITEM_INDEX_CACHE.key === cacheKey) return HYBRID_ITEM_INDEX_CACHE.entries;

    if (!policy.enabled) {
        HYBRID_ITEM_INDEX_CACHE = { key: cacheKey, entries: [] };
        return HYBRID_ITEM_INDEX_CACHE.entries;
    }

    const entries = [];
    const configuredPacks = configuredPackIds
        .map(id => game.packs.get(id))
        .filter(pack => pack?.documentName === "Item");
    const configuredPackSet = new Set(configuredPacks.map(pack => pack.collection));
    const fallbackPacks = policy.includeOtherCompendia
        ? game.packs.filter(pack => pack.documentName === "Item" && !configuredPackSet.has(pack.collection))
        : [];

    let priority = 0;
    for (const pack of configuredPacks) {
        const index = await pack.getIndex({ fields: ["type", "system.ref", "system.specialization", "system.aliases"] }).catch(() => null);
        if (!index?.contents?.length) continue;

        for (const row of index.contents) {
            if (!HYBRID_IMPORTABLE_ITEM_TYPES.has(row.type)) continue;
            entries.push({
                sourceType: "compendium",
                priority,
                packCollection: pack.collection,
                id: row._id,
                uuid: `Compendium.${pack.collection}.${row._id}`,
                type: row.type,
                name: row.name,
                identities: itemNameIdentities({
                    name: row.name,
                    specialization: row.system?.specialization,
                    aliases: row.system?.aliases
                }),
                refNorm: normalizeHybridText(row.system?.ref)
            });
        }
        priority += 1;
    }

    if (policy.includeWorldItems) {
        for (const item of game.items.contents) {
            if (!HYBRID_IMPORTABLE_ITEM_TYPES.has(item.type)) continue;
            entries.push(buildIndexEntryFromItemDocument(item, "world", "", priority));
        }
        priority += 1;
    }

    for (const pack of fallbackPacks) {
        const index = await pack.getIndex({ fields: ["type", "system.ref", "system.specialization", "system.aliases"] }).catch(() => null);
        if (!index?.contents?.length) continue;
        for (const row of index.contents) {
            if (!HYBRID_IMPORTABLE_ITEM_TYPES.has(row.type)) continue;
            entries.push({
                sourceType: "compendium",
                priority,
                packCollection: pack.collection,
                id: row._id,
                uuid: `Compendium.${pack.collection}.${row._id}`,
                type: row.type,
                name: row.name,
                identities: itemNameIdentities({
                    name: row.name,
                    specialization: row.system?.specialization,
                    aliases: row.system?.aliases
                }),
                refNorm: normalizeHybridText(row.system?.ref)
            });
        }
        priority += 1;
    }

    HYBRID_ITEM_INDEX_CACHE = { key: cacheKey, entries };
    return entries;
}

export async function resolveHybridSourceItem({ gcsNode, parsedItem }) {
    if (!parsedItem || !HYBRID_IMPORTABLE_ITEM_TYPES.has(parsedItem.type)) {
        return { item: null, matchedBy: null, ambiguity: null };
    }

    const index = await buildHybridItemIndex();
    const wantedType = parsedItem.type;
    const wantedRef = normalizeHybridText(gcsNode?.reference || parsedItem.system?.ref);
    const wantedIdentity = itemNameIdentity(
        parsedItem.name || gcsNode?.name,
        gcsNode?.specialization || parsedItem.system?.specialization
    );

    const candidates = index.filter(entry => entry.type === wantedType);
    const wantedSourceUuid = parsedItem.flags?.gum?.hybridImport?.sourceUuid || null;

    const unique = (rows) => {
        if (!rows?.length) return null;
        const byUuid = new Map();
        for (const row of rows) if (!byUuid.has(row.entry.uuid)) byUuid.set(row.entry.uuid, row);
        const distinctRows = Array.from(byUuid.values());
        const highestPriority = Math.min(...distinctRows.map(row => Number(row.entry.priority) || 0));
        const preferredRows = distinctRows.filter(row => (Number(row.entry.priority) || 0) === highestPriority);
        return preferredRows.length === 1
            ? { hit: preferredRows[0], ambiguity: null }
            : { hit: null, ambiguity: preferredRows.map(row => ({ uuid: row.entry.uuid, name: row.entry.name })) };
    };

    let match = null;
    let matchedBy = null;
    let ambiguity = null;

    if (wantedSourceUuid) {
        const result = unique(candidates
            .filter(entry => entry.uuid === wantedSourceUuid)
            .map(entry => ({ entry, identity: null })));
        match = result?.hit || null;
        ambiguity = result?.ambiguity || null;
        if (match) matchedBy = "source";
    }

    if (!match && wantedRef) {
        const result = unique(candidates
            .filter(entry => entry.refNorm && entry.refNorm === wantedRef)
            .map(entry => ({ entry, identity: null })));
        match = result?.hit || null;
        ambiguity = result?.ambiguity || null;
        if (match) matchedBy = "reference";
    }

    if (!match && wantedIdentity.nameNorm) {
        const identityRows = candidates.flatMap(entry => (entry.identities || [])
            .filter(identity => identity.nameNorm === wantedIdentity.nameNorm
                && identity.specializationNorm === wantedIdentity.specializationNorm)
            .map(identity => ({ entry, identity })));
        const result = unique(identityRows);
        match = result?.hit || null;
        ambiguity = result?.ambiguity || ambiguity;
        if (match) {
            const identityKind = match.identity?.kind === "alias" ? "alias" : "name";
            matchedBy = wantedIdentity.specializationNorm ? `${identityKind}+specialization` : identityKind;
        }
    }

    if (!match) {
        if (ambiguity?.length) {
            console.warn("GUM | Correspondência híbrida ambígua; o item do GCS será mantido sem substituição.", {
                name: parsedItem.name,
                type: parsedItem.type,
                candidates: ambiguity
            });
        }
        return { item: null, matchedBy: null, ambiguity };
    }

    const hit = match.entry;

    if (hit.sourceType === "world") {
        return { item: game.items.get(hit.id) || null, matchedBy, ambiguity: null };
    }

    const pack = game.packs.get(hit.packCollection);
    if (!pack) return { item: null, matchedBy: null, ambiguity: null };
    const item = await pack.getDocument(hit.id).catch(() => null);
    return { item, matchedBy, ambiguity: null };
}

function mergeHybridImportedData(sourceItem, parsedItem, { gcsNode = null, mode = "character" } = {}) {
    const base = sourceItem.toObject();
    const mergedSystem = foundry.utils.mergeObject(base.system || {}, parsedItem.system || {}, {
        inplace: false,
        overwrite: true
    });

    if (["advantage", "disadvantage"].includes(parsedItem.type)) {
        mergedSystem.modifiers = foundry.utils.deepClone(parsedItem.system.modifiers);
    }

    if (parsedItem.type === "equipment" && Array.isArray(gcsNode?.weapons) && gcsNode.weapons.length > 0) {
        // Ataques são objetos indexados por IDs aleatórios. No merge híbrido, mesclar a
        // coleção do item-base com a coleção recém-parseada duplica modos equivalentes.
        // Quando o GCS informa armas/modos, a importação deve usar essas coleções como
        // fonte final e substituir integralmente os modos vindos do item encontrado.
        mergedSystem.melee_attacks = foundry.utils.deepClone(parsedItem.system?.melee_attacks || {});
        mergedSystem.ranged_attacks = foundry.utils.deepClone(parsedItem.system?.ranged_attacks || {});
    }

    const merged = {
        ...base,
        name: parsedItem.name || base.name,
        type: parsedItem.type || base.type,
        img: parsedItem.img || base.img,
        system: mergedSystem,
        flags: foundry.utils.mergeObject(base.flags || {}, {
            gum: {
                hybridImport: {
                    mode,
                    sourceUuid: sourceItem.uuid,
                    sourceId: sourceItem.id,
                    gcsId: gcsNode?.id || parsedItem.flags?.gum?.hybridImport?.gcsId || null,
                    importedAt: new Date().toISOString()
                }
            }
        }, { inplace: false, overwrite: true })
    };

    return applyAutoPointsBaselineOnImport(merged);
}

async function buildHybridActorItemFromGCS(
    gcsNode,
    parserFn
) {
    if (
        !gcsNode ||
        typeof parserFn !== "function"
    ) {
        return null;
    }

    const parsedItem =
        parserFn(gcsNode);

    if (!parsedItem) return null;

    const {
        item: sourceItem,
        matchedBy,
        ambiguity
    } = await resolveHybridSourceItem({
        gcsNode,
        parsedItem
    });

    /*
     * Nenhum item correspondente encontrado:
     * utiliza diretamente o item traduzido do GCS.
     */
    if (!sourceItem) {
        const fallback =
            foundry.utils.deepClone(parsedItem);

        fallback.flags =
            foundry.utils.mergeObject(
                fallback.flags || {},
                {
                    gum: {
                        hybridImport: {
                            mode: "character",
                            sourceUuid: null,
                            sourceId: null,
                            matchedBy: null,
                            ambiguity: ambiguity || null,
                            gcsId:
                                gcsNode?.id || null,
                            importedAt:
                                new Date().toISOString()
                        }
                    }
                },
                {
                    inplace: false,
                    overwrite: true
                }
            );

        /*
         * Garante que uma técnica receba o nome da
         * perícia-base e o modificador do GCS.
         */
        enforceGCSTechniqueBaseOnImportedItem(
            fallback,
            gcsNode
        );

        return applyAutoPointsBaselineOnImport(
            fallback
        );
    }

    /*
     * Um item equivalente foi encontrado no mundo
     * ou em um compêndio.
     */
    const merged =
        mergeHybridImportedData(
            sourceItem,
            parsedItem,
            {
                gcsNode,
                mode: "character"
            }
        );

    merged.flags.gum.hybridImport.matchedBy =
        matchedBy;
    if (matchedBy?.startsWith("alias")) {
        merged.flags.gum.hybridImport.importedName = merged.name;
        merged.name = sourceItem.name;
        if (sourceItem.system?.specialization) merged.system.specialization = sourceItem.system.specialization;
    }

    /*
     * IMPORTANTE:
     *
     * Depois da mesclagem, reaplica os dados vindos
     * diretamente do GCS. Assim, uma versão antiga
     * de Fintar com base_attribute = "skill" não
     * consegue sobrescrever "Faca".
     */
    enforceGCSTechniqueBaseOnImportedItem(
        merged,
        gcsNode
    );

    return merged;
}

function getGCSChildren(node) {
    return Array.isArray(node?.children) ? node.children : [];
}

function getGCSContainerPathLabel(node) {
    return getGCSRowLabel(node) || String(node?.id || "").trim();
}

function collectGCSPricedTraits(nodes, multiplicative = false, path = [], inherited = [], result = []) {
    for (const node of nodes || []) {
        if (node.disabled) continue;
        const children = getGCSChildren(node);
        if (children.length) {
            if (node.container_type === "alternative_abilities") throw new Error("Importação de custos de habilidades alternativas ainda não suportada.");
            collectGCSPricedTraits(children, multiplicative, [...path, getGCSContainerPathLabel(node)], [...inherited, ...(node.modifiers || [])], result);
        } else result.push({ node: { ...node, _inheritedModifiers: inherited, _multiplicativeModifiers: multiplicative }, path });
    }
    return result;
}

function collectGCSCharacterLeafEntries(nodes, path = [], collector = []) {
    for (const node of nodes || []) {
        const children = getGCSChildren(node);
        if (children.length > 0) {
            const label = getGCSContainerPathLabel(node);
            const nextPath = label ? [...path, label] : path;
            collectGCSCharacterLeafEntries(children, nextPath, collector);
            continue;
        }

        collector.push({ node, path: [...path] });
    }

return collector;
}

function isGCSNaturalAttacksTrait(node) {
    const name = String(node?.name || node?.description || "").trim();
    return /^(natural attacks|ataques naturais)$/i.test(name);
}

function collectGCSTraitsWithWeapons(nodes, collector = []) {
    for (const node of nodes || []) {
        if (Array.isArray(node?.weapons) && node.weapons.length > 0) {
            collector.push(node);
        }

        const children = getGCSChildren(node);
        if (children.length > 0) {
            collectGCSTraitsWithWeapons(children, collector);
        }
    }

    return collector;
}

function buildGCSTraitAttackEquipmentItem(gcsTrait) {
    const weapons = Array.isArray(gcsTrait?.weapons) ? gcsTrait.weapons : [];
    if (weapons.length === 0) return null;

    const sourceName = String(gcsTrait?.name || "").trim();
    const fallbackName = /^ataques naturais$/i.test(sourceName) ? "Ataques Naturais" : "Natural Attacks";
    const itemName = sourceName || fallbackName;
    const notes = [
        getGCSItemNotes(gcsTrait),
        `Criado automaticamente a partir da vantagem "${itemName}" do GCS para representar seus modos de ataque.`
    ].filter(Boolean).join("\n\n");

    const item = parseGCSLibraryEquipment({
        ...gcsTrait,
        description: itemName,
        quantity: 1,
        value: 0,
        base_value: 0,
        weight: "0",
        base_weight: "0",
        notes,
        weapons
    });

    if (!item) return null;

    item.system = item.system || {};
    item.system.location = "equipped";
    item.system.equipped = true;
    item.system.stored = false;
    item.flags = foundry.utils.mergeObject(item.flags || {}, {
        gum: {
            gcs: {
                traitAttackEquipment: true,
                naturalAttacks: isGCSNaturalAttacksTrait(gcsTrait),
                sourceTraitName: sourceName || itemName,
                sourceTraitId: gcsTrait?.id || null
            }
        }
    }, { inplace: false, overwrite: true });

    return item;
}

function applyGCSContainerPathMetadata(itemData, path = [], { groupFromPath = false } = {}) {
    if (!itemData) return itemData;

    const sanitizedPath = Array.isArray(path)
        ? path.map(part => String(part || "").trim()).filter(Boolean)
        : [];

    if (!sanitizedPath.length) return itemData;

    if (groupFromPath) {
        itemData.system = itemData.system || {};
        itemData.system.group = sanitizedPath[sanitizedPath.length - 1] || itemData.system.group || "Geral";
    }

    itemData.flags = foundry.utils.mergeObject(itemData.flags || {}, {
        gum: {
            gcs: {
                containerPath: sanitizedPath,
                containerPathLabel: sanitizedPath.join(" › ")
            }
        }
    }, { inplace: false, overwrite: true });

    return itemData;
}

function ensureImportedEmbeddedItemId(itemData) {
    if (!itemData) return "";
    itemData._id = foundry.utils.randomID();
    return itemData._id;
}

async function buildGCSCharacterEquipmentItems(nodes, { location = "carried", path = [], parentContainerId = "", bodyProfileId = "humanoid" } = {}) {
    const items = [];

    for (const node of nodes || []) {
        const children = getGCSChildren(node);
        const hasChildren = children.length > 0;
        const label = getGCSContainerPathLabel(node);
        const childPath = hasChildren && label ? [...path, label] : path;
        let nextParentContainerId = parentContainerId;

        // The originating inventory list determines placement for the entire tree.
        // GCS equipped flags can also be true in other_equipment.
        const resolvedLocation = location;
        const item = await buildHybridActorItemFromGCS(
            node,
            source => parseGCSLibraryEquipment(source, { bodyProfileId })
        );
        if (item) {
            item.system = item.system || {};
            item.system.location = resolvedLocation;
            item.system.equipped = resolvedLocation === "equipped";
            item.system.stored = resolvedLocation === "stored";
            item.system.parent_container_id = parentContainerId || "";

            if (hasChildren) {
                item.system.is_container = true;

                const hasOwnGCSArmorDR = (node.features || []).some(feature => feature?.type === "dr_bonus");
                if (!hasOwnGCSArmorDR) {
                    // Containers in GCS can share the same name as complete armor items in the
                    // compendium (for example, a suit that contains individual armor pieces).
                    // In hybrid import mode, avoid inheriting DR from that matched source item
                    // unless the GCS container itself explicitly provides DR features.
                    item.system.dr_locations = {};
                }
                nextParentContainerId = ensureImportedEmbeddedItemId(item);
            }

            applyGCSContainerPathMetadata(item, path);
            items.push(item);
        }

        if (hasChildren) {
            const childItems = await buildGCSCharacterEquipmentItems(children, {
                location: resolvedLocation,
                path: childPath,
                parentContainerId: nextParentContainerId,
                bodyProfileId
            });
            items.push(...childItems);
        }
    }

    return items;
}


async function buildGCSCharacterInventoryItems(gcsData, bodyProfileId = "humanoid") {
    const equipped = await buildGCSCharacterEquipmentItems(gcsData.equipment || [], { location: "equipped", bodyProfileId });
    const carried = await buildGCSCharacterEquipmentItems(gcsData.other_equipment || [], { location: "carried", bodyProfileId });
    return [...equipped, ...carried];
}

async function buildTemplateEntryFromGCSNode(gcsNode, parserFn, itemType, { defaultCost = 0 } = {}) {
    if (itemType === "advantage") {
        const attributeEntry = parseAttributeTemplateEntryFromGCSTrait(gcsNode);
        if (attributeEntry) return attributeEntry;
    }

    const parsedItem = parserFn(gcsNode);
    if (!parsedItem) return null;

    const resolvedCost = ["advantage", "disadvantage"].includes(parsedItem.type) ? calculateItemTraitCost(parsedItem).finalPoints : Number(
        gcsNode.calc?.points
        ?? gcsNode.base_points
        ?? gcsNode.points_per_level
        ?? gcsNode.points
        ?? defaultCost
        ?? parsedItem.system?.points
        ?? 0
    ) || 0;
    let resolvedLevel = extractGCSRelativeLevel(gcsNode);
    if ((resolvedLevel === "" || resolvedLevel === null || resolvedLevel === undefined)
        && ["skill", "spell", "power"].includes(parsedItem.type)) {
        resolvedLevel = calculateRelativeLevelFromImportPoints(parsedItem.system?.difficulty || "M", resolvedCost);
    }

    const entry = {
        id: foundry.utils.randomID(),
        kind: "item",
        itemType: parsedItem.type || itemType,
        name: parsedItem.name || gcsNode.name || "Entrada",
        img: parsedItem.img || "icons/svg/item-bag.svg",
        quantity: Number(gcsNode.quantity) || 1,
        level: resolvedLevel,
        cost: resolvedCost,
        ref: String(gcsNode.reference || parsedItem.system?.ref || "").trim()
    };

    const specialization = String(parsedItem.system?.specialization || gcsNode.specialization || "").trim();
    if (specialization) entry.specialization = specialization;

    if (parsedItem.type === "equipment") {
        entry.cost = Number(parsedItem.system?.cost) || 0;
        entry.level = String(parsedItem.system?.level ?? gcsNode.level ?? "").trim();
        entry.pointsCost = Number(parsedItem.system?.points ?? gcsNode.points ?? gcsNode.calc?.points) || 0;
    }

    if (["advantage", "disadvantage"].includes(parsedItem.type)) {
        entry.trait_cost = importGCSTraitCost(gcsNode, gcsNode._inheritedModifiers || []);
        entry.level = entry.trait_cost.level;
    }

    const { item: sourceItem, matchedBy, ambiguity } = await resolveHybridSourceItem({ gcsNode, parsedItem });
    if (sourceItem) {
        const importedName = entry.name;
        entry.uuid = sourceItem.uuid;
        entry.sourceId = sourceItem.id;
        entry.hybrid = { mode: "linked", matchedBy, importedName: matchedBy?.startsWith("alias") ? importedName : null };
        if (matchedBy?.startsWith("alias")) {
            entry.name = sourceItem.name;
            const sourceSpecialization = String(sourceItem.system?.specialization || "").trim();
            if (sourceSpecialization) entry.specialization = sourceSpecialization;
        }
        return entry;
    }

    entry.inlineItem = foundry.utils.deepClone(parsedItem);
    entry.hybrid = { mode: "inline", matchedBy: null, ambiguity: ambiguity || null };
    return entry;
}

function toTemplateBlockType(templatePickerType) {
    if (templatePickerType === "count") return "selection";
    if (templatePickerType === "points") return "points";
    return "guaranteed";
}

function buildTemplateBlockBase({ type, title, picker = null }) {
    const block = {
        id: foundry.utils.randomID(),
        type,
        title,
        choiceCount: 1,
        pointsAvailable: 0,
        contents: []
    };

    if (type === "selection") {
        block.choiceCount = Math.max(1, Number(picker?.qualifier?.qualifier) || 1);
    }
    if (type === "points") {
        block.pointsAvailable = Number(picker?.qualifier?.qualifier) || 0;
    }

    return block;
}

function lockGCSTemplateEntryValues(entry, blockType) {
    if (!entry || !["guaranteed", "selection"].includes(blockType)) return entry;
    if (entry.itemType === "equipment") entry.quantityLocked = true;
    if (entry.kind === "attribute") {
        const selected = Array.isArray(entry.selectedAttributes) && entry.selectedAttributes.length
            ? entry.selectedAttributes
            : Object.entries(entry.attributes || {}).filter(([, value]) => Number(value) !== 0).map(([key]) => key);
        entry.lockedAttributes = [...new Set(selected)];
    }
    return entry;
}

async function buildTemplateOptionEntryFromNode(node, parserFn, itemType, path = []) {
    if (!node) return null;

    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    if (!hasChildren) {
        return buildTemplateEntryFromGCSNode(node, parserFn, itemType, {
            defaultCost: Number(node.base_points || node.points_per_level || node.points || 0)
        });
    }

    const subBlocks = await buildTemplateBlocksRecursive(node, parserFn, itemType, path);
    return {
        id: foundry.utils.randomID(),
        kind: "group",
        name: node.name || "Grupo",
        img: "icons/svg/upgrade.svg",
        quantity: 1,
        level: "",
        cost: subBlocks.filter(block => block.type === "guaranteed").reduce((sum, block) => sum + block.contents.reduce((subtotal, entry) => subtotal + Number(entry.cost || 0), 0), 0),
        localNotes: getGCSItemNotes(node),
        subBlocks
    };
}

async function buildTemplateBlocksRecursive(container, parserFn, itemType, path = []) {
    if (!container) return [];

    const nodeName = String(container.name || "Bloco").trim() || "Bloco";
    const currentPath = [...path, nodeName];
    const title = currentPath.join(" › ");
    if (itemType === "advantage" && container.container_type === "alternative_abilities") throw new Error("Importação de custos de habilidades alternativas ainda não suportada.");
    const children = (Array.isArray(container.children) ? container.children : []).filter(child => !child.disabled).map(child => itemType === "advantage"
        ? { ...child, _inheritedModifiers: [...(container._inheritedModifiers || []), ...(container.modifiers || [])], _multiplicativeModifiers: container._multiplicativeModifiers }
        : child);
    const hasPicker = Boolean(container.template_picker);
    const blocks = [];

    if (hasPicker) {
        const blockType = toTemplateBlockType(container.template_picker?.type);
        const block = buildTemplateBlockBase({ type: blockType, title, picker: container.template_picker });

        for (const child of children) {
            const entry = await buildTemplateOptionEntryFromNode(child, parserFn, itemType, currentPath);
            if (entry) block.contents.push(lockGCSTemplateEntryValues(entry, blockType));
        }

        if (block.contents.length || blockType !== "guaranteed") {
            blocks.push(block);
        }
        return blocks;
    }

    const leaves = children.filter(child => !Array.isArray(child?.children) || child.children.length === 0);
    if (leaves.length) {
        const guaranteedBlock = buildTemplateBlockBase({ type: "guaranteed", title });
        for (const leaf of leaves) {
            const entry = await buildTemplateEntryFromGCSNode(leaf, parserFn, itemType, {
                defaultCost: Number(leaf.base_points || leaf.points_per_level || leaf.points || 0)
            });
            if (entry) guaranteedBlock.contents.push(lockGCSTemplateEntryValues(entry, "guaranteed"));
        }

        if (guaranteedBlock.contents.length) {
            blocks.push(guaranteedBlock);
        }
    }

    const childContainers = children.filter(child => Array.isArray(child?.children) && child.children.length > 0);
    for (const childContainer of childContainers) {
        const childBlocks = await buildTemplateBlocksRecursive(childContainer, parserFn, itemType, currentPath);
        blocks.push(...childBlocks);
    }

    return blocks;
}


async function parseGCSTemplate(gcsData, fileName = "") {
    const templateSystem = getSystemTemplate("Item", "template");
    const blocks = [];
    const sections = [
        { key: "traits", type: "advantage", parser: parseGCSLibraryTrait, labelKey: "Advantage" },
        { key: "skills", type: "skill", parser: parseGCSLibrarySkill, labelKey: "Skill" },
        { key: "spells", type: "spell", parser: parseGCSLibrarySpell, labelKey: "Spell" },
        { key: "equipment", type: "equipment", parser: parseGCSLibraryEquipment, labelKey: "Equipment" },
        { key: "other_equipment", type: "equipment", parser: parseGCSLibraryEquipment, labelKey: "OtherEquipment" }
    ];
    for (const section of sections) {
        const roots = Array.isArray(gcsData[section.key]) ? gcsData[section.key] : [];
        const leaves = [];
        for (const root of roots.filter(node => node && !node.disabled)) {
            const node = section.type === "advantage"
                ? { ...root, _multiplicativeModifiers: Boolean(gcsData.settings?.use_multiplicative_modifiers) }
                : root;
            if (Array.isArray(node.children) && node.children.length) {
                blocks.push(...await buildTemplateBlocksRecursive(node, section.parser, section.type, []));
            } else {
                const entry = await buildTemplateEntryFromGCSNode(node, section.parser, section.type);
                if (entry) leaves.push(lockGCSTemplateEntryValues(entry, "guaranteed"));
            }
        }
        if (leaves.length) {
            const block = buildTemplateBlockBase({ type: "guaranteed", title: game.i18n.localize(`GUM.Template.${section.labelKey}`) });
            block.contents = leaves;
            blocks.push(block);
        }
    }

    if (!blocks.length) return null;

    const baseName = gcsData.traits?.[0]?.name || gcsData.skills?.[0]?.name || gcsData.profile?.name
        || gcsData.spells?.[0]?.name || String(fileName || "Template GCS").replace(/\.[^.]+$/, "");
    templateSystem.blocks = blocks;
    const topLevelRoots = sections.flatMap(section => Array.isArray(gcsData[section.key]) ? gcsData[section.key] : []);
    templateSystem.ref = String(gcsData.reference || gcsData.ref || (topLevelRoots.length === 1 ? topLevelRoots[0]?.reference : "") || "").trim();

    return {
        name: baseName || "Template GCS",
        type: "template",
        system: templateSystem,
        flags: {
            gum: {
                importedFrom: "gcs-template",
                sourceVersion: gcsData.version || null,
                importedAt: new Date().toISOString()
            }
        }
    };
}

/**
 * A função "Tradutora" (Mapper) principal para um Personagem GCS.
 */

function formatGCSCharacterNotes(notes) {
    if (!notes) return "";
    if (typeof notes === "string") return notes;

    const formatNote = (note) => {
        if (!note) return "";
        if (typeof note === "string") return note;

        const text = String(note.text || note.notes || note.note || note.description || "").trim();
        const reference = String(note.reference || note.ref || "").trim();
        if (text && reference) return `${text}\nReferência: ${reference}`;
        return text || reference;
    };

    if (Array.isArray(notes)) {
        return notes.map(formatNote).filter(Boolean).join("\n\n");
    }

    if (typeof notes === "object") return formatNote(notes);

    return String(notes || "");
}

async function parseGCSCharacter(gcsData, {
    fallbackActorImage = CONST.DEFAULT_TOKEN,
    fallbackTokenImage = CONST.DEFAULT_TOKEN,
    fallbackBodyProfileId = "humanoid"
} = {}) {
    ui.notifications.info("Lendo dados do GCS... Mapeando atributos.");
    
    const systemData = getSystemTemplate("Actor", "character");
    const ensureObjectPath = (root, path, fallback = {}) => {
        if (!root || typeof root !== "object") return fallback;

        const segments = path.split(".");
        let current = root;
        for (let i = 0; i < segments.length; i++) {
            const key = segments[i];
            if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
                current[key] = {};
            }
            current = current[key];
        }
        return current;
    };

    // Alguns templates podem vir incompletos dependendo da versão do sistema.
    ensureObjectPath(systemData, "details");
    ensureObjectPath(systemData, "points");
    ensureObjectPath(systemData, "attributes");
    ensureObjectPath(systemData, "combat");
    for (const attrKey of [
        "st", "dx", "iq", "ht", "lifting_st", "per", "vont", "hp", "fp",
        "vision", "hearing", "tastesmell", "touch", "basic_speed", "basic_move", "dodge", "enhanced_move", "mt"
    ]) {
        ensureObjectPath(systemData, `attributes.${attrKey}`);
    }

    // --- 1. Mapeamento do Perfil Básico ---
    const actorName = gcsData.profile?.name || "Personagem Importado";
    
    systemData.details.age = gcsData.profile?.age || "";
    systemData.details.gender = gcsData.profile?.gender || "";
    systemData.details.eyes = gcsData.profile?.eyes || "";
    systemData.details.hair = gcsData.profile?.hair || "";
    systemData.details.skin = gcsData.profile?.skin || "";
    systemData.details.weight = gcsData.profile?.weight || "";
    systemData.details.height = gcsData.profile?.height || "";
    const importedCharacterNotes = formatGCSCharacterNotes(gcsData.notes ?? gcsData.profile?.notes ?? "");
    systemData.details.backstory = importedCharacterNotes;
    if (Object.prototype.hasOwnProperty.call(systemData.details, "notes")) {
        systemData.details.notes = importedCharacterNotes;
    }
    systemData.points.total = gcsData.total_points || 0;
    systemData.points.unspent = gcsData.total_points || 0; 
    const bodyProfileId = inferGUMBodyProfileIdFromGCS(
        gcsData?.settings?.body_type || gcsData?.body_type,
        fallbackBodyProfileId
    );
    systemData.combat.body_profile = bodyProfileId;
    const importedNativeDR = collectImportedGCSNativeDR(gcsData, bodyProfileId);
    if (Object.keys(importedNativeDR).length > 0) {
        systemData.combat.dr_mods = foundry.utils.mergeObject(systemData.combat.dr_mods || {}, importedNativeDR, {
            inplace: false,
            overwrite: true
        });
        systemData.combat.gcs_imported_native_dr = foundry.utils.deepClone(importedNativeDR);
    }

    // =============================================================
    // MAPEAMENTO DE IMAGEM (PORTRAIT)
    // =============================================================
    let actorImgPath = fallbackActorImage || CONST.DEFAULT_TOKEN;
    let tokenImgPath = fallbackTokenImage || fallbackActorImage || CONST.DEFAULT_TOKEN;

    if (gcsData.profile?.portrait) {
        try {
            ui.notifications.info("Processando imagem do personagem...");
            
            const base64Data = gcsData.profile.portrait;
            
            let fileType = 'image/webp';
            let fileExtension = 'webp';
            if (base64Data.startsWith('iVBOR')) { // PNG
                fileType = 'image/png';
                fileExtension = 'png';
            } else if (base64Data.startsWith('/9j/')) { // JPG
                fileType = 'image/jpeg';
                fileExtension = 'jpg';
            }

            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: fileType }); 
            
            const actorSlug = actorName.slugify();
            const fileName = `${actorSlug}-portrait.${fileExtension}`; 

            const uploadPath = "gcs_imports/portraits"; 
            
            try {
                await FilePicker.createDirectory("data", "gcs_imports", {});
            } catch (err) { /* Ignora se já existir */ }
            try {
                await FilePicker.createDirectory("data", uploadPath, {});
            } catch (err) { /* Ignora se já existir */ }
            
            const file = new File([blob], fileName, { type: fileType });

            const uploadResponse = await FilePicker.upload("data", uploadPath, file, {});
            actorImgPath = uploadResponse.path;
            tokenImgPath = uploadResponse.path;
            
            ui.notifications.info("Imagem do personagem importada com sucesso!");

        } catch (err) {
            console.error("GUM | Falha ao processar imagem do GCS (pode estar corrompida):", err);
            ui.notifications.warn("Não foi possível importar a imagem do personagem.");
        }
    }

    // --- 2. Mapeamento dos Atributos Principais ---
    const gcsAttributes = gcsData.attributes || [];
    const getGCSAttr = (id) => gcsAttributes.find(a => a.attr_id === id);

    const coreAttrs = ["st", "dx", "iq", "ht"];
    for (const id of coreAttrs) {
        const attr = getGCSAttr(id);
        if (attr) {
            systemData.attributes[id].value = attr.calc.value;
            if (id === "st") {
                systemData.attributes.lifting_st.value = attr.calc.value;
            }
        }
    }
    
    const per = getGCSAttr("per");
    if (per) systemData.attributes.per.value = per.calc.value;
    const will = getGCSAttr("will");
    if (will) systemData.attributes.vont.value = will.calc.value; 

    const hp = getGCSAttr("hp");
    if (hp) {
        systemData.attributes.hp.max = hp.calc.value;
        systemData.attributes.hp.value = hp.calc.current;
    }
  const fp = getGCSAttr("fp");
    if (fp) {
        systemData.attributes.fp.max = fp.calc.value;
        systemData.attributes.fp.value = fp.calc.current;
    }

    // --- 2.1. Mapeamento de Atributos Secundários ---
    const getNumericCandidate = (...values) => {
        const coerceNumeric = (value) => {
            if (value === null || value === undefined || value === "") return null;
            if (Array.isArray(value)) {
                for (const entry of value) {
                    const numericEntry = coerceNumeric(entry);
                    if (numericEntry !== null) return numericEntry;
                }
                return null;
            }
            if (typeof value === "object") {
                return getNumericCandidate(value.value, value.current, value.score);
            }
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
            const match = String(value).match(/[-+]?\d+(?:\.\d+)?/);
            if (!match) return null;
            const parsed = Number(match[0]);
            return Number.isFinite(parsed) ? parsed : null;
        };

        for (const value of values) {
            const numeric = coerceNumeric(value);
            if (numeric !== null) return numeric;
        }
        return null;
    };

    const getSecondaryFromAttributes = (...ids) => {
        for (const id of ids) {
            const attr = getGCSAttr(id);
            if (!attr) continue;
            const value = getNumericCandidate(attr.calc?.value, attr.value, attr.calc?.current);
            if (value !== null) return value;
        }
        return null;
    };

    const secondaryAttributeMap = {
        basic_speed: ["basic_speed", "speed"],
        basic_move: ["basic_move", "move"],
        enhanced_move: ["enhanced_move"],
        dodge: ["dodge"],
        mt: ["sm", "size_modifier", "size"],
        vision: ["vision"],
        hearing: ["hearing"],
        tastesmell: ["taste_smell", "tastesmell"],
        touch: ["touch"]
    };

    for (const [targetKey, gcsIds] of Object.entries(secondaryAttributeMap)) {
        const mappedValue = getSecondaryFromAttributes(...gcsIds);
        if (mappedValue !== null) {
            systemData.attributes[targetKey].value = mappedValue;
        }
    }

    const importedSizeModifier = getNumericCandidate(
        gcsData.calc?.size_modifier,
        gcsData.calc?.sm,
        gcsData.profile?.size_modifier,
        gcsData.profile?.sm,
        gcsData.profile?.SM,
        gcsData.profile?.size
    );
    if (importedSizeModifier !== null) {
        systemData.attributes.mt.value = importedSizeModifier;
    }
    
  if (gcsData.calc) {
        const formatDamageString = (dmg) => normalizeGCSDamageFormula(dmg);
        const calcBasicSpeed = getNumericCandidate(gcsData.calc.basic_speed, gcsData.calc.speed);
        const calcBasicMove = getNumericCandidate(gcsData.calc.basic_move, gcsData.calc.move);
        const calcDodge = getNumericCandidate(gcsData.calc.dodge);

        if (calcBasicSpeed !== null) {
            systemData.attributes.basic_speed.value = calcBasicSpeed;
        }
        if (calcBasicMove !== null) {
            systemData.attributes.basic_move.value = calcBasicMove;
        }
        if (calcDodge !== null) {
            systemData.attributes.dodge.value = calcDodge;
            systemData.attributes.dodge.gcs_imported_fixed = calcDodge;
        }

        systemData.attributes.thrust_damage.value = formatDamageString(gcsData.calc.thrust) || "1d6-2";
        systemData.attributes.swing_damage.value = formatDamageString(gcsData.calc.swing) || "1d6";
    }

    // No GURPS os sentidos partem de PER; se vierem ausentes no GCS, preserva uma base coerente.
    const perBase = Number(systemData.attributes.per?.value);
    if (Number.isFinite(perBase)) {
        for (const senseKey of ["vision", "hearing", "tastesmell", "touch"]) {
            const currentValue = Number(systemData.attributes[senseKey]?.value);
            if (!Number.isFinite(currentValue)) {
                systemData.attributes[senseKey].value = perBase;
            }
        }
    }
    // --- 3. Mapeamento de Itens (VANTAGENS, PERÍCIAS, EQUIPAMENTOS) ---
    const itemsToCreate = [];
    
 // =============================================================
    // MAPEAMENTO DE VANTAGENS E DESVANTAGENS
    // =============================================================
    ui.notifications.info("Mapeando Vantagens e Desvantagens...");
    const traitAttackEntries = collectGCSTraitsWithWeapons(gcsData.traits || []);
    for (const gcsTrait of traitAttackEntries) {
        const item = buildGCSTraitAttackEquipmentItem(gcsTrait);
        if (item) itemsToCreate.push(item);
    }

    const traitRoots = (gcsData.traits || []).filter(gcsTrait => !isGCSNaturalAttacksTrait(gcsTrait));
    const traitEntries = collectGCSPricedTraits(traitRoots, Boolean(gcsData.settings?.use_multiplicative_modifiers));
    for (const { node: gcsTrait, path } of traitEntries) {
        if (isGCSNaturalAttacksTrait(gcsTrait)) continue;

        const item = await buildHybridActorItemFromGCS(gcsTrait, parseGCSLibraryTrait);
        if (item) {
            applyGCSContainerPathMetadata(item, path);
            itemsToCreate.push(item);
        }
    }

// =============================================================
// MAPEAMENTO DE PERÍCIAS E TÉCNICAS
// =============================================================
ui.notifications.info("Mapeando Perícias...");

const skillEntries = collectGCSCharacterLeafEntries(
    gcsData.skills || []
);

// Guarda a última perícia normal encontrada.
// Isso permite resolver técnicas que chegam do GCS
// com nomes como @perícia@ ou @especialização@.
let lastGCSBaseSkill = null;

for (const {
    node: rawGCSSkill,
    path
} of skillEntries) {
    const gcsSkill = resolveGCSImportSkill(
        rawGCSSkill,
        lastGCSBaseSkill
    );

    const item = await buildHybridActorItemFromGCS(
        gcsSkill,
        parseGCSLibrarySkill
    );

    if (item) {
        /*
        * Reaplica os pré-definidos depois da importação híbrida.
        *
        * Nesse ponto, "item" já é o resultado definitivo da
        * tradução e da eventual mesclagem com o compêndio.
        */
        applyGCSDefaultsToImportedCharacterSkill(
            item,
            gcsSkill
        );

        applyGCSContainerPathMetadata(
            item,
            path,
            {
                groupFromPath: true
            }
        );

        itemsToCreate.push(item);
    }

    // Técnicas não substituem o contexto.
    // Somente uma perícia normal passa a ser a nova base.
    if (!isGCSTechnique(gcsSkill)) {
        lastGCSBaseSkill = {
            name: gcsSkill.name,
            specialization:
                gcsSkill.specialization || ""
        };
    }
}

    // =============================================================
    // MAPEAMENTO DE EQUIPAMENTOS (Armas e Armaduras)
    // =============================================================
    ui.notifications.info("Mapeando Equipamentos...");

    itemsToCreate.push(...await buildGCSCharacterInventoryItems(gcsData, bodyProfileId));

    // =============================================================
    // MAPEAMENTO DE MAGIAS (Spell)
    // =============================================================
    ui.notifications.info("Mapeando Magias...");
    const spellEntries = collectGCSCharacterLeafEntries(gcsData.spells || []);
    for (const { node: gcsSpell, path } of spellEntries) {
        const item = await buildHybridActorItemFromGCS(gcsSpell, parseGCSLibrarySpell);
        if (item) {
            applyGCSContainerPathMetadata(item, path, { groupFromPath: true });
            itemsToCreate.push(item);
        }
    }

    // --- 4. Retorna o objeto final que o Actor.create() espera ---
    return {
        name: actorName,
        type: "character",
        img: actorImgPath, // Define a imagem do Ator
        prototypeToken: {
            "texture.src": tokenImgPath, // Define a imagem do Token
            "sight.enabled": true 
        },
        system: systemData,
        items: itemsToCreate 
    };
}

/**
 * Exporta todos os documentos de um compêndio para um arquivo JSON.
 */
export async function exportCompendiumToJson() {
    const allPacks = game.packs.contents;
    if (allPacks.length === 0) {
        return ui.notifications.error("Nenhum compêndio encontrado no mundo.");
    }

    const packOptions = allPacks
        .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"))
        .map(pack => {
            const packageType = pack.metadata.packageType || "desconhecido";
            const documentType = pack.metadata.type || "Documento";
            return `<option value="${pack.collection}">${pack.title} (${documentType} • ${packageType})</option>`;
    }).join("");

    new Dialog({
        title: "Exportar Compêndio para JSON",
        content: `
            <div style="padding: 10px 0;">
                <p>Selecione qual compêndio deseja exportar:</p>
                <div class="form-group" style="margin-top: 10px;">
                    <label style="font-weight: bold;">Compêndio:</label>
                    <select name="compendium-target" style="width: 100%;">
                        ${packOptions}
                    </select>
                </div>
            </div>
        `,
        buttons: {
            export: {
                icon: '<i class="fas fa-file-export"></i>',
                label: "Exportar",
                callback: async (html) => {
                    const packName = html.find('select[name="compendium-target"]').val();
                    if (!packName) return;

                    const pack = game.packs.get(packName);
                    if (!pack) {
                        return ui.notifications.error(`Erro: Compêndio "${packName}" não pôde ser encontrado.`);
                    }

                    await exportSelectedCompendium(pack);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancelar"
            }
        },
        default: "export"
    }).render(true);
}

/**
 * Exporta uma ficha de personagem (Ator) para um arquivo JSON.
 */
export async function exportCharacterToJson() {
    const characters = game.actors.filter(actor => actor.type === "character");

    if (characters.length === 0) {
        return ui.notifications.warn("Nenhuma ficha de personagem encontrada para exportar.");
    }

    const actorOptions = characters.map(actor => {
        return `<option value="${actor.id}">${actor.name}</option>`;
    }).join("");

    new Dialog({
        title: "Exportar Ficha para JSON",
        content: `
            <div style="padding: 10px 0;">
                <p>Selecione a ficha de personagem que deseja exportar:</p>
                <div class="form-group" style="margin-top: 10px;">
                    <label style="font-weight: bold;">Personagem:</label>
                    <select name="actor-target" style="width: 100%;">
                        ${actorOptions}
                    </select>
                </div>
            </div>
        `,
        buttons: {
            export: {
                icon: '<i class="fas fa-user-export"></i>',
                label: "Exportar",
                callback: async (html) => {
                    const actorId = html.find('select[name="actor-target"]').val();
                    if (!actorId) return;

                    const actor = game.actors.get(actorId);
                    if (!actor) {
                        return ui.notifications.error("Erro: Personagem selecionado não pôde ser encontrado.");
                    }

                    const actorData = actor.toObject();
                    downloadJsonFile(actorData, `${sanitizeFileName(actor.name)}.json`);
                    ui.notifications.info(`Ficha "${actor.name}" exportada com sucesso.`);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancelar"
            }
        },
        default: "export"
    }).render(true);
}

export async function prepareGumCharacterImportData(source, { hybrid = false } = {}) {
    if (!source || source.type !== "character" || !source.system || !Array.isArray(source.items)) {
        throw new Error(game.i18n.localize("GUM.CharacterJsonImport.InvalidFile"));
    }

    const actorData = foundry.utils.deepClone(source);
    delete actorData._id;
    delete actorData._stats;
    if (actorData.folder && !game.folders?.get?.(actorData.folder)) actorData.folder = null;

    if (!hybrid) return actorData;

    actorData.items = await Promise.all(actorData.items.map(async itemData => {
        if (!HYBRID_IMPORTABLE_ITEM_TYPES.has(itemData?.type)) return itemData;
        const { item: sourceItem, matchedBy, ambiguity } = await resolveHybridSourceItem({
            gcsNode: null,
            parsedItem: itemData
        });
        if (!sourceItem) {
            if (ambiguity?.length) {
                const preserved = foundry.utils.deepClone(itemData);
                preserved.flags = foundry.utils.mergeObject(preserved.flags || {}, {
                    gum: { hybridImport: { ambiguity } }
                }, { inplace: false, overwrite: true });
                return preserved;
            }
            return itemData;
        }

        const merged = mergeHybridImportedData(sourceItem, itemData, { mode: "gum-json" });
        merged.flags.gum.hybridImport.matchedBy = matchedBy;
        if (matchedBy?.startsWith("alias")) {
            merged.flags.gum.hybridImport.importedName = itemData.name;
            merged.name = sourceItem.name;
            if (sourceItem.system?.specialization) merged.system.specialization = sourceItem.system.specialization;
        }
        return merged;
    }));
    return actorData;
}

async function chooseGumCharacterImportMode(fileName) {
    const policy = getHybridImportPolicy();
    const scopeName = game.i18n.localize(`GUM.ContentSources.HybridScope.${policy.scope}.Name`);
    return new Promise(resolve => {
        new Dialog({
            title: game.i18n.localize("GUM.CharacterJsonImport.Title"),
            content: `
                <div class="gum-character-json-import">
                    <p>${game.i18n.format("GUM.CharacterJsonImport.Introduction", { file: escapeImportHTML(fileName) })}</p>
                    <label class="gum-character-json-import__mode">
                        <input type="radio" name="gum-character-import-mode" value="faithful" checked>
                        <span><strong>${game.i18n.localize("GUM.CharacterJsonImport.Faithful.Name")}</strong><small>${game.i18n.localize("GUM.CharacterJsonImport.Faithful.Hint")}</small></span>
                    </label>
                    <label class="gum-character-json-import__mode ${policy.enabled ? "" : "is-disabled"}">
                        <input type="radio" name="gum-character-import-mode" value="hybrid" ${policy.enabled ? "" : "disabled"}>
                        <span><strong>${game.i18n.localize("GUM.CharacterJsonImport.Hybrid.Name")}</strong><small>${game.i18n.format("GUM.CharacterJsonImport.Hybrid.Hint", { scope: escapeImportHTML(scopeName) })}</small></span>
                    </label>
                </div>`,
            buttons: {
                import: {
                    icon: '<i class="fas fa-file-import"></i>',
                    label: game.i18n.localize("GUM.CharacterJsonImport.Import"),
                    callback: html => resolve(html.find('input[name="gum-character-import-mode"]:checked').val() || "faithful")
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("GUM.CharacterJsonImport.Cancel"),
                    callback: () => resolve(null)
                }
            },
            default: "import",
            close: () => resolve(null)
        }, {
            classes: ["dialog", "gum", "gum-character-json-import-dialog"],
            width: 560
        }).render(true);
    });
}

/** Importa uma ficha exportada pelo próprio GUM como um novo Ator. */
export async function importCharacterFromJson() {
    if (!canUserCreateActors(game.user)) {
        return ui.notifications.error(game.i18n.localize("GUM.CharacterJsonImport.PermissionDenied"));
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const source = JSON.parse(await file.text());
            if (!source || source.type !== "character" || !source.system || !Array.isArray(source.items)) {
                throw new Error(game.i18n.localize("GUM.CharacterJsonImport.InvalidFile"));
            }
            const mode = await chooseGumCharacterImportMode(file.name);
            if (!mode) return;
            const actorData = await prepareGumCharacterImportData(source, { hybrid: mode === "hybrid" });
            const created = await Actor.create(actorData);
            ui.notifications.info(game.i18n.format("GUM.CharacterJsonImport.Success", { name: created.name }));
            created.sheet?.render(true);
        } catch (error) {
            console.error("GUM | Falha ao importar ficha JSON do GUM:", error);
            ui.notifications.error(error?.message || game.i18n.localize("GUM.CharacterJsonImport.InvalidFile"));
        }
    };
    input.click();
}

function downloadJsonFile(data, filename) {
    const jsonContent = JSON.stringify(data, null, 2);
saveDataToFile(jsonContent, "application/json", filename);
}

function sanitizeFileName(name = "export") {
    return String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .toLowerCase() || "export";
}

async function exportSelectedCompendium(pack) {
    try {
        const documents = await pack.getDocuments();
        if (!documents.length && !(pack.folders?.size || pack.folders?.length)) {
            return ui.notifications.warn(`O compêndio "${pack.title}" está vazio.`);
        }

        const data = buildCompendiumLibraryExport(pack, documents);
        const safeName = sanitizeFileName(pack.metadata.label || pack.metadata.name);
        downloadJsonFile(data, `gum_${safeName}.json`);
        ui.notifications.info(`Exportação concluída! ${data.documents.length} registros e ${data.folders.length} pastas de "${pack.title}" foram exportados.`);
    } catch (err) {
        console.error(`GUM | Falha ao exportar ${pack?.collection}:`, err);
        ui.notifications.error(`Falha ao exportar "${pack?.title || "compêndio"}": ${err.message}`);
    }
}

const registerCompendiumContextOptions = (_app, options) => {
    const importLabel = game.i18n.localize("GUM.LibraryImport.ImportIntoCompendium");
    if (!options.some(option => (option.name || option.label) === importLabel)) {
        const visible = entry => {
            const pack = getContextCompendium(entry);
            return Boolean(game.user?.isGM && pack?.metadata.type === "Item");
        };
        const activate = entry => {
            const pack = getContextCompendium(entry);
            if (!pack) return ui.notifications.error("Não foi possível identificar o compêndio selecionado.");
            return importFromJson({ pack });
        };
        options.push({
            name: importLabel,
            label: importLabel,
            icon: '<i class="fas fa-file-import"></i>',
            condition: visible,
            visible,
            callback: entry => activate(entry),
            onClick: (_event, entry) => activate(entry)
        });
    }
    const templateImportLabel = game.i18n.localize("GUM.LibraryImport.ImportTemplatesIntoCompendium");
    if (!options.some(option => (option.name || option.label) === templateImportLabel)) {
        const visible = entry => Boolean(game.user?.isGM && getContextCompendium(entry)?.metadata.type === "Item");
        const activate = entry => {
            const pack = getContextCompendium(entry);
            if (!pack) return ui.notifications.error(game.i18n.localize("GUM.LibraryImport.Errors.CompendiumNotFound"));
            return importGCSTemplatesToCompendium({ pack });
        };
        options.push({
            name: templateImportLabel,
            label: templateImportLabel,
            icon: '<i class="fas fa-layer-group"></i>',
            condition: visible,
            visible,
            callback: entry => activate(entry),
            onClick: (_event, entry) => activate(entry)
        });
    }
    const exportLabel = game.i18n.localize("GUM.LibraryImport.ExportCompendium");
    if (!options.some(option => (option.name || option.label) === exportLabel)) {
        const visible = entry => Boolean(game.user?.isGM && getContextCompendium(entry)?.metadata.type === "Item");
        const activate = entry => {
            const pack = getContextCompendium(entry);
            if (!pack) return ui.notifications.error("Não foi possível identificar o compêndio selecionado.");
            return exportSelectedCompendium(pack);
        };
        options.push({
            name: exportLabel,
            label: exportLabel,
            icon: '<i class="fas fa-file-export"></i>',
            condition: visible,
            visible,
            callback: entry => activate(entry),
            onClick: (_event, entry) => activate(entry)
        });
    }

    const clearLabel = game.i18n.localize("GUM.LibraryImport.ClearCompendium");
    if (!options.some(option => (option.name || option.label) === clearLabel)) {
        const visible = entry => Boolean(game.user?.isGM && getContextCompendium(entry)?.metadata.type === "Item");
        const activate = entry => {
            const pack = getContextCompendium(entry);
            if (!pack) return ui.notifications.error(game.i18n.localize("GUM.LibraryImport.Errors.CompendiumNotFound"));
            return confirmAndClearCompendium(pack);
        };
        options.push({
            name: clearLabel,
            label: clearLabel,
            icon: '<i class="fas fa-trash-alt"></i>',
            condition: visible,
            visible,
            callback: entry => activate(entry),
            onClick: (_event, entry) => activate(entry)
        });
    }
};

// System scripts can be evaluated before `game.release` is available. Register both
// generations explicitly; Foundry only fires the hook used by its active directory API.
Hooks.on("getCompendiumDirectoryEntryContext", registerCompendiumContextOptions);
Hooks.on("getCompendiumContextOptions", registerCompendiumContextOptions);

Hooks.on("renderCompendiumDirectory", (_app, html) => {
    if (!game.user?.isGM) return;
    const root = html?.querySelector ? html : html?.[0];
    const headerActions = root?.querySelector?.(".directory-header .header-actions");
    if (!headerActions || root.querySelector(".gum-compendium-import-button")) return;

    const row = document.createElement("div");
    row.className = "gum-directory-import-actions";
    row.innerHTML = `<button class="gum-compendium-import-button" type="button">
        <i class="fas fa-file-import"></i> ${game.i18n.localize("GUM.LibraryImport.ImportLibrary")}
    </button><button class="gum-compendium-import-templates-button" type="button">
        <i class="fas fa-layer-group"></i> ${game.i18n.localize("GUM.LibraryImport.ImportTemplates")}
    </button>`;
    row.querySelector(".gum-compendium-import-button").addEventListener("click", () => importFromJson());
    row.querySelector(".gum-compendium-import-templates-button").addEventListener("click", () => importGCSTemplatesToCompendium());
    headerActions.append(row);
});

function getContextCompendium(entry) {
    if (entry?.metadata?.type && entry?.collection) return entry;
    return game.packs.get(getContextCompendiumCollection(entry));
}

function getContextCompendiumCollection(entry) {
    const element = entry?.[0] || entry;
    const directoryEntry = element?.closest?.("[data-pack], [data-entry-id]") || element;
    const directCollection = typeof entry?.collection === "string" ? entry.collection : entry?.collection?.collection;
    return directoryEntry?.dataset?.pack
        || directoryEntry?.dataset?.entryId
        || entry?.pack
        || directCollection
        || entry?.document?.collection?.collection;
}

async function confirmAndClearCompendium(pack) {
    const confirmed = await new Promise(resolve => {
        new Dialog({
            title: game.i18n.localize("GUM.LibraryImport.ClearConfirmTitle"),
            content: `<p>${game.i18n.format("GUM.LibraryImport.ClearConfirmContent", {
                name: escapeImportHTML(pack.title)
            })}</p>`,
            buttons: {
                clear: {
                    icon: '<i class="fas fa-trash-alt"></i>',
                    label: game.i18n.localize("GUM.LibraryImport.ClearConfirm"),
                    callback: () => resolve(true)
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("GUM.LibraryImport.ClearCancel"),
                    callback: () => resolve(false)
                }
            },
            default: "cancel",
            close: () => resolve(false)
        }).render(true);
    });
    if (!confirmed) return;

    const originalLocked = Boolean(pack.locked);
    try {
        if (originalLocked) await pack.configure({ locked: false });
        const documents = await pack.getDocuments();
        if (documents.length) {
            await Item.deleteDocuments(documents.map(document => document.id), { pack: pack.collection });
        }
        const folderIds = Array.from(pack.folders ?? [])
            .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
            .map(folder => folder.id);
        if (folderIds.length) await Folder.deleteDocuments(folderIds, { pack: pack.collection });
        ui.notifications.info(game.i18n.format("GUM.LibraryImport.ClearSuccess", { name: pack.title }));
    } catch (err) {
        console.error(`GUM | Falha ao limpar ${pack?.collection}:`, err);
        ui.notifications.error(game.i18n.format("GUM.LibraryImport.ClearFailure", {
            name: pack?.title || game.i18n.localize("GUM.LibraryImport.CompendiumFallback"),
            error: err.message
        }));
    } finally {
        if (pack.locked !== originalLocked) await pack.configure({ locked: originalLocked });
    }
}

const ITEM_BUNDLE_FOLDER_TYPES = new Set([
    "advantage", "disadvantage", "skill", "equipment", "money_source", "spell", "power",
    "modifier", "condition", "effect", "trigger", "eqp_modifier", "gm_modifier", "template"
]);

function getBundleFolderMarker(folder) {
    return folder?.flags?.gum?.itemBundle ?? folder?._source?.flags?.gum?.itemBundle;
}

function prepareItemBundleFolders(prepared) {
    const rootId = stableBundleDocumentId(prepared.id, "folder:bundle");
    const rootKey = "folder:bundle";
    const marker = key => ({ id: prepared.id, key, version: GUM_ITEM_BUNDLE_VERSION });
    const root = {
        key: rootKey,
        id: rootId,
        data: {
            _id: rootId,
            name: game.i18n.format("GUM.LibraryImport.BundleFolderName", { name: prepared.name }),
            type: "Item",
            folder: null,
            flags: { gum: { itemBundle: marker(rootKey) } }
        }
    };
    const types = [...new Set(prepared.documents.map(entry => (
        ITEM_BUNDLE_FOLDER_TYPES.has(entry.data.type) ? entry.data.type : "other"
    )))];
    const typeFolders = types.map(type => {
        const key = `folder:type:${type}`;
        const id = stableBundleDocumentId(prepared.id, key);
        return {
            key,
            type,
            id,
            data: {
                _id: id,
                name: game.i18n.localize(`GUM.LibraryImport.ItemType.${type}`),
                type: "Item",
                folder: rootId,
                flags: { gum: { itemBundle: marker(key) } }
            }
        };
    });
    return {
        folders: [root, ...typeFolders],
        folderIdByType: new Map(typeFolders.map(folder => [folder.type, folder.id]))
    };
}

function previewItemBundleFolderSynchronization(existingFolders, folderPlan, bundleId) {
    const existingFolderById = new Map(Array.from(existingFolders ?? [], folder => [folder.id || folder._id, folder]));
    const collisions = [];
    let creates = 0;
    let existing = 0;
    for (const entry of folderPlan.folders) {
        const folder = existingFolderById.get(entry.id);
        if (!folder) {
            creates += 1;
            continue;
        }
        const marker = getBundleFolderMarker(folder);
        if (marker?.id === bundleId && marker?.key === entry.key) existing += 1;
        else collisions.push({ kind: "folder", key: entry.key, id: entry.id, existingName: folder.name || "" });
    }
    return { creates, existing, collisions };
}

function bundleFolderMarkerUpdate(existing, planned) {
    const currentMarker = getBundleFolderMarker(existing);
    const plannedMarker = planned.data.flags?.gum?.itemBundle;
    if (currentMarker?.id === plannedMarker?.id
        && currentMarker?.key === plannedMarker?.key
        && currentMarker?.version === plannedMarker?.version) return null;
    return { _id: planned.id, "flags.gum.itemBundle": plannedMarker };
}

/**
 * Import a self-contained bundle into one Item compendium.
 * Dependencies are synchronized before the root item and every local reference
 * is converted to a destination UUID before the first write.
 */
export async function synchronizeItemBundle(pack, bundleData, {
    afterSynchronize = null,
    notifySuccess = true
} = {}) {
    const t = key => game.i18n.localize(`GUM.LibraryImport.${key}`);
    const format = (key, data) => game.i18n.format(`GUM.LibraryImport.${key}`, data);
    const originalLocked = Boolean(pack?.locked);
    const createdIds = [];
    const backups = [];
    const createdFolderIds = [];
    const folderBackups = [];

    try {
        if (!pack || pack.metadata?.type !== "Item") throw new Error(t("Errors.CompendiumNotFound"));
        const prepared = prepareItemBundle(bundleData, pack.collection);
        const existingDocuments = await pack.getDocuments();
        const existingById = new Map(existingDocuments.map(document => [document.id, document]));
        const preview = previewItemBundleSynchronization(existingDocuments, prepared);
        if (preview.collisions.length) {
            const details = preview.collisions.map(collision => `${collision.key} → ${collision.id}${collision.existingName ? ` (${collision.existingName})` : ""}`).join(", ");
            throw new Error(format("BundleCollisionDetails", { details }));
        }

        const existingFolders = Array.from(pack.folders ?? []);
        const existingFolderById = new Map(existingFolders.map(folder => [folder.id, folder]));
        const folderPlan = prepareItemBundleFolders(prepared);
        const folderPreview = previewItemBundleFolderSynchronization(existingFolders, folderPlan, prepared.id);
        const folderCollisions = folderPreview.collisions;
        if (folderCollisions.length) {
            const details = folderCollisions.map(entry => `${entry.key} → ${entry.id}${entry.existingName ? ` (${entry.existingName})` : ""}`).join(", ");
            throw new Error(format("BundleCollisionDetails", { details }));
        }

        if (originalLocked) await pack.configure({ locked: false });

        for (const entry of folderPlan.folders) {
            const existing = existingFolderById.get(entry.id);
            if (existing) {
                const markerUpdate = bundleFolderMarkerUpdate(existing, entry);
                if (markerUpdate) {
                    folderBackups.push(existing.toObject());
                    await Folder.updateDocuments([markerUpdate], { pack: pack.collection });
                }
            } else {
                await Folder.createDocuments([entry.data], { pack: pack.collection, keepId: true });
                createdFolderIds.push(entry.id);
            }
        }

        // prepareItemBundle deliberately places the root last.
        for (const entry of prepared.documents) {
            const existing = existingById.get(entry.data._id);
            const folderType = ITEM_BUNDLE_FOLDER_TYPES.has(entry.data.type) ? entry.data.type : "other";
            const desiredFolderId = folderPlan.folderIdByType.get(folderType);
            if (existing) {
                const currentFolderId = existing.folder?.id ?? existing.folder ?? null;
                const currentFolder = existingFolderById.get(currentFolderId);
                const currentFolderMarker = getBundleFolderMarker(currentFolder);
                const isInManagedBundleFolder = currentFolderMarker?.id === prepared.id;
                entry.data.folder = !currentFolder || isInManagedBundleFolder ? desiredFolderId : currentFolderId;
                backups.push(existing.toObject());
                await Item.updateDocuments([entry.data], { pack: pack.collection });
            } else {
                entry.data.folder = desiredFolderId;
                await Item.createDocuments([entry.data], { pack: pack.collection, keepId: true });
                createdIds.push(entry.data._id);
            }
        }

        if (typeof afterSynchronize === "function") {
            await afterSynchronize({ pack, prepared });
        }

        if (notifySuccess) {
            ui.notifications.info(format("BundleImportSuccess", {
                count: prepared.documents.length,
                root: bundleData.documents[bundleData.root]?.name || bundleData.root,
                name: pack.title
            }));
        }
        return {
            created: createdIds.length,
            updated: backups.length,
            rootUuid: prepared.rootUuid,
            documents: prepared.documents.map(entry => ({ key: entry.key, uuid: entry.uuid, root: entry.root })),
            folders: folderPlan.folders.map(entry => ({ key: entry.key, id: entry.id }))
        };
    } catch (error) {
        console.error("GUM | Item bundle import failed:", error);
        if (createdIds.length || backups.length || createdFolderIds.length || folderBackups.length) {
            const rollbackErrors = [];
            const attemptRollback = async (label, operation) => {
                try {
                    await operation();
                } catch (rollbackError) {
                    rollbackErrors.push({ label, error: rollbackError });
                    console.error(`GUM | Item bundle rollback step failed (${label}):`, rollbackError);
                }
            };
            if (createdIds.length) await attemptRollback("delete-created-items", () => Item.deleteDocuments(createdIds, { pack: pack.collection }));
            if (backups.length) await attemptRollback("restore-updated-items", () => Item.updateDocuments(backups, { pack: pack.collection }));
            if (createdFolderIds.length) await attemptRollback("delete-created-folders", () => Folder.deleteDocuments([...createdFolderIds].reverse(), { pack: pack.collection }));
            if (folderBackups.length) await attemptRollback("restore-updated-folders", () => Folder.updateDocuments(folderBackups, { pack: pack.collection }));
            if (rollbackErrors.length) {
                ui.notifications.error(t("BundleRollbackFailed"));
            }
        }
        ui.notifications.error(format("BundleImportFailed", { error: error.message }));
        return null;
    } finally {
        if (pack && pack.locked !== originalLocked) {
            try {
                await pack.configure({ locked: originalLocked });
            } catch (lockError) {
                console.error("GUM | Unable to restore compendium lock after item bundle import:", lockError);
            }
        }
    }
}

/** Sincroniza uma exportação do Foundry sem alterar IDs ou criar duplicatas. */
async function synchronizeCompendiumJson(pack, importEntries, { removeMissing = false, folders = null } = {}) {
    const originalLocked = Boolean(pack.locked);
    const incoming = importEntries.map(entry => entry.itemData);
    const incomingIds = new Set(incoming.map(document => document._id));
    let updated = 0;
    let created = 0;
    let removed = 0;
    let ignored = 0;

    try {
        if (pack.metadata.type !== "Item") {
            throw new Error(`O compêndio "${pack.title}" não aceita documentos do tipo Item.`);
        }

        const existingDocuments = await pack.getDocuments();
        const expectedMappedType = {
            skills: "skill", advantages: "advantage", disadvantages: "disadvantage",
            spells: "spell", powers: "power", equipment: "equipment",
            modifiers: "modifier", eqp_modifiers: "eqp_modifier"
        }[pack.metadata.name];
        const existingTypes = new Set(existingDocuments.map(document => document.type).filter(Boolean));
        const allowedTypes = expectedMappedType ? new Set([expectedMappedType]) : existingTypes;
        const incomingTypes = new Set(incoming.map(document => document.type).filter(Boolean));

        if (incoming.length && incomingTypes.size !== 1) {
            throw new Error("O JSON de compêndio deve conter um único tipo de Item.");
        }
        const [incomingType] = incomingTypes;
        if (incoming.length && allowedTypes.size && !allowedTypes.has(incomingType)) {
            throw new Error(`Tipo incompatível: o JSON contém "${incomingType}", mas o compêndio "${pack.title}" contém/espera ${[...allowedTypes].map(type => `"${type}"`).join(", ")}.`);
        }

        if (originalLocked) await pack.configure({ locked: false });

        if (folders) await synchronizeCompendiumFolders(pack, folders);

        const existingIds = new Set(existingDocuments.map(document => document.id));
        const toUpdate = incoming.filter(document => existingIds.has(document._id));
        const toCreate = incoming.filter(document => !existingIds.has(document._id));
        const toRemove = removeMissing
            ? existingDocuments.filter(document => !incomingIds.has(document.id)).map(document => document.id)
            : [];

        if (toUpdate.length) {
            await Item.updateDocuments(toUpdate, { pack: pack.collection });
            updated = toUpdate.length;
        }
        if (toCreate.length) {
            await Item.createDocuments(toCreate, { pack: pack.collection, keepId: true });
            created = toCreate.length;
        }
        if (toRemove.length) {
            await Item.deleteDocuments(toRemove, { pack: pack.collection });
            removed = toRemove.length;
        }
        if (removeMissing && folders) await removeMissingCompendiumFolders(pack, folders);

        ui.notifications.info(`Importação concluída em "${pack.title}": ${updated} atualizado(s), ${created} criado(s), ${removed} removido(s) e ${ignored} ignorado(s).`);
    } catch (err) {
        console.error(`GUM | Falha ao sincronizar o compêndio ${pack.collection}:`, err);
        ui.notifications.error(`Falha ao importar para "${pack.title}": ${err.message}`);
    } finally {
        if (pack.locked !== originalLocked) {
            try {
                await pack.configure({ locked: originalLocked });
            } catch (lockError) {
                console.error(`GUM | Não foi possível restaurar o bloqueio de ${pack.collection}:`, lockError);
                ui.notifications.error(`Não foi possível restaurar o estado de bloqueio de "${pack.title}".`);
            }
        }
    }
}

async function synchronizeCompendiumFolders(pack, folders) {
    if (!folders.length) return;

    const existingFolders = Array.from(pack.folders ?? []);
    const existingIds = new Set(existingFolders.map(folder => folder.id));
    const orderedFolders = sortCompendiumFoldersParentFirst(folders);

    for (const folder of orderedFolders) {
        if (!folder?._id) throw new Error("Uma pasta exportada não possui o campo \"_id\".");
        const folderData = foundry.utils.deepClone(folder);
        folderData.type = "Item";
        if (existingIds.has(folderData._id)) {
            await Folder.updateDocuments([folderData], { pack: pack.collection });
        } else {
            await Folder.createDocuments([folderData], { pack: pack.collection, keepId: true });
            existingIds.add(folderData._id);
        }
    }

}

async function removeMissingCompendiumFolders(pack, folders) {
    const incomingIds = new Set(folders.map(folder => folder._id));
    const idsToRemove = Array.from(pack.folders ?? [])
        .filter(folder => !incomingIds.has(folder.id))
        .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
        .map(folder => folder.id);
    if (idsToRemove.length) await Folder.deleteDocuments(idsToRemove, { pack: pack.collection });
}
