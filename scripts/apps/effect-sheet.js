// GUM/scripts/apps/effect-sheet.js
import { getGroupedRollTags, isKnownRollTag, normalizeRollTags, ROLL_TAG_ALIASES } from "../../module/utils/roll-tags.mjs";
import { getPurposeLabels, normalizePurposeIds } from "../../module/utils/roll-purposes.mjs";
import { formatPurposeSelection, openRollPurposePicker } from "../../module/apps/roll-purpose-picker.mjs";
import { normalizeContextCsv, openContextPicker } from "../../module/apps/context-picker.mjs";
import { normalizeEffectDamageAction } from "../../module/services/effect-damage-roll-service.mjs";
import { openEffectPathPicker } from "../../module/apps/effect-path-picker.mjs";
import { normalizeBarrierBranches } from "../../module/utils/roll-request-data.mjs";
import {
    ATTRIBUTE_CHAT_VISIBILITIES,
    normalizeAttributeChatVisibility,
    normalizeEffectTestChatVisibility
} from "../../module/utils/effect-chat-visibility.mjs";
import { buildStatusCatalog, resolveStatusCatalogEntry } from "../../module/utils/status-catalog.mjs";
import { ensureEffectItemBridge, findEffectItemBridge } from "../../module/integrations/active-effect-bridge.mjs";
import { normalizeRollModifierCompositionMode, ROLL_MODIFIER_COMPOSITION_MODES } from "../../module/utils/roll-modifier-composition.mjs";
import { normalizeDynamicEffectRegion } from "../../module/services/dynamic-effect-region-service.mjs";


const { ItemSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;
const localize = (key, fallback = key) => {
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
};
const format = (key, data, fallback = key) => {
    const value = globalThis.game?.i18n?.format?.(key, data);
    return value && value !== key ? value : fallback;
};


const ROLL_MODIFIER_CONTEXT_OPTIONS = [
    { id: "all", key: "All" }, { id: "attack", key: "Attack" },
    { id: "attack_melee", key: "MeleeAttack" }, { id: "attack_ranged", key: "RangedAttack" },
    { id: "defense", key: "Defense" }, { id: "defense_dodge", key: "Dodge" },
    { id: "defense_parry", key: "Parry" }, { id: "defense_block", key: "Block" },
    { id: "skill", key: "Skill" }, { id: "spell", key: "Spell" }, { id: "power", key: "Power" },
    { id: "sense_vision", key: "Vision" }, { id: "sense_hearing", key: "Hearing" },
    { id: "sense_tastesmell", key: "TasteSmell" }, { id: "sense_touch", key: "Touch" },
    { id: "check_st", key: "CheckST" }, { id: "skill_st", key: "SkillST" }, { id: "spell_st", key: "SpellST" }, { id: "power_st", key: "PowerST" },
    { id: "check_dx", key: "CheckDX" }, { id: "skill_dx", key: "SkillDX" }, { id: "spell_dx", key: "SpellDX" }, { id: "power_dx", key: "PowerDX" },
    { id: "check_iq", key: "CheckIQ" }, { id: "skill_iq", key: "SkillIQ" }, { id: "spell_iq", key: "SpellIQ" }, { id: "power_iq", key: "PowerIQ" },
    { id: "check_ht", key: "CheckHT" }, { id: "skill_ht", key: "SkillHT" }, { id: "spell_ht", key: "SpellHT" }, { id: "power_ht", key: "PowerHT" },
    { id: "check_per", key: "CheckPer" }, { id: "skill_per", key: "SkillPer" }, { id: "spell_per", key: "SpellPer" }, { id: "power_per", key: "PowerPer" },
    { id: "check_vont", key: "CheckWill" }, { id: "skill_vont", key: "SkillWill" }, { id: "spell_vont", key: "SpellWill" }, { id: "power_vont", key: "PowerWill" }
];

const ROLL_MODIFIER_APPLICATION_OPTIONS = [
    { id: "self", key: "Self" },
    { id: "vs_targeter", key: "VsTargeter" }
];


const EFFECT_ACTION_TYPE_PRESENTATION = {
    attribute: { key: "Attribute", icon: "fas fa-chart-line", className: "is-attribute" },
    status: { key: "Status", icon: "fas fa-heartbeat", className: "is-status" },
    resource_change: { key: "ResourceChange", icon: "fas fa-battery-half", className: "is-resource-change" },
    resource_create: { key: "ResourceCreate", icon: "fas fa-plus-circle", className: "is-resource-create" },
    roll_modifier: { key: "RollModifier", icon: "fas fa-dice", className: "is-roll-modifier" },
    skill_modifier: { key: "SkillModifier", icon: "fas fa-graduation-cap", className: "is-roll-modifier" },
    combat_modifier: { key: "CombatModifier", icon: "fas fa-swords", className: "is-roll-modifier" },
    damage_roll: { key: "DamageRoll", icon: "fas fa-burst", className: "is-damage-roll" },
    chat: { key: "Chat", icon: "fas fa-comment", className: "is-chat" },
    macro: { key: "Macro", icon: "fas fa-code", className: "is-macro" },
    flag: { key: "Flag", icon: "fas fa-flag", className: "is-flag" }
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

const formatActionCount = (count) => format(count === 1 ? "GUM.EffectSheet.Count.ActionOne" : "GUM.EffectSheet.Count.ActionMany", { count }, `${count} ${count === 1 ? "ação" : "ações"}`);
const formatEntryCount = (count) => format(count === 1 ? "GUM.EffectSheet.Count.EntryOne" : "GUM.EffectSheet.Count.EntryMany", { count }, `${count} ${count === 1 ? "entrada" : "entradas"}`);

const getApplicationSideLabel = (id) => {
    const option = ROLL_MODIFIER_APPLICATION_OPTIONS.find(opt => opt.id === id);
    return option ? localize(`GUM.EffectSheet.Application.${option.key}`) : id || localize("GUM.EffectSheet.Application.SelfShort");
};
const getShortApplicationSideLabel = (id) => localize(id === "vs_targeter" ? "GUM.EffectSheet.Application.VsTargeterShort" : "GUM.EffectSheet.Application.SelfShort");
const getAbilityKindLabel = (id) => {
    const labels = {
        skill: localize("GUM.EffectSheet.AbilityKind.skill"),
        spell: localize("GUM.EffectSheet.AbilityKind.spell"),
        power: localize("GUM.EffectSheet.AbilityKind.power"),
        all: localize("GUM.EffectSheet.AbilityKind.all")
    };
    return labels[id] || labels.skill;
};

const buildRollEntrySummary = (entry = {}) => {
    const parts = compactParts(entry.label, entry.value, entry.contexts || "all", getShortApplicationSideLabel(entry.application_side || "self"));
    return parts.length ? parts.join(" · ") : localize("GUM.EffectSheet.Summary.UnlabeledModifier");
};

const buildActionSummary = (action = {}) => {
    switch (action.type) {
        case "attribute":
            return compactParts(action.path, action.operation, action.value, localize(`GUM.EffectSheet.ChatVisibility.${action.attribute_chat_visibility}`, ATTRIBUTE_CHAT_VISIBILITIES[action.attribute_chat_visibility])).join(" · ") || localize("GUM.EffectSheet.Summary.AttributeModifier");
        case "status":
            return format("GUM.EffectSheet.Summary.Status", { status: action.statusLabel || action.statusId || localize("GUM.EffectSheet.Summary.NotDefined") });
        case "resource_change":
            return compactParts(localize(`GUM.EffectSheet.Resource.${action.category}`, RESOURCE_CATEGORY_LABELS[action.category]) || action.category, action.value).join(" · ") || localize("GUM.EffectSheet.Summary.ResourceChange");
                case "resource_create":
            return compactParts(localize(`GUM.EffectSheet.Resource.${action.category}`, RESOURCE_CATEGORY_LABELS[action.category]) || action.category, action.name, `${action.value || 0}/${action.max || 0}`).join(" · ") || localize("GUM.EffectSheet.Summary.ResourceCreate");
        case "roll_modifier":
            return compactParts(action.rollModifierPrimaryContext || localize("GUM.EffectSheet.Summary.AnyRoll"), action.rollModifierPrimarySide || localize("GUM.EffectSheet.Application.SelfShort"), formatEntryCount(action.entryCount || 0)).join(" · ");
        case "skill_modifier":
            return compactParts(
                getAbilityKindLabel(action.ability_kind || "skill"),
                action.skill_scope === "specific" ? action.skill_targets
                    : action.skill_scope === "attribute" ? action.skill_attribute?.toUpperCase()
                    : action.skill_scope === "classification" ? compactParts(action.ability_sources, action.ability_groups, action.ability_sheet_groups, action.ability_schools, action.ability_classes).join(", ")
                    : localize("GUM.EffectSheet.Summary.All"),
                action.modifier_value
            ).join(" · ");
        case "combat_modifier": {
            const changes = [action.combat_attack_enabled && localize("GUM.EffectSheet.Summary.Attack"), action.combat_parry_enabled && localize("GUM.EffectSheet.Summary.Parry"), action.combat_block_enabled && localize("GUM.EffectSheet.Summary.Block"), action.combat_damage_enabled && localize("GUM.EffectSheet.Summary.Damage")].filter(Boolean);
            return compactParts(action.combat_scope === "specific" ? localize("GUM.EffectSheet.Summary.SpecificModes") : action.combat_scope, changes.join(", ")).join(" · ") || localize("GUM.EffectSheet.Summary.CombatModifier");
        }
        case "damage_roll": {
            const secondary = [action.damage_follow_up_formula && localize("GUM.Damage.Roll.FollowUp"), action.damage_fragmentation_formula && localize("GUM.Damage.Roll.Fragmentation")].filter(Boolean);
            return compactParts(action.damage_formula, action.damage_type, secondary.join(", ")).join(" · ") || localize("GUM.EffectSheet.Summary.DamageRoll");
        }
        case "chat":
            return localize(action.chat_text ? "GUM.EffectSheet.Summary.ChatMessagePresent" : "GUM.EffectSheet.Summary.ChatMessage");
        case "macro":
            return compactParts("Macro:", action.value).join(" ") || "Macro";
        case "flag":
            return compactParts(action.key, action.flag_value).join(" · ") || "Flag";
        default:
            return localize("GUM.EffectSheet.Summary.ConfiguredAction");
    }
};

const DEFAULT_EFFECT_ACTION = {
    id: "",
    label: "",
    type: "attribute",
    path: "system.attributes.st.passive",
    operation: "ADD",
    value: "1",
    value_mode: "fixed",
    attribute_chat_visibility: "public",
    key: "",
    flag_value: "",
    chat_text: "",
    has_roll: false,
    roll_label: localize("GUM.EffectSheet.RollTest", "Rolar Teste"),
    roll_attribute: "ht",
    roll_modifier: "0",
    roll_modifier_label: "",
    roll_skip_allowed: false,
    roll_skip_label: "",
    roll_modifier_value: "0",
    roll_modifier_cap: "",
    roll_modifier_context: "all",
    roll_modifier_application_side: "self",
    roll_modifier_composition_group: "",
    roll_modifier_composition_mode: "sum",
    roll_modifier_composition_priority: 0,
    roll_modifier_entries: [],
    modifier_value: "0",
    modifier_value_mode: "fixed",
    modifier_cap: "",
    modifier_application_side: "self",
    modifier_nh_display_mode: "roll_only",
    skill_scope: "all",
    ability_kind: "skill",
    skill_targets: "",
    skill_attribute: "dx",
    ability_sources: "",
    ability_groups: "",
    ability_sheet_groups: "",
    ability_schools: "",
    ability_classes: "",
    combat_scope: "all",
    combat_source_item_ids: "",
    combat_source_attack_ids: "",
    combat_attack_enabled: true,
    combat_attack_value: "0",
    combat_attack_value_mode: "fixed",
    combat_parry_enabled: false,
    combat_parry_value: "0",
    combat_parry_value_mode: "fixed",
    combat_block_enabled: false,
    combat_block_value: "0",
    combat_block_value_mode: "fixed",
    combat_recalculate_parry: false,
    combat_recalculate_block: false,
    combat_damage_enabled: false,
    combat_damage_operation: "fixed",
    combat_damage_value: "0",
    combat_damage_cap: "",
    combat_damage_value_mode: "fixed",
    combat_damage_changes: [],
    damage_formula: "1d6",
    damage_type: "cont",
    damage_nature: "",
    damage_armor_divisor: 1,
    damage_follow_up_formula: "",
    damage_follow_up_type: "",
    damage_follow_up_nature: "",
    damage_follow_up_armor_divisor: 1,
    damage_fragmentation_formula: "",
    damage_fragmentation_type: "",
    damage_fragmentation_nature: "",
    damage_fragmentation_armor_divisor: 1,
    damage_show_prompt: false,
    roll_visibility: "owners",
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
    statusId: ""
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

const normalizeControlledCsv = (value) => {
    const values = Array.isArray(value) ? value : [value];
    return [...new Set(values.flatMap(entry => String(entry ?? "").split(",")).map(entry => entry.trim()).filter(Boolean))].join(", ");
};

const normalizeAction = (action = {}) => {
    const configuredRollVisibility = action?.roll_visibility
        ?? (action?.whisperMode === "blind" ? "target" : action?.whisperMode === "gm" ? "owners" : action?.whisperMode);
    const next = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_EFFECT_ACTION), action || {}, { inplace: false, overwrite: true });
    delete next.delivery;
    next.attribute_chat_visibility = normalizeAttributeChatVisibility(next.attribute_chat_visibility);
    next.roll_visibility = normalizeEffectTestChatVisibility(configuredRollVisibility);
    Object.assign(next, normalizeEffectDamageAction(next));
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
            composition_group: (entry?.composition_group || "").toString().trim(),
            composition_mode: normalizeRollModifierCompositionMode(entry?.composition_mode),
            composition_priority: Number(entry?.composition_priority) || 0,
            ability_sources: normalizeControlledCsv(entry?.ability_sources),
            ability_groups: normalizeControlledCsv(entry?.ability_groups),
            ability_sheet_groups: normalizeControlledCsv(entry?.ability_sheet_groups),
            ability_schools: normalizeControlledCsv(entry?.ability_schools),
            ability_classes: normalizeControlledCsv(entry?.ability_classes),
             roll_tags: Array.isArray(entry?.roll_tags) ? entry.roll_tags.join(",") : (entry?.roll_tags || "").toString().trim(),
            roll_tag_match: entry?.roll_tag_match === "all" ? "all" : "any",
            nh_display_mode: (entry?.roll_tags?.length || String(entry?.roll_tags || "").trim() || String(entry?.composition_group || "").trim()) ? "roll_only" : (entry?.nh_display_mode || "roll_only").toString().trim() || "roll_only"
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
            composition_group: (next.roll_modifier_composition_group || "").toString().trim(),
            composition_mode: normalizeRollModifierCompositionMode(next.roll_modifier_composition_mode),
            composition_priority: Number(next.roll_modifier_composition_priority) || 0,
            roll_tags: (next.roll_modifier_roll_tags || "").toString().trim(),
            roll_tag_match: next.roll_modifier_roll_tag_match === "all" ? "all" : "any",
            nh_display_mode: String(next.roll_modifier_composition_group || "").trim() ? "roll_only" : (next.roll_modifier_nh_display_mode || "roll_only").toString().trim() || "roll_only"
        }];
    next.roll_modifier_value = next.roll_modifier_entries[0]?.value ?? 0;
    next.roll_modifier_cap = next.roll_modifier_entries[0]?.cap ?? "";
    next.roll_modifier_context = next.roll_modifier_entries[0]?.contexts ?? "all";
    next.roll_modifier_application_side = next.roll_modifier_entries[0]?.application_side ?? "self";
    next.roll_modifier_composition_group = next.roll_modifier_entries[0]?.composition_group ?? "";
    next.roll_modifier_composition_mode = next.roll_modifier_entries[0]?.composition_mode ?? "sum";
    next.roll_modifier_composition_priority = next.roll_modifier_entries[0]?.composition_priority ?? 0;
    next.modifier_value = normalizeRollModifierEntryValue(next.modifier_value);
    next.modifier_value_mode = next.modifier_value_mode === "per_origin_level" ? "per_origin_level" : "fixed";
    next.ability_kind = ["skill", "spell", "power", "all"].includes(next.ability_kind) ? next.ability_kind : "skill";
    next.skill_scope = ["all", "specific", "attribute", "classification"].includes(next.skill_scope) ? next.skill_scope : "all";
    next.skill_targets = normalizeControlledCsv(next.skill_targets);
    next.skill_attribute = String(next.skill_attribute || "dx").trim().toLowerCase();
    next.ability_sources = normalizeControlledCsv(next.ability_sources);
    next.ability_groups = normalizeControlledCsv(next.ability_groups);
    next.ability_sheet_groups = normalizeControlledCsv(next.ability_sheet_groups);
    next.ability_schools = normalizeControlledCsv(next.ability_schools);
    next.ability_classes = normalizeControlledCsv(next.ability_classes);
    next.combat_scope = ["all", "melee", "ranged", "specific"].includes(next.combat_scope) ? next.combat_scope : "all";
    next.combat_source_item_ids = normalizeControlledCsv(next.combat_source_item_ids);
    next.combat_source_attack_ids = normalizeControlledCsv(next.combat_source_attack_ids);
    for (const key of ["combat_attack_enabled", "combat_parry_enabled", "combat_block_enabled", "combat_recalculate_parry", "combat_recalculate_block", "combat_damage_enabled"]) next[key] = next[key] === true;
    for (const key of ["combat_attack_value", "combat_parry_value", "combat_block_value", "combat_damage_value"]) next[key] = normalizeRollModifierEntryValue(next[key]);
    next.combat_damage_cap = String(next.combat_damage_cap ?? "").trim();
    for (const key of ["combat_attack_value_mode", "combat_parry_value_mode", "combat_block_value_mode", "combat_damage_value_mode"]) next[key] = next[key] === "per_origin_level" ? "per_origin_level" : "fixed";
    next.combat_damage_operation = ["fixed", "per_die", "extra_dice", "override"].includes(next.combat_damage_operation) ? next.combat_damage_operation : "fixed";
    const rawDamageChanges = Array.isArray(next.combat_damage_changes) ? next.combat_damage_changes : [];
    next.combat_damage_changes = (rawDamageChanges.length ? rawDamageChanges : [{
        component: "main", property: "formula", operation: next.combat_damage_operation,
        value: next.combat_damage_value, value_mode: next.combat_damage_value_mode, cap: next.combat_damage_cap
    }]).map(change => {
        const legacyProperty = ["formula", "type", "armor_divisor", "nature"].includes(change?.property) ? change.property : "formula";
        const isFormulaChange = legacyProperty === "formula";
        return {
            component: ["main", "follow_up", "fragmentation"].includes(change?.component) ? change.component : "main",
            operation: isFormulaChange && ["fixed", "per_die", "extra_dice", "override"].includes(change?.operation) ? change.operation : "fixed",
            value: isFormulaChange ? normalizeRollModifierEntryValue(change?.value) : 0,
            value_mode: isFormulaChange && change?.value_mode === "per_origin_level" ? "per_origin_level" : "fixed",
            cap: isFormulaChange ? String(change?.cap ?? "").trim() : "",
            replace_armor_divisor: String(change?.replace_armor_divisor ?? (legacyProperty === "armor_divisor" ? change?.value : "")).trim(),
            replace_type: String(change?.replace_type ?? (legacyProperty === "type" ? change?.value : "")).trim(),
            replace_nature: String(change?.replace_nature ?? (legacyProperty === "nature" ? change?.value : "")).trim()
        };
    });
    next.id = String(next.id || "");
    next.requestedPurposeIds = normalizePurposeIds(next.requestedPurposeIds ?? next.roll_requested_purpose_ids);
    return next;
};

