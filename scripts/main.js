// ================================================================== //
//  1. IMPORTAÇÕES 
// ================================================================== //

import { ModifierBrowser } from "../module/apps/modifier-browser.js";
import { ConditionBrowser } from "../module/apps/condition-browser.js";
import { EffectBrowser } from "../module/apps/effect-browser.js";
import { GurpsArmorSheet } from "../module/item/gurps-armor-sheet.js";
import { GurpsActorSheet } from "../module/actor/gurps-actor-sheet.js";
import { GurpsItemSheet } from "../module/item/gurps-item-sheet.js";
import { registerSystemSettings } from "../module/settings.js";
import DamageApplicationWindow from './apps/damage-application.js';
import { ConditionSheet } from "./apps/condition-sheet.js";
import { EffectSheet } from './apps/effect-sheet.js';
import { TriggerSheet } from './apps/trigger-sheet.js';
import { applySingleEffect } from './effects-engine.js';
import { GUM } from '../module/config.js';
import { importFromGCS } from "../module/apps/importers.js";
import { GumGMScreen } from "../module/apps/gm-screen.js";
import { GurpsRollPrompt } from "../module/apps/roll-prompt.js";

const { Actors: ActorsCollection, Items: ItemsCollection } = foundry.documents.collections;

// ================================================================== //
//  ✅ CLASSE DO ATOR (GURPS ACTOR) - ATUALIZADA COM MODIFICADORES DE EQUIPAMENTO
// ================================================================== //
class GurpsActor extends Actor {
    
    prepareData() {
        super.prepareData();
        this._prepareCharacterItems(); 
    }

_prepareCharacterItems() {
        const actorData = this; 
        const attributes = actorData.system.attributes;
        const combat = actorData.system.combat;
        const normalizeEffectPath = (path) => {
            if (!path || typeof path !== "string") return path;
            let normalized = path.trim();
            if (normalized.startsWith("actor.")) {
                normalized = normalized.slice(6);
            }
            if (normalized.startsWith("data.")) {
                normalized = normalized.replace(/^data\./, "system.");
            }
            if (!normalized.startsWith("system.")
                && !normalized.startsWith("flags.")
                && !normalized.startsWith("effects.")
                && !normalized.startsWith("items.")) {
                if (normalized.startsWith("attributes.") || normalized.startsWith("combat.") || normalized.startsWith("resources.")) {
                    normalized = `system.${normalized}`;
                }
            }
            return normalized;
        };

        // --- ETAPA 0: RESETAR VALORES ---
        const allAttributes = ['st', 'dx', 'iq', 'ht', 'vont', 'per', 'hp', 'fp', 'mt', 'basic_speed', 'basic_move', 'lifting_st', 'dodge',
            'vision', 'hearing', 'tastesmell', 'touch'];
        allAttributes.forEach(attr => {
            if (attributes[attr]) {
                attributes[attr].temp = 0;
                attributes[attr].passive = 0;
                attributes[attr].override = null;
            }
        });
        const activeEffects = Array.isArray(this.effects) ? this.effects : Array.from(this.effects?.values?.() || []);
        for (const effect of activeEffects) {
            for (const change of effect?.changes || []) {
                const normalizedPath = normalizeEffectPath(change.key);
                if (!normalizedPath?.startsWith("system.attributes.")) continue;
                if (!normalizedPath.endsWith(".passive") && !normalizedPath.endsWith(".temp") && !normalizedPath.endsWith(".override")) continue;
                let value = change.value;
                if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
                    value = Number(value);
                }
                const currentVal = foundry.utils.getProperty(this, normalizedPath) ?? 0;
                if (change.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE) {
                    foundry.utils.setProperty(this, normalizedPath, value);
                } else if (change.mode === CONST.ACTIVE_EFFECT_MODES.MULTIPLY) {
                    const numericValue = Number(value) || 0;
                    foundry.utils.setProperty(this, normalizedPath, currentVal * numericValue);
                } else if (change.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
                    const numericValue = Number(value) || 0;
                    foundry.utils.setProperty(this, normalizedPath, currentVal + numericValue);
                }
            }
        }
        if (combat.dr_temp_mods) {
            for (const key in combat.dr_temp_mods) combat.dr_temp_mods[key] = 0;
        }
        
        // (Removido: combat.defense_bonus = 0)

        // --- ETAPA 1: PRÉ-PROCESSAMENTO DE ITENS (MODIFICADORES DE EQUIPAMENTO) ---
        for (const item of this.items) {
            if (['equipment', 'armor'].includes(item.type)) {
                const baseWeight = Number(item.system.weight) || 0;
                const baseCost = Number(item.system.cost) || 0;
                
                let totalCF = 0;
                let weightMultiplier = 1;

                const modifiers = item.system.eqp_modifiers || {};
                for (const mod of Object.values(modifiers)) {
                    totalCF += Number(mod.cost_factor) || 0;
                    if (mod.weight_mod) {
                        const wModStr = mod.weight_mod.toString().trim().toLowerCase();
                        if (wModStr.startsWith('x')) {
                            const mult = parseFloat(wModStr.substring(1));
                            if (!isNaN(mult)) weightMultiplier *= mult;
                        }
                    }
                }

                item.system.effectiveWeight = baseWeight * weightMultiplier;
                item.system.effectiveCost = baseCost * Math.max(0, 1 + totalCF);
                
                // (Removido: Lógica de somar DB ao combat.defense_bonus)
            }
        }

        // --- ETAPA 2: MOTOR DE CONDIÇÕES ---
const add_sub_modifiers = {};
        const set_modifiers = {};
        const resolveConditionEffect = (link) => {
            if (!link) return null;
            if (link.type) return link;
            if (link.system?.type) return link.system;
            return null;
        };
        const conditions = this.items.filter(i => i.type === "condition"); 
        
        for (const condition of conditions) {
            if (condition.getFlag("gum", "manual_override")) continue;
            let isConditionActive = false;
            try {
                isConditionActive = !condition.system.when || Function("actor", "game", "eventData", `return ( ${condition.system.when} )`)(this, game, null); 
            } catch (e) { console.warn(`GUM | Erro na regra da condição "${condition.name}":`, e); }
            
            if (isConditionActive) {
                const effects = Array.isArray(condition.system.effects) ? condition.system.effects : Object.values(condition.system.effects || {});
                for (const link of effects) {
                    if (link?.uuid) continue;
                    const effect = resolveConditionEffect(link);
                    if (effect?.type === 'attribute' && effect.path) {
                        const normalizedPath = normalizeEffectPath(effect.path);
                        let value = 0;
                        try {
                            value = typeof effect.value === "string" ? new Function("actor", "game", `return (${effect.value});`)(this, game) : (Number(effect.value) || 0); 
                        } catch (e) { console.warn(`GUM | Erro ao avaliar valor do efeito em "${condition.name}":`, e); }
                        
                        if (effect.operation === "SET" || effect.operation === "OVERRIDE") {
                            set_modifiers[normalizedPath] = value;
                        } else {
                            let tempPath = normalizedPath.endsWith('.passive') ? normalizedPath.replace('.passive', '.temp') : normalizedPath;
                            if (!add_sub_modifiers[tempPath]) add_sub_modifiers[tempPath] = 0;
                            if (effect.operation === "ADD") add_sub_modifiers[tempPath] += value;
                            else if (effect.operation === "SUB") add_sub_modifiers[tempPath] -= value;
                        }
                    } 
                }
            }
        }

        // --- ETAPA 3: APLICAR MODIFICADORES DE SOMA/SUBTRAÇÃO ---
        for (const path in add_sub_modifiers) {
            const currentVal = foundry.utils.getProperty(this, path) || 0; 
            foundry.utils.setProperty(this, path, currentVal + add_sub_modifiers[path]);
        }

        // --- ETAPA 4: CÁLCULOS INTERMEDIÁRIOS (FINAL_COMPUTED) ---
        for (const attr of allAttributes) {
            if (attributes[attr] && !['hp', 'fp'].includes(attr)) {
                attributes[attr].final_computed = (Number(attributes[attr].value) || 0) 
                                                + (Number(attributes[attr].mod) || 0) 
                                                + (Number(attributes[attr].passive) || 0) 
                                                + (Number(attributes[attr].temp) || 0);
            }
        }
        for (const pool of ["hp", "fp"]) {
            if (attributes[pool]) {
                attributes[pool].final_computed = (Number(attributes[pool].max) || 0) 
                                                + (Number(attributes[pool].mod) || 0) 
                                                + (Number(attributes[pool].passive) || 0) 
                                                + (Number(attributes[pool].temp) || 0);
            }
        }


        // --- CÁLCULO DE SENTIDOS (Independentes, Base 10) ---
        const senses = ['vision', 'hearing', 'tastesmell', 'touch'];
        
        for (const sense of senses) {
            if (attributes[sense]) {
                // Se o valor for 0 ou nulo (antigo), assume 10. Se não, usa o valor do input.
                const base = Number(attributes[sense].value) || 10;
                
                const mod = (Number(attributes[sense].mod) || 0) + 
                            (Number(attributes[sense].passive) || 0) + 
                            (Number(attributes[sense].temp) || 0);
                
                attributes[sense].final = base + mod;
                
                if (attributes[sense].override !== null && attributes[sense].override !== undefined) {
                    attributes[sense].final = attributes[sense].override;
                }
            }
        }

        // Carga e Levantamento
        const liftingST = attributes.lifting_st.final_computed;
        const basicLift = (liftingST * liftingST) / 10; 
        attributes.basic_lift = { value: basicLift };
        
        let totalWeight = 0;
        const ignoreCarried = this.system.encumbrance.ignore_carried_weight;
        for (let i of this.items) { 
            if ((['equipment', 'armor'].includes(i.type) || i.system.hasOwnProperty('weight'))) {
                const weight = i.system.effectiveWeight !== undefined ? i.system.effectiveWeight : (i.system.weight || 0);
                const quantity = i.system.quantity || 1;
                const loc = i.system.location;
                
                if (loc === 'equipped' || (loc === 'carried' && !ignoreCarried)) {
                    totalWeight += weight * quantity;
                }
            }
        }

        let enc = { level_name: "Nenhuma", level_value: 0, penalty: 0 };
        if (totalWeight > basicLift * 6) enc = { level_name: "M. Pesada", level_value: 4, penalty: -4 };
        else if (totalWeight > basicLift * 3) enc = { level_name: "Pesada", level_value: 3, penalty: -3 };
        else if (totalWeight > basicLift * 2) enc = { level_name: "Média", level_value: 2, penalty: -2 };
        else if (totalWeight > basicLift) enc = { level_name: "Leve", level_value: 1, penalty: -1 };
        
        foundry.utils.mergeObject(this.system.encumbrance, { 
            total_weight: Math.round(totalWeight * 100) / 100,
            level_name: enc.level_name,
            level_value: enc.level_value,
            levels: {
                none: basicLift.toFixed(2), light: (basicLift * 2).toFixed(2),
                medium: (basicLift * 3).toFixed(2), heavy: (basicLift * 6).toFixed(2),
                xheavy: (basicLift * 10).toFixed(2)
            }
        });
        const levels = this.system.encumbrance.levels; 
        this.system.encumbrance.level_data = [ 
            { name: 'Nenhuma', max: levels.none }, { name: 'Leve', max: levels.light },
            { name: 'Média', max: levels.medium }, { name: 'Pesada', max: levels.heavy },
            { name: 'M. Pesada', max: levels.xheavy }
        ];

        // --- DEFESAS ATIVAS ---
        const finalBasicSpeedComputed = attributes.basic_speed.final_computed;
        attributes.dodge.value = Math.floor(finalBasicSpeedComputed) + 3;
        attributes.dodge.final_computed = attributes.dodge.value 
                                        + enc.penalty 
                                        + (attributes.dodge.mod || 0) 
                                        + (attributes.dodge.passive || 0) 
                                        + (attributes.dodge.temp || 0);

        attributes.basic_move.final_computed = Math.floor(attributes.basic_move.final_computed * (1 - (enc.level_value * 0.2)));

        // --- ETAPA 5: APLICAR MODIFICADORES DE "SET" ---
        for (const path in set_modifiers) {
            foundry.utils.setProperty(this, path, set_modifiers[path]); 
        }

