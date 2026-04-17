
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

const isEffectDurationPermanent = (duration = {}) => {
    if (!duration || typeof duration !== "object") return false;
    if (duration._uiMode === "permanent") return true;
    return duration.isPermanent === true;
};

const normalizeEffectDurationFlags = (duration = {}) => {
    const normalized = foundry.utils.duplicate(duration || {});
    if (isEffectDurationPermanent(normalized)) {
        normalized.isPermanent = true;
        normalized.inCombat = false;
        normalized._uiMode = "permanent";
    }
    return normalized;
};

const normalizeTokenIconPolicy = (value) => {
    const normalized = (value ?? "").toString().trim().toLowerCase();

    if (["always", "always_show", "show", "on", "true", "1", "sempre"].includes(normalized)) return "always";
    if (["never", "never_show", "hide", "off", "false", "0", "nunca"].includes(normalized)) return "never";
    if (["auto", "automatic", "automático", "automatico", "default", "padrão", "padrao"].includes(normalized)) return "auto";

    return "auto";
};

const shouldShowTokenIcon = (effectSystem = {}, duration = {}) => {
    const policy = normalizeTokenIconPolicy(effectSystem.tokenIconPolicy);
    if (policy === "always") return true;
    if (policy === "never") return false;
    return !isEffectDurationPermanent(duration);
};

const resolveTokenIconImage = (effectItem, effectSystem = {}, duration = {}) => {
    if (!shouldShowTokenIcon(effectSystem, duration)) return null;
    return effectItem?.img ?? null;
};

const DEFAULT_EFFECT_ACTION = {
    label: "",
    type: "attribute",
    path: "system.attributes.st.passive",
    operation: "ADD",
    value: "1",
    key: "",
    flag_value: "",
    chat_text: "",
    has_roll: false,
    roll_label: "Rolar Teste",
    roll_attribute: "ht",
    roll_modifier: "0",
    roll_modifier_value: "0",
    roll_modifier_cap: "",
    roll_modifier_context: "all",
    roll_modifier_entries: [],
    whisperMode: "public",
    category: "hp",
    name: "",
    chat_notice: true,
    confirm_prompt: false,
    variable_value: false,
    statusId: "dead"
};

// Regra explícita de prioridade do ícone carrier.
// Menor número = maior prioridade.
const CARRIER_ACTION_PRIORITY = {
    attribute: 1,
    roll_modifier: 2,
    flag: 3,
    status: 4
};

const normalizeRollModifierEntryValue = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    if (/^[+-]?\d+(\.\d+)?$/.test(raw)) {
        const asNumber = Number(raw);
        return Number.isFinite(asNumber) ? asNumber : 0;
    }
    return raw;
};

const normalizeEffectAction = (action = {}) => {
    const next = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_EFFECT_ACTION), action || {}, { inplace: false, overwrite: true });
    if (!Array.isArray(next.roll_modifier_entries) || next.roll_modifier_entries.length === 0) {
        next.roll_modifier_entries = [{
            label: "",
            value: normalizeRollModifierEntryValue(next.roll_modifier_value),
            cap: next.roll_modifier_cap ?? "",
            contexts: next.roll_modifier_context ?? "all"
        }];
    }
    next.roll_modifier_entries = next.roll_modifier_entries.map((entry) => ({
        label: (entry?.label || "").toString().trim(),
        value: normalizeRollModifierEntryValue(entry?.value),
        cap: (entry?.cap ?? entry?.nh_cap ?? "").toString().trim(),
        contexts: (entry?.contexts || "all").toString().trim() || "all"
    }));
    next.roll_modifier_value = next.roll_modifier_entries[0]?.value ?? 0;
    next.roll_modifier_cap = next.roll_modifier_entries[0]?.cap ?? "";
    next.roll_modifier_context = next.roll_modifier_entries[0]?.contexts ?? "all";
    return next;
};

const buildFallbackActionLabel = (action = {}) => {
    switch (action.type) {
        case "attribute":
            return "Modificador de Atributo";
        case "roll_modifier":
            return "Modificador de Rolagem";
        case "status":
            return `Status: ${action.statusId || "indefinido"}`;
        case "resource_change":
            return "Alteração de Recurso";
        case "flag":
            return "Flag";
        case "macro":
            return "Macro";
        case "chat":
            return "Mensagem de Chat";
        default:
            return "Ação";
    }
};

