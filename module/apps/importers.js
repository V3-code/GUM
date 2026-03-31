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
        } else if (Array.isArray(data.skills || data.spells || data.equipment || data.traits || data.modifiers)) {
            const roots = data.skills || data.spells || data.equipment || data.traits || data.modifiers || [];
            importEntries = collectGCSImportEntries(roots);
        } else {
            return ui.notifications.error("O formato do JSON não foi reconhecido. Esperando uma lista de itens ou um objeto GCS com uma propriedade 'rows'.");
        }

        if (importEntries.length === 0) {
            return ui.notifications.error("Nenhum item encontrado no arquivo.");
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
                        
                       await importToCompendium(pack, importEntries);
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
        "armor": "armor",
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
        for (const entry of importEntries) {
            const gcsItemData = entry?.itemData;
            const folderPath = Array.isArray(entry?.folderPath) ? entry.folderPath : [];
            if (!gcsItemData) continue;
            let foundryItemData = null;

            // Se for genérico (ou pré-formatado), não traduza
            if (isGenericJson) {
                foundryItemData = gcsItemData;
            } 
            // Caso contrário, traduza
            else if (itemType === "skill") {
                foundryItemData = parseGCSLibrarySkill(gcsItemData);
            } else if (itemType === "advantage" || itemType === "disadvantage") {
                foundryItemData = parseGCSLibraryTrait(gcsItemData);
            } else if (itemType === "equipment" || itemType === "armor") {
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
        const containerName = String(copy.name || "").trim();
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
        clone.name = optionName ? `${row.name} (${optionName})` : row.name;
        clone.base_points = optionPoints;
        clone.points = optionPoints;
        clone.calc = {
            ...(clone.calc || {}),
            points: optionPoints
        };
        clone.modifiers = [];
        if (mod?.local_notes || mod?.notes) {
            const notes = [clone.local_notes || clone.notes || "", mod.local_notes || mod.notes || ""]
                .map(text => String(text || "").trim())
                .filter(Boolean)
                .join("\n");
            if (notes) clone.local_notes = notes;
        }
        return clone;
    });
}

