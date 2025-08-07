// ================================================================== //
//  1. IMPORTAÇÕES 
// ================================================================== //

import { ModifierBrowser } from "../module/apps/modifier-browser.js";
import { registerSystemSettings } from "../module/settings.js";
import DamageApplicationWindow from './apps/damage-application.js';
import { ConditionSheet } from "./apps/condition-sheet.js";

// ================================================================== //
//  ✅ FUNÇÃO DE ROLAGEM GLOBAL E REUTILIZÁVEL ✅ xzxzxz
// ================================================================== //
async function performGURPSRoll(element, actor, situationalMod = 0) {
    const label = element.dataset.label;
    const attrKey = element.dataset.attributeKey;
    let attributeData = attrKey ? actor.system.attributes[attrKey] : null;

    let baseTargetForChat = 0;
    let tempModForChat = 0;
    let finalTargetForRoll = 0;

    if (attributeData) {
        // ✅ Usa final_computed se disponível
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
        // ✅ Fallback para rolagens diretas com rollValue no HTML
        finalTargetForRoll = parseInt(element.dataset.rollValue);
        baseTargetForChat = finalTargetForRoll;
        tempModForChat = 0;
    }

    const finalTarget = finalTargetForRoll + situationalMod;
    const chatModifier = tempModForChat + situationalMod;

    const roll = new Roll("3d6");
    await roll.evaluate(); // 🔧 Corrigido: .evaluate sem 'async: true'

    const margin = finalTarget - roll.total;
    let resultText = "";
    let resultClass = "";
    let resultIcon = "";

    if (roll.total <= finalTarget) {
        resultText = `Sucesso com margem de ${margin}`;
        resultClass = 'success';
        resultIcon = 'fas fa-check-circle';
    } else {
        resultText = `Fracasso por uma margem de ${-margin}`;
        resultClass = 'failure';
        resultIcon = 'fas fa-times-circle';
    }

    // Sucessos e falhas críticas
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

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: flavor,
        rolls: [roll]
    });
}


// ================================================================== //
//  2. HOOK DE INICIALIZAÇÃO (`init`)
// ================================================================== //
Hooks.once('init', async function() { 
    console.log("GUM | Fase 'init': Registrando configurações e fichas."); 
    
    CONFIG.statusEffects = [
    { id: "dead", name: "Morto", img: "icons/svg/skull.svg" },
    { id: "unconscious", name: "Inconsciente", img: "icons/svg/unconscious.svg" },
    { id: "stun", name: "Atordoado (Stun)", img: "icons/svg/daze.svg" },
    { id: "prone", name: "Caído (Prone)", img: "icons/svg/falling.svg" },
    { id: "bleeding", name: "Sangrando", img: "icons/svg/blood.svg" },
    { id: "burning", name: "Em Chamas", img: "icons/svg/fire.svg" },
    { id: "poison", name: "Envenenado", img: "icons/svg/poison.svg" },
    { id: "blind", name: "Cego", img: "icons/svg/blind.svg" },
    { id: "deaf", name: "Surdo", img: "icons/svg/deaf.svg" },
    { id: "silenced", name: "Silenciado", img: "icons/svg/silenced.svg" },
    { id: "paralyzed", name: "Paralisado", img: "icons/svg/net.svg" }
];
    
    
    Actors.registerSheet("gum", GurpsActorSheet, { 
        types: ["character"], makeDefault: true 
    }); 
    Items.registerSheet("gum", GurpsItemSheet, { makeDefault: true }); 
    Items.registerSheet("gum", ConditionSheet, { 
        types: ["condition"], 
        makeDefault: true 
    });
    
    registerSystemSettings();
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
});

// ================================================================== //
//  3. HELPERS DO HANDLEBARS
// ================================================================== //
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

// FUNÇÕES EXTRAS

let evaluatingActors = new Set();

// ✅ MOTOR DE EVENTOS (MACRO, CHAT) ✅
async function evaluateEvents(actor, options = {}) {
    if (evaluatingActors.has(actor.id)) return;
    evaluatingActors.add(actor.id);
    try {
        const conditions = actor.items.filter(i => i.type === "condition");
        const updates = {};
        for (const condition of conditions) {
            const isManuallyDisabled = condition.getFlag("gum", "manual_override");
            const wasActive = condition.getFlag("gum", "wasActive") || false;
            let isConditionActive = false;
            if (!condition.system.when || condition.system.when.trim() === "") isConditionActive = true;
            else {
                try { isConditionActive = Function("actor", "game", `return ( ${condition.system.when} )`)(actor, game); }
                catch (e) { console.warn(`GUM | Erro na regra da condição "${condition.name}".`, e); }
            }
            const isEffectivelyActive = isConditionActive && !isManuallyDisabled;
            if (isEffectivelyActive !== wasActive) {
                updates[`flags.gum.conditionState.${condition.id}.wasActive`] = isEffectivelyActive;
            }
            const shouldTriggerEvent = (isEffectivelyActive && !wasActive) || (options.isTurnStart && isEffectivelyActive);
            if (shouldTriggerEvent) {
                const effects = Array.isArray(condition.system.effects) ? condition.system.effects : Object.values(condition.system.effects || {});
                for (const effect of effects) {
                    if (effect.type === "macro" && effect.value) {
                        const macro = game.macros.getName(effect.value);
                        if (macro) macro.execute({ actor });
                        else ui.notifications.warn(`Macro "${effect.value}" não encontrada.`);
                    }
                    else if (effect.type === "chat" && effect.chat_text) {
                        let content = effect.chat_text.replace(/{actor.name}/g, actor.name);
                        
                        if (effect.has_roll) {
                            let finalTarget = 0;
                            
                            // ✅ LÓGICA CORRIGIDA E EXPANDIDA ✅
                            if (effect.roll_attribute === 'fixed') {
                                finalTarget = Number(effect.roll_fixed_value) || 10;
                            } else if (effect.roll_attribute) {
                                // Busca a chave do atributo (ex: 'st') a partir do caminho (ex: 'st.final')
                                const attrKey = effect.roll_attribute.split('.')[0];
                                const attributes = actor.system.attributes;

                                // Calcula o valor final do atributo, exatamente como a ficha faz
                                const baseValue = Number(attributes[attrKey]?.value) || 0;
                                const tempValue = Number(attributes[attrKey]?.temp) || 0;
                                const calculatedFinal = baseValue + tempValue;

                                const modifier = Number(effect.roll_modifier) || 0;
                                finalTarget = calculatedFinal + modifier;
                            }

                            const label = effect.roll_label || `Rolar Teste`;
                            content += `<div style="text-align: center; margin-top: 10px;"><button class="rollable" data-roll-value="${finalTarget}" data-label="${label}">${label} (vs ${finalTarget})</button></div>`;
                        }
                        
                        const chatData = { speaker: ChatMessage.getSpeaker({ actor: actor }), content: content };
                        if (effect.whisperMode === 'gm') chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                        else if (effect.whisperMode === 'blind') chatData.blind = true;
                        ChatMessage.create(chatData);
                    }
                }
            }
        }
        if (Object.keys(updates).length > 0) await actor.update(updates);
    } finally {
        evaluatingActors.delete(actor.id);
    }
}


// ================================================================== //
//  HOOKS DE ITENS CONDIÇÃO 
// ================================================================== //

// ================================================================== //
// ✅ HOOKS DE ITENS DO TIPO CONDIÇÃO — COM ATUALIZAÇÃO COMPLETA ✅
// ================================================================== //

Hooks.on("createItem", (item, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.type === "condition" && item.parent?.isOwner) {
    item.parent.prepareData(); // Força recálculo dos atributos
    if (item.parent.sheet.rendered) item.parent.sheet.render(true);
  }
});

Hooks.on("updateItem", (item, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.type === "condition" && item.parent?.isOwner) {
    item.parent.prepareData();
    if (item.parent.sheet.rendered) item.parent.sheet.render(true);
  }
});

Hooks.on("deleteItem", (item, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.type === "condition" && item.parent?.isOwner) {
    item.parent.prepareData();
    if (item.parent.sheet.rendered) item.parent.sheet.render(true);
  }
});
Hooks.on("updateCombat", (combat, changed, options, userId) => {
  if (!game.user.isGM) return; // Apenas o GM precisa rodar isso normalmente
  if (changed.round || changed.turn) {
    const actor = combat.combatant?.actor;
    if (actor) {
      evaluateEvents(actor, { isTurnStart: true });
      actor.prepareData();
      if (actor.sheet.rendered) actor.sheet.render(true);
    }
  }
});

Hooks.on("deleteCombat", (combat, options, userId) => {
  if (!game.user.isGM) return;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (actor) {
      actor.prepareData();
      if (actor.sheet.rendered) actor.sheet.render(true);
    }
  }
});
// ================================================================== //
//  4. CLASSE DA FICHA DO ATOR (GurpsActorSheet)
// ================================================================== //

    class GurpsActorSheet extends ActorSheet {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          classes: ["gum", "sheet", "actor", "character"],
          template: "systems/gum/templates/actors/characters.hbs",
          width: 900,
          height: 800,
          tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attributes" }]
        });
      }

    async getData(options) {
        const context = await super.getData(options);
        this._prepareCharacterItems(context);
        context.hitLocations = {
        head: { label: "Crânio (-7)", roll: "3-4", penalty: -7 },
        face: { label: "Rosto (-5)", roll: "5", penalty: -5 },
        eyes: { label: "Olhos (-9)", roll: "--", penalty: -9 },
        neck: { label: "Pescoço (-5)", roll: "17-18", penalty: -5 },
        torso: { label: "Torso (0)", roll: "9-11", penalty: 0 },
        vitals: { label: "Órg. Vitais (-3)", roll: "--", penalty: -3 },
        groin: { label: "Virilha (-3)", roll: "11", penalty: -3 },
        arms: { label: "Braço (-2)", roll: "8, 12", penalty: -2 },
        hands: { label: "Mão (-4)", "roll": "15", penalty: -4 },
        legs: { label: "Perna (-2)", roll: "6-7, 13-14", penalty: -2 },
        feet: { label: "Pé (-4)", roll: "16", penalty: -4 }
        };

            
        // Prepara os novos Grupos de Ataque para serem exibidos na ficha
        const attackGroupsObject = this.actor.system.combat.attack_groups || {};
        context.attackGroups = Object.entries(attackGroupsObject)
          .map(([id, group]) => {
            // Para cada grupo, também preparamos seus ataques internos
            const attacks = group.attacks ? Object.entries(group.attacks).map(([attackId, attack]) => ({ ...attack, id: attackId })) : [];
            return { ...group, id: id, attacks: attacks };
          })
          .sort((a, b) => (a.sort || 0) - (b.sort || 0));

        // Agrupa todos os itens por tipo
        const itemsByType = context.actor.items.reduce((acc, item) => {
          const type = item.type;
          if (!acc[type]) acc[type] = [];
          acc[type].push(item);
          return acc;
        }, {});
        context.itemsByType = itemsByType;

        
    // --- LÓGICA FINAL PARA A ABA DE CONDIÇÕES ---
    
    // 1. Separa as condições em duas listas com base na categoria
    const allConditions = itemsByType.condition || [];
    context.generalConditions = allConditions.filter(c => c.system.category === 'general' || !c.system.category);
    context.temporaryConditions = allConditions.filter(c => c.system.category === 'temporary');

    // 2. ✅ LÓGICA CORRIGIDA PARA O SUMÁRIO DE "EFEITOS ATIVOS" ✅
    context.activeConditionsList = []; // Usaremos este novo nome
    for (const condition of allConditions) {
        // Pula a condição se o mestre a desabilitou manualmente
        if (condition.getFlag("gum", "manual_override")) continue;

        let isConditionActive = false;
        const whenClause = condition.system.when;

        // Avalia se a condição está ativa (incondicional ou a fórmula é verdadeira)
        if (!whenClause || whenClause.trim() === "") {
            isConditionActive = true;
        } else {
            try {
                isConditionActive = Function("actor", `return ( ${whenClause} )`)(this.actor);
            } catch (e) {
                // Ignora erros de avaliação aqui, simplesmente não ativa
                isConditionActive = false; 
            }
        }

        // Se a condição estiver ativa, adiciona à lista do sumário
        if (isConditionActive) {
            const effectsData = condition.system.effects || [];
            const effectsArray = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
            const tooltip = effectsArray.map(e => `${e.path}: ${e.value}`).join('; ');
            
            context.activeConditionsList.push({
                name: condition.name,
                img: condition.img,
                tooltip: tooltip
            });
        }
    }
    // --- FIM DA LÓGICA DE CONDIÇÕES ---
        context.generalConditions = allConditions.filter(c => c.system.category === 'general' || !c.system.category);
        context.temporaryConditions = allConditions.filter(c => c.system.category === 'temporary');


        // ================================================================== //
        //    FUNÇÃO AUXILIAR DE ORDENAÇÃO (PARA EVITAR REPETIÇÃO)            //
        // ================================================================== //
        const getSortFunction = (sortPref) => {
        return (a, b) => {
            switch (sortPref) {
                case 'name':
                    return (a.name || '').localeCompare(b.name || '');
                case 'spell_school':
                    return (a.system.spell_school || '').localeCompare(b.system.spell_school || '');
                case 'points':
                    return (b.system.points || 0) - (a.system.points || 0);
                case 'weight': 
                    return (b.system.total_weight || 0) - (a.system.total_weight || 0);
                case 'cost': 
                    return (b.system.total_cost || 0) - (a.system.total_cost || 0);
                case 'group': return (a.system.group || 'Geral').localeCompare(b.system.group || 'Geral');
                default:
                    return (a.sort || 0) - (b.sort || 0);
            }
        };
    };

    // ================================================================== //
        //    AGRUPAMENTO DE PERÍCIAS POR BLOCO ESTÁTICO                       //
        // ================================================================== //
        context.skillsByBlock = (itemsByType.skill || []).reduce((acc, skill) => {
          // Usa o block_id do item para agrupar. O padrão é 'block1'.
          const blockId = skill.system.block_id || 'block1';
          if (!acc[blockId]) {
            acc[blockId] = [];
          }
          acc[blockId].push(skill);
          return acc;
        }, {});
        
        // Ordena as perícias dentro de cada bloco
        const skillSortPref = this.actor.system.sorting?.skill || 'manual';
        for (const blockId in context.skillsByBlock) {
            context.skillsByBlock[blockId].sort(getSortFunction(skillSortPref));
        }

        // ================================================================== //
        //    ORDENAÇÃO DE LISTAS SIMPLES (MAGIAS E PODERES)                   //
        // ================================================================== //
        const simpleSortTypes = ['spell', 'power'];
        for (const type of simpleSortTypes) {
            if (itemsByType[type]) {
                const sortPref = this.actor.system.sorting?.[type] || 'manual';
                itemsByType[type].sort(getSortFunction(sortPref));
            }
        }
        context.itemsByType = itemsByType; // Salva os itens já ordenados no contexto

        // ================================================================== //
        //    AGRUPAMENTO E ORDENAÇÃO DE EQUIPAMENTOS                          //
        // ================================================================== //
        const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'armor'];
        const allEquipment = equipmentTypes.flatMap(type => itemsByType[type] || []);
        
        const sortingPrefs = this.actor.system.sorting?.equipment || {};
        const equippedSortFn = getSortFunction(sortingPrefs.equipped || 'manual');
        const carriedSortFn = getSortFunction(sortingPrefs.carried || 'manual');
        const storedSortFn = getSortFunction(sortingPrefs.stored || 'manual');

        context.equipmentInUse = allEquipment.filter(i => i.system.location === 'equipped').sort(equippedSortFn);
        context.equipmentCarried = allEquipment.filter(i => i.system.location === 'carried').sort(carriedSortFn);
        context.equipmentStored = allEquipment.filter(i => i.system.location === 'stored').sort(storedSortFn);

        // ================================================================== //
        //    AGRUPAMENTO E ORDENAÇÃO DE CARACTERÍSTICAS                       //
        // ================================================================== //
        const characteristics = [ ...(itemsByType.advantage || []), ...(itemsByType.disadvantage || []) ];
        context.characteristicsByBlock = characteristics.reduce((acc, char) => {
          const blockId = char.system.block_id || 'block2';
          if (!acc[blockId]) acc[blockId] = [];
          acc[blockId].push(char);
          return acc;
        }, {});
        
        const charSortPref = this.actor.system.sorting?.characteristic || 'manual';
        // Adicionei uma opção de ordenar por pontos como exemplo
        if(charSortPref === 'points') getSortFunction(charSortPref)
        // Ordena as características DENTRO de cada bloco
        for (const blockId in context.characteristicsByBlock) {
            context.characteristicsByBlock[blockId].sort(getSortFunction(charSortPref));
        }


          // ================================================================== //
        //    ENRIQUECIMENTO DE TEXTO PARA BIOGRAFIA E DESCRIÇÃO DE ITEM
        // ================================================================== //
          // Prepara o campo de biografia, garantindo que funcione mesmo se estiver vazio
          context.enrichedBackstory = await TextEditor.enrichHTML(this.actor.system.details.backstory || "", {
              secrets: this.actor.isOwner,
              async: true
          });

        
        context.survivalBlockWasOpen = this._survivalBlockOpen || false;
        // --- NOVA LÓGICA PARA O SUMÁRIO DE EFEITOS ATIVOS ---