export const getEffectActions = (effectSystem = {}) => {
    if (Array.isArray(effectSystem?.actions)) return effectSystem.actions.map(normalizeEffectAction);
    return [normalizeEffectAction(effectSystem)];
};

const selectCarrierActionIndex = (actions = []) => {
    const persistent = actions
        .map((action, index) => ({ action, index }))
        .filter(({ action }) => ["attribute", "flag", "roll_modifier", "status"].includes(action.type));
    if (!persistent.length) return null;

    persistent.sort((a, b) => {
        const pa = CARRIER_ACTION_PRIORITY[a.action.type] ?? 9999;
        const pb = CARRIER_ACTION_PRIORITY[b.action.type] ?? 9999;
        if (pa !== pb) return pa - pb;
        return a.index - b.index;
    });
    return persistent[0].index;
};

export async function applySingleEffect(effectItem, targets, context = {}) {
    if (!effectItem || targets.length === 0) return;

    const effectSystem = effectItem.system;
    const actions = getEffectActions(effectSystem);
    if (!actions.length) return;
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
    const persistentTypes = new Set(["attribute", "flag", "roll_modifier", "status"]);
    const instantTypes = new Set(["resource_change", "macro", "chat"]);

    const buildCommonActiveEffectData = (targetActor, actionIndex = 0) => {
        const gumDuration = normalizeEffectDurationFlags(effectSystem.duration || {});
        const startMode = gumDuration.startMode || "apply";
        const endMode = gumDuration.endMode || "turnEnd";
        const shouldDelayStart = gumDuration.inCombat && startMode === "nextTurnStart";
        const pendingCombat = gumDuration.inCombat && !game.combat;
        gumDuration.startMode = startMode;
        gumDuration.endMode = endMode;
        if (shouldDelayStart) gumDuration.pendingStart = true;
        if (pendingCombat) gumDuration.pendingCombat = true;

        const activeEffectData = {
            name: effectItem.name,
            img: null,
            origin: context.origin ? context.origin.uuid : (context.actor ? context.actor.uuid : null),
            changes: [],
            statuses: [],
            flags: {
                gum: {
                    effectUuid: effectItem.uuid,
                    source: context.source || null,
                    originItemId: context.originItemId ?? null,
                    statusBindingRuleUuid: context.statusBindingRuleUuid ?? null,
                    statusBindingStatusId: context.statusBindingStatusId ?? null,
                    duration: gumDuration,
                    ...conditionFlags
                }
            },
            disabled: pendingCombat || shouldDelayStart
        };

 if (!isEffectDurationPermanent(gumDuration)) {
            activeEffectData.duration = {};
            const value = parseInt(gumDuration.value) || 1;
            const unit = gumDuration.unit;
            const usesCombatDuration = gumDuration.inCombat && game.combat;
            if (!usesCombatDuration) {
                if (unit === "turns") activeEffectData.duration.turns = value;
                else if (unit === "seconds") activeEffectData.duration.seconds = value;
                else if (unit === "rounds") activeEffectData.duration.rounds = value;
                else if (unit === "minutes") activeEffectData.duration.seconds = value * 60;
                else if (unit === "hours") activeEffectData.duration.seconds = value * 60 * 60;
                else if (unit === "days") activeEffectData.duration.seconds = value * 60 * 60 * 24;
            }

            if (usesCombatDuration) activeEffectData.duration.combat = game.combat.id;
            if (!pendingCombat && !shouldDelayStart) {
                activeEffectData.duration.startRound = game.combat?.round ?? null;
                activeEffectData.duration.startTurn = game.combat?.turn ?? null;
                activeEffectData.duration.startTime = game.time?.worldTime ?? null;
            }
        }

        const fallbackCoreStatusId = `${effectItem.name.slugify({ strict: true })}-a${actionIndex + 1}`;
        return { activeEffectData, targetActor, gumDuration, fallbackCoreStatusId };
    };

    const baseIconCarrierIndex = selectCarrierActionIndex(actions);

    for (const [actionIndex, action] of actions.entries()) {
        if (!persistentTypes.has(action.type) && !instantTypes.has(action.type)) {
            console.warn(`[GUM] Tipo de ação de efeito "${action.type}" não reconhecido.`);
            continue;
        }

        try {
            if (persistentTypes.has(action.type)) {
                if (context.skipPersistentEffects) continue;
                for (const targetToken of targets) {
                    const targetActor = targetToken.actor;
                    const { activeEffectData, gumDuration, fallbackCoreStatusId } = buildCommonActiveEffectData(targetActor, actionIndex);
                    activeEffectData.name = (action.label || "").trim() || buildFallbackActionLabel(action) || effectItem.name;
                    activeEffectData.flags.gum.actionIndex = actionIndex;
                    activeEffectData.flags.gum.actionType = action.type;
                    activeEffectData.flags.gum.actionLabel = (action.label || "").trim();
                    const isIconCarrier = shouldShowTokenIcon(effectSystem, gumDuration) && baseIconCarrierIndex === actionIndex;
                    if (isIconCarrier) {
                        activeEffectData.img = resolveTokenIconImage(effectItem, effectSystem, gumDuration);
                    }

                    if (action.type === "attribute") {
                        if (!action.path) throw new Error("Ação de atributo sem caminho.");
                        const computedValue = evaluateEffectValue(action.value, targetActor);
                        activeEffectData.changes.push({
                            key: action.path,
                            mode: action.operation === "OVERRIDE" ? CONST.ACTIVE_EFFECT_MODES.OVERRIDE : CONST.ACTIVE_EFFECT_MODES.ADD,
                            value: computedValue
                        });
                    }

                    if (action.type === "flag") {
                        if (!action.key) throw new Error("Ação de flag sem chave.");
                        const valueToSet = action.flag_value === "true" ? true : action.flag_value === "false" ? false : action.flag_value;
                        foundry.utils.setProperty(activeEffectData.flags, `gum.${action.key}`, valueToSet);
                    }

                    if (action.type === "roll_modifier") {
                        const entries = Array.isArray(action.roll_modifier_entries) && action.roll_modifier_entries.length
                            ? action.roll_modifier_entries
                            : [{ value: action.roll_modifier_value ?? 0, cap: action.roll_modifier_cap ?? "", contexts: action.roll_modifier_context ?? "all" }];
                        activeEffectData.flags.gum.rollModifier = {
                            entries,
                            value: entries[0]?.value ?? 0,
                            cap: entries[0]?.cap ?? "",
                            context: entries[0]?.contexts ?? "all"
                        };
                    }

                    if (isIconCarrier && action.type !== "status") {
                        activeEffectData.statuses.push(fallbackCoreStatusId);
                        foundry.utils.setProperty(activeEffectData, "flags.core.statusId", fallbackCoreStatusId);
                    }
                    if (action.type === "status" && action.statusId) {
                        const statusEffect = (CONFIG.statusEffects || []).find((status) => status.id === action.statusId);
                        activeEffectData.img = statusEffect?.icon ?? statusEffect?.img ?? activeEffectData.img;
                        activeEffectData.statuses.push(action.statusId);
                        foundry.utils.setProperty(activeEffectData, "flags.core.statusId", action.statusId);
                    }
                    if (effectSystem.attachedStatusId && isIconCarrier && action.type !== "status") {
                        activeEffectData.statuses.push(effectSystem.attachedStatusId);
                    }
                    activeEffectData.statuses = [...new Set(activeEffectData.statuses.filter(Boolean))];

                    await targetActor.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
                    targetActor.sheet.render(false);
                }
                continue;
            }

            if (action.type === "resource_change") {
                let valueToChange = action.value;

                if (action.confirm_prompt) {
                    const confirmed = await Dialog.confirm({
                        title: "Confirmar Ação",
                        content: `<p>Deseja aplicar o efeito "${effectItem.name}"?</p>`,
                        yes: () => true,
                        no: () => false,
                        defaultYes: true
                    });
                    if (!confirmed) continue;
                }
                if (action.variable_value) {
                    const newAmount = await new Promise(resolve => {
                        new Dialog({
                            title: "Definir Valor",
                            content: `<p>Qual o valor para "${effectItem.name}"?</p><input type="text" name="amount" value="${valueToChange}"/>`,
                            buttons: { apply: { label: "Aplicar", callback: (html) => resolve(html.find('input[name=\"amount\"]').val()) } },
                            default: "apply",
                            close: () => resolve(null)
                        }).render(true);
                    });
                    if (newAmount === null) continue;
                    valueToChange = newAmount;
                }

                const roll = new Roll(String(valueToChange));
                await roll.evaluate();
                const finalValue = roll.total;

                for (const targetToken of targets) {
                    const targetActor = targetToken.actor;
                    let updatePath = "";
                    let updateObject = null;

                    switch (action.category) {
                        case "hp": updatePath = "system.attributes.hp.value"; break;
                        case "fp": updatePath = "system.attributes.fp.value"; break;
                        case "energy_reserve": {
                            const reserveKey = Object.keys(targetActor.system.spell_reserves || {}).find(k => targetActor.system.spell_reserves[k].name === action.name) || Object.keys(targetActor.system.power_reserves || {}).find(k => targetActor.system.power_reserves[k].name === action.name);
                            if (reserveKey) updatePath = targetActor.system.spell_reserves[reserveKey] ? `system.spell_reserves.${reserveKey}.current` : `system.power_reserves.${reserveKey}.current`;
                            break;
                        }
                        case "combat_tracker": {
                            const trackerKey = Object.keys(targetActor.system.combat.combat_meters || {}).find(k => targetActor.system.combat.combat_meters[k].name === action.name);
                            if (trackerKey) updatePath = `system.combat.combat_meters.${trackerKey}.current`;
                            break;
                        }
                        case "item_quantity": {
                            const itemToUpdate = targetActor.items.find(i => i.name === action.name);
                            if (itemToUpdate) {
                                const newQuantity = (itemToUpdate.system.quantity || 0) + finalValue;
                                updateObject = itemToUpdate.update({ "system.quantity": newQuantity });
                            }
                            break;
                        }
                        default:
                            break;
                    }

                    if (updateObject) await updateObject;
                    else if (updatePath) {
                        const currentValue = foundry.utils.getProperty(targetActor, updatePath) || 0;
                        await targetActor.update({ [updatePath]: currentValue + finalValue });
                    }
                    if (action.chat_notice) {
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
                            content: `<strong>${effectItem.name}:</strong> ${finalValue >= 0 ? "+" : ""}${finalValue} aplicado em ${action.name || action.category}.`
                        });
                    }
                }
                continue;
            }

            if (action.type === "macro") {
                if (!action.value) continue;
                const macro = game.macros.getName(action.value);
                if (macro) macro.execute({ actor: context.actor, origin: context.origin, targets });
                else ui.notifications.warn(`[GUM] Macro "${action.value}" não encontrada.`);
                continue;
            }

            if (action.type === "chat") {
                if (!action.chat_text) continue;
                for (const target of targets) {
                    const targetActor = target.actor;
                    const chatBody = action.chat_text.replace(/{actor.name}/g, targetActor.name);
                    let rollButtonHtml = "";
                    if (action.has_roll) {
                        let finalTarget = 0;
                        if (action.roll_attribute === "fixed") {
                            finalTarget = Number(action.roll_fixed_value) || 10;
                        } else if (action.roll_attribute) {
                            const resolvedBase = resolveRollBaseValue(targetActor, action.roll_attribute);
                            const finalAttr = (resolvedBase !== null && resolvedBase !== undefined) ? resolvedBase : 10;
                            finalTarget = finalAttr + (Number(action.roll_modifier) || 0);
                        }
                        const label = action.roll_label || "Rolar Teste";
                        rollButtonHtml = `<div class="gum-effect-chat-actions"><button class="rollable gum-chat-roll-button" data-roll-value="${finalTarget}" data-label="${label}"><i class="fas fa-dice-d20"></i><span>${label}</span><strong>vs ${finalTarget}</strong></button></div>`;
                    }

                    const content = `<div class="gurps-effect-chat-card"><div class="gum-effect-chat-header"><i class="fas fa-comment-dots"></i><span>Mensagem de Efeito</span><span class="gum-effect-chat-target">${targetActor.name}</span></div><div class="gum-effect-chat-body">${chatBody}</div>${rollButtonHtml}</div>`;
                    const chatData = { speaker: ChatMessage.getSpeaker({ actor: targetActor }), content };
                    if (action.whisperMode === "gm") chatData.whisper = ChatMessage.getWhisperRecipients("GM");
                    else if (action.whisperMode === "blind") chatData.blind = true;
                    ChatMessage.create(chatData);
                }
            }
        } catch (error) {
            console.error(`GUM | Falha ao aplicar ação "${action.type}" do efeito "${effectItem.name}":`, error);
            ui.notifications.warn(`Efeito "${effectItem.name}": uma ação "${action.type}" falhou e foi ignorada.`);
        }
    }
}