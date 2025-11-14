/**
 * Lida com a importação de um arquivo JSON (formato customizado) OU
 * um arquivo de Biblioteca GCS (.skl, .spl, .eqp) para um compêndio.
 */
export async function importFromJson() {
    // 1. Cria um elemento <input> de arquivo, escondido
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json, .gcs, .skl, .spl, .eqp';

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

        // 5. Determina o que importar
        let itemsToImport = [];
        if (Array.isArray(data)) {
            itemsToImport = data; // Formato JSON Simples
        } else if (data.rows && Array.isArray(data.rows)) {
            itemsToImport = data.rows; // Formato de Biblioteca GCS
        } else {
            return ui.notifications.error("O formato do JSON não foi reconhecido. Esperando uma lista de itens ou um objeto GCS com uma propriedade 'rows'.");
        }

        if (itemsToImport.length === 0) {
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
                    <p>Encontrados <strong>${itemsToImport.length}</strong> itens no arquivo JSON.</p>
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
                        
                        await importToCompendium(pack, itemsToImport);
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
 */
async function importToCompendium(pack, gcsItems) {
    if (!pack || !gcsItems) return;
    
    ui.notifications.info(`Traduzindo ${gcsItems.length} itens do GCS...`);
    const itemsToCreate = [];
    
    const packName = pack.metadata.name; 
    const packNameToType = {
        "skills": "skill",
        "advantages": "advantage",
        "disadvantages": "disadvantage",
        "spells": "spell",
        "powers": "power",
        "equipment": "equipment",
        "armor": "armor",
        "modifiers": "modifier"
    };

    let itemType = packNameToType[packName];
    
    if (!itemType) {
        console.warn(`GUM | O compêndio "${pack.title}" não tem um tradutor GCS mapeado. Os dados JSON serão importados "como estão".`);
        const firstItemType = gcsItems[0]?.type;
        if (!firstItemType) {
            return ui.notifications.error("O JSON não tem um 'type' e o compêndio não é padrão. Importação cancelada.");
        }
        itemType = 'generic_json';
    }


    for (const gcsItemData of gcsItems) {
        let foundryItemData = null;

        if (itemType === "skill") {
            foundryItemData = parseGCSLibrarySkill(gcsItemData);
        } else if (itemType === "advantage" || itemType === "disadvantage") {
            foundryItemData = parseGCSLibraryTrait(gcsItemData);
        } else if (itemType === "equipment" || itemType === "armor") {
            foundryItemData = parseGCSLibraryEquipment(gcsItemData);
        } else if (itemType === "spell") {
            foundryItemData = parseGCSLibrarySpell(gcsItemData);
        } else {
            foundryItemData = gcsItemData;
        }

        if (foundryItemData) {
            if(itemType !== 'generic_json') {
                foundryItemData.type = itemType;
            }
            itemsToCreate.push(foundryItemData);
        }
    }
    
    if (itemsToCreate.length === 0) {
        return ui.notifications.warn("Nenhum item pôde ser traduzido. A importação foi cancelada.");
    }

    try {
        await pack.configure({locked: false});
        ui.notifications.info(`Iniciando importação de ${itemsToCreate.length} itens traduzidos para "${pack.title}".`);
        
        await Item.createDocuments(itemsToCreate, { pack: pack.collection });
        
        await pack.configure({locked: true});
        ui.notifications.info(`Importação concluída! ${itemsToCreate.length} itens adicionados a "${pack.title}".`);
    } catch (err) {
        if (err.name === "DataModelValidationError") {
             console.error("GUM | Erro de Validação de Dados:", err.message, itemsToCreate[0]);
             ui.notifications.error("Erro de Validação: O JSON parece ser para o tipo errado de item. Verifique o console (F12).");
        } else {
            console.error(`GUM | Falha ao importar para ${pack.collection}:`, err);
            ui.notifications.error(`Falha ao importar para ${pack.title}.`);
        }
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

function parseGCSLibraryTrait(gcsTrait) {
    const points = gcsTrait.base_points || gcsTrait.points_per_level || 0;
    let type, template;

    if (points >= 0) {
        type = "advantage";
        template = foundry.utils.deepClone(game.system.template.Item.advantage);
        template.block_id = "block2";
    } else {
        type = "disadvantage";
        template = foundry.utils.deepClone(game.system.template.Item.disadvantage);
        template.block_id = "block3";
    }

    template.points = points;
    template.ref = gcsTrait.reference || "";
    template.level = gcsTrait.levels || "";
    template.description = gcsTrait.notes || ""; 

    if (gcsTrait.modifiers) {
        template.modifiers = {}; 
        for (const gcsMod of gcsTrait.modifiers) {
            if (gcsMod.disabled) continue; 
            const newModId = foundry.utils.randomID();
            template.modifiers[newModId] = {
                id: newModId,
                name: gcsMod.name,
                cost: (gcsMod.cost || 0).toString(), 
                ref: gcsMod.reference || "",
                description: gcsMod.notes || ""
            };
        }
    }
    
    return {
        name: gcsTrait.name,
        type: type, 
        system: template 
    };
}

function parseGCSLibrarySkill(gcsSkill) {
    let template = foundry.utils.deepClone(game.system.template.Item.skill);
    
    const skillName = gcsSkill.specialization 
        ? `${gcsSkill.name} (${gcsSkill.specialization})` 
        : gcsSkill.name;

    template.points = gcsSkill.points || 1; 
    template.ref = gcsSkill.reference || "";
    template.group = gcsSkill.specialization || ""; 
    template.description = gcsSkill.notes || "";
    template.difficulty_manual = gcsSkill.difficulty || "";

    if (gcsSkill.difficulty) {
        const parts = gcsSkill.difficulty.toLowerCase().split('/');
        if (parts.length === 2) {
            template.base_attribute = parts[0]; 
            template.difficulty = parts[1].replace('h', 'D').replace('e', 'F').replace('a', 'M').replace('vh', 'MD').toUpperCase();
        }
    }
    
    template.auto_points = false; 

    return {
        name: skillName, 
        type: "skill",
        system: template
    };
}

function parseGCSLibrarySpell(gcsSpell) {
    let template = foundry.utils.deepClone(game.system.template.Item.spell);

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
            template.base_attribute = parts[0]; 
            template.difficulty = parts[1].replace('h', 'D').replace('e', 'F').replace('a', 'M').replace('vh', 'MD').toUpperCase();
        }
    }

    template.auto_points = false; 

    if (gcsSpell.weapons?.length > 0) {
        const gcsWeapon = gcsSpell.weapons[0]; 
        const defaultSkill = gcsWeapon.defaults?.find(d => d.type === "skill")?.name || gcsWeapon.defaults?.[0]?.type || "DX";
        
        // ✅ CORREÇÃO: Garante que 'attack_roll' exista
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
        
        // ✅ CORREÇÃO: Garante que 'damage' exista
        if (!template.damage) {
            template.damage = { formula: "", type: "", armor_divisor: 1 };
        }
        template.damage.formula = damageFormula;
        template.damage.type = gcsDamageType;
    }

    return {
        name: gcsSpell.name,
        type: "spell",
        system: template
    };
}

function parseGCSLibraryEquipment(gcsEquip) {
    if (!gcsEquip.description) return null; 
    
    let type, template;
    const isArmor = gcsEquip.features?.some(f => f.type === "dr_bonus");
    
    if (isArmor) {
        type = "armor";
        template = foundry.utils.deepClone(game.system.template.Item.armor);
        
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
                        if (template.dr_locations.hasOwnProperty(finalLoc)) {
                            let drObject = template.dr_locations[finalLoc] || {};
                            drObject[drKey] = (drObject[drKey] || 0) + drValue;
                            template.dr_locations[finalLoc] = drObject;
                        }
                    }
                }
            }
        }
    }
    else {
        type = "equipment";
        template = foundry.utils.deepClone(game.system.template.Item.equipment); 
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
                    ...foundry.utils.deepClone(game.system.template.Item.attack_melee),
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
                    ...foundry.utils.deepClone(game.system.template.Item.attack_ranged),
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

/**
 * A função "Tradutora" (Mapper) principal para um Personagem GCS.
 */
async function parseGCSCharacter(gcsData) {
    ui.notifications.info("Lendo dados do GCS... Mapeando atributos.");
    
    const systemData = foundry.utils.deepClone(game.system.template.Actor.character);

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
    
    if (gcsData.calc) {
        const formatDamageString = (dmg) => {
            if (!dmg) return "";
            return dmg.replace(/d(?!b|p|\d)/g, "d6");
        };
        systemData.attributes.thrust_damage = formatDamageString(gcsData.calc.thrust) || "1d6-2";
        systemData.attributes.swing_damage = formatDamageString(gcsData.calc.swing) || "1d6";
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
        
        // Usa o tradutor de biblioteca, pois o formato é idêntico
        const item = parseGCSLibraryTrait(gcsTrait);
        if(item) itemsToCreate.push(item);
    }

    // =============================================================
    // MAPEAMENTO DE PERÍCIAS
    // =============================================================
    ui.notifications.info("Mapeando Perícias...");
    for (const gcsSkill of gcsData.skills || []) {
        // Usa o tradutor de biblioteca
        const item = parseGCSLibrarySkill(gcsSkill);
        if (item) {
            // Lógica específica do Personagem: traduz RSL para Nível Relativo
            if (gcsSkill.calc?.rsl) {
                const rsl = gcsSkill.calc.rsl.match(/[+-]\d+$/); 
                if (rsl) {
                    item.system.skill_level = parseInt(rsl[0]);
                }
            }
            itemsToCreate.push(item);
        }
    }

    // =============================================================
    // MAPEAMENTO DE EQUIPAMENTOS (Armas e Armaduras)
    // =============================================================
    ui.notifications.info("Mapeando Equipamentos...");

    // --- Loop 1: Equipamentos "Carregados" (equipment) ---
    for (const gcsEquip of gcsData.equipment || []) {
        const item = parseGCSLibraryEquipment(gcsEquip); // Usa o tradutor de biblioteca
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
        const item = parseGCSLibraryEquipment(gcsEquip); // Usa o tradutor de biblioteca
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
        const item = parseGCSLibrarySpell(gcsSpell); // Usa o tradutor de biblioteca
        if (item) {
            // Lógica específica do Personagem: traduz RSL para Nível Relativo
            if (gcsSpell.calc?.rsl) {
                const rsl = gcsSpell.calc.rsl.match(/[+-]\d+$/); 
                if (rsl) {
                    item.system.skill_level = parseInt(rsl[0]);
                }
            }
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