// Filtra a lista completa de efeitos do ator para pegar apenas os que estão ativos.
context.activeConditionEffects = Array.from(this.actor.effects).filter(effect => {
    // Um efeito está ativo se ele NÃO está desabilitado E vem de um item de condição.
    return !effect.disabled && effect.origin && fromUuidSync(effect.origin)?.type === 'condition';
}).map(effect => {
    // Prepara uma dica de ferramenta (tooltip) com os detalhes mecânicos
    const changes = effect.changes.map(c => `${c.key}: ${c.value > 0 ? '+' : ''}${c.value}`).join('; ');
    return {
        id: effect.id,
        name: effect.name,
        img: effect.img,
        tooltip: changes
    };
});

        return context;
      }

_getSubmitData(updateData) {
        // Encontra todos os <details> na ficha
        const details = this.form.querySelectorAll('details');
        const openDetails = [];
        details.forEach((d, i) => {
            // Se o <details> estiver aberto, guarda seu "caminho"
            if (d.open) {
                const parentSection = d.closest('.form-section');
                const title = parentSection ? parentSection.querySelector('.section-title')?.innerText : `details-${i}`;
                openDetails.push(title);
            }
        });
        // Armazena a lista de seções abertas temporariamente
        this._openDetails = openDetails;
        
        return super._getSubmitData(updateData);
    }
    
    // ✅ MÉTODO 2: Restaura o estado depois que a ficha é redesenhada ✅
    async _render(force, options) {
        await super._render(force, options);
        // Se tínhamos uma lista de seções abertas...
        if (this._openDetails) {
            // Encontra todos os títulos de seção
            const titles = this.form.querySelectorAll('.section-title');
            titles.forEach(t => {
                // Se o texto do título estiver na nossa lista de abertos...
                if (this._openDetails.includes(t.innerText)) {
                    // ...encontra o <details> pai e o abre.
                    const details = t.closest('.form-section').querySelector('details');
                    if (details) details.open = true;
                }
            });
            // Limpa a lista para a próxima vez
            this._openDetails = null;
        }
    }


