import { getBodyLocationDefinition, getBodyProfile } from "../config/body-profiles.js";
/**
 * Lida com a importação de um arquivo JSON (formato customizado) OU
 * um arquivo de Biblioteca GCS (.skl, .spl, .eqp, .adq, .adm, .eqm) para um compêndio.
 */
export async function importFromJson() {
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
        if (Array.isArray(data)) {
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

        if (importEntries.length === 0) {
            return ui.notifications.error("Nenhum item encontrado no arquivo.");
        }

        const isCompendiumJson = Array.isArray(data) && importEntries.some(entry =>
            entry?.itemData && typeof entry.itemData === "object" &&
            (entry.itemData._id || entry.itemData.system)
        );

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
        if (allItemPacks.length === 0) {
            return ui.notifications.error("Nenhum compêndio de Itens encontrado no mundo.");
        }

        const packOptions = allItemPacks.map(pack => {
            return `<option value="${pack.collection}">${pack.title}</option>`;
        }).join('');

        new Dialog({
            title: "Selecionar Destino da Importação",
            content: `
                <div style="padding: 10px 0;">
                    <p>Encontrados <strong>${importEntries.length}</strong> itens no arquivo JSON.</p>
                    <p>Por favor, escolha o compêndio de destino:</p>
                    <div class="form-group" style="margin-top: 10px;">
                        <label style="font-weight: bold;">Compêndio:</label>
                        <select name="compendium-target" style="width: 100%;">
                            ${packOptions}
                    </select>
                    </div>
                    ${isCompendiumJson ? `
                    <div class="form-group" style="margin-top: 10px;">
                        <label>
                            <input type="checkbox" name="remove-missing">
                            Remover do compêndio os itens ausentes deste JSON
                        </label>
                    </div>` : ""}
                </div>
            `,
            buttons: {
                import: {
                    icon: '<i class="fas fa-file-import"></i>',
                    label: "Importar",
                    callback: async (html) => {
                        const packName = html.find('select[name="compendium-target"]').val();
                        if (!packName) return;

                        const pack = game.packs.get(packName);
                        if (!pack) {
                            return ui.notifications.error(`Erro: Compêndio "${packName}" não pôde ser encontrado.`);
                        }
                        
                        if (isCompendiumJson) {
                           const removeMissing = Boolean(html.find('input[name="remove-missing"]').prop('checked'));
                           await synchronizeCompendiumJson(pack, importEntries, { removeMissing });
                       } else {
                           await importToCompendium(pack, importEntries);
                       }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancelar"
                }
            },
            default: "import"
        }).render(true);
    };

    // 7. "Clica" no input escondido
    input.click();
}

/**
 * Função auxiliar que TRADUZ e importa os dados para um compêndio.
 * (VERSÃO 3 - CORRIGIDA)
 */
async function importToCompendium(pack, importEntries) {
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

    let itemType = packNameToType[packName];
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


/**
 * Lida com a importação de um arquivo .gcs (JSON) para criar um Ator.
 */
export async function importFromGCS() {
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
            const actorData = await parseGCSCharacter(gcsData);
            await Actor.create(actorData);
            ui.notifications.info(`Personagem "${actorData.name}" importado com sucesso!`);
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

/**
 * Achata bibliotecas GCS com rows/children em uma lista simples.
 * Mantém apenas linhas que parecem ser itens importáveis e ignora
 * nós puramente organizacionais.
 */
function collectGCSImportEntries(rows, collector = [], folderPath = []) {
    for (const row of rows || []) {
        const copy = foundry.utils.deepClone(row);
        const children = Array.isArray(copy.children) ? copy.children : [];
        const containerName = getGCSRowLabel(copy);
        const isContainer = children.length > 0;

        if (isContainer) {
            const nextPath = containerName ? [...folderPath, containerName] : folderPath;
            collectGCSImportEntries(children, collector, nextPath);
            continue;
        }

        if (!isImportableGCSRow(copy, false)) continue;

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

    const basePoints = Number(row.calc?.points ?? row.base_points ?? row.points_per_level ?? row.points ?? 0) || 0;
    const hasEnabledModifier = modifiers.some(mod => !mod?.disabled);
    const hasAnyCostOption = modifiers.some(mod => parseCostAdjustmentValue(mod?.cost_adj ?? mod?.cost ?? 0) !== 0);

    if (basePoints !== 0 || hasEnabledModifier || !hasAnyCostOption) return [row];

    return modifiers.map(mod => {
        const optionName = String(mod?.name || "").trim();
        const optionPoints = parseCostAdjustmentValue(mod?.cost_adj ?? mod?.cost ?? 0);
        const clone = foundry.utils.deepClone(row);
        const rowLabel = getGCSRowLabel(row);
        clone.name = optionName ? `${rowLabel} (${optionName})` : rowLabel;
        clone.base_points = optionPoints;
        clone.points = optionPoints;
        clone.calc = {
            ...(clone.calc || {}),
            points: optionPoints
        };
        clone.modifiers = [];
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

const GCS_LOCATION_ID_MAP = {
    skull: ["head"],
    brain: ["head"],
    head: ["head"],
    eye: ["eyes"],
    eyes: ["eyes"],
    face: ["face"],
    jaw: ["face"],
    nose: ["face"],
    ear: ["face"],
    neck: ["neck"],
    torso: ["torso"],
    chest: ["torso"],
    abdomen: ["torso"],
    vitals: ["vitals"],
    groin: ["groin"],
    arm: ["arm_l", "arm_r"],
    arms: ["arm_l", "arm_r"],
    left_arm: ["arm_l"],
    right_arm: ["arm_r"],
    hand: ["hand_l", "hand_r"],
    hands: ["hand_l", "hand_r"],
    left_hand: ["hand_l"],
    right_hand: ["hand_r"],
    leg: ["leg_l", "leg_r"],
    legs: ["leg_l", "leg_r"],
    left_leg: ["leg_l"],
    right_leg: ["leg_r"],
    foot: ["foot_l", "foot_r"],
    feet: ["foot_l", "foot_r"],
    left_foot: ["foot_l"],
    right_foot: ["foot_r"]
};

function normalizeGCSLocationId(locationId) {
    return String(locationId || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function getGUMBodyLocationKeysForGCS(locationId, profileId = "humanoid") {
    const normalized = normalizeGCSLocationId(locationId);
    const profile = getBodyProfile(profileId);
    const profileKeys = Object.keys(profile?.locations || {});

    if (!normalized || normalized === GCS_ALL_DR_KEY) return profileKeys;
    if (profile?.locations?.[normalized] || getBodyLocationDefinition(normalized)) return [normalized];
    if (GCS_LOCATION_ID_MAP[normalized]) return GCS_LOCATION_ID_MAP[normalized];

    const numberedMatch = normalized.match(/^(arm|hand|leg|foot|wing|tail|tentacle|pincer|fin|horn|shoulder|chest|abdomen|joint|spine|artery|jaw|nose|ear)_(\d+)$/);
    if (numberedMatch) {
        const [, base, index] = numberedMatch;
        const extraKey = `${base}_${index}`;
        if (profile?.locations?.[extraKey] || getBodyLocationDefinition(extraKey)) return [extraKey];
    }

    const sideMatch = normalized.match(/^(left|right)_(arm|hand|leg|foot)$/);
    if (sideMatch) {
        const side = sideMatch[1] === "left" ? "l" : "r";
        const base = sideMatch[2];
        const exact = `${base}_${side}`;
        const numbered = `${base}_${side}_1`;
        if (profile?.locations?.[exact] || getBodyLocationDefinition(exact)) return [exact];
        if (profile?.locations?.[numbered] || getBodyLocationDefinition(numbered)) return [numbered];
    }

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
    const label = normalizeGCSLocationId(`${location?.table_name || ""} ${location?.choice_name || ""}`);
    const sideMatch = label.match(/(?:^|_)(left|right)_(arm|hand|leg|foot)(?:_|$)/);
    if (sideMatch) return [`${sideMatch[1]}_${sideMatch[2]}`];
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
    const points = Number(gcsTrait.calc?.points ?? gcsTrait.base_points ?? gcsTrait.points_per_level ?? gcsTrait.points ?? 0) || 0;
    let type, template;

    if (points >= 0) {
        type = "advantage";
        template = getSystemTemplate("Item", "advantage");
        template.block_id = "block2";
    } else {
        type = "disadvantage";
        template = getSystemTemplate("Item", "disadvantage");
        template.block_id = "block3";
    }

    template.points = points;
    template.ref = gcsTrait.reference || "";
    template.level = gcsTrait.levels || "";
    applyGCSImportedDescriptions(template, getGCSItemNotes(gcsTrait));  

    if (gcsTrait.modifiers) {
        template.modifiers = {}; 
        for (const gcsMod of gcsTrait.modifiers) {
            if (gcsMod.disabled) continue; 
            const newModId = foundry.utils.randomID();
            template.modifiers[newModId] = {
                id: newModId,
                name: gcsMod.name,
                cost: (gcsMod.cost_adj ?? gcsMod.cost ?? 0).toString(), 
                ref: gcsMod.reference || "",
                description: getGCSItemNotes(gcsMod)
            };
        }
    }
    
  return {
        name: gcsTrait.name,
        type: type, 
        system: template 
    };
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
        cost: Number(gcsTrait.calc?.points ?? gcsTrait.base_points ?? gcsTrait.points_per_level ?? 0) || 0
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

function normalizeGCSDefault(gcsDefault) {
    if (!gcsDefault || !gcsDefault.type) return null;

    const defaultType = String(gcsDefault.type).toLowerCase();
    const modifier = Number(gcsDefault.modifier) || 0;

    if (defaultType === "skill") {
        return {
            name: gcsDefault.name || "",
            specialization: gcsDefault.specialization || "",
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
        name: String(gcsDefault.name || gcsDefault.type || "").toUpperCase(),
        specialization: gcsDefault.specialization || "",
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
        const defaultSkill = gcsWeapon.defaults?.find(d => d.type === "skill")?.name || gcsWeapon.defaults?.[0]?.type || "DX";
        
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
    let template = getSystemTemplate("Item", "modifier");

    // Custo base do modificador no GCS vem normalmente como string: "10%", "-20%" etc.
    // Vamos preservar como string porque o item modifier do GUM já trabalha bem com esse formato.
    template.cost = gcsMod.cost_adj || "0%";

    // Alguns modificadores possuem níveis. Se não houver, deixamos vazio.
    template.level = gcsMod.levels || "";

    // Referência de livro/página
    template.ref = gcsMod.reference || "";

    // O GCS às vezes traz notas locais pedindo preenchimento manual ou explicação do efeito.
    // Vamos usar applied_effect como campo principal curto
    const notes = getGCSItemNotes(gcsMod);
    template.applied_effect = notes;

    // Se quiser manter também uma descrição mais completa:
    applyGCSImportedDescriptions(template, notes);

    return {
        name: gcsMod.name || "Modificador",
        type: "modifier",
        system: template
    };
}

function parseGCSLibraryEquipmentModifier(gcsMod) {
    let template = getSystemTemplate("Item", "eqp_modifier");

    const rawCost = gcsMod.cost || "";
    const rawCostType = gcsMod.cost_type || "";
    const rawRef = gcsMod.reference || "";
    const rawNotes = getGCSItemNotes(gcsMod);

    // Interpretação simples e explícita de custo para já mapear para expressão utilizável.
    const rawCostStr = String(rawCost).trim();
    if (/^[+-]?\d+(\.\d+)?$/.test(rawCostStr)) {
        template.cost_factor = Number(rawCostStr);
        template.cost_adjustment = `${Number(rawCostStr) >= 0 ? "+" : ""}${Number(rawCostStr)} CF`;
    } else if (/^[+-]?\d+(\.\d+)?\s*%$/.test(rawCostStr)) {
        template.cost_adjustment = rawCostStr;
    } else if (/^[x*]\s*\d+(\.\d+)?$/i.test(rawCostStr)) {
        template.cost_adjustment = rawCostStr.replace("*", "x");
    } else {
        template.cost_factor = 0;
        template.cost_adjustment = rawCostStr || "0 CF";
    }

    template.ref = rawRef;

    const featureLines = [];
    if (rawCostStr) {
        featureLines.push(`Custo GCS: ${rawCostStr}${rawCostType ? ` (${rawCostType})` : ""}`);
    }
    if (rawNotes) {
        featureLines.push(rawNotes);
    }

    template.features = featureLines.join("\n");
    template.tags = [rawCostType].filter(Boolean).join(", ");

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

function parseGCSLibraryEquipment(gcsEquip) {
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
                    feature.specialization
                );
            }
        }
    }
    else {
        type = "equipment";
        template = getSystemTemplate("Item", "equipment"); 
    }

    template.quantity = gcsEquip.quantity || 1;
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
let HYBRID_ITEM_INDEX_CACHE = null;

function normalizeHybridText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function splitNameAndSpecialization(rawName) {
    const original = String(rawName || "").trim();
    const match = original.match(/^(.*)\(([^)]+)\)\s*$/);
    if (!match) {
        return {
            full: original,
            base: original,
            specialization: ""
        };
    }

    return {
        full: original,
        base: (match[1] || "").trim(),
        specialization: (match[2] || "").trim()
    };
}

function buildIndexEntryFromItemDocument(item, sourceType, packCollection = "") {
    const parts = splitNameAndSpecialization(item.name);
    return {
        sourceType,
        packCollection,
        id: item.id,
        uuid: item.uuid,
        type: item.type,
        name: item.name,
        nameNorm: normalizeHybridText(parts.full),
        baseNameNorm: normalizeHybridText(parts.base),
        specializationNorm: normalizeHybridText(item.system?.specialization || parts.specialization),
        refNorm: normalizeHybridText(item.system?.ref)
    };
}

async function buildHybridItemIndex() {
    if (HYBRID_ITEM_INDEX_CACHE) return HYBRID_ITEM_INDEX_CACHE;

    const entries = [];
    for (const item of game.items.contents) {
        if (!HYBRID_IMPORTABLE_ITEM_TYPES.has(item.type)) continue;
        entries.push(buildIndexEntryFromItemDocument(item, "world"));
    }

    for (const pack of game.packs.filter(p => p.documentName === "Item")) {
        const index = await pack.getIndex({ fields: ["type", "system.ref", "system.specialization"] }).catch(() => null);
        if (!index?.contents?.length) continue;

        for (const row of index.contents) {
            if (!HYBRID_IMPORTABLE_ITEM_TYPES.has(row.type)) continue;
            const parts = splitNameAndSpecialization(row.name);
            entries.push({
                sourceType: "compendium",
                packCollection: pack.collection,
                id: row._id,
                uuid: `Compendium.${pack.collection}.${row._id}`,
                type: row.type,
                name: row.name,
                nameNorm: normalizeHybridText(parts.full),
                baseNameNorm: normalizeHybridText(parts.base),
                specializationNorm: normalizeHybridText(row.system?.specialization || parts.specialization),
                refNorm: normalizeHybridText(row.system?.ref)
            });
        }
    }

    HYBRID_ITEM_INDEX_CACHE = entries;
    return HYBRID_ITEM_INDEX_CACHE;
}

async function resolveHybridSourceItem({ gcsNode, parsedItem }) {
    if (!parsedItem || !HYBRID_IMPORTABLE_ITEM_TYPES.has(parsedItem.type)) {
        return { item: null, matchedBy: null };
    }

    const index = await buildHybridItemIndex();
    const parsedParts = splitNameAndSpecialization(parsedItem.name);
    const gcsParts = splitNameAndSpecialization(gcsNode?.name || parsedItem.name);

    const wantedType = parsedItem.type;
    const wantedRef = normalizeHybridText(gcsNode?.reference || parsedItem.system?.ref);
    const wantedFullName = normalizeHybridText(parsedParts.full || gcsParts.full);
    const wantedBaseName = normalizeHybridText(parsedParts.base || gcsParts.base);
    const wantedSpec = normalizeHybridText(gcsNode?.specialization || parsedItem.system?.specialization || parsedParts.specialization || gcsParts.specialization);

    const candidates = index.filter(entry => entry.type === wantedType);

    const unique = (rows) => {
        if (!rows?.length) return null;
        if (rows.length === 1) return rows[0];
        return null;
    };

    let hit = null;
    let matchedBy = null;

    if (wantedRef) {
        hit = unique(candidates.filter(entry => entry.refNorm && entry.refNorm === wantedRef));
        if (hit) matchedBy = "reference";
    }

    if (!hit && wantedFullName && wantedSpec) {
        hit = unique(candidates.filter(entry => entry.nameNorm === wantedFullName && entry.specializationNorm === wantedSpec));
        if (hit) matchedBy = "name+specialization";
    }

    if (!hit && wantedBaseName && wantedSpec) {
        hit = unique(candidates.filter(entry => entry.baseNameNorm === wantedBaseName && entry.specializationNorm === wantedSpec));
        if (hit) matchedBy = "base+specialization";
    }

    if (!hit && wantedFullName) {
        hit = unique(candidates.filter(entry => entry.nameNorm === wantedFullName));
        if (hit) matchedBy = "name";
    }

    if (!hit && wantedBaseName) {
        hit = unique(candidates.filter(entry => entry.baseNameNorm === wantedBaseName));
        if (hit) matchedBy = "base";
    }

    if (!hit) return { item: null, matchedBy: null };

    if (hit.sourceType === "world") {
        return { item: game.items.get(hit.id) || null, matchedBy };
    }

    const pack = game.packs.get(hit.packCollection);
    if (!pack) return { item: null, matchedBy: null };
    const item = await pack.getDocument(hit.id).catch(() => null);
    return { item, matchedBy };
}

function mergeHybridImportedData(sourceItem, parsedItem, { gcsNode = null, mode = "character" } = {}) {
    const base = sourceItem.toObject();
    const mergedSystem = foundry.utils.mergeObject(base.system || {}, parsedItem.system || {}, {
        inplace: false,
        overwrite: true
    });

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
                    gcsId: gcsNode?.id || null,
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
        matchedBy
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

async function buildGCSCharacterEquipmentItems(nodes, { location = "carried", path = [], parentContainerId = "" } = {}) {
    const items = [];

    for (const node of nodes || []) {
        const children = getGCSChildren(node);
        const hasChildren = children.length > 0;
        const label = getGCSContainerPathLabel(node);
        const childPath = hasChildren && label ? [...path, label] : path;
        let nextParentContainerId = parentContainerId;

        const resolvedLocation = node?.equipped === true ? "equipped" : location;
        const item = await buildHybridActorItemFromGCS(node, parseGCSLibraryEquipment);
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
                parentContainerId: nextParentContainerId
            });
            items.push(...childItems);
        }
    }

    return items;
}


async function buildTemplateEntryFromGCSNode(gcsNode, parserFn, itemType, { defaultCost = 0 } = {}) {
    if (itemType === "advantage") {
        const attributeEntry = parseAttributeTemplateEntryFromGCSTrait(gcsNode);
        if (attributeEntry) return attributeEntry;
    }

    const parsedItem = parserFn(gcsNode);
    if (!parsedItem) return null;

    const resolvedCost = Number(
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
        cost: resolvedCost
    };

    const { item: sourceItem, matchedBy } = await resolveHybridSourceItem({ gcsNode, parsedItem });
    if (sourceItem) {
        entry.uuid = sourceItem.uuid;
        entry.sourceId = sourceItem.id;
        entry.hybrid = { mode: "linked", matchedBy };
        return entry;
    }

    entry.inlineItem = foundry.utils.deepClone(parsedItem);
    entry.hybrid = { mode: "inline", matchedBy: null };
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
        cost: Number(node.calc?.points ?? node.base_points ?? node.points ?? 0) || 0,
        localNotes: getGCSItemNotes(node),
        subBlocks
    };
}

async function buildTemplateBlocksRecursive(container, parserFn, itemType, path = []) {
    if (!container) return [];

    const nodeName = String(container.name || "Bloco").trim() || "Bloco";
    const currentPath = [...path, nodeName];
    const title = currentPath.join(" › ");
    const children = Array.isArray(container.children) ? container.children : [];
    const hasPicker = Boolean(container.template_picker);
    const blocks = [];

    if (hasPicker) {
        const blockType = toTemplateBlockType(container.template_picker?.type);
        const block = buildTemplateBlockBase({ type: blockType, title, picker: container.template_picker });

        for (const child of children) {
            const entry = await buildTemplateOptionEntryFromNode(child, parserFn, itemType, currentPath);
            if (entry) block.contents.push(entry);
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
            if (entry) guaranteedBlock.contents.push(entry);
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

    const traitRoots = Array.isArray(gcsData.traits) ? gcsData.traits : [];
    for (const root of traitRoots) {
        const rootBlocks = await buildTemplateBlocksRecursive(root, parseGCSLibraryTrait, "advantage", []);
        blocks.push(...rootBlocks);
    }

    const skillRoots = Array.isArray(gcsData.skills) ? gcsData.skills : [];
    for (const root of skillRoots) {
        const rootBlocks = await buildTemplateBlocksRecursive(root, parseGCSLibrarySkill, "skill", []);
        blocks.push(...rootBlocks);
    }

    if (!blocks.length) return null;

    const baseName = traitRoots[0]?.name || skillRoots[0]?.name || gcsData.profile?.name || String(fileName || "Template GCS").replace(/\.[^.]+$/, "");
    templateSystem.blocks = blocks;

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

async function parseGCSCharacter(gcsData) {
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
        const bodyProfileId = systemData.combat.body_profile || "humanoid";
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
    let actorImgPath = CONST.DEFAULT_TOKEN; 
    let tokenImgPath = CONST.DEFAULT_TOKEN;

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
    const traitEntries = collectGCSCharacterLeafEntries(traitRoots);
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

    const carriedEquipment = await buildGCSCharacterEquipmentItems(gcsData.equipment || [], { location: "carried" });
    for (const item of carriedEquipment) {
        itemsToCreate.push(item);
    }

    const storedEquipment = await buildGCSCharacterEquipmentItems(gcsData.other_equipment || [], { location: "stored" });
    for (const item of storedEquipment) {
        itemsToCreate.push(item);
    }

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
        if (!documents.length) {
            return ui.notifications.warn(`O compêndio "${pack.title}" está vazio.`);
        }

        const data = documents.map(document => document.toObject());
        const safeName = sanitizeFileName(pack.metadata.label || pack.metadata.name);
        downloadJsonFile(data, `gum_${safeName}.json`);
        ui.notifications.info(`Exportação concluída! ${data.length} registros de "${pack.title}" foram exportados.`);
    } catch (err) {
        console.error(`GUM | Falha ao exportar ${pack?.collection}:`, err);
        ui.notifications.error(`Falha ao exportar "${pack?.title || "compêndio"}": ${err.message}`);
    }
}

Hooks.on("getCompendiumDirectoryEntryContext", (_html, options) => {
    if (options.some(option => option.name === "Exportar Compêndio")) return;

    options.push({
        name: "Exportar Compêndio",
        icon: '<i class="fas fa-file-export"></i>',
        condition: entry => {
            const collection = getContextCompendiumCollection(entry);
            return game.packs.get(collection)?.metadata.type === "Item";
        },
        callback: entry => {
            const collection = getContextCompendiumCollection(entry);
            const pack = game.packs.get(collection);
            if (!pack) return ui.notifications.error("Não foi possível identificar o compêndio selecionado.");
            return exportSelectedCompendium(pack);
        }
    });
});

function getContextCompendiumCollection(entry) {
    const element = entry?.[0] || entry;
    const directoryEntry = element?.closest?.("[data-pack], [data-entry-id]") || element;
    return directoryEntry?.dataset?.pack || directoryEntry?.dataset?.entryId;
}

/** Sincroniza uma exportação do Foundry sem alterar IDs ou criar duplicatas. */
async function synchronizeCompendiumJson(pack, importEntries, { removeMissing = false } = {}) {
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

        if (incomingTypes.size !== 1) {
            throw new Error("O JSON de compêndio deve conter um único tipo de Item.");
        }
        const [incomingType] = incomingTypes;
        if (allowedTypes.size && !allowedTypes.has(incomingType)) {
            throw new Error(`Tipo incompatível: o JSON contém "${incomingType}", mas o compêndio "${pack.title}" contém/espera ${[...allowedTypes].map(type => `"${type}"`).join(", ")}.`);
        }

        if (originalLocked) await pack.configure({ locked: false });

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