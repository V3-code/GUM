
/**
 * O "Motor de Efeitos" central do sistema. (Versão 5.0 - Rollback Controlado)
 * Lida com tipos de efeitos separados:
 * - 'attribute'/'flag'/'roll_modifier': Cria ActiveEffects para mecânica e duração.
 * - 'status': Usa toggleStatusEffect para controlar ícones no token.
 * - 'resource_change', 'macro', 'chat': Executam ações pontuais.
 */
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

export async function applySingleEffect(effectItem, targets, context = {}) {
    if (!effectItem || targets.length === 0) return;

    const effectSystem = effectItem.system;
    const conditionFlags = context.conditionId
        ? { conditionEffect: true, conditionId: context.conditionId }
        : {};
    const evaluateEffectValue = (value, actor) => {
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "") return 0;
            try {
                return new Function("actor", "game", `return (${trimmed});`)(actor, game);
            } catch (error) {
                console.warn(`GUM | Não foi possível avaliar o valor do efeito "${effectItem.name}":`, error);
                return value;
            }
        }
        return value;
    };
    
    switch (effectSystem.type) {

        // =======================================================
        // CASOS QUE CRIAM ACTIVE EFFECT (Attribute e Flag - Simplificados)
        // NÃO controlam mais o ícone de status diretamente.
        // =======================================================
        case 'attribute':
        case 'flag': {
            for (const targetToken of targets) {
                const targetActor = targetToken.actor;
                const activeEffectData = {
                    name: effectItem.name,
                    img: effectItem.img, // Sempre a imagem do Item Efeito
                    origin: context.origin ? context.origin.uuid : (context.actor ? context.actor.uuid : null),
                    changes: [],
                    statuses: [], // Lista nativa VAZIA
                    flags: {
                        gum: {
                            effectUuid: effectItem.uuid,
                            duration: foundry.utils.duplicate(effectSystem.duration || {}),
                            ...conditionFlags
                        }
                    }
                };


               // =============================================================
                // ✅ LÓGICA DE DURAÇÃO FINAL (Sincronizada com createItem)
                // =============================================================
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
                    // Marca o ponto de início para que a expiração funcione corretamente
                    activeEffectData.duration.startRound = game.combat?.round ?? null;
                    activeEffectData.duration.startTurn = game.combat?.turn ?? null;
                    activeEffectData.duration.startTime = game.time?.worldTime ?? null;
                }

                // Flag core.statusId (Importante para duração, usa slug do nome como fallback)
                
                const coreStatusId = effectItem.name.slugify({strict: true});
                foundry.utils.setProperty(activeEffectData, "flags.core.statusId", coreStatusId);

                // Lógica Mecânica
  if (effectSystem.type === 'attribute') {
                    const computedValue = evaluateEffectValue(effectSystem.value, targetActor);
                    const change = {
                        key: effectSystem.path,
                        mode: effectSystem.operation === 'OVERRIDE' ? CONST.ACTIVE_EFFECT_MODES.OVERRIDE : CONST.ACTIVE_EFFECT_MODES.ADD,
                        value: computedValue
                    };
                    activeEffectData.changes.push(change);
                } else if (effectSystem.type === 'flag') {
                    let valueToSet = effectSystem.flag_value === "true" ? true : effectSystem.flag_value === "false" ? false : effectSystem.flag_value;
                    foundry.utils.setProperty(activeEffectData.flags, `gum.${effectSystem.key}`, valueToSet);
                }

if (effectSystem.attachedStatusId) {
                    activeEffectData.statuses.push(effectSystem.attachedStatusId);
                    // Não usamos mais flags.gum.statusId nem toggleStatusEffect aqui
                }

 await targetActor.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
                // Renderiza a ficha para mostrar a pílula
                targetActor.sheet.render(false); 
            }
            break;
        }

        // =======================================================
        // CASO ROLL_MODIFIER (ActiveEffect para modificadores de rolagem)
        // =======================================================
        case 'roll_modifier': {
            for (const targetToken of targets) {
                const targetActor = targetToken.actor;
                const activeEffectData = {
                    name: effectItem.name,
                    img: effectItem.img,
                    origin: context.origin ? context.origin.uuid : (context.actor ? context.actor.uuid : null),
                    changes: [],
                    statuses: [],
                    flags: {
                        gum: {
                            effectUuid: effectItem.uuid,
                            duration: foundry.utils.duplicate(effectSystem.duration || {}),
                            rollModifier: {
                                value: effectSystem.roll_modifier_value ?? effectSystem.value ?? 0,
                                cap: effectSystem.roll_modifier_cap ?? "",
                                context: effectSystem.roll_modifier_context ?? "all"
                            },
                            ...conditionFlags
                        }
                    }
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

                const coreStatusId = effectItem.name.slugify({ strict: true });
                foundry.utils.setProperty(activeEffectData, "flags.core.statusId", coreStatusId);

                if (effectSystem.attachedStatusId) {
                    activeEffectData.statuses.push(effectSystem.attachedStatusId);
                }

                await targetActor.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
                targetActor.sheet.render(false);
            }
            break;
        }

       // =======================================================
        // CASO STATUS (RESTAURADO - Usa toggleStatusEffect)
        // Controla apenas o ícone visual no token.
        // =======================================================
        case 'status': {
            if (!effectSystem.statusId) break; // Precisa de um ID de status
            
            for (const targetToken of targets) {
                const targetActor = targetToken.actor;
                const statusId = effectSystem.statusId;

                const activeEffectData = {
                    name: effectItem.name,
                    img: effectItem.img,
                    origin: context.origin ? context.origin.uuid : (context.actor ? context.actor.uuid : null),
                    changes: [],
                    statuses: [statusId],
                    flags: {
                        core: { statusId },
                        gum: {
                            effectUuid: effectItem.uuid,
                            duration: foundry.utils.duplicate(effectSystem.duration || {}),
                            ...conditionFlags
                        }
                    }
                };

                // Duração (mesma lógica dos outros tipos)
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

                await targetActor.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
                targetActor.sheet.render(false); 
            }
            break;
        }
        // =======================================================
        // CASO RESOURCE_CHANGE (Inalterado)
        // =======================================================
        case 'resource_change': {
            let valueToChange = effectSystem.value;

            if (effectSystem.confirm_prompt) {
                const confirmed = await Dialog.confirm({
                    title: "Confirmar Ação",
                    content: `<p>Deseja aplicar o efeito "${effectItem.name}"?</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: true
                });
                if (!confirmed) return;
            }
            if (effectSystem.variable_value) {
                const newAmount = await new Promise(resolve => {
                    new Dialog({
                        title: "Definir Valor",
                        content: `<p>Qual o valor para "${effectItem.name}"?</p><input type="text" name="amount" value="${valueToChange}"/>`,
                        buttons: { apply: { label: "Aplicar", callback: (html) => resolve(html.find('input[name="amount"]').val()) } },
                        default: "apply",
                        close: () => resolve(null)
                    }).render(true);
                });
                if (newAmount === null) return;
                valueToChange = newAmount;
            }

            const roll = new Roll(String(valueToChange));
            await roll.evaluate();
            const finalValue = roll.total;
            
            for (const targetToken of targets) {
                const targetActor = targetToken.actor;
                let updatePath = "";
                let updateObject = null;
                
                switch (effectSystem.category) {
                    case 'hp': updatePath = 'system.attributes.hp.value'; break;
                    case 'fp': updatePath = 'system.attributes.fp.value'; break;
                    case 'energy_reserve': { const reserveKey = Object.keys(targetActor.system.spell_reserves || {}).find(k => targetActor.system.spell_reserves[k].name === effectSystem.name) || Object.keys(targetActor.system.power_reserves || {}).find(k => targetActor.system.power_reserves[k].name === effectSystem.name);
                        if (reserveKey) {
                            updatePath = targetActor.system.spell_reserves[reserveKey] ? `system.spell_reserves.${reserveKey}.current` : `system.power_reserves.${reserveKey}.current`;
                        } break; }
                    case 'combat_tracker': { const trackerKey = Object.keys(targetActor.system.combat.combat_meters || {}).find(k => targetActor.system.combat.combat_meters[k].name === effectSystem.name);
                         if (trackerKey) updatePath = `system.combat.combat_meters.${trackerKey}.current`; break; }
                    case 'item_quantity': { const itemToUpdate = targetActor.items.find(i => i.name === effectSystem.name);
                        if (itemToUpdate) {
                            const newQuantity = (itemToUpdate.system.quantity || 0) + finalValue;
                            updateObject = itemToUpdate.update({'system.quantity': newQuantity});
                        } break; }
                }
                
                if (updateObject) await updateObject;
                else if (updatePath) {
                    const currentValue = foundry.utils.getProperty(targetActor, updatePath) || 0;
                    await targetActor.update({ [updatePath]: currentValue + finalValue });
                }
                if (effectSystem.chat_notice) {  ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: targetActor}),
                        content: `<strong>${effectItem.name}:</strong> ${finalValue >= 0 ? '+' : ''}${finalValue} aplicado em ${effectSystem.name || effectSystem.category}.`
                    }); }
            }
            break;
        }

        // =======================================================
        // CASOS MACRO e CHAT (Inalterados)
        // =======================================================
        case 'macro': {
             if (!effectSystem.value) break;
            const macro = game.macros.getName(effectSystem.value);
            if (macro) {
                // Passa informações úteis para a macro, como o ator de origem e os alvos.
                macro.execute({ 
                    actor: context.actor, 
                    origin: context.origin,
                    targets: targets 
                });
            } else {
                ui.notifications.warn(`[GUM] Macro "${effectSystem.value}" não encontrada.`);
            }
            break;
        }
        case 'chat': {
                       if (!effectSystem.chat_text) break;
            // A lógica aqui é uma adaptação da que você já tinha em `processConditions`
            for (const target of targets) {
                const targetActor = target.actor;
                let content = effectSystem.chat_text.replace(/{actor.name}/g, targetActor.name);
                
                // Adiciona o botão de rolagem, se configurado
                if (effectSystem.has_roll) {
                    let finalTarget = 0;
                    if (effectSystem.roll_attribute === 'fixed') {
                        finalTarget = Number(effectSystem.roll_fixed_value) || 10;
                    } else if (effectSystem.roll_attribute) {
                       const resolvedBase = resolveRollBaseValue(targetActor, effectSystem.roll_attribute);
                        const finalAttr = (resolvedBase !== null && resolvedBase !== undefined) ? resolvedBase : 10;
                        finalTarget = finalAttr + (Number(effectSystem.roll_modifier) || 0);
                    }
                    const label = effectSystem.roll_label || `Rolar Teste`;
                    content += `<div style="text-align: center; margin-top: 10px;"><button class="rollable" data-roll-value="${finalTarget}" data-label="${label}">${label} (vs ${finalTarget})</button></div>`;
                }
                
                const chatData = { 
                    speaker: ChatMessage.getSpeaker({ actor: targetActor }), 
                    content: content 
                };
                
                // Define quem recebe a mensagem
                if (effectSystem.whisperMode === 'gm') {
                    chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                } else if (effectSystem.whisperMode === 'blind') {
                    chatData.blind = true;
                }
                
                ChatMessage.create(chatData);
            }
            break;
        }
        
        default:
            console.warn(`[GUM] Tipo de efeito "${effectSystem.type}" não reconhecido.`);
    }
}