_prepareCharacterItems(sheetData) {
    const actorData = sheetData.actor;
    const attributes = actorData.system.attributes;
    const combat = actorData.system.combat;

    // --- ETAPA 1: ZERAR MODIFICADORES TEMPORÁRIOS E OVERRIDES ---
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
    const add_sub_modifiers = {};
    const set_modifiers = {};

    const conditions = this.actor.items.filter(i => i.type === "condition");
    for (const condition of conditions) {
        if (condition.getFlag("gum", "manual_override")) continue;

        let isConditionActive = false;
        try {
            isConditionActive = !condition.system.when || Function("actor", "game", `return ( ${condition.system.when} )`)(this.actor, game);
        } catch (e) {
            console.warn(`GUM | Erro na regra da condição "${condition.name}":`, e);
        }

        if (isConditionActive) {
            const effects = Array.isArray(condition.system.effects) ? condition.system.effects : Object.values(condition.system.effects || {});
            for (const effect of effects) {
                if (effect.type === 'attribute' && effect.path) {
                    let value = 0;
                    try {
                        value = typeof effect.value === "string" ? new Function("actor", "game", `return (${effect.value});`)(this.actor, game) : (Number(effect.value) || 0);
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
    for (const path in add_sub_modifiers) {
        const currentVal = foundry.utils.getProperty(actorData, path) || 0;
        foundry.utils.setProperty(actorData, path, currentVal + add_sub_modifiers[path]);
    }

    // --- ETAPA 4: CÁLCULOS INTERMEDIÁRIOS (FINAL_COMPUTED) ---
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

    const liftingST = attributes.lifting_st.final_computed;
    const basicLift = (liftingST * liftingST) / 10;
    attributes.basic_lift = { value: basicLift };

    let totalWeight = 0;
    const ignoreCarried = actorData.system.encumbrance.ignore_carried_weight;
    for (let i of sheetData.actor.items) {
        if ((['equipment', 'armor'].includes(i.type) || i.system.hasOwnProperty('weight')) && i.system.weight) {
            const loc = i.system.location;
            if (loc === 'equipped' || (loc === 'carried' && !ignoreCarried)) {
                totalWeight += (i.system.weight || 0) * (i.system.quantity || 1);
            }
        }
    }

    let enc = { level_name: "Nenhuma", level_value: 0, penalty: 0 };
    if (totalWeight > basicLift * 6) enc = { level_name: "M. Pesada", level_value: 4, penalty: -4 };
    else if (totalWeight > basicLift * 3) enc = { level_name: "Pesada", level_value: 3, penalty: -3 };
    else if (totalWeight > basicLift * 2) enc = { level_name: "Média", level_value: 2, penalty: -2 };
    else if (totalWeight > basicLift) enc = { level_name: "Leve", level_value: 1, penalty: -1 };
    
    foundry.utils.mergeObject(actorData.system.encumbrance, {
        total_weight: Math.round(totalWeight * 100) / 100,
        level_name: enc.level_name,
        level_value: enc.level_value,
        levels: {
            none: basicLift.toFixed(2), light: (basicLift * 2).toFixed(2),
            medium: (basicLift * 3).toFixed(2), heavy: (basicLift * 6).toFixed(2),
            xheavy: (basicLift * 10).toFixed(2)
        }
    });
    
    const levels = actorData.system.encumbrance.levels;
    actorData.system.encumbrance.level_data = [
        { name: 'Nenhuma', max: levels.none }, { name: 'Leve', max: levels.light },
        { name: 'Média', max: levels.medium }, { name: 'Pesada', max: levels.heavy },
        { name: 'M. Pesada', max: levels.xheavy }
    ];

    const finalBasicSpeedComputed = attributes.basic_speed.final_computed;
    attributes.dodge.value = Math.floor(finalBasicSpeedComputed) + 3;
    attributes.dodge.final_computed = attributes.dodge.value + enc.penalty + (attributes.dodge.mod || 0) + (attributes.dodge.temp || 0);
    attributes.basic_move.final_computed = Math.floor(attributes.basic_move.final_computed * (1 - (enc.level_value * 0.2)));

    // --- ETAPA 5: APLICAR MODIFICADORES DE "SET" (OVERRIDE) ---
    for (const path in set_modifiers) {
        foundry.utils.setProperty(actorData, path, set_modifiers[path]);
    }

    // --- ETAPA 6: CÁLCULO FINALÍSSIMO (FINAL) ---
    for (const attr of allAttributes) {
        if (attributes[attr]) {
            const override = attributes[attr].override;
            attributes[attr].final = (override !== null && override !== undefined) ? override : attributes[attr].final_computed;
        }
    }

    // --- Cálculos Finais (DR, NH) ---
    const drFromArmor = { head:0, torso:0, vitals:0, groin:0, face:0, eyes:0, neck:0, arms:0, hands:0, legs:0, feet:0 };
    for (let i of sheetData.actor.items) {
        if (i.type === 'armor' && i.system.location === 'equipped') {
            (i.system.worn_locations || []).forEach(loc => {
                // ✅ AQUI ESTÁ A CORREÇÃO CRÍTICA ✅
                // Adicionamos uma verificação para garantir que 'loc' não é nulo ou indefinido.
                if (loc && drFromArmor.hasOwnProperty(loc.toLowerCase())) {
                    drFromArmor[loc.toLowerCase()] += i.system.dr || 0;
                }
            });
        }
    }
    
    const totalDr = {};
    const drMods = combat.dr_mods || {};
    const drTempMods = combat.dr_temp_mods || {};
    for (let key in drFromArmor) {
        totalDr[key] = (drFromArmor[key] || 0) + (drMods[key] || 0) + (drTempMods[key] || 0);
    }
    combat.dr_locations = totalDr;
    combat.dr_from_armor = drFromArmor;

    for (let i of sheetData.actor.items) {
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
                    const refSkill = sheetData.actor.items.find(s => s.type === 'skill' && s.name?.toLowerCase() === baseAttr);
                    if (refSkill) attrVal = refSkill.system.final_nh;
                }
                i.system.final_nh = attrVal + (i.system.skill_level || 0) + (i.system.other_mods || 0);
            } catch (e) {
                console.error(`GUM | Erro ao calcular NH para o item ${i.name}:`, e);
            }
        }
    }
}


    
      async _updateObject(event, formData) {
        // Processa a conversão de vírgula para ponto
        for (const key in formData) {
          if (typeof formData[key] === 'string' && formData[key].includes(',')) {
            formData[key] = formData[key].replace(',', '.');
          }
        }

        return this.actor.update(formData);
      }

    /*====== NOSSO MENU DE OPÇÕES =========*/

      activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        // ✅ LISTENER ESPECIALISTA APENAS PARA A FICHA ✅
        // Ele é simples e robusto, pois sempre sabe "quem" é o ator (this.actor)
        html.on('click', '.rollable', (ev) => {
            const element = ev.currentTarget;
            
            // Lógica de Shift+Click para modificadores
            if (ev.shiftKey) {
                const baseTargetForRoll = parseInt(element.dataset.rollValue);
                new Dialog({
                    title: "Modificador de Rolagem Situacional",
                    content: `<p><b>Modificadores para ${element.dataset.label} (vs ${baseTargetForRoll}):</b></p>
                              <input type="number" name="modifier" value="0" style="text-align: center;"/>`,
                    buttons: {
                        roll: {
                            label: "Rolar",
                            callback: (html) => {
                                const situationalMod = parseInt(html.find('input[name="modifier"]').val()) || 0;
                                // Chama nossa função global, passando o ator da ficha
                                performGURPSRoll(element, this.actor, situationalMod);
                            }
                        }
                    }
                }).render(true);
            } else {
                // Chama nossa função global, passando o ator da ficha
                performGURPSRoll(element, this.actor, 0);
            }
        });

        // ✅ NOVO LISTENER PARA EDITAR AS BARRAS DE PV E PF ✅
html.on('click', '.edit-resource-bar', ev => {
    ev.preventDefault();
    const button = ev.currentTarget;
    const statKey = button.dataset.stat; // "hp" ou "fp"
    const statLabel = statKey === 'hp' ? "Pontos de Vida" : "Pontos de Fadiga";
    const attrs = this.actor.system.attributes;

    const content = `
        <form class="secondary-stats-editor">
            <p class="hint">Ajuste os valores base e os modificadores temporários aqui.</p>
            <div class="form-header">
                <span></span>
                <span>Base</span>
                <span>Mod. Temp.</span>
                <span>Final</span>
            </div>
            <div class="form-grid">
                <label>${statLabel} (Máximo)</label>
                <input type="number" name="${statKey}.max" value="${attrs[statKey].max}"/>
                <input type="number" name="${statKey}.temp" value="${attrs[statKey].temp}"/>
                <span class="final-display">${attrs[statKey].final}</span>
            </div>
        </form>
    `;

    new Dialog({
        title: `Editar ${statLabel}`,
        content: content,
        buttons: {
            save: {
                icon: '<i class="fas fa-save"></i>',
                label: "Salvar",
                callback: (html) => {
                    const form = html.find('form')[0];
                    const formData = new FormDataExtended(form).object;
                    const updateData = {
                        [`system.attributes.${statKey}.max`]: formData[`${statKey}.max`],
                        [`system.attributes.${statKey}.temp`]: formData[`${statKey}.temp`]
                    };
                    this.actor.update(updateData);
                }
            }
        },
        default: 'save'
    }, { classes: ["dialog", "gum", "secondary-stats-dialog"] }).render(true);
});

html.on('click', '.edit-secondary-stats-btn', ev => {
    ev.preventDefault();
    const attrs = this.actor.system.attributes;
    const combat = this.actor.system.combat;

    // A nova janela de diálogo com a coluna "Pontos" restaurada
   const content = `
    <form class="secondary-stats-editor">
        <p class="hint">Ajuste os valores base e os pontos gastos aqui. Modificadores de condição são calculados automaticamente.</p>
        <div class="form-header">
            <span>Atributo</span>
            <span>Base</span>
            <span>Mod. Fixo</span>
            <span>Mod. Condição</span>
            <span>Pontos</span>
            <span>Final</span>
        </div>
        <div class="form-grid">
            <label>Velocidade Básica</label>
            <input type="text" name="basic_speed.value" value="${attrs.basic_speed.value}"/>
            <input type="number" name="basic_speed.mod" value="${attrs.basic_speed.mod}"/>
            <span class="mod-display">${attrs.basic_speed.temp > 0 ? '+' : ''}${attrs.basic_speed.temp}</span>
            <input type="number" name="basic_speed.points" value="${attrs.basic_speed.points || 0}"/>
            <span class="final-display">${attrs.basic_speed.final}</span>

            <label>Deslocamento</label>
            <input type="number" name="basic_move.value" value="${attrs.basic_move.value}"/>
            <input type="number" name="basic_move.mod" value="${attrs.basic_move.mod}"/>
            <span class="mod-display">${attrs.basic_move.temp > 0 ? '+' : ''}${attrs.basic_move.temp}</span>
            <input type="number" name="basic_move.points" value="${attrs.basic_move.points || 0}"/>
            <span class="final-display">${attrs.basic_move.final}</span>
            
            <label>Mod. de Tamanho (MT)</label>
            <input type="number" name="mt.value" value="${attrs.mt.value}"/>
            <input type="number" name="mt.mod" value="${attrs.mt.mod}"/>
            <span class="mod-display">${attrs.mt.temp > 0 ? '+' : ''}${attrs.mt.temp}</span>
            <input type="number" name="mt.points" value="${attrs.mt.points || 0}"/>
            <span class="final-display">${attrs.mt.final}</span>
            
            <label>Esquiva</label>
            <span class="base-display">${attrs.dodge.value}</span>
            <input type="number" name="dodge.mod" value="${attrs.dodge.mod || 0}" title="Modificador Fixo de Esquiva"/>
            <span class="mod-display">${attrs.dodge.temp > 0 ? '+' : ''}${attrs.dodge.temp}</span>
            <input type="number" name="dodge.points" value="${attrs.dodge.points || 0}"/>
            <span class="final-display">${attrs.dodge.final}</span>
        </div>
    </form>
`;

    new Dialog({
        title: "Editar Atributos Secundários",
        content: content,
        buttons: {
            save: {
                icon: '<i class="fas fa-save"></i>',
                label: "Salvar",
                callback: (html) => {
                    const form = html.find('form')[0];
                    const formData = new FormDataExtended(form).object;
                    // Prepara os dados para a atualização, incluindo os pontos
               const updateData = {
                        "system.attributes.basic_speed.value": formData["basic_speed.value"],
                        "system.attributes.basic_speed.mod": formData["basic_speed.mod"],
                        "system.attributes.basic_speed.points": formData["basic_speed.points"],

                        "system.attributes.basic_move.value": formData["basic_move.value"],
                        "system.attributes.basic_move.mod": formData["basic_move.mod"],
                        "system.attributes.basic_move.points": formData["basic_move.points"],

                        "system.attributes.mt.value": formData["mt.value"],
                        "system.attributes.mt.mod": formData["mt.mod"],
                        "system.attributes.mt.points": formData["mt.points"],

                        "system.attributes.dodge.value": formData["dodge.value"],
                        "system.attributes.dodge.mod": formData["dodge.mod"],
                        "system.attributes.dodge.points": formData["dodge.points"]
                        };
                    this.actor.update(updateData);
                }
            }
        },
        default: 'save'
    }, { classes: ["dialog", "gum", "secondary-stats-dialog"], width: 550 }).render(true);
});

html.on('click', '.item-quick-view', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const itemId = $(ev.currentTarget).closest('.item').data('itemId');
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const getTypeName = (type) => {
        const typeMap = {
            equipment: "Equipamento", melee_weapon: "Arma C. a C.",
            ranged_weapon: "Arma à Dist.", armor: "Armadura",
            advantage: "Vantagem", disadvantage: "Desvantagem",
            skill: "Perícia", spell: "Magia", power: "Poder"
        };
        return typeMap[type] || type;
    };

    const data = {
        name: item.name,
        type: getTypeName(item.type),
        system: item.system
    };

    let mechanicalTagsHtml = '';
    const s = data.system;
    const createTag = (label, value) => {
        if (value !== null && value !== undefined && value !== '' && value.toString().trim() !== '') {
            return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
        }
        return '';
    };

    switch (item.type) {
        case 'melee_weapon':
            mechanicalTagsHtml += createTag('Dano', `${s.damage_formula || ''} ${s.damage_type || ''}`);
            mechanicalTagsHtml += createTag('Alcance', s.reach);
            mechanicalTagsHtml += createTag('Aparar', s.parry);
            mechanicalTagsHtml += createTag('ST', s.min_strength);
            break;
        case 'ranged_weapon':
            mechanicalTagsHtml += createTag('Dano', `${s.damage_formula || ''} ${s.damage_type || ''}`);
            mechanicalTagsHtml += createTag('Prec.', s.accuracy);
            mechanicalTagsHtml += createTag('Alcance', s.range);
            mechanicalTagsHtml += createTag('CdT', s.rof);
            mechanicalTagsHtml += createTag('Tiros', s.shots);
            mechanicalTagsHtml += createTag('RCO', s.rcl);
            mechanicalTagsHtml += createTag('ST', s.min_strength);
            break;
        case 'armor':
             mechanicalTagsHtml += createTag('RD', s.dr);
             mechanicalTagsHtml += createTag('Local', `<span class="capitalize">${s.worn_location || 'N/A'}</span>`);
            break;
        case 'skill':
            mechanicalTagsHtml += createTag('Attr.', `<span class="uppercase">${s.base_attribute || '--'}</span>`);
            mechanicalTagsHtml += createTag('Nível', `${s.skill_level > 0 ? '+' : ''}${s.skill_level || '0'}`);
            mechanicalTagsHtml += createTag('Grupo', s.group);
            break;
        case 'spell':
            mechanicalTagsHtml += createTag('Classe', s.spell_class);
            mechanicalTagsHtml += createTag('Tempo', s.casting_time);
            mechanicalTagsHtml += createTag('Duração', s.duration);
            mechanicalTagsHtml += createTag('Custo', `${s.mana_cost || '0'} / ${s.mana_maint || '0'}`);
            break;
    }

    const description = await TextEditor.enrichHTML(item.system.chat_description || item.system.description || "<i>Sem descrição.</i>", {
        secrets: this.actor.isOwner,
        async: true
    });
    // Estrutura HTML final para o design "Clássico e Compacto"
    const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card" data-item-id="${item.id}">
                <header class="preview-header">
                    <h3>${data.name}</h3>
                    <div class="header-controls">
                        <span class="preview-item-type">${data.type}</span>
                        <a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a>
                    </div>
                </header>
                
                <div class="preview-content">
                    <div class="preview-properties">
                        ${createTag('Pontos', s.points)}
                        ${createTag('Custo', s.total_cost ? `$${s.total_cost}`: null)}
                        ${createTag('Peso', s.total_weight ? `${s.total_weight} kg`: null)}
                        ${mechanicalTagsHtml}
                    </div>

                    ${description && description.trim() !== "<i>Sem descrição.</i>" ? '<hr class="preview-divider">' : ''}

                    <div class="preview-description">
                        ${description}
                    </div>
                </div>
            </div>
        </div>
    `;

    new Dialog({
        content: content,
        buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } },
        default: "close",
        options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400, height: "auto" }, // Largura reduzida
        render: (html) => {
            html.on('click', '.send-to-chat', (event) => {
                event.preventDefault();
                const card = $(event.currentTarget).closest('.gurps-item-preview-card');
                const chatItemId = card.data('itemId');
                const chatItem = this.actor.items.get(chatItemId);
                if (chatItem) {
                    const cardHTML = card.html();
                    const chatDataType = getTypeName(chatItem.type);
                    const chatContent = `<div class="gurps-item-preview-card chat-card">${cardHTML.replace(/<div class="header-controls">.*?<\/div>/s, `<span class="preview-item-type">${chatDataType}</span>`)}</div>`;
                    ChatMessage.create({
                        user: game.user.id,
                        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                        content: chatContent
                    });
                }
            });
        }
    }).render(true);
});
            // ================================================================== //
            //     Listener para EDITAR a fórmula de dano básico (GdP/GeB)        //
            // ================================================================== //  
            html.on('click', '.edit-basic-damage', ev => {
            ev.preventDefault();
            ev.stopPropagation(); // Impede que o clique também dispare a rolagem de dano
            const button = ev.currentTarget;
            const damageType = button.dataset.damageType; // 'thrust' ou 'swing'
            const currentFormula = this.actor.system.attributes[`${damageType}_damage`];

            new Dialog({
                title: `Editar Dano ${damageType === 'thrust' ? 'GdP' : 'GeB'}`,
                content: `<div class="form-group"><label>Nova Fórmula de Dano:</label><input type="text" name="formula" value="${currentFormula}"/></div>`,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Salvar",
                        callback: (html) => {
                            const newFormula = html.find('input[name="formula"]').val();
                            this.actor.update({ [`system.attributes.${damageType}_damage`]: newFormula });
                        }
                    }
                }
            }).render(true);
        });

            // ================================================================== //
            //          LISTENER PARA GRUPOS DE ATAQUE                            //
            // ================================================================== //    
        // Listener para ADICIONAR um novo GRUPO de Ataque (ex: uma arma)
        html.on('click', '.add-attack-group', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Novo Grupo de Ataque",
            content: `<div class="form-group"><label>Nome do Grupo (ex: Espada Longa, Desarmado):</label><input type="text" name="name" placeholder="Nova Arma"/></div>`,
            buttons: { create: { icon: '<i class="fas fa-check"></i>', label: "Criar", callback: (html) => {
              const name = html.find('input[name="name"]').val();
              if (name) {
                const newGroup = { name: name, attacks: {}, sort: Date.now() };
                const newKey = `system.combat.attack_groups.${foundry.utils.randomID()}`;
                this.actor.update({ [newKey]: newGroup });
              }
            }}},
            default: "create"
          }).render(true);
        });

        // Listener para ADICIONAR um novo ATAQUE DENTRO de um grupo
        html.on('click', '.add-attack-to-group', ev => {
            ev.preventDefault();
            const groupId = $(ev.currentTarget).data('group-id');
            if (!groupId) return;

            // DIÁLOGO DE ESCOLHA
            new Dialog({
                title: "Escolha o Tipo de Ataque",
                content: "<p>Qual tipo de ataque você deseja criar?</p>",
                buttons: {
                    melee: {
                        label: "Corpo a Corpo",
                        icon: '<i class="fas fa-khanda"></i>',
                        callback: () => this._openAttackCreationDialog(groupId, "melee")
                    },
                    ranged: {
                        label: "À Distância",
                        icon: '<i class="fas fa-bullseye"></i>',
                        callback: () => this._openAttackCreationDialog(groupId, "ranged")
                    }
                }
            }).render(true);
        });

        // Listener para EDITAR um GRUPO de Ataque
        html.on('click', '.edit-attack-group', ev => {
          ev.preventDefault();
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const group = this.actor.system.combat.attack_groups[groupId];
          if (!group) return;

          new Dialog({
              title: `Editar Grupo: ${group.name}`,
              content: `<div class="form-group"><label>Nome do Grupo:</label><input type="text" name="name" value="${group.name}"/></div>`,
              buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => {
                  const newName = html.find('input[name="name"]').val();
                  this.actor.update({ [`system.combat.attack_groups.${groupId}.name`]: newName });
              }}}
          }).render(true);
        });
        
        // Listener para DELETAR um GRUPO de Ataque
        html.on('click', '.delete-attack-group', ev => {
          ev.preventDefault();
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const group = this.actor.system.combat.attack_groups[groupId];
          if (!group) return;

          Dialog.confirm({
              title: `Deletar Grupo "${group.name}"`,
              content: `<p>Você tem certeza? Isso irá apagar o grupo e <strong>todos os ataques dentro dele</strong>.</p>`,
              yes: () => this.actor.update({ [`system.combat.attack_groups.-=${groupId}`]: null }),
              no: () => {},
              defaultYes: false
          });
        });

        // Listener para EDITAR um ATAQUE INDIVIDUAL DENTRO de um grupo
        html.on('click', '.edit-grouped-attack', ev => {
          ev.preventDefault();
          const attackId = $(ev.currentTarget).closest('.attack-item').data('attackId');
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const attack = this.actor.system.combat.attack_groups[groupId]?.attacks[attackId];
          if (!attack) return;

          // Reutiliza o diálogo de criação, mas com os dados existentes
          this._openAttackCreationDialog(groupId, attack.attack_type, { attackId, attackData: attack });
        });

        // Listener para DELETAR um ATAQUE INDIVIDUAL DENTRO de um grupo
        html.on('click', '.delete-grouped-attack', ev => {
          ev.preventDefault();
          const attackId = $(ev.currentTarget).closest('.attack-item').data('attackId');
          const groupId = $(ev.currentTarget).closest('.attack-group-card').data('groupId');
          const attack = this.actor.system.combat.attack_groups[groupId]?.attacks[attackId];
          if (!attack) return;

          Dialog.confirm({
              title: `Deletar Ataque "${attack.name}"`,
              content: `<p>Você tem certeza que quer deletar este ataque?</p>`,
              yes: () => this.actor.update({ [`system.combat.attack_groups.${groupId}.attacks.-=${attackId}`]: null }),
              no: () => {},
              defaultYes: false
          });
        });

        // ================================================================== //
        //     DRAG & DROP PARA GRUPOS DE ATAQUE                            //
        // ================================================================== //
        html.on('dragstart', '.attack-group-card', ev => {
          const li = ev.currentTarget;
          const dragData = { type: "AttackGroup", id: li.dataset.groupId };
          ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });

        html.on('drop', '.attack-group-list', async ev => {
          const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
          if (data.type !== "AttackGroup") return;
          
          const draggedId = data.id;
          const groups = Object.entries(this.actor.system.combat.attack_groups || {}).map(([id, group]) => ({...group, id}));
          groups.sort((a,b) => a.sort - b.sort);

          const dropTarget = ev.target.closest('.attack-group-card');
          let newSort = 0;

          if (dropTarget) {
            const targetId = dropTarget.dataset.groupId;
            if (targetId === draggedId) return;
            const targetGroup = groups.find(g => g.id === targetId);
            const targetIndex = groups.findIndex(g => g.id === targetId);
            const targetBoundingRect = dropTarget.getBoundingClientRect();
            const dropInTopHalf = ev.clientY < (targetBoundingRect.top + targetBoundingRect.height / 2);

            if (dropInTopHalf) {
              const prevGroup = groups[targetIndex - 1];
              newSort = (targetGroup.sort + (prevGroup ? prevGroup.sort : 0)) / 2;
            } else {
              const nextGroup = groups[targetIndex + 1];
              newSort = (targetGroup.sort + (nextGroup ? nextGroup.sort : targetGroup.sort + 2000)) / 2;
            }
          } else {
            newSort = (groups.pop()?.sort || 0) + 1000;
          }
          
          await this.actor.update({ [`system.combat.attack_groups.${draggedId}.sort`]: newSort });
        });
        
            // ================================================================== //
            //          LISTENER PARA BLOCOS COLAPSÁVEIS (SOBREVIVÊNCIA)          //
            // ================================================================== //
          html.on('click', '.collapsible-header', ev => {
          const header = $(ev.currentTarget);
          const parentBlock = header.closest('.collapsible-block');

          // Alterna a classe para o efeito visual imediato
          parentBlock.toggleClass('active');

          // MUDANÇA: "Anota" no objeto da ficha se a seção está aberta ou fechada
          this._survivalBlockOpen = parentBlock.hasClass('active');
        });

          // ================================================================== //
          //          LISTENER PARA MARCADORES (SEM REDESENHAR A FICHA)         //
          // ================================================================== //
          html.on('click', '.vitals-tracker .tracker-dot', async ev => {
          ev.preventDefault();
          const dot = $(ev.currentTarget);
          const tracker = dot.closest('.vitals-tracker');

          const statName = tracker.data('stat');
          if (!statName) return;

          const value = dot.data('value');
          const currentValue = this.actor.system.attributes[statName]?.value || 0;
          const newValue = (currentValue === value) ? 0 : value;

          const updatePath = `system.attributes.${statName}.value`;

          // O 'await' continua importante, mas removemos o this.render(false) e a lógica jQuery
          await this.actor.update({ [updatePath]: newValue });
        });
        
    // Listener para o botão "Editar Perfil" (SEGUINDO O PADRÃO QUE FUNCIONA)
    html.on('click', '.edit-biography-details', ev => {
        ev.preventDefault();
        const details = this.actor.system.details;

        // O HTML do pop-up continua o mesmo.
        const content = `
            <form>
                <div class="details-dialog-grid">
                    <div class="form-group"><label>Gênero</label><input type="text" name="gender" value="${details.gender || ''}"/></div>
                    <div class="form-group"><label>Idade</label><input type="text" name="age" value="${details.age || ''}"/></div>
                    <div class="form-group"><label>Altura</label><input type="text" name="height" value="${details.height || ''}"/></div>
                    <div class="form-group"><label>Peso</label><input type="text" name="weight" value="${details.weight || ''}"/></div>
                    <div class="form-group"><label>Pele</label><input type="text" name="skin" value="${details.skin || ''}"/></div>
                    <div class="form-group"><label>Cabelos</label><input type="text" name="hair" value="${details.hair || ''}"/></div>
                    <div class="form-group full-width"><label>Olhos</label><input type="text" name="eyes" value="${details.eyes || ''}"/></div>
                    <div class="form-group full-width"><label>Alinhamento</label><input type="text" name="alignment" value="${details.alignment || ''}"/></div>
                    <div class="form-group full-width"><label>Crença / Fé</label><input type="text" name="belief" value="${details.belief || ''}"/></div>
                </div>
            </form>
        `;

        new Dialog({
            title: "Editar Perfil do Personagem",
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    // A callback agora constrói o objeto de dados manualmente, como nos outros pop-ups
                    callback: (html) => {
                        // Cria um novo objeto para os dados atualizados
                        const newData = {
                            gender: html.find('[name="gender"]').val(),
                            age: html.find('[name="age"]').val(),
                            height: html.find('[name="height"]').val(),
                            weight: html.find('[name="weight"]').val(),
                            skin: html.find('[name="skin"]').val(),
                            hair: html.find('[name="hair"]').val(),
                            eyes: html.find('[name="eyes"]').val(),
                            alignment: html.find('[name="alignment"]').val(),
                            belief: html.find('[name="belief"]').val(),
                            // Preserva os outros dados que não estão no pop-up para não serem apagados
                            concept: this.actor.system.details.concept,
                            backstory: this.actor.system.details.backstory
                        };
                        
                        // Substitui o objeto 'details' inteiro pela sua versão completa e atualizada
                        this.actor.update({ "system.details": newData });
                    }
                }
            },
            default: 'save'
        }).render(true);
    });
        // Listener para salvar alterações diretas nos inputs de Reservas de Energia (VERSÃO CORRIGIDA)
        html.on('change', '.reserve-card input[type="number"]', ev => {
            const input = ev.currentTarget;
            const reserveCard = input.closest('.reserve-card'); // Encontra o "card" pai da reserva
            const reserveId = reserveCard.dataset.reserveId;    // Pega o ID da reserva a partir do card
            const property = input.dataset.property;            // Pega a propriedade a ser alterada ('current' or 'max')

            // Uma verificação de segurança
            if (!reserveId || !property) {
                console.error("GUM | Não foi possível salvar a reserva de energia. Atributos faltando.");
                return;
            }

            const value = Number(input.value);
            // Constrói o caminho completo para o dado que será atualizado
            const key = `system.energy_reserves.${reserveId}.${property}`;

            // Atualiza o ator com o caminho e o valor corretos
            this.actor.update({ [key]: value });
        });

    // ================================================================== //
        //    LISTENER UNIFICADO E FINAL PARA TODOS OS BOTÕES DE ORDENAÇÃO    //
        // ================================================================== //
        html.on('click', '.sort-control', ev => {
            ev.preventDefault();
            const button = ev.currentTarget;
            const itemType = button.dataset.itemType;
            const location = button.dataset.location; // Pega a localização, se existir

            if (!itemType) return;

            // Opções de ordenação para cada tipo de item
            const sortOptions = {
                spell: { manual: "Manual", name: "Nome (A-Z)", spell_school: "Escola" },
                power: { manual: "Manual", name: "Nome (A-Z)" },
                equipment: { manual: "Manual", name: "Nome (A-Z)", weight: "Peso", cost: "Custo" },
                skill: { manual: "Manual", name: "Nome (A-Z)", group: "Grupo (A-Z)" },
                characteristic: { manual: "Manual", name: "Nome (A-Z)", points: "Pontos" }
            };

            const options = sortOptions[itemType];
            if (!options) return;

            // Verifica a preferência de ordenação atual, considerando a localização
            const currentSort = location 
                ? this.actor.system.sorting?.[itemType]?.[location] || 'manual'
                : this.actor.system.sorting?.[itemType] || 'manual';

            // Cria o conteúdo do diálogo com botões de rádio
            let content = '<form class="sort-dialog"><p>Ordenar por:</p>';
            for (const [key, label] of Object.entries(options)) {
                const isChecked = key === currentSort ? "checked" : "";
                content += `
                    <div class="form-group">
                        <label for="${key}">${label}</label>
                        <input type="radio" name="sort-option" value="${key}" id="${key}" ${isChecked}>
                    </div>
                `;
            }
            content += '</form>';

            // Cria e renderiza o diálogo
            new Dialog({
                title: "Opções de Ordenação",
                content: content,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Aplicar",
                        callback: (html) => {
                            const selectedValue = html.find('input[name="sort-option"]:checked').val();
                            // Salva no caminho correto (com ou sem localização)
                            const updatePath = location 
                                ? `system.sorting.${itemType}.${location}` 
                                : `system.sorting.${itemType}`;
                            this.actor.update({ [updatePath]: selectedValue });
                        }
                    }
                },
                default: 'save'
            }).render(true);
        });

    // ================================================================== //
        //       LÓGICA DE DRAG & DROP PARA A LISTA DE ATAQUES (CUSTOM)      //
        // ================================================================== //

        // Quando começa a arrastar um ATAQUE
        html.on('dragstart', 'li.attack-item', ev => {
          const li = ev.currentTarget;
          // Passamos um tipo customizado e o ID do ataque
          const dragData = {
            type: "AttackObject",
            id: li.dataset.attackId
          };
          ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });

        // Permite que a lista de ataques receba o drop
        html.on('dragover', '.attacks-list-box .item-list', ev => {
          ev.preventDefault();
        });

        // Quando solta um ATAQUE na lista
        html.on('drop', '.attacks-list-box .item-list', async ev => {
          ev.preventDefault();
          const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
          if (data.type !== "AttackObject") return;

          const draggedId = data.id;
          const attacks = Object.entries(this.actor.system.combat.attacks).map(([id, attack]) => ({...attack, id}));
          attacks.sort((a,b) => a.sort - b.sort);

          const dropTarget = ev.target.closest('.attack-item');
          let newSort = 0;

          if (dropTarget) {
            const targetId = dropTarget.dataset.attackId;
            const targetAttack = attacks.find(a => a.id === targetId);
            const targetIndex = attacks.findIndex(a => a.id === targetId);

            const targetBoundingRect = dropTarget.getBoundingClientRect();
            const dropInTopHalf = ev.clientY < (targetBoundingRect.top + targetBoundingRect.height / 2);

            if (dropInTopHalf) {
              const prevAttack = attacks[targetIndex - 1];
              newSort = (targetAttack.sort + (prevAttack ? prevAttack.sort : 0)) / 2;
            } else {
              const nextAttack = attacks[targetIndex + 1];
              newSort = (targetAttack.sort + (nextAttack ? nextAttack.sort : targetAttack.sort + 2000)) / 2;
            }
          } else {
            newSort = (attacks.pop()?.sort || 0) + 1000;
          }

          // ATUALIZAÇÃO CUSTOMIZADA: Modifica o 'sort' do objeto de ataque específico
          await this.actor.update({
            [`system.combat.attacks.${draggedId}.sort`]: newSort
          });
        });

    // ================================================================== //
    //     LÓGICA DE ARRASTAR E SOLTAR (DRAG & DROP) - VERSÃO FINAL       //
    // ================================================================== //

    // ETAPA 1: Quando você COMEÇA A ARRASTAR um item
    html.on('dragstart', 'li.item[draggable="true"]', ev => {
        const li = ev.currentTarget;
        const dragData = {
        type: "Item",
        actorId: this.actor.id,
        uuid: this.actor.items.get(li.dataset.itemId)?.uuid
        };
        if (!dragData.uuid) return;
        
        // Armazena os dados do item que está sendo arrastado
        ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        console.log("GUM | Drag Start:", dragData); // Para depuração
    });

    // ETAPA 2: O listener que faltava. Permite que a lista seja uma área de "soltura" válida.
    html.on('dragover', '.item-list', ev => {
        ev.preventDefault();
    });

    // ETAPA 3: Quando você SOLTA o item na lista de destino
    html.on('drop', '.item-list', async ev => {
        ev.preventDefault();
        const data = JSON.parse(ev.originalEvent.dataTransfer.getData("text/plain"));
        if (data.type !== "Item" || !data.uuid) return;

        const draggedItem = await fromUuid(data.uuid);
        if (!draggedItem || draggedItem.actor.id !== this.actor.id) return;

        const dropContainer = ev.currentTarget;
        const dropTarget = ev.target.closest('.item');
        let siblings = [];
        let updatePayload = {};

        const blockContainer = dropContainer.closest('[data-block-id]');
        const equipmentLocation = dropContainer.dataset.location;
        const itemType = dropContainer.dataset.itemType;
        const skillGroup = dropContainer.closest('.skill-group')?.dataset.groupName; // Pega o nome do grupo da perícia

        // --- LÓGICA PARA ITENS AGRUPADOS POR BLOCO (Perícias e Características) ---
        if (blockContainer) {
        const itemTypesInBlocks = ['skill', 'advantage', 'disadvantage'];
        if (itemTypesInBlocks.includes(draggedItem.type)) {
            const targetBlockId = blockContainer.dataset.blockId;
            siblings = this.actor.items
            .filter(i => itemTypesInBlocks.includes(i.type) && i.system.block_id === targetBlockId)
            .sort((a, b) => a.sort - b.sort);
            updatePayload['system.block_id'] = targetBlockId;
            console.log(`GUM | Target context: Block (${targetBlockId})`);
        }
        }

            // LÓGICA ATUALIZADA PARA PERÍCIAS EM GRUPOS
        else if (skillGroup && draggedItem.type === 'skill') {
            siblings = this.actor.items.filter(i => i.type === 'skill' && (i.system.group || 'Geral') === skillGroup);
            updatePayload['system.group'] = skillGroup;
        }
          
        // --- LÓGICA PARA ITENS AGRUPADOS POR LOCALIZAÇÃO (Equipamentos) ---
        else if (equipmentLocation) {
        const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'armor'];
        if (equipmentTypes.includes(draggedItem.type)) {
            siblings = this.actor.items
                .filter(i => equipmentTypes.includes(i.type) && i.system.location === equipmentLocation)
                .sort((a, b) => a.sort - b.sort);
            updatePayload['system.location'] = equipmentLocation;
            console.log(`GUM | Target context: Equipment Location (${equipmentLocation})`);
        }
        }
        
        // --- NOVA LÓGICA GENÉRICA PARA LISTAS SIMPLES (Magias, Poderes, etc.) ---
        else if (itemType && draggedItem.type === itemType) {
            siblings = this.actor.items
                .filter(i => i.type === itemType)
                .sort((a, b) => a.sort - b.sort);
            console.log(`GUM | Target context: Simple List (${itemType})`);
        }

        // --- CÁLCULO DA NOVA POSIÇÃO (LÓGICA UNIFICADA) ---
        if (siblings.length > 0) {
            siblings.sort((a, b) => a.sort - b.sort);
        }

        let newSort = 0;
        if (dropTarget) {
            const targetItem = this.actor.items.get(dropTarget.dataset.itemId);
            if (!targetItem || targetItem.id === draggedItem.id) return;

            const targetIndex = siblings.findIndex(s => s.id === targetItem.id);
            const targetBoundingRect = dropTarget.getBoundingClientRect();
            const dropInTopHalf = ev.clientY < (targetBoundingRect.top + targetBoundingRect.height / 2);

            if (dropInTopHalf) {
                const prevSibling = siblings[targetIndex - 1];
                newSort = (targetItem.sort + (prevSibling ? prevSibling.sort : 0)) / 2;
            } else {
                const nextSibling = siblings[targetIndex + 1];
                newSort = (targetItem.sort + (nextSibling ? nextSibling.sort : targetItem.sort + 2000)) / 2;
            }
        } else {
            newSort = (siblings.pop()?.sort || 0) + 1000;
        }

        updatePayload['sort'] = newSort;
        await draggedItem.update(updatePayload);
    });

        // --- Listeners para elementos estáticos (botões de adicionar, etc.) ---
        html.find('.add-combat-meter').click(ev => { const newMeter = { name: "Novo Registro", current: 10, max: 10 }; const newKey = `system.combat.combat_meters.${foundry.utils.randomID()}`; this.actor.update({ [newKey]: newMeter }); });
      
        // Listener para ADICIONAR um ataque Corpo a Corpo
        html.on('click', '.add-melee-attack', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Criar Ataque Corpo a Corpo",
            content: `
              <form>
                <div class="form-group"><label>Nome do Ataque:</label><input type="text" name="name" value="Novo Ataque"/></div>
                <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="Perícia"/></div>
                <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="10"/></div>
                <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="1d6"/></div>
                <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="cr"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="reach" value="C,1"/></div>
                <div class="form-group"><label>Aparar:</label><input type="number" name="defense" value="8"/></div>
              </form>
            `,
            buttons: { create: { icon: '<i class="fas fa-check"></i>', label: "Criar", callback: (html) => {
                  const form = html.find("form")[0];
                  let formData = new FormDataExtended(form).object;
                  formData.attack_type = "melee"; // Adiciona o tipo ao salvar
                  formData.sort = Date.now();
                  const newKey = `system.combat.attacks.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: formData });
                }
              }
            }
          }).render(true);
        });

        // Listener para ADICIONAR um ataque À Distância
        html.on('click', '.add-ranged-attack', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Criar Ataque à Distância",
            content: `
              <form>
                <div class="form-group"><label>Nome do Ataque:</label><input type="text" name="name" value="Novo Ataque"/></div>
                <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="Perícia"/></div>
                <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="10"/></div>
                <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="1d6"/></div>
                <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="pi"/></div>
                <div class="form-group"><label>Prec:</label><input type="text" name="accuracy" value="1"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="range" value="100/1500"/></div>
                <div class="form-group"><label>CdT:</label><input type="text" name="rof" value="1"/></div>
                <div class="form-group"><label>Tiros:</label><input type="text" name="shots" value="30 (3)"/></div>
                <div class="form-group"><label>RCO:</label><input type="text" name="rcl" value="2"/></div>
              </form>
            `,
            buttons: { create: { icon: '<i class="fas fa-check"></i>', label: "Criar", callback: (html) => {
                  const form = html.find("form")[0];
                  let formData = new FormDataExtended(form).object;
                  formData.attack_type = "ranged"; // Adiciona o tipo ao salvar
                  formData.sort = Date.now();
                  const newKey = `system.combat.attacks.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: formData });
                }
              }
            }
          }).render(true);
        });

        // Listener para EDITAR um ataque 
    // ============== NOVO LISTENER DE EDIÇÃO DE ATAQUE ================
html.on('click', '.edit-attack', ev => {
    ev.preventDefault();
    const attackId = $(ev.currentTarget).closest(".attack-item").data("attackId");
    // CORREÇÃO: O caminho para os ataques foi ajustado
    const attack = this.actor.system.combat.attacks_groups[groupId]?.attacks[attackId];

    if (!attack) return;

    // Define o conteúdo do formulário baseado no tipo de ataque
    const getFormContent = (attackData) => {
        const commonFields = `
            <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${attackData.name || ''}"/></div>
            <div class="form-group"><label>Perícia:</label><input type="text" name="skill_name" value="${attackData.skill_name || ''}"/></div>
            <div class="form-group"><label>NH:</label><input type="number" name="skill_level" value="${attackData.skill_level || 0}"/></div>
            <div class="form-group"><label>Dano:</label><input type="text" name="damage_formula" value="${attackData.damage_formula || ''}"/></div>
            <div class="form-group"><label>Tipo:</label><input type="text" name="damage_type" value="${attackData.damage_type || ''}"/></div>
        `;

        let specificFields = '';
        if (attackData.attack_type === "melee") {
            specificFields = `
                <div class="form-group"><label>Alcance:</label><input type="text" name="reach" value="${attackData.reach || ''}"/></div>
                <div class="form-group"><label>Aparar:</label><input type="number" name="defense" value="${attackData.defense || 0}"/></div>
            `;
        } else { // Ranged
            specificFields = `
                <div class="form-group"><label>Prec:</label><input type="text" name="accuracy" value="${attackData.accuracy || ''}"/></div>
                <div class="form-group"><label>Alcance:</label><input type="text" name="range" value="${attackData.range || ''}"/></div>
                <div class="form-group"><label>CdT:</label><input type="text" name="rof" value="${attackData.rof || ''}"/></div>
                <div class="form-group"><label>Tiros:</label><input type="text" name="shots" value="${attackData.shots || ''}"/></div>
                <div class="form-group"><label>RCO:</label><input type="text" name="rcl" value="${attackData.rcl || ''}"/></div>
            `;
        }
        
        // --- SEÇÃO DE DANO AVANÇADO ---
        const advancedDamageFields = `
            <details>
                <summary>Opções Avançadas de Dano</summary>
                <div class="advanced-damage-fields">
                    <div class="form-group">
                        <label title="Ex: (2), (3), (0.5)">Divisor de Armadura</label>
                        <input type="number" step="0.1" name="armor_divisor" value="${attackData.armor_divisor || 1}"/>
                    </div>
                    <div class="form-group">
                        <label>Dano de Acompanhamento</label>
                        <input type="text" name="follow_up_damage" value="${attackData.follow_up_damage || ''}" placeholder="Ex: 1d que"/>
                    </div>
                    <div class="form-group">
                        <label>Dano de Fragmentação</label>
                        <input type="text" name="fragmentation_damage" value="${attackData.fragmentation_damage || ''}" placeholder="Ex: 2d-1 cort"/>
                    </div>
                </div>
            </details>
        `;

        return `<form>${commonFields}${specificFields}<hr>${advancedDamageFields}</form>`;
    };

    new Dialog({
        title: `Editar Ataque: ${attack.name}`,
        content: getFormContent(attack),
        buttons: {
            save: {
                icon: '<i class="fas fa-save"></i>',
                label: "Salvar",
                callback: (html) => {
                    const form = html.find("form")[0];
                    const formData = new FormDataExtended(form).object;
                    const updateKey = `system.combat.attacks_groups.${groupId}.attacks.${attackId}`;
                    this.actor.update({ [updateKey]: formData });
                }
            }
        },
        default: "save"
    }).render(true);
});
      
        html.on('click', '.delete-attack', ev => { const attackId = $(ev.currentTarget).closest(".attack-item").data("attackId"); Dialog.confirm({ title: "Deletar Ataque", content: "<p>Você tem certeza que quer deletar este ataque?</p>", yes: () => { const deleteKey = `system.combat.attacks.-=${attackId}`; this.actor.update({ [deleteKey]: null }); }, no: () => {}, defaultYes: false }); });


        html.find('.edit-casting-ability').click(ev => { const ability = this.actor.system.casting_ability; new Dialog({ title: "Editar Habilidade de Conjuração", content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${ability.name}"/></div><div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${ability.points}"/></div><div class="form-group"><label>Nível:</label><input type="number" name="level" value="${ability.level}"/></div><div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${ability.source}"/></div><div class="form-group"><label>Descrição:</label><textarea name="description">${ability.description}</textarea></div>`, buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => { const newData = { name: html.find('input[name="name"]').val(), points: parseInt(html.find('input[name="points"]').val()), level: parseInt(html.find('input[name="level"]').val()), source: html.find('input[name="source"]').val(), description: html.find('textarea[name="description"]').val() }; this.actor.update({ "system.casting_ability": newData }); } } }, default: "save" }).render(true); });
        html.find('.edit-power-source').click(ev => { const power = this.actor.system.power_source; new Dialog({ title: "Editar Fonte de Poder", content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${power.name}"/></div><div class="form-group"><label>Nível:</label><input type="number" name="level" value="${power.level}"/></div><div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${power.points}"/></div><div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${power.source}"/></div><div class="form-group"><label>Talento de Poder:</label><input type="number" name="power_talent" value="${power.power_talent}"/></div><div class="form-group"><label>Descrição:</label><textarea name="description">${power.description}</textarea></div>`, buttons: { save: { icon: '<i class="fas fa-save"></i>', label: "Salvar", callback: (html) => { const newData = { name: html.find('input[name="name"]').val(), level: parseInt(html.find('input[name="level"]').val()), points: parseInt(html.find('input[name="points"]').val()), source: html.find('input[name="source"]').val(), power_talent: parseInt(html.find('input[name="power_talent"]').val()), description: html.find('textarea[name="description"]').val() }; this.actor.update({ "system.power_source": newData }); } } }, default: "save" }).render(true); });
        
        html.find('.edit-lifting-st').click(ev => {
        new Dialog({
            title: "Editar ST de Carga",
            // --- MUDANÇA: HTML reestruturado com classes para estilização ---
            content: `
                <div class="gurps-stat-editor-dialog">
                    <p class="dialog-description">
                        Insira o valor usado para calcular a sua Base de Carga (BC).
                    </p>
                    <div class="form-group">
                        <label>ST de Carga</label>
                        <input type="number" name="lifting-st" value="${this.actor.system.attributes.lifting_st.value}" />
                    </div>
                </div>
            `,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const newST = html.find('input[name="lifting-st"]').val();
                        this.actor.update({ "system.attributes.lifting_st.value": newST });
                    }
                }
            },
            // --- MUDANÇA: Adicionando uma classe customizada à janela do Dialog ---
            // Isso nos permite estilizar a janela inteira, incluindo título e botões.
            options: {
                classes: ["dialog", "gurps-dialog"],
                width: 350
            }
        }).render(true);
    });

        // --- Listeners para elementos dinâmicos (dentro de listas) ---
        html.on('click', '.item-edit', ev => { const li = $(ev.currentTarget).parents(".item"); const item = this.actor.items.get(li.data("itemId")); item.sheet.render(true); });
        html.on('click', '.item-delete', ev => { const li = $(ev.currentTarget).parents(".item"); this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]); });
        html.on('click', '.add-social-item', ev => {
          ev.preventDefault();
          const button = ev.currentTarget;
          const itemType = button.dataset.type;
          const typeName = button.dataset.typeName || "Entrada";

          // Abre um diálogo para pedir o nome do novo item
          new Dialog({
            title: `Nova ${typeName}`,
            content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" placeholder="Ex: Nobreza, Guilda dos Ladrões"/></div>`,
            buttons: {
              create: {
                icon: '<i class="fas fa-check"></i>',
                label: "Criar",
                callback: (html) => {
                  const name = html.find('input[name="name"]').val();
                  if (name) {
                    Item.create({ name: name, type: itemType }, { parent: this.actor });
                  }
                }
              }
            },
            default: "create"
          }).render(true);
        });

        html.on('click', '.add-social-entry[data-type="status"]', ev => {
          ev.preventDefault();
          
          // Cria a caixa de diálogo para preencher as informações
          new Dialog({
            title: "Adicionar Novo Status Social",
            content: `
              <div class="form-group"><label>Sociedade:</label><input type="text" name="society" placeholder="Ex: Imperial"/></div>
              <div class="form-group"><label>Status:</label><input type="text" name="status_name" placeholder="Ex: Escravo, Cidadão Comum, Barão "/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="0"/></div>
              <div class="form-group"><label>Custo de Vida Mensal:</label><input type="text" name="monthly_cost" value="$0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-check"></i>',
                label: 'Criar',
                callback: (html) => {
                  const newEntry = {
                    society: html.find('[name="society"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    monthly_cost: html.find('[name="monthly_cost"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.social_status_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para o ícone de EDITAR uma entrada de Status Social
        html.on('click', '.edit-social-entry[data-type="status"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.social_status_entries[entryId];

          new Dialog({
            title: `Editar Status: ${entry.status_name}`,
            content: `
              <div class="form-group"><label>Sociedade:</label><input type="text" name="society" value="${entry.society}"/></div>
              <div class="form-group"><label>Status:</label><input type="text" name="status_name" value="${entry.status_name}"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="${entry.level}"/></div>
              <div class="form-group"><label>Custo de Vida Mensal:</label><input type="text" name="monthly_cost" value="-$0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-save"></i>',
                label: 'Salvar',
                callback: (html) => {
                  const updateKey = `system.social_status_entries.${entryId}`;
                  const updatedEntry = {
                    society: html.find('[name="society"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    monthly_cost: html.find('[name="monthly_cost"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        html.on('click', '.add-social-entry[data-type="organization"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nova Organização",
            content: `
              <div class="form-group"><label>Organização:</label><input type="text" name="organization_name" placeholder="Ex: Guilda dos Ladrões"/></div>
              <div class="form-group"><label>Cargo:</label><input type="text" name="status_name" placeholder="Ex: Membro, Líder"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="0"/></div>
              <div class="form-group"><label>Salário:</label><input type="text" name="salary" value="$0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-check"></i>', label: 'Criar',
                callback: (html) => {
                  const newEntry = {
                    organization_name: html.find('[name="organization_name"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    salary: html.find('[name="salary"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.organization_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para o ícone de EDITAR uma entrada de Organização
        html.on('click', '.edit-social-entry[data-type="organization"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.organization_entries[entryId];
          new Dialog({
            title: `Editar Organização: ${entry.organization_name}`,
            content: `
              <div class="form-group"><label>Organização:</label><input type="text" name="organization_name" value="${entry.organization_name}"/></div>
              <div class="form-group"><label>Status/Cargo:</label><input type="text" name="status_name" value="${entry.status_name}"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="${entry.level}"/></div>
              <div class="form-group"><label>Salário:</label><input type="text" name="salary" value="${entry.salary}"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: {
                icon: '<i class="fas fa-save"></i>', label: 'Salvar',
                callback: (html) => {
                  const updateKey = `system.organization_entries.${entryId}`;
                  const updatedEntry = {
                    organization_name: html.find('[name="organization_name"]').val(),
                    status_name: html.find('[name="status_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    salary: html.find('[name="salary"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para o ícone de DELETAR uma entrada de Organização
        html.on('click', '.delete-social-entry[data-type="organization"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.organization_entries[entryId];
            Dialog.confirm({
                title: "Deletar Entrada de Organização",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.organization_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.organization_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        html.on('click', '.add-social-entry[data-type="culture"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nova Cultura",
            content: `
              <div class="form-group"><label>Cultura:</label><input type="text" name="culture_name" placeholder="Ex: Angarana, Anã"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="0"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    culture_name: html.find('[name="culture_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.culture_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Cultura
        html.on('click', '.edit-social-entry[data-type="culture"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.culture_entries[entryId];
          new Dialog({
            title: `Editar Cultura: ${entry.culture_name}`,
            content: `
              <div class="form-group"><label>Cultura:</label><input type="text" name="culture_name" value="${entry.culture_name}"/></div>
              <div class="form-group"><label>Nível:</label><input type="number" name="level" value="${entry.level}"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.culture_entries.${entryId}`;
                  const updatedEntry = {
                    culture_name: html.find('[name="culture_name"]').val(),
                    level: parseInt(html.find('[name="level"]').val()),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Cultura
        html.on('click', '.delete-social-entry[data-type="culture"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.culture_entries[entryId];
            Dialog.confirm({
                title: "Deletar Entrada de Cultura",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.culture_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.culture_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        html.on('click', '.add-social-entry[data-type="language"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Novo Idioma",
            content: `
              <div class="form-group"><label>Idioma:</label><input type="text" name="language_name" placeholder="Ex: Comum, Élfico"/></div>
              <div class="form-group"><label>Nível de Escrita:</label><input type="text" name="written_level" placeholder="Ex: Nenhum, Rudimentar, Sotaque, Materna"/></div>
              <div class="form-group"><label>Nível de Fala:</label><input type="text" name="spoken_level" placeholder="Ex: Nenhum, Rudimentar, Sotaque, Materna"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    language_name: html.find('[name="language_name"]').val(),
                    written_level: html.find('[name="written_level"]').val(),
                    spoken_level: html.find('[name="spoken_level"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.language_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Idioma
        html.on('click', '.edit-social-entry[data-type="language"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.language_entries[entryId];
          new Dialog({
            title: `Editar Idioma: ${entry.language_name}`,
            content: `
              <div class="form-group"><label>Idioma: </label><input type="text" name="language_name" value="${entry.language_name}"/></div>
              <div class="form-group"><label>Nível de Escrita: </label><input type="text" name="written_level" value="${entry.written_level}"/></div>
              <div class="form-group"><label>Nível de Fala: </label><input type="text" name="spoken_level" value="${entry.spoken_level}"/></div>
              <div class="form-group"><label>Pontos: </label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição: </label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.language_entries.${entryId}`;
                  const updatedEntry = {
                    language_name: html.find('[name="language_name"]').val(),
                    written_level: html.find('[name="written_level"]').val(),
                    spoken_level: html.find('[name="spoken_level"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Idioma
        html.on('click', '.delete-social-entry[data-type="language"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.language_entries[entryId];
            Dialog.confirm({
                title: "Deletar Idioma",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.language_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.language_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        // Listener para ADICIONAR uma entrada de Reputação
        html.on('click', '.add-social-entry[data-type="reputation"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nova Reputação",
            content: `
              <div class="form-group"><label>Título:</label><input type="text" name="title" placeholder="Ex: Honrado, Cruel"/></div>
              <div class="form-group"><label>Modificador de Reação:</label><input type="text" name="reaction_modifier" placeholder="Ex: +2, -1"/></div>
              <div class="form-group"><label>Pessoas Afetadas:</label><input type="text" name="scope" placeholder="Ex: Toda a cidade, A Guilda"/></div>
              <div class="form-group"><label>Frequência de Reconhecimento:</label><input type="text" name="recognition_frequency" placeholder="Ex: Quase Sempre, Às vezes"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    title: html.find('[name="title"]').val(),
                    reaction_modifier: html.find('[name="reaction_modifier"]').val(),
                    scope: html.find('[name="scope"]').val(),
                    recognition_frequency: html.find('[name="recognition_frequency"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.reputation_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Reputação
        html.on('click', '.edit-social-entry[data-type="reputation"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.reputation_entries[entryId];
          new Dialog({
            title: `Editar Reputação: ${entry.title}`,
            content: `
              <div class="form-group"><label>Título: </label><input type="text" name="title" value="${entry.title}"/></div>
              <div class="form-group"><label>Modificador de Reação: </label><input type="text" name="reaction_modifier" value="${entry.reaction_modifier}"/></div>
              <div class="form-group"><label>Pessoas Afetadas: </label><input type="text" name="scope" value="${entry.scope}"/></div>
              <div class="form-group"><label>Frequência de Reconhecimento: </label><input type="text" name="recognition_frequency" value="${entry.recognition_frequency}"/></div>
              <div class="form-group"><label>Pontos: </label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição: </label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.reputation_entries.${entryId}`;
                  const updatedEntry = {
                    title: html.find('[name="title"]').val(),
                    reaction_modifier: html.find('[name="reaction_modifier"]').val(),
                    scope: html.find('[name="scope"]').val(),
                    recognition_frequency: html.find('[name="recognition_frequency"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Reputação
        html.on('click', '.delete-social-entry[data-type="reputation"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.reputation_entries[entryId];
            Dialog.confirm({
                title: "Deletar Reputação",
                content: `<p>Você tem certeza que quer deletar a reputação "<strong>${entry.title}</strong>"?</p>`,
                yes: () => {
                    const deleteKey = `system.reputation_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        html.on('click', '.add-social-entry[data-type="wealth"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Nível de Riqueza",
            content: `
              <div class="form-group"><label>Nível de Riqueza: </label><input type="text" name="wealth_level" placeholder="Ex: Pobre, Confortável, Dívida"/></div>
              <div class="form-group"><label>Efeitos: </label><input type="text" name="effects" placeholder="Ex: Recursos Iniciais (RI) x 2 = $2000"/></div>
              <div class="form-group"><label>Pontos: </label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição: </label><textarea name="description"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    wealth_level: html.find('[name="wealth_level"]').val(),
                    effects: html.find('[name="effects"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.wealth_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Riqueza
        html.on('click', '.edit-social-entry[data-type="wealth"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.wealth_entries[entryId];
          new Dialog({
            title: `Editar Riqueza: ${entry.wealth_level}`,
            content: `
              <div class="form-group"><label>Nível de Riqueza:</label><input type="text" name="wealth_level" value="${entry.wealth_level}"/></div>
              <div class="form-group"><label>Efeitos:</label><input type="text" name="effects" value="${entry.effects}"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description">${entry.description}</textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.wealth_entries.${entryId}`;
                  const updatedEntry = {
                    wealth_level: html.find('[name="wealth_level"]').val(),
                    effects: html.find('[name="effects"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Riqueza
        html.on('click', '.delete-social-entry[data-type="wealth"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.wealth_entries[entryId];
            Dialog.confirm({
                title: "Deletar Nível de Riqueza",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.wealth_level}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.wealth_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        // Listener para ADICIONAR uma entrada de Vínculo
        html.on('click', '.add-social-entry[data-type="bond"]', ev => {
          ev.preventDefault();
          new Dialog({
            title: "Adicionar Novo Vínculo",
            content: `
              <div class="form-group"><label>Nome:</label><input type="text" name="name" placeholder="Ex: taverneiro, a cidade de ..."/></div>
              <div class="form-group"><label>Vínculo:</label><input type="text" name="bond_type" placeholder="Ex: Aliado, Inimigo, Informante, Devedor, Cobrador"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="0"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description" rows="4"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-check"></i>', label: 'Criar', callback: (html) => {
                  const newEntry = {
                    name: html.find('[name="name"]').val(),
                    bond_type: html.find('[name="bond_type"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  const newKey = `system.bond_entries.${foundry.utils.randomID()}`;
                  this.actor.update({ [newKey]: newEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para EDITAR uma entrada de Vínculo
        html.on('click', '.edit-social-entry[data-type="bond"]', ev => {
          ev.preventDefault();
          const li = $(ev.currentTarget).closest(".item");
          const entryId = li.data("entryId");
          const entry = this.actor.system.wealth_entries[entryId];
          new Dialog({
            title: `Editar Riqueza: ${entry.wealth_level}`,
            content: `
              <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${entry.name}$"/></div>
              <div class="form-group"><label>Vínculo:</label><input type="text" name="bond_type" value="${entry.bond_type}$"/></div>
              <div class="form-group"><label>Pontos:</label><input type="number" name="points" value="${entry.points}$"/></div>
              <div class="form-group"><label>Descrição:</label><textarea name="description" rows="4" value="${entry.description}$"></textarea></div>
            `,
            buttons: {
              save: { icon: '<i class="fas fa-save"></i>', label: 'Salvar', callback: (html) => {
                  const updateKey = `system.wealth_entries.${entryId}`;
                  const updatedEntry = {
                    wealth_level: html.find('[name="wealth_level"]').val(),
                    effects: html.find('[name="effects"]').val(),
                    points: parseInt(html.find('[name="points"]').val()),
                    description: html.find('[name="description"]').val()
                  };
                  this.actor.update({ [updateKey]: updatedEntry });
                }
              }
            },
            default: 'save'
          }).render(true);
        });

        // Listener para DELETAR uma entrada de Vínculo
        html.on('click', '.delete-social-entry[data-type="bond"]', ev => {
          ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.wealth_entries[entryId];
            Dialog.confirm({
                title: "Deletar Nível de Riqueza",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.wealth_level}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.wealth_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        // Listener para o ícone de DELETAR uma entrada de Status Social
        html.on('click', '.delete-social-entry[data-type="status"]', ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).closest(".item");
            const entryId = li.data("entryId");
            const entry = this.actor.system.social_status_entries[entryId];

            Dialog.confirm({
                title: "Deletar Status Social",
                content: `<p>Você tem certeza que quer deletar <strong>${entry.status_name}</strong>?</p>`,
                yes: () => {
                    const deleteKey = `system.social_status_entries.-=${entryId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        /* ========== LISTENERS PARA ICONE MUDANÇA DE EQUIPAMENTO ==============*/
    // --- LÓGICA UNIFICADA DE MENUS CUSTOMIZADOS ---
        const customMenu = this.element.find(".custom-context-menu");

        // Listener para o ícone de MOVER EQUIPAMENTO
        html.on('click', '.item-move', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const li = $(ev.currentTarget).closest(".item");
          const itemId = li.data("itemId");
          
          const menuContent = `
            <div class="context-item" data-action="update-location" data-value="equipped"><i class="fas fa-user-shield"></i> Em Uso</div>
            <div class="context-item" data-action="update-location" data-value="carried"><i class="fas fa-shopping-bag"></i> Carregado</div>
            <div class="context-item" data-action="update-location" data-value="stored"><i class="fas fa-archive"></i> Armazenado</div>
          `;
          customMenu.html(menuContent);
          customMenu.data("item-id", itemId);
          customMenu.css({ display: "block", left: ev.clientX + 5 + "px", top: ev.clientY - 10 + "px" });
        });

        // Listener para o ícone de MOVER PERÍCIA
    // ================================================================== //
    //    LISTENER PARA O NOVO MENU DE OPÇÕES DA PERÍCIA                  //
    // ================================================================== //
    html.on('click', '.item-options-btn', ev => {
        ev.preventDefault();
        ev.stopPropagation();

        const button = $(ev.currentTarget);
        const li = button.closest('.item');
        const itemId = li.data('itemId');
        const skill = this.actor.items.get(itemId);
        if (!skill) return;
        
        const skillBlocks = this.actor.system.skill_blocks || {};
        let moveSubmenu = '';
        // Cria os sub-itens do menu para mover a perícia
        for (const [blockId, blockData] of Object.entries(skillBlocks)) {
            moveSubmenu += `<div class="context-item" data-action="update-skill-block" data-value="${blockId}"><i class="fas fa-folder"></i> ${blockData.name}</div>`;
        }

        // Monta o menu principal
        const menuContent = `
            <div class="context-item" data-action="edit"><i class="fas fa-edit"></i> Editar Perícia</div>
            <div class="context-item" data-action="delete"><i class="fas fa-trash"></i> Deletar Perícia</div>
            <div class="context-divider"></div>
            <div class="context-submenu">
                <div class="context-item"><i class="fas fa-folder-open"></i> Mover Para</div>
                <div class="submenu-items">${moveSubmenu}</div>
            </div>
        `;

        // Reutiliza e exibe nosso menu de contexto customizado
        const customMenu = this.element.find(".custom-context-menu");
        customMenu.html(menuContent);
        customMenu.data("item-id", itemId); // Armazena o ID do item para uso posterior
        customMenu.css({ display: "block", left: ev.clientX - 210 + "px", top: ev.clientY - 10 + "px" });
    });

    // Listener para as ações DENTRO do menu (este listener precisa ser ATUALIZADO)
       html.on('click', '.custom-context-menu .context-item', async ev => {
        const button = ev.currentTarget;
        const customMenu = this.element.find(".custom-context-menu");
        const itemId = customMenu.data("itemId");
        const action = $(button).data("action");
        const value = $(button).data("value");

        if (itemId) {
            const item = this.actor.items.get(itemId);
            if (!item) return;

            switch(action) {
                case 'edit':
                    item.sheet.render(true);
                    break;
                case 'delete':
                    await Dialog.confirm({
                        title: `Deletar ${item.type}`,
                        content: `<p>Você tem certeza que quer deletar <strong>${item.name}</strong>?</p>`,
                        yes: () => item.delete(),
                        no: () => {},
                        defaultYes: false
                    });
                    break;
                case 'update-location':
                    await item.update({ "system.location": value });
                    break;
                case 'update-skill-block':
                    await item.update({ "system.block_id": value });
                    break;
            }
        }
        customMenu.hide();
    });

        // Listener GENÉRICO para os botões DENTRO do nosso menu customizado
        html.on('click', '.custom-context-menu .context-item', async ev => { // Adicionado async
          const button = ev.currentTarget;
          const itemId = customMenu.data("itemId");
          const action = $(button).data("action");
          const value = $(button).data("value");
          
          if (itemId) {
            const item = this.actor.items.get(itemId);
            if (!item) return;

            if (action === 'update-location') {
              await item.update({ "system.location": value });
            } else if (action === 'update-skill-block') {
              await item.update({ "system.block_id": value });
            }
          }
          
          customMenu.hide();
          this.render(false); // MUDANÇA: Força o redesenho da ficha
        });

        // Listener para esconder o menu quando se clica em qualquer outro lugar
        $(document).on('click', (ev) => {
          if (!$(ev.target).closest('.item-move, .item-move-skill, .custom-context-menu').length) {
            customMenu.hide();
          }
        });

        // NOVO: Bloqueador do menu do navegador para os ícones
        html.on('contextmenu', '.item-move, .item-move-skill', ev => {
          ev.preventDefault();
        });
          
        // ============================================================= //
        //    NOVOS LISTENERS PARA RESERVAS DE ENERGIA (SEPARADOS)       //
        // ============================================================= //

        // Listener para ADICIONAR uma reserva
        html.on('click', '.add-energy-reserve', ev => {
            const reserveType = ev.currentTarget.dataset.reserveType; // 'spell' ou 'power'
            if (!reserveType) return;

            const newReserve = { name: "Nova Reserva", source: "Geral", current: 10, max: 10 };
            const newKey = `system.${reserveType}_reserves.${foundry.utils.randomID()}`;
            this.actor.update({ [newKey]: newReserve });
        });

        // Listener para SALVAR alterações diretas nos inputs
        html.on('change', '.reserve-card input[type="number"]', ev => {
            const input = ev.currentTarget;
            const reserveCard = input.closest('.reserve-card');
            const reserveType = reserveCard.dataset.reserveType; // 'spell' ou 'power'
            const reserveId = reserveCard.dataset.reserveId;
            const property = input.dataset.property;

            if (!reserveType || !reserveId || !property) return;

            const value = Number(input.value);
            const key = `system.${reserveType}_reserves.${reserveId}.${property}`;
            this.actor.update({ [key]: value });
        });

        // Listener para EDITAR uma reserva via diálogo
        html.on('click', '.edit-energy-reserve', ev => {
            const reserveCard = ev.currentTarget.closest(".reserve-card");
            const reserveType = reserveCard.dataset.reserveType; // 'spell' ou 'power'
            const reserveId = reserveCard.dataset.reserveId;
            if (!reserveId || !reserveType) return;

            const reserve = this.actor.system[`${reserveType}_reserves`][reserveId];
            new Dialog({
                title: `Editar Reserva: ${reserve.name}`,
                content: `
                <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${reserve.name}"/></div>
                <div class="form-group"><label>Fonte:</label><input type="text" name="source" value="${reserve.source}"/></div>
                <div class="form-group"><label>Atual:</label><input type="number" name="current" value="${reserve.current}"/></div>
                <div class="form-group"><label>Máximo:</label><input type="number" name="max" value="${reserve.max}"/></div>
                `,
                buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>', label: 'Salvar',
                    callback: (html) => {
                    const updateKey = `system.${reserveType}_reserves.${reserveId}`;
                    this.actor.update({
                        [`${updateKey}.name`]: html.find('input[name="name"]').val(),
                        [`${updateKey}.source`]: html.find('input[name="source"]').val(),
                        [`${updateKey}.current`]: parseInt(html.find('input[name="current"]').val()),
                        [`${updateKey}.max`]: parseInt(html.find('input[name="max"]').val())
                    });
                    }
                }
                }
            }).render(true);
        });

        // Listener para DELETAR uma reserva
        html.on('click', '.delete-energy-reserve', ev => {
            const reserveCard = ev.currentTarget.closest(".reserve-card");
            const reserveType = reserveCard.dataset.reserveType; // 'spell' ou 'power'
            const reserveId = reserveCard.dataset.reserveId;
            if (!reserveId || !reserveType) return;

            Dialog.confirm({
                title: "Deletar Reserva",
                content: "<p>Você tem certeza que quer deletar esta reserva de energia?</p>",
                yes: () => {
                    const deleteKey = `system.${reserveType}_reserves.-=${reserveId}`;
                    this.actor.update({ [deleteKey]: null });
                },
                no: () => {},
                defaultYes: false
            });
        });

        html.on('click', '.edit-combat-meter', ev => { 
          const meterId = $(ev.currentTarget).parents(".meter-card").data("meterId"); 
          const meter = this.actor.system.combat.combat_meters[meterId]; 
          new Dialog({ title: `Editar Registro: ${meter.name}`, 
            content: `
              <div class="form-group"><label>Nome:</label><input type="text" name="name" value="${meter.name}"/></div>
              <div class="form-group"><label>Atual:</label><input type="number" name="current" value="${meter.current}"/></div>
              <div class="form-group"><label>Máximo:</label><input type="number" name="max" value="${meter.max}"/></div>
              `, 
            buttons: { 
              save: { 
                icon: '<i class="fas fa-save"></i>', 
                label: 'Salvar', 
                callback: (html) => { 
                  const updateKey = `system.combat.combat_meters.${meterId}`; 
                  this.actor.update({ 
                    [`${updateKey}.name`]: html.find('input[name="name"]').val(),
                    [`${updateKey}.current`]: parseInt(html.find('input[name="current"]').val()), 
                    [`${updateKey}.max`]: parseInt(html.find('input[name="max"]').val())
                    }); 
                  } 
                } 
              }
            }).render(true); 
          });
        html.on('click', '.delete-combat-meter', ev => { const meterId = $(ev.currentTarget).parents(".meter-card").data("meterId"); Dialog.confirm({ title: "Deletar Registro", content: "<p>Você tem certeza que quer deletar este registro?</p>", yes: () => { const deleteKey = `system.combat.combat_meters.-=${meterId}`; this.actor.update({ [deleteKey]: null }); }, no: () => {}, defaultYes: false }); });
          
        
        
         

// ================================================================== //
//   LISTENER DE ROLAGEM DE DANO (VERSÃO FINAL E UNIFICADA)           //
// ================================================================== //

html.on('click', '.rollable-damage', async (ev) => {
    ev.preventDefault();
    const element = ev.currentTarget;
    let normalizedAttack; // Objeto padronizado para guardar os dados do ataque/magia

    // --- ✅ INÍCIO DA LÓGICA DE NORMALIZAÇÃO DE DADOS ✅ ---
    const itemId = $(element).closest(".item-row").data("itemId");

    if (itemId) { // O clique veio de um item da lista (Magia)
        const item = this.actor.items.get(itemId);
        if (!item || !item.system.damage?.formula) {
            return ui.notifications.warn("Esta magia não possui uma fórmula de dano válida.");
        }
        // Traduz os dados da magia para o nosso formato padronizado
        normalizedAttack = {
            name: item.name,
            formula: item.system.damage.formula,
            type: item.system.damage.type,
            armor_divisor: item.system.damage.armor_divisor,
            follow_up_damage: item.system.damage.follow_up_damage,
            fragmentation_damage: item.system.damage.fragmentation_damage
        };

    } else { // O clique veio da Lista de Ataques manuais
        const attackId = $(element).closest(".attack-item").data("attackId");
        const groupId = $(element).closest('.attack-group-card').data('groupId');
        const attack = this.actor.system.combat.attack_groups[groupId]?.attacks[attackId];
        if (!attack || !attack.damage_formula) {
            return ui.notifications.warn("Este ataque não possui uma fórmula de dano válida.");
        }
        // Traduz os dados do ataque manual para o nosso formato padronizado
        normalizedAttack = {
            name: attack.name,
            formula: attack.damage_formula, // A única diferença de nome real está aqui
            type: attack.damage_type,
            armor_divisor: attack.armor_divisor,
            follow_up_damage: attack.follow_up_damage,
            fragmentation_damage: attack.fragmentation_damage
        };
    }
    // --- FIM DA LÓGICA DE NORMALIZAÇÃO ---


    // A partir daqui, a função só usa o objeto 'normalizedAttack', que sempre terá a mesma estrutura.
const performDamageRoll = async (modifier = 0) => {
    let totalRolls = [];
    
    // Rola o dano principal
    const cleanedFormula = (normalizedAttack.formula.match(/^[0-9dDkK+\-/*\s]+/) || ["0"])[0].trim();
    const mainRollFormula = cleanedFormula + (modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : '');
    const mainRoll = new Roll(mainRollFormula);
    await mainRoll.evaluate();
    totalRolls.push(mainRoll);

    // Rola os danos extras, se existirem
    let followUpRoll, fragRoll;
    if (normalizedAttack.follow_up_damage?.formula) {
        followUpRoll = new Roll(normalizedAttack.follow_up_damage.formula);
        await followUpRoll.evaluate();
        totalRolls.push(followUpRoll);
    }
    if (normalizedAttack.fragmentation_damage?.formula) {
        fragRoll = new Roll(normalizedAttack.fragmentation_damage.formula);
        await fragRoll.evaluate();
        totalRolls.push(fragRoll);
    }
    
    // Monta a 'pílula' de fórmula completa no topo do card
// Monta a 'pílula' de fórmula completa no topo do card
let fullFormula = `${mainRoll.formula}${normalizedAttack.armor_divisor && normalizedAttack.armor_divisor != 1 ? `(${normalizedAttack.armor_divisor})` : ''} ${normalizedAttack.type || ''}`;
if (followUpRoll) {
    let followUpText = `${normalizedAttack.follow_up_damage.formula}${normalizedAttack.follow_up_damage.armor_divisor && normalizedAttack.follow_up_damage.armor_divisor != 1 ? `(${normalizedAttack.follow_up_damage.armor_divisor})` : ''} ${normalizedAttack.follow_up_damage.type || ''}`;
    fullFormula += ` + ${followUpText}`;
}
if (fragRoll) {
    let fragText = `${normalizedAttack.fragmentation_damage.formula}${normalizedAttack.fragmentation_damage.armor_divisor && normalizedAttack.fragmentation_damage.armor_divisor != 1 ? `(${normalizedAttack.fragmentation_damage.armor_divisor})` : ''} ${normalizedAttack.fragmentation_damage.type || ''}`;
    fullFormula += ` [${fragText}]`;
}

    // ✅ INÍCIO DA MUDANÇA PRINCIPAL: MONTAGEM DO PACOTE DE DADOS ✅
    const damagePackage = {
        attackerId: this.actor.id,
        main: {
            total: mainRoll.total,
            type: normalizedAttack.type || '',
            armorDivisor: normalizedAttack.armor_divisor || 1
        }
    };
    if (followUpRoll) {
        damagePackage.followUp = {
            total: followUpRoll.total,
            type: normalizedAttack.follow_up_damage.type || '',
            armorDivisor: normalizedAttack.follow_up_damage.armor_divisor || 1
        };
    }
    if (fragRoll) {
        damagePackage.fragmentation = {
            total: fragRoll.total,
            type: normalizedAttack.fragmentation_damage.type || '',
            armorDivisor: normalizedAttack.fragmentation_damage.armor_divisor || 1
        };
    }
    // --- FIM DA MONTAGEM DO PACOTE ---


    // Monta o HTML do card de dano
    let flavor = `
        <div class="gurps-damage-card">
            <header class="card-header"><h3>${normalizedAttack.name || 'Dano'}</h3></header>
            <div class="card-formula-container"><span class="formula-pill">${fullFormula}</span></div>
            <div class="card-content">
                <div class="card-main-flex">
                    <div class="roll-column">
                        <span class="column-label">Dados</span>
                        <div class="individual-dice-damage">
                            ${mainRoll.dice.flatMap(d => d.results).map(r => `<span class="die-damage">${r.result}</span>`).join('')}
                        </div>
                    </div>
                    <div class="column-separator"></div>
                    <div class="target-column">
                        <span class="column-label">Dano Total</span>
                        <div class="damage-total">
                            <span class="damage-value">${mainRoll.total}</span>
                            <span class="damage-type">${normalizedAttack.type || ''}</span>
                        </div>
                    </div>
                </div>
            </div>
    `;

    // ✅ NOVA ESTRUTURA PARA DANOS EXTRAS ✅
    const hasExtraDamage = followUpRoll || fragRoll;
    if (hasExtraDamage) {
        flavor += `<footer class="card-footer">`;
        
        const createExtraDamageBlock = (roll, data, label) => {
            return `
                <div class="extra-damage-block">
                    <div class="extra-damage-label">${label}</div>
                    <div class="extra-damage-roll">
                        <span class="damage-value">${roll.total}</span>
                        <span class="damage-type">${data.type || ''}</span>
                    </div>
                </div>
            `;
        };

        if (followUpRoll) {
            flavor += createExtraDamageBlock(followUpRoll, normalizedAttack.follow_up_damage, "Acompanhamento");
        }
        if (fragRoll) {
            flavor += createExtraDamageBlock(fragRoll, normalizedAttack.fragmentation_damage, "Fragmentação");
        }

    // A tag de fechamento do rodapé vem aqui, FORA dos ifs individuais.
    flavor += `</footer>`;
}
    
    // ✅ BOTÃO ATUALIZADO: com o pacote de dados JSON em um rodapé separado ✅
    flavor += `
        <footer class="card-actions">
            <button type="button" class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
                <i class="fas fa-crosshairs"></i> Aplicar Dano
            </button>
        </footer>
    `;

    flavor += `</div>`; // Fecha o .gurps-damage-card

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: flavor,
        rolls: totalRolls,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL
    });
};
    
        // A sua lógica para abrir o diálogo de modificador com Shift+Click permanece a mesma
        if (ev.shiftKey) {
        // Encontra o 'label' do ataque para usar no título do diálogo
        const label = attack.name || "Ataque";
        
        new Dialog({
            title: "Modificador de Dano",
            content: `
                <div class="modifier-dialog" style="text-align: center;">
                    <p>Insira ou clique nos modificadores para o dano de <strong>${label}</strong>:</p>
                    <input type="number" name="modifier" value="0" style="text-align: center; margin-bottom: 10px; width: 80px;"/>
                    
                    <div class="modifier-grid" style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;">
                        <div class="mod-row" style="display: flex; justify-content: center; gap: 5px;">
                            <button type="button" class="mod-button" data-mod="-5">-5</button>
                            <button type="button" class="mod-button" data-mod="-4">-4</button>
                            <button type="button" class="mod-button" data-mod="-3">-3</button>
                            <button type="button" class="mod-button" data-mod="-2">-2</button>
                            <button type="button" class="mod-button" data-mod="-1">-1</button>
                        </div>
                        <div class="mod-row" style="display: flex; justify-content: center; gap: 5px;">
                            <button type="button" class="mod-button" data-mod="+1">+1</button>
                            <button type="button" class="mod-button" data-mod="+2">+2</button>
                            <button type="button" class="mod-button" data-mod="+3">+3</button>
                            <button type="button" class="mod-button" data-mod="+4">+4</button>
                            <button type="button" class="mod-button" data-mod="+5">+5</button>
                        </div>
                    </div>
                    <button type="button" class="mod-clear-button" title="Zerar modificador">Limpar</button>
                </div>
            `,
            buttons: {
                roll: {
                    icon: '<i class="fas fa-dice-d6"></i>',
                    label: "Rolar Dano",
                    callback: (html) => {
                        const modifier = parseInt(html.find('input[name="modifier"]').val()) || 0;
                        performDamageRoll(modifier);
                    }
                }
            },
            default: "roll",
            render: (html) => {
                // Lógica para fazer os botões funcionarem
                const input = html.find('input[name="modifier"]');
                html.find('.mod-button').click((event) => {
                    const currentMod = parseInt(input.val()) || 0;
                    const modToAdd = parseInt($(event.currentTarget).data('mod'));
                    input.val(currentMod + modToAdd);
                });
                html.find('.mod-clear-button').click(() => {
                    input.val(0);
                });
            }
        }).render(true);

    } else {
        performDamageRoll(0); // Rola o dano diretamente se não houver Shift
    }
    });


    // ================================================================== //
    //    LISTENER PARA O POP-UP DA TABELA DE LOCAIS DE ACERTO (INTERATIVO) //
    // ================================================================== //
    html.on('click', '.view-hit-locations', async ev => {
        ev.preventDefault();
        const actor = this.actor;
        const sheetData = await this.getData();
        
        let tableRows = '';
        for (const [key, loc] of Object.entries(sheetData.hitLocations)) {
            const armorDR = parseInt(sheetData.actor.system.combat.dr_from_armor[key] || 0);
            const modDR = parseInt(actor.system.combat.dr_mods[key] || 0);
            const totalDR = armorDR + modDR;

            tableRows += `
                <div class="table-row">
                    <div class="loc-label">${loc.label}</div>
                    <div class="loc-rd-armor">${armorDR}</div>
                    <div class="loc-rd-mod">
                        <input type="number" name="${key}" value="${modDR}" data-armor-dr="${armorDR}" />
                    </div>
                    <div class="loc-rd-total"><strong>${totalDR}</strong></div>
                </div>
            `;
        }

        const content = `
            <form>
                <div class="gurps-rd-table">
                    <div class="table-header">
                        <div>Local</div>
                        <div>RD Arm.</div>
                        <div>Outra RD</div>
                        <div>Total</div>
                    </div>
                    <div class="table-body">
                        ${tableRows}
                    </div>
                </div>
            </form>
        `;

        new Dialog({
            title: "Tabela de Locais de Acerto e RD",
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar Modificadores",
                    callback: (html) => {
                        const form = html.find('form')[0];
                        const formData = new FormDataExtended(form).object;
                        actor.update({ "system.combat.dr_mods": formData });
                    }
                }
            },
            default: "save",
            options: {
                classes: ["dialog", "gurps-rd-dialog"],
                width: 450
            },
            // --- MUDANÇA: Funcionalidade interativa adicionada aqui ---
            render: (html) => {
                // Adiciona um listener para qualquer input nos campos de 'Outra RD'
                html.find('.loc-rd-mod input').on('input', (event) => {
                    const input = $(event.currentTarget);
                    const row = input.closest('.table-row'); // Encontra a linha pai do input
                    
                    // Pega o valor da armadura que guardamos no próprio input
                    const armorDR = parseInt(row.find('.loc-rd-armor').text() || 0);
                    
                    // Pega o novo valor do modificador que o usuário digitou
                    const modDR = parseInt(input.val() || 0);
                    
                    // Recalcula o total
                    const newTotal = armorDR + modDR;
                    
                    // Encontra a célula do total na mesma linha e atualiza o valor
                    row.find('.loc-rd-total strong').text(newTotal);
                });

                // O listener para salvar com 'Enter' continua útil
                html.find('input').on('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        html.closest('.dialog').find('.dialog-button.save').trigger('click');
                    }
                });
            }
        }).render(true);
    });

          // ================================================================== //
    //    LISTENER PARA O POP-UP DE GERENCIAMENTO DE REGISTROS DE COMBATE   //
    // ================================================================== //
    html.on('click', '.manage-meters', ev => {
      ev.preventDefault();
      const actor = this.actor;
      const meters = actor.system.combat.combat_meters || {};

      // Monta o corpo da tabela para o diálogo, listando cada registro
      let meterRows = '';
      for (const [id, meter] of Object.entries(meters)) {
        meterRows += `
          <div class="item-row meter-card" data-meter-id="${id}">
            <span class="item-name">${meter.name}</span>
            <div class="meter-inputs">
              <input type="number" data-path="system.combat.combat_meters.${id}.current" value="${meter.current}"/>
              <span>/</span>
              <input type="number" data-path="system.combat.combat_meters.${id}.max" value="${meter.max}"/>
            </div>
            <div class="item-controls">
              <a class="item-control pop-up-edit-meter" title="Editar"><i class="fas fa-edit"></i></a>
              <a class="item-control pop-up-delete-meter" title="Deletar"><i class="fas fa-trash"></i></a>
            </div>
          </div>
        `;
      }

      const content = `<form><div class="meter-list">${meterRows || '<p style="text-align:center; opacity:0.7;">Nenhum registro criado.</p>'}</div></form>`;

      // Cria o Diálogo (Pop-up)
      new Dialog({
        title: "Gerenciar Registros de Combate",
        content: content,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Fechar"
          }
        },
        render: (html) => {
          // Adiciona os listeners para os botões DENTRO do pop-up

          // Listener para salvar alterações nos inputs
          html.find('.meter-inputs input').change(async ev => {
            const input = ev.currentTarget;
            const key = input.dataset.path;
            const value = Number(input.value);
            await actor.update({ [key]: value });
          });

          // Listener para o botão de editar DENTRO do pop-up
          html.find('.pop-up-edit-meter').click(ev => {
            const meterId = $(ev.currentTarget).closest(".meter-card").data("meterId");
            const meter = actor.system.combat.combat_meters[meterId];
            // Reutiliza a lógica de diálogo que já tínhamos
            new Dialog({
              title: `Editar Registro: ${meter.name}`,
              content: `<div class="form-group"><label>Nome:</label><input type="text" name="name" value="${meter.name}"/></div><div class="form-group"><label>Máximo:</label><input type="number" name="max" value="${meter.max}"/></div>`,
              buttons: {
                save: {
                  icon: '<i class="fas fa-save"></i>', label: 'Salvar',
                  callback: (html) => {
                    const updateKey = `system.combat.combat_meters.${meterId}`;
                    actor.update({
                      [`${updateKey}.name`]: html.find('input[name="name"]').val(),
                      [`${updateKey}.max`]: parseInt(html.find('input[name="max"]').val())
                    });
                  }
                }
              }
            }).render(true);
          });

          // Listener para o botão de deletar DENTRO do pop-up
          html.find('.pop-up-delete-meter').click(ev => {
            const meterId = $(ev.currentTarget).closest(".meter-card").data("meterId");
            const entry = actor.system.combat.combat_meters[meterId];
            Dialog.confirm({
              title: "Deletar Registro",
              content: `<p>Você tem certeza que quer deletar <strong>${entry.name}</strong>?</p>`,
              yes: () => actor.update({ [`system.combat.combat_meters.-=${meterId}`]: null }),
              no: () => {},
              defaultYes: false
            });
          });
        }
      }).render(true);
    }); 
  
    html.on('click', '.manual-override-toggle', async (ev) => {
    const checkbox = ev.currentTarget;
    const itemId = checkbox.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
        await item.setFlag('gum', 'manual_override', checkbox.checked);
         this.render(false); // Reavalia as condições
    }
});

}

// ================================================================== //
//  ✅ RESTAURE ESTA FUNÇÃO DENTRO DA SUA CLASSE DA FICHA DE PERSONAGEM ✅
// ================================================================== //

/**
 * Abre o diálogo para criar ou editar um modo de ataque.
 * VERSÃO FINAL E CORRIGIDA.
 * @private
 */
async _openAttackCreationDialog(groupId, attackType, options = {}) {
    const isEditing = Boolean(options.attackId);
    const attackData = isEditing ? options.attackData : {};
    
    // ✅ CORREÇÃO PRINCIPAL: Capturamos o ID do ataque aqui fora para evitar erros de escopo.
    const attackId = isEditing ? options.attackId : null;

    const dialogTitle = isEditing ? `Editar Ataque: ${attackData.name}` : "Criar Novo Ataque";

    // --- Montagem do Formulário HTML Reorganizado ---
    const getFormContent = (type, data) => {
        
        // Grupo 1: Identificação e Habilidade
        const identityFields = `
            <div class="form-section">
                <h4 class="section-title">Identificação</h4>
                <div class="form-group">
                    <label>Nome / Modo de Uso</label>
                    <input type="text" name="name" value="${data.name || 'Ataque'}"/>
                </div>
                <div class="form-grid-2">
                    <div class="form-group"><label>Perícia</label><input type="text" name="skill_name" value="${data.skill_name || ''}"/></div>
                    <div class="form-group input-narrow"><label>NH</label><input type="number" name="skill_level" value="${data.skill_level ?? 10}"/></div>
                </div>
            </div>
        `;

        // Grupo 2: Atributos de Ataque
        let specificFields = '';
        if (type === "melee") {
            specificFields = `
                <div class="form-section">
                    
                    <div class="form-grid-2">
                        <div class="form-group input-medium"><label>Alcance</label><input type="text" name="reach" value="${data.reach || 'C,1'}"/></div>
                        <div class="form-group input-narrow"><label>Defesa (Apr/Blq)</label><input type="text" name="defense" value="${data.defense ?? '0'}"/></div>
                    </div>
                </div>
            `;
        } else { // Ranged
            specificFields = `
                <div class="form-section">
                    
                    <div class="form-grid-3">
                        <div class="form-group input-narrow"><label>Prec.</label><input type="text" name="accuracy" value="${data.accuracy || ''}"/></div>
                        <div class="form-group input-medium"><label>Alcance</label><input type="text" name="range" value="${data.range || ''}"/></div>
                        <div class="form-group input-narrow"><label>CdT</label><input type="text" name="rof" value="${data.rof || ''}"/></div>
                        <div class="form-group input-narrow"><label>Tiros</label><input type="text" name="shots" value="${data.shots || ''}"/></div>
                        <div class="form-group input-narrow"><label>RCO</label><input type="text" name="rcl" value="${data.rcl || ''}"/></div>
                    </div>
                </div>
            `;
        }

        // Grupo 3: Dano
        const damageFields = `
            <div class="form-section">
                <h5 class="subheader">Dano</h5>
                <div class="form-grid-3">
                    <div class="form-group"><label>Fórmula</label><input type="text" name="damage_formula" value="${data.damage_formula || ''}"/></div>
                    <div class="form-group input-narrow"><label>Tipo</label><input type="text" name="damage_type" value="${data.damage_type || ''}"/></div>
                    <div class="form-group input-narrow"><label>Divisor</label><input type="number" step="0.1" name="armor_divisor" value="${data.armor_divisor || 1}"/></div>
                </div>
                
                
                <details class="advanced-options">
                    <summary>Danos Secundários</summary>
                    <div class="advanced-damage-fields">
                        <h5 class="subheader">Dano de Acompanhamento</h5>
                        <div class="form-grid-3">
                            <div class="form-group"><label>Fórmula</label><input type="text" name="follow_up_damage.formula" value="${data.follow_up_damage?.formula || ''}" /></div>
                            <div class="form-group"><label>Tipo</label><input type="text" name="follow_up_damage.type" value="${data.follow_up_damage?.type || ''}" /></div>
                            <div class="form-group"><label>Divisor</label><input type="number" step="0.1" name="follow_up_damage.armor_divisor" value="${data.follow_up_damage?.armor_divisor || 1}" /></div>
                        </div>
                        <h5 class="subheader">Dano de Fragmentação</h5>
                        <div class="form-grid-3">
                            <div class="form-group"><label>Fórmula</label><input type="text" name="fragmentation_damage.formula" value="${data.fragmentation_damage?.formula || ''}" /></div>
                            <div class="form-group"><label>Tipo</label><input type="text" name="fragmentation_damage.type" value="${data.fragmentation_damage?.type || ''}" /></div>
                            <div class="form-group"><label>Divisor</label><input type="number" step="0.1" name="fragmentation_damage.armor_divisor" value="${data.fragmentation_damage?.armor_divisor || 1}" /></div>
                        </div>
                    </div>
                </details>
            </div>
        `;
        
        const hiddenTypeField = `<input type="hidden" name="attack_type" value="${type}" />`;
        return `<form class="gurps-dialog-form">${identityFields}${specificFields}${damageFields}${hiddenTypeField}</form>`;
    };
    
    new Dialog({
        title: dialogTitle,
        content: getFormContent(attackType, attackData),
        buttons: {
            save: {
                icon: '<i class="fas fa-save"></i>',
                label: isEditing ? "Salvar" : "Criar",
                callback: (html) => {
                    const form = html.find("form")[0];
                    const formData = new FormDataExtended(form, { dtypes: ["Number"] }).object;
                    
                    if (isEditing) {
                        // Usa a variável 'attackId' que foi capturada fora do callback
                        const updateKey = `system.combat.attack_groups.${groupId}.attacks.${attackId}`;
                        this.actor.update({ [updateKey]: formData });
                    } else {
                        const newAttackKey = `system.combat.attack_groups.${groupId}.attacks.${foundry.utils.randomID()}`;
                        this.actor.update({ [newAttackKey]: formData });
                    }
                }
            }
        },
        default: 'save'
    }, {
        classes: ["dialog", "gum", "gurps-attack-dialog"],
        width: 520,
        height: "auto",
        resizable: true
    }).render(true);
  }
      }

// ================================================================== //
//  CLASSE DA FICHA DO ITEM (GurpsItemSheet) - VERSÃO FINAL COMPLETA  //
// ================================================================== //
class GurpsItemSheet extends ItemSheet {
  static get defaultOptions() { 
    return foundry.utils.mergeObject(super.defaultOptions, { 
      classes: ["gum", "sheet", "item", "theme-dark"],
      width: 450,
      height: 495,
      template: "systems/gum/templates/items/item-sheet.hbs",
      tabs: [{ 
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body-content",
        initial: "details"
      }]
    }); 
  }

  async getData(options) { 
    const context = await super.getData(options); 
    context.system = this.item.system;  
    context.characteristic_blocks = { "block1": "Traços Raciais", "block2": "Vantagens", "block3": "Desvantagens", "block4": "Constituição Física" };
    
    // Lógica de cálculo de custo final
    const validTypes = ['advantage', 'disadvantage', 'power'];
    if (validTypes.includes(this.item.type)) {
      const basePoints = Number(this.item.system.points) || 0;
      const modifiers = this.item.system.modifiers || {};
      let totalModPercent = 0;
      for (const modifier of Object.values(modifiers)) {
        totalModPercent += parseInt(modifier.cost, 10) || 0;
      }
      const cappedModPercent = Math.max(-80, totalModPercent);
      const multiplier = 1 + (cappedModPercent / 100);
      let finalCost = Math.round(basePoints * multiplier);
      if (basePoints > 0 && finalCost < 1) finalCost = 1;
      if (basePoints < 0 && finalCost > -1) finalCost = -1;
      context.calculatedCost = { totalModifier: cappedModPercent, finalPoints: finalCost };
    }

    // Lógica de ordenação e preparação dos modificadores
    const modifiersObj = this.item.system.modifiers || {};
    const modifiersArray = Object.entries(modifiersObj).map(([id, data]) => {
      const isLimitation = (data.cost || "").includes('-');
      return { id, ...data, isLimitation: isLimitation };
    });
    modifiersArray.sort((a, b) => {
      const costA = parseInt(a.cost) || 0; const costB = parseInt(b.cost) || 0;
      if (costB !== costA) return costB - costA;
      return a.name.localeCompare(b.name);
    });
    context.sortedModifiers = modifiersArray;

    // Lógica de preparação da descrição para o template
        context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, {
            secrets: this.item.isOwner,
            async: true
        });
        context.enrichedChatDescription = await TextEditor.enrichHTML(this.item.system.chat_description, {
            secrets: this.item.isOwner,
            async: true
        });

    return context; 
  }

  async _updateObject(event, formData) {
    const fullFormData = new FormDataExtended(this.form).object;
    for (const key in fullFormData) {
      if (typeof fullFormData[key] === 'string' && fullFormData[key].includes(',')) {
        fullFormData[key] = fullFormData[key].replace(',', '.');
      }
    }
    return this.object.update(fullFormData);
  }

 _getSubmitData(updateData) {
        // Primeiro, chama o método original
        const data = super._getSubmitData(updateData);
        
        // Agora, encontra todas as seções <details> e anota quais estão abertas
        const openDetails = [];
        this.form.querySelectorAll('details').forEach((detailsEl, index) => {
            if (detailsEl.open) {
                // Usamos o texto do <summary> ou um índice como identificador único
                const summaryText = detailsEl.querySelector('summary')?.innerText || `details-${index}`;
                openDetails.push(summaryText);
            }
        });
        // Armazena essa informação temporariamente na própria ficha
        this._openDetailsState = openDetails;

        return data;
    }

    /**
     * ✅ NOVO MÉTODO 2: Restaura o estado da UI após a ficha ser redesenhada.
     * Este método é chamado automaticamente pelo Foundry após a renderização.
     */
    async _render(force, options) {
        await super._render(force, options);
        
        // Se temos um estado de seções abertas salvo...
        if (this._openDetailsState) {
            // ...procuramos por todas as seções <details> na ficha recém-renderizada.
            this.form.querySelectorAll('details').forEach((detailsEl, index) => {
                const summaryText = detailsEl.querySelector('summary')?.innerText || `details-${index}`;
                // Se o identificador desta seção estiver na nossa lista...
                if (this._openDetailsState.includes(summaryText)) {
                    // ...nós a abrimos.
                    detailsEl.open = true;
                }
            });
        }
    }
  
  /**
 * @override
 * Ativa todos os listeners de interatividade da ficha de item.
 * ESTA É A VERSÃO FINAL E COMPLETA.
 */
activateListeners(html) {
    super.activateListeners(html);

    // Impede a ativação de listeners se o usuário não tiver permissão para editar.
    if (!this.isEditable) return;

    // --- Listener para o botão de EDITAR DESCRIÇÃO ---
    html.find('.edit-text-btn').on('click', (ev) => {
        // Encontra o nome do campo a ser editado (ex: "system.description")
        const fieldName = $(ev.currentTarget).data('target');
        const title = $(ev.currentTarget).attr('title');
        
        // Pega o conteúdo bruto atual do item
        const currentContent = getProperty(this.item.system, fieldName.replace('system.', '')) || "";

        // Abre o pop-up de edição
        new Dialog({
            title: title,
            content: `<form><textarea name="content" style="width: 100%; height: 300px;">${currentContent}</textarea></form>`,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const newContent = html.find('textarea[name="content"]').val();
                        this.item.update({ [fieldName]: newContent });
                    }
                }
            },
            default: "save"
        }, { width: 500, height: 400, resizable: true }).render(true);
    });

    // --- Listener para ADICIONAR um modificador ---
    html.find('.add-modifier').on('click', (ev) => {
        ev.preventDefault();
        // Assumindo que você tem uma classe 'ModifierBrowser' definida em outro lugar
        new ModifierBrowser(this.item).render(true);
    });

    // --- Listener para DELETAR um modificador ---
    html.find('.delete-modifier').on('click', (ev) => {
        ev.preventDefault();
        const modifierId = $(ev.currentTarget).data('modifier-id');
        if (modifierId) {
            Dialog.confirm({
                title: "Remover Modificador",
                content: "<p>Você tem certeza que deseja remover este modificador?</p>",
                yes: () => {
                    this.item.update({ [`system.modifiers.-=${modifierId}`]: null });
                },
                no: () => {}
            });
        }
    });

    // --- Listener para VISUALIZAR os detalhes de um modificador ---
   html.find('.view-modifier').on('click', async (ev) => {
    ev.preventDefault();
    const modifierId = $(ev.currentTarget).data('modifier-id');
    const modifierData = this.item.system.modifiers[modifierId];
    if (!modifierData) return;

    // Enriquece a descrição do modificador para exibir corretamente
    const description = await TextEditor.enrichHTML(modifierData.description || "<i>Sem descrição.</i>", { async: true });

    // ✅ Monta o conteúdo usando nossas classes de design já existentes ✅
    const content = `
        <div class="sheet-body-content">
            <div class="form-section">
                <h4 class="section-title">Detalhes do Modificador</h4>
                <div class="summary-list">
                    <div class="summary-item">
                        <label>Custo:</label>
                        <span class="summary-dots"></span>
                        <span class="value">${modifierData.cost}</span>
                    </div>
                    <div class="summary-item">
                        <label>Referência:</label>
                        <span class="summary-dots"></span>
                        <span class="value">${modifierData.ref || 'N/A'}</span>
                    </div>
                </div>
                <hr class="summary-divider">
                <div class="summary-description rendered-text">
                    ${description}
                </div>
            </div>
        </div>
    `;

    // Cria e renderiza o diálogo
    new Dialog({
        title: `Detalhes: ${modifierData.name}`,
        content: content,
        buttons: {
            close: {
                label: "Fechar",
                icon: '<i class="fas fa-times"></i>'
            }
        },
        default: "close",
       }, {
        // Define um tamanho padrão para a janela
        width: 420,
        height: "auto",
        resizable: true,
        classes: ["dialog", "modifier-preview-dialog"]
    }).render(true);
});

// --- Listener para ADICIONAR um Modo de Ataque (Melee ou Ranged) ---
html.find('.add-attack').on('click', (ev) => {
    const attackType = $(ev.currentTarget).data('type');
    const newAttackId = foundry.utils.randomID(16);
    let newAttackData;
    let path;

    if (attackType === 'melee') {
        path = `system.melee_attacks.${newAttackId}`;
        newAttackData = { mode: "Novo Modo C.C.", damage_formula: "", reach: "", parry: "", min_strength: 0 };
    } else {
        path = `system.ranged_attacks.${newAttackId}`;
        newAttackData = { mode: "Novo Modo L.D.", damage_formula: "", accuracy: "", range: "", rof: "", shots: "", rcl: "", min_strength: 0 };
    }

    this.item.update({ [path]: newAttackData });
});

// --- Listener para DELETAR um Modo de Ataque (Melee ou Ranged) ---
html.find('.delete-attack').on('click', (ev) => {
    const target = $(ev.currentTarget);
    const attackId = target.closest('.attack-item').data('attack-id');
    const listName = target.data('list'); // 'melee_attacks' ou 'ranged_attacks'
    const attack = this.item.system[listName][attackId];

    if (!attackId || !attack) return;

    Dialog.confirm({
        title: `Deletar Modo de Ataque "${attack.mode}"`,
        content: "<p>Você tem certeza?</p>",
        yes: () => {
            this.item.update({ [`system.${listName}.-=${attackId}`]: null });
        },
        no: () => {},
        defaultYes: false
    });
});
}


}