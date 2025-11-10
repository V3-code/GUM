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

// ================================================================== //
//  ✅ CLASSE DO ATOR (NOVA)
// ================================================================== //
class GurpsActor extends Actor {
    
    /**
     * @override
     * Esta é a função principal do Foundry para preparar os dados do ator.
     * Ela é chamada automaticamente sempre que os dados do ator são acessados,
     * garantindo que .final esteja sempre calculado (mesmo com a ficha fechada).
     */
    prepareData() {
        super.prepareData();
        // Chama nossa lógica de cálculo
        this._prepareCharacterItems(); 
    }

    /**
     * Esta é a sua lógica de _prepareCharacterItems, movida da Ficha para o Ator.
     * As referências a 'sheetData.actor' foram trocadas por 'this'.
     */
    _prepareCharacterItems() {
        // 'actorData' agora é 'this'
        // 'attributes' agora é 'this.system.attributes'
        const actorData = this; 
        const attributes = actorData.system.attributes;
        const combat = actorData.system.combat;

        // --- ETAPA 1: ZERAR MODIFICADORES TEMPORÁRIOS E OVERRIDES ---
        // (O código original de _prepareCharacterItems,)
        const allAttributes = [
            'st', 'dx', 'iq', 'ht', 'vont', 'per', 'hp', 'fp',
            'mt', 'basic_speed', 'basic_move', 'lifting_st', 'dodge'
        ];
        allAttributes.forEach(attr => {
            if (attributes[attr]) {
                attributes[attr].temp = 0;
                attributes[attr].override = null;
            }
        });
        if (combat.dr_temp_mods) {
            for (const key in combat.dr_temp_mods) combat.dr_temp_mods[key] = 0;
        }

        // --- ETAPA 2: MOTOR DE CONDIÇÕES (ACUMULA MODIFICADORES) ---
        // (O código original de _prepareCharacterItems,)
        const add_sub_modifiers = {};
        const set_modifiers = {};
        // 'this.actor.items' vira 'this.items'
        const conditions = this.items.filter(i => i.type === "condition"); 
        for (const condition of conditions) {
            if (condition.getFlag("gum", "manual_override")) continue;
            let isConditionActive = false;
            try {
                // 'this.actor' vira 'this'
                isConditionActive = !condition.system.when || Function("actor", "game", "eventData", `return ( ${condition.system.when} )`)(this, game, null); 
            } catch (e) {
                console.warn(`GUM | Erro na regra da condição "${condition.name}":`, e);
            }
            if (isConditionActive) {
                const effects = Array.isArray(condition.system.effects) ? condition.system.effects : Object.values(condition.system.effects || {});
                for (const effect of effects) {
                    if (effect.type === 'attribute' && effect.path) {
                        let value = 0;
                        try {
                            // 'this.actor' vira 'this'
                            value = typeof effect.value === "string" ? new Function("actor", "game", `return (${effect.value});`)(this, game) : (Number(effect.value) || 0); 
                        } catch (e) {
                            console.warn(`GUM | Erro ao avaliar valor do efeito em "${condition.name}":`, e);
                        }
                        if (effect.operation === "SET") {
                            set_modifiers[effect.path] = value;
                        } else {
                            if (!add_sub_modifiers[effect.path]) add_sub_modifiers[effect.path] = 0;
                            if (effect.operation === "ADD") add_sub_modifiers[effect.path] += value;
                            else if (effect.operation === "SUB") add_sub_modifiers[effect.path] -= value;
                        }
                    } 
                }
            }
        }

        // --- ETAPA 3: APLICAR MODIFICADORES DE SOMA/SUBTRAÇÃO ---
        // (O código original de _prepareCharacterItems,)
        for (const path in add_sub_modifiers) {
            // 'actorData' vira 'this'
            const currentVal = foundry.utils.getProperty(this, path) || 0; 
            foundry.utils.setProperty(this, path, currentVal + add_sub_modifiers[path]);
        }

        // --- ETAPA 4: CÁLCULOS INTERMEDIÁRIOS (FINAL_COMPUTED) ---
        // (O código original de _prepareCharacterItems,)
        for (const attr of allAttributes) {
            if (attributes[attr] && !['hp', 'fp'].includes(attr)) {
                attributes[attr].final_computed = (Number(attributes[attr].value) || 0) + (Number(attributes[attr].mod) || 0) + (Number(attributes[attr].temp) || 0);
            }
        }
        for (const pool of ["hp", "fp"]) {
            if (attributes[pool]) {
                attributes[pool].final_computed = (Number(attributes[pool].max) || 0) + (Number(attributes[pool].mod) || 0) + (Number(attributes[pool].temp) || 0);
            }
        }

        // (O código original de _prepareCharacterItems,)
        const liftingST = attributes.lifting_st.final_computed;
        const basicLift = (liftingST * liftingST) / 10;
        attributes.basic_lift = { value: basicLift };

        // (O código original de _prepareCharacterItems,)
        let totalWeight = 0;
        // 'actorData' vira 'this'
        const ignoreCarried = this.system.encumbrance.ignore_carried_weight;
        // 'sheetData.actor.items' vira 'this.items'
        for (let i of this.items) { 
            if ((['equipment', 'armor'].includes(i.type) || i.system.hasOwnProperty('weight')) && i.system.weight) {
                const loc = i.system.location;
                if (loc === 'equipped' || (loc === 'carried' && !ignoreCarried)) {
                    totalWeight += (i.system.weight || 0) * (i.system.quantity || 1);
                }
            }
        }

        // (O código original de _prepareCharacterItems,)
        let enc = { level_name: "Nenhuma", level_value: 0, penalty: 0 };
        if (totalWeight > basicLift * 6) enc = { level_name: "M. Pesada", level_value: 4, penalty: -4 };
        else if (totalWeight > basicLift * 3) enc = { level_name: "Pesada", level_value: 3, penalty: -3 };
        else if (totalWeight > basicLift * 2) enc = { level_name: "Média", level_value: 2, penalty: -2 };
        else if (totalWeight > basicLift) enc = { level_name: "Leve", level_value: 1, penalty: -1 };
        
        // (O código original de _prepareCharacterItems,)
        // 'actorData' vira 'this'
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
        
        // (O código original de _prepareCharacterItems,, l. 1155-1159])
        // 'actorData' vira 'this'
        const levels = this.system.encumbrance.levels; 
        this.system.encumbrance.level_data = [ 
            { name: 'Nenhuma', max: levels.none }, { name: 'Leve', max: levels.light },
            { name: 'Média', max: levels.medium }, { name: 'Pesada', max: levels.heavy },
            { name: 'M. Pesada', max: levels.xheavy }
        ];

        // (O código original de _prepareCharacterItems,, l. 1161-1164])
        const finalBasicSpeedComputed = attributes.basic_speed.final_computed;
        attributes.dodge.value = Math.floor(finalBasicSpeedComputed) + 3;
        attributes.dodge.final_computed = attributes.dodge.value + enc.penalty + (attributes.dodge.mod || 0) + (attributes.dodge.temp || 0);
        attributes.basic_move.final_computed = Math.floor(attributes.basic_move.final_computed * (1 - (enc.level_value * 0.2)));

        // --- ETAPA 5: APLICAR MODIFICADORES DE "SET" (OVERRIDE) ---
        // (O código original de _prepareCharacterItems,)
        for (const path in set_modifiers) {
            // 'actorData' vira 'this'
            foundry.utils.setProperty(this, path, set_modifiers[path]); 
        }

        // --- ETAPA 6: CÁLCULO FINALÍSSIMO (FINAL) ---
        // (O código original de _prepareCharacterItems,)
        for (const attr of allAttributes) {
            if (attributes[attr]) {
                const override = attributes[attr].override;
                attributes[attr].final = (override !== null && override !== undefined) ? override : attributes[attr].final_computed;
            }
        }

// --- Cálculos Finais (DR, NH) ---
        
        /**
         * Função auxiliar para somar os valores de dois objetos de RD.
         * Ex: _mergeDRObjects({base: 5, cont: 2}, {base: 1, qmd: 3})
         * Resultado: {base: 6, cont: 2, qmd: 3}
         */
        function _mergeDRObjects(target, source) {
            if (!source || typeof source !== 'object') {
                // Failsafe para dados antigos (trata números como 'base')
                const value = Number(source) || 0;
                if (value > 0) {
                    target.base = (target.base || 0) + value;
                }
                return;
            }
            // Adiciona os valores do objeto fonte no objeto alvo
            for (const [type, value] of Object.entries(source)) {
                target[type] = (target[type] || 0) + (Number(value) || 0);
            }
        }

        // 1. Inicializa os acumuladores de RD como objetos vazios
        const drFromArmor = { 
            head:{}, torso:{}, vitals:{}, groin:{}, face:{}, eyes:{}, neck:{}, 
            arm_l:{}, arm_r:{}, hand_l:{}, hand_r:{}, leg_l:{}, leg_r:{}, foot_l:{}, foot_r:{} 
        };
        
        // 2. Acumula RD das Armaduras
        for (let i of this.items) { 
            if (i.type === 'armor' && i.system.location === 'equipped') {
                const itemDrLocations = i.system.dr_locations || {};
                for (let loc in drFromArmor) {
                    // Soma os objetos de RD
                    _mergeDRObjects(drFromArmor[loc], itemDrLocations[loc]);
                }
            }
        }
        
        // 3. Acumula RD de Modificadores (Manuais e Temporários)
        const totalDr = {};
        const drMods = combat.dr_mods || {}; // Agora esperamos que isto seja { torso: { base: 1 } }
        const drTempMods = combat.dr_temp_mods || {}; // E isto também { torso: { qmd: 3 } }
        
        for (let key in drFromArmor) {
            totalDr[key] = {}; // Começa o total como um objeto vazio
            _mergeDRObjects(totalDr[key], drFromArmor[key]); // Adiciona Armadura
            _mergeDRObjects(totalDr[key], drMods[key]);      // Adiciona Mods Manuais
            _mergeDRObjects(totalDr[key], drTempMods[key]); // Adiciona Mods Temporários
        }
        
        combat.dr_locations = totalDr; // Salva o objeto final
        combat.dr_from_armor = drFromArmor; // Salva o objeto só da armadura

        // (O código original de _prepareCharacterItems,, l. 1201-1221])
        // 'sheetData.actor.items' vira 'this.items'
        for (let i of this.items) { 
            if (['skill', 'spell', 'power'].includes(i.type)) {
                try {
                    const defAttr = (i.type === 'skill') ? 'dx' : 'iq';
                    let baseAttr = (i.system.base_attribute || defAttr).toLowerCase();
                    let attrVal = 10;
                    if (attributes[baseAttr]?.final !== undefined) {
                        attrVal = attributes[baseAttr].final;
                    } else if (!isNaN(Number(baseAttr))) {
                        attrVal = Number(baseAttr);
                    } else {
                        // 'sheetData.actor.items' vira 'this.items'
                        const refSkill = this.items.find(s => s.type === 'skill' && s.name?.toLowerCase() === baseAttr); 
                        if (refSkill) attrVal = refSkill.system.final_nh;
                    }
                    i.system.final_nh = attrVal + (i.system.skill_level || 0) + (i.system.other_mods || 0);
                } catch (e) {
                    console.error(`GUM | Erro ao calcular NH para o item ${i.name}:`, e);
                }
            }
        }
    }
} // Fim da nova classe GurpsActor

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
//  ✅ FUNÇÃO DE ROLAGEM GLOBAL E REUTILIZÁVEL ✅
// ================================================================== //
export async function performGURPSRoll(element, actor, situationalMod = 0) {
    const itemId = element.dataset.itemId;
    const item = itemId ? actor.items.get(itemId) : null;
    const label = element.dataset.label;
    const attrKey = element.dataset.attributeKey;
    let attributeData = attrKey ? actor.system.attributes[attrKey] : null;

    let baseTargetForChat = 0;
    let tempModForChat = 0;
    let finalTargetForRoll = 0;

    if (attributeData) {
        if (attributeData.final_computed !== undefined) {
            attributeData = {
                ...attributeData,
                value: attributeData.final_computed,
                mod: 0,
                temp: 0,
                override: null
            };
        }
        const baseValue = Number(attributeData.value) || 0;
        const fixedMod = Number(attributeData.mod) || 0;
        const tempMod = Number(attributeData.temp) || 0;
        const override = attributeData.override;
        const final = (override !== undefined && override !== null)
            ? override
            : baseValue + fixedMod + tempMod;
        baseTargetForChat = baseValue + fixedMod;
        tempModForChat = tempMod;
        finalTargetForRoll = final;
    } else {
        finalTargetForRoll = parseInt(element.dataset.rollValue);
        baseTargetForChat = finalTargetForRoll;
        tempModForChat = 0;
    }

    const finalTarget = finalTargetForRoll + situationalMod;
    const chatModifier = tempModForChat + situationalMod;
    const roll = new Roll("3d6");
    await roll.evaluate();

    const margin = finalTarget - roll.total;
    let resultText = "";
    let resultClass = "";
    let resultIcon = "";
    let outcome = ""; // Variável para guardar 'success' ou 'failure'

    if (roll.total <= finalTarget) {
        resultText = `Sucesso com margem de ${margin}`;
        resultClass = 'success';
        resultIcon = 'fas fa-check-circle';
        outcome = 'success';
    } else {
        resultText = `Fracasso por uma margem de ${-margin}`;
        resultClass = 'failure';
        resultIcon = 'fas fa-times-circle';
        outcome = 'failure';
    }

    if (roll.total <= 4 || (roll.total <= 6 && margin >= 10)) {
        resultText = `Sucesso Crítico!`;
    } else if (roll.total === 17 || roll.total === 18 || (roll.total === 16 && margin <= -10)) {
        resultText = `Falha Crítica!`;
    }

    const diceHtml = roll.dice[0].results.map(r => `<span class="die">${r.result}</span>`).join('');
    const flavor = `
        <div class="gurps-roll-card">
            <header class="card-header"><h3>${label}</h3></header>
            <div class="card-content">
                <div class="card-main-flex">
                    <div class="roll-column">
                        <div class="roll-total-value">${roll.total}</div>
                        <div class="individual-dice">${diceHtml}</div>
                    </div>
                    <div class="column-separator"></div>
                    <div class="target-column">
                        <div class="roll-target-value">${finalTarget}</div>
                        <div class="roll-breakdown-pill">
                            <span>Base: ${baseTargetForChat} &nbsp;|&nbsp; Mod: ${chatModifier >= 0 ? '+' : ''}${chatModifier}</span>
                        </div>
                    </div>
                </div>
            </div>
            <footer class="card-footer ${resultClass}">
                <i class="${resultIcon}"></i> <span>${resultText}</span>
            </footer>
        </div>
    `;

    // ✅ PASSO 1: A MENSAGEM DO CHAT AGORA É CRIADA PRIMEIRO.
    // Usamos 'await' para garantir que ela seja enviada antes de continuarmos.
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: flavor,
        rolls: [roll]
    });

    // ✅ PASSO 2: SÓ DEPOIS DE A MENSAGEM ESTAR NO CHAT, CHAMAMOS OS EFEITOS.
    // Isso fará com que as janelas de diálogo apareçam depois do resultado da rolagem.
    if (item) {
        await applyActivationEffects(item, actor, outcome);
    }
}