        // --- ETAPA 6: CÁLCULO FINALÍSSIMO ---
        for (const attr of allAttributes) {
            if (attributes[attr]) {
                const override = attributes[attr].override;
                attributes[attr].final = (override !== null && override !== undefined) ? override : attributes[attr].final_computed;
            }
        }

        // --- ETAPA 7: CÁLCULO DE RD ---
        function _mergeDRObjects(target, source) {
            if (!source || typeof source !== 'object') {
                const value = Number(source) || 0;
                if (value > 0) target.base = (target.base || 0) + value;
                return;
            }
            for (const [type, value] of Object.entries(source)) {
                target[type] = (target[type] || 0) + (Number(value) || 0);
            }
        }
        const drFromArmor = { head:{}, torso:{}, vitals:{}, groin:{}, face:{}, eyes:{}, neck:{}, arm_l:{}, arm_r:{}, hand_l:{}, hand_r:{}, leg_l:{}, leg_r:{}, foot_l:{}, foot_r:{} };
        for (let i of this.items) { 
            if (i.type === 'armor' && i.system.location === 'equipped') {
                const itemDrLocations = i.system.dr_locations || {};
                for (let loc in drFromArmor) {
                    _mergeDRObjects(drFromArmor[loc], itemDrLocations[loc]);
                }
            }
        }
        const totalDr = {};
        const drMods = combat.dr_mods || {}; 
        const drTempMods = combat.dr_temp_mods || {}; 
        for (let key in drFromArmor) {
            totalDr[key] = {}; 
            _mergeDRObjects(totalDr[key], drFromArmor[key]); 
            _mergeDRObjects(totalDr[key], drMods[key]);      
            _mergeDRObjects(totalDr[key], drTempMods[key]); 
        }
        combat.dr_locations = totalDr; 
        combat.dr_from_armor = drFromArmor;
        
        // --- ETAPA 8: CÁLCULO DE NH ---
        const getNHBaseValue = (baseAttrStr, skillList) => {
            const baseAttr = (baseAttrStr || "dx").toLowerCase().trim();
            let attrVal = 10;
            const attribute = attributes[baseAttr];
            const fixedNumber = Number(baseAttr);
            const refSkill = skillList.find(s => s.name?.toLowerCase() === baseAttr); 
            if (attribute?.final !== undefined) {
                attrVal = attribute.final;
            } else if (!isNaN(fixedNumber) && baseAttr !== "") {
                attrVal = fixedNumber;
            } else if (refSkill) {
                attrVal = refSkill.system.final_nh || 10; 
            }
            return attrVal;
        };

        const skills = this.items.filter(i => i.type === 'skill');
        const spellsAndPowers = this.items.filter(i => ['spell', 'power'].includes(i.type));
        const equipment = this.items.filter(i => ['melee_weapon', 'ranged_weapon', 'equipment', 'armor'].includes(i.type));
        
        for (let pass = 0; pass < 2; pass++) { 
            for (const i of skills) {
                try {
                    const attrVal = getNHBaseValue(i.system.base_attribute, skills);
                    i.system.final_nh = attrVal + (i.system.skill_level || 0) + (i.system.other_mods || 0);
                } catch (e) { console.error(`GUM | Erro ao calcular NH para ${i.name}:`, e); }
            }
        }
        
        for (const i of spellsAndPowers) {
            try {
                const conjurationBaseVal = getNHBaseValue(i.system.base_attribute, skills);
                i.system.final_nh = conjurationBaseVal + (i.system.skill_level || 0) + (i.system.other_mods || 0);
                if (i.system.attack_roll?.skill_name) {
                    const attackBaseVal = getNHBaseValue(i.system.attack_roll.skill_name, skills);
                    i.system.attack_nh = attackBaseVal + (i.system.attack_roll.skill_level_mod || 0);
                }
            } catch (e) { console.error(`GUM | Erro ao calcular NH para ${i.name}:`, e); }
        }
        
        for (const i of equipment) {
            try {
                if (i.system.melee_attacks) {
                    for (let attack of Object.values(i.system.melee_attacks)) {
                        const attackBaseVal = getNHBaseValue(attack.skill_name, skills);
                        attack.final_nh = attackBaseVal + (Number(attack.skill_level_mod) || 0);
                        
                        // Aparar (Parry) - ✅ CORREÇÃO: Removido '+ combat.defense_bonus'
                        if (attack.parry !== "0" && attack.parry !== "No") {
                             const parryBase = Math.floor(attack.final_nh / 2) + 3;
                             const parryMod = Number(attack.parry) || 0;
                             let finalParry = 0;
                             if (parryMod > 5) finalParry = parryMod; 
                             else finalParry = parryBase + parryMod;
                             attack.final_parry = finalParry;
                        }
                        
                        // Bloqueio (Block) - ✅ CORREÇÃO: Removido '+ combat.defense_bonus'
                        if (attack.block !== "0" && attack.block !== "No") {
                             const blockBase = Math.floor(attack.final_nh / 2) + 3;
                             const blockMod = Number(attack.block) || 0;
                             let finalBlock = 0;
                             if (blockMod > 5) finalBlock = blockMod; 
                             else finalBlock = blockBase + blockMod;
                             attack.final_block = finalBlock;
                        }
                    }
                }
                if (i.system.ranged_attacks) {
                    for (let attack of Object.values(i.system.ranged_attacks)) {
                        const attackBaseVal = getNHBaseValue(attack.skill_name, skills);
                        attack.final_nh = attackBaseVal + (Number(attack.skill_level_mod) || 0);
                    }
                }
            } catch (e) { console.error(`GUM | Erro ao calcular NH de ataque para ${i.name}:`, e); }
        }
    }
}

/**
 * Uma janela de diálogo para criar e editar Efeitos Contingentes.
 */
class ContingentEffectBuilder extends Dialog {
    constructor(effectData = {}, item, callback) {
        super({
            title: "Construtor de Efeito Contingente",
            content: "Carregando...", // Será substituído pelo template
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: html => this._onSave(html)
                }
            },
            default: "save",
            width: 500
        });

        this.effectData = effectData;
        this.item = item; // O item ao qual o efeito pertence
        this.callback = callback;
    }

    async _render(force, options) {
        // Carrega o template do construtor
        const templatePath = "systems/gum/templates/apps/contingent-effect-builder.hbs";
        
        // Prepara os dados para o template
        const templateData = {
            effect: this.effectData,
            // Lista de gatilhos possíveis
            triggers: {
                "onDamage": "Ao Causar Dano",
                "onHit": "Ao Acertar",
                "onCrit": "Em um Acerto Crítico"
            },
            // Lista de ações possíveis
            actions: {
                "applyCondition": "Aplicar Condição",
                "setFlag": "Definir Flag no Alvo"
            }
        };

        this.data.content = await renderTemplate(templatePath, templateData);
        return super._render(force, options);
    }

    _onSave(html) {
        const form = html.find('form')[0];
        const formData = new FormDataExtended(form).object;
        
        // Chama a função de callback passando os novos dados do efeito
        this.callback(formData);
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Adicione aqui listeners para interatividade dentro do diálogo, se necessário.
    }
}

// ================================================================== //
//  ✅ FUNÇÃO DE ROLAGEM GLOBAL E REUTILIZÁVEL (VERSÃO CORRIGIDA) ✅
// ================================================================== //
/**
 * Realiza uma rolagem de teste (3d6) baseada nos dados fornecidos.
 * @param {Actor} actor - O ator realizando o teste.
 * @param {Object} rollData - Dados do teste { label, value, modifier, type, itemId, etc. }
 * @param {Object} extraOptions - Opções extras { ignoreGlobals: boolean }
 */
export async function rollFromHotbar({ actorId, actorUuid, rollData } = {}) {
    let actor = null;

    if (actorUuid) {
        actor = await fromUuid(actorUuid).catch(() => null);
    }

    if (!actor && actorId) {
        actor = game.actors.get(actorId);
    }

    if (!actor) {
        ui.notifications.warn("[GUM] Ator não encontrado para rolagem de atalho.");
        return;
    }

    const resolvedRollData = rollData || {};

    if (resolvedRollData.quick && typeof performGURPSRoll !== "undefined") {
        return performGURPSRoll(actor, resolvedRollData);
    }

    if (typeof GurpsRollPrompt !== "undefined") {
        return new GurpsRollPrompt(actor, resolvedRollData).render(true);
    }

    return performGURPSRoll(actor, resolvedRollData);
}

async function createGumRollMacro(data, slot) {
    const rollData = data?.rollData || {};
    let actor = null;

    if (data?.actorUuid) {
        actor = await fromUuid(data.actorUuid).catch(() => null);
    }

    if (!actor && data?.actorId) {
        actor = game.actors.get(data.actorId);
    }

    if (!actor) {
        ui.notifications.warn("[GUM] Ator não encontrado para criar atalho de rolagem.");
        return false;
    }

    const label = rollData.label || "Teste";
    const command = `game.gum.rollFromHotbar(${JSON.stringify({
        actorId: actor.id,
        actorUuid: actor.uuid,
        rollData
    })})`;
    let macro = game.macros.find((m) => m.name === label && m.command === command);

    if (!macro) {
        macro = await Macro.create({
            name: label,
            type: "script",
            img: rollData.img || actor.img || "icons/svg/d20.svg",
            command
        }, { displaySheet: false });
    }

    game.user.assignHotbarMacro(macro, slot);
    return false;
}

