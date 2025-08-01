let evaluatingActors = new Set();
export async function evaluateConditions(actor, options = {}) {
    if (evaluatingActors.has(actor.id)) return;
    evaluatingActors.add(actor.id);

    try {
        const conditions = actor.items.filter(i => i.type === "condition");
        const updates = {};
        const modifiers = {};

        const pathsToReset = new Set();
        conditions.forEach(cond => {
            const effectsData = cond.system.effects || [];
            const effectsArray = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
            effectsArray.forEach(eff => {
                if(eff.path && eff.path.endsWith('.temp')) pathsToReset.add(eff.path);
            });
        });
        pathsToReset.forEach(path => {
            updates[path] = 0;
        });

        for (const condition of conditions) {
            const isManuallyDisabled = condition.getFlag("gum", "manual_override");
            const wasActive = condition.getFlag("gum", "wasActive") || false;
            let isConditionActive = false;
            
            if (options.isCombatEnd && condition.system.when.includes("game.combat")) {
                isConditionActive = false;
            } else if (!condition.system.when || condition.system.when.trim() === "") {
                isConditionActive = true;
            } else {
                try {
                    isConditionActive = Function("actor", "game", `return ( ${condition.system.when} )`)(actor, game);
                } catch (e) {
                    console.warn(`GUM | Erro na regra "${condition.system.when}" da condição "${condition.name}".`, e);
                }
            }
            
            const isEffectivelyActive = isConditionActive && !isManuallyDisabled;

            if (isEffectivelyActive !== wasActive) {
                updates[`flags.gum.conditionState.${condition.id}.wasActive`] = isEffectivelyActive;
            }

            const effectsData = condition.system.effects || [];
            const effectsArray = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
            
            for (const effect of effectsArray) {
                // Efeitos Passivos (sempre recalculados)
                if (effect.type === "attribute" && effect.path) {
                    if (isEffectivelyActive) { // Só acumula se a condição estiver ativa
                        if (!modifiers[effect.path]) modifiers[effect.path] = 0;
                        const value = Number(effect.value) || 0;
                        if (effect.operation === "ADD") modifiers[effect.path] += value;
                        else if (effect.operation === "SUB") modifiers[effect.path] -= value;
                        else if (effect.operation === "SET") modifiers[effect.path] = effect.value;
                    }
                }
                else if (effect.type === "status" && effect.statusId) {
                    await actor.toggleStatusEffect(effect.statusId, { active: isEffectivelyActive });
                }
                
                // Efeitos de "Evento Único" (Macro, Chat, Teste)
                // ✅ LÓGICA CORRIGIDA: Roda APENAS na transição de INATIVO para ATIVO
                if (isEffectivelyActive && !wasActive) {
                    if (effect.type === "macro" && effect.value) {
                        const macro = game.macros.getName(effect.value);
                        if (macro) macro.execute({ actor });
                        else ui.notifications.warn(`Macro "${effect.value}" não encontrada.`);
                    }
                    else if (effect.type === "chat" && effect.chat_text) {
                        
                        // 1. Prepara o conteúdo da mensagem
                        let content = effect.chat_text.replace(/{actor.name}/g, actor.name);
                        if (effect.has_roll && effect.roll_attribute) {
                            const baseValue = foundry.utils.getProperty(actor.system.attributes, effect.roll_attribute);
                            const modifier = Number(effect.roll_modifier) || 0;
                            const finalTarget = baseValue + modifier;
                            const label = effect.roll_label || `Rolar Teste`;
                            content += `<div style="text-align: center; margin-top: 10px;"><button class="rollable" data-roll-value="${finalTarget}" data-label="${label}">${label} (vs ${finalTarget})</button></div>`;
                        }

                        // 2. Prepara os dados da mensagem, incluindo o modo de sussurro
                        const chatData = {
                            speaker: ChatMessage.getSpeaker({ actor: actor }),
                            content: content
                        };

                        if (effect.whisperMode === 'gm') {
                            chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                        } else if (effect.whisperMode === 'blind') {
                            chatData.blind = true;
                        }

                        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: actor }), content: content });
                    }
                }
            }
        }

        for (const [path, totalModifier] of Object.entries(modifiers)) {
            updates[path] = (updates[path] || 0) + totalModifier;
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }

    } finally {
        evaluatingActors.delete(actor.id);
    }
}