function isImportableGCSRow(row, hadChildren = false) {
    if (!row || !row.name) return false;

    // Se for só um contêiner organizacional com filhos e sem conteúdo real, ignora
    const hasRealContent =
        row.description ||
        row.reference ||
        row.notes ||
        row.local_notes ||
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
        row.levels !== undefined;

    if (!hasRealContent && hadChildren) return false;

  return true;
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
    template.description = gcsTrait.notes || gcsTrait.local_notes || ""; 

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
                description: gcsMod.local_notes || gcsMod.notes ||  ""
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

function parseGCSLibrarySkill(gcsSkill) {
    let template = getSystemTemplate("Item", "skill");
    
    const skillName = gcsSkill.specialization 
        ? `${gcsSkill.name} (${gcsSkill.specialization})` 
        : gcsSkill.name;

    const resolvedRelativeLevel = extractGCSRelativeLevel(gcsSkill);
    template.points = Number(gcsSkill.points) || 0;
    template.skill_level = resolvedRelativeLevel;
    template.ref = gcsSkill.reference || "";
    template.group = gcsSkill.specialization || gcsSkill.tags?.[0] || template.group || "";
    template.description = gcsSkill.notes || "";
    template.difficulty_manual = gcsSkill.difficulty || "";

    if (gcsSkill.difficulty) {
        const parts = gcsSkill.difficulty.toLowerCase().split('/');
        if (parts.length === 2) {
            template.base_attribute = parts[0].trim();
            template.difficulty = normalizeGCSDifficulty(parts[1]);
        }
    }
    
    mapGCSDefaultsToPredefined(template, gcsSkill.defaults);

return applyAutoPointsBaselineOnImport({
        name: skillName,
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
    if (normalized === "TecD") return Math.max(0, rl * 2);

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
    if (normalized === "TecD") return Math.floor(pts / 2);

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

function parseGCSLibrarySpell(gcsSpell) {
    let template = getSystemTemplate("Item", "spell");

    template.points = gcsSpell.points || 1;
    template.ref = gcsSpell.reference || "";
    template.description = gcsSpell.notes || "";
    
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

        let gcsDamageTypeRaw = gcsWeapon.damage?.type || "";
        if (gcsDamageTypeRaw.includes('/')) {
            gcsDamageTypeRaw = gcsDamageTypeRaw.split('/')[0];
        }
        const gcsDamageType = GCS_DAMAGE_TYPE_MAP[gcsDamageTypeRaw.toLowerCase()] || gcsDamageTypeRaw;
        
        let damageFormula = "";
        const gcsBase = gcsWeapon.damage?.base || ""; 
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
    template.applied_effect = gcsMod.local_notes || "";

    // Se quiser manter também uma descrição mais completa:
    template.description = gcsMod.local_notes || "";

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
    const rawNotes = gcsMod.local_notes || gcsMod.notes || "";

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

function parseGCSLibraryEquipment(gcsEquip) {
    if (!gcsEquip.description) return null; 
    
    let type, template;
    const isArmor = gcsEquip.features?.some(f => f.type === "dr_bonus");
    
    if (isArmor) {
        type = "armor";
        template = getSystemTemplate("Item", "armor");
        
        for (const feature of gcsEquip.features || []) {
            if (feature.type === "dr_bonus") {
                const drValue = feature.amount || 0;
                let drKey = "base";
                if (feature.specialization) {
                    const spec = feature.specialization.toLowerCase();
                    drKey = GCS_DAMAGE_TYPE_MAP[spec] || spec;
                }
                let locationsToApply = [];
                if (feature.locations) { 
                    locationsToApply = feature.locations;
                } else if (feature.location) { 
                    locationsToApply = [feature.location];
                }
                for (const loc of locationsToApply) {
                    const systemLocs = (loc === "arm") ? ["arm_l", "arm_r"] : (loc === "leg") ? ["leg_l", "leg_r"] : [loc];
                                      for (const finalLoc of systemLocs) {
                        let drObject = template.dr_locations[finalLoc] || {};
                        drObject[drKey] = (drObject[drKey] || 0) + drValue;
                        template.dr_locations[finalLoc] = drObject;
                    }
                }
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
    template.description = gcsEquip.notes || "";
    
    if (gcsEquip.weapons?.length > 0) {
        template.melee_attacks = {};
        template.ranged_attacks = {};
        
        for (const gcsWeapon of gcsEquip.weapons) {
            const newAttackId = foundry.utils.randomID();
            
            const bestDefault = gcsWeapon.defaults?.reduce((best, current) => {
                return (current.calc?.level > best.calc?.level) ? current : best;
            }, gcsWeapon.defaults[0]);
            
            const defaultSkill = bestDefault?.name || bestDefault?.type || "DX";
            
            let gcsDamageTypeRaw = gcsWeapon.damage?.type || "";
            if (gcsDamageTypeRaw.includes('/')) {
                gcsDamageTypeRaw = gcsDamageTypeRaw.split('/')[0];
            }
            const gcsDamageType = GCS_DAMAGE_TYPE_MAP[gcsDamageTypeRaw.toLowerCase()] || gcsDamageTypeRaw;

            let damageFormula = "";
            const gcsBase = gcsWeapon.damage?.base || ""; 
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

            const attackData = {
                mode: gcsWeapon.usage || "Ataque",
                skill_name: defaultSkill,
                damage_formula: damageFormula,
                damage_type: gcsDamageType,
                min_strength: gcsWeapon.strength || "0"
            };

            if (gcsWeapon.reach !== undefined || gcsWeapon.parry !== undefined) {
                attackData.reach = gcsWeapon.reach || "C";
                attackData.parry = gcsWeapon.calc?.parry || gcsWeapon.parry || "0";
                attackData.block = gcsWeapon.calc?.block || gcsWeapon.block || "0";
                
                template.melee_attacks[newAttackId] = {
                     ...getSystemTemplate("Item", "attack_melee"),
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
                    ...getSystemTemplate("Item", "attack_ranged"),
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

const HYBRID_IMPORTABLE_ITEM_TYPES = new Set(["skill", "spell", "power", "advantage", "disadvantage", "equipment", "armor"]);
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
        specializationNorm: normalizeHybridText(item.system?.group || parts.specialization),
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
        const index = await pack.getIndex({ fields: ["type", "system.ref", "system.group"] }).catch(() => null);
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
                specializationNorm: normalizeHybridText(row.system?.group || parts.specialization),
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
    const wantedSpec = normalizeHybridText(gcsNode?.specialization || parsedItem.system?.group || parsedParts.specialization || gcsParts.specialization);

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

async function buildHybridActorItemFromGCS(gcsNode, parserFn) {
    if (!gcsNode || typeof parserFn !== "function") return null;

    const parsedItem = parserFn(gcsNode);
    if (!parsedItem) return null;

    const { item: sourceItem, matchedBy } = await resolveHybridSourceItem({ gcsNode, parsedItem });
    if (!sourceItem) {
        const fallback = foundry.utils.deepClone(parsedItem);
        fallback.flags = foundry.utils.mergeObject(fallback.flags || {}, {
            gum: {
                hybridImport: {
                    mode: "character",
                    sourceUuid: null,
                    sourceId: null,
                    matchedBy: null,
                    gcsId: gcsNode?.id || null,
                    importedAt: new Date().toISOString()
                }
            }
        }, { inplace: false, overwrite: true });
        return applyAutoPointsBaselineOnImport(fallback);
    }

    const merged = mergeHybridImportedData(sourceItem, parsedItem, { gcsNode, mode: "character" });
    merged.flags.gum.hybridImport.matchedBy = matchedBy;
    return merged;
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
        localNotes: node.local_notes || "",
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
    for (const attrKey of [
        "st", "dx", "iq", "ht", "lifting_st", "per", "vont", "hp", "fp",
        "vision", "hearing", "tastesmell", "touch", "basic_speed", "basic_move", "dodge", "enhanced_move"
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
    systemData.points.total = gcsData.total_points || 0;
    systemData.points.unspent = gcsData.total_points || 0; 

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
        for (const value of values) {
            if (value === null || value === undefined || value === "") continue;
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
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
    
  if (gcsData.calc) {
        const formatDamageString = (dmg) => {
            if (!dmg) return "";
            return dmg.replace(/d(?!b|p|\d)/g, "d6");
        };
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
        }

        systemData.attributes.thrust_damage = formatDamageString(gcsData.calc.thrust) || "1d6-2";
        systemData.attributes.swing_damage = formatDamageString(gcsData.calc.swing) || "1d6";
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
    const allTraits = [];
    for (const gcsTrait of gcsData.traits || []) {
        if (gcsTrait.name === "Natural Attacks") continue;
        
        if (gcsTrait.container_type && gcsTrait.children) {
            for (const child of gcsTrait.children) {
                child.parent_container_type = gcsTrait.container_type; 
                allTraits.push(child);
            }
        } else {
            allTraits.push(gcsTrait);
        }
    }
    for (const gcsTrait of allTraits) {
        if (gcsTrait.name === "Natural Attacks") continue;

        const item = await buildHybridActorItemFromGCS(gcsTrait, parseGCSLibraryTrait);
        if(item) itemsToCreate.push(item);
    }

    // =============================================================
    // MAPEAMENTO DE PERÍCIAS
    // =============================================================
    ui.notifications.info("Mapeando Perícias...");
    for (const gcsSkill of gcsData.skills || []) {
        const item = await buildHybridActorItemFromGCS(gcsSkill, parseGCSLibrarySkill);
        if (item) {
            itemsToCreate.push(item);
        }
    }

    // =============================================================
    // MAPEAMENTO DE EQUIPAMENTOS (Armas e Armaduras)
    // =============================================================
    ui.notifications.info("Mapeando Equipamentos...");

    // --- Loop 1: Equipamentos "Carregados" (equipment) ---
    for (const gcsEquip of gcsData.equipment || []) {
        const item = await buildHybridActorItemFromGCS(gcsEquip, parseGCSLibraryEquipment);
        if (item) {
            if (gcsEquip.equipped === true) {
                item.system.location = "equipped"; // Em Uso
            } else {
                item.system.location = "carried"; // Carregado
            }
            itemsToCreate.push(item);
        }
    }
    
    // --- Loop 2: Equipamentos "Outros" (other_equipment) ---
    for (const gcsEquip of gcsData.other_equipment || []) {
         const item = await buildHybridActorItemFromGCS(gcsEquip, parseGCSLibraryEquipment);
        if (item) {
            item.system.location = "stored"; // Armazenado
            itemsToCreate.push(item);
        }
    }

    // =============================================================
    // MAPEAMENTO DE MAGIAS (Spell)
    // =============================================================
    ui.notifications.info("Mapeando Magias...");
    for (const gcsSpell of gcsData.spells || []) {
        const item = await buildHybridActorItemFromGCS(gcsSpell, parseGCSLibrarySpell);
        if (item) {
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

                    const documents = await pack.getDocuments();
                    if (!documents.length) {
                        return ui.notifications.warn(`O compêndio "${pack.title}" está vazio.`);
                    }

                    const data = documents.map(doc => doc.toObject());
                    downloadJsonFile(data, `${sanitizeFileName(pack.metadata.label || pack.metadata.name)}.json`);
                    ui.notifications.info(`Exportação concluída! ${data.length} registros de "${pack.title}" foram exportados.`);
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
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
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