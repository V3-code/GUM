// GUM/scripts/apps/effect-sheet.js
import { getGroupedRollTags, isKnownRollTag, normalizeRollTags, ROLL_TAG_ALIASES } from "../../module/utils/roll-tags.mjs";
import { normalizePurposeIds } from "../../module/utils/roll-purposes.mjs";
import { formatPurposeSelection, openRollPurposePicker } from "../../module/apps/roll-purpose-picker.mjs";
import { normalizeContextCsv, openContextPicker } from "../../module/apps/context-picker.mjs";
import { openEffectPathPicker } from "../../module/apps/effect-path-picker.mjs";


const { ItemSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;


const ROLL_MODIFIER_CONTEXT_OPTIONS = [
    { id: "all", label: "Qualquer rolagem de teste" },
    { id: "attack", label: "Ataque (qualquer)" },
    { id: "attack_melee", label: "Ataque corpo-a-corpo" },
    { id: "attack_ranged", label: "Ataque à distância" },
    { id: "defense", label: "Defesa (qualquer)" },
    { id: "defense_dodge", label: "Esquiva" },
    { id: "defense_parry", label: "Aparar" },
    { id: "defense_block", label: "Bloqueio" },
    { id: "skill", label: "Perícias (qualquer)" },
    { id: "spell", label: "Magias" },
    { id: "power", label: "Poderes" },
    { id: "sense_vision", label: "Visão" },
    { id: "sense_hearing", label: "Audição" },
    { id: "sense_tastesmell", label: "Olfato/Paladar" },
    { id: "sense_touch", label: "Tato" },
    { id: "check_st", label: "Atributo Específico: ST" },
    { id: "skill_st", label: "Perícias baseadas em ST" },
    { id: "check_dx", label: "Atributo Específico: DX" },
    { id: "skill_dx", label: "Perícias baseadas em DX" },
    { id: "check_iq", label: "Atributo Específico: IQ" },
    { id: "skill_iq", label: "Perícias baseadas em IQ" },
    { id: "check_ht", label: "Atributo Específico: HT" },
    { id: "skill_ht", label: "Perícias baseadas em HT" },
    { id: "check_per", label: "Atributo Específico: Per" },
    { id: "skill_per", label: "Perícias baseadas em Per" },
    { id: "check_vont", label: "Atributo Específico: Vont" },
    { id: "self_control", label: "Teste de Autocontrole" },
      { id: "skill_vont", label: "Perícias baseadas em Vont" }
];

const ROLL_MODIFIER_APPLICATION_OPTIONS = [
    { id: "self", label: "No próprio portador do efeito" },
    { id: "vs_targeter", label: "Em quem marcar este ator como alvo" }
];


const EFFECT_ACTION_TYPE_PRESENTATION = {
    attribute: { label: "Modificador de Atributo", icon: "fas fa-chart-line", className: "is-attribute" },
    status: { label: "Status", icon: "fas fa-heartbeat", className: "is-status" },
    resource_change: { label: "Alteração de Recurso", icon: "fas fa-battery-half", className: "is-resource-change" },
    resource_create: { label: "Criar Recurso", icon: "fas fa-plus-circle", className: "is-resource-create" },
    roll_modifier: { label: "Modificador de Rolagem", icon: "fas fa-dice", className: "is-roll-modifier" },
    chat: { label: "Mensagem de Chat", icon: "fas fa-comment", className: "is-chat" },
    macro: { label: "Macro", icon: "fas fa-code", className: "is-macro" },
    flag: { label: "Flag", icon: "fas fa-flag", className: "is-flag" }
};

const RESOURCE_CATEGORY_LABELS = {
    hp: "Pontos de Vida",
    fp: "Pontos de Fadiga",
    energy_reserve: "Reserva de Energia",
    combat_tracker: "Registro de Combate",
    item_quantity: "Quantidade de Equipamento",
    spell_reserve: "Reserva de Energia — Magia",
    power_reserve: "Reserva de Energia — Poder"
};

const compactParts = (...parts) => parts
    .map(part => (part ?? "").toString().trim())
    .filter(Boolean);

const formatActionCount = (count) => `${count} ${count === 1 ? "ação" : "ações"}`;
const formatEntryCount = (count) => `${count} ${count === 1 ? "entrada" : "entradas"}`;

const getApplicationSideLabel = (id) => ROLL_MODIFIER_APPLICATION_OPTIONS.find(opt => opt.id === id)?.label || id || "Próprio portador";
const getShortApplicationSideLabel = (id) => id === "vs_targeter" ? "Quem mira o portador" : "Próprio portador";

const buildRollEntrySummary = (entry = {}) => {
    const parts = compactParts(entry.label, entry.value, entry.contexts || "all", getShortApplicationSideLabel(entry.application_side || "self"));
    return parts.length ? parts.join(" · ") : "Modificador sem rótulo";
};

const buildActionSummary = (action = {}) => {
    switch (action.type) {
        case "attribute":
            return compactParts(action.path, action.operation, action.value).join(" · ") || "Modificador de atributo";
        case "status":
            return `Status: ${action.statusLabel || action.statusId || "não definido"}`;
        case "resource_change":
            return compactParts(RESOURCE_CATEGORY_LABELS[action.category] || action.category, action.value).join(" · ") || "Alteração de recurso";
                case "resource_create":
            return compactParts(RESOURCE_CATEGORY_LABELS[action.category] || action.category, action.name, `${action.value || 0}/${action.max || 0}`).join(" · ") || "Criar recurso";
        case "roll_modifier":
            return compactParts(action.rollModifierPrimaryContext || "Qualquer rolagem", action.rollModifierPrimarySide || "Próprio portador", formatEntryCount(action.entryCount || 0)).join(" · ");
        case "chat":
            return action.chat_text ? "Mensagem no chat" : "Mensagem de chat";
        case "macro":
            return compactParts("Macro:", action.value).join(" ") || "Macro";
        case "flag":
            return compactParts(action.key, action.flag_value).join(" · ") || "Flag";
        default:
            return "Ação configurada";
    }
};

const DEFAULT_EFFECT_ACTION = {
    label: "",
    type: "attribute",
    path: "system.attributes.st.passive",
    operation: "ADD",
    value: "1",
    value_mode: "fixed",
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
    roll_modifier_application_side: "self",
    roll_modifier_entries: [],
    requestedPurposeIds: [],
    whisperMode: "public",
    category: "hp",
    name: "",
    chat_notice: true,
    confirm_prompt: false,
    variable_value: false,
    max: "0",
    source: "",
    hidden: false,
    exists_policy: "ignore",
    statusId: "dead"
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

const normalizeAction = (action = {}) => {
    const next = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_EFFECT_ACTION), action || {}, { inplace: false, overwrite: true });
    const rawEntries = Array.isArray(next.roll_modifier_entries) ? next.roll_modifier_entries : [];
    next.roll_modifier_entries = rawEntries.length
        ? rawEntries.map((entry) => ({
            label: (entry?.label || "").toString().trim(),
            value: normalizeRollModifierEntryValue(entry?.value),
            value_mode: entry?.value_mode === "per_origin_level" ? "per_origin_level" : "fixed",
            cap: (entry?.cap ?? entry?.nh_cap ?? "").toString().trim(),
            contexts: (entry?.contexts || "all").toString().trim() || "all",
            application_side: (entry?.application_side || "self").toString().trim() || "self",
            target_kind: (entry?.target_kind || "any").toString().trim() || "any",
            target_mode: (entry?.target_mode || "all").toString().trim() || "all",
            target_values: (entry?.target_values || "").toString().trim(),
            source_item_ids: (entry?.source_item_ids || "").toString().trim(),
            source_attack_ids: (entry?.source_attack_ids || "").toString().trim(),
             roll_tags: Array.isArray(entry?.roll_tags) ? entry.roll_tags.join(",") : (entry?.roll_tags || "").toString().trim(),
            roll_tag_match: entry?.roll_tag_match === "all" ? "all" : "any",
            nh_display_mode: (entry?.roll_tags?.length || String(entry?.roll_tags || "").trim()) ? "roll_only" : (entry?.nh_display_mode || "roll_only").toString().trim() || "roll_only"
        }))
        : [{
            label: "",
            value: normalizeRollModifierEntryValue(next.roll_modifier_value),
            value_mode: next.roll_modifier_value_mode === "per_origin_level" ? "per_origin_level" : "fixed",
            cap: (next.roll_modifier_cap ?? "").toString().trim(),
            contexts: (next.roll_modifier_context || "all").toString().trim() || "all",
            application_side: (next.roll_modifier_application_side || "self").toString().trim() || "self",
            target_kind: (next.roll_modifier_target_kind || "any").toString().trim() || "any",
            target_mode: (next.roll_modifier_target_mode || "all").toString().trim() || "all",
            target_values: (next.roll_modifier_target_values || "").toString().trim(),
            source_item_ids: (next.roll_modifier_source_item_ids || "").toString().trim(),
            source_attack_ids: (next.roll_modifier_source_attack_ids || "").toString().trim(),
            roll_tags: (next.roll_modifier_roll_tags || "").toString().trim(),
            roll_tag_match: next.roll_modifier_roll_tag_match === "all" ? "all" : "any",
            nh_display_mode: (next.roll_modifier_nh_display_mode || "roll_only").toString().trim() || "roll_only"
        }];
    next.roll_modifier_value = next.roll_modifier_entries[0]?.value ?? 0;
    next.roll_modifier_cap = next.roll_modifier_entries[0]?.cap ?? "";
    next.roll_modifier_context = next.roll_modifier_entries[0]?.contexts ?? "all";
    next.roll_modifier_application_side = next.roll_modifier_entries[0]?.application_side ?? "self";
    next.requestedPurposeIds = normalizePurposeIds(next.requestedPurposeIds ?? next.roll_requested_purpose_ids);
    return next;
};

