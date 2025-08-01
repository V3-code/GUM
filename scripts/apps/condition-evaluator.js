let evaluatingActors = new Set();

export async function evaluateConditions(actor, changeData = {}) {
    if (evaluatingActors.has(actor.id)) return;
    evaluatingActors.add(actor.id);

    try {
        // Cria uma cópia "futura" dos dados do ator para uma avaliação precisa
        const futureData = foundry.utils.mergeObject(actor.toObject(false), changeData);
        const tempActor = new Actor.implementation(futureData);
        
        const conditions = actor.items.filter(i => i.type === "condition");
        const updates = {};
        const modifiers = {};

        // ETAPA 1: ZERAR MODIFICADORES .temp
        const pathsToReset = new Set();
        conditions.forEach(cond => {
            const effects = Array.isArray(cond.system.effects) ? cond.system.effects : Object.values(cond.system.effects || {});
            effects.forEach(eff => {
                if (eff.path && eff.path.endsWith('.temp')) pathsToReset.add(eff.path);
            });
        });
        pathsToReset.forEach(path => { updates[path] = 0; });

        // ETAPA 2: AVALIAR CONDIÇÕES E PROCESSAR EFEITOS
        for (const condition of conditions) {
            const isManuallyDisabled = condition.getFlag("gum", "manual_override");
            const wasActive = condition.getFlag("gum", "wasActive") || false;
            
            let isConditionActive = false;
            if (!condition.system.when || condition.system.when.trim() === "") {
                isConditionActive = true;
            } else {
                try {
                    // Avalia a condição usando os dados "futuros" do ator
                    isConditionActive = Function("actor", "game", `return ( ${condition.system.when} )`)(tempActor, game);
                } catch (e) {
                    console.warn(`GUM | Erro na regra "${condition.system.when}" da condição "${condition.name}".`, e);
                }
            }
            
            const isEffectivelyActive = isConditionActive && !isManuallyDisabled;

            if (isEffectivelyActive !== wasActive) {
                updates[`flags.gum.conditionState.${condition.id}.wasActive`] = isEffectivelyActive;
            }

            const effects = Array.isArray(condition.system.effects) ? condition.system.effects : Object.values(condition.system.effects || {});
            
            for (const effect of effects) {
                // --- EFEITOS DE ESTADO (Atributos e Status) ---
                if (effect.type === "attribute" && effect.path && effect.path.endsWith('.temp')) {
                    if (isEffectivelyActive) {
                        if (!modifiers[effect.path]) modifiers[effect.path] = 0;
                        const value = Number(effect.value) || 0;
                        if (effect.operation === "ADD") modifiers[effect.path] += value;
                        else if (effect.operation === "SUB") modifiers[effect.path] -= value;
                    }
                } 
                else if (effect.type === "status" && effect.statusId) {
                    await actor.toggleStatusEffect(effect.statusId, { active: isEffectivelyActive });
                }
                
                // --- EFEITOS DE EVENTO (Macro e Chat) ---
                // Rodam apenas na transição de INATIVO para ATIVO
                if (isEffectivelyActive && !wasActive) {
                    if (effect.type === "macro" && effect.value) {
                        const macro = game.macros.getName(effect.value);
                        if (macro) macro.execute({ actor });
                        else ui.notifications.warn(`Macro "${effect.value}" não encontrada.`);
                    }
                    else if (effect.type === "chat" && effect.chat_text) {
                        let content = effect.chat_text.replace(/{actor.name}/g, actor.name);
                        if (effect.has_roll && effect.roll_attribute) {
                            const baseValue = foundry.utils.getProperty(actor.system.attributes, effect.roll_attribute);
                            const modifier = Number(effect.roll_modifier) || 0;
                            const finalTarget = baseValue + modifier;
                            const label = effect.roll_label || `Rolar Teste`;
                            content += `<div style="text-align: center; margin-top: 10px;"><button class="rollable" data-roll-value="${finalTarget}" data-label="${label}">${label} (vs ${finalTarget})</button></div>`;
                        }
                        const chatData = {
                            speaker: ChatMessage.getSpeaker({ actor: actor }),
                            content: content
                        };
                        if (effect.whisperMode === 'gm') chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                        else if (effect.whisperMode === 'blind') chatData.blind = true;
                        ChatMessage.create(chatData);
                    }
                }
            }
        }

        // --- ETAPA FINAL: APLICAR ATUALIZAÇÕES ---
        for (const [path, totalModifier] of Object.entries(modifiers)) {
            updates[path] = totalModifier;
        }
        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }
        
    } finally {
        evaluatingActors.delete(actor.id);
    }
}