export async function performGURPSRoll(actor, rollData, extraOptions = {}) {
    
    // --- 1. LÓGICA DE VALORES BASE ---
    const hasProcessedData = rollData.originalValue !== undefined;
    let sourceItem = null;
    if (rollData.itemUuid) {
        sourceItem = await fromUuid(rollData.itemUuid).catch(() => null);
    } else if (rollData.itemId && actor?.items) {
        sourceItem = actor.items.get(rollData.itemId) || null;
    }
    
    // Valor Base (Atributo Puro)
    const baseValue = parseInt(hasProcessedData ? rollData.originalValue : rollData.value) || 10;
    
    // Modificador que veio do Prompt (Manual)
    const promptMod = parseInt(rollData.modifier) || 0;
    
    const label = rollData.label || "Teste";

    // --- 2. LÓGICA DE MODIFICADORES GLOBAIS (ESCUDO / CONDIÇÕES) ---    
    
    let globalModValue = 0;
    let lowestCap = extraOptions.effectiveCap !== undefined ? extraOptions.effectiveCap : Infinity; 

    // Só processa globais se NÃO tivermos instrução para ignorar
    if (!extraOptions.ignoreGlobals) {
        const rollContext = _determineRollContext(actor, rollData);
        const globalMods = actor.getFlag("gum", "gm_modifiers") || [];
        
        globalMods.forEach(m => {
            // Soma o valor
            globalModValue += (parseInt(m.value) || 0);
            
            // Verifica o Teto (Cap)
            if (m.cap !== undefined && m.cap !== null && m.cap !== "") {
                const capVal = parseInt(m.cap);
                // Se achou um teto menor do que o atual, atualiza
                if (!isNaN(capVal) && capVal < lowestCap) {
                    lowestCap = capVal;
                }
            }
        });

        const effectMods = _collectEffectRollModifiers(actor, rollContext);
        effectMods.forEach(m => {
            globalModValue += (parseInt(m.value) || 0);
            if (m.cap !== undefined && m.cap !== null && m.cap !== "") {
                const capVal = parseInt(m.cap);
                if (!isNaN(capVal) && capVal < lowestCap) {
                    lowestCap = capVal;
                }
            }
        });
    }

    // --- 3. CÁLCULO FINAL (EVITA DUPLICAÇÃO) ---
    
    // Se o Prompt estiver enviando o valor total (base + globais + manual) no 'value',
    // nós devemos tomar cuidado. Mas assumindo que 'value' é base e 'modifier' é extra:
    
    const totalModifier = promptMod + globalModValue;

    // Soma matemática simples
    const mathLevel = baseValue + totalModifier;

    // Aplica a regra do Teto (Clamp)
    let effectiveLevel = mathLevel;
    if (lowestCap !== Infinity && effectiveLevel > lowestCap) {
        effectiveLevel = lowestCap;
    }

    // Flag visual para o template saber se cortou
    const isCapped = effectiveLevel < mathLevel;

    // --- 4. ROLAGEM ---
    const roll = new Roll("3d6");
    await roll.evaluate();
    const total = roll.total;

    // --- 5. RESULTADO ---
    const isSuccess = total <= effectiveLevel;
    const margin = Math.abs(effectiveLevel - total);
    
    let resultLabel = isSuccess ? "Sucesso" : "Falha";
    let statusClass = isSuccess ? "success" : "failure";
    let marginLabel = "Margem";
    const rollOutcome = isSuccess ? "success" : "failure";

    // Críticos
    const isCritSuccess = (total <= 4) || (total === 5 && effectiveLevel >= 15) || (total === 6 && effectiveLevel >= 16);
    const isCritFailure = (total >= 18) || (total === 17 && effectiveLevel <= 15) || (total - effectiveLevel >= 10);

    if (isCritSuccess) {
        resultLabel = "Sucesso Crítico";
        statusClass = "crit-success";
    } else if (isCritFailure) {
        resultLabel = "Falha Crítica";
        statusClass = "crit-failure";
    }

    // --- 7. HTML DO CARD ---
 const diceFaces = roll.dice[0].results.map((d) => `<span class="die-face">${d.result}</span>`).join('');
    const modText = totalModifier !== 0 ? `${totalModifier > 0 ? '+' : ''}${totalModifier}` : '±0';

    const modBreakdown = `M ${promptMod >= 0 ? '+' : ''}${promptMod} | G ${globalModValue >= 0 ? '+' : ''}${globalModValue}`;
    const targetPill = isCapped ? `Alvo ${effectiveLevel} (Cap ${lowestCap})` : `Alvo ${effectiveLevel}`;

    const content = `
        <div class="gurps-roll-card premium">
            <header class="card-header">
                <h3>${label}</h3>
                <small>${actor.name}</small>
            </header>

            <div class="card-formula-container">
                <span class="formula-pill">NH ${baseValue}</span>
                <span class="formula-pill">${modText} (${modBreakdown})</span>
            </div>

            <div class="card-content">
                <div class="card-main-flex">
                    <div class="roll-column">
                        <span class="column-label">Dados</span>
                        <div class="roll-total">${total}</div>
                        <div class="individual-dice">${diceFaces}</div>
                    </div>

                    <div class="column-separator"></div>

                    <div class="target-column">
                        <span class="column-label">Alvo</span>
                        <div class="target-value">${effectiveLevel}</div>
                        <div class="target-note">${isCapped ? `Cap ${lowestCap}` : 'Final'}</div>
                    </div>
                </div>
            </div>

            <footer class="card-footer">
                <div class="result-block ${statusClass}">
                    <span class="result-label">${resultLabel}</span>
                    <span class="result-margin">Margem ${margin}</span>
                </div>
            </footer>
        </div>
    `;




    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: content,
        rolls: [roll],
        sound: CONFIG.sounds.dice
    });

    // --- 8. DISPARO DE EFEITOS DE ATIVAÇÃO (SUCESSO/FALHA) ---
    // Executamos depois de criar a mensagem para que o card da rolagem apareça antes do pedido de resistência.
    if (sourceItem?.system?.activationEffects && sourceItem.system.activationEffects[rollOutcome]) {
        try {
            await applyActivationEffects(sourceItem, actor, rollOutcome, extraOptions);
        } catch (err) {
            console.error("GUM | Falha ao aplicar efeitos de ativação:", err);
        }
    }
}

function _determineRollContext(actor, rollData) {
    const type = rollData.type;
    const itemId = rollData.itemId;
    const attributeKey = rollData.attributeKey?.toLowerCase?.() || rollData.attribute?.toLowerCase?.();
    const senseKeys = ["vision", "hearing", "tastesmell", "touch"];
    const attributeKeys = ["st", "dx", "iq", "ht", "per", "vont"];

    if (type === 'defense') return 'defense';

    if (type === 'attack') {
        if (rollData.attackType === 'ranged') return 'attack_ranged';
        if (rollData.isRanged === true) return 'attack_ranged';
        if (rollData.attackType === 'melee') return 'attack_melee';
    }

    if (type === 'spell') return 'spell';
    if (type === 'power') return 'power';

    if (type === 'attribute' && attributeKey) {
        if (attributeKeys.includes(attributeKey)) return `check_${attributeKey}`;
    }

    if (type === 'skill') {
        if (attributeKey && senseKeys.includes(attributeKey)) return `sense_${attributeKey}`;
        let baseAttribute = attributeKey;
        if (!baseAttribute && itemId) {
            const item = actor?.items?.get(itemId);
            if (item?.system?.base_attribute) baseAttribute = item.system.base_attribute.toLowerCase();
        }
        if (baseAttribute && attributeKeys.includes(baseAttribute)) return `skill_${baseAttribute}`;
    }

    if (itemId) {
        const item = actor?.items?.get(itemId);
        if (item) {
            if (item.type === 'spell') return 'spell';
            if (item.type === 'power') return 'power';
            if (item.type === 'ranged_weapon') return 'attack_ranged';
        }
    }

  if (type === 'attack') return 'attack_melee';
    if (type === 'skill' || type === 'attribute') return 'skill';

    return 'default';
}

function _matchesRollContext(modContext, rollContext) {
    if (!modContext || modContext === 'all') return true;
    if (Array.isArray(modContext)) return modContext.includes(rollContext);
    if (typeof modContext === 'string' && modContext.includes(',')) {
        return modContext.split(',').map(c => c.trim()).includes(rollContext);
    }
    if (modContext === 'attack') return rollContext.startsWith('attack');
    if (modContext === 'skill') return rollContext.startsWith('skill_') || rollContext === 'skill';
    return modContext === rollContext;
}

function _collectEffectRollModifiers(actor, rollContext) {
    const activeEffects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);
    const mods = [];
    for (const effect of activeEffects) {
        const data = foundry.utils.getProperty(effect, "flags.gum.rollModifier");
        if (!data) continue;
        if (!_matchesRollContext(data.context, rollContext)) continue;
        mods.push({
            id: effect.id,
            value: data.value,
            cap: data.cap
        });
    }
    return mods;
}

/**
 * O "Despachante" de Efeitos de Ativação.
 * Pega os efeitos de sucesso/falha de um item e os envia para o "Motor" applySingleEffect.
 */
async function applyActivationEffects(item, actor, outcome, activationOptions = {}) {
    if (!item || !item.system.activationEffects || !item.system.activationEffects[outcome]) {
        return;
    }

    const effectsList = item.system.activationEffects[outcome];
    
    for (const effectData of Object.values(effectsList)) {
        const effectItem = await fromUuid(effectData.effectUuid);
        if (effectItem) {
            let finalTargets = [];
            if (effectData.recipient === 'self') {
                finalTargets = actor.getActiveTokens();
            } else {
                finalTargets = Array.from(game.user.targets);
            }

            if (finalTargets.length === 0) {
                 // Se o alvo for 'target' mas nenhum foi selecionado, podemos usar o próprio ator como fallback ou avisar.
                 // Usar o próprio ator como fallback pode ser um bom padrão.
                 if (effectData.recipient === 'target') {
                    ui.notifications.warn(`O efeito "${effectItem.name}" precisa de um alvo. Aplicando em si mesmo como padrão.`);
                 }
                 finalTargets = actor.getActiveTokens();
            }
            // Se o efeito tiver barreira de resistência ativada, disparamos o prompt antes de aplicar.
            const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
            const suppressResistanceCard = effectItem.system?.resistanceRoll?.skipPromptCard || activationOptions.suppressResistanceCard;
            if (requiresResistance && !suppressResistanceCard) {
                for (const targetToken of finalTargets) {
                    await _promptActivationResistance(effectItem, targetToken, actor, item, effectData.id, activationOptions);
                }
            } else {
                await applySingleEffect(effectItem, finalTargets, { actor: actor, origin: item });
            }
        }
    }
}

/**
 * Cria uma mensagem de chat solicitando o teste de resistência de um efeito de ativação.
 * O teste usa os dados de barreira configurados no item efeito.
 */