const getEffectActionsFromSystem = (system = {}) => {
    if (Array.isArray(system.actions)) return system.actions.map((action, index) => ({ ...normalizeAction(action), id: String(action?.id || `legacy-action-${index + 1}`) }));
    return [{ ...normalizeAction(system), id: String(system.id || "legacy-action-1") }];
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
        if (this.item.isOwner) {
            await ensureEffectItemBridge(this.item).catch(error => {
                console.warn(`GUM | Não foi possível preparar a ponte ActiveEffect de "${this.item.name}".`, error);
            });
        }
        const context = await super.getData(options);
        context.system = this.item.system;
        context.system.tokenIconPolicy = context.system.tokenIconPolicy || "auto";
        context.system.conditionStackingMode = context.system.conditionStackingMode || "stack";
        context.tokenIconPolicyOptions = [
            { id: "auto", label: localize("GUM.EffectSheet.TokenIconPolicyAuto") },
            { id: "always", label: localize("GUM.EffectSheet.TokenIconPolicyAlways") },
            { id: "never", label: localize("GUM.EffectSheet.TokenIconPolicyNever") }
        ];
        context.conditionStackingModeOptions = [
            { id: "stack", label: localize("GUM.EffectSheet.Stacking.Stack") },
            { id: "unique", label: localize("GUM.EffectSheet.Stacking.Unique") },
            { id: "refresh", label: localize("GUM.EffectSheet.Stacking.Refresh") }
        ];
        context.statusEffects = buildStatusCatalog(CONFIG.statusEffects);
        context.macros = game.macros.map(m => m.name);
        context.enrichedChatDescription = await TextEditorImpl.enrichHTML(this.item.system.chat_description || "", { async: true });
        context.enrichedDescription = await TextEditorImpl.enrichHTML(this.item.system.description || "", { async: true });
        context.owner = context.owner ?? this.item.isOwner;
        context.editable = this.options.editable ?? this.isEditable;
        const activeEffectBridge = findEffectItemBridge(this.item);
        context.effectItemUuid = this.item.uuid;
        context.activeEffectBridgeUuid = activeEffectBridge?.uuid || "";
        context.hasActiveEffectBridge = Boolean(activeEffectBridge?.uuid);
        const sceneDistance = Number(canvas?.scene?.grid?.distance) || 1;
        context.dynamicRegion = normalizeDynamicEffectRegion(context.system.dynamicRegion, { defaultRange: sceneDistance });
        context.dynamicRegionSupported = Number(game.release?.generation) >= 14
            && typeof CONFIG.Region?.documentClass?.create === "function";
        context.dynamicRegionUnit = canvas?.scene?.grid?.units || localize("GUM.DynamicRegion.SceneUnits", "scene units");
        context.dynamicRegionTargetModes = [
            { id: "all", label: localize("GUM.DynamicRegion.TargetMode.all") },
            { id: "allies", label: localize("GUM.DynamicRegion.TargetMode.allies") },
            { id: "enemies", label: localize("GUM.DynamicRegion.TargetMode.enemies") }
        ];
        context.dynamicRegionShapes = [
            { id: "circle", label: localize("GUM.DynamicRegion.Shape.circle") },
            { id: "emanation", label: localize("GUM.DynamicRegion.Shape.emanation") }
        ];
        context.dynamicRegionInstantTriggers = [
            { id: "on_enter", label: localize("GUM.DynamicRegion.InstantTrigger.on_enter") },
            { id: "turn_start", label: localize("GUM.DynamicRegion.InstantTrigger.turn_start") },
            { id: "turn_end", label: localize("GUM.DynamicRegion.InstantTrigger.turn_end") }
        ];

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
        context.rollModifierContextOptions = ROLL_MODIFIER_CONTEXT_OPTIONS.map(option => ({ ...option, label: localize(`GUM.EffectSheet.Context.${option.key}`) }));
        context.rollModifierApplicationOptions = ROLL_MODIFIER_APPLICATION_OPTIONS.map(option => ({ ...option, label: localize(`GUM.EffectSheet.Application.${option.key}`) }));
        context.rollModifierCompositionOptions = ROLL_MODIFIER_COMPOSITION_MODES.map(id => ({ id, label: localize(`GUM.EffectSheet.Composition.${id}`) }));
        const actions = getEffectActionsFromSystem(context.system);
        context.rollModifierCompositionGroups = [...new Set(actions.flatMap(action => action.roll_modifier_entries || [])
            .map(entry => String(entry?.composition_group || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const statusLabels = new Map(context.statusEffects.map(status => [status.id, status.label]));
        const contextLabels = new Map(context.rollModifierContextOptions.map(opt => [opt.id, opt.label]));
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
                    composition_group: entry?.composition_group || "",
                    composition_mode: normalizeRollModifierCompositionMode(entry?.composition_mode),
                    composition_priority: Number(entry?.composition_priority) || 0,
                    ability_sources: entry?.ability_sources || "",
                    ability_groups: entry?.ability_groups || "",
                    ability_sheet_groups: entry?.ability_sheet_groups || "",
                    ability_schools: entry?.ability_schools || "",
                    ability_classes: entry?.ability_classes || "",
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
                titleText: action.label ? format("GUM.EffectSheet.Action.NumberedNamed", { number: index + 1, name: action.label }) : format("GUM.EffectSheet.Action.Numbered", { number: index + 1 }),
                typeLabel: localize(`GUM.EffectSheet.ActionType.${presentation.key}`),
                typeClass: presentation.className,
                typeIcon: presentation.icon,
                statusLabel: statusLabels.get(action.statusId),
                statusSearchValue: statusLabels.get(action.statusId) || action.statusId || "",
                statusReferenceInvalid: Boolean(action.statusId && !statusLabels.has(action.statusId)),
                entryCount: entries.length,
                entryCountLabel: formatEntryCount(entries.length),
                rollModifierPrimaryContext: contextLabels.get(firstContext) || firstContext,
                rollModifierPrimarySide: getShortApplicationSideLabel(primaryEntry.application_side || "self"),
                isExpanded: this._isActionExpanded(index),
                rollModifierEntries: entries,
                combatDamageChanges: (action.combat_damage_changes || []).map((change, changeIndex) => ({
                    ...change,
                    index: changeIndex,
                    displayIndex: changeIndex + 1,
                    hasReplacements: Boolean(change.replace_armor_divisor || change.replace_type || change.replace_nature)
                }))
            };
            decoratedAction.requestedPurposeIdsCsv = action.requestedPurposeIds.join(",");
            decoratedAction.purposeSelectionSummary = formatPurposeSelection(action.requestedPurposeIds);
            decoratedAction.summaryText = buildActionSummary(decoratedAction);
            return decoratedAction;
        });
        const persistentActionTypes = new Set(["attribute", "flag", "roll_modifier", "skill_modifier", "combat_modifier", "status"]);
        const instantActionTypes = new Set(["resource_change", "resource_create", "damage_roll", "macro", "chat"]);
        context.hasPersistentActions = actions.some(action => persistentActionTypes.has(action.type));
        context.hasInstantActions = actions.some(action => instantActionTypes.has(action.type));
        const resistancePurposeIds = normalizePurposeIds(context.system.resistanceRoll?.requestedPurposeIds);
        context.resistancePurposeIdsCsv = resistancePurposeIds.join(",");
        context.resistancePurposeSummary = formatPurposeSelection(resistancePurposeIds);
        context.resistancePurposeLabels = getPurposeLabels(resistancePurposeIds);
        const barrierMode = context.system.resistanceRoll?.mode === "conditional" ? "conditional" : "simple";
        context.isConditionalResistance = barrierMode === "conditional";
        const actionLabels = new Map(context.effectActions.map(action => [action.id, action.label || format("GUM.EffectSheet.Action.Numbered", { number: action.displayIndex })]));
        context.resistanceBranches = normalizeBarrierBranches(context.system.resistanceRoll?.branches).map((branch, index) => ({
            ...branch, index, displayIndex: index + 1, isOtherwise: branch.condition.type === "otherwise",
            isSuccess: branch.condition.outcome === "success",
            isFailure: branch.condition.outcome === "failure",
            isCriticalSuccess: branch.condition.outcome === "critical-success",
            isCriticalFailure: branch.condition.outcome === "critical-failure",
            actionIdsCsv: branch.actionIds.join(","),
            maximumMargin: branch.condition.maximumMargin ?? "",
            actionSummary: branch.actionIds.map(id => actionLabels.get(id) || format("GUM.EffectSheet.Action.Removed", { id })).join(", ") || localize("GUM.EffectSheet.Action.NoneSelected")
        }));

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
    html.on("click", ".copy-effect-automation-uuid", async event => {
        event.preventDefault();
        const uuid = String(event.currentTarget.dataset.uuid || "").trim();
        if (!uuid) return;
        try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
            await navigator.clipboard.writeText(uuid);
            ui.notifications.info(game.i18n.localize("GUM.EffectSheet.AutomationUuidCopied"));
        } catch (error) {
            ui.notifications.warn(game.i18n.localize("GUM.EffectSheet.AutomationUuidCopyFailed"));
        }
    });
    const setSpecializedFieldAvailability = (root, fieldName, enabled) => {
        const visible = root.querySelector(`[name$=".${fieldName}"]:not([type="hidden"])`);
        if (visible) {
            visible.disabled = !enabled;
            visible.closest(".effect-premium-field")?.classList.toggle("is-disabled", !enabled);
        }
    };
    const refreshSpecializedFields = (actionRoot) => {
        if (!actionRoot) return;
        const skillScope = actionRoot.querySelector('[name$=".skill_scope"]')?.value;
        if (skillScope) {
            actionRoot.querySelectorAll("[data-ability-scope]").forEach(section => {
                const scopes = String(section.dataset.abilityScope || "").split(",").map(value => value.trim()).filter(Boolean);
                section.hidden = !scopes.includes(skillScope);
            });
            setSpecializedFieldAvailability(actionRoot, "skill_targets", skillScope === "specific");
            setSpecializedFieldAvailability(actionRoot, "skill_attribute", skillScope === "attribute");
            for (const field of ["ability_sources", "ability_groups", "ability_sheet_groups", "ability_schools", "ability_classes"]) {
                setSpecializedFieldAvailability(actionRoot, field, skillScope === "classification");
            }
        }
        const combatScope = actionRoot.querySelector('[name$=".combat_scope"]')?.value;
        if (combatScope) {
            setSpecializedFieldAvailability(actionRoot, "combat_source_item_ids", combatScope === "specific");
            setSpecializedFieldAvailability(actionRoot, "combat_source_attack_ids", combatScope === "specific");
        }
        const applicationSide = actionRoot.querySelector('[name$=".modifier_application_side"]')?.value;
        const displayMode = actionRoot.querySelector('[name$=".modifier_nh_display_mode"]');
        if (displayMode && applicationSide) {
            if (applicationSide === "vs_targeter") displayMode.value = "roll_only";
            displayMode.disabled = applicationSide === "vs_targeter";
            displayMode.closest(".effect-premium-field")?.classList.toggle("is-disabled", applicationSide === "vs_targeter");
        }
    };
    html.on("change", '[name$=".ability_kind"], [name$=".skill_scope"], [name$=".combat_scope"], [name$=".modifier_application_side"]', (event) => refreshSpecializedFields(event.currentTarget.closest(".effect-premium-action")));
    html.find(".effect-premium-action").each((_index, element) => refreshSpecializedFields(element));
    if (!this.isEditable) return; // Adicionando uma verificação de segurança

    html.on("input change", ".effect-status-search", event => {
        const searchInput = event.currentTarget;
        const hiddenInput = this.form?.querySelector(`[name="${searchInput.dataset.statusInput}"]`);
        if (!hiddenInput) return;
        const match = resolveStatusCatalogEntry(searchInput.value, CONFIG.statusEffects);
        const initialValue = searchInput.dataset.initialValue || "";
        const initialStatusId = searchInput.dataset.initialStatusId || "";
        hiddenInput.value = match?.id || (searchInput.value === initialValue ? initialStatusId : "");
        searchInput.setCustomValidity(searchInput.value && !hiddenInput.value
            ? game.i18n.localize("GUM.StatusAutomations.SearchInvalid")
            : "");
    });

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
        actions.push(normalizeAction({ id: foundry.utils.randomID() }));
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
        const [removed] = actions.splice(index, 1);
        const branches = normalizeBarrierBranches(this.item.system.resistanceRoll?.branches).map(branch => ({ ...branch, actionIds: branch.actionIds.filter(id => id !== removed.id) }));
        this._reindexExpandedActionsAfterRemoval(index);
        await this.item.update({
            "system.actions": actions,
            "system.resistanceRoll.branches": branches
        });
    });

    html.on("change", '[name="system.resistanceRoll.mode"]', async ev => {
        await this.item.update({ "system.resistanceRoll.mode": ev.currentTarget.value === "conditional" ? "conditional" : "simple" });
    });

    html.on("click", ".add-resistance-branch", async ev => {
        ev.preventDefault();
        const resistanceRoll = foundry.utils.deepClone(this.item.system.resistanceRoll || {});
        const branches = normalizeBarrierBranches(resistanceRoll.branches);
        branches.push({ id: foundry.utils.randomID(), label: format("GUM.EffectSheet.Outcome.Numbered", { number: branches.length + 1 }, `Resultado ${branches.length + 1}`), condition: { type: "outcome", outcome: "failure", minimumMargin: 0, maximumMargin: null }, actionIds: [] });
        await this.item.update({ "system.resistanceRoll.mode": "conditional", "system.resistanceRoll.branches": branches });
    });

    html.on("click", ".remove-resistance-branch", async ev => {
        ev.preventDefault();
        const index = Number(ev.currentTarget.dataset.index);
        const branches = normalizeBarrierBranches(this.item.system.resistanceRoll?.branches);
        if (!Number.isInteger(index) || index < 0 || index >= branches.length) return;
        branches.splice(index, 1);
        await this.item.update({ "system.resistanceRoll.branches": branches });
    });

    html.on("click", ".move-resistance-branch", async ev => {
        ev.preventDefault();
        const index = Number(ev.currentTarget.dataset.index);
        const direction = Number(ev.currentTarget.dataset.direction);
        const branches = normalizeBarrierBranches(this.item.system.resistanceRoll?.branches);
        const destination = index + direction;
        if (!Number.isInteger(index) || ![-1, 1].includes(direction) || destination < 0 || destination >= branches.length) return;
        [branches[index], branches[destination]] = [branches[destination], branches[index]];
        await this.item.update({ "system.resistanceRoll.branches": normalizeBarrierBranches(branches) });
    });

    html.on("click", ".select-resistance-actions", ev => {
        ev.preventDefault();
        const index = Number(ev.currentTarget.dataset.index);
        const input = this.form?.querySelector(`[name="system.resistanceRoll.branches.${index}.actionIds"]`);
        if (!input) return;
        const selected = new Set(String(input.value || "").split(",").map(value => value.trim()).filter(Boolean));
        const actions = getEffectActionsFromSystem(this.item.system);
        const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
        const options = actions.map((action, actionIndex) => {
            const label = action.label || format("GUM.EffectSheet.Action.Numbered", { number: actionIndex + 1 });
            return `<label class="gum-resistance-action-option" data-search="${escape(label)}"><input type="checkbox" value="${escape(action.id)}" ${selected.has(action.id) ? "checked" : ""}> <span>${escape(label)}</span></label>`;
        }).join("");
        new Dialog({
            title: localize("GUM.EffectSheet.ActionPicker.Title"),
            content: `<div class="gum-resistance-action-picker"><input type="search" placeholder="${escape(localize("GUM.EffectSheet.ActionPicker.SearchPlaceholder"))}" class="resistance-action-search"><div class="gum-resistance-action-options">${options || `<p>${escape(localize("GUM.EffectSheet.ActionPicker.Empty"))}</p>`}</div></div>`,
            buttons: { apply: { icon: '<i class="fas fa-check"></i>', label: localize("GUM.Common.Confirm"), callback: dialogHtml => {
                const ids = dialogHtml.find('input[type="checkbox"]:checked').map((_, element) => element.value).get();
                input.value = [...new Set(ids)].join(",");
                input.dispatchEvent(new Event("change", { bubbles: true }));
                const summary = ev.currentTarget.closest(".resistance-branch")?.querySelector(".resistance-action-summary");
                if (summary) summary.textContent = actions.filter(action => ids.includes(action.id)).map((action, i) => action.label || format("GUM.EffectSheet.Action.Numbered", { number: i + 1 })).join(", ") || localize("GUM.EffectSheet.Action.NoneSelected");
            } } },
            render: dialogHtml => dialogHtml.find(".resistance-action-search").on("input", event => {
                const query = event.currentTarget.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                dialogHtml.find(".gum-resistance-action-option").each((_, option) => { option.hidden = !option.dataset.search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query); });
            })
        }).render(true);
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
        openContextPicker({ input, options: ROLL_MODIFIER_CONTEXT_OPTIONS.map(option => ({ ...option, label: localize(`GUM.EffectSheet.Context.${option.key}`) })) });
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
                const purposeList = button.closest(".resistance-purpose-control")?.querySelector(".resistance-purpose-list");
                if (purposeList) {
                    const labels = getPurposeLabels(ids);
                    purposeList.replaceChildren(...labels.map(label => {
                        const item = document.createElement("span");
                        item.className = "resistance-purpose-item";
                        item.textContent = label;
                        return item;
                    }));
                    purposeList.classList.toggle("is-empty", labels.length === 0);
                    if (!labels.length) {
                        const empty = document.createElement("span");
                        empty.className = "resistance-purpose-empty";
                        empty.textContent = localize("GUM.EffectSheet.Purpose.NoneAdded");
                        purposeList.append(empty);
                    }
                }
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
            const description = isCustom ? localize("GUM.EffectSheet.RollTag.CustomDescription") : tag.description;
            const search = fold(`${tag.label} ${tag.id} ${description} ${aliasText(tag.id)} ${(tag.keywords || []).join(" ")}`);
            return `<div class="roll-tag-picker-option${tag.selected ? " is-selected" : ""}" data-search="${esc(search)}" tabindex="0">
              <input id="${checkboxId}" type="checkbox" name="roll-tag" value="${esc(tag.id)}" ${tag.selected ? "checked" : ""}>
              <label for="${checkboxId}"><strong>${esc(tag.label)}</strong><code>${esc(tag.id)}</code></label>
              <button type="button" class="roll-tag-picker-info" aria-label="${esc(format("GUM.RollPurpose.Picker.InformationAbout", { label: tag.label }))}" aria-expanded="false"><i class="fas fa-info-circle" aria-hidden="true"></i><span role="tooltip">${esc(description)}</span></button>
            </div>`;
        };
        const groups = getGroupedRollTags(selected).map(group => {
            const label = group.id === "tests" ? localize("GUM.EffectSheet.RollTag.BroadCategories") : group.label;
            const helpText = localize("GUM.EffectSheet.RollTag.BroadCategoriesHint");
            const help = group.id === "tests" ? `<span class="roll-tag-group-help" title="${esc(helpText)}" aria-label="${esc(helpText)}"><i class="fas fa-circle-info" aria-hidden="true"></i></span>` : "";
            const selectedCount = group.tags.filter(tag => tag.selected).length;
            return `<details class="roll-tag-picker-group" data-group="${esc(group.id)}" ${selectedCount ? "open" : ""}><summary><span>${esc(label)} ${help}</span><span class="roll-tag-group-count"><b>${selectedCount}</b>/${group.tags.length}</span></summary><div class="roll-tag-group-options">${group.tags.map(tag => optionMarkup(tag)).join("")}</div></details>`;
        }).join("");
        const customContent = custom.length ? `<details class="roll-tag-picker-group" data-group="custom" open><summary><span>${esc(localize("GUM.EffectSheet.RollTag.CustomLegacy"))}</span><span class="roll-tag-group-count"><b>${custom.length}</b>/${custom.length}</span></summary><div class="roll-tag-group-options">${custom.map(id => optionMarkup({ id, label: id, selected: true }, true)).join("")}</div></details>` : "";
        new Dialog({
            title: localize("GUM.EffectSheet.RollTag.Title"),
            content: `<div class="gum-roll-tag-picker">
              <div class="roll-tag-picker-searchbox"><i class="fas fa-search" aria-hidden="true"></i><input type="search" class="roll-tag-picker-search" placeholder="${esc(localize("GUM.EffectSheet.RollTag.SearchPlaceholder"))}" aria-label="${esc(localize("GUM.EffectSheet.RollTag.SearchLabel"))}"><button type="button" class="roll-tag-search-clear" aria-label="${esc(localize("GUM.Common.ClearSearch"))}"><i class="fas fa-times" aria-hidden="true"></i></button></div>
              <div class="roll-tag-picker-tools"><strong class="roll-tag-selected-summary"></strong><button type="button" class="roll-tag-clear-selection">${esc(localize("GUM.Common.Clear"))}</button><label><input type="checkbox" class="roll-tag-selected-only"> ${esc(localize("GUM.EffectSheet.RollTag.SelectedOnly"))}</label><span class="roll-tag-result-count" aria-live="polite"></span></div>
              <fieldset class="roll-tag-match"><legend>${esc(localize("GUM.EffectSheet.RollTag.Match"))}</legend><label title="${esc(localize("GUM.EffectSheet.RollTag.AnyHint"))}"><input type="radio" name="picker-roll-tag-match" value="any" ${initialMatch === "any" ? "checked" : ""}> ${esc(localize("GUM.EffectSheet.RollTag.Any"))}</label><label title="${esc(localize("GUM.EffectSheet.RollTag.AllHint"))}"><input type="radio" name="picker-roll-tag-match" value="all" ${initialMatch === "all" ? "checked" : ""}> ${esc(localize("GUM.EffectSheet.RollTag.All"))}</label></fieldset>
              <div class="roll-tag-picker-results">${customContent}${groups}<div class="roll-tag-picker-empty" hidden><strong>${esc(localize("GUM.EffectSheet.RollTag.Empty"))}</strong><span>${esc(localize("GUM.EffectSheet.RollTag.EmptyHint"))}</span></div></div>
            </div>`,
            render: dlgHtml => {
                const root = dlgHtml.find('.gum-roll-tag-picker');
                const windowElement = root.closest('.window-app').addClass('gum-roll-tag-picker-window');
                windowElement.find('.window-header .close').attr({ title: localize("GUM.Common.Close"), 'aria-label': localize("GUM.Common.Close") });
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
                    root.find('.roll-tag-selected-summary').text(format(count === 1 ? "GUM.EffectSheet.RollTag.SelectedCountOne" : "GUM.EffectSheet.RollTag.SelectedCountMany", { count }));
                    root.find('.roll-tag-result-count').text(format(visibleCount === 1 ? "GUM.Common.ResultCountOne" : "GUM.Common.ResultCountMany", { count: visibleCount }));
                    root.find('.roll-tag-picker-empty').prop('hidden', visibleCount !== 0);
                    const applyLabel = count ? format(count === 1 ? "GUM.EffectSheet.RollTag.ApplyCountOne" : "GUM.EffectSheet.RollTag.ApplyCountMany", { count }) : localize("GUM.Common.Apply");
                    windowElement.find('[data-button="ok"]').html(`<i class="fas fa-check"></i> ${esc(applyLabel)}`);
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
                ok: { icon: '<i class="fas fa-check"></i>', label: localize("GUM.Common.Apply"), callback: dlgHtml => {
                    input.value = normalizeRollTags(dlgHtml.find('input[name="roll-tag"]:checked').toArray().map(element => element.value)).join(', ');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    if (matchInput) {
                        matchInput.value = dlgHtml.find('input[name="picker-roll-tag-match"]:checked').val() === "all" ? "all" : "any";
                        matchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        matchInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }},
                cancel: { icon: '<i class="fas fa-times"></i>', label: localize("GUM.Common.Cancel") }
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
            composition_group: "",
            composition_mode: "sum",
            composition_priority: 0,
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

    html.on("click", ".add-combat-damage-change", async (ev) => {
        ev.preventDefault();
        const actionIndex = Number(ev.currentTarget.dataset.actionIndex);
        const actions = getEffectActionsFromSystem(this.item.system);
        if (Number.isNaN(actionIndex) || !actions[actionIndex]) return;
        const changes = foundry.utils.deepClone(actions[actionIndex].combat_damage_changes || []);
        changes.push({ component: "main", operation: "fixed", value: "0", value_mode: "fixed", cap: "", replace_armor_divisor: "", replace_type: "", replace_nature: "" });
        actions[actionIndex].combat_damage_changes = changes;
        await this.item.update({ "system.actions": actions });
    });

    html.on("click", ".remove-combat-damage-change", async (ev) => {
        ev.preventDefault();
        const actionIndex = Number(ev.currentTarget.dataset.actionIndex);
        const changeIndex = Number(ev.currentTarget.dataset.changeIndex);
        const actions = getEffectActionsFromSystem(this.item.system);
        if (Number.isNaN(actionIndex) || Number.isNaN(changeIndex) || !actions[actionIndex]) return;
        const changes = foundry.utils.deepClone(actions[actionIndex].combat_damage_changes || []);
        changes.splice(changeIndex, 1);
        actions[actionIndex].combat_damage_changes = changes.length ? changes : [{ component: "main", operation: "fixed", value: "0", value_mode: "fixed", cap: "", replace_armor_divisor: "", replace_type: "", replace_nature: "" }];
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
                composition_group: "",
                composition_mode: "sum",
                composition_priority: 0,
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
                    label: localize("GUM.EffectSheet.Save"),
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
        const damageChanges = new Map();
        const branchEntries = new Map();
        if (Object.hasOwn(formData, "system.resistanceRoll.requestedPurposeIds")) {
            formData["system.resistanceRoll.requestedPurposeIds"] = normalizePurposeIds(formData["system.resistanceRoll.requestedPurposeIds"]);
        }

        for (const [key, value] of Object.entries(formData)) {
            const actionMatch = key.match(/^system\.actions\.(\d+)\.([a-zA-Z0-9_]+)$/);
            const branchMatch = key.match(/^system\.resistanceRoll\.branches\.(\d+)\.(id|label|actionIds|condition\.(?:type|outcome|minimumMargin|maximumMargin))$/);
            if (branchMatch) {
                const branchIndex = Number(branchMatch[1]);
                if (!branchEntries.has(branchIndex)) branchEntries.set(branchIndex, {});
                branchEntries.get(branchIndex)[branchMatch[2]] = value;
                delete formData[key];
                continue;
            }
            const rollEntryMatch = key.match(/^system\.actions\.(\d+)\.roll_modifier_entries\.(\d+)\.(label|value|value_mode|cap|contexts|application_side|target_kind|target_mode|target_values|source_item_ids|source_attack_ids|composition_group|composition_mode|composition_priority|roll_tags|roll_tag_match|nh_display_mode)$/);
            const damageChangeMatch = key.match(/^system\.actions\.(\d+)\.combat_damage_changes\.(\d+)\.(component|operation|value|value_mode|cap|replace_armor_divisor|replace_type|replace_nature)$/);
            if (damageChangeMatch) {
                const actionIndex = Number(damageChangeMatch[1]);
                const changeIndex = Number(damageChangeMatch[2]);
                if (!damageChanges.has(actionIndex)) damageChanges.set(actionIndex, new Map());
                const changeMap = damageChanges.get(actionIndex);
                if (!changeMap.has(changeIndex)) changeMap.set(changeIndex, {});
                changeMap.get(changeIndex)[damageChangeMatch[3]] = value;
                delete formData[key];
                continue;
            }
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
                        composition_group: "",
                        composition_mode: "sum",
                        composition_priority: 0,
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

        if (branchEntries.size) {
            const previous = normalizeBarrierBranches(this.item.system.resistanceRoll?.branches);
            const branches = Array.from(branchEntries.entries()).sort((a, b) => a[0] - b[0]).map(([index, entry]) => {
                const fallback = previous[index] || {};
                return {
                    id: entry.id || fallback.id || foundry.utils.randomID(),
                    label: entry.label ?? fallback.label ?? `Resultado ${index + 1}`,
                    condition: {
                        type: entry["condition.type"] ?? fallback.condition?.type ?? "outcome",
                        outcome: entry["condition.outcome"] ?? fallback.condition?.outcome ?? "failure",
                        minimumMargin: entry["condition.minimumMargin"] ?? fallback.condition?.minimumMargin ?? 0,
                        maximumMargin: entry["condition.maximumMargin"] ?? fallback.condition?.maximumMargin ?? null
                    },
                    actionIds: String(entry.actionIds ?? fallback.actionIds?.join(",") ?? "").split(",").map(id => id.trim()).filter(Boolean)
                };
            });
            formData["system.resistanceRoll.branches"] = normalizeBarrierBranches(branches);
        }

        if (actionEntries.size || rollEntries.size || damageChanges.size) {
            const previousActions = getEffectActionsFromSystem(this.item.system);
            const allIndexes = [...new Set([...actionEntries.keys(), ...rollEntries.keys(), ...damageChanges.keys()])].sort((a, b) => a - b);
            const actions = allIndexes.map((index) => {
                const actionData = { ...(previousActions[index] || {}), ...(actionEntries.get(index) || {}) };
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
                            composition_group: (entry.composition_group || "").toString().trim(),
                            composition_mode: normalizeRollModifierCompositionMode(entry.composition_mode),
                            composition_priority: Number(entry.composition_priority) || 0,
                            roll_tags: (entry.roll_tags || "").toString().trim(),
                            roll_tag_match: entry.roll_tag_match === "all" ? "all" : "any",
                            nh_display_mode: (entry.roll_tags || "").toString().trim() || (entry.composition_group || "").toString().trim() ? "roll_only" : (entry.nh_display_mode || "roll_only").toString().trim() || "roll_only"
                        }));
                }
                const damageChangeMap = damageChanges.get(index);
                if (damageChangeMap) {
                    actionData.combat_damage_changes = Array.from(damageChangeMap.entries())
                        .sort((a, b) => a[0] - b[0])
                        .map(([, change]) => change);
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
            formData["system.attribute_chat_visibility"] = firstAction.attribute_chat_visibility;
            formData["system.key"] = firstAction.key;
            formData["system.flag_value"] = firstAction.flag_value;
            formData["system.chat_text"] = firstAction.chat_text;
            formData["system.has_roll"] = Boolean(firstAction.has_roll);
            formData["system.roll_label"] = firstAction.roll_label;
            formData["system.roll_attribute"] = firstAction.roll_attribute;
            formData["system.roll_modifier"] = firstAction.roll_modifier;
            formData["system.roll_modifier_label"] = firstAction.roll_modifier_label;
            formData["system.roll_skip_allowed"] = Boolean(firstAction.roll_skip_allowed);
            formData["system.roll_skip_label"] = firstAction.roll_skip_label;
            formData["system.roll_modifier_value"] = firstAction.roll_modifier_value;
            formData["system.roll_modifier_cap"] = firstAction.roll_modifier_cap;
            formData["system.roll_modifier_context"] = firstAction.roll_modifier_context;
            formData["system.roll_modifier_application_side"] = firstAction.roll_modifier_application_side;
            formData["system.roll_modifier_composition_group"] = firstAction.roll_modifier_composition_group;
            formData["system.roll_modifier_composition_mode"] = firstAction.roll_modifier_composition_mode;
            formData["system.roll_modifier_composition_priority"] = firstAction.roll_modifier_composition_priority;
            formData["system.roll_modifier_entries"] = firstAction.roll_modifier_entries;
            formData["system.requestedPurposeIds"] = firstAction.requestedPurposeIds;
            formData["system.roll_visibility"] = firstAction.roll_visibility;
            formData["system.damage_formula"] = firstAction.damage_formula;
            formData["system.damage_type"] = firstAction.damage_type;
            formData["system.damage_nature"] = firstAction.damage_nature;
            formData["system.damage_armor_divisor"] = firstAction.damage_armor_divisor;
            formData["system.damage_follow_up_formula"] = firstAction.damage_follow_up_formula;
            formData["system.damage_follow_up_type"] = firstAction.damage_follow_up_type;
            formData["system.damage_follow_up_nature"] = firstAction.damage_follow_up_nature;
            formData["system.damage_follow_up_armor_divisor"] = firstAction.damage_follow_up_armor_divisor;
            formData["system.damage_fragmentation_formula"] = firstAction.damage_fragmentation_formula;
            formData["system.damage_fragmentation_type"] = firstAction.damage_fragmentation_type;
            formData["system.damage_fragmentation_nature"] = firstAction.damage_fragmentation_nature;
            formData["system.damage_fragmentation_armor_divisor"] = firstAction.damage_fragmentation_armor_divisor;
            formData["system.damage_show_prompt"] = Boolean(firstAction.damage_show_prompt);
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
            return ui.notifications.warn(localize("GUM.EffectSheet.Reference.FillRef"));
        }

        const parsedList = this._parseReferenceCodes(rawRef);

        if (!parsedList.length) {
            return ui.notifications.warn(localize("GUM.EffectSheet.Reference.InvalidFormat"));
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
            return ui.notifications.warn(format("GUM.EffectSheet.Reference.PdfNotFound", { code: parsed.code }));
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
            return ui.notifications.warn(localize("GUM.EffectSheet.Reference.NoneFound"));
        }

        const missingHtml = missing.length
            ? `<p style="opacity:.8;margin-top:.5rem"><b>${localize("GUM.EffectSheet.Reference.NotFound")}:</b> ${missing.join(", ")}</p>`
            : "";

        new Dialog({
            title: localize("GUM.EffectSheet.Reference.Multiple"),
            content: `<p>${localize("GUM.EffectSheet.Reference.Choose")}</p>${missingHtml}`,
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

        ui.notifications.warn(localize("GUM.EffectSheet.Reference.PagePositionFailed"));
    }

}