/**
 * O "Despachante" de Efeitos de Ativação.
 * Pega os efeitos de sucesso/falha de um item e os envia para o "Motor" applySingleEffect.
 */
async function applyActivationEffects(item, actor, outcome) {
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

            await applySingleEffect(effectItem, finalTargets, { actor: actor, origin: item });
        }
    }
}

// ================================================================== //
//  2. HOOK DE INICIALIZAÇÃO (`init`)
// ================================================================== //
Hooks.once('init', async function() { 
    console.log("GUM | Fase 'init': Registrando configurações e fichas."); 
    game.gum = {};

    CONFIG.statusEffects = GUM.statusEffects;
    CONFIG.Actor.documentClass = GurpsActor;

    registerSystemSettings();
    
    // --- 2. LÊ A CONFIGURAÇÃO E APLICA NO SISTEMA DE COMBATE ---
    // ✅ A CORREÇÃO FINAL:
    // Nós lemos o *valor* da configuração que acabamos de registrar...
    const initiativeFormula = game.settings.get("gum", "initiativeFormula");
    
    // ...e passamos esse *valor* (a fórmula real) para o CONFIG.
    CONFIG.Combat.initiative = {
      formula: initiativeFormula, // Agora isto contém "@attributes.basic_speed.final..."
      decimals: 3 //
    };
    
    Actors.registerSheet("gum", GurpsActorSheet, { 
        types: ["character"], makeDefault: true 
    }); 
    Items.registerSheet("gum", GurpsItemSheet, { makeDefault: true }); 
    Items.registerSheet("gum", ConditionSheet, { 
        types: ["condition"], 
        makeDefault: true 
    });
    Items.registerSheet("gum", EffectSheet, { 
    types: ["effect"], 
    makeDefault: true 
    });
    Items.registerSheet("gum", TriggerSheet, { 
    types: ["trigger"], 
    makeDefault: true 
    });
    Items.registerSheet("gum", GurpsArmorSheet, { types: ["armor"], makeDefault: true, label: "Ficha de Armadura" });

    
    

    // ==================================================================
    // ▼▼▼ BLOCO DE HOOKS CENTRALIZADOS AQUI ▼▼▼
    // ==================================================================
    
    // ✅ HOOK DE CRIAÇÃO DE ATOR (IMPLEMENTAÇÃO DA IDEIA 4)
    Hooks.on("createActor", async (actor, options, userId) => {
        // Só executa para o usuário que criou o ator
        if (game.user.id !== userId) return;
        
        // Só executa se for um 'character' e se a configuração do mundo estiver ativada
        if (actor.type !== "character" || !game.settings.get("gum", "addDefaultRules")) { //
            return;
        }
    
        console.log(`GUM | Adicionando regras padrão ao novo ator: ${actor.name}`);
    
        // Pega o compêndio. O ID 'Regras' do system.json é prefixado com o ID do sistema 'gum'.
        const pack = game.packs.get("gum.Regras"); //
        if (!pack) {
            return ui.notifications.warn("Compêndio de regras padrão [GUM] Regras (gum.Regras) não encontrado.");
        }
    
        // Carrega todos os itens do compêndio
        const rules = await pack.getDocuments();
        if (!rules || rules.length === 0) {
            console.log("GUM | Compêndio de regras padrão está vazio. Nenhum item adicionado.");
            return;
        }
    
        // Prepara os dados do item para criar "links" (não cópias)
        // Usamos o "sourceId" para criar um vínculo. Isso garante que o item
        // no ator seja sempre atualizado quando o item no compêndio mudar.
        const newRulesData = rules.map(item => {
            // 1. Pega os dados do item (nome, img, system)
            const itemData = item.toObject();

            // 2. Adiciona o vínculo usando o método moderno _stats.compendiumSource
            //    Isso substitui o antigo 'flags.core.sourceId'
            itemData._stats = {
                compendiumSource: item.uuid
            };

            // 3. Remove a flag antiga (se existir) para evitar o aviso
            if (itemData.flags?.core?.sourceId) {
                delete itemData.flags.core.sourceId;
            }

            return itemData;
        });

        // Adiciona os itens (com seus dados E o vínculo moderno) ao ator
        try {
            await actor.createEmbeddedDocuments("Item", newRulesData);
            console.log(`GUM | ${newRulesData.length} regras padrão (V12+) adicionadas a ${actor.name}.`);
        } catch (err) {
            console.error("GUM | Falha ao adicionar regras padrão:", err);
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
                                effectUuid: effectItem.uuid 
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
                            activeEffectData.duration.combat = game.combat?.id;
                        } else if (unit === 'rounds' || unit === 'seconds') {
                            activeEffectData.duration.rounds = value;
                        } else if (unit === 'minutes') {
                            activeEffectData.duration.seconds = value * 60;
                        } else if (unit === 'hours') {
                            activeEffectData.duration.seconds = value * 60 * 60;
                        } else if (unit === 'days') {
                            activeEffectData.duration.seconds = value * 60 * 60 * 24;
                        }
                        if (unit !== 'turns' && effectSystem.duration.inCombat && game.combat) {
                            activeEffectData.duration.combat = game.combat.id;
                        }
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
                            flags: { gum: { originItemId: item.id, effectUuid: effectItem.uuid } }
                        };

                        if (effectSystem.duration && !effectSystem.duration.isPermanent) {
                            activeEffectData.duration = {};
                            const value = parseInt(effectSystem.duration.value) || 1;
                            const unit = effectSystem.duration.unit;
                            if (unit === 'turns') {
                                activeEffectData.duration.turns = value;
                                activeEffectData.duration.combat = game.combat?.id;
                            } else if (unit === 'rounds' || unit === 'seconds') {
                                activeEffectData.duration.rounds = value;
                            } else if (unit === 'minutes') {
                                activeEffectData.duration.seconds = value * 60;
                            } else if (unit === 'hours') {
                                activeEffectData.duration.seconds = value * 60 * 60;
                            } else if (unit === 'days') {
                                activeEffectData.duration.seconds = value * 60 * 60 * 24;
                            }
                            if (unit !== 'turns' && effectSystem.duration.inCombat && game.combat) {
                                activeEffectData.duration.combat = game.combat.id;
                            }
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
        if (!game.user.isGM) return;

        // --- Lógica de Início de Turno ---
        if (changed.round !== undefined || (changed.turn !== undefined && combat.combatant)) {
            const currentCombatant = combat.combatant;
            if (currentCombatant?.actor) {
                await processConditions(currentCombatant.actor); // Espera
                currentCombatant.token?.object?.drawEffects(); // Força redesenho (se token visível)
            }
        }

        // --- Lógica de Fim de Turno ---
        if (changed.turn !== undefined && combat.previous.combatantId) {
            const previousCombatant = combat.combatants.get(combat.previous.combatantId);
            if (previousCombatant?.actor) {
                const actor = previousCombatant.actor;
                await manageActiveEffectDurations(actor); // Gerencia ActiveEffects
                await manageDurations(combat); // Gerencia Items
                // Re-processa condições caso a expiração tenha mudado algo
                await processConditions(actor); // Espera
                // Força redesenho dos tokens do ator que acabou de ter efeitos expirados
                actor.getActiveTokens().forEach(token => token.drawEffects()); 
            }
        }
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
    

 $('body').on('click', '.chat-message .rollable', async (ev) => {
        const element = ev.currentTarget;
        const speaker = ChatMessage.getSpeaker({ scene: $(element).closest('.message').data('scene-id'), actor: $(element).closest('.message').data('actor-id') });
        const actor = ChatMessage.getSpeakerActor(speaker);
        if (!actor) return ui.notifications.warn("Ator da mensagem de chat não encontrado.");
        
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
                            performGURPSRoll(element, actor, situationalMod);
                        }
                    }
                }
            }).render(true);
        } else {
            performGURPSRoll(element, actor, 0);
        }
    });