async function _promptActivationResistance(effectItem, targetToken, sourceActor, originItem, effectLinkId, options = {}) {
    const rollData = effectItem.system?.resistanceRoll || {};
    const suppressResistanceCard = rollData.skipPromptCard || options.suppressResistanceCard;
    if (suppressResistanceCard) {
        const conditionContext = options.conditionId ? { conditionId: options.conditionId } : {};
        await applySingleEffect(effectItem, [targetToken], {
            actor: sourceActor,
            origin: originItem || effectItem,
            ...conditionContext
        });
        return;
    }
     const applyOnText = rollData.applyOn === 'success' ? 'Aplicar em Sucesso' : 'Aplicar em Falha';
    const marginValue = (rollData.margin !== undefined && rollData.margin !== null && rollData.margin !== '') ? rollData.margin : '—';
    const modifierValue = rollData.modifier ? `${rollData.modifier >= 0 ? '+' : ''}${rollData.modifier}` : '0';
    const modifierClass = rollData.modifier > 0 ? 'positive' : rollData.modifier < 0 ? 'negative' : 'neutral';

 const chatPayload = {
        mode: options.mode || "activation",
        targetActorId: targetToken.actor?.id,
        targetTokenId: targetToken.id,
        effectItemData: effectItem.toObject(),
        sourceActorId: sourceActor?.id || null,
        originItemUuid: originItem?.uuid || null,
        effectLinkId: effectLinkId || null,
        conditionId: options.conditionId || null
    };

 const content = `
        <div class="gurps-roll-card resistance-roll-card roll-pending">
            <header class="card-header">
                <div class="header-left">
                    <div class="header-icon"><img src="${effectItem.img}"></div>
                    <div class="header-title">
                        <h3>Teste de Resistência Necessário</h3>
                        <small>${effectItem.name}</small>
                    </div>
                </div>
            </header>
            <div class="card-content">
                <div class="resistance-info">
                    <div class="info-row">
                        <span class="label">Alvo</span>
                        <span class="value with-img">
                             <img src="${targetToken.actor?.img || targetToken.document?.texture?.src || "icons/svg/mystery-man.svg"}" class="actor-token-icon">
                            ${targetToken.name || targetToken.actor?.name || "Alvo"}
                        </span>
                    </div>
                    <div class="info-row">
                        <span class="label">Origem</span>
                        <span class="value">${sourceActor?.name || originItem?.name || 'Origem desconhecida'}</span>
                    </div>
                    <div class="pill-row dual">
                        <div class="pill pill-attribute"><strong>Atributo:</strong> ${(rollData.attribute || 'HT').toUpperCase()}</div>
                        <div class="pill pill-modifier ${modifierClass}"><strong>Mod:</strong> ${modifierValue}</div>
                    </div>
                    <div class="pill-row dual">
                        <div class="pill pill-condition"><strong></strong> ${applyOnText}</div>
                        <div class="pill pill-margin"><strong>Margem Mínima:</strong> ${marginValue}</div>
                    </div>
                    <div class="pill-row action-row">
                        <button type="button" class="resistance-roll-button full-width" data-roll-data='${JSON.stringify(chatPayload)}'>
                            <i class="fas fa-dice-d6"></i> Rolar Resistência
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;


    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: targetToken.actor || sourceActor }),
        content
    });
}


// ================================================================== //
//  2. HOOK DE INICIALIZAÇÃO (`init`)
// ================================================================== //
Hooks.once('init', async function() { 
    console.log("GUM | Fase 'init': Registrando configurações e fichas."); 
    game.gum = {};
    game.gum.importFromGCS = importFromGCS;
    game.gum.rollFromHotbar = rollFromHotbar;

    CONFIG.statusEffects = GUM.statusEffects;
    CONFIG.Actor.documentClass = GurpsActor;

    registerSystemSettings();

    Hooks.on("hotbarDrop", (bar, data, slot) => {
        if (data?.type !== "GUM.Roll") return;
        return createGumRollMacro(data, slot);
    });
    
    // --- 2. LÊ A CONFIGURAÇÃO E APLICA NO SISTEMA DE COMBATE ---
    // ✅ A CORREÇÃO FINAL:
    // Nós lemos o *valor* da configuração que acabamos de registrar...
    const initiativeFormula = game.settings.get("gum", "initiativeFormula");
    
    // ...e passamos esse *valor* (a fórmula real) para o CONFIG.
    CONFIG.Combat.initiative = {
      formula: initiativeFormula, // Agora isto contém "@attributes.basic_speed.final..."
      decimals: 3 //
    };
    
    ActorsCollection.registerSheet("gum", GurpsActorSheet, { 
        types: ["character"], makeDefault: true 
    }); 
    ItemsCollection.registerSheet("gum", GurpsItemSheet, { makeDefault: true }); 
    ItemsCollection.registerSheet("gum", ConditionSheet, { 
        types: ["condition"], 
        makeDefault: true 
    });
    ItemsCollection.registerSheet("gum", EffectSheet, { 
    types: ["effect"], 
    makeDefault: true 
    });
    ItemsCollection.registerSheet("gum", TriggerSheet, { 
    types: ["trigger"], 
    makeDefault: true 
    });
    ItemsCollection.registerSheet("gum", GurpsArmorSheet, { types: ["armor"], makeDefault: true, label: "Ficha de Armadura" });

    
    

    // ==================================================================
    // ▼▼▼ BLOCO DE HOOKS CENTRALIZADOS AQUI ▼▼▼
    // ==================================================================
    
// ✅ HOOK DE CRIAÇÃO DE ATOR (POPULA CONDIÇÕES E MODIFICADORES)
    Hooks.on("createActor", async (actor, options, userId) => {
        if (game.user.id !== userId) return;
        if (actor.type !== "character") return;
        
        // Verifica configuração global (se existir)
        if (!game.settings.get("gum", "addDefaultRules")) return;
    
        console.log(`GUM | Populando novo ator: ${actor.name}`);
        const itemsToCreate = [];

        // 1. REGRAS / CONDIÇÕES PASSIVAS
        const rulesPack = game.packs.get("gum.Regras"); 
        if (rulesPack) {
            const rules = await rulesPack.getDocuments();
            rules.forEach(item => {
                const data = item.toObject();
                // Vincula ao compêndio para futuras atualizações
                data._stats = { compendiumSource: item.uuid }; 
                itemsToCreate.push(data);
            });
        }

        // 2. MODIFICADORES BÁSICOS (A Correção que você pediu)
        // Tenta achar pelo ID do sistema ou pelo Nome
        const modsPack = game.packs.get("gum.gm_modifiers") || game.packs.find(p => p.metadata.label === "[GUM] Modificadores Básicos");
        
        if (modsPack) {
            const mods = await modsPack.getDocuments();
            mods.forEach(item => {
                const data = item.toObject();
                // Vincula ao compêndio
                data._stats = { compendiumSource: item.uuid };
                itemsToCreate.push(data);
            });
            console.log(`GUM | Preparados ${mods.length} modificadores básicos para cópia.`);
        } else {
            console.warn("GUM | Compêndio de Modificadores Básicos não encontrado.");
        }

        // 3. CRIAÇÃO EM LOTE (Muito mais rápido)
        if (itemsToCreate.length > 0) {
            try {
                await actor.createEmbeddedDocuments("Item", itemsToCreate);
                console.log(`GUM | Sucesso! ${itemsToCreate.length} itens iniciais adicionados a ${actor.name}.`);
            } catch (err) {
                console.error("GUM | Falha ao popular ator:", err);
            }
        }
    });

    // Gatilho principal para quando os dados do ator mudam (HP, etc.)
    Hooks.on("updateActor", (actor, data, options, userId) => {
        if (game.user.id === userId) {
            processConditions(actor, options.gumEventData);
            actor.getActiveTokens().forEach(token => token.drawEffects());
        }
    });

Hooks.on("createItem", async (item, options, userId) => {
        // Só executa para o usuário que fez a ação e se o item foi adicionado a um ator
        if (game.user.id !== userId || !item.parent) return;

        const actor = item.parent; // Define o ator uma vez, pois sabemos que ele existe

        // Lógica para quando uma CONDIÇÃO é adicionada
        if (item.type === "condition") {
            await processConditions(actor);
            actor.getActiveTokens().forEach(token => token.drawEffects());
        }

        // Lógica para EFEITOS PASSIVOS (pode rodar para qualquer tipo de item)
        if (item.system.passiveEffects && Object.keys(item.system.passiveEffects).length > 0) {
            const passiveEffectLinks = Object.values(item.system.passiveEffects);
            console.log(`[GUM] Item "${item.name}" adicionado a ${actor.name}. Aplicando ${passiveEffectLinks.length} efeito(s) passivo(s)...`);

            for (const linkData of passiveEffectLinks) {
                const effectUuid = linkData.effectUuid || linkData.uuid;
                if (!effectUuid) continue;

                const effectItem = await fromUuid(effectUuid);
                if (effectItem) {
                    const effectSystem = effectItem.system;
                    let effectImage = null; // ✅ Padrão: Sem imagem
                    
                    // ✅ NOVO: Só define uma imagem se houver um status associado
                    if (effectSystem.attachedStatusId) {
                        const statusEffect = CONFIG.statusEffects.find(e => e.id === effectSystem.attachedStatusId);
                        if (statusEffect) {
                            effectImage = statusEffect.icon; // Usa o ícone do status
                        }
                    }

                    const activeEffectData = {
                        name: effectItem.name,
                        img: effectImage, // ✅ 'img' agora é o ícone do status ou null
                        origin: item.uuid,
                        changes: [],
                        statuses: [],
                        flags: {
                            gum: { 
                                originItemId: item.id,
                                // ✅ IMPORTANTE: Guardamos o UUID do Item Efeito original
                                //    para a ficha poder encontrar a imagem correta.
                                effectUuid: effectItem.uuid,
                                duration: foundry.utils.duplicate(effectSystem.duration || {})
                            }
                        }
                    };

                    // --- INÍCIO DO CÓDIGO DE DURAÇÃO COMPLETO ---
                    if (effectSystem.duration && !effectSystem.duration.isPermanent) {
                        activeEffectData.duration = {};
                        const value = parseInt(effectSystem.duration.value) || 1;
                        const unit = effectSystem.duration.unit;

                        if (unit === 'turns') {
                            activeEffectData.duration.turns = value;
                        } else if (unit === 'seconds') {
                            if (effectSystem.duration.inCombat && game.combat) {
                                activeEffectData.duration.turns = value; // 1s = 1 turno em combate
                            } else {
                                activeEffectData.duration.seconds = value;
                            }
                        } else if (unit === 'rounds') {
                            activeEffectData.duration.rounds = value;
                        } else if (unit === 'minutes') {
                            activeEffectData.duration.seconds = value * 60;
                        } else if (unit === 'hours') {
                            activeEffectData.duration.seconds = value * 60 * 60;
                        } else if (unit === 'days') {
                            activeEffectData.duration.seconds = value * 60 * 60 * 24;
                        }

                        if (effectSystem.duration.inCombat && game.combat) {
                            activeEffectData.duration.combat = game.combat.id;
                        }
                        activeEffectData.duration.startRound = game.combat?.round ?? null;
                        activeEffectData.duration.startTurn = game.combat?.turn ?? null;
                        activeEffectData.duration.startTime = game.time?.worldTime ?? null;
                    }
                    // --- FIM DO CÓDIGO DE DURAÇÃO ---

                    const coreStatusId = effectSystem.attachedStatusId || effectItem.name.slugify({ strict: true });
                    foundry.utils.setProperty(activeEffectData, "flags.core.statusId", coreStatusId);

                    if (effectSystem.type === 'attribute') {
                        const change = {
                            key: effectSystem.path,
                            mode: effectSystem.operation === 'OVERRIDE' ? CONST.ACTIVE_EFFECT_MODES.OVERRIDE : CONST.ACTIVE_EFFECT_MODES.ADD,
                            value: effectSystem.value
                        };
                        activeEffectData.changes.push(change);
                    } else if (effectSystem.type === 'flag') {
                        let valueToSet = effectSystem.flag_value === "true" ? true : effectSystem.flag_value === "false" ? false : effectSystem.flag_value;
                        foundry.utils.setProperty(activeEffectData.flags, `gum.${effectSystem.key}`, valueToSet);
                    }

                    if (effectSystem.attachedStatusId) {
                        activeEffectData.statuses.push(effectSystem.attachedStatusId);
                    }

                    try {
                        await actor.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
                        console.log(` -> Efeito passivo "${effectItem.name}" aplicado.`);
                    } catch (err) {
                        console.error(`[GUM] Falha ao criar ActiveEffect passivo para ${effectItem.name}:`, err, activeEffectData);
                    }
                }
            }
            
            // Força a reavaliação e redesenho UMA VEZ no final, após todos os efeitos
            await processConditions(actor);
            actor.sheet.render(false);
            actor.getActiveTokens().forEach(token => token.drawEffects());
        }
    });

    Hooks.on("updateItem", async (item, changes, options, userId) => {
        // Só executa para o usuário que fez a ação e se o item pertence a um ator
        if (game.user.id !== userId || !item.parent) return;

        const actor = item.parent;

        // --- LÓGICA EXISTENTE PARA 'condition' ---
        if (item.type === "condition") {
            await processConditions(actor);
            // O redesenho será feito no final, não precisamos mais dele aqui.
        }

        // =============================================================
        // ✅ LÓGICA DE SINCRONIZAÇÃO PARA EFEITOS PASSIVOS (UPDATE)
        // =============================================================
        // Verifica se o item atualizado tem a capacidade de ter passiveEffects
        // Usamos hasOwnProperty para ser seguro, mas podemos checar 'item.system.passiveEffects'
        if (item.system.passiveEffects) {
            
            // 1. Encontra e Deleta TODOS os ActiveEffects existentes originados deste item
            const updatedItemId = item.id;
            const effectsToDelete = actor.effects.filter(effect => 
                foundry.utils.getProperty(effect, "flags.gum.originItemId") === updatedItemId
            );

            if (effectsToDelete.length > 0) {
                const idsToDelete = effectsToDelete.map(e => e.id);
                console.log(`[GUM] Item "${item.name}" atualizado. Removendo ${idsToDelete.length} efeito(s) passivo(s) antigo(s)...`);
                await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete);
            }

            // 2. Recria TODOS os ActiveEffects da lista atualizada do item
            // (Esta lógica é uma cópia da que está no hook 'createItem')
            const passiveEffectLinks = Object.values(item.system.passiveEffects || {});
            if (passiveEffectLinks.length > 0) {
                console.log(`[GUM] ...Recriando ${passiveEffectLinks.length} efeito(s) passivo(s) atualizado(s).`);
                
                for (const linkData of passiveEffectLinks) {
                    const effectUuid = linkData.effectUuid || linkData.uuid;
                    if (!effectUuid) continue;

                    const effectItem = await fromUuid(effectUuid);
                    if (effectItem) {
                        // --- Início da lógica de criação do ActiveEffect (copiada do createItem) ---
                        const effectSystem = effectItem.system;
                        let effectImage = null; 
                        if (effectSystem.attachedStatusId) {
                            const statusEffect = CONFIG.statusEffects.find(e => e.id === effectSystem.attachedStatusId);
                            if (statusEffect) { effectImage = statusEffect.icon; }
                        }

                        const activeEffectData = {
                            name: effectItem.name,
                            img: effectImage, 
                            origin: item.uuid,
                            changes: [],
                            statuses: [],
                            flags: { gum: { originItemId: item.id, effectUuid: effectItem.uuid, duration: foundry.utils.duplicate(effectSystem.duration || {}) } }
                        };

                        if (effectSystem.duration && !effectSystem.duration.isPermanent) {
                            activeEffectData.duration = {};
                            const value = parseInt(effectSystem.duration.value) || 1;
                            const unit = effectSystem.duration.unit;

                            if (unit === 'turns') {
                                activeEffectData.duration.turns = value;
                            } else if (unit === 'seconds') {
                                if (effectSystem.duration.inCombat && game.combat) {
                                    activeEffectData.duration.turns = value;
                                } else {
                                    activeEffectData.duration.seconds = value;
                                }
                            } else if (unit === 'rounds') {
                                activeEffectData.duration.rounds = value;
                            } else if (unit === 'minutes') {
                                activeEffectData.duration.seconds = value * 60;
                            } else if (unit === 'hours') {
                                activeEffectData.duration.seconds = value * 60 * 60;
                            } else if (unit === 'days') {
                                activeEffectData.duration.seconds = value * 60 * 60 * 24;
                            }

                            if (effectSystem.duration.inCombat && game.combat) {
                                activeEffectData.duration.combat = game.combat.id;
                            }
                            activeEffectData.duration.startRound = game.combat?.round ?? null;
                            activeEffectData.duration.startTurn = game.combat?.turn ?? null;
                            activeEffectData.duration.startTime = game.time?.worldTime ?? null;
                        }

                        const coreStatusId = effectSystem.attachedStatusId || effectItem.name.slugify({ strict: true });
                        foundry.utils.setProperty(activeEffectData, "flags.core.statusId", coreStatusId);

                        if (effectSystem.type === 'attribute') {
                            const change = {
                                key: effectSystem.path,
                                mode: effectSystem.operation === 'OVERRIDE' ? CONST.ACTIVE_EFFECT_MODES.OVERRIDE : CONST.ACTIVE_EFFECT_MODES.ADD,
                                value: effectSystem.value
                            };
                            activeEffectData.changes.push(change);
                        } else if (effectSystem.type === 'flag') {
                            let valueToSet = effectSystem.flag_value === "true" ? true : effectSystem.flag_value === "false" ? false : effectSystem.flag_value;
                            foundry.utils.setProperty(activeEffectData.flags, `gum.${effectSystem.key}`, valueToSet);
                        }

                        if (effectSystem.attachedStatusId) {
                            activeEffectData.statuses.push(effectSystem.attachedStatusId);
                        }

                        try {
                            await actor.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
                        } catch (err) {
                            console.error(`[GUM] Falha ao criar ActiveEffect passivo (update):`, err, activeEffectData);
                        }
                        // --- Fim da lógica de criação do ActiveEffect ---
                    }
                }
            }
        } // Fim do if (item.system.passiveEffects)
        // =============================================================
        
        // --- Chamada final de atualização ---
        // Sempre reavalia e redesenha após QUALQUER atualização de item no ator
        await processConditions(actor);
        actor.sheet.render(false);
        actor.getActiveTokens().forEach(token => token.drawEffects());
    });

   Hooks.on("deleteItem", async (item, options, userId) => {
        // Só executa para o usuário que fez a ação e se o item pertencia a um ator
        if (game.user.id !== userId || !item.parent) return;

        const actor = item.parent; // Define o ator uma vez
        const deletedItemId = item.id; // ID do item que foi removido

        // --- LÓGICA PARA CONDIÇÕES (Sua lógica original) ---
        if (item.type === "condition") {
            // Apenas chamar processConditions é o suficiente, 
            // pois o item não existe mais e seus efeitos passivos sumirão
        }

        // =============================================================
        // ✅ LÓGICA DE EFEITOS PASSIVOS CORRIGIDA
        // =============================================================
        
        // Procura por efeitos que tenham a nossa "etiqueta" (flag)
        const effectsToDelete = actor.effects.filter(effect => 
            foundry.utils.getProperty(effect, "flags.gum.originItemId") === deletedItemId
        );

        if (effectsToDelete.length > 0) {
            const idsToDelete = effectsToDelete.map(e => e.id);
            console.log(`[GUM] Item "${item.name}" removido de ${actor.name}. Removendo ${idsToDelete.length} efeito(s) passivo(s) associado(s):`, idsToDelete);
            
            try {
                // Deleta os ActiveEffects encontrados
                await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete);
            } catch (err) {
                console.error(`[GUM] Falha ao remover ActiveEffects passivos:`, err);
            }
        }
        
        // --- Chamada final de atualização ---
        // Sempre chama processConditions e redesenha após deletar QUALQUER item,
        // garantindo que o estado do ator seja reavaliado.
        await processConditions(actor);
        actor.sheet.render(false);
        actor.getActiveTokens().forEach(token => token.drawEffects());
    });

    Hooks.on("updateCombat", async (combat, changed, options, userId) => {
        
        // ==========================================================
        // ✅ BLOCO DE CORREÇÃO DO ÍCONE (INÍCIO)
        // ==========================================================
        // Se o combate foi desativado (encerrado) ou o round resetado para null
        if (changed.active === false || (changed.hasOwnProperty('round') && changed.round === null)) {
            console.log("GUM | Combate encerrado. Limpando ícones dos tokens.");
            // Loop em TODOS os combatentes para limpar seus ícones
            for (const combatant of combat.combatants) {
                // token.object.refresh() é a forma mais segura de forçar a limpeza
                if (combatant.token?.object) {
                    combatant.token.object.refresh();
                }
            }
            return; // Encerra aqui, não precisa processar turnos
        }
        // ==========================================================
        // ✅ BLOCO DE CORREÇÃO DO ÍCONE (FIM)
        // ==========================================================

        if (!game.user.isGM) return;

        // --- Lógica de Início de Turno (Seu código original, sem alteração) ---
        if (changed.round !== undefined || (changed.turn !== undefined && combat.combatant)) {
            const currentCombatant = combat.combatant;
            if (currentCombatant?.actor) {
                await processConditions(currentCombatant.actor); 
                currentCombatant.token?.object?.drawEffects(); 
            }
        }

        // --- Lógica de Fim de Turno (Seu código original, sem alteração) ---
        if (changed.turn !== undefined && combat.previous.combatantId) {
            const previousCombatant = combat.combatants.get(combat.previous.combatantId);
            if (previousCombatant?.actor) {
                const actor = previousCombatant.actor;
                await manageActiveEffectDurations(actor); 
                await manageDurations(combat); 
                await processConditions(actor); 
                actor.getActiveTokens().forEach(token => token.drawEffects()); 
            }
        }
    });

    // ==========================================================
    // ✅ NOVO HOOK: Limpa ícones quando o combate é DELETADO
    // ==========================================================
    Hooks.on("deleteCombat", (combat, options, userId) => {
        console.log("GUM | Combate deletado. Limpando ícones dos tokens.");
        for (const combatant of combat.combatants) {
            // token.object.refresh() força uma atualização completa da aparência do token
            if (combatant.token?.object) {
                 combatant.token.object.refresh();
            }
        }
    });

    // ==========================================================
    // ✅ NOVO HOOK: Muda para a aba de Combate ao adicionar token
    // ==========================================================
    Hooks.on("createCombatant", (combatant, options, userId) => {
        // Só executa para o usuário que está interagindo
        if (game.user.id !== userId) return;

        // --- Ponto 1: Mudar a aba da Ficha do Ator (Já implementado) ---
        const actor = combatant.actor;
        if (actor && actor.sheet.rendered) {
            actor.sheet.activateTab("combat");
        }

        // --- Ponto 2: Abrir o "Encontro" (o Combat Tracker) ---
        // 'ui.combat' é o app da sidebar de combate.
        // Se ele não estiver renderizado (visível), chame .render(true) para abri-lo.
        if (ui.combat && !ui.combat.rendered) {
            ui.combat.render(true);
        }
    });

// ==========================================================
    // ✅ NOVO HOOK: Adiciona o botão "Importar GCS" na barra de Atores
    // ==========================================================
Hooks.on("renderActorDirectory", (app, html, data) => {
        // Apenas GMs podem ver o botão
        if (!game.user.isGM) return;

        const button = $(`
            <button class="gcs-import-button" type="button" style="width: 100%; margin-bottom: 5px;">
                <i class="fas fa-file-import"></i> Importar do GCS
            </button>
        `);
        
        button.on("click", () => {
            // Chama a função de importação que está em importers.js
            game.gum.importFromGCS();
        });

        // ✅ A CORREÇÃO REAL ESTÁ AQUI:
        // Usamos $(html) em vez de $(html[0]).
        // Isso lida corretamente com o parâmetro 'html'
        // e permite o uso da função .find().
        $(html).find(".directory-header .header-actions").append(button);
    });

});


// ================================================================== //
//  2.1 HOOK DE PRONTO (`ready`)
// ================================================================== //
Hooks.once('ready', async function() {
    console.log("GUM | Fase 'ready': Aplicando configurações.");

    $('body').on('click', '.apply-damage-button', (ev) => {
    ev.preventDefault();
    console.log("GUM | DEBUG: Botão 'Aplicar Dano' clicado.");

    const button = ev.currentTarget;

    // 1. Pega o token alvo selecionado
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 1) {
        console.error("GUM | DEBUG: Falha na Etapa 1. Nenhum token ou múltiplos tokens selecionados.");
        return ui.notifications.warn("Por favor, selecione exatamente um token como alvo.");
    }
    const targetActor = controlled[0].actor;
    console.log(`GUM | DEBUG: Etapa 1 OK. Alvo: ${targetActor.name}`);

    // 2. Lê o pacote de dados
    const damagePackageJSON = button.dataset.damage;
    if (!damagePackageJSON) {
        console.error("GUM | DEBUG: Falha na Etapa 2. Pacote de dados de dano não encontrado no botão.");
        return ui.notifications.error("Erro crítico: Pacote de dados de dano ausente.");
    }
    const damagePackage = JSON.parse(damagePackageJSON);
    console.log("GUM | DEBUG: Etapa 2 OK. Pacote de dados lido:", damagePackage);

    // 3. Encontra o ator atacante pela ID
    const attackerActor = game.actors.get(damagePackage.attackerId);
    if (!attackerActor) {
        console.error(`GUM | DEBUG: Falha na Etapa 3. Ator atacante com ID "${damagePackage.attackerId}" não encontrado.`);
        return ui.notifications.error("Erro: Ator atacante não encontrado. A mensagem de chat pode ser antiga.");
    }
    console.log(`GUM | DEBUG: Etapa 3 OK. Atacante: ${attackerActor.name}`);

    // 4. Cria e renderiza nossa nova janela
    console.log("GUM | DEBUG: Etapa 4. Tudo pronto para abrir a janela.");
    new DamageApplicationWindow(damagePackage, attackerActor, targetActor).render(true);
});
    

 const normalizeTestKey = (value) => value?.toString?.().trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const resolveActorTestValue = (actor, rawKey) => {
    if (!actor) return null;
    const key = rawKey?.toString?.().trim();
    if (!key) return null;

    const numericKey = Number(key);
    if (!Number.isNaN(numericKey) && key !== "") return numericKey;

    const attributeCandidates = [key, key.toLowerCase(), key.toUpperCase()];
    let attributeObject = null;
    for (const candidate of attributeCandidates) {
        attributeObject = foundry.utils.getProperty(actor.system?.attributes, candidate);
        if (attributeObject) break;
    }
    if (attributeObject) {
        return (attributeObject.override !== null && attributeObject.override !== undefined)
            ? attributeObject.override
            : attributeObject.final;
    }

    const normalizedKey = normalizeTestKey(key);
    const skills = actor.items?.filter(item => item.type === 'skill') || [];
    const matchedSkill = skills.find(skill => normalizeTestKey(skill.name) === normalizedKey);
    if (matchedSkill) {
        return matchedSkill.system?.final_nh ?? matchedSkill.system?.nh ?? 10;
    }

    return null;
};

const formatTestLabel = (rawKey) => {
    if (!rawKey) return "HT";
    const key = rawKey.toString().trim();
    const attributeKey = key.toLowerCase();
    const standardAttributes = new Set(["st", "dx", "iq", "ht", "will", "per"]);
    if (standardAttributes.has(attributeKey)) {
        return attributeKey.toUpperCase();
    }
    return key;
};

$('body').on('click', '.chat-message .rollable', async (ev) => {
        const element = ev.currentTarget;
        const speaker = ChatMessage.getSpeaker({ scene: $(element).closest('.message').data('scene-id'), actor: $(element).closest('.message').data('actor-id') });
        const actor = ChatMessage.getSpeakerActor(speaker);
        if (!actor) return ui.notifications.warn("Ator da mensagem de chat não encontrado.");

        const rollValue = Number(element.dataset.rollValue);
        const rollLabel = element.dataset.label || "Teste";

        // A lógica de Shift+Click para modificadores
        if (ev.shiftKey) {
            new Dialog({
                title: "Modificador de Rolagem Situacional",
                content: `...`, // Seu HTML aqui
                buttons: {
                    roll: {
                        label: "Rolar",
                        callback: (html) => {
                            const situationalMod = parseInt(html.find('input[name="modifier"]').val()) || 0;
                            performGURPSRoll(actor, { label: rollLabel, value: rollValue, modifier: situationalMod });
                        }
                    }
                }
            }).render(true);
        } else {
            performGURPSRoll(actor, { label: rollLabel, value: rollValue, modifier: 0 });
        }
    });

// ==========================================================
// LISTENER FINAL E ÚNICO PARA O BOTÃO DE RESISTÊNCIA
// ==========================================================

$('body').on('click', '.resistance-roll-button', async ev => {
    ev.preventDefault();
    const button = ev.currentTarget;

    // Acessa o pacote de dados completo
    const rollData = JSON.parse(button.dataset.rollData);
    
    // ✅ CORREÇÃO AQUI: Lemos o 'effectItemData' completo que salvamos antes.
    const { effectItemData, sourceName, effectLinkId } = rollData;
    const mode = rollData.mode || "activation";
    const rollConfig = effectItemData?.system?.resistanceRoll || {};
    if (!effectItemData) {
        ui.notifications.warn("Dados do efeito não encontrados para o teste de resistência.");
        button.disabled = false;
        return;
    }

    const resolveActorForRoll = () => {
        const messageId = $(button).closest('.message').data('messageId');
        const message = messageId ? game.messages.get(messageId) : null;
        const speakerActor = message ? ChatMessage.getSpeakerActor(message.speaker) : null;
        if (speakerActor) return speakerActor;

        const controlled = canvas.tokens?.controlled || [];
        if (controlled.length > 0) return controlled[0].actor;

        if (game.user.character) return game.user.character;

 if (rollData.targetActorId) return game.actors.get(rollData.targetActorId);
        return null;
    };

    const buildFallbackToken = (fallbackActor) => ({
        actor: fallbackActor,
        id: null,
        name: fallbackActor?.name || "Alvo",
        document: { texture: { src: fallbackActor?.img || "icons/svg/mystery-man.svg" } }
    });

   const computeTargetValue = (actor, extraModifier = 0) => {
        if (!actor) return { finalTarget: rollData.finalTarget || 10, base: 10 };
        const attributeKey = rollConfig.attribute || "ht";
        const resolvedBaseValue = resolveRollBaseValue(actor, attributeKey);
        const baseAttributeValue = (resolvedBaseValue !== null && resolvedBaseValue !== undefined)
            ? resolvedBaseValue
            : 10;

        const effectModifier = parseInt(rollConfig.modifier) || 0;
        const totalModifier = effectModifier + extraModifier;
        return {
            finalTarget: baseAttributeValue + totalModifier,
            base: baseAttributeValue,
            modifier: totalModifier,
            effectModifier,
            extraModifier,
            attributeLabel: attributeKey.toString().toUpperCase()
        };
    };

    const resistingActor = resolveActorForRoll();
    if (!resistingActor) {
        ui.notifications.warn("Nenhum ator encontrado para rolar a resistência.");
        return;
    }

    const performResistanceRoll = async (extraModifier = 0) => {
        button.disabled = true;
        const targetCalc = computeTargetValue(resistingActor, extraModifier);
        const finalTarget = targetCalc.finalTarget;

        const roll = new Roll("3d6");
        await roll.evaluate();

        const margin = finalTarget - roll.total;
        const success = roll.total <= finalTarget;
        const achievedMargin = Math.abs(margin);
        const minMargin = parseInt(rollConfig.margin) || 0;
        const marginOk = achievedMargin >= minMargin;
        const applyOnSuccess = rollConfig.applyOn === 'success';
        const shouldApply = marginOk && ((applyOnSuccess && success) || (!applyOnSuccess && !success));

        let resultText = success ? `Sucesso com margem de ${margin}` : `Fracasso por uma margem de ${-margin}`;
        let resultLabel = success ? "Sucesso" : "Falha";
        let resultClass = success ? 'success' : 'failure';

        if (roll.total <= 4 || (roll.total <= 6 && margin >= 10)) {
            resultText = `Sucesso Crítico!`;
            resultLabel = "Sucesso Crítico";
            resultClass = 'crit-success';
        } else if (roll.total >= 17 || (roll.total === 16 && margin <= -10)) {
            resultText = `Falha Crítica!`;
            resultLabel = "Falha Crítica";
            resultClass = 'crit-failure';
        }

        // Comunica o resultado de volta para a janela de dano
        if (game.gum.activeDamageApplication) {
            // ✅ CORREÇÃO AQUI: Passamos apenas o 'system' do efeito, que é o que a função espera.
            game.gum.activeDamageApplication.updateEffectCard(effectLinkId, {
                isSuccess: success,
                resultText: resultText,
                shouldApply: shouldApply
            }, effectItemData.system); // Passamos os dados do sistema como terceiro argumento
        }

        // Aplica o efeito no alvo
        if (shouldApply && mode !== "damage") {
            const effectItem = await Item.fromSource(effectItemData);
            if (effectItem) {
     const resolveTargets = () => {
                    const targets = [];
                    if (rollData.targetTokenId) {
                        const token = canvas.tokens?.get(rollData.targetTokenId);
                        if (token) targets.push(token);
                    }
                    if (targets.length === 0 && resistingActor) {
                        const activeTokens = resistingActor.getActiveTokens();
                        if (activeTokens.length > 0) {
                            targets.push(...activeTokens);
                        } else {
                            targets.push(buildFallbackToken(resistingActor));
                        }
                    }
                    if (targets.length === 0 && rollData.targetActorId) {
                        const actor = game.actors.get(rollData.targetActorId);
                        if (actor) {
                            const activeTokens = actor.getActiveTokens();
                            if (activeTokens.length > 0) {
                                targets.push(...activeTokens);
                            } else {
                                targets.push(buildFallbackToken(actor));
                            }
                        }
                    }
                    return targets;
                };


                const targets = resolveTargets();
                if (targets.length > 0) {
                    const originItem = rollData.originItemUuid ? await fromUuid(rollData.originItemUuid).catch(() => null) : null;
                    const originActor = rollData.sourceActorId ? game.actors.get(rollData.sourceActorId) : null;

                    ui.notifications.info(`${resistingActor.name} foi afetado por: ${effectItem.name}!`);
                  const conditionContext = mode === "condition" && rollData.conditionId
                        ? { conditionId: rollData.conditionId }
                        : {};
                    await applySingleEffect(effectItem, targets, {
                        actor: originActor,
                        origin: originItem || effectItem,
                        ...conditionContext
                    });
                } else {
                    ui.notifications.warn("Não foi possível encontrar um alvo para aplicar o efeito.");
                }
            }
        }

        // Monta o card de resultado no chat usando o mesmo layout da rolagem base
        const diceFaces = roll.dice[0].results.map(r => `<span class="die-face">${r.result}</span>`).join('');
        const modifierText = targetCalc.modifier !== 0 ? `${targetCalc.modifier > 0 ? '+' : ''}${targetCalc.modifier}` : '±0';
        const modBreakdownParts = [];
        if (targetCalc.effectModifier) {
            modBreakdownParts.push(`Ef ${targetCalc.effectModifier > 0 ? '+' : ''}${targetCalc.effectModifier}`);
        }
        if (targetCalc.extraModifier) {
            modBreakdownParts.push(`Mod ${targetCalc.extraModifier > 0 ? '+' : ''}${targetCalc.extraModifier}`);
        }
        const modBreakdown = modBreakdownParts.length > 0 ? modBreakdownParts.join(' | ') : 'Sem modificadores';
        const marginValue = Math.abs(margin);

        const flavor = `
            <div class="gurps-roll-card premium roll-result">
                <header class="card-header">
                    <h3>Teste de Resistência</h3>
                    <small>${resistingActor?.name || 'Alvo'}</small>
                </header>

                <div class="card-formula-container">
                    <span class="formula-pill">${targetCalc.attributeLabel} ${targetCalc.base}</span>
                    <span class="formula-pill">${modifierText} (${modBreakdown})</span>
                </div>

                <div class="card-content">
                    <div class="card-main-flex">
                        <div class="roll-column">
                            <span class="column-label">Dados</span>
                            <div class="roll-total">${roll.total}</div>
                            <div class="individual-dice">${diceFaces}</div>
                        </div>

                        <div class="column-separator"></div>

                        <div class="target-column">
                            <span class="column-label">Alvo</span>
                            <div class="target-value">${finalTarget}</div>
                            <div class="target-note">Final</div>
                        </div>
                    </div>
                </div>

                <footer class="card-footer">
                    <div class="result-block ${resultClass}">
                        <span class="result-label">${resultLabel}</span>
                        <span class="result-margin">Margem ${marginValue}</span>
                    </div>
                </footer>
            </div>
        `;

        // Atualiza a mensagem original no chat
        const originalMessage = game.messages.get($(button).closest('.message').data('messageId'));
        if (originalMessage) {
            await originalMessage.update({ content: flavor, rolls: [roll] });
        }
    };

    if (ev.shiftKey) {
        await performResistanceRoll();
        return;
    }

    const promptTarget = computeTargetValue(resistingActor, 0);
    const promptData = {
        label: "Teste de Resistência",
        type: "attribute",
        attribute: rollConfig.attribute || "ht",
        value: promptTarget.finalTarget,
        img: effectItemData?.img || resistingActor.img
    };

    new GurpsRollPrompt(resistingActor, promptData, {
        onRoll: async (_actor, promptPayload) => {
            await performResistanceRoll(promptPayload.modifier || 0);
        }
    }).render(true);
});

});



// ================================================================== //
//  3. HELPERS DO HANDLEBARS
// ================================================================== //

Handlebars.registerHelper('collapsibleState', function(targetId, allCollapsedData) {
    if (!allCollapsedData) return ""; // Padrão: Fechado
    if (!targetId) return "";
    
    // Tenta encontrar o estado salvo
    const isOpen = allCollapsedData[targetId];

    // Retorna 'open' apenas se for explicitamente true
    return isOpen === true ? "open" : ""; 
});

Handlebars.registerHelper('formatDR', function(drObject) {
    if (!drObject || typeof drObject !== 'object') {
        return drObject || 0;
    }

    const parts = [];
    const baseDR = drObject.base || 0;
    parts.push(baseDR.toString()); // Sempre começa com o valor base

    // Itera sobre todas as chaves (cont, cort, pi, qmd, etc.)
    for (const [type, mod] of Object.entries(drObject)) {
        if (type === 'base') continue; // Já cuidamos da base

        // ✅ CORREÇÃO: SOMA o modificador à base
        const finalDR = Math.max(0, baseDR + (mod || 0));
        
        // Só mostra se for diferente da base
        if (finalDR !== baseDR) {
            parts.push(`${finalDR} ${type}`);
        }
    }

    // Se a base for 0 e houver outros, podemos até omitir o "0 |"
    if (parts.length > 1 && parts[0] === "0") {
         parts.shift(); // Remove o "0"
    }
    
    // Une tudo com o separador |
    return new Handlebars.SafeString(parts.join(" | "));
});

Handlebars.registerHelper('includes', function(array, value) {
  return Array.isArray(array) && array.includes(value);
});

Handlebars.registerHelper('array', function(...args) {
  return args.slice(0, -1);
});

Handlebars.registerHelper('capitalize', function(str) {
  if (typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
});

Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});
Handlebars.registerHelper('or', function() {
    const args = Array.prototype.slice.call(arguments, 0, -1);
    return args.some(Boolean);
});
Handlebars.registerHelper('gt', function (a, b) {
    return a > b;
});

Handlebars.registerHelper('gte', function (a, b) {
    return a >= b;
});

    // Ajudante para transformar um objeto em um array de seus valores
    Handlebars.registerHelper('objectValues', function(obj) { return obj ? Object.values(obj) : []; });
    // Ajudante para pegar o primeiro elemento de um array
    Handlebars.registerHelper('first', function(arr) { return arr?.[0]; });
    // Este ajudante ensina ao sistema como executar um loop 'for' simples,
    Handlebars.registerHelper('for', function(from, to, block) {
        let accum = '';
        for(let i = from; i <= to; i++) {
            accum += block.fn(this, {data: {index: i}});
        }
        return accum;
    });
Handlebars.registerHelper('bar_style', function(current, max, type) {
    const M = Math.max(1, max);
    let width = 0;
    let color = "";

    const colors = {
        hp_normal: "#3b7d3b",
        hp_wounded: "#b8860b",
        hp_reeling: "#a53541",
        hp_near_death_1: "#8B0000",
        hp_near_death_2: "#700000",
        hp_near_death_3: "#580000",
        hp_near_death_4: "#400000",
        hp_dead: "#313131",
        
        fp_normal: "#3b5a7d",      // Azul (Padrão)
        fp_tired: "#6a5acd",       // Roxo (Cansado)
        fp_exhausted: "#483d8b",    // Roxo Escuro (Exausto)
        fp_unconscious: "#2c2c54"  // Roxo muito escuro (Inconsciente por fadiga)
    };

    if (type === 'hp') {
        if (current > 0) {
            width = Math.min(100, (current / M) * 100);
            if (current <= M / 3) color = colors.hp_wounded;
            else color = colors.hp_normal;
        } else {
            const negativeDepth = Math.abs(current);
            const deathThreshold = 5 * M;
            width = Math.min(100, (negativeDepth / deathThreshold) * 100);
            
            if (current <= -5 * M)      color = colors.hp_dead;
            else if (current <= -4 * M) color = colors.hp_near_death_4;
            else if (current <= -3 * M) color = colors.hp_near_death_3;
            else if (current <= -2 * M) color = colors.hp_near_death_2;
            else if (current <= -1 * M) color = colors.hp_near_death_1;
            else                        color = colors.hp_reeling;
        }
    } else { // fp
        // --- ✅ LÓGICA DE BARRA REVERSA APLICADA AOS PFs ✅ ---
        if (current > 0) {
            // Comportamento normal para PFs positivos
            width = Math.min(100, (current / M) * 100);
            if (current <= M / 3) color = colors.fp_tired;
            else color = colors.fp_normal;
        } else {
            // Comportamento "reverso" para PFs negativos
            // A barra enche à medida que o personagem vai de 0 a -PF Máx
            const negativeDepth = Math.abs(current);
            const unconsciousThreshold = M; // O limiar para inconsciência é -1 * PF Máx
            width = Math.min(100, (negativeDepth / unconsciousThreshold) * 100);
            
            // Se os PFs forem negativos, o personagem está exausto e inconsciente
            color = colors.fp_unconscious;
        }
    }
    
    // Retorna o estilo CSS completo
    return new Handlebars.SafeString(`width: ${width}%; background-color: ${color};`);
});
Handlebars.registerHelper('add', function(a, b) {
  return a + b;
});
Handlebars.registerHelper('obj', function(...args) {
    const obj = {};
    for (let i = 0; i < args.length - 1; i += 2) {
        obj[args[i]] = args[i + 1];
    }
    return obj;
});

const normalizeLookupKey = (value) => value
    ?.toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const resolveRollBaseValue = (actor, rollAttribute) => {
    if (!actor || !rollAttribute) return null;
    const normalizedKey = normalizeLookupKey(rollAttribute);
    if (!normalizedKey) return null;

    const attributes = actor.system?.attributes || {};
    const attrKey = Object.keys(attributes).find((key) => normalizeLookupKey(key) === normalizedKey);
    if (attrKey) {
        const attr = attributes[attrKey];
        const value = (attr?.override !== null && attr?.override !== undefined)
            ? attr?.override
            : (attr?.final ?? attr?.value);
        if (value !== undefined && value !== null && !Number.isNaN(Number(value))) {
            return Number(value);
        }
    }

    const skills = actor.items?.filter((item) => item.type === "skill") || [];
    const matchedSkill = skills.find((skill) => normalizeLookupKey(skill.name) === normalizedKey);
    if (matchedSkill) {
        const nhValue = matchedSkill.system?.final_nh;
        if (nhValue !== undefined && nhValue !== null && !Number.isNaN(Number(nhValue))) {
            return Number(nhValue);
        }
    }

    if (!Number.isNaN(parseInt(rollAttribute))) return parseInt(rollAttribute);
    return null;
};

/**
 * Função unificada que avalia todas as condições de um ator.
 * - Sincroniza ícones de status no token usando a API moderna (v12+).
 * - Dispara efeitos de "ativação única" (macros, chat) apenas quando o estado da condição muda.
 * - Previne loops de reavaliação.
 * @param {Actor} actor O ator a ser processado.
 */
let evaluatingActors = new Set(); 

async function processConditions(actor, eventData = null) {
    // FOCO ÚNICO: Avaliar ITENS de Condição e executar ações únicas (macro, chat, flag)
    // baseadas na MUDANÇA DE ESTADO desses ITENS.
    // **NÃO GERENCIA MAIS ÍCONES DE STATUS.**
    
    if (!actor || evaluatingActors.has(actor.id)) return;
    evaluatingActors.add(actor.id);

 try {
        const conditions = actor.items.filter(i => i.type === "condition");
        const buildFallbackToken = (fallbackActor) => ({
            actor: fallbackActor,
            id: null,
            name: fallbackActor?.name || "Alvo",
            document: { texture: { src: fallbackActor?.img || "icons/svg/mystery-man.svg" } }
        });
        const normalizeEffectPath = (path) => {
            if (!path || typeof path !== "string") return path;
            let normalized = path.trim();
            if (normalized.startsWith("actor.")) {
                normalized = normalized.slice(6);
            }
            if (normalized.startsWith("data.")) {
                normalized = normalized.replace(/^data\./, "system.");
            }
            if (!normalized.startsWith("system.")
                && !normalized.startsWith("flags.")
                && !normalized.startsWith("effects.")
                && !normalized.startsWith("items.")) {
                if (normalized.startsWith("attributes.") || normalized.startsWith("combat.") || normalized.startsWith("resources.")) {
                    normalized = `system.${normalized}`;
                }
            }
            return normalized;
        };
        const evaluateEffectValue = (value) => {
            if (typeof value === "string") {
                const trimmed = value.trim();
                if (trimmed === "") return 0;
                try {
                    return new Function("actor", "game", `return (${trimmed});`)(actor, game);
                } catch (error) {
                    console.warn("GUM | Erro ao avaliar valor de efeito em condição:", error);
                    return value;
                }
            }
            return value;
        };

        // --- Loop para avaliar Condições e disparar ações únicas ---
        for (const condition of conditions) {
             const wasActive = condition.getFlag("gum", "wasActive") || false;
             const isManuallyDisabled = condition.getFlag("gum", "manual_override") || false;
             let isConditionActiveNow = false; 
             try { isConditionActiveNow = !condition.system.when || Function("actor", "game", "eventData", `return (${condition.system.when})`)(actor, game, eventData); } catch (e) {}
             const isEffectivelyActiveNow = isConditionActiveNow && !isManuallyDisabled;
             const stateChanged = isEffectivelyActiveNow !== wasActive;

             if (stateChanged) {
                 // Salva o novo estado
                 await condition.setFlag("gum", "wasActive", isEffectivelyActiveNow);
                 
                 const effectLinks = condition.system.effects || []; // Pega os links de efeito dentro da condição

 if (isEffectivelyActiveNow) { // Condição acabou de LIGAR
                     for (const link of effectLinks) {
                        if(!link.uuid) continue; // Pula se não for um link válido
                        const effectItem = await fromUuid(link.uuid); // Carrega o Item Efeito original
                        if (!effectItem?.system) continue;
                        const requiresResistance = effectItem.system?.resistanceRoll?.isResisted;
                        if (requiresResistance) {
                            const activeTokens = actor.getActiveTokens();
                            const resistanceTargets = activeTokens.length ? activeTokens : [buildFallbackToken(actor)];
                            for (const targetToken of resistanceTargets) {
                                await _promptActivationResistance(
                                    effectItem,
                                    targetToken,
                                    actor,
                                    condition,
                                    link.id || null,
                                    { mode: "condition", conditionId: condition.id }
                                );
                            }
                            continue;
                        }

                        // Executa Macro (se for do tipo macro)
                        if (effectItem.system.type === "macro" && effectItem.system.value) {
                            const macro = game.macros.getName(effectItem.system.value);
                            if (macro) macro.execute({ actor: actor }); // Passa o ator atual para a macro
                            else ui.notifications.warn(`[GUM] Macro "${effectItem.system.value}" não encontrada.`);
                        }
                        // Envia Mensagem de Chat (se for do tipo chat)
                        else if (effectItem.system.type === "chat" && effectItem.system.chat_text) { 
                             let content = effectItem.system.chat_text.replace(/{actor.name}/g, actor.name);
                             // Adiciona botão de rolagem, se configurado
                             if (effectItem.system.has_roll) { 
                                let finalTarget = 0;
                                if (effectItem.system.roll_attribute === 'fixed') {
                                    finalTarget = Number(effectItem.system.roll_fixed_value) || 10;
                                } else if (effectItem.system.roll_attribute) {
                                    const resolvedBase = resolveRollBaseValue(actor, effectItem.system.roll_attribute);
                                    const finalAttr = (resolvedBase !== null && resolvedBase !== undefined) ? resolvedBase : 10;
                                    finalTarget = finalAttr + (Number(effectItem.system.roll_modifier) || 0);
                                }
                                const label = effectItem.system.roll_label || `Rolar Teste`;
                                content += `<div style="text-align: center; margin-top: 10px;"><button class="rollable" data-roll-value="${finalTarget}" data-label="${label}">${label} (vs ${finalTarget})</button></div>`;
                             }
                             // Prepara e envia a mensagem
                             const chatData = { speaker: ChatMessage.getSpeaker({ actor: actor }), content: content };
                             if (effectItem.system.whisperMode === 'gm') chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                             else if (effectItem.system.whisperMode === 'blind') chatData.blind = true;
                             ChatMessage.create(chatData);
                        }
                        // Define Flag (se for do tipo flag)
 else if (effectItem.system.type === "flag" && effectItem.system.key) {
                             let valueToSet = effectItem.system.flag_value === "true" ? true : effectItem.system.flag_value === "false" ? false : effectItem.system.flag_value;
                             await actor.setFlag("gum", effectItem.system.key, valueToSet);
                        }

                        const shouldCreateEffect = ["attribute", "roll_modifier", "status"].includes(effectItem.system.type);
                        if (shouldCreateEffect) {
                            const existingConditionEffect = actor.effects.find((effect) =>
                                effect?.flags?.gum?.conditionId === condition.id
                                && effect?.flags?.gum?.effectUuid === effectItem.uuid
                            );
                            if (!existingConditionEffect) {
                                const effectData = {
                                    name: effectItem.name,
                                    img: effectItem.img,
                                    origin: condition.uuid,
                                    changes: [],
                                    statuses: [],
                                    flags: {
                                        gum: {
                                            conditionEffect: true,
                                            conditionId: condition.id,
                                            effectUuid: effectItem.uuid
                                        }
                                    }
                                };
                                const coreStatusId = effectItem.name.slugify({ strict: true });
                                foundry.utils.setProperty(effectData, "flags.core.statusId", coreStatusId);
                                if (effectItem.system.type === "attribute" && effectItem.system.path) {
                                    const normalizedPath = normalizeEffectPath(effectItem.system.path);
                                    let computedValue = evaluateEffectValue(effectItem.system.value);
                                    if (effectItem.system.operation === "SUB") {
                                        computedValue = -Math.abs(Number(computedValue) || 0);
                                    }
                                    const mode = (effectItem.system.operation === "OVERRIDE" || effectItem.system.operation === "SET")
                                        ? CONST.ACTIVE_EFFECT_MODES.OVERRIDE
                                        : CONST.ACTIVE_EFFECT_MODES.ADD;
                                    effectData.changes.push({
                                        key: normalizedPath,
                                        mode,
                                        value: computedValue
                                    });
                                }
                                if (effectItem.system.type === "roll_modifier") {
                                    effectData.flags.gum.rollModifier = {
                                        value: effectItem.system.roll_modifier_value ?? effectItem.system.value ?? 0,
                                        cap: effectItem.system.roll_modifier_cap ?? "",
                                        context: effectItem.system.roll_modifier_context ?? "all"
                                    };
                                }
                                if (effectItem.system.type === "status" && effectItem.system.statusId) {
                                    effectData.statuses.push(effectItem.system.statusId);
                                }
                                await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
                            }
                        }
                     }
                 } else { // Condição acabou de DESLIGAR
                     for (const link of effectLinks) {
                        if(!link.uuid) continue;
                        const effectItem = await fromUuid(link.uuid);
                        if (!effectItem?.system) continue;

                        // Remove Flag (se for do tipo flag)
                        if (effectItem.system.type === "flag" && effectItem.system.key) {
                             await actor.unsetFlag("gum", effectItem.system.key);
                        }
                         if (["attribute", "roll_modifier", "status"].includes(effectItem.system.type)) {
                            const effectsToRemove = actor.effects.filter((effect) =>
                                effect?.flags?.gum?.conditionId === condition.id
                                && effect?.flags?.gum?.effectUuid === effectItem.uuid
                            );
                            if (effectsToRemove.length) {
                                await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToRemove.map(effect => effect.id));
                            }
                        }
                        // Outras ações de "desligar" poderiam ir aqui no futuro
                     }
                 }
             } // Fim do if (stateChanged)
        } // Fim do loop de Conditions

        // Nenhuma lógica de sincronização de ícones ('toggleStatusEffect') aqui.

    } finally {
        evaluatingActors.delete(actor.id); // Libera o ator para a próxima avaliação
    }
}

/**
 * Gerencia a duração de ActiveEffects baseados em rodadas/turnos de combate. (Versão Final e Funcional)
 * @param {Actor} actor O ator do combatente cujo turno terminou.
 */
async function manageActiveEffectDurations(actor) {
    if (!actor || !game.combat) return;
    const effectsToDelete = [];
    const effectsToUpdate = [];
    const currentRound = game.combat.round;
    const currentTurn = game.combat.turn ?? 0;
    const totalTurns = Math.max(game.combat.turns?.length || 1, 1);
    const currentWorldTime = game.time?.worldTime || 0;
    for (const effect of actor.effects) {
        const duration = effect.duration;
        if (!duration) continue;

        const updateData = { _id: effect.id };
        const gumDuration = foundry.utils.getProperty(effect, "flags.gum.duration") || {};

        // Se o efeito foi marcado como "apenas em combate" no item original e ainda não
        // possui valores de duração aplicados pelo Foundry, convertemos agora.
        if (!duration.rounds && !duration.turns && !duration.seconds && gumDuration.value) {
            const fallbackValue = parseInt(gumDuration.value) || 1;
            const unit = gumDuration.unit || "rounds";

            if (gumDuration.inCombat) {
                if (unit === "turns") {
                    updateData["duration.turns"] = fallbackValue;
                } else {
                    updateData["duration.rounds"] = fallbackValue;
                }
                updateData["duration.combat"] = game.combat.id;
            } else {
                if (unit === "seconds") {
                    updateData["duration.seconds"] = fallbackValue;
                } else if (unit === "minutes") {
                    updateData["duration.seconds"] = fallbackValue * 60;
                } else if (unit === "hours") {
                    updateData["duration.seconds"] = fallbackValue * 60 * 60;
                } else if (unit === "days") {
                    updateData["duration.seconds"] = fallbackValue * 60 * 60 * 24;
                } else {
                    // Default para efeitos sem flag de combate: trata como rodadas em combate
                    updateData["duration.rounds"] = fallbackValue;
                }
            }
        }

        let startRound = duration.startRound;
        if (startRound == null) {
            startRound = currentRound;
            updateData["duration.startRound"] = startRound;
        }

        let startTurn = duration.startTurn;
        if (startTurn == null) {
            startTurn = currentTurn;
            updateData["duration.startTurn"] = startTurn;
        }

        let startTime = duration.startTime;
        if (startTime == null) {
            startTime = currentWorldTime;
            updateData["duration.startTime"] = startTime;
        }

        // Expiração por rodadas
        if (duration.rounds) {
            const isExpired = currentRound >= startRound + duration.rounds;
            if (isExpired) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        // Expiração por turnos
        if (duration.turns) {
            const turnsElapsed = (currentRound - startRound) * totalTurns + (currentTurn - startTurn);
            if (turnsElapsed >= duration.turns) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        // Expiração por tempo (segundos)
        if (duration.seconds) {
            const isExpired = currentWorldTime >= startTime + duration.seconds;
            if (isExpired) effectsToDelete.push(effect.id);
            else if (Object.keys(updateData).length > 1) effectsToUpdate.push(updateData);
            continue;
        }

        if (Object.keys(updateData).length > 1) {
            effectsToUpdate.push(updateData);
        }
    }
    if (effectsToUpdate.length > 0) {
        await actor.updateEmbeddedDocuments("ActiveEffect", effectsToUpdate);
    }
    if (effectsToDelete.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
    }
}
/**
 * Gerencia a duração de condições baseadas em rodadas de combate a cada turno.
 * @param {Combat} combat O objeto de combate que foi atualizado.
 */
async function manageDurations(combat) {
    // Pega o combatente cujo turno ACABOU DE TERMINAR.
    const combatant = combat.previous.combatantId ? combat.combatants.get(combat.previous.combatantId) : null;
    if (!combatant?.actor) return; // Se não houver um combatente anterior, não faz nada.

    const actor = combatant.actor;
    const itemsToDelete = [];
    const itemsToDisable = [];
    const itemUpdates = [];

    for (const condition of actor.items.filter(i => i.type === 'condition')) {
        const duration = condition.system.duration;

        // Pula condições que não têm duração finita em rodadas.
        if (!duration || duration.unit !== 'rounds' || duration.value <= 0) continue;

        const newValue = duration.value - 1;

        if (newValue <= 0) {
            // O tempo acabou! Decide o que fazer com base na escolha do usuário.
            if (duration.expiration === 'disable') {
                itemsToDisable.push(condition.id);
            } else { // O padrão é sempre deletar
                itemsToDelete.push(condition.id);
            }
        } else {
            // Se o tempo ainda não acabou, apenas prepara a atualização do valor.
            itemUpdates.push({ _id: condition.id, 'system.duration.value': newValue });
        }
    }

    // Aplica todas as atualizações de duração de uma só vez para melhor performance.
    if (itemUpdates.length > 0) {
        await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }

    if (itemsToDisable.length > 0) {
        console.log(`GUM | Desativando condições expiradas de ${actor.name}:`, itemsToDisable);
        // Pega os itens para desativar e seta a flag `manual_override` para 'true'
        const disableUpdates = itemsToDisable.map(id => {
            return { _id: id, 'flags.gum.manual_override': true, 'system.duration.value': 0 };
        });
        await actor.updateEmbeddedDocuments("Item", disableUpdates);
    }

    if (itemsToDelete.length > 0) {
        console.log(`GUM | Removendo condições expiradas de ${actor.name}:`, itemsToDelete);
        await actor.deleteEmbeddedDocuments("Item", itemsToDelete);
    }
}

/**
 * Aplica um Item de Condição em um ator alvo com base em um Efeito Contingente.
 * Esta é uma função auxiliar reutilizável.
 * @param {Actor} targetActor - O ator que receberá a condição.
 * @param {object} contingentEffect - O objeto do Efeito Contingente que está sendo executado.
 * @param {object} eventContext - O contexto do evento (dano, etc.) para modificadores dinâmicos.
 */
export async function applyContingentCondition(targetActor, contingentEffect, eventContext = {}) {

    // Garante que temos um 'payload' (o link para a condição)
    if (!contingentEffect.payload) {
        console.warn("GUM | Efeito Contingente tentou aplicar uma condição sem um 'payload' (UUID do item).");
        return;
    }

    // Carrega o item de condição "molde" a partir do seu UUID
    const conditionItem = await fromUuid(contingentEffect.payload);
    if (!conditionItem) {
        ui.notifications.warn(`Item de Condição com UUID "${contingentEffect.payload}" não encontrado.`);
        return;
    }

    console.log(`GUM | Ação Final: Aplicando ${conditionItem.name} em ${targetActor.name}`);
    
    // Cria uma cópia dos dados do item para não modificar o original do compêndio
    const newConditionData = conditionItem.toObject();

    // FUTURAMENTE: Aqui é onde a lógica para processar o array 'dynamic' entraria,
    // modificando o 'newConditionData' antes de criá-lo no ator. Por exemplo,
    // alterando a duração ou o valor de um efeito interno.

    // Cria o novo item de condição na ficha do ator alvo.
    await targetActor.createEmbeddedDocuments("Item", [newConditionData]);
    ui.notifications.info(`${targetActor.name} foi afetado por: ${conditionItem.name}!`);
}

// ================================================================== //
//  HOOK DO ESCUDO DO MESTRE (GM SCREEN) - BLINDADO PARA V13
// ================================================================== //

Hooks.on("getSceneControlButtons", (controls) => {
    // 1. Verificação de Segurança
    if (!game.user.isGM) return;

    let targetLayer = null;

    // 2. BUSCA DA CAMADA (Suporta V12 Array e V13 Object/Map)
    
    // Tenta acesso direto por chave (comum em V13 Objetos)
    if (controls.tokens) targetLayer = controls.tokens;
    else if (controls.token) targetLayer = controls.token;
    
    // Se não achou, tenta acesso por Mapa (Map)
    else if (controls instanceof Map) {
        targetLayer = controls.get("tokens") || controls.get("token");
    }
    
    // Se não achou, tenta iterar (Array ou Object.values)
    else {
        const list = Array.isArray(controls) ? controls : Object.values(controls);
        targetLayer = list.find(c => c.name === "tokens" || c.name === "token");
    }

    // 3. SE AINDA NÃO ACHOU, LOGA O ERRO E PARA
    if (!targetLayer) {
        console.error("GUM | ERRO CRÍTICO: Não foi possível encontrar a camada de Tokens. Estrutura recebida:", controls);
        return;
    }

    // 4. DEFINIÇÃO DA FERRAMENTA
    const gmScreenTool = {
        name: "gm-screen",
        title: "Escudo do Mestre (GUM)",
        icon: "fas fa-book-open",
        visible: true,
        onClick: () => {
            // Lógica Singleton
            if (game.gum.gmScreen) {
                game.gum.gmScreen.render(true);
            } else {
                game.gum.gmScreen = new GumGMScreen();
                game.gum.gmScreen.render(true);
            }
        },
        button: true
    };

    // 5. INJEÇÃO SEGURA NA LISTA DE FERRAMENTAS
    const toolsCollection = targetLayer.tools;

    if (Array.isArray(toolsCollection)) {
        // V12: É um Array
        toolsCollection.push(gmScreenTool);
    } 
    else if (toolsCollection instanceof Map) {
        // V13 (Possível): É um Map
        toolsCollection.set("gm-screen", gmScreenTool);
    } 
    else if (typeof toolsCollection === 'object') {
        // V13 (Provável): É um Objeto
        // Verifica se já existe para evitar loop
        if (!toolsCollection["gm-screen"]) {
            toolsCollection["gm-screen"] = gmScreenTool;
        }
    } 
    else {
        console.error("GUM | Formato desconhecido para 'layer.tools':", toolsCollection);
    }
});

// ================================================================== //
//  HOOKS DE ATUALIZAÇÃO DO ESCUDO DO MESTRE (GM SCREEN)
// ================================================================== //

// Função auxiliar para renderizar apenas se aberto
function refreshGMScreen() {
    if (game.gum && game.gum.gmScreen && game.gum.gmScreen.rendered) {
        game.gum.gmScreen.render(false);
    }
}

// 1. MUDANÇAS NO COMBATE (Turno, Rodada, Ativação)
Hooks.on("updateCombat", refreshGMScreen);

// 2. CRIAÇÃO E FIM DE COMBATE (Para limpar/popular a lista)
Hooks.on("createCombat", refreshGMScreen);
Hooks.on("deleteCombat", refreshGMScreen); // ✅ Resolve o problema da lista não limpar

// 3. MUDANÇAS NOS ATORES (HP, FP, Flags de Modificadores)
Hooks.on("updateActor", (actor) => {
    // Renderiza se for PJ ou se houver um combate rolando (para monstros)
    if (actor.hasPlayerOwner || game.combat) {
        refreshGMScreen();
    }
});

// 4. MUDANÇAS NOS TOKENS (Para garantir sincronia visual imediata)
Hooks.on("updateToken", (tokenDocument) => {
    if (game.combat) refreshGMScreen();
});

// 5. MUDANÇAS NA CENA (Adicionar/Remover tokens)
Hooks.on("canvasReady", refreshGMScreen); // Quando muda de mapa