const getEffectActionsFromSystem = (system = {}) => {
    if (Array.isArray(system.actions)) return system.actions.map(normalizeAction);
    return [normalizeAction(system)];
};

export class EffectSheet extends ItemSheet {

    constructor(...args) {
        super(...args);
        this._expandedActions = null;
        this._expandedRollEntries = new Map();
        this._expandedRollEntryRestrictions = new Map();
        this._pendingScrollSelector = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "effect-sheet", "theme-dark"],
            width: 686,
            height: 620,
            resizable: true,
            template: "systems/gum/templates/items/effect-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "description"
            }]
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        context.system.tokenIconPolicy = context.system.tokenIconPolicy || "auto";
        context.system.conditionStackingMode = context.system.conditionStackingMode || "stack";
        context.tokenIconPolicyOptions = [
            { id: "auto", label: "Automático (temporário mostra / permanente oculta)" },
            { id: "always", label: "Sempre mostrar no token" },
            { id: "never", label: "Nunca mostrar no token" }
        ];
        context.conditionStackingModeOptions = [
            { id: "stack", label: "Acumular normalmente" },
            { id: "unique", label: "Não acumular entre condições" }
        ];
        context.statusEffects = CONFIG.statusEffects
            .map(s => ({ id: s.id, label: s.name }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
        context.macros = game.macros.map(m => m.name);
        context.enrichedChatDescription = await TextEditorImpl.enrichHTML(this.item.system.chat_description || "", { async: true });
        context.enrichedDescription = await TextEditorImpl.enrichHTML(this.item.system.description || "", { async: true });
        context.owner = context.owner ?? this.item.isOwner;
        context.editable = this.options.editable ?? this.isEditable;

        if (context.system.duration) {
            context.system.duration.startMode = context.system.duration.startMode || "apply";
            context.system.duration.endMode = context.system.duration.endMode || "turnEnd";
            if (context.system.duration.isPermanent) {
                context.system.duration.inCombat = false;
                context.system.duration._uiMode = "permanent";
            } else if (context.system.duration.inCombat) {
                context.system.duration._uiMode = "combat";
            } else {
                context.system.duration._uiMode = context.system.duration._uiMode || "permanent";
            }
 }
        context.rollModifierContextOptions = ROLL_MODIFIER_CONTEXT_OPTIONS;
        context.rollModifierApplicationOptions = ROLL_MODIFIER_APPLICATION_OPTIONS;
        const actions = getEffectActionsFromSystem(context.system);
        const statusLabels = new Map(context.statusEffects.map(status => [status.id, status.label]));
        const contextLabels = new Map(ROLL_MODIFIER_CONTEXT_OPTIONS.map(opt => [opt.id, opt.label]));
        context.effectActionsCountLabel = formatActionCount(actions.length);
        context.effectActions = actions.map((action, index) => {
            const entries = (action.roll_modifier_entries || []).map((entry, entryIndex) => {
                const normalizedEntry = {
                    index: entryIndex,
                    displayIndex: entryIndex + 1,
                    label: entry?.label || "",
                    value: entry?.value ?? 0,
                    value_mode: entry?.value_mode === "per_origin_level" ? "per_origin_level" : "fixed",
                    isPerOriginLevel: entry?.value_mode === "per_origin_level",
                    cap: entry?.cap ?? "",
                    contexts: Array.isArray(entry?.contexts) ? entry.contexts.join(",") : (entry?.contexts || "all"),
                    application_side: entry?.application_side || "self",
                    applicationSideLabel: getApplicationSideLabel(entry?.application_side || "self"),
                    target_kind: entry?.target_kind || "any",
                    target_mode: entry?.target_mode || "all",
                    target_values: entry?.target_values || "",
                    source_item_ids: entry?.source_item_ids || "",
                    source_attack_ids: entry?.source_attack_ids || "",
                    roll_tags: Array.isArray(entry?.roll_tags) ? entry.roll_tags.join(",") : (entry?.roll_tags || ""),
                    roll_tag_match: entry?.roll_tag_match === "all" ? "all" : "any",
                    nh_display_mode: entry?.nh_display_mode || "roll_only"
                };
                normalizedEntry.summaryText = buildRollEntrySummary(normalizedEntry);
                normalizedEntry.isExpanded = this._isRollEntryExpanded(index, entryIndex);
                normalizedEntry.areRestrictionsExpanded = this._areRollEntryRestrictionsExpanded(index, entryIndex);
                return normalizedEntry;
            });
            const presentation = EFFECT_ACTION_TYPE_PRESENTATION[action.type] || EFFECT_ACTION_TYPE_PRESENTATION.attribute;
            const primaryEntry = entries[0] || {};
            const firstContext = (primaryEntry.contexts || "all").split(',').map(part => part.trim()).filter(Boolean)[0] || "all";
            const decoratedAction = {
                ...action,
                index,
                displayIndex: index + 1,
                titleText: action.label ? `Ação ${index + 1} — ${action.label}` : `Ação ${index + 1}`,
                typeLabel: presentation.label,
                typeClass: presentation.className,
                typeIcon: presentation.icon,
                statusLabel: statusLabels.get(action.statusId),
                entryCount: entries.length,
                entryCountLabel: formatEntryCount(entries.length),
                rollModifierPrimaryContext: contextLabels.get(firstContext) || firstContext,
                rollModifierPrimarySide: getShortApplicationSideLabel(primaryEntry.application_side || "self"),
                isExpanded: this._isActionExpanded(index),
                rollModifierEntries: entries
            };
            decoratedAction.requestedPurposeIdsCsv = action.requestedPurposeIds.join(",");
            decoratedAction.purposeSelectionSummary = formatPurposeSelection(action.requestedPurposeIds);
            decoratedAction.summaryText = buildActionSummary(decoratedAction);
            return decoratedAction;
        });
        context.hasTimedActions = actions.some((action) => ["attribute", "flag", "roll_modifier", "status"].includes(action.type));
        const resistancePurposeIds = normalizePurposeIds(context.system.resistanceRoll?.requestedPurposeIds);
        context.resistancePurposeIdsCsv = resistancePurposeIds.join(",");
        context.resistancePurposeSummary = formatPurposeSelection(resistancePurposeIds);

        return context;
    }



    /**
     * Capture the real state of every nested details element immediately before
     * Foundry replaces the sheet DOM. The native toggle event does not bubble
     * consistently, so delegated listeners alone cannot preserve this state.
     */
    _captureExpansionState() {
        const root = this.element?.[0] ?? this.element;
        if (!root?.querySelectorAll) return;

        const expandedActions = new Set();
        for (const details of root.querySelectorAll('.effect-action-details[data-action-index]')) {
            const actionIndex = Number(details.dataset.actionIndex);
            if (details.open && !Number.isNaN(actionIndex)) expandedActions.add(actionIndex);
        }

        const expandedEntries = new Map();
        const expandedRestrictions = new Map();
        const captureEntry = (details, target) => {
            const actionIndex = Number(details.dataset.actionIndex);
            const entryIndex = Number(details.dataset.entryIndex);
            if (!details.open || Number.isNaN(actionIndex) || Number.isNaN(entryIndex)) return;
            if (!target.has(actionIndex)) target.set(actionIndex, new Set());
            target.get(actionIndex).add(entryIndex);
        };

        for (const details of root.querySelectorAll('.roll-mod-entry-details[data-action-index][data-entry-index]')) {
            captureEntry(details, expandedEntries);
        }
        for (const details of root.querySelectorAll('.roll-mod-entry-restrictions[data-action-index][data-entry-index]')) {
            captureEntry(details, expandedRestrictions);
        }

        this._expandedActions = expandedActions;
        this._expandedRollEntries = expandedEntries;
        this._expandedRollEntryRestrictions = expandedRestrictions;
    }

    /**
     * Preserve expansion and scroll position when the sheet re-renders.
     */
    async _render(force, options = {}) {
        this._captureExpansionState();
        const container = this.element?.[0]?.querySelector('.sheet-body-content');
        const scrollTop = container?.scrollTop ?? null;
        const result = await super._render(force, options);
        const refreshed = this.element?.[0]?.querySelector('.sheet-body-content');
        if (this._pendingScrollSelector) {
            this.element?.[0]?.querySelector(this._pendingScrollSelector)?.scrollIntoView({ block: "nearest" });
            this._pendingScrollSelector = null;
        } else if (scrollTop !== null && refreshed) {
            refreshed.scrollTop = scrollTop;
        }
        return result;
    }

activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return; // Adicionando uma verificação de segurança

    html.on('click', '.open-reference-link', this._onOpenReferenceLink.bind(this));

    const permanentInput = html.find('input[name="system.duration.isPermanent"]');
    const inCombatInput = html.find('input[name="system.duration.inCombat"]');
    const startModeInputs = html.find('input[name="system.duration.startMode"]');
    const endModeInputs = html.find('input[name="system.duration.endMode"]');
    const presetInputs = html.find('input[name="duration-preset"]');

    const clearPresetSelection = () => {
        presetInputs.each((_, input) => {
            input.checked = false;
        });
    };

    permanentInput.on('change', async (event) => {
        if (!event.currentTarget.checked) return;
        inCombatInput.prop('checked', false);
        await this.item.update({
            "system.duration.isPermanent": true,
            "system.duration.inCombat": false
        });
    });

    inCombatInput.on('change', async (event) => {
        if (!event.currentTarget.checked) return;
        permanentInput.prop('checked', false);
        await this.item.update({
            "system.duration.inCombat": true,
            "system.duration.isPermanent": false,
            "system.duration.startMode": this.item.system.duration?.startMode || "apply",
            "system.duration.endMode": this.item.system.duration?.endMode || "turnEnd"
        });
    });

    startModeInputs.on('change', () => {
        clearPresetSelection();
    });

    endModeInputs.on('change', () => {
        clearPresetSelection();
    });

    presetInputs.on('change', async (event) => {
        const target = event.currentTarget;
        const startMode = target.dataset.startMode || "apply";
        const endMode = target.dataset.endMode || "turnEnd";
        await this.item.update({
            "system.duration.startMode": startMode,
            "system.duration.endMode": endMode
        });
    });

 // ✅ OUVINTE DO BOTÃO DE EDITAR AGORA É ATIVADO SEMPRE ✅
    html.find('.edit-text-btn').on('click', this._onEditText.bind(this));

    // Alterna os editores padrão da aba de descrição (padrão dos outros itens)
    html.find('.toggle-editor').on('click', this._toggleEditor.bind(this));
    html.find('.save-description').on('click', this._saveDescription.bind(this));
    html.find('.cancel-description').on('click', this._cancelDescription.bind(this));

        html.on("click", ".add-effect-action", async (ev) => {
        ev.preventDefault();
        const actions = getEffectActionsFromSystem(this.item.system);
        actions.push(normalizeAction({}));
        const newIndex = actions.length - 1;
        this._ensureExpandedActions().add(newIndex);
        this._pendingScrollSelector = `.effect-premium-action[data-action-index="${newIndex}"]`;
        await this.item.update({ "system.actions": actions });
    });

    html.on("click", ".remove-effect-action", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const index = Number(ev.currentTarget.dataset.index);
        const actions = getEffectActionsFromSystem(this.item.system);
        if (Number.isNaN(index) || index < 0 || index >= actions.length) return;
        actions.splice(index, 1);
        this._reindexExpandedActionsAfterRemoval(index);
        await this.item.update({ "system.actions": actions });
    });

    const normalizeCsv = value => normalizeContextCsv(value, ROLL_MODIFIER_CONTEXT_OPTIONS);

    html.on('change blur', '.context-csv-input', (ev) => {
        ev.currentTarget.value = normalizeCsv(ev.currentTarget.value);
    });

    html.on('click', '.open-context-picker', (ev) => {
        ev.preventDefault();
        const targetInputName = ev.currentTarget.dataset.targetInput;
        const input = this.form?.querySelector(`[name="${targetInputName}"]`);
        if (!input) return;
        openContextPicker({ input, options: ROLL_MODIFIER_CONTEXT_OPTIONS });
     });
    html.on("click", ".open-effect-path-picker", event => {
        event.preventDefault();
        const button = event.currentTarget;
        const pathInput = this.form?.querySelector(`[name="${button.dataset.targetInput}"]`);
        const operationInput = this.form?.querySelector(`[name="${button.dataset.operationInput}"]`);
        openEffectPathPicker({ pathInput, operationInput, durationMode: this.item.system.duration?._uiMode || "permanent" });
    });
    html.on("click", ".open-purpose-picker", event => {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        const input = this.form?.querySelector(`[name="${button.dataset.targetInput}"]`);
        if (!input) return;
        const attributeInput = button.dataset.attributeInput ? this.form?.querySelector(`[name="${button.dataset.attributeInput}"]`) : null;
        openRollPurposePicker({
            selectedIds: input.value,
            attributeKey: attributeInput?.value,
            onApply: ids => {
                input.value = ids.join(",");
                input.dispatchEvent(new Event("change", { bubbles: true }));
                const summary = button.closest(".effect-purpose-control")?.querySelector(".effect-purpose-summary");
                if (summary) summary.textContent = formatPurposeSelection(ids);
            }
        });
    });
    html.on('click', '.open-roll-tag-picker', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const input = this.form?.querySelector(`[name="${ev.currentTarget.dataset.targetInput}"]`);
        if (!input) return;
       const selected = normalizeRollTags(input.value);
        const custom = selected.filter(tag => !isKnownRollTag(tag));
        const matchInputName = ev.currentTarget.dataset.targetInput.replace(/\.roll_tags$/, ".roll_tag_match");
        const matchInput = this.form?.querySelector(`[name="${matchInputName}"]`);
        const initialMatch = matchInput?.value === "all" ? "all" : "any";
        const esc = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
        const fold = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
        const aliasText = id => Object.entries(ROLL_TAG_ALIASES).filter(([, canonical]) => canonical === id).map(([alias]) => alias).join(" ");
        let optionIndex = 0;
        const optionMarkup = (tag, isCustom = false) => {
            const checkboxId = `gum-roll-tag-${Date.now()}-${optionIndex++}`;
            const description = isCustom ? "Tag personalizada (correspondência exata)." : tag.description;
            const search = fold(`${tag.label} ${tag.id} ${description} ${aliasText(tag.id)} ${(tag.keywords || []).join(" ")}`);
            return `<div class="roll-tag-picker-option${tag.selected ? " is-selected" : ""}" data-search="${esc(search)}" tabindex="0">
              <input id="${checkboxId}" type="checkbox" name="roll-tag" value="${esc(tag.id)}" ${tag.selected ? "checked" : ""}>
              <label for="${checkboxId}"><strong>${esc(tag.label)}</strong><code>${esc(tag.id)}</code></label>
              <button type="button" class="roll-tag-picker-info" aria-label="Informações sobre ${esc(tag.label)}" aria-expanded="false"><i class="fas fa-info-circle" aria-hidden="true"></i><span role="tooltip">${esc(description)}</span></button>
            </div>`;
        };
        const groups = getGroupedRollTags(selected).map(group => {
            const label = group.id === "tests" ? "Categorias abrangentes" : group.label;
            const help = group.id === "tests" ? `<span class="roll-tag-group-help" title="Categorias abrangentes alcançam todas as finalidades relacionadas." aria-label="Categorias abrangentes alcançam todas as finalidades relacionadas."><i class="fas fa-circle-info" aria-hidden="true"></i></span>` : "";
            const selectedCount = group.tags.filter(tag => tag.selected).length;
            return `<details class="roll-tag-picker-group" data-group="${esc(group.id)}" ${selectedCount ? "open" : ""}><summary><span>${esc(label)} ${help}</span><span class="roll-tag-group-count"><b>${selectedCount}</b>/${group.tags.length}</span></summary><div class="roll-tag-group-options">${group.tags.map(tag => optionMarkup(tag)).join("")}</div></details>`;
        }).join("");
        const customContent = custom.length ? `<details class="roll-tag-picker-group" data-group="custom" open><summary><span>Personalizadas e legadas</span><span class="roll-tag-group-count"><b>${custom.length}</b>/${custom.length}</span></summary><div class="roll-tag-group-options">${custom.map(id => optionMarkup({ id, label: id, selected: true }, true)).join("")}</div></details>` : "";
        new Dialog({
            title: "Selecionar marcadores de finalidade",
            content: `<div class="gum-roll-tag-picker">
              <div class="roll-tag-picker-searchbox"><i class="fas fa-search" aria-hidden="true"></i><input type="search" class="roll-tag-picker-search" placeholder="Buscar marcador por nome, chave ou descrição..." aria-label="Buscar marcadores"><button type="button" class="roll-tag-search-clear" aria-label="Limpar pesquisa"><i class="fas fa-times" aria-hidden="true"></i></button></div>
              <div class="roll-tag-picker-tools"><strong class="roll-tag-selected-summary"></strong><button type="button" class="roll-tag-clear-selection">Limpar</button><label><input type="checkbox" class="roll-tag-selected-only"> Mostrar somente selecionados</label><span class="roll-tag-result-count" aria-live="polite"></span></div>
              <fieldset class="roll-tag-match"><legend>Correspondência</legend><label title="O modificador é aplicado quando ao menos um marcador corresponde."><input type="radio" name="picker-roll-tag-match" value="any" ${initialMatch === "any" ? "checked" : ""}> Pelo menos um</label><label title="O modificador só é aplicado quando todos os marcadores selecionados estão presentes na rolagem."><input type="radio" name="picker-roll-tag-match" value="all" ${initialMatch === "all" ? "checked" : ""}> Todas</label></fieldset>
              <div class="roll-tag-picker-results">${customContent}${groups}<div class="roll-tag-picker-empty" hidden><strong>Nenhum marcador encontrado.</strong><span>Tente outro termo ou utilize uma tag personalizada no campo do efeito.</span></div></div>
            </div>`,
            render: dlgHtml => {
                const root = dlgHtml.find('.gum-roll-tag-picker');
                const windowElement = root.closest('.window-app').addClass('gum-roll-tag-picker-window');
                windowElement.find('.window-header .close').attr({ title: 'Fechar', 'aria-label': 'Fechar' });
                const search = root.find('.roll-tag-picker-search');
                let expansionBeforeFilter = null;
                const refresh = () => {
                    const query = fold(search.val().trim());
                    const selectedOnly = root.find('.roll-tag-selected-only').prop('checked');
                    const filtering = Boolean(query || selectedOnly);
                    if (filtering && !expansionBeforeFilter) expansionBeforeFilter = root.find('.roll-tag-picker-group').toArray().map(group => group.open);
                    let visibleCount = 0;
                    root.find('.roll-tag-picker-group').each((groupIndex, group) => {
                        let groupVisible = 0, groupSelected = 0;
                        $(group).find('.roll-tag-picker-option').each((_index, option) => {
                            const checked = $(option).find('input[name="roll-tag"]').prop('checked');
                            groupSelected += checked ? 1 : 0;
                            option.hidden = Boolean((query && !option.dataset.search.includes(query)) || (selectedOnly && !checked));
                            groupVisible += option.hidden ? 0 : 1;
                        });
                        group.hidden = filtering && !groupVisible;
                        if (filtering && groupVisible) group.open = true;
                        $(group).find('.roll-tag-group-count b').text(groupSelected);
                        visibleCount += groupVisible;
                    });
                    if (!filtering && expansionBeforeFilter) {
                        root.find('.roll-tag-picker-group').each((index, group) => group.open = expansionBeforeFilter[index]);
                        expansionBeforeFilter = null;
                    }
                    const count = root.find('input[name="roll-tag"]:checked').length;
                    root.find('.roll-tag-selected-summary').text(`${count} ${count === 1 ? "marcador selecionado" : "marcadores selecionados"}`);
                    root.find('.roll-tag-result-count').text(`${visibleCount} ${visibleCount === 1 ? "resultado" : "resultados"}`);
                    root.find('.roll-tag-picker-empty').prop('hidden', visibleCount !== 0);
                    windowElement.find('[data-button="ok"]').html(`<i class="fas fa-check"></i> ${count ? `Aplicar ${count} ${count === 1 ? "marcador" : "marcadores"}` : "Aplicar"}`);
                };
                root.on('change', 'input[name="roll-tag"]', event => { $(event.currentTarget).closest('.roll-tag-picker-option').toggleClass('is-selected', event.currentTarget.checked); refresh(); });
                root.on('input', '.roll-tag-picker-search', refresh);
                root.on('change', '.roll-tag-selected-only', refresh);
                root.on('click', '.roll-tag-search-clear', () => { search.val('').trigger('input').trigger('focus'); });
                root.on('click', '.roll-tag-clear-selection', () => { root.find('input[name="roll-tag"]').prop('checked', false).trigger('change'); });
                root.on('click', '.roll-tag-picker-option', event => { if ($(event.target).is('input, label, label *, button, button *')) return; $(event.currentTarget).find('input').trigger('click'); });
                root.on('keydown', '.roll-tag-picker-option', event => { if (event.key === ' ' && event.target === event.currentTarget) { event.preventDefault(); $(event.currentTarget).find('input').trigger('click'); } });
                root.on('click', '.roll-tag-picker-info', event => { event.stopPropagation(); const button = $(event.currentTarget); button.attr('aria-expanded', button.attr('aria-expanded') !== 'true' ? 'true' : 'false'); });
                search.on('keydown', event => {
                    if (event.key === 'Escape' && search.val()) { event.preventDefault(); event.stopPropagation(); search.val('').trigger('input'); }
                    if (event.key === 'Enter') { const visible = root.find('.roll-tag-picker-option:visible'); if (visible.length === 1) { event.preventDefault(); visible.find('input').trigger('click'); } }
                });
                refresh();
                search.trigger('focus');
            },
            buttons: {
                ok: { icon: '<i class="fas fa-check"></i>', label: 'Aplicar', callback: dlgHtml => {
                    input.value = normalizeRollTags(dlgHtml.find('input[name="roll-tag"]:checked').toArray().map(element => element.value)).join(', ');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    if (matchInput) {
                        matchInput.value = dlgHtml.find('input[name="picker-roll-tag-match"]:checked').val() === "all" ? "all" : "any";
                        matchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        matchInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }},
                cancel: { icon: '<i class="fas fa-times"></i>', label: 'Cancelar' }
            }, default: 'ok'
        }, {
            width: 740
        }).render(true);
    });
    html.find(".duration-mode-select").on("change", async (ev) => {
    const mode = ev.currentTarget.value;
    const isPermanent = mode === "permanent";
    const inCombat = mode === "combat";

    await this.item.update({
        "system.duration._uiMode": mode,
        "system.duration.isPermanent": isPermanent,
        "system.duration.inCombat": inCombat
    });
    });

 html.on("click", ".add-roll-mod-entry", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const actionIndex = Number(ev.currentTarget.dataset.actionIndex);
        const actions = getEffectActionsFromSystem(this.item.system);
        if (Number.isNaN(actionIndex) || !actions[actionIndex]) return;
        const entries = Array.isArray(actions[actionIndex].roll_modifier_entries) ? foundry.utils.deepClone(actions[actionIndex].roll_modifier_entries) : [];
        const newEntryIndex = entries.length;
        entries.push({
            label: "",
            value: 0,
            value_mode: "fixed",
            cap: "",
            contexts: "all",
            application_side: "self",
            target_kind: "any",
            target_mode: "all",
            target_values: "",
            source_item_ids: "",
            source_attack_ids: "",
            roll_tags: "",
            roll_tag_match: "any",
            nh_display_mode: "roll_only"
        });
        actions[actionIndex].roll_modifier_entries = entries;
        this._ensureExpandedActions().add(actionIndex);
        this._setRollEntryExpanded(actionIndex, newEntryIndex, true);
        this._pendingScrollSelector = `.roll-mod-entry-details[data-action-index="${actionIndex}"][data-entry-index="${newEntryIndex}"]`;
        await this.item.update({ "system.actions": actions });
    });

    html.on("click", ".remove-roll-mod-entry", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const actionIndex = Number(ev.currentTarget.dataset.actionIndex);
        const entryIndex = Number(ev.currentTarget.dataset.entryIndex);
        const actions = getEffectActionsFromSystem(this.item.system);
        if (Number.isNaN(actionIndex) || !actions[actionIndex]) return;
        const entries = Array.isArray(actions[actionIndex].roll_modifier_entries) ? foundry.utils.deepClone(actions[actionIndex].roll_modifier_entries) : [];
        if (Number.isNaN(entryIndex) || entryIndex < 0 || entryIndex >= entries.length) return;
        entries.splice(entryIndex, 1);
        actions[actionIndex].roll_modifier_entries = entries.length
            ? entries
            : [{
                label: "",
                value: 0,
                value_mode: "fixed",
                cap: "",
                contexts: "all",
                application_side: "self",
                target_kind: "any",
                target_mode: "all",
                target_values: "",
                source_item_ids: "",
                source_attack_ids: "",
                roll_tags: "",
                roll_tag_match: "any",
                nh_display_mode: "roll_only"
            }];
        this._reindexExpandedRollEntriesAfterRemoval(actionIndex, entryIndex);
        await this.item.update({ "system.actions": actions });
    });

    html.on("toggle", ".effect-action-details", (ev) => {
        const index = Number(ev.currentTarget.dataset.actionIndex);
        if (!Number.isNaN(index)) {
            const expandedActions = this._ensureExpandedActions();
            ev.currentTarget.open ? expandedActions.add(index) : expandedActions.delete(index);
        }
    });

    html.on("toggle", ".roll-mod-entry-details", (ev) => {
        const actionIndex = Number(ev.currentTarget.dataset.actionIndex);
        const entryIndex = Number(ev.currentTarget.dataset.entryIndex);
        if (!Number.isNaN(actionIndex) && !Number.isNaN(entryIndex)) this._setRollEntryExpanded(actionIndex, entryIndex, ev.currentTarget.open);
    });

    html.on("toggle", ".roll-mod-entry-restrictions", (ev) => {
        const actionIndex = Number(ev.currentTarget.dataset.actionIndex);
        const entryIndex = Number(ev.currentTarget.dataset.entryIndex);
        if (!Number.isNaN(actionIndex) && !Number.isNaN(entryIndex)) {
            this._setRollEntryRestrictionsExpanded(actionIndex, entryIndex, ev.currentTarget.open);
        }
    });

}

    _ensureExpandedActions() {
        if (!this._expandedActions) this._expandedActions = new Set();
        return this._expandedActions;
    }

    _isActionExpanded(index) {
        return this._expandedActions ? this._expandedActions.has(index) : index === 0;
    }

    _isRollEntryExpanded(actionIndex, entryIndex) {
        const entries = this._expandedRollEntries.get(actionIndex);
        return entries ? entries.has(entryIndex) : entryIndex === 0;
    }

    _setRollEntryExpanded(actionIndex, entryIndex, expanded) {
        if (!this._expandedRollEntries.has(actionIndex)) this._expandedRollEntries.set(actionIndex, new Set());
        const entries = this._expandedRollEntries.get(actionIndex);
        expanded ? entries.add(entryIndex) : entries.delete(entryIndex);
    }

     _areRollEntryRestrictionsExpanded(actionIndex, entryIndex) {
        return this._expandedRollEntryRestrictions.get(actionIndex)?.has(entryIndex) ?? false;
    }

    _setRollEntryRestrictionsExpanded(actionIndex, entryIndex, expanded) {
        if (!this._expandedRollEntryRestrictions.has(actionIndex)) this._expandedRollEntryRestrictions.set(actionIndex, new Set());
        const entries = this._expandedRollEntryRestrictions.get(actionIndex);
        expanded ? entries.add(entryIndex) : entries.delete(entryIndex);
    }

    _reindexExpandedActionsAfterRemoval(removedIndex) {
        const nextActions = new Set();
        const nextEntries = new Map();
        const nextRestrictions = new Map();
        for (const index of (this._expandedActions || new Set([0]))) {
            if (index < removedIndex) nextActions.add(index);
            else if (index > removedIndex) nextActions.add(index - 1);
        }
        for (const [actionIndex, entries] of this._expandedRollEntries.entries()) {
            if (actionIndex === removedIndex) continue;
            nextEntries.set(actionIndex > removedIndex ? actionIndex - 1 : actionIndex, entries);
        }
        for (const [actionIndex, entries] of this._expandedRollEntryRestrictions.entries()) {
            if (actionIndex === removedIndex) continue;
            nextRestrictions.set(actionIndex > removedIndex ? actionIndex - 1 : actionIndex, entries);
        }

        this._expandedActions = nextActions;
        this._expandedRollEntries = nextEntries;
        this._expandedRollEntryRestrictions = nextRestrictions;
    }

    _reindexExpandedRollEntriesAfterRemoval(actionIndex, removedEntryIndex) {
        const entries = this._expandedRollEntries.get(actionIndex);
        if (!entries) return;
        const next = new Set();
        for (const index of entries) {
            if (index < removedEntryIndex) next.add(index);
            else if (index > removedEntryIndex) next.add(index - 1);
        }
        this._expandedRollEntries.set(actionIndex, next.size ? next : new Set([0]));

        const restrictions = this._expandedRollEntryRestrictions.get(actionIndex);
        if (!restrictions) return;
        const nextRestrictions = new Set();
        for (const index of restrictions) {
            if (index < removedEntryIndex) nextRestrictions.add(index);
            else if (index > removedEntryIndex) nextRestrictions.add(index - 1);
        }
        this._expandedRollEntryRestrictions.set(actionIndex, nextRestrictions);
    }

     // ✅ FUNÇÃO AUXILIAR PARA ABRIR O EDITOR DE TEXTO (A PARTE QUE FALTAVA) ✅
    _onEditText(event) {
        const target = $(event.currentTarget);
        const fieldName = target.data('target');
        const title = target.attr('title');
        const currentContent = foundry.utils.getProperty(this.item, fieldName) || "";

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
    }

    _toggleEditor(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        container.find('.description-view').toggle();
        container.find('.description-editor').toggle();
        if (field) {
            const editor = container.find(`.editor[data-edit=\"${field}\"]`);
            if (editor.length) {
                editor.trigger('focus');
            }
        }
    }

    async _saveDescription(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        const content = await this._getEditorContent(field, container);
        if (!field || content === null || content === undefined) return;
        await this.item.update({ [field]: content });
        const enriched = await TextEditorImpl.enrichHTML(content, { async: true });
        container.find('.description-view').html(enriched);
        if (field === "system.chat_description") {
            this.element?.find('.effect-card .rendered-text').html(enriched);
        }
        container.find('.description-view').show();
        container.find('.description-editor').hide();
    }

    _cancelDescription(event) {
        event.preventDefault();
        const container = $(event.currentTarget).closest('.description-section');
 container.find('.description-view').show();
        container.find('.description-editor').hide();
    }

    _getEditorInstance(field) {
        const editor = this.editors?.[field];
        if (!editor) return null;
        return editor.editor ?? editor.instance ?? editor;
    }

    async _getEditorContent(field, container) {
        if (!field) return null;
        const instance = this._getEditorInstance(field);
        if (instance?.getHTML) {
            const html = instance.getHTML();
            return html?.then ? await html : html;
        }
        if (instance?.getContent) {
            const content = instance.getContent();
            return content?.then ? await content : content;
        }
        if (instance?.view?.dom?.innerHTML) return instance.view.dom.innerHTML;
        if (TextEditorImpl?.getContent) {
            const element = container.find(`[name="${field}"]`).get(0)
                ?? container.find(`.editor[data-edit="${field}"]`).get(0);
            if (element) return TextEditorImpl.getContent(element);
        }
        const namedInput = container.find(`[name="${field}"]`);
        if (namedInput.length) return namedInput.val();
        const editorElement = container.find(`.editor[data-edit="${field}"]`);
        if (editorElement.length) return editorElement.val() ?? editorElement.html();
        return "";
    }

    async _updateObject(event, formData) {
        const actionEntries = new Map();
        const rollEntries = new Map();
        if (Object.hasOwn(formData, "system.resistanceRoll.requestedPurposeIds")) {
            formData["system.resistanceRoll.requestedPurposeIds"] = normalizePurposeIds(formData["system.resistanceRoll.requestedPurposeIds"]);
        }

        for (const [key, value] of Object.entries(formData)) {
            const actionMatch = key.match(/^system\.actions\.(\d+)\.([a-zA-Z0-9_]+)$/);
            const rollEntryMatch = key.match(/^system\.actions\.(\d+)\.roll_modifier_entries\.(\d+)\.(label|value|value_mode|cap|contexts|application_side|target_kind|target_mode|target_values|source_item_ids|source_attack_ids|roll_tags|roll_tag_match|nh_display_mode)$/); 
            if (rollEntryMatch) {
                const actionIndex = Number(rollEntryMatch[1]);
                const entryIndex = Number(rollEntryMatch[2]);
                const field = rollEntryMatch[3];
                if (!rollEntries.has(actionIndex)) rollEntries.set(actionIndex, new Map());
                const entryMap = rollEntries.get(actionIndex);
                if (!entryMap.has(entryIndex)) {
                    entryMap.set(entryIndex, {
                        label: "",
                        value: 0,
                        value_mode: "fixed",
                        cap: "",
                        contexts: "all",
                        application_side: "self",
                        target_kind: "any",
                        target_mode: "all",
                        target_values: "",
                        source_item_ids: "",
                        source_attack_ids: "",
                        roll_tags: "",
                        roll_tag_match: "any",
                        nh_display_mode: "roll_only"
                    });
                }
                entryMap.get(entryIndex)[field] = value;
                delete formData[key];
                continue;
            }
            if (actionMatch) {
                const actionIndex = Number(actionMatch[1]);
                const field = actionMatch[2];
                if (!actionEntries.has(actionIndex)) actionEntries.set(actionIndex, {});
                actionEntries.get(actionIndex)[field] = value;
                delete formData[key];
            }
        }

        if (actionEntries.size || rollEntries.size) {
            const allIndexes = [...new Set([...actionEntries.keys(), ...rollEntries.keys()])].sort((a, b) => a - b);
            const actions = allIndexes.map((index) => {
                const actionData = actionEntries.get(index) || {};
                const entryMap = rollEntries.get(index);
                if (entryMap) {
                    actionData.roll_modifier_entries = Array.from(entryMap.entries())
                        .sort((a, b) => a[0] - b[0])
                        .map(([, entry]) => ({
                            label: (entry.label || "").toString().trim(),
                            value: normalizeRollModifierEntryValue(entry.value),
                            value_mode: entry.value_mode === "per_origin_level" ? "per_origin_level" : "fixed",
                            cap: (entry.cap ?? "").toString().trim(),
                            contexts: (entry.contexts || "all").toString().trim() || "all",
                            application_side: (entry.application_side || "self").toString().trim() || "self",
                            target_kind: (entry.target_kind || "any").toString().trim() || "any",
                            target_mode: (entry.target_mode || "all").toString().trim() || "all",
                            target_values: (entry.target_values || "").toString().trim(),
                            source_item_ids: (entry.source_item_ids || "").toString().trim(),
                            source_attack_ids: (entry.source_attack_ids || "").toString().trim(),
                            roll_tags: (entry.roll_tags || "").toString().trim(),
                            roll_tag_match: entry.roll_tag_match === "all" ? "all" : "any",
                            nh_display_mode: (entry.roll_tags || "").toString().trim() ? "roll_only" : (entry.nh_display_mode || "roll_only").toString().trim() || "roll_only"
                        }));
                }
                return normalizeAction(actionData);
            });

            const normalizedActions = actions.length ? actions : [normalizeAction({})];
            const firstAction = normalizedActions[0];
            formData["system.actions"] = normalizedActions;
            formData["system.schemaVersion"] = 2;

            // Espelha a primeira ação para campos raiz por compatibilidade interna.
            formData["system.type"] = firstAction.type;
            formData["system.path"] = firstAction.path;
            formData["system.operation"] = firstAction.operation;
            formData["system.value"] = firstAction.value;
            formData["system.value_mode"] = firstAction.value_mode;
            formData["system.key"] = firstAction.key;
            formData["system.flag_value"] = firstAction.flag_value;
            formData["system.chat_text"] = firstAction.chat_text;
            formData["system.has_roll"] = Boolean(firstAction.has_roll);
            formData["system.roll_label"] = firstAction.roll_label;
            formData["system.roll_attribute"] = firstAction.roll_attribute;
            formData["system.roll_modifier"] = firstAction.roll_modifier;
            formData["system.roll_modifier_value"] = firstAction.roll_modifier_value;
            formData["system.roll_modifier_cap"] = firstAction.roll_modifier_cap;
            formData["system.roll_modifier_context"] = firstAction.roll_modifier_context;
            formData["system.roll_modifier_application_side"] = firstAction.roll_modifier_application_side;
            formData["system.roll_modifier_entries"] = firstAction.roll_modifier_entries;
            formData["system.requestedPurposeIds"] = firstAction.requestedPurposeIds;
            formData["system.whisperMode"] = firstAction.whisperMode;
            formData["system.category"] = firstAction.category;
            formData["system.name"] = firstAction.name;
            formData["system.chat_notice"] = Boolean(firstAction.chat_notice);
            formData["system.confirm_prompt"] = Boolean(firstAction.confirm_prompt);
            formData["system.variable_value"] = Boolean(firstAction.variable_value);
            formData["system.max"] = firstAction.max;
            formData["system.source"] = firstAction.source;
            formData["system.hidden"] = Boolean(firstAction.hidden);
            formData["system.exists_policy"] = firstAction.exists_policy;
            formData["system.statusId"] = firstAction.statusId;
        }

        return super._updateObject(event, formData);
    }


    async _onOpenReferenceLink(event) {
        event.preventDefault();
        event.stopPropagation();

        const trigger = event.currentTarget;
        const container = trigger.closest('.form-group') ?? this.form;
        const refInput =
            container?.querySelector('input[name="system.ref"]') ??
            this.form?.querySelector('input[name="system.ref"]');

        const rawRef = (refInput?.value ?? this.item.system?.ref ?? '').toString().trim();

        if (!rawRef) {
            return ui.notifications.warn("Preencha o campo REF antes de abrir a referência.");
        }

        const parsedList = this._parseReferenceCodes(rawRef);

        if (!parsedList.length) {
            return ui.notifications.warn("Formato de REF inválido. Use ex.: BA23 ou BA23, MA45.");
        }

        if (parsedList.length === 1) {
            return this._openSingleReference(parsedList[0]);
        }

        return this._promptMultipleReferences(parsedList);
    }

    _parseReferenceCodes(rawRef) {
        const text = (rawRef ?? "").toString().trim().toUpperCase();
        if (!text) return [];

        const parts = text.split(/[,;]+|\s+/).map(s => s.trim()).filter(Boolean);
        const out = [];
        for (const part of parts) {
            const match = part.replace(/\s+/g, "").match(/^([A-Z]+)(\d+)$/);
            if (!match) continue;
            out.push({ code: match[1], page: Number(match[2]) });
        }
        return out;
    }

    _findPdfPageByCode(code) {
        const journals = game.journal ? Array.from(game.journal) : [];

        for (const journal of journals) {
            const pages = journal?.pages ? Array.from(journal.pages) : [];
            for (const page of pages) {
                if (page?.type !== 'pdf') continue;

                const pageCode = (page.getFlag('gum', 'pdfCode') ?? '').toString().trim().toUpperCase();
                if (!pageCode || pageCode !== code) continue;

                return {
                    journal,
                    page,
                    pageOffset: Number(page.getFlag('gum', 'pageOffset') ?? 0)
                };
            }
        }

        return null;
    }

    async _openSingleReference(parsed) {
        const match = this._findPdfPageByCode(parsed.code);
        if (!match) {
            return ui.notifications.warn(`Nenhum PDF com código "${parsed.code}" foi encontrado nos periódicos.`);
        }

        const pageNumber = Math.max(1, parsed.page + (Number(match.pageOffset) || 0));
        await this._openPdfReferencePage(match.page, pageNumber);
    }

    _promptMultipleReferences(parsedList) {
        const buttons = {};
        const missing = [];

        for (const parsed of parsedList) {
            const match = this._findPdfPageByCode(parsed.code);
            if (!match) {
                missing.push(`${parsed.code}${parsed.page}`);
                continue;
            }

            const pageNumber = Math.max(1, parsed.page + (Number(match.pageOffset) || 0));
            const key = `${parsed.code}${parsed.page}`;

            buttons[key] = {
                label: `${parsed.code}${parsed.page}`,
                callback: () => this._openPdfReferencePage(match.page, pageNumber)
            };
        }

        if (!Object.keys(buttons).length) {
            return ui.notifications.warn("Nenhuma das referências informadas foi encontrada nos periódicos.");
        }

        const missingHtml = missing.length
            ? `<p style="opacity:.8;margin-top:.5rem"><b>Não encontradas:</b> ${missing.join(", ")}</p>`
            : "";

        new Dialog({
            title: "Múltiplas Referências",
            content: `<p>Escolha qual referência deseja abrir:</p>${missingHtml}`,
            buttons,
            default: Object.keys(buttons)[0]
        }).render(true);
    }

    _findPdfViewerIframesBySource(sourcePath) {
        const iframes = Array.from(document.querySelectorAll("iframe"));
        if (!iframes.length) return [];

        const want = (sourcePath || "").toString();
        const wantName = want.split("/").pop();

        const matches = (candidate) => {
            if (!candidate) return false;
            if (!want) return true;
            if (candidate.includes(want)) return true;
            if (wantName && (candidate.includes(wantName) || candidate.includes(encodeURIComponent(wantName)))) return true;

            try {
                const u = new URL(candidate, window.location.origin);
                const file = u.searchParams.get("file");
                if (!file) return false;
                const decoded = decodeURIComponent(file);
                return decoded.includes(want) || (wantName && decoded.includes(wantName));
            } catch (_e) {
                return false;
            }
        };

        return iframes.filter((f) => {
            const src = f.getAttribute("src") || "";
            const dataSrc = f.getAttribute("data-src") || f.getAttribute("data-url") || f.dataset?.src || f.dataset?.url || "";
            const cand = src || dataSrc;
            if (!cand) return false;

            const looksLikePdfViewer = /pdfjs|viewer\.html/i.test(cand);
            if (!looksLikePdfViewer) return false;

            return matches(cand);
        });
    }

    _setPageOnPdfViewerIframe(iframe, page) {
        if (!(iframe instanceof HTMLIFrameElement)) return false;
        const target = Math.max(1, Number(page) || 1);

        try {
            const app = iframe.contentWindow?.PDFViewerApplication;
            if (app?.pdfViewer) {
                app.pdfViewer.currentPageNumber = target;
                app.page = target;
                return true;
            }
        } catch (_e) {
            // noop
        }

        const attr = "src";
        const current = iframe.getAttribute(attr) || "";
        const dataSrc = iframe.getAttribute("data-src") || iframe.getAttribute("data-url") || iframe.dataset?.src || iframe.dataset?.url || "";
        const candidate = current || dataSrc;
        if (!candidate) return false;

        const updated = (() => {
            const [base, rawHash = ""] = candidate.split("#");
            const params = new URLSearchParams(rawHash);
            params.set("page", String(target));
            return `${base}#${params.toString()}`;
        })();

        if (dataSrc) {
            iframe.setAttribute("data-src", updated);
            iframe.setAttribute("data-url", updated);
            iframe.dataset.src = updated;
            iframe.dataset.url = updated;
        }
        iframe.setAttribute("src", updated);

        return true;
    }

    async _openPdfReferencePage(pdfPage, targetPage) {
        const journal = pdfPage?.parent;
        if (!journal) return;

        const page = Math.max(1, Number(targetPage) || 1);
        const sourcePath = (pdfPage.src ?? pdfPage.system?.src ?? "").toString();
        await journal.sheet.render(true, { pageId: pdfPage.id, mode: "view" });

        const tryPosition = () => {
            const frames = this._findPdfViewerIframesBySource(sourcePath);
            const fallback = frames.length ? frames : Array.from(document.querySelectorAll('iframe[src*="pdfjs" i], iframe[src*="viewer.html" i]'));
            if (!fallback.length) return false;

            let ok = false;
            for (const f of fallback) ok = this._setPageOnPdfViewerIframe(f, page) || ok;
            return ok;
        };

        const delays = [0, 80, 180, 350, 600, 900, 1300, 1800, 2500];
        for (const d of delays) {
            await new Promise(r => setTimeout(r, d));
            if (tryPosition()) return;
        }

        const frames = this._findPdfViewerIframesBySource(sourcePath);
        for (const f of frames) {
            f.addEventListener("load", () => {
                try { this._setPageOnPdfViewerIframe(f, page); } catch (_e) {}
            }, { once: true });
        }

        ui.notifications.warn("Não foi possível posicionar o PDF na página solicitada automaticamente.");
    }

}