// ==========================================================
// LISTENER FINAL E ÚNICO PARA O BOTÃO DE RESISTÊNCIA
// ==========================================================

$('body').on('click', '.resistance-roll-button', async ev => {
    ev.preventDefault();
    const button = ev.currentTarget;
    button.disabled = true;

    // Acessa o pacote de dados completo
    const rollData = JSON.parse(button.dataset.rollData);
    
    // ✅ CORREÇÃO AQUI: Lemos o 'effectItemData' completo que salvamos antes.
    const { targetActorId, finalTarget, effectItemData, sourceName, effectLinkId } = rollData;

    const targetActor = game.actors.get(targetActorId);
    if (!targetActor) return;

    const roll = new Roll("3d6");
    await roll.evaluate();

    const margin = finalTarget - roll.total;
    const success = roll.total <= finalTarget;
    let resultText = success ? `Sucesso com margem de ${margin}` : `Fracasso por uma margem de ${-margin}`;
    let resultClass = success ? 'success' : 'failure';
    let resultIcon = success ? 'fas fa-check-circle' : 'fas fa-times-circle';

    if (roll.total <= 4 || (roll.total <= 6 && margin >= 10)) { resultText = `Sucesso Crítico!`; }
    else if (roll.total >= 17 || (roll.total === 16 && margin <= -10)) { resultText = `Falha Crítica!`; }

    // Comunica o resultado de volta para a janela de dano
    if (game.gum.activeDamageApplication) {
        // ✅ CORREÇÃO AQUI: Passamos apenas o 'system' do efeito, que é o que a função espera.
        game.gum.activeDamageApplication.updateEffectCard(effectLinkId, {
            isSuccess: success,
            resultText: resultText
        }, effectItemData.system); // Passamos os dados do sistema como terceiro argumento
    }

    // Aplica o efeito no alvo
    // ✅ CORREÇÃO AQUI: Lemos a regra de 'resistanceRoll' de dentro do 'system'.
    const triggerOn = effectItemData.system.resistanceRoll.applyOn || 'failure';
    if ((triggerOn === 'failure' && !success) || (triggerOn === 'success' && success)) {
        // Usa o motor 'applySingleEffect' para consistência
        const effectItem = await Item.fromSource(effectItemData);
        const targetToken = targetActor.getActiveTokens()[0];
        if (effectItem && targetToken) {
            ui.notifications.info(`${targetActor.name} foi afetado por: ${effectItem.name}!`);
            await applySingleEffect(effectItem, [targetToken]);
        }
    }

    // Monta o card de resultado no chat
    const diceHtml = roll.dice[0].results.map(r => `<span class="die">${r.result}</span>`).join('');
    const flavor = `
        <div class="gurps-roll-card">
            <header class="card-header"><h3>Teste de Resistência: ${effectItemData.name || 'Teste'}</h3></header>
            <div class="card-content">
                <div class="card-main-flex">
                    <div class="roll-column"><div class="roll-total-value">${roll.total}</div><div class="individual-dice">${diceHtml}</div></div>
                    <div class="column-separator"></div>
                    <div class="target-column"><div class="roll-target-value">${finalTarget}</div><div class="roll-breakdown-pill"><span>Alvo: ${effectItemData.system.resistanceRoll.attribute.toUpperCase()}</span></div></div>
                </div>
            </div>
            <footer class="card-footer ${resultClass}"><i class="${resultIcon}"></i> <span>${resultText}</span></footer>
        </div>
    `;

    // Atualiza a mensagem original no chat
    const originalMessage = game.messages.get($(button).closest('.message').data('messageId'));
    if (originalMessage) {
        await originalMessage.update({ content: flavor, rolls: [JSON.stringify(roll)] });
    }
});

});


// ================================================================== //
//  3. HELPERS DO HANDLEBARS
// ================================================================== //
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

        // SOMA o modificador à base
        const finalDR = Math.max(0, baseDR + mod);
        
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
                                    const attr = foundry.utils.getProperty(actor.system.attributes, effectItem.system.roll_attribute);
                                    const finalAttr = attr?.final ?? 10;
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
    const currentRound = game.combat.round;
    for (const effect of actor.effects) {
        const duration = effect.duration;
        const isExpired = currentRound >= (duration.startRound || 0) + (duration.rounds || 0);
        if (duration.rounds && isExpired) {
            effectsToDelete.push(effect.id);
        }
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




