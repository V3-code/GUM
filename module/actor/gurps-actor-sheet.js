import { calculateItemTraitCost, calculateTraitCost } from "../utils/trait-cost.mjs";
import { applyCurrentRollPrivacy, applyEffectWithResistance, performGURPSRoll } from "/systems/gum/scripts/main.js";
import { matchesAbilityClassificationFilters, matchesAbilityRollContext, resolveAbilityRollContext } from "../utils/ability-roll-context.mjs";
import { GurpsRollPrompt } from "../apps/roll-prompt.js";
import { GurpsDamageRollPrompt } from "../apps/damage-roll-prompt.js";
import { normalizeGurpsDamageExpression } from "../utils/damage-normalization.js";
import { getBodyLocationDefinition, getBodyProfile, getBodyProfileLocationKeys, listBodyLocations, listBodyProfiles, localizeBodyGroupLabel, localizeBodyLocationLabel, localizeBodyProfileLabel } from "../config/body-profiles.js";
import { TemplateBrowser } from "../apps/template-browser.js";
import { templateEntryDisplayName } from "../utils/template-entry-display.mjs";
import { GumPreviewDialog } from "../apps/preview-dialog.js";
import { showTemplateEntryPreview } from "../apps/template-entry-preview.js";
import { buildSkillModifierIndicators } from "../utils/skill-modifier-indicators.mjs";
import { resolveCharacterImage } from "../utils/character-image.mjs";
import { buildSecondaryStatsRecalculationPlan, buildSecondaryStatsUpdateData, formatBasicDamageDiceCount } from "../utils/secondary-stats-recalculation.mjs";
import { SOCIAL_CATEGORIES, SOCIAL_MANUAL_LAYOUTS, buildSocialSections, calculateManualSocialPoints } from "../config/social-aspects.mjs";
import { buildDamageNatureSearchOptions, formatDamageNature, resolveDamageNature } from "../utils/damage-nature.mjs";
import { resolveAttackDamageDisplay } from "../utils/attack-damage-display.mjs";
import { canUserImportIntoActor } from "../utils/actor-creation-permission.mjs";
import { contentSourceService } from "../services/content-source-service.mjs";
import { attachSheetItemOrganizer } from "../services/sheet-item-organizer.mjs";
import { buildEquipmentSortUpdates, resolveEquipmentDrop } from "../utils/equipment-drop.mjs";
import { buildEquipmentConsumptionUpdate, equipmentIntegrityCurrentUpdate, equipmentIntegrityRecord, equipmentLinkedReserve, equipmentReserveBalanceUpdate, resolveEquipment } from "../utils/equipment-resolution.mjs";
import { UNGROUPED_ORGANIZER_ID, addItemOrganizationGroup, buildItemCategoryGroupPlan, createGroupsFromItemCategories, moveOrganizedItem, normalizeItemOrganization, removeItemOrganizationGroup, renameItemOrganizationGroup } from "../utils/item-organization.mjs";
import { normalizeRequestedAttributeKey } from "../utils/requested-attributes.mjs";
import { resolveStoredEffectStackingDomain } from "../utils/effect-stacking.mjs";
import { calculateLiftingCapacities, resolveThrowingDistance } from "../utils/physical-feats.mjs";
import { buildEffectiveBodyLocations, describeBodyLocationSources } from "../utils/damage-resistance-locations.mjs";
import { buildActorEffectTargets } from "../utils/condition-actor-context.mjs";
import { ammunitionUseState, normalizeAmmunitionLoadout, validateAmmunitionLoadout } from "../utils/ammunition.mjs";
import { configureAmmunitionLoadout, prepareAmmunitionRollData, toggleAmmunitionLoadoutLock } from "../apps/ammunition-preparation.mjs";

const WOUND_NATURE_ICONS = Object.freeze({
  fire: "fa-fire",
  cold: "fa-snowflake",
  electricity: "fa-bolt",
  acid: "fa-flask",
  poison: "fa-skull-crossbones",
  psychic: "fa-brain",
  necrotic: "fa-skull",
  radiant: "fa-sun",
  sonic: "fa-volume-high",
  "magical-force": "fa-wand-magic-sparkles",
  cosmic: "fa-meteor",
  radiation: "fa-radiation",
  water: "fa-droplet",
  air: "fa-wind",
  earth: "fa-mountain",
  "direct-trauma": "fa-hand-fist"
});

function prepareWoundForDisplay(id, wound = {}) {
  const localize = key => globalThis.game?.i18n?.localize?.(key) ?? key;
  const format = (key, data) => globalThis.game?.i18n?.format?.(key, data) ?? localize(key);
  const nature = typeof wound.nature === "object" && wound.nature?.id
    ? wound.nature
    : resolveDamageNature(wound.nature);
  const natureLabel = nature?.label || localize("GUM.Combat.Wounds.NatureUnknown");
  const natureAbbreviation = nature?.abbreviation || "";
  const originDisplay = String(wound.origin || wound.attacker || "").trim();
  const locationDisplay = String(wound.location || "").trim();
  const natureDisplay = formatDamageNature(nature);
  const tooltipLines = [
    wound.title,
    format("GUM.Combat.Wounds.NatureLine", { value: natureDisplay || natureLabel }),
    wound.poolLabel ? format("GUM.Combat.Wounds.TargetLine", { value: wound.poolLabel }) : "",
    originDisplay ? format("GUM.Combat.Wounds.OriginLine", { value: originDisplay }) : "",
    locationDisplay ? format("GUM.Combat.Wounds.LocationLine", { value: locationDisplay }) : "",
    wound.notes ? format("GUM.Combat.Wounds.NotesLine", { value: wound.notes }) : ""
  ].map(value => String(value || "").trim()).filter(Boolean);

  return {
    id,
    ...wound,
    remaining: Math.max(0, Number(wound.remaining ?? wound.value ?? 0) || 0),
    natureDisplay,
    natureIcon: WOUND_NATURE_ICONS[nature?.id] || "fa-bandage",
    natureTooltip: nature
      ? format("GUM.Combat.Wounds.NatureLine", { value: `${natureLabel}${natureAbbreviation ? ` [${natureAbbreviation}]` : ""}` })
      : natureLabel,
    originDisplay,
    locationDisplay,
    woundTooltip: tooltipLines.join("\n")
  };
}

const { ActorSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;




// ================================================================== //
//  4. CLASSE DA FICHA DO ATOR (GurpsActorSheet) - EDITOR ATUALIZADO
// ================================================================== //

    export class GurpsActorSheet extends ActorSheet {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          classes: ["gum", "sheet", "actor", "character"],
          template: "systems/gum/templates/actors/characters.hbs",
          width: 960,
          height: 820,
          tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat" }]
        });
      }

_getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (canUserImportIntoActor(game.user, this.actor)) {
        buttons.unshift({
            label: "Importar GCS",
            class: "gcs-import-sheet",
            icon: "fas fa-file-import",
            onclick: () => game.gum.importFromGCS({ actor: this.actor })
        });
    }
    return buttons;
}

_getContainerDescendants(containerId, acc = []) {
    if (!containerId) return acc;
    const direct = this.actor.items.filter(i => (i.system?.parent_container_id || "") === containerId);
    for (const child of direct) {
        acc.push(child);
        if (child.system?.is_container) this._getContainerDescendants(child.id, acc);
    }
    return acc;
}

async getData(options) {
        const context = await super.getData(options);
        this._expandedSpellCards ??= new Set();
        this._expandedPowerCards ??= new Set();
        this._expandedSocialCards ??= new Set();
        this._combatActionView ??= "actions";
        this._combatAttackFilters ??= new Set();
        this._combatControlFilters ??= new Set();
        context.combatActionView = this._combatActionView;
        context.combatAttackFilterAll = this._combatAttackFilters.size === 0;
        context.combatControlFilterAll = this._combatControlFilters.size === 0;
        context.combatWoundsFilterActive = this._combatControlFilters.has("wounds");
        context.combatMetersFilterActive = this._combatControlFilters.has("meters");
        context.combatWoundsVisible = this._combatControlFilters.size === 0 || this._combatControlFilters.has("wounds");
        context.combatMetersVisible = this._combatControlFilters.size === 0 || this._combatControlFilters.has("meters");
        const encumbranceLevel = Math.min(4, Math.max(0, Number(this.actor.system.encumbrance?.level_value) || 0));
        context.encumbranceLevelLabel = game.i18n.localize(`GUM.Character.Sidebar.EncumbranceLevels.${encumbranceLevel}`);
        const encumbrance = this.actor.system.encumbrance || {};
        const formatWeight = value => Number(value || 0).toLocaleString(game.i18n.lang, { maximumFractionDigits: 2 });
        context.encumbranceDisplay = {
            ariaLabel: game.i18n.format("GUM.Inventory.Encumbrance.CurrentLoadAria", {
                current: formatWeight(encumbrance.total_weight),
                maximum: formatWeight(encumbrance.max_capacity)
            }),
            levelLabel: context.encumbranceLevelLabel,
            levels: (encumbrance.level_data || []).map((level, index) => ({
                ...level,
                active: index === encumbranceLevel,
                label: game.i18n.localize(`GUM.Inventory.Encumbrance.Levels.${index}`),
                short: game.i18n.localize(`GUM.Inventory.Encumbrance.Abbreviations.${index}`)
            })),
            segments: (encumbrance.segment_labels || []).map((segment, index) => ({
                ...segment,
                label: game.i18n.localize(`GUM.Inventory.Encumbrance.Levels.${index}`),
                short: game.i18n.localize(`GUM.Inventory.Encumbrance.Abbreviations.${index}`)
            }))
        };

        const profileId = this.actor.system.combat?.body_profile || "humanoid";
        const profile = getBodyProfile(profileId);
        const effectiveBodyLocations = buildEffectiveBodyLocations({
            profile,
            additionalLocations: this.actor.system.combat?.additional_locations,
            equipment: Array.from(this.actor.items)
        });

        context.bodyProfileId = profileId;
        context.bodyProfileLabel = localizeBodyProfileLabel(profile, key => game.i18n.localize(key));
        context.bodyProfiles = listBodyProfiles().map(bodyProfile => ({
            ...bodyProfile,
            label: localizeBodyProfileLabel(bodyProfile, key => game.i18n.localize(key))
        }));
        context.hitLocations = effectiveBodyLocations.definitions;
        context.hitLocationOrder = effectiveBodyLocations.order;
        context.drDisplayRows = this._buildDrDisplayRows(profile, this.actor.system.combat?.dr_locations || {}, effectiveBodyLocations);



        // Agrupa todos os itens por tipo
        const itemsByType = context.actor.items.reduce((acc, item) => {
          const type = item.type;
          if (!acc[type]) acc[type] = [];
          acc[type].push(item);
          return acc;
        }, {});
             context.itemsByType = itemsByType;
        context.socialSections = buildSocialSections(this.actor.system, Array.from(this.actor.items), key => game.i18n.localize(key)).map(section => ({
          ...section,
          entries: section.entries.map(entry => {
            const cardKey = `${section.type}:${entry.source}:${entry.itemId || "manual"}:${entry.id}`;
            return { ...entry, cardKey, expanded: this._expandedSocialCards.has(cardKey) };
          })
        }));
// ---------------------------------------------------------
        // PREPARAÇÃO DA ABA DE MODIFICADORES (AGRUPAMENTO LIVRE POR NOME)
        // ---------------------------------------------------------
        const myMods = itemsByType.gm_modifier || [];
        const groupsMap = new Map();

        const getGroup = (groupName) => {
            const normalized = (groupName || "").toString().trim() || "Geral";
            const key = normalized.slugify({ strict: true }) || "geral";
            if (!groupsMap.has(key)) {
                groupsMap.set(key, { key, label: normalized, items: [] });
            }
            return groupsMap.get(key);
        };

        myMods.forEach((mod) => {
            const groupName = mod.system.group || "Geral";
            const rawValue = String(mod.system?.modifier ?? "").trim() || "0";
            const modifierIsNumeric = /^[+-]?\d+(?:\.\d+)?$/.test(rawValue);
            const numericValue = modifierIsNumeric ? Number(rawValue) : null;
            getGroup(groupName).items.push({
                ...mod.toObject(),
                id: mod.id,
                uuid: mod.uuid,
                modifierDisplay: modifierIsNumeric ? `${numericValue > 0 ? "+" : ""}${numericValue}` : rawValue,
                modifierCompactDisplay: modifierIsNumeric ? `${numericValue > 0 ? "+" : ""}${numericValue}` : "ƒ",
                modifierIsNegative: modifierIsNumeric && numericValue < 0,
                modifierIsExpression: !modifierIsNumeric
            });
        });

        context.modifierGroups = Array.from(groupsMap.values())
            .map((group) => {
                group.items.sort((a, b) => a.name.localeCompare(b.name));
                return group;
            })
            .sort((a, b) => a.label.localeCompare(b.label));

       // ================================================================== //
        // ✅ LÓGICA "CASTELO SÓLIDO" ATUALIZADA PARA A ABA DE CONDIÇÕES (INÍCIO)
        // ================================================================== //
        
        // 1. Prepara listas para Efeitos Ativos (divididos por Duração)
        const temporaryEffects = [];
        const permanentEffects = [];

        // Processa todos os ActiveEffects no ator
        const activeEffects = Array.from(this.actor.effects ?? []);
        const stackingKey = (effect) => {
            const flags = effect?.flags?.gum || {};
            if (!flags.effectUuid) return null;
            const actionIdentity = flags.actionId != null ? `id:${flags.actionId}` : `index:${Number(flags.actionIndex ?? 0)}`;
            return `${resolveStoredEffectStackingDomain(flags)}\u0000${flags.effectUuid}\u0000${actionIdentity}`;
        };
        const stackingCounts = activeEffects.reduce((counts, effect) => {
            const key = stackingKey(effect);
            if (key) counts.set(key, (counts.get(key) || 0) + 1);
            return counts;
        }, new Map());
        const activeEffectsPromises = activeEffects.map(async (effect) => {
            try {
                const effectData = effect.toObject(); 
                effectData.id = effect.id; 
                effectData.disabled = effect.disabled;
                effectData.pendingCombat = effectData.flags?.gum?.duration?.pendingCombat === true; 

                // --- Lógica de Identificação da Fonte (seu código original) ---
                let fonteNome = "Origem Desconhecida";
                let fonteIcon = "fas fa-question-circle";
                let fonteUuid = null;
                let fonteTipo = "unknown";
                
                let originalEffectItem = null;
                const effectUuid = foundry.utils.getProperty(effect, "flags.gum.effectUuid");
                if (effectUuid) {
                    originalEffectItem = await fromUuid(effectUuid).catch(() => null);
                    if (originalEffectItem) {
                        effectData.name = effectData.name || originalEffectItem.name;
                        effectData.img = effectData.img || originalEffectItem.img;
                    }
                }
                effectData.effectItemUuid = originalEffectItem?.uuid || effectUuid || null;
                effectData.stackCount = stackingCounts.get(stackingKey(effect)) || 1;
                effectData.hasStackCount = effectData.stackCount > 1;

                const appliedStatuses = Array.isArray(effectData.statuses) ? effectData.statuses : [];
                const mainStatusId = appliedStatuses.find((statusId) => CONFIG.statusEffects.some(status => status.id === statusId));
                if (mainStatusId) {
                    const statusEffect = CONFIG.statusEffects.find(status => status.id === mainStatusId);
                    effectData.appliedStatusLabel = statusEffect?.name || mainStatusId;
                }
                
                if (effect.origin) {
                    const originItem = await fromUuid(effect.origin).catch(() => null);
                    if (originItem) {
                        fonteNome = originItem.name;
                        fonteUuid = originItem.uuid;
                        fonteTipo = originItem.type;

                        switch (originItem.type) {
                            case 'spell': fonteIcon = 'fas fa-magic'; break;
                            case 'power': fonteIcon = 'fas fa-bolt'; break;
                            case 'advantage':
                            case 'disadvantage': fonteIcon = 'fas fa-star'; break;
                            case 'equipment':
                                                        default: fonteIcon = 'fas fa-archive';
 }
                    }
                }
                if (fonteTipo === "unknown" && effectData.appliedStatusLabel) {
                    fonteTipo = "status";
                    fonteNome = effectData.appliedStatusLabel;
                    fonteIcon = "fas fa-heartbeat";
                }
                const fonteRotulos = {
                    advantage: game.i18n.localize("GUM.Conditions.Source.Advantage"),
                    disadvantage: game.i18n.localize("GUM.Conditions.Source.Disadvantage"),
                    spell: game.i18n.localize("GUM.Conditions.Source.Spell"),
                    power: game.i18n.localize("GUM.Conditions.Source.Power"),
                    equipment: game.i18n.localize("GUM.Conditions.Source.EquipmentSingle"),
                    condition: game.i18n.localize("GUM.Conditions.Source.Condition"),
                    status: game.i18n.localize("GUM.Conditions.Source.Status")
                };
                effectData.fonteNome = fonteNome;
                effectData.fonteIcon = fonteIcon;
                effectData.fonteUuid = fonteUuid;
                effectData.fonteTipo = fonteTipo;
                effectData.fonteRotulo = fonteRotulos[fonteTipo] || game.i18n.localize("GUM.Conditions.Source.Unknown");

                // --- Lógica de Duração ---
                const d = effect.duration || {};
                const gumDuration = effectData.flags?.gum?.duration || {};
                const originalDuration = originalEffectItem?.system?.duration || gumDuration || {};
                const isMarkedPermanent = originalDuration.isPermanent === true;
                const countsInCombatOnly = originalDuration.inCombat === true;
                let isPermanent = true; // Assume permanente até que se prove o contrário

                if (effectData.pendingCombat && countsInCombatOnly) {
                    effectData.durationString = game.i18n.localize("GUM.Conditions.Duration.PendingCombat");
                    isPermanent = false;
                }
                else if (gumDuration.pendingStart && countsInCombatOnly) {
                    effectData.durationString = game.i18n.localize("GUM.Conditions.Duration.NextTurn");
                    isPermanent = false;
                }
                else if (!isMarkedPermanent && d.seconds) {
                    effectData.durationString = game.i18n.format("GUM.Conditions.Duration.Seconds", { count: d.seconds });
                    isPermanent = false;
                } 
                else if (!isMarkedPermanent && d.rounds) {
                    // Calcula rodadas restantes
                    const remaining = d.startRound ? (d.startRound + d.rounds - (game.combat?.round || 0)) : d.rounds;
                    effectData.durationString = game.i18n.format("GUM.Conditions.Duration.Rounds", { count: remaining });
                    isPermanent = false;
                } 
                else if (!isMarkedPermanent && d.turns) {
                    // Calcula turnos restantes
                    const remaining = d.startTurn ? (d.startTurn + d.turns - (game.combat?.turn || 0)) : d.turns;
                    effectData.durationString = game.i18n.format("GUM.Conditions.Duration.Turns", { count: remaining });
                    isPermanent = false;
                } 
                else if (!isMarkedPermanent && countsInCombatOnly) {
                    // Efeitos marcados como "apenas em combate" devem ser tratados como temporários,
                    // mesmo que ainda não tenham campos de duração preenchidos pelo Foundry.
                    const fallbackValue = parseInt(originalDuration.value ?? gumDuration.value) || 1;
                    const unitKey = originalDuration.unit === "seconds"
                        ? "GUM.Conditions.Duration.Seconds"
                        : originalDuration.unit === "turns"
                            ? "GUM.Conditions.Duration.Turns"
                            : "GUM.Conditions.Duration.Rounds";
                    const elapsedTargetTurns = Math.max(0, Number(gumDuration.elapsedTargetTurns) || 0);
                    const endMode = originalDuration.endMode || gumDuration.endMode || "turnEnd";

                    let remaining = fallbackValue;
                    if (game.combat) {
                        if (endMode === "turnStart") {
                            remaining = Math.max(fallbackValue - elapsedTargetTurns, 0);
                        } else {
                            // Em "turnEnd", o turno corrente ainda conta até o seu fim.
                            const consumedTurns = Math.max(elapsedTargetTurns - 1, 0);
                            remaining = Math.max(fallbackValue - consumedTurns, 0);
                        }
                    }

                    effectData.durationString = game.i18n.format(unitKey, { count: remaining });
                    isPermanent = false;
                }
                else {
                    effectData.durationString = game.i18n.localize("GUM.Conditions.Duration.Permanent");
                    isPermanent = true;
                }

                // Adiciona o efeito processado à lista correta
                if (isPermanent) {
                    permanentEffects.push(effectData);
                } else {
                    temporaryEffects.push(effectData);
                }
            } catch (error) {
                console.warn("GUM | Falha ao processar efeito ativo:", error);
            }
        });
        
        // Espera todas as promessas de processamento de efeitos terminarem
 await Promise.allSettled(activeEffectsPromises);

        const effectOriginGroups = [
            { key: "traits", label: game.i18n.localize("GUM.Conditions.Source.Advantages"), icon: "fas fa-star", types: ["advantage", "disadvantage"] },
            { key: "powers", label: game.i18n.localize("GUM.Conditions.Source.Powers"), icon: "fas fa-bolt", types: ["power"] },
            { key: "spells", label: game.i18n.localize("GUM.Conditions.Source.Spells"), icon: "fas fa-magic", types: ["spell"] },
            { key: "equipment", label: game.i18n.localize("GUM.Conditions.Source.Equipment"), icon: "fas fa-archive", types: ["equipment"] },
            { key: "conditions", label: game.i18n.localize("GUM.Conditions.Source.Conditions"), icon: "fas fa-heartbeat", types: ["condition", "status"] },
            { key: "other", label: game.i18n.localize("GUM.Conditions.Source.Other"), icon: "fas fa-question-circle", types: [] }
        ];

        const groupEffectsByOrigin = (effects) => {
            const sortedEffects = [...effects].sort((a, b) =>
                (a.name || "").localeCompare((b.name || ""), "pt-BR", { sensitivity: "base" })
            );

            return effectOriginGroups
                .map((group) => ({
                    ...group,
                    effects: sortedEffects.filter((effect) => {
                        const sourceType = effect.fonteTipo === "unknown" && effect.appliedStatusLabel
                            ? "status"
                            : effect.fonteTipo;
                        const belongsToKnownGroup = effectOriginGroups
                            .slice(0, -1)
                            .some((candidate) => candidate.types.includes(sourceType));

                        return group.key === "other"
                            ? !belongsToKnownGroup
                            : group.types.includes(sourceType);
                    })
                }))
                .filter((group) => group.effects.length > 0);
        };

        // Salva as listas separadas no contexto para o .hbs usar
        context.temporaryEffects = temporaryEffects;
        context.permanentEffects = permanentEffects;
        context.temporaryEffectGroups = groupEffectsByOrigin(temporaryEffects);
        context.permanentEffectGroups = groupEffectsByOrigin(permanentEffects);

        // --- 2. Prepara a lista para "Condições Passivas" (Regras de Cenário) ---
        // Esta parte do seu código original já estava perfeita.
         context.installedConditions = this.actor.items
            .filter(item => item.type === "condition")
            .sort((a, b) => (a.name || "").localeCompare((b.name || ""), "pt-BR", { sensitivity: "base" }));
        
        // --- FIM DA NOVA LÓGICA DE CONDIÇÕES ---
        
        // ================================================================== //
        //    FUNÇÃO AUXILIAR DE ORDENAÇÃO (Seu código original)
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
        //    AGRUPAMENTO DE PERÍCIAS (MODO HÍBRIDO: GRUPO OU ÁRVORE)         //
        // ================================================================== //
        
        // 1. Pegar o modo atual (padrão é 'group')
        // Se a flag não existir, assume 'group' para manter compatibilidade
        const skillsViewMode = this.actor.getFlag('gum', 'skillsViewMode') || 'group';
        context.skillsViewMode = skillsViewMode; // Passa para o HTML saber qual ícone mostrar

        // 2. Separar apenas os itens do tipo 'skill'
        let skills = itemsByType.skill || [];
        context.hasSkills = skills.length > 0;
                const actorActiveEffects = Array.from(this.actor?.appliedEffects ?? this.actor?.effects ?? []).map((effect) => ({
            name: effect.name,
            rollModifier: foundry.utils.getProperty(effect, "flags.gum.rollModifier")
        }));

          const normalizeFilterTokens = (rawValue) => String(rawValue ?? "")
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean);

        const matchesEntryTargetForItem = (entry = {}, item = null) => {
            if (!matchesAbilityClassificationFilters(entry, item)) return false;
            const sourceItemFilters = normalizeFilterTokens(entry?.source_item_ids);
            if (sourceItemFilters.length) {
                if (!item) return false;
                const sourceCandidates = [item.id, item.uuid, item.name]
                    .map((value) => String(value ?? "").trim().toLowerCase())
                    .filter(Boolean);
                if (!sourceItemFilters.some((filter) => sourceCandidates.includes(filter))) return false;
            }

            const targets = normalizeFilterTokens(entry?.target_values);
            if (!targets.length) return true;
            const itemName = (item?.name || "").trim().toLowerCase();
            if (!itemName) return false;
            return targets.includes(itemName);
        };

        const matchesEntryContextForItem = (entry = {}, item) => {
            const context = (entry?.contexts ?? entry?.context ?? "all").toString().trim();
            if (!context || context === "all") return true;
            const contexts = context.includes(",") ? context.split(",").map(c => c.trim()) : [context];
            const abilityContext = resolveAbilityRollContext(item?.type, { item });
            return contexts.some(ctx => abilityContext && matchesAbilityRollContext(ctx, abilityContext));
        };

         skills.forEach((skill) => {
            skill.modifierIndicators = buildSkillModifierIndicators({
                effects: actorActiveEffects,
                skill,
                passive: skill.system?.nh_passive,
                temporary: skill.system?.nh_temp,
                matchesTarget: matchesEntryTargetForItem,
                matchesContext: matchesEntryContextForItem
            });

            const useTreeFields = skillsViewMode === 'tree';
            const treeHierarchyType = skill.system?.tree_hierarchy_type ?? skill.system?.hierarchy_type ?? "normal";
            const treePointsDefaults = { trunk: 7, branch: 3, twig: 2, leaf: 1 };
            const savedTreePointsPerLevel = skill.system?.tree_points_per_level;
            const treePointsPerLevel = savedTreePointsPerLevel !== undefined && savedTreePointsPerLevel !== "" ? savedTreePointsPerLevel : treePointsDefaults[treeHierarchyType] ?? "";
            skill.skillListDisplay = {
                baseAttribute: useTreeFields ? (skill.system?.tree_base_attribute || skill.system?.base_attribute) : skill.system?.base_attribute,
                difficulty: useTreeFields ? (treePointsPerLevel !== "" ? `${treePointsPerLevel}/${game.i18n.localize("GUM.Skills.LevelAbbreviation")}` : "") : skill.system?.difficulty,
                skillLevel: useTreeFields ? (skill.system?.tree_skill_level ?? skill.system?.skill_level ?? 0) : (skill.system?.skill_level ?? 0),
                points: useTreeFields ? (skill.system?.tree_points ?? skill.system?.points ?? 0) : (skill.system?.points ?? 0),
                nhMod: useTreeFields ? (skill.system?.tree_nh_mod ?? 0) : (skill.system?.nh_mod ?? 0),
                treeDefaultMod: useTreeFields ? (Number(skill.system?.tree_default_mod) || 0) : 0
            };
        });

        // Objeto final que vai para o HTML
        let skillsByGroup = {};

        if (skillsViewMode === 'group') {
            // -------------------------------------------------------
            // MODO 1: ORGANIZAÇÃO HÍBRIDA (livres + grupos manuais)
            // -------------------------------------------------------
            skills.forEach(skill => {
                skill.indentClass = "";
                skill.isTrunk = false;
                delete skill.tree_final_nh;
            });

            const organization = normalizeItemOrganization(this.actor.system.skill_organization, skills.map(skill => skill.id));
            const skillsById = new Map(skills.map(skill => [skill.id, skill]));
            const skillSortPref = this.actor.system.sorting?.skill || 'manual';
            const sortFn = getSortFunction(skillSortPref);
            const orderedSkills = bucketId => {
                const entries = (organization.itemOrder[bucketId] || []).map(id => skillsById.get(id)).filter(Boolean);
                entries.forEach(skill => { skill.skillOrganizationCanRemove = bucketId !== UNGROUPED_ORGANIZER_ID; });
                return skillSortPref === 'manual' ? entries : entries.sort(sortFn);
            };

            context.skillOrganization = organization;
            context.skillSections = [{
                id: UNGROUPED_ORGANIZER_ID,
                name: game.i18n.localize("GUM.Skills.DefaultGroup"),
                isUngrouped: true,
                skills: orderedSkills(UNGROUPED_ORGANIZER_ID)
            }, ...organization.groupOrder.map(groupId => ({
                id: groupId,
                name: organization.groups[groupId].name,
                isUngrouped: false,
                skills: orderedSkills(groupId)
            }))];
            context.hasSkillCategorySuggestions = skills.some(skill => {
                const category = String(skill.system?.group ?? "").trim().toLocaleLowerCase();
                return category && category !== "geral";
            });

       } else {
            // -------------------------------------------------------
            // MODO 2: ÁRVORE HIERÁRQUICA (Power-Ups 10) - COM RASTREIO DE CAMINHO
            // -------------------------------------------------------
            
            const normalize = (str) => str ? str.toLowerCase().trim() : "";
            const getTreeHierarchyType = (skill) => skill.system?.tree_hierarchy_type ?? skill.system?.hierarchy_type ?? "normal";
            const getTreeParentName = (skill) => {
                const system = skill.system || {};
                if (system.tree_parent) return system.tree_parent;
                const hierarchyType = getTreeHierarchyType(skill);
                if (hierarchyType === "branch") return system.root_parent;
                if (hierarchyType === "twig") return system.branch_parent;
                if (hierarchyType === "leaf") return system.twig_parent ?? system.parent_skill;
                return system.parent_skill;
            };
            const getTreeOwnFinalNh = (skill) => {
                const treeFinalNh = Number(skill.system?.tree_final_nh);
                if (Number.isFinite(treeFinalNh)) return treeFinalNh;
                const baseFinalNh = Number(skill.system?.final_nh);
                const legacyTreeMod = Number(skill.system?.tree_default_mod) || 0;
                return Number.isFinite(baseFinalNh) ? baseFinalNh + legacyTreeMod : skill.system?.final_nh;
            };
            const trunks = skills.filter(s => getTreeHierarchyType(s) === 'trunk');

            // =========================================================
            // FUNÇÃO RECURSIVA APRIMORADA (Soma + Histórico)
            // =========================================================
            // parentName: Nome do pai
            // depth: Profundidade visual
            // inheritedLevel: Soma matemática acumulada
            // pathTrace: Array com o histórico [{name: "Espada", val: 2, type: "trunk"}, ...]
            const getTreeCascadeContribution = (skill) => {
                // No Skill Trees, apenas os níveis comprados dos ancestrais são herdados.
                // Modificadores próprios (incluindo o pré-definido Atributo -5) afetam somente o nó em si.
                return Number(skill.system?.tree_skill_level ?? skill.system?.skill_level) || 0;
            };

            const processChildren = (parentName, depth, inheritedLevel = 0, pathTrace = [], ancestorIds = new Set()) => {
                let childrenList = [];
                
                // Filtra quem é filho deste pai
                let directChildren = skills.filter(s => {
                    const p = s.system;
                    const pName = normalize(parentName);
                    return normalize(getTreeParentName(s)) === pName ||
                           normalize(p.root_parent) === pName ||
                           normalize(p.branch_parent) === pName ||
                           normalize(p.twig_parent) === pName ||
                           normalize(p.parent_skill) === pName;
                });

                // Evita ciclos (ex.: perícia apontando para si mesma ou loop entre pais/filhos)
                directChildren = directChildren.filter(s => !ancestorIds.has(s.id));

                directChildren.sort((a, b) => a.name.localeCompare(b.name));

                directChildren.forEach(child => {
                    // 1. Configuração Visual
                    child.indentClass = `indent-${depth}`;
                    child.isTrunk = false;
                    
                    // 2. Salva o histórico para o HTML desenhar as "pílulas"
                    child.inheritancePath = pathTrace; 

                    // 3. Cálculo Matemático (Soma ao NH Final para rolagem)
                    // IMPORTANTE: não mutar `system.final_nh` aqui.
                    // Esse valor base é recalculado pelo fluxo padrão e pode
                    // ser reutilizado em múltiplos renders. Mutá-lo neste ponto
                    // gera acúmulo visual (ex.: +1 virando +2 no primeiro redraw).
                    const ownTreeFinalNh = Number(getTreeOwnFinalNh(child));
                    if (Number.isFinite(ownTreeFinalNh)) {
                        child.tree_final_nh = ownTreeFinalNh + inheritedLevel;
                    } else {
                        child.tree_final_nh = child.system.final_nh;
                    }

                    // 4. Preparar dados para os filhos deste filho (Netos)
                    const myCascadeContribution = getTreeCascadeContribution(child);
                    const nextInheritedLevel = inheritedLevel + myCascadeContribution;
                    
                    // Adiciona a si mesmo ao histórico dos descendentes
                    const myNodeInfo = {
                        name: child.name,
                        value: myCascadeContribution,
                        type: getTreeHierarchyType(child) // trunk, branch, etc.
                    };
                    const nextPathTrace = [...pathTrace, myNodeInfo];
                    const nextAncestorIds = new Set(ancestorIds);
                    nextAncestorIds.add(child.id);

                    childrenList.push(child);
                    
                    // Recursão
                    childrenList = childrenList.concat(processChildren(child.name, depth + 1, nextInheritedLevel, nextPathTrace, nextAncestorIds));
                });

                return childrenList;
            };

            // --- A. Processar Troncos ---
            trunks.forEach(trunk => {
                let groupName = trunk.name; 
                skillsByGroup[groupName] = [];

                trunk.indentClass = "";
                trunk.isTrunk = true;
                trunk.inheritancePath = []; // Tronco não herda de ninguém
                {
                    const trunkOwnTreeFinalNh = Number(getTreeOwnFinalNh(trunk));
                    if (Number.isFinite(trunkOwnTreeFinalNh)) trunk.tree_final_nh = trunkOwnTreeFinalNh;
                    else trunk.tree_final_nh = trunk.system.final_nh;
                }
                skillsByGroup[groupName].push(trunk);

                // Pega o nível do Tronco para iniciar a cascata
                const trunkLevel = getTreeCascadeContribution(trunk);
                
                // Cria o histórico inicial (O Tronco é o primeiro ancestral)
                const trunkNodeInfo = {
                    name: trunk.name,
                    value: trunkLevel,
                    type: "trunk"
                };

                // Busca descendentes
                let descendants = processChildren(trunk.name, 1, trunkLevel, [trunkNodeInfo], new Set([trunk.id]));
                skillsByGroup[groupName] = skillsByGroup[groupName].concat(descendants);
            });

            // --- B. Processar Órfãos ---
            let handledIds = new Set();
            Object.values(skillsByGroup).flat().forEach(s => handledIds.add(s.id));
            let orphans = skills.filter(s => !handledIds.has(s.id));
            
            if (orphans.length > 0) {
                orphans.forEach(skill => {
                    let g = (skill.system.group || "Geral").trim();
                    if (!g) g = "Geral";
                    if (!skillsByGroup[g]) skillsByGroup[g] = [];
                    
                    skill.indentClass = "";
                    skill.isTrunk = false;
                    skill.inheritancePath = []; // Órfão não tem herança
                    const orphanOwnTreeFinalNh = Number(getTreeOwnFinalNh(skill));
                    if (Number.isFinite(orphanOwnTreeFinalNh)) skill.tree_final_nh = orphanOwnTreeFinalNh;
                    else skill.tree_final_nh = skill.system.final_nh;
                    
                    skillsByGroup[g].push(skill);
                });
            }
        }

      // Salvamos o contexto legado usado pelo modo árvore.
        context.skillsByGroup = skillsByGroup;

        // Ordenar as chaves dos grupos mecânicos da árvore.
        context.skillGroupsKeys = Object.keys(context.skillsByGroup).sort((a, b) => {
            if (a === "Geral") return -1;
            if (b === "Geral") return 1;
            return a.localeCompare(b);
        });

        if (skillsViewMode === 'tree') context.skillSections = context.skillGroupsKeys.map(groupName => ({
            id: groupName,
            name: groupName,
            isTree: true,
            isUngrouped: false,
            skills: context.skillsByGroup[groupName]
        }));
        if (skillsViewMode === 'tree') skills.forEach(skill => { skill.skillOrganizationCanRemove = false; });
        

  // ================================================================== //
        //    AGRUPAMENTO DE MAGIAS (EM BLOCOS COMO PERÍCIAS)
        // ================================================================== //
        const spellSortPref = this.actor.system.sorting?.spell || 'manual';
        const spellSortFn = getSortFunction(spellSortPref);
        const spells = itemsByType.spell || [];
        context.hasSpells = spells.length > 0;

        spells.forEach((spell) => {
            const system = spell.system || {};
            const damage = system.damage || {};
            const identityParts = [system.source, system.spell_class, system.spell_school, system.usage_type]
                .map(value => String(value || '').trim())
                .filter(Boolean);
            const additionalDamageLabels = [
                damage.follow_up_damage?.formula ? game.i18n.localize("GUM.Spells.FollowUpDamage") : null,
                damage.fragmentation_damage?.formula ? game.i18n.localize("GUM.Spells.FragmentationDamage") : null
            ].filter(Boolean);
            spell.magicCardIdentity = identityParts.join(' · ');
            spell.magicCardAdditionalDamageMarkers = "+".repeat(additionalDamageLabels.length);
            spell.magicCardAdditionalDamageHint = additionalDamageLabels.join(" + ");
            spell.magicCardExpanded = this._expandedSpellCards.has(spell.id);
            spell.modifierIndicators = buildSkillModifierIndicators({
                effects: actorActiveEffects,
                skill: spell,
                matchesTarget: matchesEntryTargetForItem,
                matchesContext: matchesEntryContextForItem
            });
        });

        const spellOrganization = normalizeItemOrganization(this.actor.system.spell_organization, spells.map(item => item.id));
        const spellsById = new Map(spells.map(item => [item.id, item]));
        const orderedSpells = bucketId => {
            const entries = (spellOrganization.itemOrder[bucketId] || []).map(id => spellsById.get(id)).filter(Boolean);
            entries.forEach(item => { item.abilityOrganizationCanRemove = bucketId !== UNGROUPED_ORGANIZER_ID; });
            return spellSortPref === 'manual' ? entries : entries.sort(spellSortFn);
        };
        context.spellOrganization = spellOrganization;
        context.spellSections = [{
            id: UNGROUPED_ORGANIZER_ID,
            name: game.i18n.localize("GUM.Spells.DefaultGroup"),
            isUngrouped: true,
            items: orderedSpells(UNGROUPED_ORGANIZER_ID)
        }, ...spellOrganization.groupOrder.map(groupId => ({
            id: groupId,
            name: spellOrganization.groups[groupId].name,
            isUngrouped: false,
            items: orderedSpells(groupId)
        }))];
        context.hasSpellCategorySuggestions = spells.some(item => {
            const category = String(item.system?.group ?? "").trim().toLocaleLowerCase();
            return category && category !== "geral";
        });

        // ================================================================== //
        //    AGRUPAMENTO DE PODERES (MESMO PADRÃO DA ABA DE MAGIAS)
        // ================================================================== //
        const powerSortPref = this.actor.system.sorting?.power || 'manual';
        const powerSortFn = getSortFunction(powerSortPref);
        const powers = itemsByType.power || [];
        context.hasPowers = powers.length > 0;

        powers.forEach((power) => {
            const system = power.system || {};
            const damage = system.damage || {};
            const identityParts = [system.source, system.spell_class, system.usage_type]
                .map(value => String(value || '').trim())
                .filter(Boolean);
            const additionalDamageLabels = [
                damage.follow_up_damage?.formula ? game.i18n.localize("GUM.Spells.FollowUpDamage") : null,
                damage.fragmentation_damage?.formula ? game.i18n.localize("GUM.Spells.FragmentationDamage") : null
            ].filter(Boolean);
            power.powerCardIdentity = identityParts.join(' · ');
            power.powerCardAdditionalDamageMarkers = "+".repeat(additionalDamageLabels.length);
            power.powerCardAdditionalDamageHint = additionalDamageLabels.join(" + ");
            power.powerCardExpanded = this._expandedPowerCards.has(power.id);
            power.modifierIndicators = buildSkillModifierIndicators({
                effects: actorActiveEffects,
                skill: power,
                matchesTarget: matchesEntryTargetForItem,
                matchesContext: matchesEntryContextForItem
            });
        });

        const powerOrganization = normalizeItemOrganization(this.actor.system.power_organization, powers.map(item => item.id));
        const powersById = new Map(powers.map(item => [item.id, item]));
        const orderedPowers = bucketId => {
            const entries = (powerOrganization.itemOrder[bucketId] || []).map(id => powersById.get(id)).filter(Boolean);
            entries.forEach(item => { item.abilityOrganizationCanRemove = bucketId !== UNGROUPED_ORGANIZER_ID; });
            return powerSortPref === 'manual' ? entries : entries.sort(powerSortFn);
        };
        context.powerOrganization = powerOrganization;
        context.powerSections = [{
            id: UNGROUPED_ORGANIZER_ID,
            name: game.i18n.localize("GUM.Powers.DefaultGroup"),
            isUngrouped: true,
            items: orderedPowers(UNGROUPED_ORGANIZER_ID)
        }, ...powerOrganization.groupOrder.map(groupId => ({
            id: groupId,
            name: powerOrganization.groups[groupId].name,
            isUngrouped: false,
            items: orderedPowers(groupId)
        }))];
        context.hasPowerCategorySuggestions = powers.some(item => {
            const category = String(item.system?.group ?? "").trim().toLocaleLowerCase();
            return category && category !== "geral";
        });

        const getCharacteristicFinalPoints = (item) => calculateItemTraitCost(item).finalPoints;

        const prepareCharacteristicDisplay = (item) => {
            if (!["advantage", "disadvantage"].includes(item.type)) return item;

            const itemData = item.toObject ? item.toObject(false) : foundry.utils.deepClone(item);
            itemData.id = item.id ?? itemData._id;
            itemData.displayPoints = getCharacteristicFinalPoints(item);
            return itemData;
        };

                // ================================================================== //
        //    FAVORITOS DA ABA DE COMBATE
        // ================================================================== //
        const combatFavoriteTypes = new Set(["advantage", "disadvantage", "skill", "spell", "power"]);
        const combatFavoritesByGroup = {};
        const favoriteGeneralGroup = game.i18n.localize("GUM.Combat.Favorites.General");
        const favoriteGroupByType = new Map([
            ["advantage", game.i18n.localize("GUM.Combat.Favorites.Advantages")],
            ["disadvantage", game.i18n.localize("GUM.Combat.Favorites.Disadvantages")],
            ["skill", game.i18n.localize("GUM.Combat.Favorites.Skills")],
            ["spell", game.i18n.localize("GUM.Combat.Favorites.Spells")],
            ["power", game.i18n.localize("GUM.Combat.Favorites.Powers")]
        ]);

        for (const item of this.actor.items) {
            if (!combatFavoriteTypes.has(item.type)) continue;
            if (item.system?.favorite_in_combat !== true) continue;

            const groupName = favoriteGroupByType.get(item.type) || favoriteGeneralGroup;
            if (!combatFavoritesByGroup[groupName]) combatFavoritesByGroup[groupName] = [];

            const favoriteItem = prepareCharacteristicDisplay(item);
            favoriteItem.combatFavoriteOriginGroup = String(item.system?.group || "").trim();
            combatFavoritesByGroup[groupName].push(favoriteItem);
        }

        const combatFavoriteSortFn = getSortFunction('name');
        Object.values(combatFavoritesByGroup).forEach((groupItems) => groupItems.sort(combatFavoriteSortFn));

        context.combatFavoritesByGroup = combatFavoritesByGroup;
        context.combatFavoriteGroupKeys = [
            ...favoriteGroupByType.values(),
            favoriteGeneralGroup
        ].filter(groupName => combatFavoritesByGroup[groupName]?.length);

        // ================================================================== //
        //    ORDENAÇÃO DE LISTAS SIMPLES (Seu código original)
        // ================================================================== //
        const simpleSortTypes = [];
        for (const type of simpleSortTypes) {
            if (itemsByType[type]) {
                const sortPref = this.actor.system.sorting?.[type] || 'manual';
                itemsByType[type].sort(getSortFunction(sortPref));
            }
        }
        context.itemsByType = itemsByType; // Salva os itens já ordenados no contexto


// ================================================================== //
        //    AGRUPAMENTO E ORDENAÇÃO DE EQUIPAMENTOS (VERSÃO FINAL)          //
        // ================================================================== //
        const equipmentTypes = ['equipment', 'melee_weapon', 'ranged_weapon', 'money_source'];
        const allEquipment = context.actor.items.filter(i => equipmentTypes.includes(i.type));
        context.moneySources = context.actor.items.filter(item => item.type === "money_source").map(item => {
            const system = item.system || {};
            const data = item.toObject();
            const physical = system.mode !== "abstract";
            const quantity = Math.max(0, Number(system.quantity) || 0);
            const unitValue = Math.max(0, Number(system.unit_value) || 0);
            return {
                ...data,
                system: {
                    ...system,
                    moneyAvailable: physical ? quantity * unitValue : Math.max(0, Number(system.balance) || 0),
                    moneyPhysical: physical,
                    moneyTotalWeight: physical ? quantity * Math.max(0, Number(system.weight) || 0) : 0
                }
            };
        });
        const collapsedContainers = this.actor.getFlag("gum", "collapsed_containers") || {};

        const getItemOwnWeight = (item) => {
            const s = item.system || {};
            const q = Number(s.quantity || 1);
            const w = (s.effectiveWeight !== undefined) ? Number(s.effectiveWeight || 0) : Number(s.weight || 0);
            return q * w;
        };
        const getContainerContentsWeight = (containerId, stack = new Set()) => {
            if (!containerId || stack.has(containerId)) return 0;
            stack.add(containerId);
            let total = 0;
            for (const child of allEquipment) {
                if ((child.system?.parent_container_id || "") !== containerId) continue;
                total += getItemOwnWeight(child);
                if (child.system?.is_container) {
                    total += getContainerContentsWeight(child.id, stack);
                }
            }
            stack.delete(containerId);
            return total;
        };

        allEquipment.forEach(item => {
            const s = item.system;
            const q = s.quantity || 1;
            
            // Cálculo de peso e custo efetivo
            const w = (s.effectiveWeight !== undefined) ? s.effectiveWeight : (s.weight || 0);
            const c = (s.effectiveCost !== undefined) ? s.effectiveCost : (s.cost || 0);
            
            s.total_weight = (q * w).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            s.total_cost = (q * c).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

            if (s.is_container) {
                const currentWeight = getContainerContentsWeight(item.id);
                const maxWeight = Number(s.container?.max_weight || 0);
                const overweight = Math.max(0, currentWeight - maxWeight);
                s.container_current_weight_value = currentWeight;
                s.container_max_weight_value = maxWeight;
                s.container_current_weight = currentWeight.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                s.container_max_weight = maxWeight.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                s.container_overweight = overweight.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                s.container_is_overweight = maxWeight > 0 && overweight > 0;
                s.container_progress_value = maxWeight > 0 ? Math.min(currentWeight, maxWeight) : 0;
                s.container_aria_value_text = maxWeight > 0
                    ? `${s.container_current_weight} kg de ${s.container_max_weight} kg${s.container_is_overweight ? ", acima da capacidade" : ""}`
                    : "Capacidade não definida";
                s.container_fill_percent = maxWeight > 0 ? Math.min(100, (currentWeight / maxWeight) * 100) : 0;
                s.is_container_collapsed = collapsedContainers[item.id] === true;
            }

            if (s.parent_container_id) {
                const parent = allEquipment.find(eq => eq.id === s.parent_container_id);
                s.parent_container_name = parent?.name || "Container";
                s.parent_container_collapsed = collapsedContainers[s.parent_container_id] === true;
            }
        });

        // ✅ FILTROS PARA O HTML (HBS) - Incluindo todos os tipos de equipamentos
        context.equipmentInUse = allEquipment.filter(i => i.type !== "money_source" && i.system.equipped);
        context.equipmentStored = allEquipment.filter(i => i.type !== "money_source" && i.system.stored);
        context.equipmentCarried = allEquipment.filter(i => i.type !== "money_source" && !i.system.equipped && !i.system.stored);

        // Ordenação das listas (Opcional, usando suas funções existentes)
        const sortingPrefs = this.actor.system.sorting?.equipment || {};
        context.equipmentInUse.sort(getSortFunction(sortingPrefs.equipped || 'manual'));
        context.equipmentCarried.sort(getSortFunction(sortingPrefs.carried || 'manual'));
        context.equipmentStored.sort(getSortFunction(sortingPrefs.stored || 'manual'));

        const attachChildren = (list) => {
            const topLevel = list.filter(i => !i.system?.parent_container_id);
            const byParent = new Map();
            for (const item of list) {
                const pid = item.system?.parent_container_id;
                if (!pid) continue;
                if (!byParent.has(pid)) byParent.set(pid, []);
                byParent.get(pid).push(item);
            }
            for (const parent of topLevel) {
                const children = byParent.get(parent.id) || [];
                parent.system.container_children = children;
            }
            return topLevel;
        };

        context.equipmentInUse = attachChildren(context.equipmentInUse);
        context.equipmentCarried = attachChildren(context.equipmentCarried);
        context.equipmentStored = attachChildren(context.equipmentStored);

        const flattenForCombat = (items) => {
            const result = [];
            const visit = (item) => {
                result.push(item);
                const children = item.system?.container_children || [];
                for (const child of children) visit(child);
            };
            for (const item of items) visit(item);
            return result;
        };

        const buildContainerSections = (list) => {
            const looseItems = list.filter(i => !i.system?.is_container);
            const containers = list.filter(i => i.system?.is_container).map(container => ({
                container,
                children: container.system?.container_children || [],
                childCount: (container.system?.container_children || []).length
            }));
            return { looseItems, containers };
        };

        const carriedLayout = buildContainerSections(context.equipmentCarried);
        context.equipmentCarriedLoose = carriedLayout.looseItems;
        context.equipmentCarriedContainerSections = carriedLayout.containers;
        const equippedLayout = buildContainerSections(context.equipmentInUse);
        context.equipmentInUseLoose = equippedLayout.looseItems;
        context.equipmentInUseContainerSections = equippedLayout.containers;
        const storedLayout = buildContainerSections(context.equipmentStored);
        context.equipmentStoredLoose = storedLayout.looseItems;
        context.equipmentStoredContainerSections = storedLayout.containers;
        context.equipmentInUseForCombat = flattenForCombat(context.equipmentInUse);

        // ================================================================== //
        //     FASE 3.1: PREPARAÇÃO DOS GRUPOS DE ATAQUE (REATORADO)          //
        // ================================================================== //
        
        // 1. Usamos a lista 'context.equipmentInUse' que você já calculou
 const calculateDefaultDefense = (nhValue) => {
            if (nhValue === null || nhValue === undefined || nhValue === "") return null;
            const parsed = Number(nhValue);
            if (!Number.isFinite(parsed)) return null;
            return Math.floor(parsed / 2) + 3;
        };

        const normalizeDefenseValue = (value) => {
            if (value === null || value === undefined) return null;
            const trimmed = String(value).trim();
            if (trimmed === "" || trimmed === "0" || trimmed === "-") return null;
            return trimmed;
        };

        const equipmentAttackGroups = (context.equipmentInUseForCombat || []).map(item => {
            const prepareDamageDisplay = (damage = {}) => ({
                ...damage,
                display_formula: resolveAttackDamageDisplay(damage.formula, this.actor.system.attributes),
                nature_display: damage.nature ? formatDamageNature(damage.nature) : ""
            });
            const prepareAttackDamageDisplay = (attack) => ({
                damage_formula: attack.effective_damage?.main?.formula || attack.effective_damage_formula || attack.damage_formula,
                damage_display_formula: resolveAttackDamageDisplay(attack.effective_damage?.main?.formula || attack.effective_damage_formula || attack.damage_formula, this.actor.system.attributes),
                damage_type: attack.effective_damage?.main?.type ?? attack.damage_type,
                damage_nature: attack.effective_damage?.main?.nature ?? attack.damage_nature,
                damage_nature_display: (attack.effective_damage?.main?.nature ?? attack.damage_nature) ? formatDamageNature(attack.effective_damage?.main?.nature ?? attack.damage_nature) : "",
                armor_divisor: attack.effective_damage?.main?.armor_divisor ?? attack.armor_divisor,
                follow_up_damage: prepareDamageDisplay(attack.effective_damage?.follow_up || attack.follow_up_damage),
                fragmentation_damage: prepareDamageDisplay(attack.effective_damage?.fragmentation || attack.fragmentation_damage)
            });
            
            // 2. Processa os Ataques Corpo a Corpo (Melee)
            // ✅ MUDANÇA: Removemos toda a lógica de cálculo de NH daqui
            const meleeAttacks = Object.entries(item.system.melee_attacks || {}).map(([id, attack]) => {
                const finalNh = attack.final_nh ?? null;
                const defaultDefense = calculateDefaultDefense(finalNh);
                const fallbackParry = attack.parry_default && defaultDefense !== null ? defaultDefense : attack.parry;
                const fallbackBlock = attack.block_default && defaultDefense !== null ? defaultDefense : attack.block;
                const parryValue = attack.final_parry ?? fallbackParry;
                const blockValue = attack.final_block ?? fallbackBlock;
                const normalizedParry = normalizeDefenseValue(parryValue);
                const normalizedBlock = normalizeDefenseValue(blockValue);
                return {
                    ...attack, // Traz todos os campos do 'attack_melee'
                    ...prepareAttackDamageDisplay(attack),
                    id: id,
                    name: attack.mode, 
                    attack_type: "melee",
                    weight: item.system.weight,
                    unbalanced: attack.unbalanced, 
                    fencing: attack.fencing,
                    groupId: item.id,
                    itemId: item.id,
                    // ✅ MUDANÇA: Apenas lê o valor que o main.js já calculou
                    final_nh: finalNh,
                    skill_name: attack.resolved_skill_name || attack.skill_name || "N/A",
                    parry: normalizedParry ?? "",
                    block: normalizedBlock ?? "",
                    final_parry: normalizedParry,
                    final_block: normalizedBlock
                };
            });

            // 3. Processa os Ataques à Distância (Ranged)
            // ✅ MUDANÇA: Removemos toda a lógica de cálculo de NH daqui
            const rangedAttacks = Object.entries(item.system.ranged_attacks || {}).map(([id, attack]) => {
                const ammunitionLoadout = normalizeAmmunitionLoadout(attack.ammunition_loadout);
                const selectedAmmunition = ammunitionLoadout.ammunitionId
                    ? this.actor.items.get(ammunitionLoadout.ammunitionId)
                    : null;
                const ammunitionUse = ammunitionUseState(selectedAmmunition);
                const ammunitionValidation = validateAmmunitionLoadout(this.actor, attack, ammunitionLoadout);
                return {
                    ...attack, // Traz todos os campos do 'attack_ranged'
                    ...prepareAttackDamageDisplay(attack),
                    id: id,
                    name: attack.mode,
                    attack_type: "ranged",
                    weight: item.system.weight,
                    unbalanced: attack.unbalanced, 
                    fencing: attack.fencing,
                    groupId: item.id,
                    itemId: item.id,
                    // ✅ MUDANÇA: Apenas lê o valor que o main.js já calculou
                    final_nh: attack.final_nh ?? null,
                    skill_name: attack.resolved_skill_name || attack.skill_name || "N/A",
                    hasAmmunitionLinks: Array.isArray(attack.ammunition_ids) && attack.ammunition_ids.length > 0,
                    ammunitionLoadoutDisplay: {
                        name: selectedAmmunition?.name || game.i18n.localize("GUM.Equipment.Ammunition.StandardShort"),
                        shots: ammunitionLoadout.shots,
                        locked: ammunitionLoadout.locked,
                        valid: ammunitionValidation.valid,
                        available: ammunitionUse.available,
                        availableText: selectedAmmunition
                            ? game.i18n.format(ammunitionUse.mode === "charges"
                                ? "GUM.Equipment.Ammunition.ChargesAvailable"
                                : "GUM.Equipment.Ammunition.UnitsAvailable", { quantity: ammunitionUse.available })
                            : game.i18n.localize("GUM.Equipment.Ammunition.NoItemConsumption")
                    }
                };
            });

            // 4. Combina os ataques deste item
            const allAttacks = [...meleeAttacks, ...rangedAttacks];

            // Se este item não tiver ataques definidos, retorna nulo
            if (allAttacks.length === 0) return null;

            // 5. Retorna um "Grupo de Ataque" formatado
            return {
                id: item.id,
                name: item.name,
                weight: item.system.weight,
                defense_bonus: Number(item.system.defense_bonus) || 0,
                attacks: allAttacks,
                sort: item.sort || 0,
                isFromItem: true
            };
        }).filter(group => group !== null); // Remove itens que não tinham ataques

        // 6. Ordena a lista final e salva no contexto
        equipmentAttackGroups.sort((a, b) => (a.sort || 0) - (b.sort || 0));
        const availableAttackGroupIds = new Set(equipmentAttackGroups.map(group => String(group.id)));
        for (const selectedGroupId of this._combatAttackFilters) {
            if (!availableAttackGroupIds.has(selectedGroupId)) this._combatAttackFilters.delete(selectedGroupId);
        }
        context.combatAttackFilterAll = this._combatAttackFilters.size === 0;
        for (const group of equipmentAttackGroups) {
            group.combatFilterActive = this._combatAttackFilters.has(String(group.id));
            group.combatFilterVisible = this._combatAttackFilters.size === 0 || group.combatFilterActive;
        }
        context.attackGroups = equipmentAttackGroups; // Salva no contexto para o .hbs usar

        // ================================================================== //
        //     FIM DA FASE 3.1                                                //
        // ================================================================== //

        // Organização híbrida: itens livres primeiro e grupos manuais depois.
        const characteristics = [ ...(itemsByType.advantage || []), ...(itemsByType.disadvantage || []) ]
            .map(prepareCharacteristicDisplay);
        const characteristicOrganization = normalizeItemOrganization(
            this.actor.system.characteristic_organization,
            characteristics.map(item => item.id)
        );
        const characteristicsById = new Map(characteristics.map(item => [item.id, item]));
        const charSortPref = this.actor.system.sorting?.characteristic || 'manual';
        const charSortFn = getSortFunction(charSortPref);
        const orderedCharacteristics = bucketId => {
            const entries = (characteristicOrganization.itemOrder[bucketId] || [])
                .map(id => characteristicsById.get(id))
                .filter(Boolean);
            entries.forEach(item => {
                item.characteristicOrganizationCanRemove = bucketId !== UNGROUPED_ORGANIZER_ID;
                item.characteristicKindLabel = item.type === 'disadvantage'
                    ? game.i18n.localize("GUM.Characteristics.Disadvantage")
                    : game.i18n.localize("GUM.Characteristics.Advantage");
                const organizationName = String(item.system?.group ?? "").trim().toLocaleLowerCase();
                item.characteristicIsRacial = organizationName.startsWith('racial') || item.system?.block_id === 'block1';
            });
            return charSortPref === 'manual' ? entries : entries.sort(charSortFn);
        };

        context.characteristicOrganization = characteristicOrganization;
        context.characteristicSections = [{
            id: UNGROUPED_ORGANIZER_ID,
            name: game.i18n.localize("GUM.Characteristics.DefaultGroup"),
            isUngrouped: true,
            characteristics: orderedCharacteristics(UNGROUPED_ORGANIZER_ID)
        }, ...characteristicOrganization.groupOrder.map(groupId => ({
            id: groupId,
            name: characteristicOrganization.groups[groupId].name,
            isUngrouped: false,
            characteristics: orderedCharacteristics(groupId)
        }))];
        context.hasCharacteristics = characteristics.length > 0;
        context.hasCharacteristicGroupSuggestions = characteristics.some(item => {
            const organizationName = String(item.system?.group ?? "").trim().toLocaleLowerCase();
            return organizationName && organizationName !== 'geral';
        });

        // ================================================================== //
        //    ENRIQUECIMENTO DE TEXTO (Seu código original)
        // ================================================================== //
                  // Prepara o campo de biografia, garantindo que funcione mesmo se estiver vazio
            context.enrichedBackstory = await TextEditorImpl.enrichHTML(this.actor.system.details.backstory || "", {
                    secrets: this.actor.isOwner,
                    async: true
                });              
                context.survivalBlockWasOpen = this._survivalBlockOpen || false;

                 
                const combatMeters = context.actor.system.combat.combat_meters || {};
 

                const preparedCombatMeters = Object.entries(combatMeters)
                    .map(([id, meter]) => {
                        const normalized = this._normalizeResourceEntry(meter, { defaultName: "Registro", includeDR: true })
                        return { id, meter: normalized };
                    });

                const linkedEquipmentReserves = this.actor.items
                    .filter(item => item.type === "equipment")
                    .map(item => equipmentLinkedReserve(item, item.system?.equipmentResolution))
                    .filter(Boolean);
                for (const reserve of linkedEquipmentReserves.filter(entry => entry.type === "combat")) {
                    preparedCombatMeters.push({ id: `equipment-${reserve.equipmentId}`, meter: reserve });
                }
                const linkedIntegrityRecords = this.actor.items
                    .filter(item => item.type === "equipment")
                    .map(item => equipmentIntegrityRecord(item, item.system?.equipmentResolution))
                    .filter(Boolean);
                for (const record of linkedIntegrityRecords) {
                    preparedCombatMeters.push({ id: `integrity-${record.equipmentId}`, meter: record });
                }
                preparedCombatMeters.sort((a, b) => a.meter.name.localeCompare(b.meter.name));

                context.preparedCombatMeters = preparedCombatMeters;
                context.preparedWounds = Object.entries(context.actor.system.combat?.wounds || {})
                    .map(([id, wound]) => prepareWoundForDisplay(id, wound))
                    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
 
                context.spellReserves = this._normalizeResourceCollection(context.actor.system.spell_reserves || {}, { defaultName: game.i18n.localize("GUM.Spells.Reserve") });
                context.powerReserves = this._normalizeResourceCollection(context.actor.system.power_reserves || {}, { defaultName: game.i18n.localize("GUM.Powers.Reserve") });
                for (const reserve of linkedEquipmentReserves) {
                    if (reserve.type === "spell") context.spellReserves[`equipment-${reserve.equipmentId}`] = reserve;
                    if (reserve.type === "power") context.powerReserves[`equipment-${reserve.equipmentId}`] = reserve;
                }
                context.spellReserveCount = Object.keys(context.spellReserves).length;
                context.powerReserveCount = Object.keys(context.powerReserves).length;
                context.castingAbilities = this._prepareCastingAbilities();
                context.powerSources = this._preparePowerSources();
                context.spellSupportCount = context.castingAbilities.length + context.spellReserveCount;
                context.powerSupportCount = context.powerSources.length + context.powerReserveCount;
                context.spellSupportCompactPair = context.castingAbilities.length === 1 && context.spellReserveCount === 1;
                context.powerSupportCompactPair = context.powerSources.length === 1 && context.powerReserveCount === 1;
                context.appliedModels = this._prepareAppliedModels();

                // Lê o estado dos grupos colapsáveis para serem salvos
                context.collapsedData = this.actor.getFlag('gum', 'sheetCollapsedState') || {};

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

        // ================================================================== //
    // ✅ CONFIGURAÇÃO DO EDITOR (API ATUAL)
    // ================================================================== //
    /**
     * @override
     * Configura o editor de texto rico para a ficha do ator usando o engine atual.
     */
    activateEditor(name, options = {}, ...args) {
        options.engine = "prosemirror";
        options.minHeight ??= 300;
        options.documentTypes ??= ["JournalEntry", "JournalEntryPage", "Item"];
        return super.activateEditor(name, options, ...args);
    }
    // ================================================================== //
    // ✅ FIM DA CONFIGURAÇÃO DO EDITOR
    // ================================================================== //

    _getEditorInstance(field) {
        const editor = this.editors?.[field];
        if (!editor) return null;
        return editor.editor ?? editor.instance ?? editor;
    }

    async _getEditorContent(field, section) {
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
            const element = section.find(`[name="${field}"]`).get(0)
                ?? section.find(`.editor[data-edit="${field}"]`).get(0);
            if (element) return TextEditorImpl.getContent(element);
        }
        const namedInput = section.find(`[name="${field}"]`);
        if (namedInput.length) return namedInput.val();
        const editorElement = section.find(`.editor[data-edit="${field}"]`);
        if (editorElement.length) return editorElement.val() ?? editorElement.html();
        return "";
    }
    
      async _updateObject(event, formData) {
        // Processa conversão decimal apenas em campos numéricos (evita alterar texto livre, como biografia)
        for (const key in formData) {
          const value = formData[key];
          if (typeof value !== 'string' || !value.includes(',')) continue;
          if (!/^\s*-?\d+,\d+\s*$/.test(value)) continue;
          formData[key] = value.replace(',', '.');
        }

        return this.actor.update(formData);
      }

      /**
     * Função auxiliar para somar os valores de dois objetos de RD.
     */
    _mergeDRObjects(target, source) {
        if (!source || typeof source !== 'object') {
            const value = Number(source) || 0;
            if (value > 0) target.base = (target.base || 0) + value;
            return;
        }
        for (const [type, value] of Object.entries(source)) {
            target[type] = (target[type] || 0) + (Number(value) || 0);
        }
    }

/**
     * Converte o objeto de RD (ex: {base: 10, cont: -6})
     * em uma string GURPS legível (ex: "10, 4 cont").
     */
    _formatDRObjectToString(drObject) {
        if (!drObject || typeof drObject !== 'object' || Object.keys(drObject).length === 0) return "0";
        
        const parts = [];
        const baseDR = drObject.base || 0;
        parts.push(baseDR.toString()); // Sempre começa com o valor base

        for (const [type, mod] of Object.entries(drObject)) {
            if (type === 'base') continue; // Já cuidamos da base

            // ✅ CORREÇÃO: CALCULA O VALOR FINAL GURPS
            const finalDR = Math.max(0, baseDR + (mod || 0));
            
            // Só mostra se for diferente da base
            if (finalDR !== baseDR) {
                parts.push(`${finalDR} ${type}`);
            }
        }
        
        if (parts.length === 1 && parts[0] === "0") return "0"; 
        
        if (parts.length > 1 && parts[0] === "0") {
             parts.shift(); 
        }
        
      return parts.join(", ");
    }

        _formatDROverrideToString(drObject) {
        if (!drObject || typeof drObject !== "object") return "—";
        const parts = [];
        if (drObject.base !== null && drObject.base !== undefined) parts.push(String(drObject.base));
        for (const [type, value] of Object.entries(drObject)) {
            if (type === "base" || value === null || value === undefined) continue;
            parts.push(`${value} ${type}`);
        }
        return parts.join(", ") || "—";
    }

 _buildDrDisplayRows(profile, drLocations, effectiveBodyLocations = null) {
        const rows = [];
        const locations = effectiveBodyLocations?.definitions || profile.locations || {};
        const locationOrder = effectiveBodyLocations?.order || getBodyProfileLocationKeys(profile);
        const locationSources = effectiveBodyLocations?.sources || {};
        const items = [];

        for (const key of locationOrder) {
            const loc = locations[key];
            if (!loc) continue;
            const rawDR = drLocations?.[key];
            const drObject = rawDR && typeof rawDR === "object"
                ? rawDR
                : { base: Number(rawDR) || 0 };
            const base = Number(drObject?.base) || 0;
            const extraLine = this._formatDRExtraLine(drObject);
            items.push({
                key,
                label: localizeBodyLocationLabel(key, loc, localizationKey => game.i18n.localize(localizationKey)),
                groupKey: loc.groupKey,
                groupLabel: loc.groupLabel,
                groupPlural: loc.groupKey
                    ? localizeBodyGroupLabel(loc.groupKey, loc.groupPlural || loc.groupLabel, localizationKey => game.i18n.localize(localizationKey))
                    : loc.groupPlural,
                equipmentSources: describeBodyLocationSources(locationSources[key]),
                isAdditional: (locationSources[key] || []).some(source => source.type === "manual"),
                base,
                extraLine,
                drSignature: this._getDRSignature(drObject)
            });
        }

        const groupedKeys = new Set();
        const groups = new Map();

        for (const item of items) {
            if (!item.groupKey) continue;
            if (!groups.has(item.groupKey)) groups.set(item.groupKey, []);
            groups.get(item.groupKey).push(item);
        }

        const groupSummaries = new Map();
        for (const [groupKey, groupItems] of groups.entries()) {
            if (groupItems.length < 2) continue;
            const signature = groupItems[0].drSignature;
            const isUniform = groupItems.every(member => member.drSignature === signature);
            if (!isUniform) continue;
            groupItems.forEach(member => groupedKeys.add(member.key));

            const labelBase = groupItems[0].groupPlural || groupItems[0].groupLabel || groupKey;
            groupSummaries.set(groupKey, {
                id: `group-${groupKey}`,
                isGroup: true,
                label: `${labelBase} (${groupItems.length})`,
                base: groupItems[0].base,
                extraLine: groupItems[0].extraLine,
                equipmentSources: [...new Set(groupItems.flatMap(member => member.equipmentSources || []))],
                isAdditional: groupItems.some(member => member.isAdditional),
                children: groupItems
            });
        }

        const renderedGroups = new Set();
        for (const item of items) {
            if (item.groupKey && groupSummaries.has(item.groupKey)) {
                if (renderedGroups.has(item.groupKey)) continue;
                rows.push(groupSummaries.get(item.groupKey));
                renderedGroups.add(item.groupKey);
                continue;
            }
            if (groupedKeys.has(item.key)) continue;
            rows.push({
                ...item,
                isGroup: false
            });
        }

        return rows;
    }

    _formatDRExtraLine(drObject) {
        if (!drObject || typeof drObject !== "object") return "";
        const base = Number(drObject.base) || 0;
        const extras = [];

        for (const [type, mod] of Object.entries(drObject)) {
            if (type === "base") continue;
            const finalValue = Math.max(0, base + (Number(mod) || 0));
            if (finalValue === base) continue;
            extras.push(`${finalValue} ${type}`);
        }

        return extras.join(", ");
    }

    _getDRSignature(drObject) {
        if (!drObject || typeof drObject !== "object") {
            const base = Number(drObject) || 0;
            return base ? JSON.stringify([["base", base]]) : "[]";
        }
        const normalized = {};
        for (const [key, value] of Object.entries(drObject)) {
            const numeric = Number(value) || 0;
            if (numeric === 0) continue;
            normalized[key] = numeric;
        }
        const sortedEntries = Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b));
        return JSON.stringify(sortedEntries);
    }

/**
     * Converte a string de RD (ex: "5, 2 pi+" ou "3 cont")
     * em um objeto de modificador (ex: {base: 5, "pa+": -3} ou {cont: 3}).
     * ✅ AGORA COM TRADUÇÃO DE IDIOMA.
     */
    _parseDRStringToObject(drString) {
        if (typeof drString === 'object' && drString !== null) return drString;
        if (!drString || typeof drString !== 'string' || drString.trim() === "") return {}; 
        
        // O DICIONÁRIO DE TRADUÇÃO
        const DAMAGE_TYPE_MAP = {
            "cr": "cont", "cut": "cort", "imp": "perf", "pi": "pa",
            "pi-": "pa-", "pi+": "pa+", "pi++": "pa++", "burn": "qmd",
            "corr": "cor", "tox": "tox"
        };

        const drObject = {};
        const parts = drString.split(',').map(s => s.trim().toLowerCase());
        
        let baseDR = 0; 

        // 1. Primeira passada: Encontra o 'base'
        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 1 && !isNaN(Number(segments[0]))) {
                baseDR = Number(segments[0]);
                drObject['base'] = baseDR;
                break; 
            }
        }

        // 2. Segunda passada: Calcula os modificadores
        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 2 && !isNaN(Number(segments[0]))) {
                let type = segments[1];
                const value = Number(segments[0]);
                
                // ✅ TRADUZ O TIPO
                type = DAMAGE_TYPE_MAP[type] || type;

                if (baseDR > 0) {
                    drObject[type] = value - baseDR; 
                } 
                else {
                    drObject[type] = value; 
                }
            }
        }
  
        return drObject;
    }

    _normalizeResourceEntry(entry = {}, { defaultName = "Registro", includeDR = false } = {}) {
        const data = foundry.utils.duplicate(entry || {});
        data.name = data.name || defaultName;
        const current = Number(data.current ?? data.value ?? 0);
        const max = Number(data.max ?? data.value ?? current);
        data.current = current;
        data.max = max;
        data.value = data.value ?? current; // Mantém compatibilidade com referências antigas
        if (includeDR) data.dr = Math.max(0, Number(data.dr) || 0);
        return data;
    }

    _normalizeResourceCollection(collection = {}, { defaultName = "Reserva" } = {}) {
        const normalized = {};
        for (const [id, entry] of Object.entries(collection)) {
            normalized[id] = this._normalizeResourceEntry(entry, { defaultName });
        }
        return normalized;
    }

    /**
     * Função auxiliar para importar modificadores do compêndio.
     * @param {boolean} reset - Se true, apaga os existentes antes de importar.
     */
    async _importModifiersFromCompendium(reset = false) {
        const { documents: sourceItems, invalidSources } = await contentSourceService.getDocuments("rollModifiers");
        if (sourceItems.length === 0) {
            const missing = invalidSources.map(source => source.id).join(", ");
            return ui.notifications.warn(missing
                ? `Nenhum modificador disponível. Fontes inválidas: ${missing}.`
                : "As fontes configuradas de Modificadores de Rolagem estão vazias.");
        }

        // 1. Se for Reset, apaga tudo primeiro
        if (reset) {
            const currentIds = this.actor.items.filter(i => i.type === 'gm_modifier').map(i => i.id);
            if (currentIds.length > 0) await this.actor.deleteEmbeddedDocuments("Item", currentIds);
        }

        // 2. Filtra duplicatas (se não for reset, não queremos adicionar o que já tem)
        const currentModsNames = new Set(this.actor.items.filter(i => i.type === 'gm_modifier').map(i => i.name));
        const toCreate = [];

        sourceItems.forEach(item => {
            if (reset || !currentModsNames.has(item.name)) {
                const data = item.toObject();
                data._stats = { compendiumSource: item.uuid };
                toCreate.push(data);
            }
        });

        if (toCreate.length > 0) {
            await this.actor.createEmbeddedDocuments("Item", toCreate);
            ui.notifications.info(`${toCreate.length} modificadores importados.`);
        } else {
            ui.notifications.info("Nenhum modificador novo para importar.");
        }
 }

 _resolveNamedRollValue(rawValue) {
    const normalizedInput = String(rawValue ?? "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();

    const attributeKey = normalizeRequestedAttributeKey(normalizedInput);
    const actorAttributes = this.actor?.system?.attributes || {};
    const attributeValue = Number(actorAttributes?.[attributeKey]?.final);

    if (!Number.isNaN(attributeValue)) {
        return { value: attributeValue, type: "attribute", attributeKey };
    }

    const skills = this.actor?.items?.filter(item => item.type === "skill") || [];
    const matchedSkill = skills.find(skill => {
        const skillName = String(skill.name || "")
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .trim()
            .toLowerCase();
        return skillName === normalizedInput;
    });

    if (matchedSkill) {
        return {
            value: Number(matchedSkill.system?.final_nh) || 10,
            type: "skill",
            attributeKey: matchedSkill.system?.base_attribute || null,
            itemId: matchedSkill.id
        };
    }

    const fixedValue = parseInt(normalizedInput, 10);
    if (!Number.isNaN(fixedValue)) {
        return { value: fixedValue, type: "attribute", attributeKey: null };
    }

    return { value: 10, type: "attribute", attributeKey: null };
}
    
_getRollDataFromElement(element) {
    const dataset = element.dataset;
    const $element = $(element);
    const itemId = dataset.itemId || $element.closest('.item').data('itemId') || "";
    const attackId = dataset.attackId || $element.closest('[data-attack-id]').data('attackId') || null;
    const rawRollValue = dataset.rollValue;

    let value = parseInt(rawRollValue, 10);
    let type = dataset.type || "attribute";
    let attributeKey = dataset.attributeKey || null;
    let resolvedItemId = itemId;

    if (Number.isNaN(value) && rawRollValue !== undefined) {
        const resolved = this._resolveNamedRollValue(rawRollValue);
        value = resolved.value;
        type = dataset.type || resolved.type;
        attributeKey = dataset.attributeKey || resolved.attributeKey;
        resolvedItemId = resolved.itemId || resolvedItemId;
    }

    return {
        label: dataset.label || "Teste",
        value: value || 10,
        type,
        itemId: resolvedItemId,
        img: dataset.img || "",
        attackType: dataset.attackType || null,
        isRanged: dataset.isRanged === "true",
        attributeKey,
        defenseType: dataset.defenseType || null,
        defenseBonusIncluded: dataset.defenseBonusIncluded === "true",
        attackId
    };
}

_getDamageRollDataFromElement(element) {
    const dataset = element.dataset || {};

    if (element.classList?.contains("rollable-basic-damage")) {
        return {
            kind: "basic",
            basicDamageKey: dataset.basicDamageKey || null,
            sourceLabel: dataset.label || game.i18n.localize("GUM.RollCard.BasicDamage"),
            img: this.actor.img || "icons/svg/blood.svg"
        };
    }

    const $element = $(element);
    const itemId = dataset.itemId
        || $element.data("itemId")
        || $element.closest("[data-item-id]").data("itemId")
        || $element.closest(".item").data("itemId")
        || null;
    const attackId = dataset.attackId
        || $element.data("attackId")
        || $element.closest("[data-attack-id]").data("attackId")
        || null;
    const item = itemId ? this.actor.items.get(itemId) : null;
    const attack = attackId
        ? item?.system?.melee_attacks?.[attackId] || item?.system?.ranged_attacks?.[attackId]
        : null;

    return {
        kind: "item",
        itemId,
        itemUuid: item?.uuid || null,
        attackId,
        sourceLabel: attack ? `${item.name} (${attack.mode ?? attackId})` : item?.name || dataset.label || "Dano",
        img: item?.img || this.actor.img || "icons/svg/blood.svg"
    };
}

_onDragStart(event) {
    const target = event.currentTarget;
    const dataTransfer = event?.dataTransfer || event?.originalEvent?.dataTransfer;

    if (target?.classList?.contains("rollable")) {
        if (!dataTransfer) return;
        const rollData = this._getRollDataFromElement(target);
        const dragData = {
            type: "GUM.Roll",
            actorId: this.actor.id,
            actorUuid: this.actor.uuid,
            rollData
        };

        dataTransfer.setData("text/plain", JSON.stringify(dragData));
        return;
    }

    if (target?.classList?.contains("rollable-damage") || target?.classList?.contains("rollable-basic-damage")) {
        if (!dataTransfer) return;
        event.stopPropagation?.();
        const damageData = this._getDamageRollDataFromElement(target);
        if (damageData.kind === "item" && !damageData.itemId) {
            ui.notifications.warn("[GUM] Não foi possível identificar a origem desta rolagem de dano.");
            return;
        }
        if (damageData.kind === "basic" && !damageData.basicDamageKey) {
            ui.notifications.warn("[GUM] Não foi possível identificar o tipo de dano básico.");
            return;
        }
        dataTransfer.setData("text/plain", JSON.stringify({
            type: "GUM.DamageRoll",
            actorId: this.actor.id,
            actorUuid: this.actor.uuid,
            damageData
        }));
        return;
    }

    return super._onDragStart(event);
}

_setCardDragImage(event, card, contentSelector = null) {
    const dataTransfer = event?.dataTransfer || event?.originalEvent?.dataTransfer;
    if (!card || !dataTransfer?.setDragImage) return;
    const dragImage = contentSelector ? card.querySelector(contentSelector) || card : card;
    const bounds = dragImage.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const offsetY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    dataTransfer.setDragImage(dragImage, offsetX, offsetY);
}

async _onDrop(event) {
    const data = TextEditorImpl.getDragEventData(event);
    if (data?.type === "Item") {
        const item = await Item.fromDropData(data);
        if (item?.type === "template") {
            event.preventDefault();
            await this._runTemplateApplicationFlow(item);
            return;
        }
        if (item?.type === "effect") {
            event.preventDefault();
            const targets = buildActorEffectTargets(this.actor);
            await applyEffectWithResistance(item, targets, { actor: this.actor, origin: item, mode: "sheet-drop" });
            return;
        }
    }

    return super._onDrop(event);
}

_getSkillOrganizationState() {
    const skills = this.actor.items.filter(item => item.type === "skill");
    return {
        skills,
        organization: normalizeItemOrganization(this.actor.system.skill_organization, skills.map(item => item.id))
    };
}

async _saveSkillOrganization(organization) {
    const current = this.actor.system.skill_organization || {};
    const withDeletions = (next, previous) => {
        const payload = { ...next };
        for (const key of Object.keys(previous || {})) {
            if (!(key in next)) payload[`-=${key}`] = null;
        }
        return payload;
    };
    return this.actor.update({
        "system.skill_organization.groups": withDeletions(organization.groups, current.groups),
        "system.skill_organization.groupOrder": organization.groupOrder,
        "system.skill_organization.assignments": withDeletions(organization.assignments, current.assignments),
        "system.skill_organization.itemOrder": withDeletions(organization.itemOrder, current.itemOrder)
    });
}

_promptSkillGroupName({ title, initial = "", hintKey = "GUM.Skills.GroupNameHint" }) {
    const localize = key => game.i18n.localize(key);
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        new Dialog({
            title,
            content: `<form class="gum-popup-form gum-record-editor skill-group-name-dialog">
                <header class="gum-record-editor__intro form-group--full"><span class="gum-record-editor__icon"><i class="fas fa-folder-plus" aria-hidden="true"></i></span><span><strong>${foundry.utils.escapeHTML(title)}</strong><small>${localize(hintKey)}</small></span></header>
                <div class="form-group form-group--full skill-group-name-field"><label>${localize("GUM.Skills.GroupNameLabel")}</label><input class="gum-input-left" type="text" name="name" value="${foundry.utils.escapeHTML(initial)}" autocomplete="off" autofocus></div>
            </form>`,
            buttons: {
                save: {
                    icon: '<i class="fas fa-check"></i>',
                    label: localize("GUM.Skills.Save"),
                    callback: html => finish(String(html.find('[name="name"]').val() ?? "").trim() || null)
                },
                cancel: { label: localize("GUM.Skills.Cancel"), callback: () => finish(null) }
            },
            default: "save",
            close: () => finish(null)
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-record-edit-dialog", "skill-group-dialog"], width: 420, height: "auto" }).render(true);
    });
}

_confirmSkillOrganizationAction({ title, content, confirmLabel = game.i18n.localize("GUM.Skills.Confirm") }) {
    const localize = key => game.i18n.localize(key);
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        new Dialog({
            title,
            content,
            buttons: {
                confirm: { icon: '<i class="fas fa-check"></i>', label: confirmLabel, callback: () => finish(true) },
                cancel: { label: localize("GUM.Skills.Cancel"), callback: () => finish(false) }
            },
            default: "cancel",
            close: () => finish(false)
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "skill-organization-confirm-dialog"], width: 420, height: "auto" }).render(true);
    });
}

_promptSkillCategoryGroupPlan(plan, options = {}) {
    const localize = key => game.i18n.localize(key);
    const format = (key, data) => game.i18n.format(key, data);
    const titleKey = options.titleKey || "GUM.Skills.CategoryPlanTitle";
    const headingKey = options.headingKey || "GUM.Skills.CategoryPlanHeading";
    const hintKey = options.hintKey || "GUM.Skills.CategoryPlanHint";
    const itemCountKey = options.itemCountKey || "GUM.Skills.SkillCount";
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const rows = plan.map((category, index) => {
            const skillNames = category.items.map(item => foundry.utils.escapeHTML(item.name)).join(", ");
            const destination = category.existingGroupId ? localize("GUM.Skills.ExistingGroup") : localize("GUM.Skills.NewGroupDestination");
            return `<label class="skill-category-preview__row">
                <input type="checkbox" name="category" value="${index}" checked>
                <span><strong>${foundry.utils.escapeHTML(category.name)}</strong><small>${destination} · ${format(itemCountKey, { count: category.items.length })}</small><em>${skillNames}</em></span>
            </label>`;
        }).join("");
        new Dialog({
            title: localize(titleKey),
            content: `<form class="skill-category-preview">
                <div class="skill-category-preview__intro"><i class="fas fa-layer-group"></i><span><strong>${localize(headingKey)}</strong><small>${localize(hintKey)}</small></span></div>
                <div class="skill-category-preview__list">${rows}</div>
            </form>`,
            buttons: {
                apply: {
                    icon: '<i class="fas fa-layer-group"></i>',
                    label: localize("GUM.Skills.CreateSelected"),
                    callback: html => {
                        const selected = [...html[0].querySelectorAll('input[name="category"]:checked')]
                            .map(input => plan[Number(input.value)]?.key)
                            .filter(Boolean);
                        finish(selected);
                    }
                },
                cancel: { label: localize("GUM.Skills.Cancel"), callback: () => finish(null) }
            },
            default: "apply",
            close: () => finish(null)
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "skill-category-preview-dialog"], width: 520, height: "auto" }).render(true);
    });
}

async _createSkillOrganizationGroup() {
    const name = await this._promptSkillGroupName({ title: game.i18n.localize("GUM.Skills.NewGroup") });
    if (!name) return;
    const { skills, organization } = this._getSkillOrganizationState();
    const id = foundry.utils.randomID?.() ?? crypto.randomUUID();
    await this._saveSkillOrganization(addItemOrganizationGroup(organization, { id, name }, skills.map(item => item.id)));
}

async _renameSkillOrganizationGroup(groupId) {
    const { skills, organization } = this._getSkillOrganizationState();
    const current = organization.groups[groupId];
    if (!current) return;
    const name = await this._promptSkillGroupName({ title: game.i18n.localize("GUM.Skills.RenameGroupDialog"), initial: current.name });
    if (!name || name === current.name) return;
    await this._saveSkillOrganization(renameItemOrganizationGroup(organization, { id: groupId, name }, skills.map(item => item.id)));
}

async _deleteSkillOrganizationGroup(groupId) {
    const { skills, organization } = this._getSkillOrganizationState();
    const group = organization.groups[groupId];
    if (!group) return;
    const confirmed = await this._confirmSkillOrganizationAction({
        title: game.i18n.localize("GUM.Skills.DeleteGroupDialog"),
        content: `<p>${game.i18n.format("GUM.Skills.DeleteGroupContent", { name: foundry.utils.escapeHTML(group.name) })}</p>`,
        confirmLabel: game.i18n.localize("GUM.Skills.DeleteGroupConfirm")
    });
    if (!confirmed) return;
    await this._saveSkillOrganization(removeItemOrganizationGroup(organization, groupId, skills.map(item => item.id)));
}

async _suggestSkillOrganizationGroups() {
    const { skills, organization } = this._getSkillOrganizationState();
    const plan = buildItemCategoryGroupPlan(organization, skills);
    if (!plan.length) return ui.notifications.info(game.i18n.localize("GUM.Skills.NoCategories"));
    const selectedCategories = await this._promptSkillCategoryGroupPlan(plan);
    if (!selectedCategories?.length) return;
    const createId = () => foundry.utils.randomID?.() ?? crypto.randomUUID();
    await this._saveSkillOrganization(createGroupsFromItemCategories(organization, skills, createId, selectedCategories));
}

_getAbilityOrganizationState(type) {
    if (!['spell', 'power'].includes(type)) return { items: [], organization: normalizeItemOrganization() };
    const items = this.actor.items.filter(item => item.type === type);
    return {
        items,
        organization: normalizeItemOrganization(this.actor.system[`${type}_organization`], items.map(item => item.id))
    };
}

async _saveAbilityOrganization(type, organization) {
    if (!['spell', 'power'].includes(type)) return;
    const field = `${type}_organization`;
    const current = this.actor.system[field] || {};
    const withDeletions = (next, previous) => {
        const payload = { ...next };
        for (const key of Object.keys(previous || {})) if (!(key in next)) payload[`-=${key}`] = null;
        return payload;
    };
    return this.actor.update({
        [`system.${field}.groups`]: withDeletions(organization.groups, current.groups),
        [`system.${field}.groupOrder`]: organization.groupOrder,
        [`system.${field}.assignments`]: withDeletions(organization.assignments, current.assignments),
        [`system.${field}.itemOrder`]: withDeletions(organization.itemOrder, current.itemOrder)
    });
}

async _createAbilityOrganizationGroup(type) {
    const label = game.i18n.localize(type === 'spell' ? "GUM.Spells.Singular" : "GUM.Powers.Singular");
    const name = await this._promptSkillGroupName({
        title: game.i18n.format("GUM.AbilityOrganization.NewGroup", { type: label }),
        hintKey: "GUM.AbilityOrganization.GroupNameHint"
    });
    if (!name) return;
    const { items, organization } = this._getAbilityOrganizationState(type);
    const id = foundry.utils.randomID?.() ?? crypto.randomUUID();
    await this._saveAbilityOrganization(type, addItemOrganizationGroup(organization, { id, name }, items.map(item => item.id)));
}

async _renameAbilityOrganizationGroup(type, groupId) {
    const { items, organization } = this._getAbilityOrganizationState(type);
    const current = organization.groups[groupId];
    if (!current) return;
    const name = await this._promptSkillGroupName({
        title: game.i18n.localize("GUM.AbilityOrganization.RenameGroup"),
        initial: current.name,
        hintKey: "GUM.AbilityOrganization.GroupNameHint"
    });
    if (!name || name === current.name) return;
    await this._saveAbilityOrganization(type, renameItemOrganizationGroup(organization, { id: groupId, name }, items.map(item => item.id)));
}

async _deleteAbilityOrganizationGroup(type, groupId) {
    const { items, organization } = this._getAbilityOrganizationState(type);
    const group = organization.groups[groupId];
    if (!group) return;
    const confirmed = await this._confirmSkillOrganizationAction({
        title: game.i18n.localize("GUM.AbilityOrganization.DeleteGroup"),
        content: `<p>${game.i18n.format("GUM.AbilityOrganization.DeleteGroupContent", { name: foundry.utils.escapeHTML(group.name) })}</p>`,
        confirmLabel: game.i18n.localize("GUM.Skills.DeleteGroupConfirm")
    });
    if (!confirmed) return;
    await this._saveAbilityOrganization(type, removeItemOrganizationGroup(organization, groupId, items.map(item => item.id)));
}

async _suggestAbilityOrganizationGroups(type) {
    const { items, organization } = this._getAbilityOrganizationState(type);
    const plan = buildItemCategoryGroupPlan(organization, items);
    if (!plan.length) return ui.notifications.info(game.i18n.localize("GUM.AbilityOrganization.NoCategories"));
    const selectedCategories = await this._promptSkillCategoryGroupPlan(plan, {
        titleKey: "GUM.AbilityOrganization.CategoryPlanTitle",
        headingKey: "GUM.AbilityOrganization.CategoryPlanHeading",
        hintKey: "GUM.AbilityOrganization.CategoryPlanHint",
        itemCountKey: "GUM.AbilityOrganization.ItemCount"
    });
    if (!selectedCategories?.length) return;
    const createId = () => foundry.utils.randomID?.() ?? crypto.randomUUID();
    await this._saveAbilityOrganization(type, createGroupsFromItemCategories(organization, items, createId, selectedCategories));
}

_getCharacteristicOrganizationState() {
    const characteristics = this.actor.items.filter(item => ['advantage', 'disadvantage'].includes(item.type));
    return {
        characteristics,
        organization: normalizeItemOrganization(
            this.actor.system.characteristic_organization,
            characteristics.map(item => item.id)
        )
    };
}

async _saveCharacteristicOrganization(organization) {
    const current = this.actor.system.characteristic_organization || {};
    const withDeletions = (next, previous) => {
        const payload = { ...next };
        for (const key of Object.keys(previous || {})) {
            if (!(key in next)) payload[`-=${key}`] = null;
        }
        return payload;
    };
    return this.actor.update({
        "system.characteristic_organization.groups": withDeletions(organization.groups, current.groups),
        "system.characteristic_organization.groupOrder": organization.groupOrder,
        "system.characteristic_organization.assignments": withDeletions(organization.assignments, current.assignments),
        "system.characteristic_organization.itemOrder": withDeletions(organization.itemOrder, current.itemOrder)
    });
}

_promptCharacteristicGroupName({ title, initial = "" }) {
    const localize = key => game.i18n.localize(key);
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        new Dialog({
            title,
            content: `<form class="gum-popup-form gum-record-editor characteristic-group-name-dialog">
                <header class="gum-record-editor__intro form-group--full"><span class="gum-record-editor__icon"><i class="fas fa-folder-plus" aria-hidden="true"></i></span><span><strong>${foundry.utils.escapeHTML(title)}</strong><small>${localize("GUM.Characteristics.GroupNameHint")}</small></span></header>
                <div class="form-group form-group--full characteristic-group-name-field"><label>${localize("GUM.Characteristics.GroupNameLabel")}</label><input class="gum-input-left" type="text" name="name" value="${foundry.utils.escapeHTML(initial)}" autocomplete="off" autofocus></div>
            </form>`,
            buttons: {
                save: { icon: '<i class="fas fa-check"></i>', label: localize("GUM.Characteristics.Save"), callback: html => finish(String(html.find('[name="name"]').val() ?? "").trim() || null) },
                cancel: { label: localize("GUM.Characteristics.Cancel"), callback: () => finish(null) }
            },
            default: "save",
            close: () => finish(null)
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-record-edit-dialog", "characteristic-group-dialog"], width: 420, height: "auto" }).render(true);
    });
}

_characteristicSuggestionItems(characteristics) {
    return characteristics.map(item => ({
        id: item.id,
        name: item.name,
        system: { group: String(item.system?.group ?? "").trim() }
    }));
}

_promptCharacteristicGroupPlan(plan) {
    const localize = key => game.i18n.localize(key);
    const format = (key, data) => game.i18n.format(key, data);
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const rows = plan.map((category, index) => {
            const itemNames = category.items.map(item => foundry.utils.escapeHTML(item.name)).join(", ");
            const destination = category.existingGroupId ? localize("GUM.Characteristics.ExistingGroup") : localize("GUM.Characteristics.NewGroupDestination");
            return `<label class="skill-category-preview__row"><input type="checkbox" name="category" value="${index}" checked><span><strong>${foundry.utils.escapeHTML(category.name)}</strong><small>${destination} · ${format("GUM.Characteristics.ItemCount", { count: category.items.length })}</small><em>${itemNames}</em></span></label>`;
        }).join("");
        new Dialog({
            title: localize("GUM.Characteristics.CategoryPlanTitle"),
            content: `<form class="skill-category-preview characteristic-category-preview"><div class="skill-category-preview__intro"><i class="fas fa-layer-group"></i><span><strong>${localize("GUM.Characteristics.CategoryPlanHeading")}</strong><small>${localize("GUM.Characteristics.CategoryPlanHint")}</small></span></div><div class="skill-category-preview__list">${rows}</div></form>`,
            buttons: {
                apply: {
                    icon: '<i class="fas fa-layer-group"></i>',
                    label: localize("GUM.Characteristics.CreateSelected"),
                    callback: html => finish([...html[0].querySelectorAll('input[name="category"]:checked')].map(input => plan[Number(input.value)]?.key).filter(Boolean))
                },
                cancel: { label: localize("GUM.Characteristics.Cancel"), callback: () => finish(null) }
            },
            default: "apply",
            close: () => finish(null)
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "skill-category-preview-dialog", "characteristic-category-preview-dialog"], width: 520, height: "auto" }).render(true);
    });
}

async _createCharacteristicOrganizationGroup() {
    const name = await this._promptCharacteristicGroupName({ title: game.i18n.localize("GUM.Characteristics.NewGroup") });
    if (!name) return;
    const { characteristics, organization } = this._getCharacteristicOrganizationState();
    const id = foundry.utils.randomID?.() ?? crypto.randomUUID();
    await this._saveCharacteristicOrganization(addItemOrganizationGroup(organization, { id, name }, characteristics.map(item => item.id)));
}

async _renameCharacteristicOrganizationGroup(groupId) {
    const { characteristics, organization } = this._getCharacteristicOrganizationState();
    const current = organization.groups[groupId];
    if (!current) return;
    const name = await this._promptCharacteristicGroupName({ title: game.i18n.localize("GUM.Characteristics.RenameGroupDialog"), initial: current.name });
    if (!name || name === current.name) return;
    await this._saveCharacteristicOrganization(renameItemOrganizationGroup(organization, { id: groupId, name }, characteristics.map(item => item.id)));
}

async _deleteCharacteristicOrganizationGroup(groupId) {
    const { characteristics, organization } = this._getCharacteristicOrganizationState();
    const group = organization.groups[groupId];
    if (!group) return;
    const confirmed = await this._confirmSkillOrganizationAction({
        title: game.i18n.localize("GUM.Characteristics.DeleteGroupDialog"),
        content: `<p>${game.i18n.format("GUM.Characteristics.DeleteGroupContent", { name: foundry.utils.escapeHTML(group.name) })}</p>`,
        confirmLabel: game.i18n.localize("GUM.Characteristics.DeleteGroupConfirm")
    });
    if (!confirmed) return;
    await this._saveCharacteristicOrganization(removeItemOrganizationGroup(organization, groupId, characteristics.map(item => item.id)));
}

async _suggestCharacteristicOrganizationGroups() {
    const { characteristics, organization } = this._getCharacteristicOrganizationState();
    const suggestionItems = this._characteristicSuggestionItems(characteristics);
    const plan = buildItemCategoryGroupPlan(organization, suggestionItems);
    if (!plan.length) return ui.notifications.info(game.i18n.localize("GUM.Characteristics.NoCategories"));
    const selectedCategories = await this._promptCharacteristicGroupPlan(plan);
    if (!selectedCategories?.length) return;
    const createId = () => foundry.utils.randomID?.() ?? crypto.randomUUID();
    await this._saveCharacteristicOrganization(createGroupsFromItemCategories(organization, suggestionItems, createId, selectedCategories));
}

_onEditPortrait() {
    const FilePickerImpl = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    const picker = new FilePickerImpl({
        type: "image",
        current: this.actor.img,
        callback: async path => {
            if (path && path !== this.actor.img) await this.actor.update({ img: path });
        }
    });

    return picker.render(true);
}

_openPhysicalFeatsReference() {
    const t = key => game.i18n.localize(key);
    const attributes = this.actor.system.attributes || {};
    const formatNumber = value => Number(value || 0).toLocaleString(game.i18n.lang, { maximumFractionDigits: 2 });
    const movementStat = (icon, labelKey, attribute, unit = "") => `
        <div class="physical-feats-reference-stat">
            <i class="fas ${icon}" aria-hidden="true"></i>
            <span>${t(labelKey)}</span>
            <strong>${formatNumber(attribute?.final)}${unit}</strong>
        </div>`;
    const movementRows = [
        movementStat("fa-walking", "GUM.Combat.Physical.Ground", attributes.basic_move),
        Number(attributes.enhanced_move?.final) ? movementStat("fa-forward", "GUM.Combat.Physical.Enhanced", attributes.enhanced_move) : "",
        attributes.air_move?.enabled ? movementStat("fa-wind", "GUM.Combat.Physical.Air", attributes.air_move) : "",
        attributes.water_move?.enabled ? movementStat("fa-water", "GUM.Combat.Physical.Water", attributes.water_move) : "",
        attributes.burrow_move?.enabled ? movementStat("fa-mountain", "GUM.Combat.Physical.Burrow", attributes.burrow_move) : "",
        attributes.teleport_range?.enabled ? movementStat("fa-person-from-portal", "GUM.Combat.Physical.Teleport", attributes.teleport_range, " m") : ""
    ].filter(Boolean).join("");
    const liftingStrength = attributes.lifting_st?.final ?? attributes.lifting_st?.final_computed ?? 0;
    const basicLift = attributes.basic_lift?.final ?? attributes.basic_lift?.value ?? 0;
    const content = `
        <div class="physical-feats-reference-content">
            <p class="physical-feats-reference-intro">${t("GUM.PhysicalFeats.Intro")}</p>
            <section class="physical-feats-reference-section">
                <h3><i class="fas fa-route" aria-hidden="true"></i>${t("GUM.Combat.Physical.Movement")}</h3>
                <div class="physical-feats-reference-grid">${movementRows}</div>
            </section>
            <section class="physical-feats-reference-section">
                <h3><i class="fas fa-person-arrow-up-from-line" aria-hidden="true"></i>${t("GUM.Combat.Physical.Jump")}</h3>
                <div class="physical-feats-reference-jumps">
                    <div class="physical-feats-reference-jump-head"><span></span><span>${t("GUM.Combat.Physical.WithoutMomentum")}</span><span>${t("GUM.Combat.Physical.WithMomentum")}</span></div>
                    <div><span>${t("GUM.Combat.Physical.HorizontalJump")}</span><strong>${formatNumber(attributes.jump_horizontal_standing?.final)} m</strong><strong>${formatNumber(attributes.jump_horizontal_running?.final)} m</strong></div>
                    <div><span>${t("GUM.Combat.Physical.VerticalJump")}</span><strong>${formatNumber(attributes.jump_vertical_standing?.final)} m</strong><strong>${formatNumber(attributes.jump_vertical_running?.final)} m</strong></div>
                </div>
            </section>
            <section class="physical-feats-reference-section physical-feats-reference-breathing">
                <h3><i class="fas fa-lungs" aria-hidden="true"></i>${t("GUM.Combat.Physical.Breathing")}</h3>
                <div class="physical-feats-reference-breathing-grid">
                    <span><small>${t("GUM.Combat.Physical.NoExertion")}</small><strong>${formatNumber(attributes.breath_no_exertion?.final)} ${t("GUM.PhysicalFeats.SecondsAbbrev")}</strong></span>
                    <span><small>${t("GUM.Combat.Physical.MildExertion")}</small><strong>${formatNumber(attributes.breath_mild_exertion?.final)} ${t("GUM.PhysicalFeats.SecondsAbbrev")}</strong></span>
                    <span><small>${t("GUM.Combat.Physical.HeavyExertion")}</small><strong>${formatNumber(attributes.breath_heavy_exertion?.final)} ${t("GUM.PhysicalFeats.SecondsAbbrev")}</strong></span>
                </div>
            </section>
            <section class="physical-feats-reference-section physical-feats-reference-lifting">
                <h3><i class="fas fa-dumbbell" aria-hidden="true"></i>${t("GUM.Combat.Physical.Lifting")}</h3>
                <div><span>${t("GUM.Combat.Physical.LiftingST")}<strong>${formatNumber(liftingStrength)}</strong></span><span>${t("GUM.Combat.Physical.BasicLift")}<strong>${formatNumber(basicLift)} kg</strong></span></div>
            </section>
            <div class="physical-feats-reference-actions">
                <button type="button" class="physical-feats-open-lifting"><i class="fas fa-scale-balanced" aria-hidden="true"></i>${t("GUM.PhysicalLifting.OpenReference")}</button>
                <button type="button" class="physical-feats-open-throw"><i class="fas fa-bowling-ball" aria-hidden="true"></i>${t("GUM.Combat.Physical.ThrowCalculator")}</button>
            </div>
        </div>`;
    return new Dialog({
        title: t("GUM.Combat.Physical.Title"),
        content,
        render: dialogHtml => {
            dialogHtml.on("click", ".physical-feats-open-lifting", event => {
                event.preventDefault();
                this._openPhysicalLiftingReference();
            });
            dialogHtml.on("click", ".physical-feats-open-throw", event => {
                event.preventDefault();
                this._openPhysicalThrowCalculator();
            });
        },
        buttons: {
            close: { icon: '<i class="fas fa-times"></i>', label: t("GUM.PhysicalThrow.Close") }
        },
        default: "close"
    }, {
        classes: ["dialog", "gum", "physical-feats-reference-dialog", "gum-sheet-edit-dialog"],
        width: 480
    }).render(true);
}

_openPhysicalThrowCalculator() {
    const t = key => game.i18n.localize(key);
    const tf = (key, data) => game.i18n.format(key, data);
    const attributes = this.actor.system.attributes || {};
    const liftingStrength = Number(attributes.lifting_st?.final ?? attributes.lifting_st?.final_computed ?? 0);
    const strikingStrength = Number(attributes.st?.final ?? attributes.st?.final_computed ?? 0);
    const basicLiftKg = Number(attributes.basic_lift?.final ?? attributes.basic_lift?.value ?? 0);
    const thrustDamage = attributes.thrust_damage?.final ?? attributes.thrust_damage?.value ?? "";
    const formatNumber = value => Number(value || 0).toLocaleString(game.i18n.lang, { maximumFractionDigits: 2 });
    const content = `
        <form class="physical-throw-dialog-form">
            <p class="physical-throw-intro">${t("GUM.PhysicalThrow.Intro")}</p>
            <div class="physical-throw-bases">
                <span>${t("GUM.Combat.Physical.LiftingST")} <strong>${formatNumber(liftingStrength)}</strong></span>
                <span>ST <strong>${formatNumber(strikingStrength)}</strong></span>
                <span>${t("GUM.Combat.Physical.BasicLift")} <strong>${formatNumber(basicLiftKg)} kg</strong></span>
                <span>${t("GUM.Character.Sidebar.ThrustAbbrev")} <strong>${thrustDamage || "—"}</strong></span>
            </div>
            <label class="physical-throw-weight">
                <span>${t("GUM.PhysicalThrow.Weight")}</span>
                <span class="physical-throw-input"><input type="number" name="object-weight" min="0" step="0.01" autofocus><em>kg</em></span>
            </label>
            <button type="button" class="physical-throw-calculate"><i class="fas fa-calculator"></i>${t("GUM.PhysicalThrow.Calculate")}</button>
            <div class="physical-throw-result" aria-live="polite"><p>${t("GUM.PhysicalThrow.EnterWeight")}</p></div>
        </form>`;
    return new Dialog({
        title: t("GUM.PhysicalThrow.Title"),
        content,
        render: dialogHtml => {
            const refresh = () => {
                const objectWeightKg = Number(dialogHtml.find('[name="object-weight"]').val());
                const resultRoot = dialogHtml.find('.physical-throw-result');
                const result = resolveThrowingDistance({ liftingStrength, strikingStrength, basicLiftKg, objectWeightKg, thrustDamage });
                if (!result.valid) {
                    resultRoot.html(`<p class="is-warning">${t("GUM.PhysicalThrow.InvalidWeight")}</p>`);
                    return;
                }
                if (!result.throwable) {
                    resultRoot.html(`<p class="is-warning">${tf("GUM.PhysicalThrow.Unthrowable", { maximum: formatNumber(result.maximumWeightKg) })}</p>`);
                    return;
                }
                const handsLabel = t(`GUM.PhysicalThrow.Hands.${result.hands}`);
                resultRoot.html(`
                    <div class="physical-throw-result-grid">
                        <span>${t("GUM.PhysicalThrow.Ratio")}<strong>${formatNumber(result.ratio)} × BL</strong></span>
                        <span>${t("GUM.PhysicalThrow.Hands.Label")}<strong>${handsLabel}</strong></span>
                        <span class="physical-throw-range">${t("GUM.PhysicalThrow.Range")}<strong>${formatNumber(result.distanceMeters)} m</strong></span>
                        <span class="physical-throw-damage">${t("GUM.PhysicalThrow.Damage")}<strong>${result.damage?.formula || t("GUM.PhysicalThrow.DamageUnavailable")} ${result.damage?.formula ? t("GUM.PhysicalThrow.CrushingAbbrev") : ""}</strong></span>
                    </div>
                    <small>${tf("GUM.PhysicalThrow.Maximum", { maximum: formatNumber(result.maximumWeightKg) })}</small>
                    <small>${t("GUM.PhysicalThrow.DamageNote")}</small>`);
            };
            dialogHtml.on("click", ".physical-throw-calculate", refresh);
            dialogHtml.on("submit", ".physical-throw-dialog-form", submitEvent => {
                submitEvent.preventDefault();
                refresh();
            });
        },
        buttons: {
            close: { icon: '<i class="fas fa-times"></i>', label: t("GUM.PhysicalThrow.Close") }
        },
        default: "close"
    }, {
        classes: ["dialog", "gum", "physical-throw-dialog", "gum-sheet-edit-dialog"],
        width: 420
    }).render(true);
}

_openPhysicalLiftingReference() {
    const t = key => game.i18n.localize(key);
    const attributes = this.actor.system.attributes || {};
    const capacities = calculateLiftingCapacities(attributes.basic_lift?.final ?? attributes.basic_lift?.value ?? 0);
    const formatNumber = value => Number(value || 0).toLocaleString(game.i18n.lang, { maximumFractionDigits: 2 });
    const row = (labelKey, value, multiplier, noteKey) => `
        <div class="physical-lifting-rule-row">
            <span><strong>${t(labelKey)}</strong><small>${t(noteKey)}</small></span>
            <span class="physical-lifting-rule-value"><strong>${formatNumber(value)} kg</strong><small>${multiplier}</small></span>
        </div>`;
    const content = `
        <div class="physical-lifting-reference-content">
            <header class="physical-lifting-reference-header">
                <span>${t("GUM.Combat.Physical.BasicLift")}</span>
                <strong>${formatNumber(capacities.basicLiftKg)} kg</strong>
            </header>
            <div class="physical-lifting-rule-list">
                ${row("GUM.PhysicalLifting.OneHanded", capacities.oneHandedKg, "2×", "GUM.PhysicalLifting.OneHandedNote")}
                ${row("GUM.PhysicalLifting.TwoHanded", capacities.twoHandedKg, "8×", "GUM.PhysicalLifting.TwoHandedNote")}
                ${row("GUM.PhysicalLifting.ExtraHeavy", capacities.extraHeavyKg, "10×", "GUM.PhysicalLifting.ExtraHeavyNote")}
                ${row("GUM.PhysicalLifting.CarryOnBack", capacities.carryOnBackKg, "15×", "GUM.PhysicalLifting.CarryOnBackNote")}
                ${row("GUM.PhysicalLifting.Shove", capacities.shoveKg, "12× / 24×", "GUM.PhysicalLifting.ShoveNote")}
                ${row("GUM.PhysicalLifting.ShiftSlightly", capacities.shiftSlightlyKg, "50×", "GUM.PhysicalLifting.ShiftSlightlyNote")}
            </div>
            <p class="physical-lifting-reference-note"><i class="fas fa-circle-info" aria-hidden="true"></i>${t("GUM.PhysicalLifting.NoAutomationNote")}</p>
        </div>`;
    return new Dialog({
        title: t("GUM.PhysicalLifting.Title"),
        content,
        buttons: {
            close: { icon: '<i class="fas fa-times"></i>', label: t("GUM.PhysicalThrow.Close") }
        },
        default: "close"
    }, {
        classes: ["dialog", "gum", "physical-lifting-dialog", "gum-sheet-edit-dialog"],
        width: 440
    }).render(true);
}

activateListeners(html) {
    super.activateListeners(html);
    html.on("click", ".combat-view-tab", (ev) => {
        ev.preventDefault();
        const view = ev.currentTarget.dataset.combatView;
        if (!['actions', 'favorites'].includes(view)) return;

        this._combatActionView = view;
        const switcher = $(ev.currentTarget).closest('.combat-view-switcher');
        switcher.find('.combat-view-tab')
            .removeClass('is-active')
            .attr('aria-selected', 'false');
        $(ev.currentTarget)
            .addClass('is-active')
            .attr('aria-selected', 'true');
        html.find('.combat-action-panel').each((_index, panel) => {
            panel.hidden = panel.dataset.combatPanel !== view;
        });
    });
    html.on("click", ".combat-filter-chip", (ev) => {
        ev.preventDefault();
        const chip = ev.currentTarget;
        const scope = chip.dataset.filterScope;
        const value = String(chip.dataset.filterValue || "");
        const filters = scope === "actions"
            ? this._combatAttackFilters
            : scope === "control"
                ? this._combatControlFilters
                : null;
        if (!filters || !value) return;

        if (value === "all") filters.clear();
        else {
            if (filters.size === 0) filters.add(value);
            else if (filters.has(value)) filters.delete(value);
            else filters.add(value);
        }

        const filterBar = $(chip).closest('.combat-filter-list');
        filterBar.find('.combat-filter-chip').each((_index, button) => {
            const buttonValue = String(button.dataset.filterValue || "");
            const active = buttonValue === "all" ? filters.size === 0 : filters.has(buttonValue);
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        if (scope === "actions") {
            html.find('[data-combat-filter-group]').each((_index, group) => {
                group.hidden = filters.size > 0 && !filters.has(String(group.dataset.combatFilterGroup));
            });
        } else if (scope === "control") {
            html.find('[data-combat-control-group]').each((_index, group) => {
                group.hidden = filters.size > 0 && !filters.has(String(group.dataset.combatControlGroup));
            });
        }
    });
    html.on("click", ".physical-feats-reference-btn", ev => {
        ev.preventDefault();
        this._openPhysicalFeatsReference();
    });
    html.on("click", ".physical-throw-calculator", ev => {
        ev.preventDefault();
        this._openPhysicalThrowCalculator();
    });
    html.on("click", ".physical-lifting-reference", ev => {
        ev.preventDefault();
        this._openPhysicalLiftingReference();
    });
    if (!this.isEditable) return;

    html.on('click keydown', '[data-action="edit-portrait"]', (ev) => {
    if (ev.type === "keydown" && !["Enter", " "].includes(ev.key)) return;
    ev.preventDefault();
    this._onEditPortrait();
    });

html.on('click', '.recalc-secondary-stats-btn', (ev) => this._onRecalculateSecondaryStats(ev));
html.on('click', '.points-summary-btn', (ev) => this._onOpenPointsSummary(ev));
html.on("click", ".add-character-model-btn", (ev) => this._onAddCharacterModel(ev));
html.on("click", ".remove-character-model-btn", (ev) => this._onRemoveCharacterModel(ev));

// -------------------------------------------------------------
//  BIOGRAFIA - Editor de História
// -------------------------------------------------------------
html.on("click", ".edit-biography-details", (ev) => {
  ev.preventDefault();
  const details = this.actor.system.details || {};

  const content = `
    <form class="secondary-stats-editor biography-details-editor">
      <p class="hint">Atualize os dados do perfil do personagem.</p>
      <div class="form-header-grid">
        <span>Campo</span>
        <span>Valor</span>
      </div>
      <div class="form-row">
        <label>Gênero</label>
        <input type="text" name="details.gender" value="${details.gender ?? ""}" />
      </div>
      <div class="form-row">
        <label>Idade</label>
        <input type="text" name="details.age" value="${details.age ?? ""}" />
      </div>
      <div class="form-row">
        <label>Altura</label>
        <input type="text" name="details.height" value="${details.height ?? ""}" />
      </div>
      <div class="form-row">
        <label>Peso</label>
        <input type="text" name="details.weight" value="${details.weight ?? ""}" />
      </div>
      <div class="form-row">
        <label>Pele</label>
        <input type="text" name="details.skin" value="${details.skin ?? ""}" />
      </div>
      <div class="form-row">
        <label>Cabelos</label>
        <input type="text" name="details.hair" value="${details.hair ?? ""}" />
      </div>
      <div class="form-row">
        <label>Olhos</label>
        <input type="text" name="details.eyes" value="${details.eyes ?? ""}" />
      </div>
      <div class="form-row">
        <label>Alinhamento</label>
        <input type="text" name="details.alignment" value="${details.alignment ?? ""}" />
      </div>
      <div class="form-row">
        <label>Crença / Fé</label>
        <input type="text" name="details.belief" value="${details.belief ?? ""}" />
      </div>
    </form>
    <style>
      .biography-details-editor .form-header-grid,
      .biography-details-editor .form-row {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 8px;
        align-items: center;
        margin-bottom: 6px;
      }
      .biography-details-editor label {
        text-align: left;
        font-weight: bold;
      }
      .biography-details-editor input {
        width: 100%;
      }
    </style>
  `;

  new Dialog({
    title: "Editar Perfil",
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Salvar",
        callback: (html) => {
          const form = html.find("form")[0];
          const formData = new FormDataExtended(form).object;
          const updateData = {};
          const fields = [
            "gender",
            "age",
            "height",
            "weight",
            "skin",
            "hair",
            "eyes",
            "alignment",
            "belief"
          ];
          fields.forEach((field) => {
            updateData[`system.details.${field}`] = formData[`details.${field}`] ?? "";
          });
          this.actor.update(updateData);
        }
      }
    },
    default: "save"
}, { classes: ["dialog", "gum", "secondary-stats-dialog", "gum-sheet-edit-dialog"] }).render(true);
});

html.find(".biography-story .toggle-editor").on("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  const trigger = $(ev.currentTarget);
  const story = trigger.closest(".biography-story");
  const section = story.find(".description-section").first();
  if (!section.length) return;
  const field = $(ev.currentTarget).data("field") ?? $(ev.currentTarget).data("target");
  const editorWrapper = section.find(".description-editor");
  section.find(".description-view, .toggle-editor").hide();
  trigger.hide();
  editorWrapper.show();
  const editor = this._getEditorInstance(field);
  if (editor?.focus) {
    setTimeout(() => editor.focus(), 0);
  } else if (editor?.view?.focus) {
    setTimeout(() => editor.view.focus(), 0);
  }
});

html.find(".biography-story .cancel-description").on("click", ev => {
  const section = $(ev.currentTarget).closest(".description-section");
  const story = $(ev.currentTarget).closest(".biography-story");
  section.find(".description-editor").hide();
  section.find(".description-view, .toggle-editor").show();
  story.find(".biography-story-toggle").show();
});

html.find(".biography-story .expand-description").on("click", ev => {
  const btn = $(ev.currentTarget);
  const section = btn.closest(".description-section");
  const editorWrapper = section.find(".description-editor");
  editorWrapper.toggleClass("expanded");
  const expanded = editorWrapper.hasClass("expanded");
  const expandedHeight = expanded ? "600px" : "300px";
  editorWrapper.find(".editor, .editor-content, .ProseMirror").css({
    minHeight: expandedHeight,
    height: expanded ? expandedHeight : ""
  });
  btn.attr("data-expanded", expanded ? "true" : "false");
  btn.html(expanded
    ? '<i class="fas fa-compress"></i> Reduzir'
    : '<i class="fas fa-expand"></i> Expandir');
});

html.find(".biography-story .save-description").on("click", async ev => {
  ev.preventDefault();
  const btn = $(ev.currentTarget);
  const section = btn.closest(".description-section");
  const field = btn.data("field") ?? btn.data("target");
  const content = await this._getEditorContent(field, section);
  if (content === null || content === undefined) return;
  await this.actor.update({ [field]: content });

  const enriched = await TextEditorImpl.enrichHTML(content || "", { async: true, secrets: this.actor.isOwner });
  const story = btn.closest(".biography-story");
  section.find(".description-view").html(enriched);
  section.find(".description-editor").hide();
  section.find(".description-view, .toggle-editor").show();
  story.find(".biography-story-toggle").show();
});

// -------------------------------------------------------------
//  MODIFICADORES (ABA DO PERSONAGEM) - Botões da Toolbar
// -------------------------------------------------------------
html.on("click", ".import-modifiers-btn", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  if (typeof this._importModifiersFromCompendium !== "function") {
    return ui.notifications.error("Função de importação não encontrada no GurpsActorSheet.");
  }
  await this._importModifiersFromCompendium();
  this.render(false);
});

html.on("click", ".clear-modifiers-btn", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();

  const toDelete = this.actor.items.filter(i => i.type === "gm_modifier");
  if (!toDelete.length) return ui.notifications.info("Nenhum modificador para limpar.");

  Dialog.confirm({
    title: "Limpar Modificadores",
    content: `<p>Isso vai apagar <b>${toDelete.length}</b> modificadores desta ficha. Continuar?</p>`,
    yes: async () => {
      await this.actor.deleteEmbeddedDocuments("Item", toDelete.map(i => i.id));
      this.render(false);
    },
    no: () => {}
  });
});

html.on("click", ".reset-modifiers-btn", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();

  const toDelete = this.actor.items.filter(i => i.type === "gm_modifier");

  Dialog.confirm({
    title: "Resetar Modificadores",
    content: `<p>Isso vai limpar os modificadores atuais e reimportar do compêndio. Continuar?</p>`,
    yes: async () => {
      if (toDelete.length) {
        await this.actor.deleteEmbeddedDocuments("Item", toDelete.map(i => i.id));
      }
      if (typeof this._importModifiersFromCompendium !== "function") {
        ui.notifications.error("Função de importação não encontrada no GurpsActorSheet.");
        return;
      }
      await this._importModifiersFromCompendium();
      this.render(false);
    },
    no: () => {}
  });
});

// Ler Compêndio (toggle)
html.find(".toggle-default-mods").on("change", async (ev) => {
  const checked = ev.currentTarget.checked;
  await this.actor.setFlag("gum", "useDefaultModifiers", checked);
  this.render(false);
});

this._tabSearchState ??= { spells: "", powers: "", modifiers: "" };

const applyModifierSearch = (rawTerm = "") => {
  const term = String(rawTerm).toLowerCase().trim();
  this._tabSearchState.modifiers = String(rawTerm);

  html.find(".mod-mini-card").each((_, el) => {
    const card = $(el);
    const name = card.find(".mod-name").text().toLowerCase();
    const match = !term || name.includes(term);
    card.attr("data-search-match", match ? "1" : "0");
    card.toggle(match);
  });

  html.find(".subgroup-details").each((_, el) => {
    const subgroup = $(el);
    const matchedCards = subgroup.find('.mod-mini-card[data-search-match="1"]').length;
    subgroup.toggle(matchedCards > 0);
  });

  html.find(".context-wrapper").each((_, el) => {
    const contextWrapper = $(el);
    const matchedCards = contextWrapper.find('.mod-mini-card[data-search-match="1"]').length;
    contextWrapper.toggle(matchedCards > 0);
  });
};

// Busca de modificadores
html.find(".modifier-search").on("input", (ev) => {
  applyModifierSearch(ev.currentTarget.value || "");
});

const applyGroupedItemSearch = (tab, term, extraTextSelector) => {
  tab.find('.spell-row-v3, .magic-card').each((_, el) => {
    const row = $(el);
    const name = row.find('.spell-name, .magic-card__name').first().text().toLowerCase();
    const extra = row.find(extraTextSelector).first().text().toLowerCase();
    const match = !term || name.includes(term) || extra.includes(term);

    row.attr('data-search-match', match ? '1' : '0');
    row.toggle(match);
  });

  tab.find('.spell-group-box, .magic-group').each((_, el) => {
    const group = $(el);
    const matchedItems = group.find('.spell-row-v3[data-search-match="1"], .magic-card[data-search-match="1"]').length;
    group.toggle(matchedItems > 0);
  });
};

// Busca de magias
html.find(".spell-search-input").on("input", (ev) => {
  const rawTerm = String(ev.currentTarget.value || "");
  const term = rawTerm.toLowerCase().trim();
  this._tabSearchState.spells = rawTerm;
  const tab = $(ev.currentTarget).closest('.tab[data-tab="spells"]');
  applyGroupedItemSearch(tab, term, '.magic-card__identity-meta');
  tab.find('.magic-search-empty').prop('hidden', tab.find('.magic-card[data-search-match="1"]').length > 0 || !term);
});

html.on('click', '.magic-card__expand', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  const button = ev.currentTarget;
  const card = button.closest('.magic-card');
  if (!card) return;

  const itemId = card.dataset.itemId;
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  const isPower = card.classList.contains('power-card');
  const localizationRoot = isPower ? 'GUM.Powers' : 'GUM.Spells';
  const label = game.i18n.localize(`${localizationRoot}.${expanded ? 'CollapseDetails' : 'ExpandDetails'}`);

  card.classList.toggle('is-expanded', expanded);
  card.querySelector('.magic-card__details')?.toggleAttribute('hidden', !expanded);
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.querySelector('i')?.classList.toggle('fa-expand-arrows-alt', !expanded);
  button.querySelector('i')?.classList.toggle('fa-compress-arrows-alt', expanded);

  const expandedCards = isPower
    ? (this._expandedPowerCards ??= new Set())
    : (this._expandedSpellCards ??= new Set());
  if (expanded) expandedCards.add(itemId);
  else expandedCards.delete(itemId);
});

// Busca de poderes
html.find(".power-search-input").on("input", (ev) => {
  const rawTerm = String(ev.currentTarget.value || "");
  const term = rawTerm.toLowerCase().trim();
  this._tabSearchState.powers = rawTerm;
  const tab = $(ev.currentTarget).closest('.tab[data-tab="powers"]');
  applyGroupedItemSearch(tab, term, '.magic-card__identity');
  tab.find('.power-search-empty').prop('hidden', tab.find('.power-card[data-search-match="1"]').length > 0 || !term);
});

const spellSearchInput = html.find('.spell-search-input');
if (spellSearchInput.length) {
  spellSearchInput.val(this._tabSearchState.spells || '');
  spellSearchInput.trigger('input');
}

const powerSearchInput = html.find('.power-search-input');
if (powerSearchInput.length) {
  powerSearchInput.val(this._tabSearchState.powers || '');
  powerSearchInput.trigger('input');
}

const modifierSearchInput = html.find('.modifier-search');
if (modifierSearchInput.length) {
  modifierSearchInput.val(this._tabSearchState.modifiers || '');
  applyModifierSearch(this._tabSearchState.modifiers || '');
}


// -------------------------------------------------------------
//  REGISTROS DE COMBATE
// -------------------------------------------------------------
html.on("click", ".add-combat-meter", (ev) => this._onAddCombatMeter(ev));
html.on("click", ".edit-combat-meter", (ev) => this._onEditCombatMeter(ev));
html.on("click", ".delete-combat-meter", (ev) => this._onDeleteCombatMeter(ev));
html.on("click", ".adjust-combat-meter", (ev) => this._onAdjustCombatMeter(ev));
html.on("click", ".add-wound", (ev) => this._onEditWound(ev));
html.on("click", ".edit-wound", (ev) => this._onEditWound(ev));
html.on("click", ".delete-wound", (ev) => this._onDeleteWound(ev));
html.on("click", ".adjust-wound", (ev) => this._onAdjustWound(ev));
this._setupActionMenuListeners(html);;

// -------------------------------------------------------------
//  RESERVAS DE ENERGIA (MAGIA / PODER)
// -------------------------------------------------------------
html.on("click", ".add-energy-reserve", (ev) => this._onAddEnergyReserve(ev));
html.on("click", ".edit-energy-reserve", (ev) => this._onEditEnergyReserve(ev));
html.on("click", ".delete-energy-reserve", (ev) => this._onDeleteEnergyReserve(ev));
html.on("click", ".adjust-energy-reserve", (ev) => this._onAdjustEnergyReserve(ev));

// -------------------------------------------------------------
//  HABILIDADES DE CONJURAÇÃO
// -------------------------------------------------------------
html.on("click", ".add-casting-ability", (ev) => this._onAddCastingAbility(ev));
html.on("click", ".edit-casting-ability", (ev) => this._onEditCastingAbility(ev));
html.on("click", ".delete-casting-ability", (ev) => this._onDeleteCastingAbility(ev));
html.on("click", ".view-casting-ability", (ev) => this._onViewCastingAbility(ev));
html.on("click", ".add-power-source", (ev) => this._onAddPowerSource(ev));
html.on("click", ".edit-power-source", (ev) => this._onEditPowerSource(ev));
html.on("click", ".view-power-source", (ev) => this._onViewPowerSource(ev));
html.on("click", ".delete-power-source", (ev) => this._onDeletePowerSource(ev));
html.on("click", ".create-primary-item", (ev) => this._onCreatePrimaryItem(ev));
html.on("click", ".money-source-create", (ev) => this._onCreateMoneySource(ev));

// -------------------------------------------------------------
//  ASPECTOS SOCIAIS
// -------------------------------------------------------------
html.on("click", ".add-social-entry", (ev) => this._onAddSocialEntry(ev));
html.on("click", ".edit-social-entry", (ev) => this._onEditSocialEntry(ev));
html.on("click", ".delete-social-entry", (ev) => this._onDeleteSocialEntry(ev));
html.on("click", ".edit-social-source", (ev) => this._onEditSocialSource(ev));
html.on("click", ".add-social-aspect", (ev) => this._onChooseSocialCategory(ev));
html.on("click", ".social-card__expand", (ev) => this._onToggleSocialEntryDescription(ev));

// -------------------------------------------------------------
//  EDITAR ITEM (ABRIR ITEM SHEET)
// -------------------------------------------------------------
html.on('click', '.item-edit, .item-control.item-edit', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation(); // garante que não acione o acordeão

  const el = $(ev.currentTarget);

  // Pega o itemId do container padrão (.item / .item-row) OU do próprio botão
  const itemId =
    el.closest('.item, .item-row').data('itemId') ??
    el.closest('[data-item-id]').data('itemId') ??
    el.data('itemId') ??
    ev.currentTarget.dataset.itemId;

  if (!itemId) return;

  const item = this.actor.items.get(itemId);
  if (!item) return;

  item.sheet.render(true);
});

// -------------------------------------------------------------
// 0. BLOQUEIA O "TOGGLE" NATIVO DO <summary> QUANDO CLICAR EM CONTROLES
// (garante que botões/links dentro do cabeçalho funcionem sem abrir/fechar o details)
// -------------------------------------------------------------
html.on('click', 'details > summary a, details > summary button, details > summary .item-control, details > summary .rollable', (ev) => {
    // Não queremos navegação nem o toggle automático do summary
    ev.preventDefault();
    // Não precisa stopImmediatePropagation: queremos que outros listeners (rolagens, edit, delete) executem
    ev.stopPropagation();
});

// -------------------------------------------------------------
// 0.1. BOTÕES ESPECÍFICOS DO COMBATE (fora de <summary>, mas por segurança)
// -------------------------------------------------------------
html.on('click', '.edit-basic-damage', this._onEditBasicDamage.bind(this));
html.on('click', '.view-hit-locations', this._onViewHitLocations.bind(this));
html.on('click', '.attack-group-details .group-summary .item-edit', this._onEditAttackGroupItem.bind(this));
html.on('click', '.dr-group-toggle', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const groupRow = ev.currentTarget.closest('.dr-group');
    if (!groupRow) return;
    groupRow.classList.toggle('is-expanded');
});


    // -------------------------------------------------------------
    // 1. PERSISTÊNCIA DOS DETALHES (ACORDEÃO - VISUAL)
    // -------------------------------------------------------------
    html.find('.gum-details').on('toggle', async (ev) => {
        const details = ev.currentTarget;
        const section = details.dataset.section; 
        const isOpen = details.open;
        if (section) {
            await this.actor.setFlag('gum', `sheet_settings.${section}_closed`, !isOpen);
        }
    });

 html.find('details[data-group-id]').on('toggle', this._onDetailsToggle.bind(this));

    // Controles dos grupos de efeitos de estado são anexados a qualquer card de item.
    const stateEffectModeLabels = {
        manual: 'controle manual',
        equipped_manual: 'controle manual enquanto equipado',
        equipped: 'automático enquanto equipado',
        carried: 'automático enquanto carregado',
        present: 'automático enquanto presente'
    };

    const buildStateEffectSwitch = (groupId, group, { expanded = false } = {}) => {
        const mode = group.mode || 'manual';
        const manual = mode === 'manual' || mode === 'equipped_manual';
        const equipped = group._itemSystem.equipped === true || group._itemSystem.location === 'equipped';
        const carried = equipped || (group._itemSystem.location === 'carried' && group._itemSystem.stored !== true);
        const desired = mode === 'present'
            || (mode === 'equipped' && equipped)
            || (mode === 'carried' && carried)
            || (mode === 'equipped_manual' && equipped && group.active === true)
            || (mode === 'manual' && group.active === true);
        const active = desired && Boolean(group.activationId);
        const name = group.name || 'Grupo de efeitos';
        const modeLabel = stateEffectModeLabels[mode] || stateEffectModeLabels.manual;
        const title = `${name} — ${active ? 'ativo' : 'inativo'} (${modeLabel})`;
        const button = $('<button type="button" class="state-effect-switch item-toggle-state-effect-group"></button>')
            .attr('data-group-id', groupId)
            .attr('title', title)
            .attr('aria-label', title)
            .attr('aria-checked', String(active))
            .attr('role', 'switch')
            .toggleClass('is-active', active)
            .toggleClass('is-automatic', !manual)
            .prop('disabled', !manual)
            .append('<span class="state-effect-switch__track" aria-hidden="true"><span class="state-effect-switch__thumb"></span></span>');

        if (!expanded) return button;

        const entry = $('<div class="state-effect-automation__entry"></div>');
        const text = $('<span class="state-effect-automation__text"></span>')
            .append($('<strong></strong>').text(name))
            .append($('<small></small>').text(`${active ? 'Ativo' : 'Inativo'} · ${modeLabel}`));
        if (!manual) text.prepend('<i class="fas fa-gear state-effect-automation__mode" aria-hidden="true"></i>');
        return entry.append(text, button);
    };

    html.find('.item[data-item-id]').each((_, element) => {
        const row = $(element);
        const item = this.actor.items.get(row.data('itemId'));
        const controls = row.find('.item-controls').first();
        if (!item || !controls.length) return;
        const groups = Object.entries(item.system.stateEffectGroups || {})
            .map(([groupId, group]) => [groupId, { ...group, _itemSystem: item.system }]);
        if (!groups.length) return;

        const cluster = $('<div class="state-effect-automation"></div>');
        if (groups.length <= 2) {
            const switches = $('<div class="state-effect-automation__switches"></div>');
            groups.forEach(([groupId, group]) => switches.append(buildStateEffectSwitch(groupId, group)));
            cluster.append(switches);
        } else {
            const activeCount = groups.filter(([, group]) => Boolean(group.activationId)).length;
            const triggerLabel = `Automações: ${activeCount} de ${groups.length} ativas`;
            const trigger = $('<button type="button" class="state-effect-automation__trigger"></button>')
                .attr('title', triggerLabel)
                .attr('aria-label', triggerLabel)
                .attr('aria-expanded', 'false')
                .append('<i class="fas fa-sliders" aria-hidden="true"></i>')
                .append($('<span></span>').text(`${activeCount}/${groups.length}`));
            const panel = $('<div class="state-effect-automation__panel" hidden></div>')
                .attr('aria-label', 'Automações do item');
            groups.forEach(([groupId, group]) => panel.append(buildStateEffectSwitch(groupId, group, { expanded: true })));
            cluster.append(trigger, panel);
        }
        controls.prepend(cluster);
    });

    html.on('click', '.state-effect-automation__trigger', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const trigger = $(ev.currentTarget);
        const cluster = trigger.closest('.state-effect-automation');
        const willOpen = !cluster.hasClass('is-open');
        html.find('.state-effect-automation.is-open').not(cluster).removeClass('is-open')
            .find('.state-effect-automation__trigger').attr('aria-expanded', 'false').end()
            .find('.state-effect-automation__panel').prop('hidden', true);
        cluster.toggleClass('is-open', willOpen);
        trigger.attr('aria-expanded', String(willOpen));
        cluster.find('.state-effect-automation__panel').prop('hidden', !willOpen);
    });

    html.find('.item-toggle-state-effect-group').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = $(ev.currentTarget).closest('.item');
        const item = this.actor.items.get(row.data('itemId'));
        const groupId = $(ev.currentTarget).data('groupId');
        const group = item?.system.stateEffectGroups?.[groupId];
        if (!item || !group || !["manual", "equipped_manual"].includes(group.mode || "manual")) return;
        await game.gum.setStateEffectGroupActive(item, groupId, group.active !== true);
    });


    // -------------------------------------------------------------
    // 2. MOVER EQUIPAMENTO (Botão Camiseta: Equipar / Desequipar)
    // -------------------------------------------------------------
    html.find('.item-toggle-equip').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        
        const btn = $(ev.currentTarget);
        // Garante que pegamos o ID independente de onde foi o clique (ícone ou link)
        const li = btn.closest(".item"); 
        const itemId = li.data("itemId"); 
        const item = this.actor.items.get(itemId);
        
        if (!item) {
            console.warn("GUM | Item não encontrado para equipar.");
            return;
        }

        // Verifica o estado atual
        const isCurrentlyEquipped = item.system.equipped === true;
        
        // Define o novo estado (Inverte o atual)
        const newState = !isCurrentlyEquipped;

        // ATUALIZAÇÃO HÍBRIDA (Sincroniza Antigo e Novo sistema)
        await item.update({
            // 1. Sistema Booleano (Para as listas visuais do HBS funcionarem)
            "system.equipped": newState,
            "system.stored": false, // Se mexeu nisso, certeza que não está guardado

            // 2. Sistema de String (Para o main.js calcular peso e lógica futura)
            "system.location": newState ? "equipped" : "carried" 
        });
        await game.gum.syncItemStateEffects(item);

        // Feedback visual opcional
        if (newState) ui.notifications.info(`${item.name} equipado.`);
        else ui.notifications.info(`${item.name} movido para a mochila.`);

        if (item.system?.is_container) {
            const descendants = this._getContainerDescendants(item.id);
            const childLocation = newState ? "equipped" : "carried";
            if (descendants.length) {
                await this.actor.updateEmbeddedDocuments("Item", descendants.map(child => ({
                    _id: child.id,
                    "system.location": childLocation,
                    "system.equipped": newState,
                    "system.stored": false
                })));
            }
        }
    });

    // -------------------------------------------------------------
    // 3. MOVER EQUIPAMENTO (Botão Caixa: Guardar / Sacar)
    // -------------------------------------------------------------
    html.find('.item-toggle-stored').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        
        const btn = $(ev.currentTarget);
        const li = btn.closest(".item");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);

        if (!item) return;

        // Verifica o estado atual
        const isCurrentlyStored = item.system.stored === true;
        
        // Define o novo estado
        const newState = !isCurrentlyStored;

        await item.update({
            // 1. Sistema Booleano
            "system.stored": newState,
            "system.equipped": false, // Se mexeu nisso, certeza que não está vestido

            // 2. Sistema de String
            "system.location": newState ? "stored" : "carried"
        });     
        await game.gum.syncItemStateEffects(item);

 if (newState) ui.notifications.info(`${item.name} guardado no baú.`);
        else ui.notifications.info(`${item.name} sacado para a mochila.`);

        if (item.system?.is_container) {
            const descendants = this._getContainerDescendants(item.id);
            const childLocation = newState ? "stored" : "carried";
            if (descendants.length) {
                await this.actor.updateEmbeddedDocuments("Item", descendants.map(child => ({
                    _id: child.id,
                    "system.location": childLocation,
                    "system.equipped": false,
                    "system.stored": newState
                })));
            }
        }
 });

    html.find('.item-consume-use').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();

        const li = $(ev.currentTarget).closest(".item");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        if (!item) return;

        const resolution = item.system?.equipmentResolution || resolveEquipment(item._source?.system || item.system);
        const consumption = buildEquipmentConsumptionUpdate(item.system, resolution);
        if (!consumption.consumed) {
            const message = consumption.reason === "empty_charges"
                ? `"${item.name}" não possui cargas restantes.`
                : `"${item.name}" não possui quantidade suficiente para consumir.`;
            ui.notifications.warn(message);
            return;
        }
        await item.update(consumption.updates);

        try {
            if (game?.gum?.applyUseEventEffects) {
                await game.gum.applyUseEventEffects(item, this.actor, "consume");
            }
        } catch (err) {
            console.error("GUM | Falha ao aplicar Evento de Uso (consume):", err);
        }

        const nextQuantity = consumption.updates["system.quantity"] ?? item.system.quantity;
        const nextSpent = consumption.updates["system.current_uses"] ?? consumption.uses.spent;
        const message = consumption.mode === "charges"
            ? `${item.name} usado. Cargas restantes: ${Math.max(0, consumption.uses.max - nextSpent)}${consumption.exhausted ? " (esgotado)" : ""}.`
            : `${item.name} consumido. Quantidade restante: ${nextQuantity}.`;
        ui.notifications.info(message);
    });


    html.find('.item-move-to-container').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();

        const li = $(ev.currentTarget).closest(".item");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        if (!item) return;

        const containers = this.actor.items.filter(i =>
            i.id !== item.id &&
            i.type === "equipment" &&
            i.system?.is_container === true
        );

        if (!containers.length) {
            ui.notifications.warn("Nenhum container disponível no personagem.");
            return;
        }

        const options = containers.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const content = `
            <div class="form-group">
                <label>Selecione o container</label>
                <select id="gum-container-target">${options}</select>
            </div>
        `;

        Dialog.confirm({
            title: `Mover "${item.name}" para container`,
            content,
  yes: async (dlgHtml) => {
                const selected = dlgHtml.find("#gum-container-target").val();
                if (!selected) return;
                const containerItem = this.actor.items.get(selected);
                if (!containerItem) return;

                const targetLocation = containerItem.system?.stored
                    ? "stored"
                    : containerItem.system?.equipped
                        ? "equipped"
                        : "carried";

                await item.update({
                    "system.parent_container_id": selected,
                    "system.location": targetLocation,
                    "system.equipped": targetLocation === "equipped",
                    "system.stored": targetLocation === "stored"
                });

                if (item.system?.is_container) {
                    const descendants = this._getContainerDescendants(item.id);
                    if (descendants.length) {
                        await this.actor.updateEmbeddedDocuments("Item", descendants.map(child => ({
                            _id: child.id,
                            "system.location": targetLocation,
                            "system.equipped": targetLocation === "equipped",
                            "system.stored": targetLocation === "stored"
                        })));
                    }
                }

                ui.notifications.info(`${item.name} movido para ${containerItem?.name || "container"}.`);
            }
        });
    });


    html.find('.item-remove-from-container').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const li = $(ev.currentTarget).closest(".item");
        const itemId = li.data("itemId");
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.parent_container_id": "" });
        ui.notifications.info(`${item.name} removido do container.`);
    });

    html.find('.item-toggle-container-children').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const li = $(ev.currentTarget).closest(".item");
        const itemId = li.data("itemId");
        if (!itemId) return;
        const current = this.actor.getFlag("gum", "collapsed_containers") || {};
        const nextState = !current[itemId];
        await this.actor.setFlag("gum", "collapsed_containers", {
            ...current,
            [itemId]: nextState
        });
    });


    // -------------------------------------------------------------
    // 4. DELETAR ITEM (COM CONFIRMAÇÃO)
    // -------------------------------------------------------------
    html.find('.item-delete').click(ev => {
    ev.preventDefault();
    ev.stopPropagation(); // Garante que não feche o bloco ao clicar no lixo

    const container = $(ev.currentTarget).closest(".item, [data-item-id]");
    const itemId = container.data("itemId") ?? ev.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const descendants = item.system?.is_container ? this._getContainerDescendants(item.id) : [];
    const totalToDelete = 1 + descendants.length;
    const confirmText = descendants.length
      ? `<p>Tem certeza que deseja excluir este item permanentemente?</p><p><strong>${descendants.length}</strong> item(ns) dentro deste container também será(ão) excluído(s).</p>`
      : `<p>Tem certeza que deseja excluir este item permanentemente?</p>`;

    // Cria a janela de diálogo para confirmação
    Dialog.confirm({
        title: `Excluir ${item.name}?`,
        content: confirmText,
        yes: async () => {
            const idsToDelete = [item.id, ...descendants.map(child => child.id)];
            await this.actor.deleteEmbeddedDocuments("Item", idsToDelete);
            ui.notifications.info(`${totalToDelete} item(ns) removido(s) da ficha.`);
        },
        no: () => {}, // Não faz nada se cancelar
        defaultYes: false
    });
});

// -------------------------------------------------------------
//  CONDIÇÕES PASSIVAS (OVERRIDE MANUAL)
// -------------------------------------------------------------
html.on('change', '.manual-override-toggle', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const itemId = ev.currentTarget.dataset.itemId;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const isDisabled = ev.currentTarget.checked;
    await item.update({ 'flags.gum.manual_override': isDisabled }, { render: false });

    const pill = html.find(`.effect-pill-enhanced[data-item-id="${itemId}"]`);
    const statusTag = pill.find('.pill-tag.status');
    if (statusTag.length) {
        statusTag.toggleClass('off', isDisabled);
        statusTag.toggleClass('on', !isDisabled);
        statusTag.text(game.i18n.localize(isDisabled ? 'GUM.Conditions.Disabled' : 'GUM.Conditions.Automatic'));
 }
});

// -------------------------------------------------------------
//  EFEITOS TEMPORÁRIOS / PERMANENTES (ATIVAR/DESATIVAR)
// -------------------------------------------------------------
html.on('change', '.effect-toggle', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const effectId = ev.currentTarget.dataset.effectId;
    if (!effectId) return;

    const effect = this.actor.effects.get(effectId);
    if (!effect) return;

    const isDisabled = ev.currentTarget.checked;
    const updateData = {
        disabled: isDisabled,
        "flags.gum.manualDisabled": isDisabled
    };

    if (!isDisabled) {
        updateData["flags.gum.duration.pendingCombat"] = false;
        updateData["flags.gum.duration.pendingStart"] = false;
    }

    await effect.update(updateData, { render: false });

    const pill = html.find(`.effect-pill-enhanced[data-effect-id="${effectId}"]`);
    const statusTag = pill.find('.pill-tag.status');
    if (statusTag.length) {
        statusTag.toggleClass('off', isDisabled);
        statusTag.toggleClass('on', !isDisabled);
        statusTag.text(game.i18n.localize(isDisabled ? 'GUM.Conditions.Disabled' : 'GUM.Conditions.Active'));
    }

    this.actor.sheet.render(false);
    this.actor.getActiveTokens().forEach(token => token.drawEffects());
});

// -------------------------------------------------------------
//  CONDIÇÕES PASSIVAS (EVITA TOGGLE DO <details>)
// -------------------------------------------------------------
html.on('click', '.passive-section .effects-grid-container', (ev) => {
    ev.stopPropagation();
});

html.on('click', '.temporary-section .effects-grid-container, .permanent-section .effects-grid-container', (ev) => {
    ev.stopPropagation();
});

    // ================================================================== //
    //  CONTROLE MANUAL DE ACORDEÃO (VERSÃO 3.0 - FINAL)
    // ================================================================== //

    html.find('.spell-summary, .group-summary').click(async (ev) => {
        const target = $(ev.target);

        // 1. CASO ESPECIAL: INPUTS
        if (target.closest('input, select, textarea').length) return; 

        // 2. CASO BOTÕES (Editar, Deletar, Dados, Links)
        // Isso protege o acordeão de fechar se você clicar num botão que NãO tem stopPropagation
        if (target.closest('a, button, .item-control, .rollable, .item-edit, .item-delete, .item-quick-view, .effect-control').length) {
        return;
        }

        // 3. CASO GERAL
        ev.preventDefault(); 
        ev.stopPropagation();

        const details = $(ev.currentTarget).closest('details');
        const groupId = details.data('groupId');
        const wasOpen = details[0].hasAttribute('open');

        if (wasOpen) details.removeAttr('open');
        else details.attr('open', '');  

        if (groupId) {
            const newState = !wasOpen;
            await this.actor.setFlag("gum", `sheetCollapsedState.${groupId}`, newState);
        }
    });

// GATILHO PARA ACORDEÕES LEGADOS DE MAGIAS
    // Os cabeçalhos unificados já são controlados pelo listener acima (ou pelo
    // comportamento nativo do <summary>). Escutar `.summary-left` aqui fazia o
    // clique no nome/ícone alternar o estado manualmente e, em seguida, outra
    // vez pelo <summary>, anulando a interação.
    html.find('.spell-main-info').click(async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const trigger = $(ev.currentTarget);
        const details = trigger.closest('details');
        const wasOpen = details[0].hasAttribute('open');
        
        if (wasOpen) details.removeAttr('open');
        else details.attr('open', '');

        const id = details.data('groupId');
        if (id) {
            let currentState = foundry.utils.duplicate(this.actor.getFlag("gum", "sheetCollapsedState") || {});
            currentState[id] = !wasOpen ? false : true; 
            await this.actor.setFlag("gum", "sheetCollapsedState", currentState);
        }
    });

    // ================================================================== //
    //   LISTENER DE SOBREVIVÊNCIA (+ e -)
    // ================================================================== //
    html.find('.adjust-survival').click(ev => {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        const action = btn.data('action'); 
        const attrKey = btn.data('attr');  
        
        const input = btn.siblings('input');
        let value = parseInt(input.val()) || 0;

        if (action === 'increase') value++;
        else value = Math.max(0, value - 1);

        input.val(value);
        this.actor.update({ [`system.attributes.${attrKey}.value`]: value });
    });

    html.find('.item-toggle-defense-bonus').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = $(ev.currentTarget).closest('.item');
        const item = this.actor.items.get(row.data('itemId'));
        if (!item || item.type !== 'equipment') return;
        await item.update({ "system.defense_bonus_active": item.system.defense_bonus_active !== true });
    });

    html.find('.characteristic-search-input').on('input', ev => {
        const normalize = value => String(value ?? "").normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
        const query = normalize(ev.currentTarget.value);
        const sections = html.find('.characteristics-sections .characteristic-group');
        let totalMatches = 0;

        sections.each((_, details) => {
            const cards = $(details).find('.characteristic-card');
            let sectionMatches = 0;
            cards.each((__, card) => {
                const matches = !query || normalize(card.dataset.search).includes(query);
                card.hidden = !matches;
                if (matches) sectionMatches += 1;
            });
            details.hidden = Boolean(query) && sectionMatches === 0;
            totalMatches += sectionMatches;
            if (query) {
                if (!details.dataset.characteristicSearchManaged) {
                    details.dataset.characteristicSearchWasOpen = String(details.open);
                    details.dataset.characteristicSearchManaged = 'true';
                }
                if (sectionMatches) details.open = true;
            } else if (details.dataset.characteristicSearchManaged) {
                details.open = details.dataset.characteristicSearchWasOpen === 'true';
                setTimeout(() => {
                    delete details.dataset.characteristicSearchManaged;
                    delete details.dataset.characteristicSearchWasOpen;
                }, 0);
            }
        });
        html.find('.characteristics-search-empty').prop('hidden', !query || totalMatches > 0);
    });

    html.find('.characteristic-group-summary').click(ev => {
        if ($(ev.target).closest('a, button, .item-control').length) return;
        ev.preventDefault();
        ev.stopPropagation();
        const details = ev.currentTarget.closest('details');
        if (details) details.open = !details.open;
    });
    html.find('.create-characteristic-group').click(ev => {
        ev.preventDefault();
        this._createCharacteristicOrganizationGroup();
    });
    html.find('.rename-characteristic-group').click(ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this._renameCharacteristicOrganizationGroup(ev.currentTarget.dataset.groupId);
    });
    html.find('.delete-characteristic-group').click(ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this._deleteCharacteristicOrganizationGroup(ev.currentTarget.dataset.groupId);
    });
    html.find('.suggest-characteristic-groups').click(ev => {
        ev.preventDefault();
        this._suggestCharacteristicOrganizationGroups();
    });
    html.find('.remove-characteristic-from-group').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const { characteristics, organization } = this._getCharacteristicOrganizationState();
        const updated = moveOrganizedItem(organization, { itemId, targetGroupId: UNGROUPED_ORGANIZER_ID }, characteristics.map(item => item.id));
        await this._saveCharacteristicOrganization(updated);
    });

    this._characteristicOrganizerCleanup?.();
    this._characteristicOrganizerCleanup = attachSheetItemOrganizer(html[0], {
        actorUuid: this.actor.uuid,
        namespace: 'characteristics',
        acceptedItemTypes: ['advantage', 'disadvantage'],
        onMove: async ({ itemId, targetGroupId, targetIndex }) => {
            const { characteristics, organization } = this._getCharacteristicOrganizationState();
            const updated = moveOrganizedItem(organization, { itemId, targetGroupId, targetIndex }, characteristics.map(item => item.id));
            await this._saveCharacteristicOrganization(updated);
        }
    });

    this._equipmentOrganizerCleanup?.();
    this._equipmentOrganizerCleanup = attachSheetItemOrganizer(html[0], {
        actorUuid: this.actor.uuid,
        namespace: 'equipment',
        acceptedItemTypes: ['equipment', 'melee_weapon', 'ranged_weapon'],
        itemSelector: '[data-tab="equipment"] [data-organizer-item-id]',
        zoneSelector: '[data-tab="equipment"] [data-organizer-zone]',
        onMove: async ({ itemId, targetGroupId, targetIndex }) => {
            const item = this.actor.items.get(itemId);
            if (!item) return;

            const containerId = targetGroupId.startsWith('container:')
                ? targetGroupId.slice('container:'.length)
                : '';
            const container = containerId ? this.actor.items.get(containerId) : null;
            const update = resolveEquipmentDrop(item, targetGroupId, { container });
            if (!update) {
                ui.notifications.warn(item.system?.is_container
                    ? 'Containers não podem ser colocados dentro de outros containers.'
                    : 'Este não é um destino válido para o equipamento.');
                return;
            }

            const updatesById = new Map([[item.id, update]]);
            const sortUpdates = buildEquipmentSortUpdates(this.actor.items, {
                itemId,
                targetZone: targetGroupId,
                targetIndex
            });
            for (const sortUpdate of sortUpdates) {
                updatesById.set(sortUpdate._id, {
                    ...(updatesById.get(sortUpdate._id) || {}),
                    ...sortUpdate
                });
            }
            if (item.system?.is_container && !container) {
                const destinationLocation = targetGroupId.startsWith('containers:')
                    ? targetGroupId.slice('containers:'.length)
                    : targetGroupId;
                const descendants = this._getContainerDescendants(item.id);
                for (const descendant of descendants) {
                    updatesById.set(descendant.id, {
                        ...(updatesById.get(descendant.id) || {}),
                        _id: descendant.id,
                        'system.location': destinationLocation,
                        'system.equipped': destinationLocation === 'equipped',
                        'system.stored': destinationLocation === 'stored'
                    });
                }
            }
            await this.actor.updateEmbeddedDocuments('Item', [...updatesById.values()]);
        }
    });

    // Alternar Modo de Visualização de Perícias
    html.find('.toggle-skills-view').click(async ev => {
        const currentMode = this.actor.getFlag('gum', 'skillsViewMode') || 'group';
        const newMode = currentMode === 'group' ? 'tree' : 'group';
        await this.actor.setFlag('gum', 'skillsViewMode', newMode);
    });

    html.find('.skill-search-input').on('input', ev => {
        const normalize = value => String(value ?? "").normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
        const query = normalize(ev.currentTarget.value);
        const sections = html.find('.skills-scroll-area .skill-tree-group');
        let totalMatches = 0;

        sections.each((_, element) => {
            const details = element;
            const cards = $(details).find('.skill-tree-item');
            let sectionMatches = 0;
            cards.each((__, card) => {
                const matches = !query || normalize($(card).find('.st-item-name h4').text()).includes(query);
                card.hidden = !matches;
                if (matches) sectionMatches += 1;
            });
            details.hidden = Boolean(query) && sectionMatches === 0;
            totalMatches += sectionMatches;

            if (query) {
                if (!details.dataset.skillSearchManaged) {
                    details.dataset.skillSearchWasOpen = String(details.open);
                    details.dataset.skillSearchManaged = 'true';
                }
                if (sectionMatches) details.open = true;
            } else if (details.dataset.skillSearchManaged) {
                details.open = details.dataset.skillSearchWasOpen === 'true';
                setTimeout(() => {
                    delete details.dataset.skillSearchManaged;
                    delete details.dataset.skillSearchWasOpen;
                }, 0);
            }
        });

        html.find('.skills-search-empty').prop('hidden', !query || totalMatches > 0);
    });

    html.find('.skill-tree-summary').click(ev => {
        if ($(ev.target).closest('a, button, .item-control').length) return;
        ev.preventDefault();
        ev.stopPropagation();
        const details = ev.currentTarget.closest('details');
        if (details) details.open = !details.open;
    });

    html.find('.create-skill-group').click(ev => {
        ev.preventDefault();
        this._createSkillOrganizationGroup();
    });
    html.find('.rename-skill-group').click(ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this._renameSkillOrganizationGroup(ev.currentTarget.dataset.groupId);
    });
    html.find('.delete-skill-group').click(ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this._deleteSkillOrganizationGroup(ev.currentTarget.dataset.groupId);
    });
    html.find('.suggest-skill-groups').click(ev => {
        ev.preventDefault();
        this._suggestSkillOrganizationGroups();
    });
    html.find('.remove-skill-from-group').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const { skills, organization } = this._getSkillOrganizationState();
        const updated = moveOrganizedItem(organization, { itemId, targetGroupId: UNGROUPED_ORGANIZER_ID }, skills.map(item => item.id));
        await this._saveSkillOrganization(updated);
    });

    this._skillOrganizerCleanup?.();
    this._skillOrganizerCleanup = null;
    if ((this.actor.getFlag('gum', 'skillsViewMode') || 'group') === 'group') {
        this._skillOrganizerCleanup = attachSheetItemOrganizer(html[0], {
            actorUuid: this.actor.uuid,
            namespace: 'skills',
            acceptedItemTypes: ['skill'],
            onMove: async ({ itemId, targetGroupId, targetIndex }) => {
                const { skills, organization } = this._getSkillOrganizationState();
                const updated = moveOrganizedItem(organization, { itemId, targetGroupId, targetIndex }, skills.map(item => item.id));
                await this._saveSkillOrganization(updated);
            }
        });
    }

    html.find('.create-ability-group').click(ev => {
        ev.preventDefault();
        this._createAbilityOrganizationGroup(ev.currentTarget.dataset.abilityType);
    });
    html.find('.rename-ability-group').click(ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this._renameAbilityOrganizationGroup(ev.currentTarget.dataset.abilityType, ev.currentTarget.dataset.groupId);
    });
    html.find('.delete-ability-group').click(ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this._deleteAbilityOrganizationGroup(ev.currentTarget.dataset.abilityType, ev.currentTarget.dataset.groupId);
    });
    html.find('.suggest-ability-groups').click(ev => {
        ev.preventDefault();
        this._suggestAbilityOrganizationGroups(ev.currentTarget.dataset.abilityType);
    });
    html.find('.remove-ability-from-group').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const type = ev.currentTarget.dataset.abilityType;
        const itemId = ev.currentTarget.dataset.itemId;
        const { items, organization } = this._getAbilityOrganizationState(type);
        const updated = moveOrganizedItem(organization, { itemId, targetGroupId: UNGROUPED_ORGANIZER_ID }, items.map(item => item.id));
        await this._saveAbilityOrganization(type, updated);
    });

    for (const type of ['spell', 'power']) {
        this[`_${type}OrganizerCleanup`]?.();
        this[`_${type}OrganizerCleanup`] = attachSheetItemOrganizer(html[0], {
            actorUuid: this.actor.uuid,
            namespace: `${type}s`,
            acceptedItemTypes: [type],
            itemSelector: `[data-tab="${type}s"] [data-organizer-item-id]`,
            zoneSelector: `[data-tab="${type}s"] [data-organizer-zone]`,
            onMove: async ({ itemId, targetGroupId, targetIndex }) => {
                const { items, organization } = this._getAbilityOrganizationState(type);
                const updated = moveOrganizedItem(organization, { itemId, targetGroupId, targetIndex }, items.map(item => item.id));
                await this._saveAbilityOrganization(type, updated);
            }
        });
    }

    // Define uma miniatura precisa tanto no modo de organização quanto no
    // modo árvore, sem interferir no payload criado pelo organizador.
    html.find(".skill-tree-item").each((_, card) => {
        card.addEventListener("dragstart", ev => {
            if (ev.target.closest?.(".rollable")) return;
            this._onDragStart(ev);
            this._setCardDragImage(ev, card);
        });
    });

    // MENU DE CONTEXTO (Botão de Opções)
    html.on('click', '.equipment-options-btn', ev => {
            ev.preventDefault();
            ev.stopPropagation();

            const button = $(ev.currentTarget);
            const li = button.closest('.item');
            const itemId = li.data('itemId');
            const item = this.actor.items.get(itemId);
            if (!item) return;
            
            const moveSubmenu = `
                <div class="context-item" data-action="update-location" data-value="equipped">
                    <i class="fas fa-user-shield"></i> Em Uso
                </div>
                <div class="context-item" data-action="update-location" data-value="carried">
                    <i class="fas fa-shopping-bag"></i> Carregado
                </div>
                <div class="context-item" data-action="update-location" data-value="stored">
                    <i class="fas fa-archive"></i> Armazenado
                </div>
            `;

            const menuContent = `
                <div class="context-item" data-action="edit"><i class="fas fa-edit"></i> Editar Item</div>
                <div class="context-item" data-action="delete"><i class="fas fa-trash"></i> Deletar Item</div>
                <div class="context-divider"></div>
                <div class="context-submenu">
                    <div class="context-item"><i class="fas fa-exchange-alt"></i> Mover Para</div>
                    <div class="submenu-items">${moveSubmenu}</div>
                </div>
            `;

            const customMenu = this.element.find(".custom-context-menu");
            customMenu.html(menuContent);
            customMenu.data("itemId", itemId); 
            customMenu.css({ display: "block", left: ev.clientX - 210 + "px", top: ev.clientY - 10 + "px" });
    });

    // Listener para deletar efeitos
    html.find('[data-action="delete-effect"]').on('click', ev => {
        const effectId = ev.currentTarget.dataset.effectId;
        if (effectId) {
            this.actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
        }
    });

   // ================================================================== //
    //   LISTENER: ROLAGENS GERAIS (ROLLABLE)
    // ================================================================== //
    html.on("click", ".configure-attack-ammunition", async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const attackId = ev.currentTarget.dataset.attackId;
        const result = await configureAmmunitionLoadout(this.actor, { itemId, attackId });
        if (result) this.render(false);
    });

    html.on("click", ".toggle-attack-ammunition-lock", async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const attackId = ev.currentTarget.dataset.attackId;
        const result = await toggleAmmunitionLoadoutLock(this.actor, { itemId, attackId });
        if (result) this.render(false);
    });

    // Correção: Unifiquei seus dois listeners de .rollable em um só mais robusto para evitar duplicidade
    html.on('click', '.rollable', async ev => {
        ev.preventDefault();
        ev.stopPropagation(); // Importante

        const element = ev.currentTarget;
        const rollData = await prepareAmmunitionRollData(this.actor, this._getRollDataFromElement(element));
        if (!rollData) return;

        if (ev.shiftKey) {
            // Shift = Rápido
            if(typeof performGURPSRoll !== 'undefined') performGURPSRoll(this.actor, rollData);
        } else {
            // Normal = Prompt
             if(typeof GurpsRollPrompt !== 'undefined') new GurpsRollPrompt(this.actor, rollData).render(true);
        }
    });

    html.find(".rollable").attr("draggable", true);
    html.on("dragstart", ".rollable", this._onDragStart.bind(this));
    html.find(".rollable-damage, .rollable-basic-damage").attr("draggable", true);
    html.on("dragstart", ".rollable-damage, .rollable-basic-damage", this._onDragStart.bind(this));

    // Os cards compactos de magia ficam fora de `.item-list`, portanto não
    // recebem o listener de arraste criado pelo ActorSheet base. O listener
    // direto garante que currentTarget seja exatamente o card selecionado.
    html.find(".magic-card").each((_, card) => {
        card.addEventListener("dragstart", ev => {
            if (ev.target.closest?.(".rollable, .rollable-damage, .rollable-basic-damage")) return;
            this._onDragStart(ev);

            // O Chromium pode usar todo o grid como imagem nativa quando um
            // de seus itens é arrastado. Limitar a prévia ao conteúdo deste
            // card evita a sobreposição visual dos demais cards do grupo.
            this._setCardDragImage(ev, card, ".magic-card__main");
        });
    });

// ================================================================== //
//  ROLAGEM DE DANO (ATAQUES DE EQUIPAMENTO + MAGIAS / PODERES)
// ================================================================== //
html.on("click", ".rollable-damage", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  const element = ev.currentTarget;
  let normalizedAttack;

  // --------------------------------------------------
  // 1) Identificação segura do Item e do Modo de Ataque
  // --------------------------------------------------
  const $el = $(element);

  const itemId =
    element.dataset.itemId ||
    $el.data("itemId") ||
    $el.closest("[data-item-id]").data("itemId") ||
    $el.closest(".item").data("itemId");

  const attackId =
    element.dataset.attackId ||
    $el.data("attackId") ||
    $el.attr("data-attack-id");

  if (!itemId) {
    console.warn("GUM | Rolagem de dano sem itemId.");
    return;
  }

  const item = this.actor.items.get(itemId);
  if (!item) {
    ui.notifications.error("Item não encontrado para esta rolagem de dano.");
    return;
  }

  // --------------------------------------------------
  // 2) NORMALIZAÇÃO (EXATAMENTE COMO SEU MODELO ANTIGO)
  // --------------------------------------------------

  // A) Equipamento com modos de ataque
  if (attackId && (item.system.melee_attacks || item.system.ranged_attacks)) {
    const attack =
      item.system.melee_attacks?.[attackId] ||
      item.system.ranged_attacks?.[attackId];

    if (!attack) {
      ui.notifications.warn("Modo de ataque não encontrado.");
      return;
    }

    const effectiveDamage = game.gum?.resolveCombatDamageProfile?.(
      this.actor,
      item,
      attack,
      item.system.melee_attacks?.[attackId] ? "melee" : "ranged",
      { includeTargeted: true }
    ) || {
      main: { formula: attack.effective_damage_formula || attack.damage_formula, type: attack.damage_type, nature: attack.damage_nature || "", armor_divisor: attack.armor_divisor },
      follow_up: foundry.utils.duplicate(attack.follow_up_damage || {}),
      fragmentation: foundry.utils.duplicate(attack.fragmentation_damage || {})
    };
    normalizedAttack = {
      name: `${item.name} (${attack.mode ?? attackId})`,
      formula: effectiveDamage.main.formula,
      type: effectiveDamage.main.type,
      nature: effectiveDamage.main.nature || "",
      armor_divisor: effectiveDamage.main.armor_divisor,
      follow_up_damage: effectiveDamage.follow_up,
      fragmentation_damage: effectiveDamage.fragmentation,
      onDamageEffects: attack.onDamageEffects || {},
            generalConditions: item.system.generalConditions || {},
      sourceItemId: item.id,
      sourceItemUuid: item.uuid,
      sourceWeight: Number(item.system?.weight) || 0,
      sourceAttackId: attackId || null,
      sourceAttackType: item.system.melee_attacks?.[attackId] ? "melee" : "ranged"
    };

  // B) Magias / Poderes
  } else if (item.system.damage?.formula) {
    const dmg = item.system.damage;

    normalizedAttack = {
      name: item.name,
      formula: dmg.formula,
      type: dmg.type,
      nature: dmg.nature || "",
      armor_divisor: dmg.armor_divisor,
      follow_up_damage: foundry.utils.duplicate(dmg.follow_up_damage || {}),
      fragmentation_damage: foundry.utils.duplicate(dmg.fragmentation_damage || {}),
      onDamageEffects: item.system.onDamageEffects || {},
      generalConditions: item.system.generalConditions || {},
      sourceItemId: item.id,
      sourceItemUuid: item.uuid,
      sourceWeight: Number(item.system?.weight) || 0,
      sourceAttackId: null,
      sourceAttackType: item.type || "item"
    };

 } else {
    ui.notifications.warn("Este item não possui fórmula de dano válida.");
    return;
  }

  const mergeEffects = (...sources) => {
    const merged = [];
    for (const source of sources) {
      if (!source) continue;
      if (Array.isArray(source)) {
        source.forEach((data, index) => {
          if (!data) return;
          merged.push({ id: data.id ?? `effect-${merged.length + index}`, ...data });
        });
      } else {
        for (const [id, data] of Object.entries(source)) {
          if (!data) continue;
          merged.push({ id, ...data });
        }
      }
    }
    return merged;
  };

  const combinedOnDamageEffects = mergeEffects(
    normalizedAttack.generalConditions,
    item.system?.onDamageEffects,
    normalizedAttack.onDamageEffects
  );

  // --------------------------------------------------
  // 3) Helpers (GdP / GeB / limpeza de fórmula)
  // --------------------------------------------------
  const resolveBaseDamage = (actor, formula) => resolveAttackDamageDisplay(formula, actor.system.attributes);

  const extractMathFormula = (formula) => {
    const match = String(formula).match(/^([0-9dDkKlLhH+\-/*\s(){},.]+)/i);
    return match ? match[1].trim() : "0";
  };

  const maybeNormalizeDamageFormula = (f) => {
    if (!game.settings.get("gum", "normalizeGurpsDamageDice")) return f;
    return normalizeGurpsDamageExpression(f)?.formula || f;
  };

  const summarySegments = [];
  const mainDisplayFormula = extractMathFormula(resolveBaseDamage(this.actor, normalizedAttack.formula));
  summarySegments.push(`${mainDisplayFormula} ${normalizedAttack.type || ""}${normalizedAttack.nature?.label ? ` [${normalizedAttack.nature.label}]` : ""}`.trim());
  if (normalizedAttack.follow_up_damage?.formula) {
    const fuDisplay = extractMathFormula(resolveBaseDamage(this.actor, normalizedAttack.follow_up_damage.formula));
    summarySegments.push(`FU: ${fuDisplay} ${normalizedAttack.follow_up_damage.type || ""}`.trim());
  }
  if (normalizedAttack.fragmentation_damage?.formula) {
    const frDisplay = extractMathFormula(resolveBaseDamage(this.actor, normalizedAttack.fragmentation_damage.formula));
    summarySegments.push(`FR: ${frDisplay} ${normalizedAttack.fragmentation_damage.type || ""}`.trim());
  }

  const promptResult = await GurpsDamageRollPrompt.prompt({
    sourceName: normalizedAttack.name,
    main: {
      formula: normalizedAttack.formula,
      displayFormula: mainDisplayFormula,
      summaryFormula: summarySegments.join(" • "),
      type: normalizedAttack.type || "",
      natureDisplay: normalizedAttack.nature ? formatDamageNature(normalizedAttack.nature) : "",
      armorDivisor: normalizedAttack.armor_divisor || 1
    },
    followUp: {
      formula: normalizedAttack.follow_up_damage?.formula || "",
      displayFormula: normalizedAttack.follow_up_damage?.formula ? extractMathFormula(resolveBaseDamage(this.actor, normalizedAttack.follow_up_damage.formula)) : "",
      type: normalizedAttack.follow_up_damage?.type || "",
      natureDisplay: normalizedAttack.follow_up_damage?.nature ? formatDamageNature(normalizedAttack.follow_up_damage.nature) : "",
      armorDivisor: normalizedAttack.follow_up_damage?.armor_divisor || 1
    },
    fragmentation: {
      formula: normalizedAttack.fragmentation_damage?.formula || "",
      displayFormula: normalizedAttack.fragmentation_damage?.formula ? extractMathFormula(resolveBaseDamage(this.actor, normalizedAttack.fragmentation_damage.formula)) : "",
      type: normalizedAttack.fragmentation_damage?.type || "",
      natureDisplay: normalizedAttack.fragmentation_damage?.nature ? formatDamageNature(normalizedAttack.fragmentation_damage.nature) : "",
      armorDivisor: normalizedAttack.fragmentation_damage?.armor_divisor || 1
    }
  });

  if (!promptResult) return;

  const appendAdditional = (baseFormula, additional) => {
    const base = String(baseFormula || "").trim();
    const add = String(additional || "").trim();
    if (!add) return base;
    return `${base}${add}`;
  };

  normalizedAttack.formula = appendAdditional(normalizedAttack.formula, promptResult.mainAdditional);
  normalizedAttack.nature = promptResult.mainNature || null;

  if (promptResult.followUpAdditional) {
    normalizedAttack.follow_up_damage = normalizedAttack.follow_up_damage || { formula: "", type: "", armor_divisor: 1 };
    normalizedAttack.follow_up_damage.formula = appendAdditional(normalizedAttack.follow_up_damage.formula || "0", promptResult.followUpAdditional);
    if (!normalizedAttack.follow_up_damage.type && promptResult.followUpType) normalizedAttack.follow_up_damage.type = promptResult.followUpType;
    normalizedAttack.follow_up_damage.nature = promptResult.followUpNature || null;
  }

  if (promptResult.fragmentationAdditional) {
    normalizedAttack.fragmentation_damage = normalizedAttack.fragmentation_damage || { formula: "", type: "", armor_divisor: 1 };
    normalizedAttack.fragmentation_damage.formula = appendAdditional(normalizedAttack.fragmentation_damage.formula || "0", promptResult.fragmentationAdditional);
    if (!normalizedAttack.fragmentation_damage.type && promptResult.fragmentationType) normalizedAttack.fragmentation_damage.type = promptResult.fragmentationType;
    normalizedAttack.fragmentation_damage.nature = promptResult.fragmentationNature || null;
  }

  // --------------------------------------------------
  // 4) Função principal de rolagem
  // --------------------------------------------------
  const performDamageRoll = async (modifier = 0) => {
    const rolls = [];

    // ---- DANO PRINCIPAL ----
    let base = resolveBaseDamage(this.actor, normalizedAttack.formula);
    const cleaned = extractMathFormula(base);
    const mainFormulaRaw = cleaned + (modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : "");
    const mainFormula = maybeNormalizeDamageFormula(mainFormulaRaw);

    const mainRoll = new Roll(mainFormula);
    await mainRoll.evaluate();
    rolls.push(mainRoll);

 // ---- FOLLOW-UP ----
    let followUpRoll = null;
    let fuClean = null;
    if (normalizedAttack.follow_up_damage?.formula) {
      const fu = resolveBaseDamage(this.actor, normalizedAttack.follow_up_damage.formula);
      fuClean = maybeNormalizeDamageFormula(extractMathFormula(fu));
      followUpRoll = new Roll(fuClean);
      await followUpRoll.evaluate();
      rolls.push(followUpRoll);
    }

    // ---- FRAGMENTAÇÃO ----
    let fragRoll = null;
    let frClean = null;
    if (normalizedAttack.fragmentation_damage?.formula) {
      const fr = resolveBaseDamage(this.actor, normalizedAttack.fragmentation_damage.formula);
      frClean = maybeNormalizeDamageFormula(extractMathFormula(fr));
      fragRoll = new Roll(frClean);
      await fragRoll.evaluate();
      rolls.push(fragRoll);
    }

    // ---- Pacote de Dano (para Damage Application)
    const damagePackage = {
      attackerId: this.actor.id,
      attackerTokenId: this.actor.token?.id || null,
      attackerTokenImg: resolveCharacterImage(this.actor),
      sourceName: normalizedAttack.name,
      sourceItemId: normalizedAttack.sourceItemId || null,
      sourceItemUuid: normalizedAttack.sourceItemUuid || null,
      sourceWeight: normalizedAttack.sourceWeight || 0,
      sourceAttackId: normalizedAttack.sourceAttackId || null,
      sourceAttackType: normalizedAttack.sourceAttackType || null,
      main: {
        total: mainRoll.total,
        type: normalizedAttack.type || "",
        nature: normalizedAttack.nature || null,
        armorDivisor: normalizedAttack.armor_divisor || 1
      },
      onDamageEffects: combinedOnDamageEffects,
      generalConditions: normalizedAttack.generalConditions
    };

    if (followUpRoll) {
      damagePackage.followUp = {
        total: followUpRoll.total,
        type: normalizedAttack.follow_up_damage.type || "",
        nature: normalizedAttack.follow_up_damage.nature || null,
        armorDivisor: normalizedAttack.follow_up_damage.armor_divisor || 1
      };
    }

    if (fragRoll) {
      damagePackage.fragmentation = {
        total: fragRoll.total,
        type: normalizedAttack.fragmentation_damage.type || "",
        nature: normalizedAttack.fragmentation_damage.nature || null,
        armorDivisor: normalizedAttack.fragmentation_damage.armor_divisor || 1
      };
    }

    // ---- Chat (simples, funcional)
     const mainDiceHtml = mainRoll.dice.flatMap((d) => d.results).map((r) => `<span class="die-damage">${r.result}</span>`).join("");

    const formulaSegments = [];
    formulaSegments.push(`${mainFormula}${normalizedAttack.armor_divisor && normalizedAttack.armor_divisor !== 1 ? `(${normalizedAttack.armor_divisor})` : ""} ${normalizedAttack.type || ""}${normalizedAttack.nature?.label ? ` [${normalizedAttack.nature.label}]` : ""}`.trim());
    if (followUpRoll) {
      formulaSegments.push(`${fuClean}${normalizedAttack.follow_up_damage.armor_divisor && normalizedAttack.follow_up_damage.armor_divisor !== 1 ? `(${normalizedAttack.follow_up_damage.armor_divisor})` : ""} ${normalizedAttack.follow_up_damage.type || ""}`.trim());
    }
    if (fragRoll) {
      formulaSegments.push(`${frClean}${normalizedAttack.fragmentation_damage.armor_divisor && normalizedAttack.fragmentation_damage.armor_divisor !== 1 ? `(${normalizedAttack.fragmentation_damage.armor_divisor})` : ""} ${normalizedAttack.fragmentation_damage.type || ""}`.trim());
    }

    const formulaPill = formulaSegments.join(" • ");

    const content = `
      <div class="gurps-damage-card">
        <header class="card-header">
          <h3>${normalizedAttack.name}</h3>
        </header>

        <div class="card-formula-container">
          <span class="formula-pill">${formulaPill}</span>
        </div>

        <div class="card-content">
          <div class="card-main-flex">
            <div class="roll-column">
              <span class="column-label">${game.i18n.localize("GUM.RollCard.Dice")}</span>
              <div class="individual-dice-damage">${mainDiceHtml || `<span class="die-damage">–</span>`}</div>
            </div>

            <div class="column-separator"></div>

            <div class="target-column">
              <span class="column-label">${game.i18n.localize("GUM.RollCard.TotalDamage")}</span>
              <div class="damage-total">
                <span class="damage-value">${mainRoll.total}</span>
                <span class="damage-type">${normalizedAttack.type || ""}</span>
              </div>
            </div>
          </div>
        </div>

        ${(followUpRoll || fragRoll) ? `
          <footer class="card-footer">
            ${followUpRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FollowUpDamage")}</div>
                <div class="extra-damage-roll">
                  <div class="extra-total">
                    <span class="damage-value">${followUpRoll.total}</span>
                    <span class="damage-type">${normalizedAttack.follow_up_damage.type || ""}</span>
                  </div>
                </div>
              </div>
            ` : ""}

            ${fragRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FragmentationDamage")}</div>
                <div class="extra-damage-roll">
                  <div class="extra-total">
                    <span class="damage-value">${fragRoll.total}</span>
                    <span class="damage-type">${normalizedAttack.fragmentation_damage.type || ""}</span>
                  </div>
                </div>
              </div>
            ` : ""}
          </footer>
        ` : ""}

        <footer class="card-actions">
          <button class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
            <i class="fas fa-crosshairs"></i> ${game.i18n.localize("GUM.RollCard.ApplyToTarget")}
          </button>
        </footer>
      </div>
    `;



    const chatData = applyCurrentRollPrivacy({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      rolls
    }, { rollMode: promptResult.rollMode });
    await ChatMessage.create(chatData);
  };

  // --------------------------------------------------
  // 5) Shift+Click = diálogo de modificador
  // --------------------------------------------------
  if (ev.shiftKey) {
    new Dialog({
      title: "Modificador de Dano",
      content: `<p>Informe o modificador:</p><input type="number" name="modifier" value="0"/>`,
      buttons: {
        roll: {
          label: "Rolar",
          callback: (html) => {
            const mod = parseInt(html.find('[name="modifier"]').val()) || 0;
            performDamageRoll(mod);
          }
        }
      }
    }).render(true);
  } else {
    performDamageRoll(0);
  }
});

// ================================================================== //
//  ROLAGEM DE DANO BÁSICO (CARD GdP / GeB)
// ================================================================== //
html.on("click", ".rollable-basic-damage", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  const element = ev.currentTarget;
  const actor = this.actor;

  let formula = String(
    element.dataset.rollFormula ||
    element.getAttribute("data-roll-formula") ||
    "0"
  ).toLowerCase();

  const label =
    element.dataset.label ||
    element.getAttribute("data-label") ||
    game.i18n.localize("GUM.RollCard.BasicDamage");
  const basicDamageType = "indef.";

  const resolveBaseDamage = (f) => resolveAttackDamageDisplay(f, actor.system.attributes);

  const extractMathFormula = (f) => {
    const match = String(f).match(/^([0-9dDkKlLhH+\-/*\s(){},.]+)/i);
    return match ? match[1].trim() : "0";
  };

  const maybeNormalizeDamageFormula = (f) => {
    if (!game.settings.get("gum", "normalizeGurpsDamageDice")) return f;
    return normalizeGurpsDamageExpression(f)?.formula || f;
  };

  const resolved = resolveBaseDamage(formula);
  const cleaned = extractMathFormula(resolved);
  const promptResult = await GurpsDamageRollPrompt.prompt({
    sourceName: label,
    main: {
      formula,
      displayFormula: cleaned,
      summaryFormula: cleaned,
      type: basicDamageType
    },
    followUp: { formula: "", displayFormula: "", type: "" },
    fragmentation: { formula: "", displayFormula: "", type: "" }
  });

  if (!promptResult) return;

  const finalFormula = maybeNormalizeDamageFormula(`${cleaned}${promptResult.mainAdditional || ""}`);
  const followUpFormula = promptResult.followUpAdditional
    ? maybeNormalizeDamageFormula(String(promptResult.followUpAdditional).replace(/^\+/, ""))
    : "";
  const fragmentationFormula = promptResult.fragmentationAdditional
    ? maybeNormalizeDamageFormula(String(promptResult.fragmentationAdditional).replace(/^\+/, ""))
    : "";

  const performBasicRoll = async () => {

    const roll = new Roll(finalFormula);
    await roll.evaluate();

    let followUpRoll = null;
    if (followUpFormula) {
      followUpRoll = new Roll(followUpFormula);
      await followUpRoll.evaluate();
    }

    let fragmentationRoll = null;
    if (fragmentationFormula) {
      fragmentationRoll = new Roll(fragmentationFormula);
      await fragmentationRoll.evaluate();
    }

    const damagePackage = {
      attackerId: actor.id,
      attackerTokenId: actor.token?.id || null,
      attackerTokenImg: resolveCharacterImage(actor),
      sourceName: label,
      main: {
        total: roll.total,
        type: basicDamageType,
        nature: promptResult.mainNature || null,
        armorDivisor: promptResult.mainArmorDivisor || 1
      },
      onDamageEffects: {},
      generalConditions: {}
    };

    if (followUpRoll) {
      damagePackage.followUp = {
        total: followUpRoll.total,
        type: promptResult.followUpType || "",
        nature: promptResult.followUpNature || null,
        armorDivisor: promptResult.followUpArmorDivisor || 1
      };
    }
    if (fragmentationRoll) {
      damagePackage.fragmentation = {
        total: fragmentationRoll.total,
        type: promptResult.fragmentationType || "",
        nature: promptResult.fragmentationNature || null,
        armorDivisor: promptResult.fragmentationArmorDivisor || 1
      };
    }

    const mainDiceHtml = roll.dice.flatMap((d) => d.results).map((r) => `<span class="die-damage">${r.result}</span>`).join("");
    const formulaPill = [finalFormula, followUpFormula, fragmentationFormula].filter(Boolean).join(" • ");

    const content = `
      <div class="gurps-damage-card">
        <header class="card-header">
          <h3>${label}</h3>
          <div class="card-subtitle">${game.i18n.localize("GUM.RollCard.BasicDamage")}</div>
        </header>

        <div class="card-formula-container">
          <span class="formula-pill">${formulaPill}</span>
        </div>

        <div class="card-content">
          <div class="card-main-flex">
            <div class="roll-column">
              <span class="column-label">${game.i18n.localize("GUM.RollCard.Dice")}</span>
              <div class="individual-dice-damage">${mainDiceHtml || `<span class="die-damage">–</span>`}</div>
            </div>

            <div class="column-separator"></div>

            <div class="target-column">
              <span class="column-label">${game.i18n.localize("GUM.RollCard.TotalDamage")}</span>
              <div class="damage-total">
                <span class="damage-value">${roll.total}</span>
              </div>
            </div>
          </div>
        </div>

        ${(followUpRoll || fragmentationRoll) ? `
          <footer class="card-footer">
            ${followUpRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FollowUpDamage")}</div>
                <div class="extra-damage-roll"><div class="extra-total"><span class="damage-value">${followUpRoll.total}</span><span class="damage-type">${promptResult.followUpType || ""}</span></div></div>
              </div>
            ` : ""}
            ${fragmentationRoll ? `
              <div class="extra-damage-block">
                <div class="extra-damage-label">${game.i18n.localize("GUM.Spells.FragmentationDamage")}</div>
                <div class="extra-damage-roll"><div class="extra-total"><span class="damage-value">${fragmentationRoll.total}</span><span class="damage-type">${promptResult.fragmentationType || ""}</span></div></div>
              </div>
            ` : ""}
          </footer>
        ` : ""}

        <footer class="card-actions">
          <button class="apply-damage-button" data-damage='${JSON.stringify(damagePackage)}'>
            <i class="fas fa-crosshairs"></i> ${game.i18n.localize("GUM.RollCard.ApplyToTarget")}
          </button>
        </footer>
      </div>
    `;

    const chatData = applyCurrentRollPrivacy({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: [roll, followUpRoll, fragmentationRoll].filter(Boolean)
    }, { rollMode: promptResult.rollMode });
    await ChatMessage.create(chatData);
  };

  performBasicRoll();
});



    // EDITOR UNIFICADO DE ATRIBUTOS SECUNDÁRIOS
    html.on('click', '.edit-secondary-stats-btn, .edit-resource-bar, .edit-lifting-st', ev => {
        ev.preventDefault();
 
        const attrs = this.actor.system.attributes;
        const t = key => game.i18n.localize(key);
        const tf = (key, data) => game.i18n.format(key, data);
        const getAttr = (key, fallback = 10) => attrs[key] ?? {
            value: fallback, max: fallback, mod: 0, passive: 0, temp: 0, points: 0, final: fallback
        };
        const fmt = (value) => Number(value) > 0 ? `+${value}` : Number(value) || 0;
        const safe = (value) => foundry.utils.escapeHTML(String(value ?? ""));
        const editorColumns = (firstColumn, secondColumn = "Base") => [
            firstColumn,
            t(`GUM.SecondaryEditor.Column.${secondColumn}`),
            t("GUM.SecondaryEditor.Column.Fixed"),
            t("GUM.SecondaryEditor.Column.Items"),
            t("GUM.SecondaryEditor.Column.Temporary"),
            t("GUM.SecondaryEditor.Column.Points"),
            t("GUM.SecondaryEditor.Column.Final")
        ].map(label => `<span>${label}</span>`).join("");
        const statRow = (key, label, { base = "value", step = 1, editableTemp = false } = {}) => {
            const stat = getAttr(key);
            return `
                <div class="secondary-editor-row">
                    <label for="secondary-${key}-${base}">${label}</label>
                    <input id="secondary-${key}-${base}" type="number" name="${key}.${base}" value="${stat[base] ?? stat.value ?? 0}" step="${step}" />
                    <input type="number" name="${key}.mod" value="${stat.mod ?? 0}" aria-label="${tf("GUM.SecondaryEditor.FixedModifierFor", { attribute: label })}" />
                    <span class="read-only" title="${t("GUM.SecondaryEditor.PassiveModifiersHint")}">${fmt(stat.passive)}</span>
                    ${editableTemp
                        ? `<input type="number" name="${key}.temp" value="${stat.temp ?? 0}" aria-label="${tf("GUM.SecondaryEditor.TemporaryModifierFor", { attribute: label })}" />`
                        : `<span class="read-only" title="${t("GUM.SecondaryEditor.TemporaryEffectsHint")}">${fmt(stat.temp)}</span>`}
                    <input type="number" name="${key}.points" value="${stat.points ?? 0}" aria-label="${tf("GUM.SecondaryEditor.PointsFor", { attribute: label })}" />
                    <span class="final-display" title="${t("GUM.SecondaryEditor.CurrentFinal")}">${stat.final ?? 0}</span>
                </div>`;
        };
        const physicalStatRow = (key, label, { movementProfile = false } = {}) => {
            const stat = getAttr(key, 0);
            const automatic = stat.automatic !== false && !movementProfile;
            const enabled = movementProfile ? stat.enabled === true : true;
            return `
                <div class="secondary-editor-row secondary-editor-row--physical" data-physical-attribute="${key}">
                    <div class="physical-attribute-heading">
                        <label for="secondary-${key}-value">
                            ${movementProfile ? `<input type="checkbox" class="physical-enabled-toggle" name="${key}.enabled" ${enabled ? "checked" : ""} aria-label="${t("GUM.SecondaryEditor.Physical.Enabled")}">` : ""}
                            <span>${label}</span>
                        </label>
                        ${movementProfile ? "" : `<label class="physical-auto-control" title="${t("GUM.SecondaryEditor.Physical.AutomaticHint")}"><input type="checkbox" class="physical-auto-toggle" name="${key}.automatic" ${automatic ? "checked" : ""}><span>${t("GUM.SecondaryEditor.Physical.AutomaticShort")}</span></label>`}
                    </div>
                    <div class="physical-base-control">
                        <input id="secondary-${key}-value" class="physical-base-input" type="number" name="${key}.value" value="${automatic ? (stat.calculated_base ?? stat.value ?? 0) : (stat.value ?? 0)}" step="0.01" ${automatic ? "disabled" : ""} />
                    </div>
                    <input type="number" name="${key}.mod" value="${stat.mod ?? 0}" step="0.01" aria-label="${tf("GUM.SecondaryEditor.FixedModifierFor", { attribute: label })}" />
                    <span class="read-only" title="${t("GUM.SecondaryEditor.PassiveModifiersHint")}">${fmt(stat.passive)}</span>
                    <span class="read-only" title="${t("GUM.SecondaryEditor.TemporaryEffectsHint")}">${fmt(stat.temp)}</span>
                    <input type="number" name="${key}.points" value="${stat.points ?? 0}" aria-label="${tf("GUM.SecondaryEditor.PointsFor", { attribute: label })}" />
                    <span class="final-display" title="${t("GUM.SecondaryEditor.CurrentFinal")}">${stat.final ?? 0}</span>
                </div>`;
        };

        const lifting = getAttr('lifting_st', 0);
        const dodge = getAttr('dodge');
        const damageRow = (key, label, placeholder) => {
            const damage = attrs[key] || {};
            return `<div class="secondary-editor-row">
                <label>${label}</label>
                <input type="text" name="${key}.value" value="${safe(damage.value)}" placeholder="${placeholder}" aria-label="${tf("GUM.SecondaryEditor.BaseFormulaFor", { attribute: label })}" />
                <input type="number" name="${key}.mod" value="${damage.mod ?? 0}" aria-label="${tf("GUM.SecondaryEditor.FixedModifierFor", { attribute: label })}" />
                <span class="read-only">${fmt(damage.passive)}</span>
                <span class="read-only" title="${t("GUM.SecondaryEditor.DamageTemporaryHint")}">${fmt(damage.temp)}</span>
                <input type="number" name="${key}.points" value="${damage.points ?? 0}" aria-label="${tf("GUM.SecondaryEditor.PointsFor", { attribute: label })}" />
                <span class="final-display">${safe(damage.final)}</span>
            </div>`;
        };
        const content = `
            <form class="secondary-stats-editor secondary-stats-editor--unified">
                <aside class="secondary-editor-nav" aria-label="${t("GUM.SecondaryEditor.Sections")}">
                    <button type="button" class="secondary-editor-tab active" data-panel="movement"><i class="fas fa-running"></i><span>${t("GUM.SecondaryEditor.Movement")}</span></button>
                    <button type="button" class="secondary-editor-tab" data-panel="resources"><i class="fas fa-heartbeat"></i><span>${t("GUM.SecondaryEditor.Resources")}</span></button>
                    <button type="button" class="secondary-editor-tab" data-panel="senses"><i class="fas fa-eye"></i><span>${t("GUM.SecondaryEditor.Senses")}</span></button>
                    <button type="button" class="secondary-editor-tab" data-panel="damage"><i class="fas fa-dice-d6"></i><span>${t("GUM.SecondaryEditor.Damage")}</span></button>
                    <button type="button" class="secondary-editor-tab" data-panel="physical"><i class="fas fa-person-running"></i><span>${t("GUM.SecondaryEditor.Physical.Tab")}</span></button>
                </aside>

                <div class="secondary-editor-workspace">
                    <header class="secondary-editor-intro">
                        <div><span class="secondary-editor-eyebrow">${t("GUM.SecondaryEditor.CharacterSheet")}</span><h2>${t("GUM.SecondaryEditor.Title")}</h2></div>
                        <p>${t("GUM.SecondaryEditor.IntroHint")}</p>
                    </header>

                    <div class="secondary-editor-scroll">
                        <section class="secondary-editor-panel active" data-panel="movement">
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-running"></i><div><h3>${t("GUM.SecondaryEditor.MobilityTitle")}</h3><p>${t("GUM.SecondaryEditor.MobilityHint")}</p></div></header>
                                <div class="secondary-editor-table">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"))}</div>
                                    ${statRow('basic_speed', t('GUM.SecondaryEditor.Attributes.BasicSpeed'), { step: 0.25 })}
                                    ${statRow('basic_move', t('GUM.SecondaryEditor.Attributes.BasicMove'))}
                                    ${statRow('enhanced_move', t('GUM.SecondaryEditor.Attributes.EnhancedMove'))}
                                    ${statRow('mt', t('GUM.SecondaryEditor.Attributes.SizeModifier'))}
                                    <div class="secondary-editor-row">
                                        <label>${t("GUM.SecondaryEditor.Attributes.Dodge")}</label>
                                        <span class="read-only">${Math.floor(Number(attrs.basic_speed?.final) || 0) + 3}</span>
                                        <input type="number" name="dodge.mod" value="${dodge.mod ?? 0}" aria-label="${tf("GUM.SecondaryEditor.FixedModifierFor", { attribute: t("GUM.SecondaryEditor.Attributes.Dodge") })}" />
                                        <span class="read-only">${fmt(dodge.passive)}</span><span class="read-only">${fmt(dodge.temp)}</span>
                                        <input type="number" name="dodge.points" value="${dodge.points ?? 0}" aria-label="${tf("GUM.SecondaryEditor.PointsFor", { attribute: t("GUM.SecondaryEditor.Attributes.Dodge") })}" />
                                        <span class="final-display">${dodge.final ?? 0}</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section class="secondary-editor-panel" data-panel="resources">
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-dumbbell"></i><div><h3>${t("GUM.SecondaryEditor.LiftingTitle")}</h3><p>${t("GUM.SecondaryEditor.LiftingHint")}</p></div></header>
                                <div class="secondary-editor-table">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"))}</div>
                                    <div class="secondary-editor-row">
                                        <label for="secondary-lifting-value">${t("GUM.SecondaryEditor.Attributes.LiftingStrength")}</label>
                                        <input id="secondary-lifting-value" type="number" name="lifting_st.value" value="${lifting.value ?? 0}" />
                                        <input type="number" name="lifting_st.mod" value="${lifting.mod ?? 0}" aria-label="${tf("GUM.SecondaryEditor.FixedModifierFor", { attribute: t("GUM.SecondaryEditor.Attributes.LiftingStrength") })}" />
                                        <span class="read-only">${fmt(lifting.passive)}</span>
                                        <input type="number" name="lifting_st.temp" value="${lifting.temp ?? 0}" aria-label="${tf("GUM.SecondaryEditor.TemporaryModifierFor", { attribute: t("GUM.SecondaryEditor.Attributes.LiftingStrength") })}" />
                                        <span class="read-only">—</span><span class="final-display">${lifting.final ?? lifting.final_computed ?? 0}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-heartbeat"></i><div><h3>${t("GUM.SecondaryEditor.ReservesTitle")}</h3><p>${t("GUM.SecondaryEditor.ReservesHint")}</p></div></header>
                                <div class="secondary-editor-table">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"), "Maximum")}</div>
                                    ${statRow('hp', t('GUM.SecondaryEditor.Attributes.HitPoints'), { base: 'max', editableTemp: true })}
                                    ${statRow('fp', t('GUM.SecondaryEditor.Attributes.FatiguePoints'), { base: 'max', editableTemp: true })}
                                </div>
                            </div>
                        </section>

                        <section class="secondary-editor-panel" data-panel="senses">
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-eye"></i><div><h3>${t("GUM.SecondaryEditor.SensesTitle")}</h3><p>${t("GUM.SecondaryEditor.SensesHint")}</p></div></header>
                                <div class="secondary-editor-table">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"))}</div>
                                    ${statRow('vision', t('GUM.SecondaryEditor.Attributes.Vision'))}${statRow('hearing', t('GUM.SecondaryEditor.Attributes.Hearing'))}${statRow('tastesmell', t('GUM.SecondaryEditor.Attributes.TasteSmell'))}${statRow('touch', t('GUM.SecondaryEditor.Attributes.Touch'))}
                                </div>
                            </div>
                        </section>

                        <section class="secondary-editor-panel" data-panel="damage">
                            <div class="secondary-editor-card secondary-damage-card">
                                <header><i class="fas fa-dice-d6"></i><div><h3>${t("GUM.SecondaryEditor.BasicDamageTitle")}</h3><p>${t("GUM.SecondaryEditor.BasicDamageHint")}</p></div></header>
                                <div class="secondary-editor-table">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Damage"))}</div>
                                    ${damageRow('thrust_damage', t('GUM.SecondaryEditor.Attributes.Thrust'), '1d6-2')}
                                    ${damageRow('swing_damage', t('GUM.SecondaryEditor.Attributes.Swing'), '1d6')}
                                    ${damageRow('thrust_damage_alt', t('GUM.SecondaryEditor.Attributes.AlternateThrust'), t('GUM.SecondaryEditor.Optional'))}
                                    ${damageRow('swing_damage_alt', t('GUM.SecondaryEditor.Attributes.AlternateSwing'), t('GUM.SecondaryEditor.Optional'))}
                                </div>
                            </div>
                        </section>

                        <section class="secondary-editor-panel" data-panel="physical">
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-route"></i><div><h3>${t("GUM.SecondaryEditor.Physical.MovementTitle")}</h3><p>${t("GUM.SecondaryEditor.Physical.MovementHint")}</p></div></header>
                                <div class="secondary-editor-table secondary-editor-table--physical">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"))}</div>
                                    ${physicalStatRow('air_move', t('GUM.SecondaryEditor.Attributes.AirMove'), { movementProfile: true })}
                                    ${physicalStatRow('water_move', t('GUM.SecondaryEditor.Attributes.WaterMove'), { movementProfile: true })}
                                    ${physicalStatRow('burrow_move', t('GUM.SecondaryEditor.Attributes.BurrowMove'), { movementProfile: true })}
                                    ${physicalStatRow('teleport_range', t('GUM.SecondaryEditor.Attributes.TeleportRange'), { movementProfile: true })}
                                </div>
                            </div>
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-person-arrow-up-from-line"></i><div><h3>${t("GUM.SecondaryEditor.Physical.JumpTitle")}</h3><p>${t("GUM.SecondaryEditor.Physical.JumpHint")}</p></div></header>
                                <div class="secondary-editor-table secondary-editor-table--physical">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"))}</div>
                                    ${physicalStatRow('jump_horizontal_standing', t('GUM.SecondaryEditor.Attributes.HorizontalJumpStanding'))}
                                    ${physicalStatRow('jump_horizontal_running', t('GUM.SecondaryEditor.Attributes.HorizontalJumpRunning'))}
                                    ${physicalStatRow('jump_vertical_standing', t('GUM.SecondaryEditor.Attributes.VerticalJumpStanding'))}
                                    ${physicalStatRow('jump_vertical_running', t('GUM.SecondaryEditor.Attributes.VerticalJumpRunning'))}
                                </div>
                            </div>
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-dumbbell"></i><div><h3>${t("GUM.SecondaryEditor.Physical.LiftingTitle")}</h3><p>${t("GUM.SecondaryEditor.Physical.LiftingHint")}</p></div></header>
                                <div class="secondary-editor-table secondary-editor-table--physical">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"))}</div>
                                    ${physicalStatRow('basic_lift', t('GUM.SecondaryEditor.Attributes.BasicLift'))}
                                </div>
                            </div>
                            <div class="secondary-editor-card">
                                <header><i class="fas fa-lungs"></i><div><h3>${t("GUM.SecondaryEditor.Physical.BreathingTitle")}</h3><p>${t("GUM.SecondaryEditor.Physical.BreathingHint")}</p></div></header>
                                <div class="secondary-editor-table secondary-editor-table--physical">
                                    <div class="secondary-editor-columns" aria-hidden="true">${editorColumns(t("GUM.SecondaryEditor.Column.Attribute"))}</div>
                                    ${physicalStatRow('breath_no_exertion', t('GUM.SecondaryEditor.Attributes.BreathNoExertion'))}
                                    ${physicalStatRow('breath_mild_exertion', t('GUM.SecondaryEditor.Attributes.BreathMildExertion'))}
                                    ${physicalStatRow('breath_heavy_exertion', t('GUM.SecondaryEditor.Attributes.BreathHeavyExertion'))}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
          </form>`;

        new Dialog({
            title: t("GUM.SecondaryEditor.DialogTitle"),
            content,
            render: (dialogHtml) => {
                dialogHtml.on('click', '.secondary-editor-tab', tabEvent => {
                    const panel = tabEvent.currentTarget.dataset.panel;
                    dialogHtml.find('.secondary-editor-tab').removeClass('active').attr('aria-selected', 'false');
                    dialogHtml.find('.secondary-editor-panel').removeClass('active');
                    $(tabEvent.currentTarget).addClass('active').attr('aria-selected', 'true');
                    dialogHtml.find(`.secondary-editor-panel[data-panel="${panel}"]`).addClass('active');
                });
                dialogHtml.on('change', '.physical-auto-toggle', toggleEvent => {
                    const row = toggleEvent.currentTarget.closest('[data-physical-attribute]');
                    const baseInput = row?.querySelector('.physical-base-input');
                    if (baseInput) baseInput.disabled = toggleEvent.currentTarget.checked;
                });
            },
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>', label: t("GUM.SecondaryEditor.Save"),
                    callback: (dialogHtml) => {
                        const formData = new FormDataExtended(dialogHtml.find('form')[0]).object;
                        const numericFields = [
                            "basic_speed.value", "basic_speed.mod", "basic_speed.points", "basic_move.value", "basic_move.mod", "basic_move.points",
                            "enhanced_move.value", "enhanced_move.mod", "enhanced_move.points", "mt.value", "mt.mod", "mt.points", "dodge.mod", "dodge.points",
                            "lifting_st.value", "lifting_st.mod", "lifting_st.temp", "hp.max", "hp.mod", "hp.temp", "hp.points", "fp.max", "fp.mod", "fp.temp", "fp.points",
                            "vision.value", "vision.mod", "vision.points", "hearing.value", "hearing.mod", "hearing.points",
                            "tastesmell.value", "tastesmell.mod", "tastesmell.points", "touch.value", "touch.mod", "touch.points",
                            "thrust_damage.mod", "thrust_damage.points", "swing_damage.mod", "swing_damage.points",
                            "thrust_damage_alt.mod", "thrust_damage_alt.points", "swing_damage_alt.mod", "swing_damage_alt.points",
                            "air_move.value", "air_move.mod", "air_move.points", "water_move.value", "water_move.mod", "water_move.points",
                            "burrow_move.value", "burrow_move.mod", "burrow_move.points", "teleport_range.value", "teleport_range.mod", "teleport_range.points",
                            "basic_lift.value", "basic_lift.mod", "basic_lift.points",
                            "jump_horizontal_standing.value", "jump_horizontal_standing.mod", "jump_horizontal_standing.points",
                            "jump_horizontal_running.value", "jump_horizontal_running.mod", "jump_horizontal_running.points",
                            "jump_vertical_standing.value", "jump_vertical_standing.mod", "jump_vertical_standing.points",
                            "jump_vertical_running.value", "jump_vertical_running.mod", "jump_vertical_running.points",
                            "breath_no_exertion.value", "breath_no_exertion.mod", "breath_no_exertion.points",
                            "breath_mild_exertion.value", "breath_mild_exertion.mod", "breath_mild_exertion.points",
                            "breath_heavy_exertion.value", "breath_heavy_exertion.mod", "breath_heavy_exertion.points"
                        ];
                        const updateData = {};
                        for (const field of numericFields) {
                            if (formData[field] !== undefined) updateData[`system.attributes.${field}`] = Number(formData[field]);
                        }
                        for (const field of ["thrust_damage.value", "swing_damage.value", "thrust_damage_alt.value", "swing_damage_alt.value"]) {
                            if (formData[field] !== undefined) updateData[`system.attributes.${field}`] = String(formData[field]).trim();
                        }
                        for (const key of ["air_move", "water_move", "burrow_move", "teleport_range"]) {
                            updateData[`system.attributes.${key}.enabled`] = dialogHtml.find(`[name="${key}.enabled"]`).prop("checked") === true;
                        }
                        for (const key of ["basic_lift", "jump_horizontal_standing", "jump_horizontal_running", "jump_vertical_standing", "jump_vertical_running", "breath_no_exertion", "breath_mild_exertion", "breath_heavy_exertion"]) {
                            const automatic = dialogHtml.find(`[name="${key}.automatic"]`).prop("checked") === true;
                            updateData[`system.attributes.${key}.automatic`] = automatic;
                            if (!automatic) {
                                updateData[`system.attributes.${key}.value`] = Number(dialogHtml.find(`[name="${key}.value"]`).val()) || 0;
                            }
                        }
                        
                        return this.actor.update(updateData);
                    }
                }
            },
            default: 'save'
        }, {
            classes: ["dialog", "gum", "secondary-stats-dialog", "secondary-stats-unified-dialog", "gum-sheet-edit-dialog"],
            width: 780, height: 480, resizable: true
        }).render(true);
    });

    // QUICK VIEW DOS EFEITOS APLICADOS
    html.on('click', '.effect-quick-view', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        const card = ev.currentTarget.closest('.effect-pill-enhanced');
        const effectId = card?.dataset.effectId || ev.currentTarget.dataset.effectId;
        if (!effectId) return;

        await this._renderActiveEffectQuickView(effectId, {
            effectItemUuid: card?.dataset.effectItemUuid || ev.currentTarget.dataset.effectItemUuid || "",
            originUuid: card?.dataset.originUuid || ev.currentTarget.dataset.originUuid || "",
            duration: card?.dataset.duration || "",
            sourceName: card?.dataset.sourceName || ""
        });
    });

    // ================================================================== //
    //   LISTENER: VISUALIZAÇÃO RÁPIDA (ITEM CARD)
    // ================================================================== //
    html.on('click', '.item-quick-view', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation(); 
        ev.stopImmediatePropagation(); // 🛑 Garante que não feche o acordeão

        const itemId = $(ev.currentTarget).closest('.item, .item-row').data('itemId') || $(ev.currentTarget).data('itemId');
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        // Chama sua função de renderização (mantida a lógica que você enviou)
        this._renderItemQuickView(item); 
    });
}

// -----------------------------------------------------------------------
// MÉTODO AUXILIAR - HTML COMPLETO DO EDITOR DE ATRIBUTOS SECUNDÁRIOS
// -----------------------------------------------------------------------
_getSecondaryStatsHTML(attrs, vision, hearing, tastesmell, touch, fmt) {
  // Helpers seguros (evita crash se algum atributo não existir)
  const safe = (obj, fallback = {}) => obj ?? fallback;

  const basic_speed = safe(attrs.basic_speed, { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });
  const basic_move  = safe(attrs.basic_move,  { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });
  const enhanced_move = safe(attrs.enhanced_move,  { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });
  const mt          = safe(attrs.mt,          { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });
  const dodge       = safe(attrs.dodge,       { value: 0, mod: 0, passive: 0, temp: 0, points: 0, final: 0 });

  return `
    <form class="secondary-stats-editor">
      <div class="form-header-grid">
        <span>Atributo</span>
        <span>Base</span>
        <span>Mod. Fixo</span>
        <span>Itens/Pass.</span>
        <span>Cond./Temp.</span>
        <span>Pontos</span>
        <span>Final</span>
      </div>

      <div class="form-grid-rows">

        <!-- Velocidade Básica -->
        <div class="form-row">
          <label>Velocidade</label>
          <input type="number" name="basic_speed.value" value="${basic_speed.value ?? 0}" step="0.25"/>
          <input type="number" name="basic_speed.mod" value="${basic_speed.mod ?? 0}"/>
          <span class="read-only">${fmt(basic_speed.passive ?? 0)}</span>
          <span class="read-only">${fmt(basic_speed.temp ?? 0)}</span>
          <input type="number" name="basic_speed.points" value="${basic_speed.points ?? 0}"/>
          <span class="final-display">${basic_speed.final ?? 0}</span>
        </div>

        <!-- Deslocamento -->
        <div class="form-row">
          <label>Deslocamento</label>
          <input type="number" name="basic_move.value" value="${basic_move.value ?? 0}"/>
          <input type="number" name="basic_move.mod" value="${basic_move.mod ?? 0}"/>
          <span class="read-only">${fmt(basic_move.passive ?? 0)}</span>
          <span class="read-only">${fmt(basic_move.temp ?? 0)}</span>
          <input type="number" name="basic_move.points" value="${basic_move.points ?? 0}"/>
          <span class="final-display">${basic_move.final ?? 0}</span>
        </div>

        <!-- Deslocamento Ampliado -->
        <div class="form-row">
          <label>Desloc. Ampliado</label>
          <input type="number" name="enhanced_move.value" value="${enhanced_move.value ?? 0}"/>
          <input type="number" name="enhanced_move.mod" value="${enhanced_move.mod ?? 0}"/>
          <span class="read-only">${fmt(enhanced_move.passive ?? 0)}</span>
          <span class="read-only">${fmt(enhanced_move.temp ?? 0)}</span>
          <input type="number" name="enhanced_move.points" value="${enhanced_move.points ?? 0}"/>
          <span class="final-display">${enhanced_move.final ?? 0}</span>
        </div>


        <!-- Modificador de Tamanho -->
        <div class="form-row">
          <label>MT</label>
          <input type="number" name="mt.value" value="${mt.value ?? 0}"/>
          <input type="number" name="mt.mod" value="${mt.mod ?? 0}"/>
          <span class="read-only">${fmt(mt.passive ?? 0)}</span>
          <span class="read-only">${fmt(mt.temp ?? 0)}</span>
          <input type="number" name="mt.points" value="${mt.points ?? 0}"/>
          <span class="final-display">${mt.final ?? 0}</span>
        </div>

        <!-- Esquiva (normalmente não editamos "value" direto, só mod/points) -->
        <div class="form-row">
          <label>Esquiva</label>
          <span class="read-only">${dodge.value ?? 0}</span>
          <input type="number" name="dodge.mod" value="${dodge.mod ?? 0}"/>
          <span class="read-only">${fmt(dodge.passive ?? 0)}</span>
          <span class="read-only">${fmt(dodge.temp ?? 0)}</span>
          <input type="number" name="dodge.points" value="${dodge.points ?? 0}"/>
          <span class="final-display">${dodge.final ?? 0}</span>
        </div>

        <hr/>

        <!-- Sentidos -->
        <div class="form-row">
          <label>Visão</label>
          <input type="number" name="vision.value" value="${vision.value ?? 0}"/>
          <input type="number" name="vision.mod" value="${vision.mod ?? 0}"/>
          <span class="read-only">${fmt(vision.passive ?? 0)}</span>
          <span class="read-only">${fmt(vision.temp ?? 0)}</span>
          <input type="number" name="vision.points" value="${vision.points ?? 0}"/>
          <span class="final-display">${vision.final ?? 0}</span>
        </div>

        <div class="form-row">
          <label>Audição</label>
          <input type="number" name="hearing.value" value="${hearing.value ?? 0}"/>
          <input type="number" name="hearing.mod" value="${hearing.mod ?? 0}"/>
          <span class="read-only">${fmt(hearing.passive ?? 0)}</span>
          <span class="read-only">${fmt(hearing.temp ?? 0)}</span>
          <input type="number" name="hearing.points" value="${hearing.points ?? 0}"/>
          <span class="final-display">${hearing.final ?? 0}</span>
        </div>

        <div class="form-row">
          <label>Olfato</label>
          <input type="number" name="tastesmell.value" value="${tastesmell.value ?? 0}"/>
          <input type="number" name="tastesmell.mod" value="${tastesmell.mod ?? 0}"/>
          <span class="read-only">${fmt(tastesmell.passive ?? 0)}</span>
          <span class="read-only">${fmt(tastesmell.temp ?? 0)}</span>
          <input type="number" name="tastesmell.points" value="${tastesmell.points ?? 0}"/>
          <span class="final-display">${tastesmell.final ?? 0}</span>
        </div>

        <div class="form-row">
          <label>Tato</label>
          <input type="number" name="touch.value" value="${touch.value ?? 0}"/>
          <input type="number" name="touch.mod" value="${touch.mod ?? 0}"/>
          <span class="read-only">${fmt(touch.passive ?? 0)}</span>
          <span class="read-only">${fmt(touch.temp ?? 0)}</span>
          <input type="number" name="touch.points" value="${touch.points ?? 0}"/>
          <span class="final-display">${touch.final ?? 0}</span>
        </div>

      </div>
    </form>

    <style>
      .secondary-stats-editor .form-header-grid,
      .secondary-stats-editor .form-row {
        display: grid;
        grid-template-columns: 110px 60px 60px 60px 60px 60px 60px;
        gap: 5px;
        align-items: center;
        text-align: center;
        margin-bottom: 5px;
      }
      .secondary-stats-editor .form-header-grid span {
        font-weight: bold;
        font-size: 0.85em;
        white-space: nowrap;
      }
      .secondary-stats-editor label {
        text-align: left;
        font-weight: bold;
        font-size: 0.9em;
      }
      .secondary-stats-editor input { text-align: center; }
      .secondary-stats-editor .read-only { color: #666; font-style: italic; }
      .secondary-stats-editor .final-display { font-weight: bold; color: #a53541; font-size: 1.1em; }
      .secondary-stats-editor hr { grid-column: 1 / -1; width: 100%; margin: 8px 0; opacity: 0.4; }
    </style>
  `;
}


// ================================================================== //
  //  MÉTODO AUXILIAR: VISUALIZAÇÃO RÁPIDA (QUICK VIEW)
  // ================================================================== //
  async _renderItemQuickView(item) {
    if (!item) return;
    return GumPreviewDialog.showItem(item, { actor: this.actor, sendToChat: true });


    // 1. Mapa de Nomes Legíveis
    const getTypeName = (type) => {
      const typeMap = {
        equipment: "Equipamento",
        melee_weapon: "Arma C. a C.",
        ranged_weapon: "Arma à Dist.",
        advantage: "Vantagem",
        disadvantage: "Desvantagem",
        skill: "Perícia",
        spell: "Magia",
        power: "Poder",
        condition: "Condição",
        modifier: "Modificador",
        eqp_modifier: "Mod. Equipamento",
        gm_modifier: "Modificador GM",
        effect: "Efeito",
        trigger: "Gatilho"
      };
      return typeMap[type] || type.toUpperCase();
    };

    // 2. Preparação de Dados Básicos
    const data = {
      name: item.name,
      img: item.img,
      type: getTypeName(item.type),
      system: item.system
    };

    // 3. Função Auxiliar para Criar Tags Visuais
    const createTag = (label, value) => {
      if (value !== null && value !== undefined && value !== '' && value.toString().trim() !== '') {
        return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
      }
      return '';
    };

    const refTags = this._parseReferenceCodes(item.system?.ref)
      .map(ref => `<a class="open-reference-link" data-ref="${ref.code}${ref.page}" title="Abrir referência">${ref.code}${ref.page}</a>`)
      .join(', ');

    // 4. Montagem das Tags Específicas por Tipo
    let mechanicalTagsHtml = '';
    const s = data.system;

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

      case 'skill':
        mechanicalTagsHtml += createTag('Attr.', `<span style="text-transform:uppercase">${s.base_attribute || '--'}</span>`);
        mechanicalTagsHtml += createTag('Nível', `${s.skill_level > 0 ? '+' : ''}${s.skill_level || '0'}`);
        mechanicalTagsHtml += createTag('Grupo', s.group);
        break;

      case 'spell':
        mechanicalTagsHtml += createTag('Class', s.spell_class);
        mechanicalTagsHtml += createTag('Conju', `${s.casting_time || '0'} / ${s.duration || 0}`);
        mechanicalTagsHtml += createTag('Custo', `${s.mana_cost || '0'} / ${s.mana_maint || '0'}`);
        break;

      case 'power':
        mechanicalTagsHtml += createTag('Ativação', `${s.activation_cost || '0'} / ${s.maint_cost || '0'}`);
        mechanicalTagsHtml += createTag('Duração', s.duration);
        break;

  case 'advantage':
      case 'disadvantage':
        mechanicalTagsHtml += createTag('Pontos', s.points);
        mechanicalTagsHtml += createTag('CR', s.self_control_roll);
        break;

      case 'equipment':
        mechanicalTagsHtml += createTag('TL', s.tech_level);
        mechanicalTagsHtml += createTag('LC', s.legality_class);
        break;

      case 'condition':
        mechanicalTagsHtml += createTag('Quando', s.when);
        mechanicalTagsHtml += createTag('Efeitos', Array.isArray(s.effects) ? s.effects.length : null);
        break;

      case 'modifier':
        mechanicalTagsHtml += createTag('Custo', s.cost);
        mechanicalTagsHtml += createTag('Nível', s.level);
        mechanicalTagsHtml += createTag('Efeito', s.applied_effect);
        break;

      case 'eqp_modifier':
        mechanicalTagsHtml += createTag('Custo', s.cost_factor);
        mechanicalTagsHtml += createTag('Peso', s.weight_mod);
        mechanicalTagsHtml += createTag('TL', s.tech_level_mod || s.tech_level);
        mechanicalTagsHtml += createTag('Tags', s.tags);
        break;

      case 'gm_modifier':
        mechanicalTagsHtml += createTag('Valor', s.modifier);
        mechanicalTagsHtml += createTag('Cap NH', s.nh_cap);
        mechanicalTagsHtml += createTag('Categoria', s.ui_category);
        break;

      case 'effect':
        mechanicalTagsHtml += createTag('Tipo', s.type);
        break;

      case 'trigger':
        mechanicalTagsHtml += createTag('Código', s.code ? 'Configurado' : 'Vazio');
        break;
    }

    // Adiciona Peso e Custo para itens físicos (se existirem)
    if (['equipment', 'melee_weapon', 'ranged_weapon'].includes(item.type)) {
       mechanicalTagsHtml += createTag('Qtd', `x${s.quantity || 1}`);
       mechanicalTagsHtml += createTag('Peso', s.total_weight ? `${s.total_weight} kg` : null);
       mechanicalTagsHtml += createTag('Custo', s.total_cost ? `$${s.total_cost}` : null);
    }

    mechanicalTagsHtml += createTag('REF', refTags);

    // 5. Enriquecimento da Descrição (Links, HTML, Secrets)
    const description = await TextEditorImpl.enrichHTML(s.chat_description || s.description || "<i>Sem descrição.</i>", {
      secrets: this.actor.isOwner,
      async: true
    });

    // 6. Montagem do Conteúdo HTML Final
    const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card" data-item-id="${item.id}">
                <header class="preview-header">
                    <img src="${data.img}" class="header-icon"/>
                    <div class="header-text">
                        <h3>${data.name}</h3>
                        <span class="preview-item-type">${data.type}</span>
                    </div>
                    <div class="header-controls">
                        <a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a>
                    </div>
                </header>
                
                <div class="preview-content">
                    <div class="preview-properties">
                        ${mechanicalTagsHtml}
                    </div>
                    
                    ${(description && description.trim() !== "<i>Sem descrição.</i>") ? '<hr class="preview-divider">' : ''}
                    
                    <div class="preview-description">
                        ${description}
                    </div>
                </div>
            </div>
        </div>
    `;

   // 7. Renderização do Dialog
    const hasMeaningfulDescription = description && description.trim() !== "<i>Sem descrição.</i>";

     new Dialog({
      title: `Detalhes: ${data.name}`,
      content: content,
      buttons: {},
      default: "",
      render: (html) => {
        html.find('.open-reference-link').on('click', this._onOpenReferenceLink.bind(this));

        // Listener do Botão "Enviar para o Chat"
        html.find('.send-to-chat').on('click', async () => {
          const chatDescriptionBlock = hasMeaningfulDescription
            ? `
              <div class="chat-description-actions">
                <button type="button" class="chat-show-details" aria-label="Ver detalhes do item">
                  <i class="fas fa-align-left"></i>
                  <span>Ver detalhes</span>
                </button>
                <div class="chat-description-payload" hidden>${description}</div>
              </div>
            `
            : '<div class="preview-description"><i>Sem descrição.</i></div>';

          const chatContent = `
            <div class="gurps-item-preview-card chat-card" data-item-id="${item.id}">
              <header class="preview-header">
                <img src="${data.img}" class="header-icon"/>
                <div class="header-text">
                  <h3>${data.name}</h3>
                  <span class="preview-item-type">${data.type}</span>
                </div>
              </header>
              <div class="preview-content">
                <div class="preview-properties">${mechanicalTagsHtml}</div>
                ${chatDescriptionBlock}
              </div>
            </div>
          `;

          await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: chatContent,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER
          });
          ui.notifications.info("Enviado para o chat.");
        });
      }
    }, {
      classes: ["gurps-item-preview-dialog"],
      width: 480,
      height: "auto",
      resizable: true
    }).render(true);
 }

  async _onOpenReferenceLink(event) {
    event.preventDefault();
    event.stopPropagation();

    const rawRef = (event.currentTarget?.dataset?.ref ?? '').toString().trim();
    if (!rawRef) return ui.notifications.warn("Preencha o campo REF antes de abrir a referência.");

    const parsedList = this._parseReferenceCodes(rawRef);
    if (!parsedList.length) return ui.notifications.warn("Formato de REF inválido. Use ex.: BA23 ou BA23, MA45.");

    if (parsedList.length === 1) return this._openSingleReference(parsedList[0]);
    return this._promptMultipleReferences(parsedList);
  }

  async _renderActiveEffectQuickView(effectId, { effectItemUuid = "", originUuid = "", duration = "", sourceName = "" } = {}) {
    const resolveItem = async (uuid) => {
      if (!uuid) return null;
      const document = await fromUuid(uuid).catch(() => null);
      return document?.documentName === "Item" ? document : null;
    };

    // O Item Effect é a descrição canônica do efeito aplicado. A origem fica
    // como compatibilidade para efeitos antigos que ainda não gravavam effectUuid.
    const sourceItem = await resolveItem(effectItemUuid) || await resolveItem(originUuid);
    if (sourceItem) return this._renderItemQuickView(sourceItem);

    const effect = this.actor.effects?.get(effectId);
    if (!effect) {
      return ui.notifications.warn(game.i18n.localize("GUM.Conditions.EffectNotFound"));
    }

    const statuses = Array.from(effect.statuses || [])
      .map((statusId) => CONFIG.statusEffects.find((entry) => entry.id === statusId)?.name || statusId)
      .filter(Boolean)
      .join(", ");
    const descriptionSource = effect.description
      || foundry.utils.getProperty(effect, "flags.gum.description")
      || game.i18n.localize("GUM.Conditions.NoDescription");
    const description = await GumPreviewDialog.enrichDescription(descriptionSource, { secrets: this.actor.isOwner });
    const tags = [
      { label: game.i18n.localize("GUM.Conditions.PreviewState"), value: game.i18n.localize(effect.disabled ? "GUM.Conditions.Disabled" : "GUM.Conditions.Active") },
      { label: game.i18n.localize("GUM.Conditions.PreviewDuration"), value: duration },
      { label: game.i18n.localize("GUM.Conditions.PreviewSource"), value: sourceName },
      { label: game.i18n.localize("GUM.Conditions.PreviewStatuses"), value: statuses },
      { label: game.i18n.localize("GUM.Conditions.PreviewChanges"), value: Array.from(effect.changes || []).length || null }
    ];

    return GumPreviewDialog.show({
      title: effect.name,
      type: GumPreviewDialog.typeLabel("effect"),
      img: effect.img,
      description,
      tags,
      actor: this.actor,
      sourceUuid: effect.uuid,
      sendToChat: true,
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
    });
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

  _setPdfPageInUrl(url, page) {
    if (!url) return url;
    const [base, rawHash = ''] = url.split('#');
    const hash = rawHash.trim();

    if (!hash) return `${base}#page=${page}`;

    if (hash.includes('=')) {
      const params = new URLSearchParams(hash);
      params.set('page', String(page));
      return `${base}#${params.toString()}`;
    }

    return `${base}#page=${page}`;
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
      // sandbox/cross-origin ou ainda não carregou
    }

    const current = iframe.getAttribute("src") || "";
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

  async _openPdfReferencePage(page, targetPage) {
    const journal = page?.parent;
    if (!journal) return false;

    const target = Math.max(1, Number(targetPage) || 1);
    const sourcePath = (page.src ?? page.system?.src ?? "").toString();

    await journal.sheet.render(true, { pageId: page.id, mode: "view" });

    const tryPosition = () => {
      const frames = this._findPdfViewerIframesBySource(sourcePath);
      const fallback = frames.length
        ? frames
        : Array.from(document.querySelectorAll('iframe[src*="pdfjs" i], iframe[src*="viewer.html" i]'));
      if (!fallback.length) return false;

      let ok = false;
      for (const f of fallback) ok = this._setPageOnPdfViewerIframe(f, target) || ok;
      return ok;
    };

    const delays = [0, 80, 180, 350, 600, 900, 1300, 1800, 2500];
    for (const d of delays) {
      await new Promise(r => setTimeout(r, d));
      if (tryPosition()) return true;
    }

    const frames = this._findPdfViewerIframesBySource(sourcePath);
    for (const f of frames) {
      f.addEventListener("load", () => {
        try { this._setPageOnPdfViewerIframe(f, target); } catch (_e) {}
      }, { once: true });
    }

    return false;
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

_renderQuickView(item) {
   // Mesma lógica para o Quick View de Origem
   this._renderItemQuickView(item);
}

  /**
   * Salva o estado (aberto/fechado) das caixas colapsáveis nas Flags do ator
   */
  async _onDetailsToggle(event) {
    const details = event.currentTarget;
    if (details.dataset.skillSearchManaged === 'true' || details.dataset.characteristicSearchManaged === 'true') return;
    
    // Verifica se o elemento tem um ID de grupo para salvar
    const groupId = details.dataset.groupId;
    if (!groupId) return; // Se não tiver ID, não salva

    const isOpen = details.open; // True se aberto, False se fechado

    // Salva dentro de 'flags.gum.sheetCollapsedState'
    // O 'gum' é o ID do seu sistema/módulo. Se for outro nome, troque aqui.
    await this.actor.setFlag('gum', `sheetCollapsedState.${groupId}`, isOpen);
  }




async _onRecalculateSecondaryStats(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const t = key => game.i18n.localize(key);
  const tf = (key, data) => game.i18n.format(key, data);

    let plan;
  try {
    plan = this._buildSecondaryStatsRecalculationPlan();
  } catch (error) {
    console.error("GUM | Falha ao construir prévia de atributos derivados", error);
    ui.notifications.error(t("GUM.SecondaryRecalculation.Error.Build"));
    return;
  }

const renderPreview = async (currentPlan, considerBasicSpeedFixedModifier = false) => {
    const groups = [
      ["resources", "GUM.SecondaryRecalculation.Groups.Resources", "fas fa-heart"], ["physical", "GUM.SecondaryRecalculation.Groups.Physical", "fas fa-dumbbell"],
      ["movement", "GUM.SecondaryRecalculation.Groups.Movement", "fas fa-running"], ["senses", "GUM.SecondaryRecalculation.Groups.Senses", "fas fa-eye"],
      ["damage", "GUM.SecondaryRecalculation.Groups.Damage", "fas fa-fist-raised"]
    ].map(([id, labelKey, icon]) => {
      const entries = currentPlan.filter(entry => entry.group === id);
      return { id, label: t(labelKey), icon, entries, changedCount: entries.filter(entry => entry.changed).length };
    });
    return renderTemplate("systems/gum/templates/apps/secondary-stats-recalculation.hbs", { groups, considerBasicSpeedFixedModifier });
  };
  const content = await renderPreview(plan);
  const activatePreview = html => {
    const handleCalculationModeChange = async considerBasicSpeedFixedModifier => {
      plan = this._buildSecondaryStatsRecalculationPlan({ considerBasicSpeedFixedModifier });
      const replacement = await renderPreview(plan, considerBasicSpeedFixedModifier);
      html.find(".secondary-stats-preview").replaceWith(replacement);
      activatePreview(html);
    };
    this._activateSecondaryStatsPreview(html, plan, handleCalculationModeChange);
  };

  new Dialog({
    title: t("GUM.SecondaryRecalculation.DialogTitle"),
    content,
    buttons: {
      apply: {
        icon: '<i class="fas fa-check"></i>', label: t("GUM.SecondaryRecalculation.Apply"),
        callback: async html => {
          const selectedIds = html.find('input[name="secondary-stat"]:checked').map((_, input) => input.value).get();
          const updateData = buildSecondaryStatsUpdateData(plan, selectedIds);
          if (!Object.keys(updateData).length) return;
          try {
            await this.actor.update(updateData);
            this.render(false);
            ui.notifications.info(tf("GUM.SecondaryRecalculation.Success", { count: selectedIds.length }));
          } catch (error) {
            console.error("GUM | Falha ao aplicar atributos derivados", error);
            ui.notifications.error(t("GUM.SecondaryRecalculation.Error.Apply"));
          }
        }
      },
      cancel: { icon: '<i class="fas fa-times"></i>', label: t("GUM.SecondaryRecalculation.Cancel") }
    },
    default: "apply",
    render: activatePreview
  }, { classes: ["dialog", "gum", "secondary-stats-recalculation-dialog"], width: 680, height: "auto" }).render(true);
}

_buildSecondaryStatsRecalculationPlan(options = {}) {
  return buildSecondaryStatsRecalculationPlan(this.actor.system, st => this._getBasicDamageFromST(st), {
    ...options,
    localize: (key, data = {}) => game.i18n.format(key, data)
  });
}

_activateSecondaryStatsPreview(html, plan, onCalculationModeChange = null) {
  const fields = html.find('input[name="secondary-stat"]');
  const applyButton = html.closest(".app").find('button[data-button="apply"]');
  const updateState = () => {
    const count = fields.filter(":checked").length;
    applyButton.prop("disabled", count === 0).html(`<i class="fas fa-check"></i> ${game.i18n.format("GUM.SecondaryRecalculation.ApplyCount", { count })}`);
    html.find(".secondary-stat-row").each((_, row) => row.classList.toggle("selected", row.querySelector('input[name="secondary-stat"]')?.checked));
    html.find(".secondary-group-toggle").each((_, toggle) => {
      const groupFields = fields.filter(`[data-group="${toggle.dataset.group}"]:not(:disabled)`);
      toggle.checked = groupFields.length > 0 && groupFields.filter(":checked").length === groupFields.length;
      toggle.indeterminate = groupFields.filter(":checked").length > 0 && !toggle.checked;
    });
    const selected = new Set(fields.filter(":checked").map((_, input) => input.value).get());
    html.find(".secondary-dependency-warning").each((_, warning) => {
      const dependencies = (warning.dataset.dependencies || "").split(",").filter(id => plan.some(entry => entry.id === id));
      warning.hidden = !dependencies.some(id => !selected.has(id));
    });
  };
  fields.on("change", updateState);
  html.find(".secondary-group-selector").on("click", event => event.stopPropagation());
  html.find(".secondary-group-toggle").on("change", event => {
    fields.filter(`[data-group="${event.currentTarget.dataset.group}"]:not(:disabled)`).prop("checked", event.currentTarget.checked);
    updateState();
  });
  html.find('[data-action="recommended"]').on("click", () => fields.each((_, input) => { input.checked = plan.find(entry => entry.id === input.value)?.selectedByDefault === true; }).trigger("change"));
  html.find('[data-action="all"]').on("click", () => fields.not(":disabled").prop("checked", true).trigger("change"));
  html.find('[data-action="none"]').on("click", () => fields.prop("checked", false).trigger("change"));
  html.find('[data-action="unchanged"]').on("click", event => {
    const shown = html.toggleClass("show-unchanged").hasClass("show-unchanged");
    event.currentTarget.setAttribute("aria-pressed", String(shown));
  });
    html.find('input[name="consider-basic-speed-fixed-modifier"]').on("change", event => {
    onCalculationModeChange?.(event.currentTarget.checked);
  });
  updateState();
}

_getBasicDamageFromST(stValue) {
  const st = Math.max(1, Math.floor(Number(stValue) || 1));
  const table = {
   1: { thrust: "1d6-6", swing: "1d6-5" },
    2: { thrust: "1d6-6", swing: "1d6-5" },
    3: { thrust: "1d6-5", swing: "1d6-4" },
    4: { thrust: "1d6-5", swing: "1d6-4" },
    5: { thrust: "1d6-4", swing: "1d6-3" },
    6: { thrust: "1d6-4", swing: "1d6-3" },
    7: { thrust: "1d6-3", swing: "1d6-2" },
    8: { thrust: "1d6-3", swing: "1d6-2" },
    9: { thrust: "1d6-2", swing: "1d6-1" },
    10: { thrust: "1d6-2", swing: "1d6" },
    11: { thrust: "1d6-1", swing: "1d6+1" },
    12: { thrust: "1d6-1", swing: "1d6+2" },
    13: { thrust: "1d6", swing: "2d6-1" },
    14: { thrust: "1d6", swing: "2d6" },
    15: { thrust: "1d6+1", swing: "2d6+1" },
    16: { thrust: "1d6+1", swing: "2d6+2" },
    17: { thrust: "1d6+2", swing: "3d6-1" },
    18: { thrust: "1d6+2", swing: "3d6" },
    19: { thrust: "2d6-1", swing: "3d6+1" },
    20: { thrust: "2d6-1", swing: "3d6+2" },
    21: { thrust: "2d6", swing: "4d6-1" },
    22: { thrust: "2d6", swing: "4d6" },
    23: { thrust: "2d6+1", swing: "4d6+1" },
    24: { thrust: "2d6+1", swing: "4d6+2" },
    25: { thrust: "2d6+2", swing: "5d6-1" },
    26: { thrust: "2d6+2", swing: "5d6" },
    27: { thrust: "3d6-1", swing: "5d6+1" },
    28: { thrust: "3d6-1", swing: "5d6+1" },
    29: { thrust: "3d6", swing: "5d6+2" },
    30: { thrust: "3d6", swing: "5d6+2" }
  };

  if (table[st]) return table[st];

  const bonusDice = Math.floor((st - 30) / 10);
  const thrustDice = 3 + bonusDice;
  const swingDice = 5 + (bonusDice * 2);

  return {
    thrust: formatBasicDamageDiceCount(thrustDice),
    swing: formatBasicDamageDiceCount(swingDice)
  };
}

/**
 * Abre um diálogo simples para editar as fórmulas de Dano Básico (GdP/GeB).
 * Campos: system.attributes.thrust_damage e system.attributes.swing_damage
 */
async _onEditBasicDamage(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const t = key => game.i18n.localize(key);

  const attrs = this.actor.system.attributes || {};
  const thrust = attrs.thrust_damage?.value ?? "";
  const swing = attrs.swing_damage?.value ?? "";
  const thrustAlt = attrs.thrust_damage_alt?.value ?? "";
  const swingAlt = attrs.swing_damage_alt?.value ?? "";

  const content = `
    <form class="gum-dialog-content basic-damage-editor">
      <div class="form-group">
        <label>${t("GUM.Combat.BasicDamage.Thrust")}</label>
        <input type="text" name="thrust" value="${thrust}" placeholder="ex: 1d6-2" />
      </div>
      <div class="form-group">
        <label>${t("GUM.Combat.BasicDamage.Swing")}</label>
        <input type="text" name="swing" value="${swing}" placeholder="ex: 1d6" />
      </div>
      <hr/>
      <div class="form-group">
        <label>${t("GUM.Combat.BasicDamage.ThrustAlt")}</label>
        <input type="text" name="thrust_alt" value="${thrustAlt}" placeholder="ex: 2d6-1" />
      </div>
      <div class="form-group">
        <label>${t("GUM.Combat.BasicDamage.SwingAlt")}</label>
        <input type="text" name="swing_alt" value="${swingAlt}" placeholder="ex: 2d6" />
      </div>
      <p style="opacity:0.75; font-size: 12px; margin-top: 8px;">
        ${t("GUM.Combat.BasicDamage.Hint")}
      </p>
    </form>
  `;

  return new Dialog({
    title: t("GUM.Combat.BasicDamage.EditTitle"),
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: t("GUM.Skills.Save"),
        callback: async (html) => {
          const form = html.find("form")[0];
          const fd = new FormData(form);
          const update = {
            "system.attributes.thrust_damage.value": (fd.get("thrust") ?? "").toString().trim(),
            "system.attributes.swing_damage.value": (fd.get("swing") ?? "").toString().trim(),
            "system.attributes.thrust_damage_alt.value": (fd.get("thrust_alt") ?? "").toString().trim(),
            "system.attributes.swing_damage_alt.value": (fd.get("swing_alt") ?? "").toString().trim()
          };
          await this.actor.update(update);
        }
      },
      cancel: { icon: '<i class="fas fa-times"></i>', label: t("GUM.Skills.Cancel") }
    },
    default: "save"
  }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog"], width: 360 }).render(true);
}

async _onViewHitLocations(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const actor = this.actor;
  const t = key => game.i18n.localize(key);
  const tf = (key, data) => game.i18n.format(key, data);
  const profiles = listBodyProfiles();
  const currentProfileId = actor.system.combat?.body_profile || "humanoid";
  const sheetData = await this.getData();
  const effectiveLocationOrder = sheetData.hitLocationOrder || getBodyProfileLocationKeys(getBodyProfile(currentProfileId));
  const effectiveLocationSources = actor.system.combat?.dr_location_sources || {};
  const additionalLocations = actor.system.combat?.additional_locations || {};
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

  // Pega todos os objetos de RD
  const actorDR_Armor = actor.system.combat.dr_from_armor || {};
  const actorDR_Mods  = actor.system.combat.dr_mods || {};
  const actorDR_Temp  = actor.system.combat.dr_temp_mods || {};
    const actorDR_Passive = actor.system.combat.dr_passive_mods || {};
  const actorDR_Overrides = actor.system.combat.dr_overrides || {};
  const actorDR_Computed = actor.system.combat.dr_final_computed || {};
  const actorDR_Total = actor.system.combat.dr_locations || {};

   let tableRows = "";
  const locationOrder = effectiveLocationOrder;

  for (const key of locationOrder) {
    const loc = sheetData.hitLocations?.[key];
    if (!loc) continue;
    const locationLabel = localizeBodyLocationLabel(key, loc, t);
    const armorDR_String  = this._formatDRObjectToString(actorDR_Armor[key]);
    const tempDR_String   = this._formatDRObjectToString(actorDR_Temp[key]);
    const passiveDR_String = this._formatDRObjectToString(actorDR_Passive[key]);
    const manualMod_String= this._formatDRObjectToString(actorDR_Mods[key]);
    const overrideDR_String = this._formatDROverrideToString(actorDR_Overrides[key]);
    const computedDR_String = this._formatDRObjectToString(actorDR_Computed[key]);
    const totalDR_String  = this._formatDRObjectToString(actorDR_Total[key]);

    const equipmentSources = describeBodyLocationSources(effectiveLocationSources[key]);
    const sourceBadges = equipmentSources.map(source => `<span class="gum-rd-source-badge" title="${escapeHtml(tf("GUM.Combat.DR.ProvidedByEquipment", { source }))}"><i class="fas fa-toolbox"></i></span>`).join("");
    const removeButton = Object.prototype.hasOwnProperty.call(additionalLocations, key)
      ? `<button type="button" class="gum-rd-remove-location" data-location-key="${escapeHtml(key)}" title="${t("GUM.Combat.DR.RemoveAdditionalLocation")}"><i class="fas fa-times"></i></button>`
      : "";
    tableRows += `
      <div class="table-row">
        <div class="loc-label"><span>${escapeHtml(locationLabel)}</span>${sourceBadges}${removeButton}</div>
        <div class="loc-rd-armor" title="${t("GUM.Combat.DR.Armor")}">${armorDR_String}</div>
        <div class="loc-rd-temp" title="${t("GUM.Combat.DR.Temporary")}">${tempDR_String}</div>
        <div class="loc-rd-passive" title="${t("GUM.Combat.DR.Permanent")}">${passiveDR_String}</div>
        <div class="loc-rd-mod"><input type="text" name="${key}" value="${manualMod_String}" aria-label="${tf("GUM.Combat.DR.ManualFor", { location: locationLabel })}" /></div>
        <div class="loc-rd-total" title="${tf("GUM.Combat.DR.ComputedHint", { value: computedDR_String })}"><strong>${totalDR_String}</strong></div>
        <div class="loc-rd-override" title="${t("GUM.Combat.DR.OverrideHint")}">${overrideDR_String}</div>
      </div>
    `;
  }

  const profileOptionsHtml = profiles.map(p =>
  `<option value="${p.id}" ${p.id === currentProfileId ? "selected" : ""}>${localizeBodyProfileLabel(p, t)}</option>`
).join("");

const profileSelectorHtml = `
  <div class="gum-rd-profile-card">
    <div class="gum-rd-profile-copy">
      <span class="gum-rd-eyebrow"><i class="fas fa-shield-alt"></i> ${t("GUM.Combat.DR.ProtectionConfig")}</span>
      <label for="gum-rd-body-profile">${t("GUM.Combat.DR.BodyType")}</label>
      <span class="gum-rd-profile-hint">${t("GUM.Combat.DR.BodyTypeHint")}</span>
    </div>
    <select id="gum-rd-body-profile" class="gum-body-profile-select" name="body_profile" aria-label="${t("GUM.Combat.DR.BodyType")}">
      ${profileOptionsHtml}
    </select>
    <button type="button" class="gum-rd-add-location"><i class="fas fa-plus"></i> ${t("GUM.Combat.DR.AddLocation")}</button>
  </div>
`;

  const content = `
  <form class="gum-rd-form">
    ${profileSelectorHtml}

    <div class="gurps-rd-table">
        <div class="gum-rd-table-title">
          <div>
            <span class="gum-rd-eyebrow">${t("GUM.Combat.DR.DamageResistance")}</span>
            <strong>${t("GUM.Combat.DR.HitLocations")}</strong>
          </div>
          <span class="gum-rd-table-help"><i class="fas fa-pen"></i> ${t("GUM.Combat.DR.ManualOnlyHint")}</span>
        </div>
        <div class="table-header">
          <div>${t("GUM.Combat.DR.Location")}</div>
          <div>${t("GUM.Combat.DR.ArmorColumn")}</div>
          <div>${t("GUM.Combat.DR.TemporaryColumn")}</div>
          <div>${t("GUM.Combat.DR.PermanentColumn")}</div>
          <div>${t("GUM.Combat.DR.Manual")}</div>
          <div>${t("GUM.Combat.DR.Total")}</div>
          <div title="${t("GUM.Combat.DR.OverrideHint")}">${t("GUM.Combat.DR.Override")}</div>
        </div>
        <div class="table-body">
          ${tableRows}
        </div>
      </div>
    </form>
  `;

const dlg = new Dialog({
  title: t("GUM.Combat.DR.DialogTitle"),
  content,
  buttons: {
    save: {
      icon: '<i class="fas fa-save"></i>',
      label: t("GUM.Combat.DR.Save"),
      callback: async (html) => {
        const form = html.find("form")[0];
        const formData = new FormDataExtended(form).object;

        // ✅ IMPORTANTE: remove o campo do dropdown para não virar dr_mods.body_profile
        delete formData.body_profile;

        const newDrMods = {};
        for (const [loc, drString] of Object.entries(formData)) {
          newDrMods[loc] = this._parseDRStringToObject(drString);
        }

        await actor.update({ "system.combat.dr_mods": newDrMods });
      }
    },
    cancel: { icon: '<i class="fas fa-times"></i>', label: t("GUM.Combat.DR.Cancel") }
  },
  default: "save",

  // ✅ AQUI é onde entra o "render" (fica DENTRO do primeiro objeto do Dialog)
  render: (dialogHtml) => {
    dialogHtml.on("click", ".gum-rd-add-location", async () => {
      const used = new Set(effectiveLocationOrder);
      const availableLocationOptions = listBodyLocations()
        .filter(location => !used.has(location.id))
        .map(location => ({
          id: location.id,
          label: localizeBodyLocationLabel(location.id, getBodyLocationDefinition(location.id), t)
        }));
      const locationSuggestions = availableLocationOptions
        .map(location => `<option value="${escapeHtml(location.label)}"></option>`)
        .join("");
      new Dialog({
        title: t("GUM.Combat.DR.AddLocation"),
        content: `<form class="gum-rd-add-location-form">
          <div class="form-group"><label>${t("GUM.Combat.DR.LocationSearch")}</label><input type="text" name="location" list="gum-rd-location-suggestions" placeholder="${t("GUM.Combat.DR.LocationSearchPlaceholder")}" autocomplete="off"/><datalist id="gum-rd-location-suggestions">${locationSuggestions}</datalist></div>
          <p class="notes">${t("GUM.Combat.DR.LocationSearchHint")}</p>
          <div class="form-group"><label>${t("GUM.Combat.DR.CustomLocationRoll")}</label><input type="text" name="roll" placeholder="--"/></div>
        </form>`,
        buttons: {
          add: { icon: '<i class="fas fa-plus"></i>', label: t("GUM.Combat.DR.AddLocation"), callback: async html => {
            const form = html.find("form")[0];
            const data = new FormDataExtended(form).object;
            const requestedLocation = String(data.location || "").trim();
            if (!requestedLocation) return ui.notifications.warn(t("GUM.Combat.DR.LocationRequired"));
            const normalizeLocation = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
            const normalizedRequestedLocation = normalizeLocation(requestedLocation);
            const selectedLocation = availableLocationOptions.find(location =>
              normalizeLocation(location.label) === normalizedRequestedLocation || normalizeLocation(location.id) === normalizedRequestedLocation
            );
            const key = selectedLocation?.id || `custom_${foundry.utils.randomID(8)}`;
            const definition = getBodyLocationDefinition(key);
            const label = selectedLocation?.label || definition?.label || definition?.name || requestedLocation;
            const next = foundry.utils.deepClone(additionalLocations);
            next[key] = { label, name: label, roll: String(data.roll || definition?.roll || "--").trim() || "--" };
            await actor.update({ "system.combat.additional_locations": next });
            dlg.close();
            await this._onViewHitLocations({ preventDefault() {}, stopPropagation() {} });
          }},
          cancel: { icon: '<i class="fas fa-times"></i>', label: t("GUM.Combat.DR.Cancel") }
        },
        default: "add"
      }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog"], width: 420 }).render(true);
    });

    dialogHtml.on("click", ".gum-rd-remove-location", async event => {
      const key = event.currentTarget.dataset.locationKey;
      if (!key || !Object.prototype.hasOwnProperty.call(additionalLocations, key)) return;
      await actor.update({
        [`system.combat.additional_locations.-=${key}`]: null,
        [`system.combat.dr_mods.-=${key}`]: null
      });
      dlg.close();
      await this._onViewHitLocations({ preventDefault() {}, stopPropagation() {} });
    });

    // Quando trocar o tipo corporal:
    dialogHtml.on("change", ".gum-body-profile-select", async (e) => {
      const newProfileId = e.currentTarget.value;
      if (!newProfileId || newProfileId === currentProfileId) return;

      // Salva o perfil corporal no ator
      await actor.update({ "system.combat.body_profile": newProfileId });

      // Fecha este dialog
      dlg.close();

      // Reabre o dialog já com o novo perfil (recalcula hitLocations)
      const fakeEv = { preventDefault() {}, stopPropagation() {} };
      await this._onViewHitLocations(fakeEv);
    });
  }

}, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-rd-edit-dialog"], width: 780 });

dlg.render(true);

}

_setupActionMenuListeners(html) {
  const namespace = `.gumActionMenu-${this.appId}`;
  $(document).off(`click${namespace}`);
  $(document).on(`click${namespace}`, (ev) => this._handleDocumentActionMenuClick(ev));

  html.on("click", ".js-action-menu-toggle", (ev) => this._onActionMenuToggle(ev));
  html.on("click", ".js-action-menu-panel .gum-action-menu__item", () => this._closeAllActionMenus());
}

_handleDocumentActionMenuClick(ev) {
  if (!this.element?.length) return;
  if ($(ev.target).closest(".js-action-menu").length) return;
  this._closeAllActionMenus();
}

_onActionMenuToggle(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const menu = ev.currentTarget.closest(".js-action-menu");
  if (!menu) return;

  const isOpen = menu.classList.contains("is-open");
  this._closeAllActionMenus();

   if (!isOpen) {
    const controls = menu.closest(".item-controls");
    if (controls) controls.classList.add("menu-open");
  const actionMenuRow = menu.closest(".skill-tree-item, .characteristic-card, .spell-row-v3, .magic-card, .social-card, .meter-card, .effect-pill-enhanced");
    if (actionMenuRow) actionMenuRow.classList.add("action-menu-open-row");
    const toggle = menu.querySelector(".js-action-menu-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    // Position while the panel is still invisible to avoid a frame rendered
    // beneath neighboring cards before its final coordinates are known.
    this._positionActionMenu(menu);
    menu.classList.add("is-open");
  }
}

_positionActionMenu(menu) {
  if (!menu) return;

  menu.classList.remove("is-open-up");
  const panel = menu.querySelector(".js-action-menu-panel");
  const toggle = menu.querySelector(".js-action-menu-toggle");
  if (!panel || !toggle) return;

  const toggleRect = toggle.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const panelWidth = panelRect.width || panel.offsetWidth || 140;
  const panelHeight = panelRect.height || panel.offsetHeight || 0;
  const gap = 4;
  const viewportPadding = 8;
  const spaceBelow = window.innerHeight - toggleRect.bottom - viewportPadding;
  const spaceAbove = toggleRect.top - viewportPadding;
  const shouldOpenUp = spaceBelow < (panelHeight + gap) && spaceAbove > spaceBelow;
  const left = Math.min(
    Math.max(toggleRect.right - panelWidth, viewportPadding),
    Math.max(window.innerWidth - panelWidth - viewportPadding, viewportPadding)
  );
  const top = shouldOpenUp
    ? Math.max(toggleRect.top - panelHeight - gap, viewportPadding)
    : Math.min(toggleRect.bottom + gap, Math.max(window.innerHeight - panelHeight - viewportPadding, viewportPadding));

  if (shouldOpenUp) menu.classList.add("is-open-up");
  panel.style.setProperty("--gum-action-menu-x", `${Math.round(left)}px`);
  panel.style.setProperty("--gum-action-menu-y", `${Math.round(top)}px`);
}

_closeAllActionMenus() {
  if (!this.element?.length) return;
  this.element.find(".item-controls.menu-open").removeClass("menu-open");
  this.element.find(".skill-tree-item.action-menu-open-row, .characteristic-card.action-menu-open-row, .magic-card.action-menu-open-row, .social-card.action-menu-open-row, .effect-pill-enhanced.action-menu-open-row").removeClass("action-menu-open-row");
  this.element.find(".js-action-menu.is-open, .js-action-menu.is-open-up").removeClass("is-open is-open-up")
    .find(".js-action-menu-toggle").attr("aria-expanded", "false");
}

async close(options = {}) {
  $(document).off(`click.gumActionMenu-${this.appId}`);
  return super.close(options);
}

async _onAddCombatMeter(ev) {
  ev.preventDefault();
  const meterData = await this._promptCombatMeterData({}, { isEdit: false });
  if (!meterData) return;

  const meterId = foundry.utils.randomID();
  await this.actor.update({ [`system.combat.combat_meters.${meterId}`]: meterData });
}

async _onEditCombatMeter(ev) {
  ev.preventDefault();
  const equipmentId = ev.currentTarget.closest(".meter-card")?.dataset?.equipmentId;
  if (equipmentId) return this.actor.items.get(equipmentId)?.sheet?.render(true);
  const meterId = ev.currentTarget.closest(".meter-card")?.dataset?.meterId;
  if (!meterId) return;

  const existing = this.actor.system.combat.combat_meters?.[meterId];
  const meterData = await this._promptCombatMeterData(existing, { isEdit: true });
  if (!meterData) return;

  await this.actor.update({ [`system.combat.combat_meters.${meterId}`]: meterData });
}

async _onDeleteCombatMeter(ev) {
  ev.preventDefault();
  const meterId = ev.currentTarget.closest(".meter-card")?.dataset?.meterId;
  if (!meterId) return;

  const name = this.actor.system.combat.combat_meters?.[meterId]?.name || game.i18n.localize("GUM.Combat.Meters.DefaultName");
  Dialog.confirm({
    title: game.i18n.format("GUM.Combat.Meters.DeleteTitle", { name }),
    content: game.i18n.localize("GUM.Combat.Meters.DeleteContent"),
    yes: async () => {
      await this.actor.update({ [`system.combat.combat_meters.-=${meterId}`]: null });
    }
  });
}

async _onEditWound(ev) {
  ev.preventDefault();
  const woundId = ev.currentTarget.closest(".wound-card")?.dataset?.woundId || foundry.utils.randomID();
  const current = this.actor.system.combat?.wounds?.[woundId] || {};
  const t = key => game.i18n.localize(key);
  const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
  const natureOptions = buildDamageNatureSearchOptions()
    .map(option => `<option value="${esc(option.value)}" label="${esc(option.label)}"></option>`)
    .join("");
  const content = `<form class="gum-popup-form gum-wound-form gum-record-editor" autocomplete="off">
    <datalist id="gum-wound-natures">${natureOptions}</datalist>
    <header class="gum-record-editor__intro form-group--full"><span class="gum-record-editor__icon"><i class="fas fa-bandage" aria-hidden="true"></i></span><span><strong>${t("GUM.Combat.Wounds.EditorHeading")}</strong><small>${t("GUM.Combat.Wounds.EditorHint")}</small></span></header>
    <div class="form-group gum-record-field gum-record-field--title"><label>${t("GUM.Combat.Wounds.TitleField")}</label><input name="title" value="${esc(current.title)}" placeholder="${t("GUM.Combat.Wounds.TitlePlaceholder")}" required></div>
    <div class="form-group gum-record-field gum-record-field--nature"><label>${t("GUM.Combat.Wounds.NatureField")}</label><input name="nature" list="gum-wound-natures" value="${esc(formatDamageNature(current.nature))}"></div>
    <div class="form-group gum-record-field gum-record-field--initial"><label>${t("GUM.Combat.Wounds.InitialValue")}</label><input name="value" type="number" min="0" value="${Number(current.value || 0)}"></div>
    <p class="gum-record-editor__section-label form-group--full"><i class="fas fa-crosshairs" aria-hidden="true"></i> ${t("GUM.Combat.Wounds.Context")} <span>${t("GUM.Combat.Wounds.Optional")}</span></p>
    <div class="form-group gum-record-context-field"><label>${t("GUM.Combat.Wounds.RemainingValue")}</label><input name="remaining" type="number" min="0" value="${Number(current.remaining ?? current.value ?? 0)}"></div>
    <div class="form-group gum-record-context-field"><label>${t("GUM.Combat.Wounds.Target")}</label><input name="poolLabel" value="${esc(current.poolLabel)}"></div>
    <div class="form-group gum-record-context-field"><label>${t("GUM.Combat.Wounds.Location")}</label><input name="location" value="${esc(current.location)}"></div>
    <div class="form-group gum-record-context-field"><label>${t("GUM.Combat.Wounds.Origin")}</label><input name="origin" value="${esc(current.origin)}"></div>
    <div class="form-group form-group--full form-group--textarea"><label>${t("GUM.Combat.Wounds.Notes")}</label><textarea name="notes" placeholder="${t("GUM.Combat.Wounds.NotesPlaceholder")}">${esc(current.notes)}</textarea></div>
    </form>`;
  new Dialog({ title: current.title ? t("GUM.Combat.Wounds.EditTitle") : t("GUM.Combat.Wounds.NewTitle"), content, buttons: { save: { label: t("GUM.Skills.Save"), callback: async html => {
    const f = html.find("form")[0]; const rawNature = f.nature.value.trim(); const nature = rawNature ? resolveDamageNature(rawNature) : null;
    if (!f.title.value.trim()) return ui.notifications.warn(t("GUM.Combat.Wounds.TitleRequired"));
    if (rawNature && !nature) return ui.notifications.warn(t("GUM.Combat.Wounds.InvalidNature"));
    await this.actor.update({ [`system.combat.wounds.${woundId}`]: { ...current, title: f.title.value.trim(), value: Number(f.value.value)||0, remaining: Number(f.remaining.value)||0, poolLabel: f.poolLabel.value.trim(), nature, location: f.location.value.trim(), origin: f.origin.value.trim(), notes: f.notes.value.trim(), createdAt: current.createdAt || Date.now(), updatedAt: Date.now() }});
  }}, cancel: { label: t("GUM.Skills.Cancel") } }, default: "save" }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-record-edit-dialog", "gum-wound-edit-dialog"], width: 480 }).render(true);
}

async _onDeleteWound(ev) {
  ev.preventDefault();
  const id = ev.currentTarget.closest(".wound-card")?.dataset?.woundId;
  if (!id) return;
  Dialog.confirm({ title: game.i18n.localize("GUM.Combat.Wounds.DeleteTitle"), content: game.i18n.localize("GUM.Combat.Wounds.DeleteContent"), yes: () => this.actor.update({ [`system.combat.wounds.-=${id}`]: null }) });
}

async _onAdjustWound(ev) {
  ev.preventDefault();
  const woundId = ev.currentTarget.closest(".wound-card")?.dataset?.woundId;
  const wound = this.actor.system.combat?.wounds?.[woundId];
  if (!woundId || !wound) return;

  const adjustment = Number(ev.currentTarget.dataset.adjustment) || 0;
  const currentRemaining = Math.max(0, Number(wound.remaining ?? wound.value ?? 0) || 0);
  const remaining = Math.max(0, currentRemaining + adjustment);
  if (remaining === currentRemaining) return;

  await this.actor.update({ [`system.combat.wounds.${woundId}.remaining`]: remaining });
}


async _onAdjustCombatMeter(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const equipmentId = ev.currentTarget.closest(".meter-card")?.dataset?.equipmentId;
  const integrityRecord = ev.currentTarget.closest(".meter-card")?.dataset?.integrityRecord === "true";
  if (equipmentId && integrityRecord) return this._adjustEquipmentIntegrity(equipmentId, Number(ev.currentTarget.dataset.adjustment) || 0);
  if (equipmentId) return this._adjustEquipmentReserve(equipmentId, Number(ev.currentTarget.dataset.adjustment) || 0);
  const meterId = ev.currentTarget.closest(".meter-card")?.dataset?.meterId;
  const meter = this.actor.system.combat.combat_meters?.[meterId];
  if (!meterId || !meter) return;

  const adjustment = Number(ev.currentTarget.dataset.adjustment) || 0;
  const current = Number(meter.current ?? meter.value ?? 0) || 0;
  const value = current + adjustment;
  if (value === current) return;

  await this.actor.update({
    [`system.combat.combat_meters.${meterId}.current`]: value,
    [`system.combat.combat_meters.${meterId}.value`]: value
  });
}

async _promptCombatMeterData(initialData = {}, { isEdit = false } = {}) {
  const t = key => game.i18n.localize(key);
  const data = this._normalizeResourceEntry(initialData, { defaultName: t("GUM.Combat.Meters.DefaultName"), includeDR: true });
  const escapedName = foundry.utils.escapeHTML(String(data.name || ""));
  const content = `
    <form class="gum-meter-form gum-popup-form gum-combat-meter-form gum-record-editor" autocomplete="off">
      <header class="gum-record-editor__intro form-group--full"><span class="gum-record-editor__icon gum-record-editor__icon--blue"><i class="fas fa-clipboard-list" aria-hidden="true"></i></span><span><strong>${t("GUM.Combat.Meters.EditorHeading")}</strong><small>${t("GUM.Combat.Meters.EditorHint")}</small></span></header>
      <div class="form-group form-group--full gum-resource-field gum-resource-field--name">
        <label>${t("GUM.Combat.Meters.Name")}</label>
        <input class="gum-input-left" type="text" name="name" value="${escapedName}" placeholder="${t("GUM.Combat.Meters.NamePlaceholder")}" required/>
      </div>
      <p class="gum-record-editor__section-label form-group--full"><i class="fas fa-sliders-h" aria-hidden="true"></i> ${t("GUM.Combat.Meters.Values")}</p>
      <div class="form-group form-group--number gum-resource-field gum-resource-field--current">
        <label>${t("GUM.Combat.Meters.CurrentValue")}</label>
        <input type="number" name="current" value="${data.current ?? 0}"/>
      </div>
      <div class="form-group form-group--number gum-resource-field gum-resource-field--max">
        <label>${t("GUM.Combat.Meters.ReferenceValue")}</label>
        <input type="number" name="max" value="${data.max ?? 0}" min="0"/>
      </div>
      <div class="form-group form-group--number gum-resource-field gum-resource-field--dr">
        <label>RD</label>
        <input type="number" name="dr" value="${data.dr ?? 0}" min="0"/>
      </div>
    </form>`;

  const title = isEdit ? t("GUM.Combat.Meters.EditTitle") : t("GUM.Combat.Meters.NewTitle");

 return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: t("GUM.Skills.Save"),
          callback: (html) => {
            const form = html.find("form")[0];
            const name = form.name.value.trim();
            if (!name) return ui.notifications.warn(t("GUM.Combat.Meters.NameRequired"));

            const current = Number(form.current.value) || 0;
            const max = Number(form.max.value) || 0;
             const dr = Math.max(0, Number(form.dr.value) || 0);

            finish({ name, current, max, value: current, dr });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: t("GUM.Skills.Cancel"),
          callback: () => finish(null)
        }
      },
      default: "save",
      close: () => finish(null)
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-record-edit-dialog", "gum-resource-edit-dialog", "gum-combat-meter-edit-dialog"], width: 460 }).render(true);
  });
}

async _onCreatePrimaryItem(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const type = String(ev.currentTarget.dataset.type || "");
  if (!["spell", "power"].includes(type)) return;

  const name = type === "spell" ? "Nova Magia" : "Novo Poder";
  const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
  item?.sheet?.render(true);
}

async _onAddEnergyReserve(ev) {
  ev.preventDefault();
  const reserveType = ev.currentTarget?.dataset?.reserveType === "power" ? "power" : "spell";
  const reserveData = await this._promptEnergyReserveData(reserveType, {}, { isEdit: false });
  if (!reserveData) return;

  const reserveId = foundry.utils.randomID();
  await this.actor.update({ [`system.${reserveType}_reserves.${reserveId}`]: reserveData });
}

async _onEditEnergyReserve(ev) {
  ev.preventDefault();
    ev.stopPropagation();
  const equipmentId = ev.currentTarget.closest("[data-reserve-id][data-reserve-type]")?.dataset?.equipmentId;
  if (equipmentId) return this.actor.items.get(equipmentId)?.sheet?.render(true);
  const card = ev.currentTarget.closest("[data-reserve-id][data-reserve-type]");
  const reserveId = card?.dataset?.reserveId;
  const reserveType = card?.dataset?.reserveType === "power" ? "power" : "spell";
  if (!reserveId) return;

  const existing = this.actor.system?.[`${reserveType}_reserves`]?.[reserveId];
  const reserveData = await this._promptEnergyReserveData(reserveType, existing, { isEdit: true });
  if (!reserveData) return;

  await this.actor.update({ [`system.${reserveType}_reserves.${reserveId}`]: reserveData });
}

async _onDeleteEnergyReserve(ev) {
  ev.preventDefault();
    ev.stopPropagation();
  const card = ev.currentTarget.closest("[data-reserve-id][data-reserve-type]");
  const reserveId = card?.dataset?.reserveId;
  const reserveType = card?.dataset?.reserveType === "power" ? "power" : "spell";
  if (!reserveId) return;

  const name = this.actor.system?.[`${reserveType}_reserves`]?.[reserveId]?.name || game.i18n.localize("GUM.Resources.Reserve");

  Dialog.confirm({
    title: game.i18n.format("GUM.Resources.DeleteReserveTitle", { name }),
    content: `<p>${foundry.utils.escapeHTML(game.i18n.localize("GUM.Resources.DeleteReserveContent"))}</p>`,
    yes: async () => {
      await this.actor.update({ [`system.${reserveType}_reserves.-=${reserveId}`]: null });
    }
  });
}

async _onAdjustEnergyReserve(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const card = ev.currentTarget.closest("[data-reserve-id][data-reserve-type]");
  if (card?.dataset?.equipmentId) return this._adjustEquipmentReserve(card.dataset.equipmentId, Number(ev.currentTarget.dataset.adjustment) || 0);
  const reserveId = card?.dataset?.reserveId;
  const reserveType = card?.dataset?.reserveType === "power" ? "power" : "spell";
  const adjustment = Number(ev.currentTarget.dataset.adjustment) || 0;
  if (!reserveId || !adjustment) return;

  const reserve = this.actor.system?.[`${reserveType}_reserves`]?.[reserveId];
  if (!reserve) return;

  const current = Number(reserve.current ?? reserve.value ?? 0) || 0;
  const max = Math.max(0, Number(reserve.max) || 0);
  const value = Math.min(max, current + adjustment);
  const pathBase = `system.${reserveType}_reserves.${reserveId}`;
  await this.actor.update({
    [`${pathBase}.current`]: value,
    [`${pathBase}.value`]: value
  });
}

async _onCreateMoneySource(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const [item] = await this.actor.createEmbeddedDocuments("Item", [{
    name: game.i18n.localize("GUM.MoneySource.Header"),
    type: "money_source",
    img: "icons/svg/item-bag.svg",
    system: { mode: "physical", quantity: 0, unit_value: 1, weight: 0, location: "carried", balance: 0 }
  }]);
  item?.sheet?.render(true);
}

async _adjustEquipmentReserve(equipmentId, adjustment) {
  const item = this.actor.items.get(equipmentId);
  if (!item || !adjustment) return;
  const reserve = equipmentLinkedReserve(item, item.system?.equipmentResolution);
  if (!reserve) return;
  const nextCurrent = Math.max(0, Math.min(reserve.max, reserve.current + adjustment));
  if (nextCurrent === reserve.current) return;
  await item.update(equipmentReserveBalanceUpdate(item, nextCurrent, item.system?.equipmentResolution));
}

async _adjustEquipmentIntegrity(equipmentId, adjustment) {
  const item = this.actor.items.get(equipmentId);
  if (!item || !adjustment) return;
  const record = equipmentIntegrityRecord(item, item.system?.equipmentResolution);
  if (!record) return;
  const nextCurrent = Math.max(0, Math.min(record.max, record.current + adjustment));
  if (nextCurrent === record.current) return;
  await item.update(equipmentIntegrityCurrentUpdate(item, nextCurrent, item.system?.equipmentResolution));
}

async _promptEnergyReserveData(reserveType, initialData = {}, { isEdit = false } = {}) {
  const data = this._normalizeResourceEntry(initialData, { defaultName: reserveType === "power" ? game.i18n.localize("GUM.Powers.Reserve") : game.i18n.localize("GUM.Spells.Reserve") });
  const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
  const isPowerReserve = reserveType === "power";
  const copy = {
    reserveLabel: game.i18n.localize(isPowerReserve ? "GUM.Powers.Reserve" : "GUM.Spells.Reserve"),
    reserveDescription: game.i18n.localize(isPowerReserve ? "GUM.Powers.ReserveDialogHint" : "GUM.Spells.ReserveDialogHint"),
    namePlaceholder: game.i18n.localize(isPowerReserve ? "GUM.Powers.ReserveNamePlaceholder" : "GUM.Spells.ReserveNamePlaceholder"),
    sourcePlaceholder: game.i18n.localize(isPowerReserve ? "GUM.Powers.ReserveSourcePlaceholder" : "GUM.Spells.ReserveSourcePlaceholder"),
    title: game.i18n.localize(isPowerReserve
      ? (isEdit ? "GUM.Powers.EditReserve" : "GUM.Powers.NewReserve")
      : (isEdit ? "GUM.Spells.EditReserve" : "GUM.Spells.NewReserve"))
  };
  const content = `
    <form class="gum-meter-form gum-popup-form gum-energy-reserve-form gum-record-editor" autocomplete="off">
      <header class="gum-record-editor__intro form-group--full"><span class="gum-record-editor__icon ${isPowerReserve ? "gum-record-editor__icon--power" : "gum-record-editor__icon--magic"}"><i class="fas ${isPowerReserve ? "fa-bolt" : "fa-hat-wizard"}" aria-hidden="true"></i></span><span><strong>${esc(copy.reserveLabel)}</strong><small>${esc(copy.reserveDescription)}</small></span></header>
      <div class="form-group form-group--full gum-resource-field gum-resource-field--name">
        <label>${esc(game.i18n.localize("GUM.Resources.Name"))}</label>
        <input class="gum-input-left" type="text" name="name" value="${esc(data.name)}" placeholder="${esc(copy.namePlaceholder)}" required/>
      </div>
      <div class="form-group form-group--full gum-resource-field gum-resource-field--source">
        <label>${esc(game.i18n.localize("GUM.Resources.Source"))}</label>
                <input class="gum-input-left" type="text" name="source" value="${esc(data.source)}" placeholder="${esc(copy.sourcePlaceholder)}" />
      </div>
      <p class="gum-record-editor__section-label form-group--full"><i class="fas fa-sliders-h" aria-hidden="true"></i> ${esc(game.i18n.localize("GUM.Resources.Values"))}</p>
      <div class="form-group form-group--number gum-resource-field gum-resource-field--current">
        <label>${esc(game.i18n.localize("GUM.Resources.Current"))}</label>
        <input type="number" name="current" value="${data.current ?? 0}"/>
      </div>
     <div class="form-group form-group--number gum-resource-field gum-resource-field--max">
        <label>${esc(game.i18n.localize("GUM.Resources.Maximum"))}</label>
        <input type="number" name="max" value="${data.max ?? 0}" min="0"/>
      </div>
    </form>`;

 return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: copy.title,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: game.i18n.localize("GUM.Resources.Save"),
          callback: (html) => {
            const form = html.find("form")[0];
            const name = form.name.value.trim();
            if (!name) return ui.notifications.warn(game.i18n.localize("GUM.Resources.NameRequired"));

            const source = form.source.value.trim();
            const current = Number(form.current.value) || 0;
            const max = Number(form.max.value) || 0;

            finish({ name, source, current, max, value: current });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("GUM.Characteristics.Cancel"),
          callback: () => finish(null)
        }
      },
      default: "save",
      close: () => finish(null)
    }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-record-edit-dialog", "gum-resource-edit-dialog", "gum-energy-reserve-edit-dialog", `gum-energy-reserve-edit-dialog--${reserveType}`], width: 460 }).render(true);
  });
}

_getLinkableCharacteristics() {
  return Array.from(this.actor.items)
    .filter((item) => ["advantage", "disadvantage"].includes(item.type))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

_prepareCharacteristicLink(id, record, fallbackName) {
  const itemId = String(record?.item_id || record?.itemId || "").trim();
  if (!itemId) {
    return {
      id,
      ...record,
      name: record?.name || fallbackName,
      level: Number(record?.level) || 0,
      points: Number(record?.points) || 0,
      isLegacy: true
    };
  }

  const item = this.actor.items.get(itemId);
  if (!item) {
    return {
      id,
      itemId,
      name: game.i18n.localize("GUM.Resources.LinkedTraitMissing"),
      kindLabel: game.i18n.localize("GUM.Resources.BrokenLink"),
      broken: true
    };
  }

  const specialization = String(item.system?.specialization || "").trim();
  return {
    id,
    itemId,
    name: item.name,
    specialization,
    img: item.img,
    level: Number(item.system?.level) || 0,
    points: Number(item.system?.points) || 0,
    notes: String(item.system?.characteristics || "").trim(),
    kindLabel: game.i18n.localize(item.type === "disadvantage" ? "GUM.Characteristics.Disadvantage" : "GUM.Characteristics.Advantage")
  };
}

async _promptCharacteristicLink(linkType) {
  const collection = linkType === "power"
    ? this.actor.system.power_sources || {}
    : this.actor.system.casting_abilities || {};
  const linkedIds = new Set(Object.values(collection).map((entry) => entry?.item_id || entry?.itemId).filter(Boolean));
  const candidates = this._getLinkableCharacteristics().filter((item) => !linkedIds.has(item.id));

  const localize = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);
  const isPowerSource = linkType === "power";
  const copy = {
    title: localize(isPowerSource ? "GUM.Powers.LinkSourceDialogTitle" : "GUM.Spells.LinkAbilityDialogTitle"),
    hint: localize("GUM.Characteristics.LinkDialogHint"),
    searchLabel: localize("GUM.Characteristics.LinkDialogSearchLabel"),
    searchPlaceholder: localize("GUM.Characteristics.LinkDialogSearchPlaceholder"),
    noResults: localize("GUM.Characteristics.LinkDialogNoResults"),
    link: localize("GUM.Characteristics.Link"),
    cancel: localize("GUM.Characteristics.Cancel"),
    selectRequired: localize("GUM.Characteristics.LinkDialogSelectionRequired")
  };

  if (!candidates.length) {
    ui.notifications.warn(localize("GUM.Characteristics.LinkDialogEmpty"));
    return null;
  }

  const escape = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  const rows = candidates.map((item) => {
    const kind = localize(item.type === "disadvantage" ? "GUM.Characteristics.Disadvantage" : "GUM.Characteristics.Advantage");
    const specialization = item.system?.specialization ? ` (${escape(item.system.specialization)})` : "";
    const level = Number(item.system?.level) ? ` · ${localize("GUM.Characteristics.LevelAbbreviation")} ${Number(item.system.level)}` : "";
    const points = Number(item.system?.points) || 0;
    return `
      <label class="characteristic-link-option" data-search="${escape(`${item.name} ${item.system?.specialization || ""} ${kind}`.toLowerCase())}">
        <input type="radio" name="item_id" value="${item.id}">
        <span class="characteristic-link-option__image"><img src="${escape(item.img)}" alt=""></span>
        <span class="characteristic-link-option__text">
          <strong>${escape(item.name)}${specialization}</strong>
          <small>${kind}${level}</small>
        </span>
        <span class="characteristic-link-option__points">${points} ${localize("GUM.Characteristics.PointsAbbreviation")}</span>
      </label>`;
  }).join("");

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: copy.title,
      content: `
        <form class="characteristic-link-picker" autocomplete="off">
          <div class="characteristic-link-picker__intro">
            <span class="characteristic-link-picker__intro-icon"><i class="fas ${isPowerSource ? "fa-bolt" : "fa-hat-wizard"}"></i></span>
            <p class="hint">${escape(copy.hint)}</p>
          </div>
          <label class="characteristic-link-search" aria-label="${escape(copy.searchLabel)}"><i class="fas fa-search"></i><input type="search" placeholder="${escape(copy.searchPlaceholder)}"></label>
          <div class="characteristic-link-options">${rows}</div>
          <p class="characteristic-link-no-results" hidden>${escape(copy.noResults)}</p>
        </form>`,
      buttons: {
        link: {
          icon: '<i class="fas fa-link"></i>',
          label: copy.link,
          callback: (html) => {
            const selected = html.find('input[name="item_id"]:checked').val();
            if (!selected) {
              ui.notifications.warn(copy.selectRequired);
              return false;
            }
            finish(String(selected));
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: copy.cancel, callback: () => finish(null) }
      },
      default: "link",
      render: (html) => {
        const syncSelection = () => {
          html.find(".characteristic-link-option").each((_, element) => {
            element.classList.toggle("is-selected", Boolean(element.querySelector('input[type="radio"]')?.checked));
          });
        };
        html.find('input[name="item_id"]').on("change", syncSelection);
        html.find('input[type="search"]').on("input", (event) => {
          const term = String(event.currentTarget.value || "").toLowerCase().trim();
          let visible = 0;
          html.find(".characteristic-link-option").each((_, element) => {
            const matches = !term || String(element.dataset.search || "").includes(term);
            element.hidden = !matches;
            if (matches) visible += 1;
          });
          html.find(".characteristic-link-no-results").prop("hidden", visible > 0);
        });
        syncSelection();
      },
      close: () => finish(null)
    }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-characteristic-link-dialog"], width: 520 }).render(true);
  });
}


_prepareCastingAbilities() {
  const collection = foundry.utils.duplicate(this.actor.system.casting_abilities || {});
  const abilities = Object.entries(collection).map(([id, ability]) =>
    this._prepareCharacteristicLink(id, ability, game.i18n.localize("GUM.Spells.CastingAbility"))
  );

  if (!abilities.length) {
    const legacy = this.actor.system.casting_ability || {};
    const hasLegacyData = Boolean(
      String(legacy.name || "").trim() ||
      String(legacy.source || "").trim() ||
      String(legacy.description || "").trim() ||
      Number(legacy.level) ||
      Number(legacy.points)
    );

    if (hasLegacyData) {
      abilities.push({
        id: "legacy",
        name: legacy.name || game.i18n.localize("GUM.Spells.CastingAbility"),
        source: legacy.source || game.i18n.localize("GUM.Spells.LegacySource"),
        level: Number(legacy.level) || 0,
        points: Number(legacy.points) || 0,
        description: legacy.description || ""
      });
    }
  }

  return abilities.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

_getCastingAbilityById(abilityId) {
  if (!abilityId) return null;

  if (abilityId === "legacy") {
    const legacy = this.actor.system.casting_ability || {};
    return {
      id: "legacy",
      name: legacy.name || game.i18n.localize("GUM.Spells.CastingAbility"),
      source: legacy.source || game.i18n.localize("GUM.Spells.LegacySource"),
      level: Number(legacy.level) || 0,
      points: Number(legacy.points) || 0,
      description: legacy.description || ""
    };
  }

  const ability = this.actor.system.casting_abilities?.[abilityId];
  if (!ability) return null;

    if (ability.item_id || ability.itemId) {
    return this._prepareCharacteristicLink(abilityId, ability, game.i18n.localize("GUM.Spells.CastingAbility"));
  }

  return {
    id: abilityId,
    name: ability.name || "Habilidade de Conjuração",
    source: ability.source || "Fonte indefinida",
    level: Number(ability.level) || 0,
    points: Number(ability.points) || 0,
    description: ability.description || ""
  };
}

async _promptCastingAbilityData(initialData = {}, { isEdit = false } = {}) {
  const data = {
    name: initialData?.name || "",
    source: initialData?.source || "",
    level: Number(initialData?.level) || 0,
    points: Number(initialData?.points) || 0,
    description: initialData?.description || ""
  };

const content = `
    <form class="gum-meter-form gum-popup-form casting-ability-form" autocomplete="off">
      <p class="hint form-group--full">Defina a habilidade de conjuração base da aba Magias.</p>
      <div class="form-group form-group--full">
        <label>Habilidade de Conjuração</label>
        <input class="gum-input-left" type="text" name="name" value="${data.name}" required/>
      </div>
      <div class="form-group form-group--full">
        <label>Fonte</label>
        <input class="gum-input-left" type="text" name="source" value="${data.source}" />
      </div>
      <div class="form-group form-group--number">
        <label>Nível</label>
        <input type="number" name="level" value="${data.level}" />
      </div>
      <div class="form-group form-group--number">
        <label>Pontos</label>
        <input type="number" name="points" value="${data.points}" />
      </div>
      <div class="form-group form-group--full form-group--textarea">
        <label>Descrição</label>
        <textarea class="gum-input-left" name="description" rows="6">${data.description}</textarea>
      </div>
    </form>`;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: isEdit ? "Editar Habilidade de Conjuração" : "Nova Habilidade de Conjuração",
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Salvar",
          callback: (html) => {
            const form = html.find("form")[0];
            const name = form.name.value.trim();
            if (!name) return ui.notifications.warn("Informe o nome da habilidade de conjuração.");

            finish({
              name,
              source: form.source.value.trim(),
              level: Number(form.level.value) || 0,
              points: Number(form.points.value) || 0,
              description: form.description.value.trim()
            });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancelar",
          callback: () => finish(null)
        }
      },
      default: "save",
      close: () => finish(null)
    }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-magic-edit-dialog"] }).render(true);
  });
}

async _onAddCastingAbility(ev) {
  ev.preventDefault();
  const itemId = await this._promptCharacteristicLink("casting");
  if (!itemId) return;

  const abilityId = foundry.utils.randomID();
  await this.actor.update({ [`system.casting_abilities.${abilityId}`]: { item_id: itemId } });
}

async _onEditCastingAbility(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest("[data-ability-id]");
  const abilityId = card?.dataset?.abilityId;
  if (!abilityId) return;

  const current = this._getCastingAbilityById(abilityId);
  if (!current) return;

    if (current.itemId) {
    const item = this.actor.items.get(current.itemId);
    if (item) return item.sheet.render(true);
    const replacementId = await this._promptCharacteristicLink("casting");
    if (replacementId) await this.actor.update({ [`system.casting_abilities.${abilityId}.item_id`]: replacementId });
    return;
  }

  const updated = await this._promptCastingAbilityData(current, { isEdit: true });
  if (!updated) return;

  if (abilityId === "legacy") {
    await this.actor.update({ "system.casting_ability": updated });
    return;
  }

  await this.actor.update({ [`system.casting_abilities.${abilityId}`]: updated });
}

async _onDeleteCastingAbility(ev) {
  ev.preventDefault();
    ev.stopPropagation();
  const card = ev.currentTarget.closest("[data-ability-id]");
  const abilityId = card?.dataset?.abilityId;
  if (!abilityId) return;

  const ability = this._getCastingAbilityById(abilityId);
  if (!ability) return;

  Dialog.confirm({
    title: `${ability.itemId ? "Desvincular" : "Excluir"} ${ability.name}?`,
    content: ability.itemId
      ? "<p>O vínculo será removido, mas a característica continuará na ficha.</p>"
      : "<p>Tem certeza que deseja remover esta habilidade de conjuração?</p>",
    yes: async () => {
      if (abilityId === "legacy") {
        await this.actor.update({
          "system.casting_ability": {
            name: "",
            source: "",
            level: 0,
            points: 0,
            description: ""
          }
        });
        return;
      }

      await this.actor.update({ [`system.casting_abilities.-=${abilityId}`]: null });
    }
  });
}

_onViewCastingAbility(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const card = ev.currentTarget.closest("[data-ability-id]");
  const abilityId = card?.dataset?.abilityId;
  if (!abilityId) return;

  const ability = this._getCastingAbilityById(abilityId);
  if (!ability) return;

  if (ability.itemId) {
    const item = this.actor.items.get(ability.itemId);
    if (!item) return ui.notifications.warn("A característica vinculada não foi encontrada.");
    return this._renderItemQuickView(item);
  }

  const description = ability.description || "<em>Sem descrição.</em>";

  new Dialog({
    title: `${ability.name} (Nv ${ability.level})`,
    content: `
      <div class="casting-ability-preview">
        <p><strong>Fonte:</strong> ${ability.source || "-"}</p>
        <p><strong>Pontos:</strong> ${ability.points}</p>
        <hr>
        <div>${description}</div>
      </div>
    `,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Fechar"
      }
    },
    default: "close"
  }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-magic-view-dialog"] }).render(true);
}

_preparePowerSources() {
  const collection = foundry.utils.duplicate(this.actor.system.power_sources || {});
  const sources = Object.entries(collection).map(([id, source]) =>
    this._prepareCharacteristicLink(id, source, game.i18n.localize("GUM.Powers.Source"))
  );

  

  if (!sources.length) {
    const legacy = this.actor.system.power_source || {};
    const hasLegacyData = Boolean(
      String(legacy.name || "").trim() ||
      String(legacy.source || "").trim() ||
      String(legacy.focus || "").trim() ||
      String(legacy.description || "").trim() ||
      Number(legacy.level) ||
      Number(legacy.points) ||
      String(legacy.power_talent_name || "").trim() ||
      Number(legacy.power_talent_level) ||
      Number(legacy.power_talent_points) ||
      Number(legacy.power_talent)
    );

    if (hasLegacyData) {
      sources.push({
        id: "legacy",
        name: legacy.name || game.i18n.localize("GUM.Powers.Source"),
        source: legacy.source || "",
        focus: legacy.focus || "",
        level: Number(legacy.level) || 0,
        points: Number(legacy.points) || 0,
        power_talent_name: legacy.power_talent_name || "",
        power_talent_level: Number(legacy.power_talent_level) || Number(legacy.power_talent) || 0,
        power_talent_points: Number(legacy.power_talent_points) || 0,
        description: legacy.description || ""
      });
    }
  }

  return sources.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

_getPowerSourceById(sourceId) {
  if (!sourceId) return null;

  if (sourceId === "legacy") {
    const legacy = this.actor.system.power_source || {};
    return {
      id: "legacy",
      name: legacy.name || game.i18n.localize("GUM.Powers.Source"),
      source: legacy.source || "",
      focus: legacy.focus || "",
      level: Number(legacy.level) || 0,
      points: Number(legacy.points) || 0,
      power_talent_name: legacy.power_talent_name || "",
      power_talent_level: Number(legacy.power_talent_level) || Number(legacy.power_talent) || 0,
      power_talent_points: Number(legacy.power_talent_points) || 0,
      description: legacy.description || ""
    };
  }

  const source = this.actor.system.power_sources?.[sourceId];
  if (!source) return null;

    if (source.item_id || source.itemId) {
    return this._prepareCharacteristicLink(sourceId, source, game.i18n.localize("GUM.Powers.Source"));
  }

  return {
    id: sourceId,
    name: source.name || game.i18n.localize("GUM.Powers.Source"),
    source: source.source || "",
    focus: source.focus || "",
    level: Number(source.level) || 0,
    points: Number(source.points) || 0,
    power_talent_name: source.power_talent_name || "",
    power_talent_level: Number(source.power_talent_level) || Number(source.power_talent) || 0,
    power_talent_points: Number(source.power_talent_points) || 0,
    description: source.description || ""
  };
}

async _promptPowerSourceData(initialData = {}, { isEdit = false } = {}) {
  const data = {
    name: initialData?.name || "",
    source: initialData?.source || "",
    focus: initialData?.focus || "",
    level: Number(initialData?.level) || 0,
    points: Number(initialData?.points) || 0,
    power_talent_name: initialData?.power_talent_name || "",
    power_talent_level: Number(initialData?.power_talent_level) || 0,
    power_talent_points: Number(initialData?.power_talent_points) || 0,
    description: initialData?.description || ""
  };

  const content = `
    <form class="gum-meter-form gum-popup-form power-source-form" autocomplete="off">
      <p class="hint form-group--full">Configure a fonte principal e o talento vinculado.</p>
      <div class="form-group form-group--full">
        <label>Nome do Poder</label>
        <input class="gum-input-left" type="text" name="name" value="${data.name}" required/>
      </div>
      <div class="form-group form-group--full">
        <label>Origem/Fonte</label>
        <input class="gum-input-left" type="text" name="source" value="${data.source}"/>
      </div>
      <div class="form-group form-group--full">
        <label>Foco do Poder</label>
        <input class="gum-input-left" type="text" name="focus" value="${data.focus}"/>
      </div>
      <div class="form-group form-group--number">
        <label>Nível</label>
        <input type="number" name="level" value="${data.level}" />
      </div>
      <div class="form-group form-group--number">
        <label>Pontos</label>
        <input type="number" name="points" value="${data.points}" />
      </div>
      <div class="form-group form-group--full form-group--divider">
        <hr>
      </div>
      <div class="form-group form-group--full">
        <label>Talento de Poder</label>
        <input class="gum-input-left" type="text" name="power_talent_name" value="${data.power_talent_name}" />
      </div>
      <div class="form-group form-group--number">
        <label>Nível do talento</label>
        <input type="number" name="power_talent_level" value="${data.power_talent_level}" />
      </div>
      <div class="form-group form-group--number">
        <label>Pontos (Talento de Poder)</label>
        <input type="number" name="power_talent_points" value="${data.power_talent_points}" />
      </div>
      <div class="form-group form-group--full form-group--divider">
        <hr>
      </div>
      <div class="form-group form-group--full form-group--textarea">
        <label>Descrição do Poder</label>
        <textarea class="gum-input-left" name="description" rows="6">${data.description}</textarea>
      </div>
    </form>`;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: isEdit ? "Editar Fonte de Poder" : "Configurar Fonte de Poder",
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Salvar",
          callback: (html) => {
            const form = html.find("form")[0];
            const name = form.name.value.trim();
            if (!name) return ui.notifications.warn("Informe o nome da fonte de poder.");

            finish({
              name,
              source: form.source.value.trim(),
              focus: form.focus.value.trim(),
              level: Number(form.level.value) || 0,
              points: Number(form.points.value) || 0,
              power_talent_name: form.power_talent_name.value.trim(),
              power_talent_level: Number(form.power_talent_level.value) || 0,
              power_talent_points: Number(form.power_talent_points.value) || 0,
              description: form.description.value.trim()
            });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancelar",
          callback: () => finish(null)
        }
      },
      default: "save",
      close: () => finish(null)
    }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-magic-edit-dialog"] }).render(true);
  });
}

async _onAddPowerSource(ev) {
  ev.preventDefault();
  const itemId = await this._promptCharacteristicLink("power");
  if (!itemId) return;

  const sourceId = foundry.utils.randomID();
  await this.actor.update({ [`system.power_sources.${sourceId}`]: { item_id: itemId } });
}

async _onEditPowerSource(ev) {
  ev.preventDefault();
  const card = ev.currentTarget.closest("[data-power-source-id]");
  const sourceId = card?.dataset?.powerSourceId;
  if (!sourceId) return;

  const current = this._getPowerSourceById(sourceId);
  if (!current) return;

    if (current.itemId) {
    const item = this.actor.items.get(current.itemId);
    if (item) return item.sheet.render(true);
    const replacementId = await this._promptCharacteristicLink("power");
    if (replacementId) await this.actor.update({ [`system.power_sources.${sourceId}.item_id`]: replacementId });
    return;
  }

  const updated = await this._promptPowerSourceData(current, { isEdit: true });
  if (!updated) return;

  if (sourceId === "legacy") {
    await this.actor.update({ "system.power_source": updated });
    return;
  }

  await this.actor.update({ [`system.power_sources.${sourceId}`]: updated });
}

async _onDeletePowerSource(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const card = ev.currentTarget.closest("[data-power-source-id]");
  const sourceId = card?.dataset?.powerSourceId;
  if (!sourceId) return;

  const source = this._getPowerSourceById(sourceId);
  if (!source) return;

  Dialog.confirm({
    title: `${source.itemId ? "Desvincular" : "Excluir"} ${source.name}?`,
    content: source.itemId
      ? "<p>O vínculo será removido, mas a característica continuará na ficha.</p>"
      : "<p>Tem certeza que deseja remover esta fonte de poder?</p>",
    yes: async () => {
          if (sourceId === "legacy") {
          await this.actor.update({
            "system.power_source": {
              name: "",
              source: "",
              focus: "",
              level: 0,
              points: 0,
              power_talent_name: "",
              power_talent_level: 0,
              power_talent_points: 0,
             description: ""
            }
          });
          return;
          }

          await this.actor.update({ [`system.power_sources.-=${sourceId}`]: null });
    }
  });
}

_onViewPowerSource(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const card = ev.currentTarget.closest("[data-power-source-id]");
  const sourceId = card?.dataset?.powerSourceId;
  if (!sourceId) return;

  const source = this._getPowerSourceById(sourceId);
  if (!source) return;

  if (source.itemId) {
    const item = this.actor.items.get(source.itemId);
    if (!item) return ui.notifications.warn("A característica vinculada não foi encontrada.");
    return this._renderItemQuickView(item)
  }

  const description = source.description || "<em>Sem descrição.</em>";

  new Dialog({
    title: `${source.name} (Nv ${source.level})`,
    content: `
      <div class="casting-ability-preview">
        <p><strong>Origem/Fonte:</strong> ${source.source || "-"}</p>
        <p><strong>Foco do Poder:</strong> ${source.focus || "-"}</p>
        <p><strong>Nível:</strong> ${source.level}</p>
        <p><strong>Pontos:</strong> ${source.points}</p>
        <hr>
        <p><strong>Talento de Poder:</strong> ${source.power_talent_name || "-"}</p>
        <p><strong>Nível do Talento:</strong> ${source.power_talent_level}</p>
        <p><strong>Pontos do Talento:</strong> ${source.power_talent_points}</p>
        <hr>
        <div>${description}</div>
      </div>
    `,
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: "Fechar"
      }
    },
    default: "close"
  }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-magic-view-dialog"] }).render(true);
}

_getSocialEntryConfig(type) {
  const legacyConfigs = {
    status: {
      label: "Status Social",
      path: "system.social_status_entries",
      fields: [
        { name: "society", label: "Sociedade", type: "text", placeholder: "Ex: Nobreza, Guilda" },
        { name: "status_name", label: "Status", type: "text", placeholder: "Ex: Cavaleiro, Membro" },
        { name: "level", label: "Nível", type: "number" },
                { name: "monthly_cost", label: "Custo Mensal", type: "text", placeholder: "Ex: 50" },
        { name: "points", label: "Pontos", type: "number" }
      ]
    },
    organization: {
      label: "Organização",
      path: "system.organization_entries",
      fields: [
        { name: "organization_name", label: "Organização", type: "text" },
        { name: "status_name", label: "Status", type: "text" },
        { name: "level", label: "Nível", type: "number" },
                { name: "salary", label: "Salário", type: "text" },
        { name: "points", label: "Pontos", type: "number" }
      ]
    },
    culture: {
      label: "Cultura",
      path: "system.culture_entries",
      fields: [
        { name: "culture_name", label: "Cultura", type: "text" },
                { name: "level", label: "Nível", type: "number" },
        { name: "points", label: "Pontos", type: "number" }
      ]
    },
    language: {
      label: "Idioma",
      path: "system.language_entries",
      fields: [
        { name: "language_name", label: "Idioma", type: "text" },
        { name: "written_level", label: "Escrita", type: "text", placeholder: "Ex: Nenhuma, Básica, Fluente" },
                { name: "spoken_level", label: "Fala", type: "text", placeholder: "Ex: Nenhuma, Básica, Fluente" },
        { name: "points", label: "Pontos", type: "number" }
      ]
    },
    reputation: {
      label: "Reputação",
      path: "system.reputation_entries",
      fields: [
        { name: "title", label: "Título", type: "text" },
        { name: "reaction_modifier", label: "Modificador de Reação", type: "text", placeholder: "Ex: +2" },
        { name: "scope", label: "Escopo", type: "text", placeholder: "Ex: Cidade, Reino" },
                { name: "recognition_frequency", label: "Frequência de Reconhecimento", type: "text" },
        { name: "points", label: "Pontos", type: "number" }
      ]
    },
    wealth: {
      label: "Riqueza",
      path: "system.wealth_entries",
      fields: [
        { name: "wealth_level", label: "Nível de Riqueza", type: "text" },
                { name: "effects", label: "Efeitos", type: "textarea" },
        { name: "points", label: "Pontos", type: "number" }
      ]
    },
    bond: {
      label: "Vínculo",
      path: "system.bond_entries",
      fields: [
        { name: "name", label: "Nome", type: "text" },
        { name: "bond_type", label: "Tipo", type: "text", placeholder: "Ex: Familiar, Juramento" },
                { name: "description", label: "Descrição", type: "textarea" },
        { name: "points", label: "Pontos", type: "number" }
      ]
    }
  };

const shared = SOCIAL_CATEGORIES[type];
  if (!shared) return legacyConfigs[type] || null;
  const layout = new Map((SOCIAL_MANUAL_LAYOUTS[type] || []).map(([name, span], order) => [name, { span, order }]));
  return {
    label: game.i18n.localize(shared.label),
    path: `system.${shared.actorPath}`,
    fields: shared.fields
      .map(([name, label, fieldType], sourceOrder) => {
        const fieldLayout = layout.get(name) || { span: fieldType === "textarea" ? 12 : 6, order: sourceOrder };
        return { name, label: game.i18n.localize(label), type: fieldType, ...fieldLayout };
      })
      .sort((a, b) => a.order - b.order)
  };
}

_onEditSocialSource(event) {
  event.preventDefault();
  const item = this.actor.items.get(event.currentTarget.dataset.itemId);
  return item?.sheet.render(true);
}

async _onChooseSocialCategory(event) {
  event.preventDefault();
  const options = Object.entries(SOCIAL_CATEGORIES).map(([type, config]) =>
    `<option value="${type}">${game.i18n.localize(config.label)}</option>`).join("");
  new Dialog({
    title: game.i18n.localize("GUM.Social.AddAspectTitle"),
    content: `
      <form class="gum-social-category-form" autocomplete="off">
        <div class="gum-social-dialog-intro">
          <span class="gum-social-dialog-intro__icon"><i class="fas fa-users"></i></span>
          <p>${game.i18n.localize("GUM.Social.ChooseAspectHint")}</p>
        </div>
        <label class="gum-social-category-field">
          <span>${game.i18n.localize("GUM.Social.AspectType")}</span>
          <select name="type">${options}</select>
        </label>
      </form>`,
    buttons: {
      add: {
        icon: '<i class="fas fa-plus"></i>',
        label: game.i18n.localize("GUM.Social.Add"),
        callback: html => this._onAddSocialEntry({ preventDefault() {}, currentTarget: { dataset: { type: html.find('[name=type]').val() } } })
      }
    },
    default: "add"
  }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-social-category-dialog"], width: 430, height: "auto" }).render(true);
}

async _promptSocialEntryData(type, initialData = {}, { isEdit = false } = {}) {
  const config = this._getSocialEntryConfig(type);
  if (!config) return null;

  const fieldHtml = config.fields.map((field) => {
    const value = initialData[field.name] ?? "";
        const groupClasses = ["form-group", `form-group--${field.type}`, `form-group--${field.name}`];
    const groupStyle = `style="--social-field-span: ${field.span || 6}"`;
    if (field.type === "textarea") groupClasses.push("form-group--full");

    if (field.type === "textarea") {
      return `
        <div class="${groupClasses.join(" ")}" ${groupStyle}>
          <label>${field.label}</label>
          <textarea class="gum-input-left" name="${field.name}" rows="3" placeholder="${field.placeholder || ""}">${value}</textarea>
        </div>`;
    }

    const placeholder = field.placeholder ? `placeholder="${field.placeholder}"` : "";
    const min = field.type === "number" && field.name !== "points" ? "min=\"0\"" : "";
    const inputClass = field.type === "number" ? "" : "gum-input-left";

    return `
      <div class="${groupClasses.join(" ")}" ${groupStyle}>
        <label>${field.label}</label>
        <input class="${inputClass}" type="${field.type}" name="${field.name}" value="${value}" ${placeholder} ${min}/>
      </div>`;
  }).join("");

  const content = `
    <form class="gum-social-entry-form" autocomplete="off">
      <div class="gum-social-dialog-intro">
        <span class="gum-social-dialog-intro__icon"><i class="fas fa-user-tag"></i></span>
        <p class="hint">Preencha os dados do aspecto social. Você poderá editar este registro posteriormente pela ficha.</p>
      </div>
      ${fieldHtml}
    </form>`;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: isEdit ? `Editar ${config.label}` : `Adicionar ${config.label}`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Salvar",
          callback: (html) => {
            const form = html.find("form")[0];
            const formData = new FormDataExtended(form).object;
            const entryData = {};

            for (const field of config.fields) {
              let value = formData[field.name];
              if (field.type === "number") {
                value = Number(value) || 0;
              } else {
                value = (value ?? "").toString().trim();
              }
              entryData[field.name] = value;
            }

            finish(entryData);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancelar",
          callback: () => finish(null)
        }
      },
      default: "save",
      close: () => finish(null)
    }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-social-edit-dialog"], width: 560, height: "auto" }).render(true);
  });
}


_getPointsNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

_getCharacteristicFinalPoints(item) {
  return calculateItemTraitCost(item).finalPoints;
}

_calculateAttributePoints() {
  const attrs = this.actor.system.attributes || {};
  const costs = this.actor.system.points?.attribute_costs || {};
  const definitions = [
    ["st", "ST", 10],
    ["dx", "DX", 20],
    ["iq", "IQ", 20],
    ["ht", "HT", 10],
    ["vont", "Vontade", 5],
    ["per", "Percepção", 5]
  ];

  return definitions.map(([key, label, defaultCost]) => {
    const current = this._getPointsNumber(attrs[key]?.value ?? 10);
    const base = 10;
    const cost = this._getPointsNumber(costs[key] ?? defaultCost);
    const points = (current - base) * cost;
    return { key, label, base, current, cost, points };
  });
}

_calculateSocialPoints() {
  return calculateManualSocialPoints(this.actor.system || {});
}

_calculatePointsSummary() {
  const items = Array.from(this.actor.items || []);
  const attributeRows = this._calculateAttributePoints();
  const secondaryKeys = [
    "hp", "fp", "basic_speed", "basic_move", "enhanced_move", "dodge",
    "vision", "hearing", "tastesmell", "touch", "mt",
    "thrust_damage", "swing_damage", "thrust_damage_alt", "swing_damage_alt",
    "basic_lift", "air_move", "water_move", "burrow_move", "teleport_range",
    "jump_horizontal_standing", "jump_horizontal_running",
    "jump_vertical_standing", "jump_vertical_running",
    "breath_no_exertion", "breath_mild_exertion", "breath_heavy_exertion"
  ];
  const attrs = this.actor.system.attributes || {};

  const totals = {
    primary: attributeRows.reduce((total, row) => total + row.points, 0),
    secondary: secondaryKeys.reduce((total, key) => total + this._getPointsNumber(attrs[key]?.points), 0),
    skills: items.filter((item) => item.type === "skill").reduce((total, item) => total + this._getPointsNumber(item.system?.points), 0),
    advantages: 0,
    disadvantages: 0,
    spells: items.filter((item) => item.type === "spell").reduce((total, item) => total + this._getPointsNumber(item.system?.points), 0),
    powers: items.filter((item) => item.type === "power").reduce((total, item) => total + this._getCharacteristicFinalPoints(item) + this._getPointsNumber(item.system?.points_skill), 0),
    social: this._calculateSocialPoints()
  };

  for (const item of items.filter((item) => ["advantage", "disadvantage"].includes(item.type))) {
    const points = this._getCharacteristicFinalPoints(item);
    if (points >= 0) totals.advantages += points;
    else totals.disadvantages += points;
  }

  const rows = [
    ["Atributos Primários", totals.primary],
    ["Atributos Secundários", totals.secondary],
    ["Perícias", totals.skills],
    ["Vantagens", totals.advantages],
    ["Desvantagens", totals.disadvantages],
    ["Magias", totals.spells],
    ["Poderes", totals.powers],
    ["Aspectos Sociais", totals.social]
  ];

  return { rows, attributeRows, spent: rows.reduce((total, [, points]) => total + points, 0) };
}

async _onOpenPointsSummary(ev) {
  ev.preventDefault();
  const summary = this._calculatePointsSummary();
  const attrRows = summary.attributeRows.map((row) => `
    <div class="points-attribute-row">
      <span class="points-attribute-name">${row.label}</span>
      <label class="points-cost-field">
        <span>Custo/nível</span>
        <input type="number" name="${row.key}" value="${row.cost}" aria-label="Custo por nível de ${row.label}" />
      </label>
      <span class="points-attribute-calculation">${row.current} − ${row.base} = ${row.current - row.base}</span>
      <strong class="${row.points < 0 ? "negative" : ""}">${row.points} <small>pts</small></strong>
    </div>`).join("");

  const summaryIcons = ["fist-raised", "running", "graduation-cap", "star", "exclamation-triangle", "hat-wizard", "bolt", "users"];
  const rowsHtml = summary.rows.map(([label, points], index) => `
    <div class="points-summary-card ${points < 0 ? "negative" : ""}">
      <span class="points-summary-icon"><i class="fas fa-${summaryIcons[index]}" aria-hidden="true"></i></span>
      <span class="points-summary-label">${label}</span>
      <strong>${points} <small>pts</small></strong>
    </div>`).join("");

  const content = `
    <form class="points-summary-dialog-form">
      <header class="points-summary-header">
        <span class="points-summary-header-icon"><i class="fas fa-chart-pie" aria-hidden="true"></i></span>
        <div><h3>Distribuição de Pontos</h3><p>Visão geral dos investimentos desta ficha</p></div>
      </header>
      <section class="points-summary-section points-costs-section" aria-labelledby="points-costs-heading">
        <div class="points-section-heading"><div><h4 id="points-costs-heading">Custos dos atributos</h4><p class="hint">Valores por nível, salvos apenas nesta ficha.</p></div><i class="fas fa-sliders-h" aria-hidden="true"></i></div>
        <div class="points-attribute-costs">${attrRows}</div>
      </section>
      <section class="points-summary-section" aria-labelledby="points-breakdown-heading">
        <h4 id="points-breakdown-heading">Resumo por categoria</h4>
        <div class="points-summary-list">${rowsHtml}</div>
        <div class="points-summary-total"><span><small>Total</small>Total gasto calculado</span><strong>${summary.spent} <small>pts</small></strong></div>
      </section>
    </form>`;

  new Dialog({
    title: "Distribuição de Pontos",
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Salvar custos",
        callback: (html) => {
          const form = html.find("form")[0];
          const formData = new FormDataExtended(form).object;
          const updates = {};
          for (const key of ["st", "dx", "iq", "ht", "vont", "per"]) {
            updates[`system.points.attribute_costs.${key}`] = this._getPointsNumber(formData[key]);
          }
          return this.actor.update(updates);
        }
      },
      close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" }
    },
    default: "save"
  }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "points-summary-dialog"], width: 520 }).render(true);
}

async _onAddSocialEntry(ev) {
  ev.preventDefault();
  const type = ev.currentTarget?.dataset?.type;
  const config = this._getSocialEntryConfig(type);
  if (!config) return;

  const entryData = await this._promptSocialEntryData(type, {}, { isEdit: false });
  if (!entryData) return;

  const entryId = foundry.utils.randomID();
  await this.actor.update({ [`${config.path}.${entryId}`]: entryData });
}

async _onEditSocialEntry(ev) {
  ev.preventDefault();
  const type = ev.currentTarget?.dataset?.type;
  const entryId = ev.currentTarget.closest(".item-row")?.dataset?.entryId;
  const config = this._getSocialEntryConfig(type);
  if (!config || !entryId) return;

  const existing = foundry.utils.getProperty(this.actor.system, config.path.split(".").slice(1).join("."))?.[entryId];
  const entryData = await this._promptSocialEntryData(type, existing || {}, { isEdit: true });
  if (!entryData) return;

  await this.actor.update({ [`${config.path}.${entryId}`]: entryData });
}

async _onDeleteSocialEntry(ev) {
  ev.preventDefault();
  const type = ev.currentTarget?.dataset?.type;
  const entryId = ev.currentTarget.closest(".item-row")?.dataset?.entryId;
  const config = this._getSocialEntryConfig(type);
  if (!config || !entryId) return;

  const entries = foundry.utils.getProperty(this.actor.system, config.path.split(".").slice(1).join(".")) || {};
  const name = entries?.[entryId]?.name
    || entries?.[entryId]?.organization_name
    || entries?.[entryId]?.society
    || entries?.[entryId]?.culture_name
    || entries?.[entryId]?.language_name
    || entries?.[entryId]?.title
    || entries?.[entryId]?.wealth_level
    || "registro";

  Dialog.confirm({
    title: `Excluir ${name}?`,
    content: "<p>Tem certeza que deseja remover este registro?</p>",
    yes: async () => {
      await this.actor.update({ [`${config.path}.-=${entryId}`]: null });
    }
  });
}

_onToggleSocialEntryDescription(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const card = ev.currentTarget.closest(".social-card");
  const cardKey = card?.dataset?.socialCardKey;
  if (!cardKey) return;

  this._expandedSocialCards ??= new Set();
  const expanded = !this._expandedSocialCards.has(cardKey);
  if (expanded) this._expandedSocialCards.add(cardKey);
  else this._expandedSocialCards.delete(cardKey);

  card.classList.toggle("is-description-expanded", expanded);
  ev.currentTarget.setAttribute("aria-expanded", `${expanded}`);
  const toggleLabel = game.i18n.localize(expanded ? "GUM.Social.CollapseDescription" : "GUM.Social.ExpandDescription");
  ev.currentTarget.setAttribute("title", toggleLabel);
  ev.currentTarget.setAttribute("aria-label", toggleLabel);
  ev.currentTarget.querySelector("i")?.classList.toggle("fa-compress-arrows-alt", expanded);
  ev.currentTarget.querySelector("i")?.classList.toggle("fa-expand-arrows-alt", !expanded);
}


_prepareAppliedModels() {
  const records = Array.isArray(this.actor.system.applied_models) ? this.actor.system.applied_models : [];
  return records
    .filter(record => !record.removedAt)
    .map(record => ({
      ...record,
      appliedAtLabel: record.appliedAt ? new Date(record.appliedAt).toLocaleString() : "-"
    }))
    .sort((a, b) => (a.appliedAt || "").localeCompare(b.appliedAt || ""));
}

async _onAddCharacterModel(ev) {
  ev.preventDefault();
  new TemplateBrowser(this.actor, {
    onSelect: async (selectedTemplate) => {
      const templateDoc = selectedTemplate?.uuid ? await fromUuid(selectedTemplate.uuid).catch(() => null) : null;
      if (!templateDoc) return ui.notifications.error(game.i18n.localize("GUM.Template.ModelNotFound"));
      await this._runTemplateApplicationFlow(templateDoc);
    }
  }).render(true);
}

async _runTemplateApplicationFlow(templateItem) {
  if (!templateItem) return;

  const duplicate = this._findAppliedModelRecord(templateItem);
  if (duplicate) {
    ui.notifications.warn(game.i18n.format("GUM.Template.AlreadyApplied", { name: templateItem.name }));
    return;
  }

  const resolvedGraph = await this._resolveTemplateReferenceGraph(templateItem);
  if (!resolvedGraph) return;
  const blocks = resolvedGraph.blocks;
  const sharedBudgets = Array.isArray(templateItem.system?.sharedBudgets) ? foundry.utils.deepClone(templateItem.system.sharedBudgets) : [];
  const budgetError = this._validateTemplateSharedBudgets(blocks, sharedBudgets);
  if (budgetError) {
    ui.notifications.error(game.i18n.format("GUM.Template.SharedBudgetInvalid", { name: budgetError }));
    return;
  }
  if (!blocks.length) {
    ui.notifications.warn(game.i18n.localize("GUM.Template.NoBlocksToApply"));
    return;
  }
  if (!this._collectTemplateSteps(blocks, {}).length) {
    ui.notifications.warn(game.i18n.localize("GUM.Template.NoEntriesToApply"));
    return;
  }

  const choices = {};
  let index = 0;
  while (true) {
    const steps = this._collectTemplateSteps(blocks, choices);
    const finalStep = index >= steps.length;
    const step = finalStep ? null : steps[index];
    const result = await this._promptTemplateWizardStep(step, choices, index, steps.length, templateItem, blocks, sharedBudgets);
    if (!result || result.action === "cancel") return;
    if (result.action === "retry") continue;
    if (result.action === "back") {
      if (step && result.choice) choices[step.id] = result.choice;
      if (finalStep && result.destinations) choices.__destinations = result.destinations;
      if (finalStep && result.conflicts) choices.__conflicts = result.conflicts;
      if (finalStep) choices.__moneyAllocations = result.moneyAllocations || choices.__moneyAllocations || {};
      index = Math.max(0, index - 1);
      continue;
    }
    if (step) choices[step.id] = result.choice;
    if (finalStep) {
      choices.__destinations = result.destinations || {};
      choices.__conflicts = result.conflicts || {};
      choices.__moneyAllocations = result.moneyAllocations || {};
      break;
    }
    index++;
  }
  const { plan, pointsLeftoverTotal, budgetResults, selectedTemplates, duplicateReference } = this._buildTemplatePlanFromChoices(blocks, choices, sharedBudgets);
  if (duplicateReference) {
    ui.notifications.error(game.i18n.format("GUM.Template.ReferenceRepeated", { name: duplicateReference.name }));
    return;
  }
  const exceeded = budgetResults.find(result => !this._isTemplateBudgetResultValid(result));
  if (exceeded) {
    ui.notifications.error(game.i18n.format("GUM.Template.SharedBudgetExceeded", { name: exceeded.title || exceeded.type }));
    return;
  }
  if (this._validateTemplateChoiceRules(blocks, choices).length) {
    ui.notifications.warn(game.i18n.localize("GUM.Template.ChoiceRulesInvalid"));
    return;
  }
  if (this._findAppliedModelRecord(templateItem)) {
    ui.notifications.warn(game.i18n.format("GUM.Template.AlreadyApplied", { name: templateItem.name }));
    return;
  }
  const applied = await this._applyTemplatePlan(templateItem, plan, {
    pointsLeftoverTotal,
    budgetResults,
    referencedTemplates: selectedTemplates,
    moneyAllocations: choices.__moneyAllocations
  });
  if (!applied) return;

  ui.notifications.info(game.i18n.format("GUM.Template.Applied", { name: templateItem.name }));
}

async _resolveTemplateReferenceGraph(templateItem) {
  const references = [];
  const rootIdentity = templateItem.uuid || templateItem.id;
  const expandBlocks = async (blocks, chain, stack, scope = "") => {
    const expanded = foundry.utils.deepClone(Array.isArray(blocks) ? blocks : []);
    for (const block of expanded) {
      block.id = `${scope}${block.id}`;
      block.originChain = foundry.utils.deepClone(chain);
      for (const entry of block.contents || []) {
        const sourceEntryId = entry.id;
        entry.id = `${scope}${sourceEntryId}`;
        entry.originChain = foundry.utils.deepClone(chain);
        if (entry.kind === "template") {
          const referenced = entry.uuid ? await fromUuid(entry.uuid).catch(() => null) : game.items.get(entry.sourceId);
          if (!referenced || referenced.type !== "template") {
            ui.notifications.error(game.i18n.format("GUM.Template.MissingReferencedModel", { name: entry.name || "?" }));
            return null;
          }
          const identity = referenced.uuid || referenced.id;
          if (stack.includes(identity)) {
            ui.notifications.error(game.i18n.format("GUM.Template.ReferenceCycle", { name: referenced.name }));
            return null;
          }
          const nextChain = [...chain, { id: referenced.id, uuid: referenced.uuid, name: referenced.name }];
          const subBlocks = await expandBlocks(referenced.system?.blocks, nextChain, [...stack, identity], `${entry.id}:`);
          if (!subBlocks) return null;
          entry.name = entry.name || referenced.name;
          entry.img = entry.img || referenced.img;
          entry.templateUuid = referenced.uuid;
          entry.templateId = referenced.id;
          entry.subBlocks = [...(entry.subBlocks || []), ...subBlocks];
          references.push({ id: referenced.id, uuid: referenced.uuid, name: referenced.name, chain: nextChain.map(item => item.name) });
        } else if (entry.subBlocks?.length) {
          const subBlocks = await expandBlocks(entry.subBlocks, chain, stack, scope);
          if (!subBlocks) return null;
          entry.subBlocks = subBlocks;
        }
      }
    }
    return expanded;
  };
  const root = { id: templateItem.id, uuid: templateItem.uuid, name: templateItem.name };
  const blocks = await expandBlocks(templateItem.system?.blocks, [root], [rootIdentity]);
  return blocks ? { blocks, references } : null;
}

_collectTemplateSteps(blocks, choices, output = [], rootBlocks = blocks) {
  for (const block of blocks || []) {
    if (!Array.isArray(block.contents) || !block.contents.length) continue;
    output.push(block);
    const selected = block.type === "guaranteed"
      ? block.contents.filter(entry => this._getTemplateEntryAvailability(entry, rootBlocks, choices).available)
      : block.contents.filter(entry => choices[block.id]?.ids?.includes(entry.id)
        && this._getTemplateEntryAvailability(entry, rootBlocks, choices).available);
    for (const entry of selected) this._collectTemplateSteps(entry.subBlocks, choices, output, rootBlocks);
  }
  return output;
}

_buildTemplatePlanFromChoices(blocks, choices, sharedBudgets = []) {
  const plan = [];
  let pointsLeftoverTotal = 0;
  const budgetResults = [];
  const sharedSpent = new Map();
  const sharedDefinitions = new Map(sharedBudgets.map(budget => [`${budget.type}:${String(budget.name || "").trim().toLocaleLowerCase()}`, budget]));
  const selectedTemplates = [];
  const selectedTemplateIds = new Set();
  let duplicateReference = null;
  const visit = (list, inherited = { group: "", container: "" }) => {
    for (const block of list || []) {
      const blockGroup = block.destinationGroup || inherited.group;
      const blockContainer = block.containerName || inherited.container;
      const contents = Array.isArray(block.contents) ? block.contents : [];
      const choice = choices[block.id] || {};
      const selected = (block.type === "guaranteed" ? contents : contents.filter(entry => choice.ids?.includes(entry.id)))
        .filter(entry => this._getTemplateEntryAvailability(entry, blocks, choices).available);
      if (block.type === "points") {
        const spent = selected.filter(entry => choices.__conflicts?.[entry.id]?.action !== "ignore")
          .reduce((sum, entry) => sum + this._templateChoiceCost(entry, choice.levels?.[entry.id], choice.quantities?.[entry.id], choice.attributeValues?.[entry.id]), 0);
        const key = String(block.sharedBudgetKey || "").trim().toLocaleLowerCase();
        if (key) sharedSpent.set(`points:${key}`, (sharedSpent.get(`points:${key}`) || 0) + spent);
        else {
          pointsLeftoverTotal += (Number(block.pointsAvailable) || 0) - spent;
          budgetResults.push({ blockId: block.id, title: block.title || "", type: "points", budget: Number(block.pointsAvailable) || 0,
            spent, excess: Math.max(0, spent - (Number(block.pointsAvailable) || 0)), policy: block.budgetPolicy || "hard", originChain: block.originChain || [] });
        }
      }
      if (block.type === "money") {
        const spent = selected.filter(entry => choices.__conflicts?.[entry.id]?.action !== "ignore")
          .reduce((sum, entry) => sum + this._templateMoneyCost(entry, choice.quantities?.[entry.id]), 0);
        const moneyMode = this._resolveTemplateMoneyMode(block);
        const key = moneyMode === "shared" ? String(block.sharedBudgetKey || "").trim().toLocaleLowerCase() : "";
        if (key) sharedSpent.set(`money:${key}`, (sharedSpent.get(`money:${key}`) || 0) + spent);
        else {
          const spendingLimit = moneyMode === "deduct" ? this._resolveTemplateSpendingLimit(block) : Number(block.moneyAvailable) || 0;
          const unlimited = moneyMode === "deduct" && spendingLimit === null;
          const budget = unlimited ? 0 : spendingLimit;
          const configuredPolicy = block.budgetPolicy || "hard";
          const policy = moneyMode === "deduct" && !["hard", "gm"].includes(configuredPolicy) ? "hard" : configuredPolicy;
          budgetResults.push({ blockId: block.id, title: block.title || "", type: "money", budget,
            spent, excess: unlimited ? 0 : Math.max(0, spent - budget), policy, unlimited,
            moneyMode, accounting: moneyMode === "deduct" ? "deduct" : "budget",
            moneySourceFilter: moneyMode === "deduct" ? String(block.moneySourceFilter || "").trim() : "",
            paymentRules: moneyMode === "deduct" ? this._normalizeTemplatePaymentRules(block.paymentRules) : this._normalizeTemplatePaymentRules(), originChain: block.originChain || [] });
        }
      }
      for (const entry of selected) {
        if (entry.kind === "template") {
          const identity = entry.templateUuid || entry.uuid || entry.templateId || entry.sourceId;
          if (identity && selectedTemplateIds.has(identity) && !entry.repeatable) duplicateReference ||= entry;
          if (identity) selectedTemplateIds.add(identity);
          selectedTemplates.push({ id: entry.templateId || entry.sourceId, uuid: entry.templateUuid || entry.uuid,
            name: entry.name, chain: [...(entry.originChain || []).map(item => item.name), entry.name] });
        }
        if (!["group", "template"].includes(entry.kind)) {
          const groupMode = entry.destinationMode || (entry.destinationGroup ? "group" : "inherit");
          const containerMode = entry.containerMode || (entry.containerName ? "new" : "inherit");
          const resolved = { ...entry, blockId: block.id, blockType: block.type,
            destinationGroup: groupMode === "source" ? "" : groupMode === "group" ? entry.destinationGroup || "" : blockGroup,
            containerName: containerMode === "loose" ? "" : containerMode === "new" ? entry.containerName || "" : blockContainer };
          if (choices.__destinations?.[entry.id]) {
            const destination = choices.__destinations[entry.id];
            resolved.containerName = destination.startsWith("new:") ? destination.slice(4) : "";
            resolved.containerId = destination.startsWith("existing:") ? destination.slice(9) : "";
          }
          if (choice.levels?.[entry.id] !== undefined) {
            resolved.level = this._templateEntryLevel(entry, choice.levels[entry.id]);
            resolved.cost = this._templateChoiceCost(entry, resolved.level);
          }
          if (choice.quantities?.[entry.id] !== undefined) resolved.quantity = this._templateEntryQuantity(entry, choice.quantities[entry.id]);
          if (entry.kind === "attribute" && choice.attributeValues?.[entry.id]) {
            resolved.attributes = this._templateAttributeAmounts(entry, choice.attributeValues[entry.id]);
            resolved.cost = this._templateChoiceCost(entry, undefined, undefined, choice.attributeValues[entry.id]);
          }
          const conflict = choices.__conflicts?.[entry.id] || {};
          resolved.conflictAction = conflict.action || "duplicate";
          resolved.conflictTargetId = conflict.targetId || "";
          if (resolved.conflictAction === "ignore") continue;
          plan.push(resolved);
        }
        visit(entry.subBlocks, { group: blockGroup, container: blockContainer });
      }
    }
  };
  visit(blocks);
  for (const [key, spent] of sharedSpent) {
    const definition = sharedDefinitions.get(key);
    if (!definition) continue;
    const budget = Number(definition.amount) || 0;
    const accounting = definition.type === "money" && definition.accounting === "deduct" ? "deduct" : "budget";
    const configuredPolicy = definition.policy || "hard";
    const policy = accounting === "deduct" && !["hard", "gm"].includes(configuredPolicy) ? "hard" : configuredPolicy;
    const result = { blockId: `shared:${key}`, sharedKey: key, title: definition.name, type: definition.type,
      budget, spent, excess: Math.max(0, spent - budget), policy,
      moneyMode: definition.type === "money" ? "shared" : "", accounting,
      moneySourceFilter: String(definition.moneySourceFilter || "").trim(), paymentRules: this._normalizeTemplatePaymentRules(definition.paymentRules), originChain: [] };
    budgetResults.push(result);
    if (definition.type === "points") pointsLeftoverTotal += budget - spent;
  }
  return { plan, pointsLeftoverTotal, budgetResults, selectedTemplates, duplicateReference };
}

_resolveTemplateMoneyMode(block = {}) {
  if (["deduct", "available", "shared"].includes(block.moneyMode)) return block.moneyMode;
  if (String(block.sharedBudgetKey || "").trim()) return "shared";
  return block.moneyAccounting === "deduct" ? "deduct" : "available";
}

_resolveTemplateSpendingLimit(block = {}) {
  if (Object.prototype.hasOwnProperty.call(block, "spendingLimit")) {
    if (block.spendingLimit === "" || block.spendingLimit === null || block.spendingLimit === undefined) return null;
    return Math.max(0, Number(block.spendingLimit) || 0);
  }
  return Math.max(0, Number(block.moneyAvailable) || 0);
}

_templateRuleNames(value) {
  return (Array.isArray(value) ? value : String(value || "").split(","))
    .map(name => String(name).trim()).filter(Boolean);
}

_normalizeTemplateEntryRequirements(requirements = []) {
  return (Array.isArray(requirements) ? requirements : []).map(requirement => {
    const rawLevel = requirement?.minimumLevel;
    return { condition: requirement?.condition === "exclude" ? "exclude" : "require",
      itemType: ["advantage", "disadvantage", "skill", "spell", "power", "equipment", "group", "template", "attribute"].includes(requirement?.itemType) ? requirement.itemType : "",
      name: String(requirement?.name || "").trim(),
      minimumLevel: rawLevel === "" || rawLevel === null || rawLevel === undefined || !Number.isFinite(Number(rawLevel)) ? null : Number(rawLevel) };
  }).filter(requirement => requirement.name);
}

_getTemplateEntryRequirements(entry = {}) {
  const requirements = this._normalizeTemplateEntryRequirements(entry.requirements);
  for (const [field, condition] of [["requiresNames", "require"], ["excludesNames", "exclude"]]) {
    for (const name of this._templateRuleNames(entry[field])) requirements.push({ condition, itemType: "", name, minimumLevel: null });
  }
  const seen = new Set();
  return requirements.filter(requirement => {
    const key = `${requirement.condition}:${requirement.itemType}:${requirement.name.toLocaleLowerCase()}:${requirement.minimumLevel ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

_templateRequirementCandidateLevel(candidate) {
  const raw = candidate?.system?.level ?? candidate?.system?.skill_level ?? candidate?.trait_cost?.level ?? candidate?.level;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

_templateRequirementMatches(requirement, candidate) {
  const candidateType = ["group", "template", "attribute"].includes(candidate?.kind)
    ? candidate.kind : candidate?.type || candidate?.itemType;
  if (requirement.itemType && candidateType !== requirement.itemType) return false;
  const normalize = value => String(value || "").trim().toLocaleLowerCase();
  const target = normalize(requirement.name);
  const names = [candidate?.name, candidate?.label, templateEntryDisplayName(candidate, candidate)].map(normalize);
  if (!names.includes(target)) return false;
  return requirement.minimumLevel === null || this._templateRequirementCandidateLevel(candidate) >= requirement.minimumLevel;
}

_getTemplateSelectedRequirementCandidates(blocks, choices) {
  const selected = [];
  const visit = list => {
    for (const block of list || []) {
      const entries = block.type === "guaranteed" ? block.contents || []
        : (block.contents || []).filter(entry => choices?.[block.id]?.ids?.includes(entry.id));
      for (const entry of entries) {
        if (choices?.__conflicts?.[entry.id]?.action === "ignore") continue;
        selected.push(entry);
        visit(entry.subBlocks);
      }
    }
  };
  visit(blocks);
  return selected;
}

_getTemplateEntryAvailability(entry, blocks, choices) {
  const reasons = [];
  const failedRequirements = [];
  if (entry?.available === false) reasons.push(game.i18n.localize("GUM.Template.OptionManuallyUnavailable"));
  const selected = this._getTemplateSelectedRequirementCandidates(blocks, choices).filter(candidate => candidate !== entry && candidate.id !== entry?.id);
  const candidates = [...(this.actor?.items || []), ...selected];
  for (const requirement of this._getTemplateEntryRequirements(entry)) {
    const matched = candidates.some(candidate => this._templateRequirementMatches(requirement, candidate));
    const failed = requirement.condition === "exclude" ? matched : !matched;
    if (!failed) continue;
    failedRequirements.push(requirement);
    const level = requirement.minimumLevel === null ? "" : ` (${game.i18n.localize("GUM.Template.MinimumLevelShort")} ${requirement.minimumLevel})`;
    reasons.push(`${game.i18n.localize(requirement.condition === "exclude" ? "GUM.Template.RequirementMustNotHave" : "GUM.Template.RequirementMustHave")}: ${requirement.name}${level}`);
  }
  const overridden = reasons.length > 0 && Boolean(game.user?.isGM && entry?.allowGMOverride);
  const available = reasons.length === 0 || overridden;
  return { available, overridden, hidden: !available && entry?.unavailableBehavior === "hidden",
    reasons: entry?.unavailableReason && reasons.length ? [String(entry.unavailableReason)] : reasons, failedRequirements };
}

_validateTemplateChoiceRules(blocks, choices) {
  const selected = [];
  const visit = list => {
    for (const block of list || []) {
      const choice = choices[block.id] || {};
      const entries = block.type === "guaranteed" ? (block.contents || []).filter(entry => entry.available !== false || this._getTemplateEntryAvailability(entry, blocks, choices).available)
        : (block.contents || []).filter(entry => choice.ids?.includes(entry.id));
      for (const entry of entries) {
        if (choices.__conflicts?.[entry.id]?.action === "ignore") continue;
        selected.push(entry);
        visit(entry.subBlocks);
      }
    }
  };
  visit(blocks);
  const issues = [];
  for (const entry of selected) {
    const availability = this._getTemplateEntryAvailability(entry, blocks, choices);
    if (!availability.available && availability.failedRequirements.length) {
      for (const requirement of availability.failedRequirements) issues.push({ entry: templateEntryDisplayName(entry) || "?",
        target: entry.unavailableReason || requirement.name, kind: requirement.condition === "exclude" ? "incompatible" : "required" });
    } else if (!availability.available) issues.push({ entry: templateEntryDisplayName(entry) || "?", target: availability.reasons.join(" · "), kind: "unavailable" });
  }
  return issues;
}

_validateTemplateSharedBudgets(blocks, sharedBudgets) {
  const definitions = new Set();
  for (const budget of sharedBudgets) {
    const name = String(budget.name || "").trim();
    if (!name || !["points", "money"].includes(budget.type) || !Number.isFinite(Number(budget.amount))) return name || "?";
    const key = `${budget.type}:${name.toLocaleLowerCase()}`;
    if (definitions.has(key)) return name;
    definitions.add(key);
  }
  const visit = list => {
    for (const block of list || []) {
      const name = block.type === "money" && this._resolveTemplateMoneyMode(block) !== "shared"
        ? "" : String(block.sharedBudgetKey || "").trim();
      if (block.type === "money" && this._resolveTemplateMoneyMode(block) === "shared" && !name) return block.title || "?";
      if (name && !definitions.has(`${block.type}:${name.toLocaleLowerCase()}`)) return name;
      for (const entry of block.contents || []) {
        const error = visit(entry.subBlocks);
        if (error) return error;
      }
    }
    return null;
  };
  return visit(blocks);
}

_templateBudgetStatus(block, draftChoice, blocks, choices, sharedBudgets) {
  const draft = { ...choices, [block.id]: draftChoice };
  const steps = this._collectTemplateSteps(blocks, draft);
  const currentIndex = steps.findIndex(step => step.id === block.id);
  for (const step of steps.slice(currentIndex + 1)) delete draft[step.id];
  const results = this._buildTemplatePlanFromChoices(blocks, draft, sharedBudgets).budgetResults;
  const name = block.type === "money" && this._resolveTemplateMoneyMode(block) !== "shared"
    ? "" : String(block.sharedBudgetKey || "").trim().toLocaleLowerCase();
  const result = name
    ? results.find(entry => entry.sharedKey === `${block.type}:${name}`)
    : results.find(entry => entry.blockId === block.id);
  if (!result) return { spent: 0, budget: 0, valid: false, unlimited: false, accounting: "budget", paymentRules: this._normalizeTemplatePaymentRules(), moneySourceFilter: "" };
  const valid = this._isTemplateBudgetResultValid(result);
  return { spent: result.spent, budget: result.budget, valid, unlimited: result.unlimited === true,
    accounting: result.accounting || "budget", paymentRules: this._normalizeTemplatePaymentRules(result.paymentRules), moneySourceFilter: result.moneySourceFilter || "" };
}

_isTemplateBudgetResultValid(result) {
  const rule = { budgetPolicy: result.policy, pointsAvailable: result.budget, moneyAvailable: result.budget, unlimited: result.unlimited === true };
  return result.type === "money" ? this._isTemplateMoneySpendValid(rule, result.spent) : this._isTemplatePointsSpendValid(rule, result.spent);
}

_templateMoneyCost(entry, quantity = undefined) {
  const unitPrice = Math.max(0, Number(entry.moneyCost ?? entry.cost) || 0);
  return unitPrice * this._templateEntryQuantity(entry, quantity);
}

_getTemplateItemConflicts(entry) {
  const name = String(entry?.name || entry?.label || "").trim().toLocaleLowerCase();
  if (!name || !entry?.itemType) return [];
  const specialization = String(entry.specialization || entry.inlineItem?.system?.specialization || "").trim().toLocaleLowerCase();
  return this.actor.items.filter(item => item.type === entry.itemType
    && String(item.name || "").trim().toLocaleLowerCase() === name
    && String(item.system?.specialization || "").trim().toLocaleLowerCase() === specialization);
}

_validateTemplateConflictPlan(plan) {
  const targets = new Set();
  for (const entry of plan) {
    if (!["update", "replace"].includes(entry.conflictAction)) continue;
    let target = this.actor.items.get(entry.conflictTargetId);
    if (!target) {
      const matches = this._getTemplateItemConflicts(entry);
      if (matches.length === 1) {
        target = matches[0];
        entry.conflictTargetId = target.id;
      }
    }
    if (!target || target.type !== entry.itemType) return "ConflictTargetUnavailable";
    if (target.system?.is_container) return "ConflictContainerUnsupported";
    if (targets.has(target.id)) return "ConflictTargetRepeated";
    targets.add(target.id);
  }
  return null;
}

_templateAttributeAmounts(entry, values = undefined) {
  const result = {};
  const selected = new Set(Array.isArray(entry.selectedAttributes) ? entry.selectedAttributes : []);
  const locked = new Set(Array.isArray(entry.lockedAttributes) ? entry.lockedAttributes : []);
  for (const [key, raw] of Object.entries(entry.attributes || {})) {
    const initial = Number(raw) || 0;
    const legacyLimitRaw = entry.attributeLimits?.[key] ?? (key === "move" ? entry.attributeLimits?.basic_move : undefined);
    const legacyLimit = Number(legacyLimitRaw);
    const minimumRaw = entry.attributeMinimums?.[key] ?? (key === "move" ? entry.attributeMinimums?.basic_move : undefined);
    const maximumRaw = entry.attributeMaximums?.[key] ?? (key === "move" ? entry.attributeMaximums?.basic_move : undefined);
    let minimum = minimumRaw !== "" && minimumRaw !== null && minimumRaw !== undefined && Number.isFinite(Number(minimumRaw))
      ? Number(minimumRaw) : Number.isFinite(legacyLimit) && legacyLimit > 0 ? -Math.max(Math.abs(initial), legacyLimit) : -Infinity;
    let maximum = maximumRaw !== "" && maximumRaw !== null && maximumRaw !== undefined && Number.isFinite(Number(maximumRaw))
      ? Number(maximumRaw) : Number.isFinite(legacyLimit) && legacyLimit > 0 ? Math.max(Math.abs(initial), legacyLimit) : Infinity;
    if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
    if (!initial && minimum === -Infinity && maximum === Infinity && !selected.has(key)) continue;
    const step = key === "basic_speed" ? 0.25 : 1;
    const requested = locked.has(key) || values?.[key] === undefined ? initial : Number(values[key]);
    const amount = Number.isFinite(requested) ? requested : initial;
    const bounded = Math.min(maximum, Math.max(minimum, amount));
    result[key] = Math.round(bounded / step) * step;
  }
  return result;
}

_templateAttributeLabel(key) {
  const normalized = key === "move" ? "basic_move" : key;
  return game.i18n.localize(`GUM.Template.AttributeLabel.${normalized}`);
}

_templateAttributeCost(entry, values = undefined) {
  if (!values) return Number(entry.cost) || 0;
  const amounts = this._templateAttributeAmounts(entry, values);
  if (!Object.keys(entry.costs || {}).length) {
    const configured = Object.values(entry.attributes || {}).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
    const chosen = Object.values(amounts).reduce((sum, value) => sum + Number(value || 0), 0);
    return configured ? (Number(entry.cost) || 0) * chosen / configured : 0;
  }
  const defaultCosts = { st: 10, dx: 20, iq: 20, ht: 10, will: 5, per: 5, hp: 2, fp: 3,
    hp_max: 2, fp_max: 3, lifting_st: 3, vision: 2, hearing: 2, tastesmell: 2, touch: 2,
    basic_speed: 5, basic_move: 5, move: 5 };
  return Object.entries(amounts).reduce((sum, [key, amount]) =>
    sum + amount / (key === "basic_speed" ? 0.25 : 1) * (Number(entry.costs?.[key] ?? defaultCosts[key]) || 0), 0);
}

_templateChoiceCost(entry, level = undefined, quantity = undefined, attributeValues = undefined) {
  if (entry.kind === "attribute") return this._templateAttributeCost(entry, attributeValues);
  if (entry.itemType === "equipment") return (Number(entry.pointsCost) || 0) * this._templateEntryQuantity(entry, quantity);
  if (level !== undefined && ["advantage", "disadvantage"].includes(entry.itemType)) {
    const trait = entry.trait_cost || entry._resolvedTraitCost || entry.inlineItem?.system;
    if (trait?.can_level) return calculateTraitCost({ ...trait, level: this._templateEntryLevel(entry, level) }).finalPoints;
  }
  if (level === undefined || !["skill", "spell", "power"].includes(entry.itemType)) return Number(entry.cost) || 0;
  level = this._templateEntryLevel(entry, level);
  const difficulty = entry.inlineItem?.system?.difficulty || entry.difficulty || "M";
  const normalized = ({ E: "F", A: "M", H: "D", VH: "MD" })[difficulty] || difficulty;
  if (normalized === "TecM") return Math.max(0, level);
  if (normalized === "TecD") return level > 0 ? level + 1 : 0;
  const starts = { F: 0, M: -1, D: -2, MD: -3 };
  const first = starts[normalized] ?? -1;
  const offset = level - first;
  if (offset < 0) return 0;
  return offset === 0 ? 1 : offset === 1 ? 2 : offset === 2 ? 4 : 4 * (offset - 1);
}

_templateEntryLevel(entry, value) {
  const configuredRaw = entry?.level !== "" && entry?.level !== null && entry?.level !== undefined
    ? entry.level : entry?.trait_cost?.level;
  const configured = Number(configuredRaw) || 0;
  let level = entry?.levelLocked ? configured : Number(value);
  if (!Number.isFinite(level)) level = configured;
  const rawMinimum = entry?.minLevel;
  const rawMaximum = entry?.maxLevel;
  let minimum = Number(rawMinimum);
  let maximum = Number(rawMaximum);
  const hasMinimum = rawMinimum !== "" && rawMinimum !== null && rawMinimum !== undefined && Number.isFinite(minimum);
  const hasMaximum = rawMaximum !== "" && rawMaximum !== null && rawMaximum !== undefined && Number.isFinite(maximum);
  minimum = hasMinimum ? minimum : -Infinity;
  maximum = hasMaximum ? maximum : Infinity;
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
  return Math.min(maximum, Math.max(minimum, level));
}

_isTemplateSelectionValid(block, selectedCount) {
  const limit = Math.max(1, Number(block?.choiceCount) || 1);
  return selectedCount <= limit && (!block?.choiceExact || selectedCount === limit);
}

_templateSelectionUnits(block, ids = [], quantities = {}) {
  const selected = new Set(ids || []);
  return (block?.contents || []).reduce((total, entry) => {
    if (!selected.has(entry.id)) return total;
    const quantity = entry.selectionQuantity ? this._templateEntryQuantity(entry, quantities?.[entry.id]) : 1;
    return total + quantity;
  }, 0);
}

_templateEntryQuantity(entry, requested = undefined) {
  const minimum = Math.max(1, Math.floor(Number(entry?.minimumQuantity) || 1));
  const rawMaximum = entry?.maximumQuantity;
  const maximum = rawMaximum === "" || rawMaximum === null || rawMaximum === undefined || !Number.isFinite(Number(rawMaximum))
    ? Infinity : Math.max(minimum, Math.floor(Number(rawMaximum)));
  const configured = Math.min(maximum, Math.max(minimum, Math.floor(Number(entry?.quantity) || minimum)));
  if (entry?.quantityLocked) return configured;
  return Math.min(maximum, Math.max(minimum, Math.floor(Number(requested ?? configured) || minimum)));
}

_isTemplatePointsSpendValid(block, spent) {
  const budget = Number(block?.pointsAvailable) || 0;
  if (["unlimited", "allow"].includes(block?.budgetPolicy)) return true;
  if (block?.budgetPolicy === "gm" && game.user?.isGM) return true;
  return budget >= 0 ? spent <= budget : spent >= budget;
}

_isTemplateMoneySpendValid(block, spent) {
  const policy = block?.budgetPolicy || "hard";
  if (block?.unlimited === true || (Object.prototype.hasOwnProperty.call(block || {}, "spendingLimit")
    && ["", null, undefined].includes(block.spendingLimit))) return spent >= 0;
  if (["unlimited", "allow"].includes(policy)) return true;
  if (policy === "gm" && game.user?.isGM) return true;
  return spent >= 0 && spent <= (Number(block?.moneyAvailable) || 0);
}

async _promptTemplateWizardStep(block, choices, index, total, templateItem, blocks, sharedBudgets = []) {
  const t = key => game.i18n.localize(`GUM.Template.${key}`);
  const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
  const choice = choices[block?.id] || { ids: [], levels: {}, quantities: {}, attributeValues: {} };
  if (block?.type === "points") {
    await Promise.all(block.contents.filter(entry => ["skill", "spell", "power", "advantage", "disadvantage"].includes(entry.itemType)).map(async entry => {
      const source = !entry.difficulty || (!["skill", "spell", "power"].includes(entry.itemType) && !entry.trait_cost)
        ? await this._resolveTemplateEntrySourceItem(entry) : null;
      if (["skill", "spell", "power"].includes(entry.itemType) && !entry.difficulty) entry.difficulty = source?.system?.difficulty || entry.inlineItem?.system?.difficulty || "M";
      if (["advantage", "disadvantage"].includes(entry.itemType) && !entry.trait_cost) entry._resolvedTraitCost = source?.system || entry.inlineItem?.system;
    }));
  }
  const views = block ? await Promise.all(block.contents.map(entry => this._buildTemplateEntryViewData(entry))) : [];
  const rows = block ? block.contents.map((entry, i) => {
    const view = views[i];
    const selected = choice.ids?.includes(entry.id);
    const initialAvailability = this._getTemplateEntryAvailability(entry, blocks, choices);
    const isLevelled = block.type === "points" && (["skill", "spell", "power"].includes(entry.itemType)
      || (["advantage", "disadvantage"].includes(entry.itemType) && (entry.trait_cost || entry._resolvedTraitCost || entry.inlineItem?.system)?.can_level));
    const level = this._templateEntryLevel(entry, choice.levels?.[entry.id] ?? entry.level ?? 0);
    const quantity = this._templateEntryQuantity(entry, choice.quantities?.[entry.id]);
    const quantityEditable = entry.itemType === "equipment" && !entry.quantityLocked
      && (entry.selectionQuantity === true || block.type !== "selection");
    const minimumQuantity = Math.max(1, Math.floor(Number(entry.minimumQuantity) || 1));
    const rawMaximumQuantity = entry.maximumQuantity;
    const maximumQuantity = rawMaximumQuantity === "" || rawMaximumQuantity === null || rawMaximumQuantity === undefined || !Number.isFinite(Number(rawMaximumQuantity)) ? "" : Math.max(minimumQuantity, Math.floor(Number(rawMaximumQuantity)));
    const naturalMinimumLevel = ["advantage", "disadvantage"].includes(entry.itemType) ? 0 : -3;
    const rawMinimumLevel = entry.minLevel;
    const hasMinimumLevel = rawMinimumLevel !== "" && rawMinimumLevel !== null && rawMinimumLevel !== undefined && Number.isFinite(Number(rawMinimumLevel));
    const minimumLevel = hasMinimumLevel ? Number(rawMinimumLevel) : naturalMinimumLevel;
    const rawMaximumLevel = entry.maxLevel;
    const hasMaximumLevel = rawMaximumLevel !== "" && rawMaximumLevel !== null && rawMaximumLevel !== undefined && Number.isFinite(Number(rawMaximumLevel));
    const maximumLevel = hasMaximumLevel ? Math.max(minimumLevel, Number(rawMaximumLevel)) : Math.max(12, level + 7);
    const levelEditable = isLevelled && !entry.levelLocked;
    const levelOptions = levelEditable ? Array.from({ length: Math.max(0, Math.floor(maximumLevel) - Math.ceil(minimumLevel) + 1) }, (_, index) => Math.ceil(minimumLevel) + index).map(n =>
      `<option value="${n}" ${n === level ? "selected" : ""}>${n} (${this._templateChoiceCost(entry, n)} ${t("Points")})</option>`).join("") : "";
    const attributeAmounts = entry.kind === "attribute" && block.type === "points"
      ? this._templateAttributeAmounts(entry, choice.attributeValues?.[entry.id]) : {};
    const lockedAttributes = new Set(Array.isArray(entry.lockedAttributes) ? entry.lockedAttributes : []);
    const attributeInputs = Object.entries(attributeAmounts).map(([key, amount]) => {
      const initial = Number(entry.attributes[key]) || 0;
      const legacyLimit = Number(entry.attributeLimits?.[key] ?? (key === "move" ? entry.attributeLimits?.basic_move : undefined));
      const minimumRaw = entry.attributeMinimums?.[key] ?? (key === "move" ? entry.attributeMinimums?.basic_move : undefined);
      const maximumRaw = entry.attributeMaximums?.[key] ?? (key === "move" ? entry.attributeMaximums?.basic_move : undefined);
      const step = key === "basic_speed" ? 0.25 : 1;
      const minimum = minimumRaw !== "" && minimumRaw !== null && minimumRaw !== undefined && Number.isFinite(Number(minimumRaw))
        ? Number(minimumRaw) : Number.isFinite(legacyLimit) && legacyLimit > 0 ? -Math.max(Math.abs(initial), legacyLimit) : null;
      const maximum = maximumRaw !== "" && maximumRaw !== null && maximumRaw !== undefined && Number.isFinite(Number(maximumRaw))
        ? Number(maximumRaw) : Number.isFinite(legacyLimit) && legacyLimit > 0 ? Math.max(Math.abs(initial), legacyLimit) : null;
      const bound = `${minimum === null ? "" : `min="${minimum}"`} ${maximum === null ? "" : `max="${maximum}"`}`.trim();
      if (lockedAttributes.has(key)) return `<label class="template-choice-adjustment template-attribute-adjustment is-locked"><span>${esc(this._templateAttributeLabel(key))}</span><strong>${amount > 0 ? "+" : ""}${amount}</strong></label>`;
      return `<label class="template-choice-adjustment template-attribute-adjustment"><span>${esc(this._templateAttributeLabel(key))}</span><span class="template-attribute-stepper"><button type="button" class="template-attribute-step" data-step="-1" title="-" aria-label="-"><i class="fas fa-minus"></i></button><input type="number" class="template-attribute-choice" data-entry-id="${esc(entry.id)}" data-attribute="${esc(key)}" ${bound} step="${key === "basic_speed" ? "0.25" : "1"}" value="${amount}"><button type="button" class="template-attribute-step" data-step="1" title="+" aria-label="+"><i class="fas fa-plus"></i></button></span></label>`;
    }).join("");
    const rowCost = block.type === "money" ? this._templateMoneyCost(entry, quantity)
      : this._templateChoiceCost(entry, isLevelled ? level : undefined, quantity, entry.kind === "attribute" ? attributeAmounts : undefined);
    const costUnit = block.type === "money" ? t("Money") : t("Points");
    const costDisplay = block.type === "money"
      ? `${Math.max(0, Number(entry.moneyCost ?? entry.cost) || 0)}${quantity !== 1 ? ` × ${quantity} = ${rowCost}` : ""} ${costUnit}`
      : `${rowCost} ${costUnit}`;
    const availabilityText = initialAvailability.overridden ? t("AvailabilityOverridden") : initialAvailability.reasons.join(" · ");
    return `<div class="template-choice-row template-wizard-row${initialAvailability.available ? "" : " template-choice-row--unavailable"}${initialAvailability.hidden ? " is-hidden" : ""}" data-entry-id="${esc(entry.id)}">
      ${block.type === "guaranteed" ? `<span aria-hidden="true"><i class="fas ${initialAvailability.available ? "fa-check" : "fa-lock"}"></i></span>` : `<input type="checkbox" name="entry" value="${esc(entry.id)}" ${selected && initialAvailability.available ? "checked" : ""} ${initialAvailability.available ? "" : "disabled"}>`}
      <span class="template-choice-content"><strong>${view.title}</strong><small>${view.details.join(" · ")}</small><em class="template-choice-availability">${esc(availabilityText)}</em></span>
      ${levelEditable ? `<label class="template-choice-adjustment"><span>${t("Level")}</span><select class="template-level-choice" data-entry-id="${esc(entry.id)}">${levelOptions}</select></label>` : isLevelled ? `<label class="template-choice-adjustment is-locked" title="${t("FixedLevelHint")}"><span>${t("Level")}</span><strong>${level}</strong></label>` : ""}
      ${quantityEditable ? `<label class="template-choice-adjustment template-quantity-adjustment"><span>${t("QuantityShort")}</span><span class="template-quantity-stepper"><button type="button" class="template-quantity-step" data-step="-1" title="-" aria-label="-"><i class="fas fa-minus"></i></button><input type="number" class="template-quantity-choice" data-entry-id="${esc(entry.id)}" min="${minimumQuantity}" ${maximumQuantity === "" ? "" : `max="${maximumQuantity}"`} step="1" value="${quantity}"><button type="button" class="template-quantity-step" data-step="1" title="+" aria-label="+"><i class="fas fa-plus"></i></button></span></label>` : ""}
      ${attributeInputs ? `<span class="template-attribute-choices">${attributeInputs}</span>` : ""}
      <span class="template-choice-cost" data-cost-for="${esc(entry.id)}">${costDisplay}</span>
      <button type="button" class="template-preview-entry" data-entry-id="${esc(entry.id)}" title="${t("PreviewEntry")}" aria-label="${t("PreviewEntry")}"><i class="fas fa-eye"></i></button>
    </div>`;
  }).join("") : "";
  const preview = !block ? this._buildTemplatePlanFromChoices(blocks, choices, sharedBudgets) : null;
  const reviewEntries = !block ? this._buildTemplatePlanFromChoices(blocks, { ...choices, __conflicts: {} }, sharedBudgets).plan : [];
  const reviewViews = !block ? await Promise.all(reviewEntries.map(entry => this._buildTemplateEntryViewData(entry))) : [];
  const ruleIssues = !block ? this._validateTemplateChoiceRules(blocks, choices) : [];
  const containers = this.actor.items.filter(item => item.type === "equipment" && item.system?.is_container);
  const reviewRows = reviewEntries.map((entry, index) => {
    const chosenDestination = choices.__destinations?.[entry.id] || (entry.containerName ? `new:${entry.containerName}` : "loose");
    const destinationOptions = entry.itemType === "equipment" ? [
      `<option value="loose" ${chosenDestination === "loose" ? "selected" : ""}>${t("LooseEquipment")}</option>`,
      ...(entry.containerName ? [`<option value="new:${esc(entry.containerName)}" ${chosenDestination === `new:${entry.containerName}` ? "selected" : ""}>${t("CreateContainer")}: ${esc(entry.containerName)}</option>`] : []),
      ...containers.map(item => `<option value="existing:${esc(item.id)}" ${chosenDestination === `existing:${item.id}` ? "selected" : ""}>${t("ExistingContainer")}: ${esc(item.name)}</option>`)
    ] : [];
    const destination = destinationOptions.length > 1 ? `<select class="template-container-destination" data-entry-id="${esc(entry.id)}">${destinationOptions.join("")}</select>` : "";
    const conflicts = this._getTemplateItemConflicts(entry);
    const savedConflict = choices.__conflicts?.[entry.id] || {};
    const action = savedConflict.action || "duplicate";
    const targetId = savedConflict.targetId || conflicts[0]?.id || "";
    const actionNeedsTarget = ["update", "replace"].includes(action);
    const conflictAction = conflicts.length ? `<select class="template-conflict-action" data-entry-id="${esc(entry.id)}" title="${t("ConflictFound")}" aria-label="${t("ConflictFound")}">
        <option value="duplicate" ${action === "duplicate" ? "selected" : ""}>${t("ConflictDuplicate")}</option>
        <option value="update" ${action === "update" ? "selected" : ""}>${t("ConflictUpdate")}</option>
        <option value="replace" ${action === "replace" ? "selected" : ""}>${t("ConflictReplace")}</option>
        <option value="ignore" ${action === "ignore" ? "selected" : ""}>${t("ConflictIgnore")}</option>
      </select>` : "";
    const conflictControl = conflicts.length > 1 ? `<div class="template-conflict-control${actionNeedsTarget ? "" : " is-hidden"}">
      <span class="template-conflict-label">${t("ExistingItem")}</span>
      <select class="template-conflict-target" data-entry-id="${esc(entry.id)}" ${actionNeedsTarget ? "" : "disabled"}>
        ${conflicts.map(item => `<option value="${esc(item.id)}" ${targetId === item.id ? "selected" : ""}>${esc(templateEntryDisplayName(item, item))}</option>`).join("")}
      </select>
    </div>${conflicts.length === 1 ? `<input type="hidden" class="template-conflict-target" data-entry-id="${esc(entry.id)}" value="${esc(targetId)}">` : ""}` : "";
    const meta = [entry.itemType === "equipment" ? `×${Math.max(1, Number(entry.quantity) || 1)}` : "", entry.destinationGroup ? esc(entry.destinationGroup) : ""].filter(Boolean).join(" · ");
    const acquisitionQuantity = Math.max(1, Number(entry.quantity) || 1);
    const acquisitionUnitPrice = Math.max(0, Number(entry.moneyCost ?? entry.cost) || 0);
    const acquisitionCost = entry.blockType === "money" ? `${t("MoneyUnitPrice")}: ${acquisitionUnitPrice}${acquisitionQuantity !== 1 ? ` × ${acquisitionQuantity} = ${this._templateMoneyCost(entry, acquisitionQuantity)}` : ""} ${t("Money")}`
      : entry.blockType === "points" ? `${this._templateChoiceCost(entry, entry.level, entry.quantity, entry.attributes)} ${t("Points")}` : "";
    const details = [...(reviewViews[index].details || []), entry.level !== "" && entry.level !== null && entry.level !== undefined ? `${t("Level")}: ${entry.level}` : "", acquisitionCost, meta].filter(Boolean).filter((value, position, values) => values.indexOf(value) === position).join(" · ");
    return { entry, index, conflicts, row: `<li class="template-review-card"><div class="template-review-card__main"><strong>${reviewViews[index].title}</strong>${meta ? `<small>${meta}</small>` : ""}</div>
      <div class="template-review-card__actions">${conflictAction}${destination}<button type="button" class="template-preview-entry" data-entry-id="${esc(entry.id)}" title="${t("PreviewEntry")}" aria-label="${t("PreviewEntry")}"><i class="fas fa-eye"></i></button></div>${details ? `<small class="template-review-card__details">${details}</small>` : ""}${conflictControl}</li>` };
  });
  const categoryOrder = ["attribute", "skill", "advantage", "disadvantage", "spell", "power", "equipment", "other"];
  const categoryLabel = key => key === "attribute" ? t("Attributes") : key === "other" ? t("Item") : this._getTemplateEntryTypeLabel(key);
  const reviewGroups = categoryOrder.map(key => ({ key, label: categoryLabel(key), rows: reviewRows.filter(({ entry }) => (entry.kind === "attribute" ? "attribute" : entry.itemType || "other") === key && !this._getTemplateItemConflicts(entry).length) })).filter(group => group.rows.length);
  const conflictRows = reviewRows.filter(({ conflicts }) => conflicts.length);
  const confirmedSections = reviewGroups.map(group => `<details class="template-review-category"><summary><span>${group.label}</span><strong>${group.rows.length}</strong></summary><ul class="template-review-list">${group.rows.map(row => row.row).join("")}</ul></details>`).join("");
  const pointResults = (preview?.budgetResults || []).filter(result => result.type === "points");
  const pointCosts = reviewEntries.filter(entry => entry.blockType === "points")
    .map(entry => entry.itemType === "equipment" ? Number(entry.pointsCost || 0) * Math.max(1, Number(entry.quantity) || 1) : Number(entry.cost || 0));
  const pointTotals = { invested: pointCosts.filter(cost => cost > 0).reduce((total, cost) => total + cost, 0), disadvantages: pointCosts.filter(cost => cost < 0).reduce((total, cost) => total + cost, 0), remaining: (preview?.budgetResults || []).filter(result => result.type === "points").reduce((total, result) => total + Number(result.budget || 0) - Number(result.spent || 0), 0) };
  const moneyResults = (preview?.budgetResults || []).filter(result => result.type === "money");
  const budgetMoneyResults = moneyResults.filter(result => result.accounting !== "deduct");
  const debitMoneyResults = moneyResults.filter(result => result.accounting === "deduct");
  const moneyTotals = {
    invested: moneyResults.reduce((total, result) => total + Number(result.spent || 0), 0),
    remaining: budgetMoneyResults.reduce((total, result) => total + Number(result.budget || 0) - Number(result.spent || 0), 0),
    debit: debitMoneyResults.reduce((total, result) => total + Number(result.spent || 0), 0)
  };
  const pointTotalsMarkup = pointResults.length ? `<section class="template-review-total" data-review-total="points"><h3>${t("PointsSummary")}</h3><div><span>${t("PointsInvested")}</span><strong data-review-points-invested>${pointTotals.invested}/${pointTotals.disadvantages}</strong></div><div><span>${t("PointsRemaining")}</span><strong data-review-points-remaining>${pointTotals.remaining}</strong></div></section>` : "";
  const moneyTotalsMarkup = moneyResults.length ? `<section class="template-review-total${budgetMoneyResults.length && debitMoneyResults.length ? " template-review-total--triple" : ""}" data-review-total="money"><h3>${t("MoneySummary")}</h3><div><span>${t("PurchaseTotal")}</span><strong data-review-money-invested>${moneyTotals.invested}</strong></div>${budgetMoneyResults.length ? `<div><span>${t("MoneyRemaining")}</span><strong data-review-money-remaining>${moneyTotals.remaining}</strong></div>` : ""}${debitMoneyResults.length ? `<div><span>${t("ToDebit")}</span><strong data-review-money-debit>${moneyTotals.debit}</strong></div>` : ""}</section>` : "";
  const reviewTotalsMarkup = `${pointTotalsMarkup}${moneyTotalsMarkup}`;
  const issueLabel = issue => t(issue.kind === "required" ? "RequiresChoice" : issue.kind === "unavailable" ? "OptionUnavailable" : "IncompatibleChoice");
  const ruleSummary = ruleIssues.map(issue => `<li>${issueLabel(issue)}: ${esc(issue.entry)} → ${esc(issue.target)}</li>`).join("");
  const originLabel = block?.originChain?.length > 1 ? `${block.originChain.map(item => esc(item.name)).join(" → ")} · ` : "";
  const title = block ? `${originLabel}${esc(block.title || t("Block"))} (${index + 1}/${total + 1})` : t("ReviewTitle");
  const blockMoneyMode = block?.type === "money" ? this._resolveTemplateMoneyMode(block) : "";
  const usesSharedBudget = Boolean(block?.sharedBudgetKey) && (block?.type !== "money" || blockMoneyMode === "shared");
  const sharedDefinition = usesSharedBudget ? sharedBudgets.find(budget => budget.type === block.type &&
    String(budget.name || "").trim().toLocaleLowerCase() === String(block.sharedBudgetKey).trim().toLocaleLowerCase()) : null;
  const moneyDebitsCharacter = block?.type === "money" && (blockMoneyMode === "deduct" || sharedDefinition?.accounting === "deduct");
  const initialBudgetStatus = ["points", "money"].includes(block?.type) ? this._templateBudgetStatus(block, choice, blocks, choices, sharedBudgets) : null;
  const blockHint = block?.type === "guaranteed" ? t("GuaranteedHint")
    : block?.type === "selection" ? `${block.choiceExact ? t("ChooseExactly") : t("ChooseUpTo")} ${Number(block.choiceCount) || 1}`
      : block?.type === "money" ? `${t(moneyDebitsCharacter ? "SpendingLimit" : "MoneyAvailable")}: ${moneyDebitsCharacter && !sharedDefinition && this._resolveTemplateSpendingLimit(block) === null ? t("Unlimited") : Number(sharedDefinition?.amount ?? (blockMoneyMode === "deduct" ? this._resolveTemplateSpendingLimit(block) : block.moneyAvailable)) || 0}${sharedDefinition ? ` · ${t("SharedBudget")}: ${esc(sharedDefinition.name)}` : ""}`
        : `${t("Budget")}: ${Number(sharedDefinition?.amount ?? block?.pointsAvailable) || 0}${sharedDefinition ? ` · ${t("SharedBudget")}: ${esc(sharedDefinition.name)}` : ""}`;
  const blockInstructions = block ? String(block.instructions || "").trim() : "";
  const blockInstructionsMarkup = blockInstructions
    ? `<p class="template-flow-instructions">${esc(blockInstructions).replace(/\r?\n/g, "<br>")}</p>` : "";
  const needsPayment = !block && preview?.budgetResults?.some(result => result.type === "money" && result.accounting === "deduct" && Number(result.spent) > 0);
  const moneySources = needsPayment ? this.actor.items.filter(item => item.type === "money_source") : [];
  const paymentLines = needsPayment ? preview.budgetResults.filter(result => result.type === "money" && result.accounting === "deduct" && Number(result.spent) > 0) : [];
  const automaticPaymentReserved = new Map();
  const paymentAllocationRow = (result, accepted, allocation = {}, index = 0) => `<div class="template-payment-allocation" data-payment-id="${esc(result.blockId)}" data-allocation-index="${index}">
    <label class="template-payment-source-field"><span>${t("PaymentSource")}</span><select class="template-money-source" aria-label="${t("PaymentSource")}"><option value="">${t("PaymentSource")}</option>${accepted.map(item => `<option value="${esc(item.id)}" ${allocation.sourceId === item.id ? "selected" : ""}>${esc(item.name)} · ${this._getMoneySourceBalance(item)}</option>`).join("")}</select></label>
    <label class="template-payment-amount"><span>${t("PaymentAmount")}</span><input type="number" min="0" step="any" value="${esc(allocation.amount ?? 0)}" aria-label="${t("PaymentAmount")}"></label>
    <span class="template-payment-balance-field"><span>${t("PaymentBalance")}</span><small class="template-payment-balance"></small></span>
    <button type="button" class="template-payment-remove" title="${t("RemovePaymentSource")}" aria-label="${t("RemovePaymentSource")}"><i class="fas fa-trash"></i></button>
  </div>`;
  const paymentSource = needsPayment ? `<details class="template-review-section template-payment-source" open><summary><span>${t("PaymentSources")}</span><strong>${paymentLines.length}</strong></summary><div class="template-payment-source__body">${paymentLines.map(result => {
    const filter = String(result.moneySourceFilter || "").trim();
    const accepted = moneySources.filter(item => this._moneySourceMatchesFilter(item, filter, result.paymentRules));
    const legacySourceId = choices.__moneySourceIds?.[result.blockId] || "";
    const prior = choices.__moneyAllocations?.[result.blockId];
    const usedAutomaticAllocation = !(Array.isArray(prior) && prior.length) && !legacySourceId;
    const saved = Array.isArray(prior) && prior.length ? prior
      : legacySourceId ? [{ sourceId: legacySourceId, amount: Number(result.spent) || 0 }]
        : this._buildAutomaticTemplatePaymentAllocations(result, accepted, automaticPaymentReserved);
    if (!usedAutomaticAllocation) for (const allocation of saved) automaticPaymentReserved.set(allocation.sourceId, (automaticPaymentReserved.get(allocation.sourceId) || 0) + Math.max(0, Number(allocation.amount) || 0));
    const rules = this._normalizeTemplatePaymentRules(result.paymentRules);
    const ruleSummary = [rules.categories.length ? `${t("PaymentCategories")}: ${rules.categories.join(", ")}` : "", rules.modes.length ? t(rules.modes[0] === "physical" ? "PaymentPhysical" : "PaymentAbstract") : "", rules.locations.length ? t(`Payment${rules.locations[0][0].toUpperCase()}${rules.locations[0].slice(1)}`) : "", filter].filter(Boolean).join(" · ");
    return `<div class="template-payment-line" data-payment-id="${esc(result.blockId)}"><span class="template-payment-line__summary"><strong>${esc(result.title || t("PurchaseBudget"))}</strong><small>${esc(ruleSummary || t("PaymentAny"))}</small><span class="template-payment-progress"><span>${t("PaymentRequired")}: <strong data-payment-required>${Number(result.spent) || 0}</strong></span><span>${t("PaymentAllocated")}: <strong data-payment-allocated>0</strong></span></span></span><span class="template-payment-line__control">${accepted.length
      ? `<span class="template-payment-allocations">${saved.map((allocation, index) => paymentAllocationRow(result, accepted, allocation, index)).join("")}</span><span class="template-payment-actions"><button type="button" class="template-payment-auto" data-payment-id="${esc(result.blockId)}"><i class="fas fa-wand-magic-sparkles"></i> ${t("AutoAllocatePayment")}</button><button type="button" class="template-payment-add" data-payment-id="${esc(result.blockId)}"><i class="fas fa-plus"></i> ${t("AddPaymentSource")}</button></span><small class="template-payment-error">${t("PaymentAllocationIncomplete")}</small>`
      : `<span class="template-payment-empty">${t("NoPaymentSource")}</span>`}</span></div>`;
  }).join("")}</div></details>` : "";
  const pointBudgetSummary = block?.type === "points" ? `<section class="template-wizard-budget-summary${initialBudgetStatus.valid ? "" : " template-wizard-budget-summary--invalid"}">
    <div><span>${t("PointsAvailable")}</span><strong data-template-budget>${initialBudgetStatus.budget}</strong></div>
    <div><span>${t("PointsSpent")}</span><strong data-template-spent>${initialBudgetStatus.spent}</strong></div>
    <div><span>${t("Leftover")}</span><strong data-template-remaining>${initialBudgetStatus.budget - initialBudgetStatus.spent}</strong></div>
    <p class="template-wizard-budget-notice">${initialBudgetStatus.valid ? "" : t("InvalidBudget")}</p>
  </section>` : "";
  const initialCompatibleBalance = moneyDebitsCharacter ? this._getCompatibleTemplateMoneyBalance(initialBudgetStatus) : 0;
  const initialMoneyValid = Boolean(initialBudgetStatus?.valid) && (!moneyDebitsCharacter || Number(initialBudgetStatus.spent) <= initialCompatibleBalance + 1e-6);
  const moneyBudgetSummary = block?.type === "money" ? `<section class="template-wizard-budget-summary${moneyDebitsCharacter ? " template-wizard-budget-summary--four" : ""}${initialMoneyValid ? "" : " template-wizard-budget-summary--invalid"}">
    <div><span>${t(moneyDebitsCharacter ? "SpendingLimit" : "MoneyAvailable")}</span><strong data-template-money-budget>${initialBudgetStatus.unlimited ? t("Unlimited") : initialBudgetStatus.budget}</strong></div>
    <div><span>${t("PurchaseTotal")}</span><strong data-template-money-spent>${initialBudgetStatus.spent}</strong></div>
    ${moneyDebitsCharacter ? `<div><span>${t("CompatibleBalance")}</span><strong data-template-money-compatible>${initialCompatibleBalance}</strong></div><div><span>${t("BalanceAfterPurchase")}</span><strong data-template-money-after>${initialCompatibleBalance - initialBudgetStatus.spent}</strong></div>` : `<div><span>${t("MoneyRemaining")}</span><strong data-template-money-balance>${initialBudgetStatus.budget - initialBudgetStatus.spent}</strong></div>`}
    <p class="template-wizard-budget-notice">${initialMoneyValid ? "" : t(initialBudgetStatus.valid ? "PaymentInsufficient" : "InvalidMoneyBudget")}</p>
  </section>` : "";
  const guaranteedSpent = block?.type === "guaranteed" ? block.contents.reduce((sum, entry) => sum + this._templateChoiceCost(
    entry,
    undefined,
    entry.quantity,
    entry.kind === "attribute" ? this._templateAttributeAmounts(entry) : undefined
  ), 0) : 0;
  const guaranteedBudgetSummary = block?.type === "guaranteed" ? `<section class="template-wizard-budget-summary">
    <div><span>${t("PointsAvailable")}</span><strong>${guaranteedSpent}</strong></div>
    <div><span>${t("PointsSpent")}</span><strong>${guaranteedSpent}</strong></div>
    <div><span>${t("Leftover")}</span><strong>0</strong></div>
  </section>` : "";
  const initialSelectionCount = block?.type === "selection" ? this._templateSelectionUnits(block, choice.ids, choice.quantities) : 0;
  const selectionLimit = block?.type === "selection" ? Math.max(1, Number(block.choiceCount) || 1) : 0;
  const selectionBudgetSummary = block?.type === "selection" ? `<section class="template-wizard-budget-summary${this._isTemplateSelectionValid(block, initialSelectionCount) ? "" : " template-wizard-budget-summary--invalid"}">
    <div><span>${t("ChoicesAvailable")}</span><strong data-template-selection-budget>${selectionLimit}</strong></div>
    <div><span>${t("ChoicesSelected")}</span><strong data-template-selection-spent>${initialSelectionCount}</strong></div>
    <div><span>${t("ChoicesRemaining")}</span><strong data-template-selection-remaining>${selectionLimit - initialSelectionCount}</strong></div>
    <p class="template-wizard-budget-notice">${this._isTemplateSelectionValid(block, initialSelectionCount) ? "" : t("InvalidChoiceCount")}</p>
  </section>` : "";
  const wizardBudgetSummary = pointBudgetSummary || moneyBudgetSummary || guaranteedBudgetSummary || selectionBudgetSummary;
  const reviewConflictCount = block ? 0 : conflictRows.length;
  const content = `<div class="template-apply-block-dialog${wizardBudgetSummary ? " template-apply-block-dialog--budget" : ""}${block ? "" : " template-apply-block-dialog--review"}">
    <header class="template-flow-header"><span class="template-flow-eyebrow">${t("Model")}</span><h2>${title}</h2>${blockInstructionsMarkup}<p class="template-flow-rule">${block ? blockHint : t("ReviewHint")}</p></header>
    ${block ? `<div class="template-apply-options">${rows}</div>${wizardBudgetSummary || '<div class="template-wizard-balance"></div>'}`
      : `<div class="template-review-body"><details class="template-review-section"><summary><span>${t("ConfirmedItems")}</span><strong>${reviewRows.length - conflictRows.length}</strong></summary>${confirmedSections || `<p class="template-review-empty">${t("NoConfirmedItems")}</p>`}</details>${conflictRows.length ? `<details class="template-review-section template-review-section--conflicts" open><summary><span>${t("ResolveConflicts")}</span><strong>${conflictRows.length}</strong></summary><ul class="template-review-list">${conflictRows.map(row => row.row).join("")}</ul></details>` : ""}${paymentSource}</div><div class="template-review-totals">${reviewTotalsMarkup}</div><ul class="template-rule-issues">${ruleSummary}</ul>`}</div>`;
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    new Dialog({
      title: `${t("Model")}: ${templateItem.name}`,
      content,
      buttons: {
        ...(index ? { back: { label: t("Back"), callback: html => {
          if (!block) {
            return finish({ action: "back", ...this._readTemplateReviewChoices(html) });
          }
          const ids = block.type === "guaranteed" ? block.contents.filter(entry => this._getTemplateEntryAvailability(entry, blocks, choices).available).map(entry => entry.id) : html.find('input[name="entry"]:checked').map((_, el) => el.value).get();
          const levels = {};
          html.find(".template-level-choice").each((_, el) => {
            const entry = block.contents.find(candidate => candidate.id === el.dataset.entryId);
            levels[el.dataset.entryId] = this._templateEntryLevel(entry, el.value);
          });
          const quantities = {};
          html.find(".template-quantity-choice").each((_, el) => { const entry = block.contents.find(candidate => candidate.id === el.dataset.entryId); quantities[el.dataset.entryId] = this._templateEntryQuantity(entry, el.value); });
          const attributeValues = this._readTemplateAttributeChoices(html);
          finish({ action: "back", choice: { ids, levels, quantities, attributeValues } });
        } } } : {}),
        next: { label: block ? t("Next") : t("Apply"), callback: html => {
          if (!block) {
            const review = this._readTemplateReviewChoices(html);
            const draft = { ...choices, __conflicts: review.conflicts, __destinations: review.destinations };
            if (this._validateTemplateChoiceRules(blocks, draft).length) {
              ui.notifications.warn(t("ChoiceRulesInvalid"));
              return finish({ action: "retry" });
            }
            const currentPlan = this._buildTemplatePlanFromChoices(blocks, draft, sharedBudgets);
            const invalidBudget = currentPlan.budgetResults
              .find(result => !this._isTemplateBudgetResultValid(result));
            if (invalidBudget) {
              ui.notifications.warn(game.i18n.format("GUM.Template.SharedBudgetExceeded", { name: invalidBudget.title || invalidBudget.type }));
              return finish({ action: "retry" });
            }
            if (needsPayment) {
              const payments = this._buildTemplatePaymentTransactions(currentPlan.budgetResults, review.moneyAllocations);
              if (!payments.valid) {
                const message = payments.reason === "source" ? "NoPaymentSource"
                  : payments.reason === "allocation" ? "PaymentAllocationIncomplete"
                    : payments.reason === "denomination" ? "PaymentExactRequired" : "PaymentInsufficient";
                ui.notifications.warn(t(message));
                return finish({ action: "retry" });
              }
            }
            return finish({ action: "next", ...review });
          }
          const ids = block.type === "guaranteed" ? block.contents.filter(entry => this._getTemplateEntryAvailability(entry, blocks, choices).available).map(entry => entry.id) : html.find('input[name="entry"]:checked').map((_, el) => el.value).get();
          const levels = {};
          html.find(".template-level-choice").each((_, el) => {
            const entry = block.contents.find(candidate => candidate.id === el.dataset.entryId);
            levels[el.dataset.entryId] = this._templateEntryLevel(entry, el.value);
          });
          const quantities = {};
          html.find(".template-quantity-choice").each((_, el) => { const entry = block.contents.find(candidate => candidate.id === el.dataset.entryId); quantities[el.dataset.entryId] = this._templateEntryQuantity(entry, el.value); });
          const attributeValues = this._readTemplateAttributeChoices(html);
          if (block.type === "selection") {
            if (!this._isTemplateSelectionValid(block, this._templateSelectionUnits(block, ids, quantities))) {
              ui.notifications.warn(t("InvalidChoiceCount"));
              return finish({ action: "retry" });
            }
          }
          if (block.type === "points") {
            const status = this._templateBudgetStatus(block, { ids, levels, quantities, attributeValues }, blocks, choices, sharedBudgets);
            if (!status.valid) {
              ui.notifications.warn(t("InvalidBudget"));
              return finish({ action: "retry" });
            }
          }
          if (block.type === "money") {
            const status = this._templateBudgetStatus(block, { ids, levels, quantities, attributeValues }, blocks, choices, sharedBudgets);
            const compatibleBalance = moneyDebitsCharacter ? this._getCompatibleTemplateMoneyBalance(status) : Infinity;
            if (!status.valid || Number(status.spent) > compatibleBalance + 1e-6) {
              ui.notifications.warn(t(status.valid ? "PaymentInsufficient" : "InvalidMoneyBudget"));
              return finish({ action: "retry" });
            }
          }
          finish({ action: "next", choice: { ids, levels, quantities, attributeValues } });
        } },
        cancel: { label: t("Cancel"), callback: () => finish({ action: "cancel" }) }
      },
      default: "next",
      close: () => finish({ action: "cancel" }),
      render: html => {
        html.find(".template-preview-entry").on("click", async event => {
          event.preventDefault();
          event.stopPropagation();
          const entryId = event.currentTarget.dataset.entryId;
          const entry = (block?.contents || reviewEntries).find(candidate => candidate.id === entryId);
          if (!entry) return;
          const previewEntry = { ...entry };
          if (block) {
            const levelField = html.find(".template-level-choice").filter((_, el) => el.dataset.entryId === entryId);
            const quantityField = html.find(".template-quantity-choice").filter((_, el) => el.dataset.entryId === entryId);
            if (levelField.length) previewEntry.level = Number(levelField.val());
            if (quantityField.length) previewEntry.quantity = this._templateEntryQuantity(entry, quantityField.val());
            if (levelField.length) previewEntry.cost = this._templateChoiceCost(entry, previewEntry.level, previewEntry.quantity);
            if (entry.kind === "attribute" && block.type === "points") {
              const amounts = this._readTemplateAttributeChoices(html)[entryId];
              previewEntry.attributes = this._templateAttributeAmounts(entry, amounts);
              previewEntry.cost = this._templateChoiceCost(entry, undefined, undefined, amounts);
            }
          }
          const sourceItem = await this._resolveTemplateEntrySourceItem(entry);
          await showTemplateEntryPreview(previewEntry, { actor: this.actor, sourceItem });
        });
        if (!block) {
          const refreshReview = () => {
            const review = this._readTemplateReviewChoices(html);
            const draft = { ...choices, __conflicts: review.conflicts, __destinations: review.destinations };
            const issues = this._validateTemplateChoiceRules(blocks, draft);
            const currentPlan = this._buildTemplatePlanFromChoices(blocks, draft, sharedBudgets);
            const invalidBudget = currentPlan.budgetResults
              .find(result => !this._isTemplateBudgetResultValid(result));
            const currentPointCosts = currentPlan.plan.filter(entry => entry.blockType === "points")
              .map(entry => entry.itemType === "equipment" ? Number(entry.pointsCost || 0) * Math.max(1, Number(entry.quantity) || 1) : Number(entry.cost || 0));
            html.find("[data-review-points-invested]").text(`${currentPointCosts.filter(cost => cost > 0).reduce((total, cost) => total + cost, 0)}/${currentPointCosts.filter(cost => cost < 0).reduce((total, cost) => total + cost, 0)}`);
            html.find("[data-review-points-remaining]").text(currentPlan.budgetResults.filter(result => result.type === "points").reduce((total, result) => total + Number(result.budget || 0) - Number(result.spent || 0), 0));
            const currentMoneyResults = currentPlan.budgetResults.filter(result => result.type === "money");
            html.find("[data-review-money-invested]").text(currentMoneyResults.reduce((total, result) => total + Number(result.spent || 0), 0));
            html.find("[data-review-money-remaining]").text(currentMoneyResults.filter(result => result.accounting !== "deduct").reduce((total, result) => total + Number(result.budget || 0) - Number(result.spent || 0), 0));
            html.find("[data-review-money-debit]").text(currentMoneyResults.filter(result => result.accounting === "deduct").reduce((total, result) => total + Number(result.spent || 0), 0));
            html.find(".template-rule-issues").html(issues.map(issue => `<li>${issueLabel(issue)}: ${esc(issue.entry)} → ${esc(issue.target)}</li>`).join(""));
            const payments = this._buildTemplatePaymentTransactions(currentPlan.budgetResults, review.moneyAllocations);
            html.find('button[data-button="next"]').prop("disabled", !!issues.length || !!invalidBudget || !payments.valid);
            this._refreshTemplatePaymentBalances(html, currentPlan.budgetResults);
          };
          html.find(".template-conflict-action").on("change", event => {
            const action = event.currentTarget.value;
            const targetField = html.find(".template-conflict-control").filter((_, el) => el.querySelector(".template-conflict-target")?.dataset.entryId === event.currentTarget.dataset.entryId);
            const needsTarget = ["update", "replace"].includes(action);
            targetField.toggleClass("is-hidden", !needsTarget).find(".template-conflict-target").prop("disabled", !needsTarget);
            refreshReview();
          });
          const bindPaymentControls = scope => {
            scope.find(".template-money-source, .template-payment-amount input").off("change.gumPayment input.gumPayment").on("change.gumPayment input.gumPayment", refreshReview);
            scope.find(".template-payment-remove").off("click.gumPayment").on("click.gumPayment", event => {
              event.preventDefault();
              $(event.currentTarget).closest(".template-payment-allocation").remove();
              refreshReview();
            });
          };
          html.find(".template-payment-add").on("click", event => {
            event.preventDefault();
            const paymentId = event.currentTarget.dataset.paymentId;
            const result = this._buildTemplatePlanFromChoices(blocks, { ...choices, __conflicts: this._readTemplateReviewChoices(html).conflicts, __destinations: this._readTemplateReviewChoices(html).destinations }, sharedBudgets).budgetResults
              .find(entry => entry.blockId === paymentId);
            if (!result) return;
            const filter = String(result.moneySourceFilter || "").trim();
            const accepted = this.actor.items.filter(item => item.type === "money_source" && this._moneySourceMatchesFilter(item, filter, result.paymentRules));
            const line = html.find(".template-payment-line").filter((_, el) => el.dataset.paymentId === paymentId);
            const allocations = this._readTemplateReviewChoices(html).moneyAllocations[paymentId] || [];
            const allocated = allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.amount) || 0), 0);
            const row = $(paymentAllocationRow(result, accepted, { sourceId: "", amount: Math.max(0, Number(result.spent) - allocated) }, allocations.length));
            line.find(".template-payment-allocations").append(row);
            bindPaymentControls(row);
            refreshReview();
          });
          html.find(".template-payment-auto").on("click", event => {
            event.preventDefault();
            const paymentId = event.currentTarget.dataset.paymentId;
            const review = this._readTemplateReviewChoices(html);
            const result = this._buildTemplatePlanFromChoices(blocks, { ...choices, __conflicts: review.conflicts, __destinations: review.destinations }, sharedBudgets).budgetResults
              .find(entry => entry.blockId === paymentId);
            if (!result) return;
            const reserved = new Map();
            for (const [otherId, allocations] of Object.entries(review.moneyAllocations || {})) {
              if (otherId === paymentId) continue;
              for (const allocation of allocations || []) reserved.set(allocation.sourceId, (reserved.get(allocation.sourceId) || 0) + Math.max(0, Number(allocation.amount) || 0));
            }
            const accepted = this._getCompatibleTemplateMoneySources(result);
            const allocations = this._buildAutomaticTemplatePaymentAllocations(result, accepted, reserved);
            const line = html.find(".template-payment-line").filter((_, el) => el.dataset.paymentId === paymentId);
            line.find(".template-payment-allocations").html(allocations.map((allocation, index) => paymentAllocationRow(result, accepted, allocation, index)).join(""));
            bindPaymentControls(line);
            refreshReview();
          });
          bindPaymentControls(html);
          refreshReview();
          return;
        }
        if (block.type === "guaranteed") return;
        const inputs = html.find('input[name="entry"]');
        const nextButton = html.find('button[data-button="next"]');
        const setNextEnabled = enabled => nextButton.prop("disabled", !enabled).attr("aria-disabled", String(!enabled));
        const refreshAvailability = () => {
          const ids = inputs.filter(":checked").map((_, input) => input.value).get();
          const draftChoices = { ...choices, [block.id]: { ...choice, ids } };
          for (const entry of block.contents) {
            const availability = this._getTemplateEntryAvailability(entry, blocks, draftChoices);
            const row = html.find(".template-wizard-row").filter((_, element) => element.dataset.entryId === entry.id);
            const input = row.find('input[name="entry"]');
            row.toggleClass("template-choice-row--unavailable", !availability.available).toggleClass("is-hidden", availability.hidden);
            if (!availability.available) input.prop("checked", false);
            input.prop("disabled", !availability.available);
            row.find(".template-choice-availability").text(availability.overridden ? t("AvailabilityOverridden") : availability.reasons.join(" · "));
          }
        };

        if (block.type === "selection") {
          const refreshSelection = () => {
            refreshAvailability();
            const quantities = {};
            html.find(".template-quantity-choice").each((_, el) => { const entry = block.contents.find(candidate => candidate.id === el.dataset.entryId); quantities[el.dataset.entryId] = this._templateEntryQuantity(entry, el.value); });
            const selectedCount = this._templateSelectionUnits(block, inputs.filter(":checked").map((_, input) => input.value).get(), quantities);
            const limit = Math.max(1, Number(block.choiceCount) || 1);
            const atLimit = selectedCount >= limit;
            inputs.each((_, input) => {
              if (!input.checked) input.disabled = atLimit || input.closest(".template-wizard-row")?.classList.contains("template-choice-row--unavailable");
            });
            const valid = this._isTemplateSelectionValid(block, selectedCount);
            html.find(".template-wizard-budget-summary")
              .toggleClass("template-wizard-budget-summary--invalid", !valid);
            html.find("[data-template-selection-budget]").text(limit);
            html.find("[data-template-selection-spent]").text(selectedCount);
            html.find("[data-template-selection-remaining]").text(limit - selectedCount);
            html.find(".template-wizard-budget-notice").text(valid ? "" : t("InvalidChoiceCount"));
            setNextEnabled(valid);
          };
          inputs.add(html.find(".template-quantity-choice")).on("change input", refreshSelection);
          html.find(".template-quantity-step").on("click", event => {
            event.preventDefault();
            const input = $(event.currentTarget).siblings(".template-quantity-choice");
            const entry = block.contents.find(candidate => candidate.id === input.get(0)?.dataset.entryId);
            input.val(this._templateEntryQuantity(entry, (Number(input.val()) || 1) + (Number(event.currentTarget.dataset.step) || 0))).trigger("change");
          });
          refreshSelection();
          return;
        }

        const refresh = () => {
          refreshAvailability();
          const ids = html.find('input[name="entry"]:checked').map((_, el) => el.value).get();
          const levels = {};
          html.find(".template-level-choice").each((_, el) => { levels[el.dataset.entryId] = Number(el.value); });
          const quantities = {};
          html.find(".template-quantity-choice").each((_, el) => { const entry = block.contents.find(candidate => candidate.id === el.dataset.entryId); quantities[el.dataset.entryId] = this._templateEntryQuantity(entry, el.value); });
          const attributeValues = this._readTemplateAttributeChoices(html);
          const isMoneyBlock = block.type === "money";
          const moneyMode = isMoneyBlock ? this._resolveTemplateMoneyMode(block) : "";
          const moneyDebitsCharacter = isMoneyBlock && (moneyMode === "deduct" || (moneyMode === "shared" && sharedDefinition?.accounting === "deduct"));
          const status = this._templateBudgetStatus(block, { ids, levels, quantities, attributeValues }, blocks, choices, sharedBudgets);
          const { spent, budget, unlimited } = status;
          const compatibleBalance = moneyDebitsCharacter ? this._getCompatibleTemplateMoneyBalance(status) : 0;
          const valid = status.valid && (!moneyDebitsCharacter || spent <= compatibleBalance + 1e-6);
          if (["points", "money"].includes(block.type)) {
            html.find(".template-wizard-budget-summary")
              .toggleClass("template-wizard-budget-summary--invalid", !valid);
            if (block.type === "points") {
              html.find("[data-template-budget]").text(budget);
              html.find("[data-template-spent]").text(spent);
              html.find("[data-template-remaining]").text(budget - spent);
            } else {
              html.find("[data-template-money-budget]").text(unlimited ? t("Unlimited") : budget);
              html.find("[data-template-money-spent]").text(spent);
              html.find("[data-template-money-balance]").text(budget - spent);
              html.find("[data-template-money-compatible]").text(compatibleBalance);
              html.find("[data-template-money-after]").text(compatibleBalance - spent);
            }
            html.find(".template-wizard-budget-notice").text(valid ? "" : t(block.type === "money" && status.valid ? "PaymentInsufficient" : block.type === "money" ? "InvalidMoneyBudget" : "InvalidBudget"));
          } else {
            html.find(".template-wizard-balance")
              .toggleClass("template-wizard-balance--invalid", !valid)
              .text(`${t("Leftover")}: ${budget - spent}${valid ? "" : ` · ${t("InvalidBudget")}`}`);
          }
          for (const entry of block.contents) {
            const quantity = this._templateEntryQuantity(entry, quantities[entry.id]);
            const unitPrice = Math.max(0, Number(entry.moneyCost ?? entry.cost) || 0);
            const display = isMoneyBlock ? `${unitPrice}${quantity !== 1 ? ` × ${quantity} = ${this._templateMoneyCost(entry, quantity)}` : ""} ${t("Money")}`
              : `${this._templateChoiceCost(entry, levels[entry.id], quantities[entry.id], attributeValues[entry.id])} ${t("Points")}`;
            html.find(`[data-cost-for="${entry.id}"]`).text(display);
          }
          setNextEnabled(valid);
        };
        html.find('input[name="entry"], .template-level-choice, .template-quantity-choice').on("change input", refresh);
        html.find(".template-attribute-choice").on("change input", event => {
          const field = event.currentTarget;
          const entry = block.contents.find(candidate => candidate.id === field.dataset.entryId);
          if (event.type === "change" && field.value === "") field.value = 0;
          if (entry && field.value !== "" && Number.isFinite(Number(field.value))) {
            const accepted = this._templateAttributeAmounts(entry, { [field.dataset.attribute]: Number(field.value) })[field.dataset.attribute];
            if (accepted !== undefined && accepted !== Number(field.value)) field.value = accepted;
          }
          refresh();
        });
        html.find(".template-attribute-step").on("click", event => {
          event.preventDefault();
          const input = $(event.currentTarget).siblings(".template-attribute-choice");
          const step = Number(input.attr("step")) || 1;
          input.val((Number(input.val()) || 0) + (Number(event.currentTarget.dataset.step) || 0) * step).trigger("change");
        });
        html.find(".template-quantity-step").on("click", event => {
          event.preventDefault();
          const input = $(event.currentTarget).siblings(".template-quantity-choice");
          const entry = block.contents.find(candidate => candidate.id === input.get(0)?.dataset.entryId);
          input.val(this._templateEntryQuantity(entry, (Number(input.val()) || 1) + (Number(event.currentTarget.dataset.step) || 0))).trigger("change");
        });
        refresh();
      }
    }, {
      classes: ["dialog", "gum", "template-apply-dialog", "gum-sheet-edit-dialog"],
      width: block ? 520 : 760,
      height: block
        ? Math.max(390, Math.min(720, 270 + (block.contents?.length || 0) * 70))
        : Math.max(500, Math.min(840, 305 + reviewEntries.length * 48 + reviewConflictCount * 56 + (reviewTotalsMarkup ? 82 : 0) + (needsPayment ? 64 : 0))),
      resizable: true
    }).render(true);
  });
}

_findAppliedModelRecord(templateItem) {
  const records = Array.isArray(this.actor.system.applied_models) ? this.actor.system.applied_models : [];
  return records.find(record => {
    if (record.removedAt) return false;
    if (templateItem.uuid && record.templateUuid) return record.templateUuid === templateItem.uuid;
    if (templateItem.id && record.templateId) return record.templateId === templateItem.id;
    return (record.templateName || "").toLowerCase() === (templateItem.name || "").toLowerCase();
  });
}

_readTemplateReviewChoices(html) {
  const destinations = {};
  html.find(".template-container-destination").each((_, el) => { destinations[el.dataset.entryId] = el.value; });
  const conflicts = {};
  html.find(".template-conflict-action").each((_, el) => {
    const target = html.find(".template-conflict-target").filter((_, targetEl) => targetEl.dataset.entryId === el.dataset.entryId).val();
    conflicts[el.dataset.entryId] = { action: el.value, targetId: target || "" };
  });
  const moneyAllocations = {};
  html.find(".template-payment-allocation").each((_, el) => {
    const paymentId = el.dataset.paymentId;
    const sourceId = el.querySelector(".template-money-source")?.value || "";
    const amount = Math.max(0, Number(el.querySelector(".template-payment-amount input")?.value) || 0);
    (moneyAllocations[paymentId] ||= []).push({ sourceId, amount });
  });
  return { destinations, conflicts, moneyAllocations };
}

_normalizeMoneySourceTerms(value = "") {
  return String(value || "").split(",").map(term => term.trim().toLocaleLowerCase()).filter(Boolean);
}

_normalizeTemplatePaymentRules(rules = {}) {
  const list = value => (Array.isArray(value) ? value : String(value || "").split(","))
    .map(term => String(term).trim().toLocaleLowerCase()).filter(Boolean);
  return {
    categories: [...new Set(list(rules.categories))],
    modes: [...new Set(list(rules.modes).filter(mode => ["physical", "abstract"].includes(mode)))],
    locations: [...new Set(list(rules.locations).filter(location => ["equipped", "carried", "stored"].includes(location)))]
  };
}

_moneySourceMatchesFilter(item, rawFilter = "", paymentRules = {}) {
  const terms = this._normalizeMoneySourceTerms(rawFilter);
  const name = String(item?.name || "").trim().toLocaleLowerCase();
  const category = String(item?.system?.category || "").trim().toLocaleLowerCase();
  if (terms.length && !terms.includes(name) && !terms.includes(category)) return false;
  const rules = this._normalizeTemplatePaymentRules(paymentRules);
  const mode = item?.system?.mode === "abstract" ? "abstract" : "physical";
  const location = String(item?.system?.location || "").trim().toLocaleLowerCase();
  if (rules.categories.length && !rules.categories.includes(category)) return false;
  if (rules.modes.length && !rules.modes.includes(mode)) return false;
  if (rules.locations.length && !rules.locations.includes(location)) return false;
  return true;
}

_getCompatibleTemplateMoneySources(result = {}) {
  return this.actor.items.filter(item => item.type === "money_source"
    && this._moneySourceMatchesFilter(item, result.moneySourceFilter, result.paymentRules));
}

_getCompatibleTemplateMoneyBalance(result = {}) {
  return this._getCompatibleTemplateMoneySources(result).reduce((sum, item) => sum + this._getMoneySourceBalance(item), 0);
}

_isExactPhysicalMoneyAmount(item, amount) {
  if (item?.system?.mode === "abstract") return true;
  const unitValue = Number(item?.system?.unit_value) || 0;
  if (!(unitValue > 0)) return false;
  const units = Math.max(0, Number(amount) || 0) / unitValue;
  return Math.abs(units - Math.round(units)) <= 1e-6;
}

_buildAutomaticTemplatePaymentAllocations(result, sources = [], reserved = new Map()) {
  const allocations = [];
  let remaining = Math.max(0, Number(result?.spent) || 0);
  for (const source of sources) {
    if (remaining <= 1e-6) break;
    const available = Math.max(0, this._getMoneySourceBalance(source) - (reserved.get(source.id) || 0));
    if (!(available > 0)) continue;
    let amount = Math.min(remaining, available);
    if (source.system?.mode !== "abstract") {
      const unitValue = Number(source.system?.unit_value) || 0;
      if (!(unitValue > 0)) continue;
      amount = Math.floor((amount + 1e-9) / unitValue) * unitValue;
    }
    if (!(amount > 1e-9)) continue;
    allocations.push({ sourceId: source.id, amount });
    reserved.set(source.id, (reserved.get(source.id) || 0) + amount);
    remaining -= amount;
  }
  return allocations;
}

_buildTemplatePaymentTransactions(budgetResults = [], moneyAllocations = {}) {
  const transactionMap = new Map();
  const totals = new Map();
  for (const result of budgetResults) {
    if (result.type !== "money" || result.accounting !== "deduct" || !(Number(result.spent) > 0)) continue;
    const saved = moneyAllocations?.[result.blockId];
    const allocations = Array.isArray(saved) ? saved : typeof saved === "string" ? [{ sourceId: saved, amount: result.spent }] : [];
    const positive = allocations.map(allocation => ({
      sourceId: String(allocation?.sourceId || ""), amount: Math.max(0, Number(allocation?.amount) || 0)
    })).filter(allocation => allocation.amount > 1e-9);
    const allocated = positive.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (Math.abs(allocated - Number(result.spent)) > 1e-6) {
      return { valid: false, reason: "allocation", transactions: [], totals };
    }
    for (const allocation of positive) {
      const source = this.actor.items.get(allocation.sourceId);
      if (!source || source.type !== "money_source" || !this._moneySourceMatchesFilter(source, result.moneySourceFilter, result.paymentRules)) {
        return { valid: false, reason: "source", transactions: [], totals };
      }
      if (!this._isExactPhysicalMoneyAmount(source, allocation.amount)) {
        return { valid: false, reason: "denomination", transactions: [], totals };
      }
      totals.set(source.id, (totals.get(source.id) || 0) + allocation.amount);
      const key = `${result.blockId}:${source.id}`;
      const prior = transactionMap.get(key);
      transactionMap.set(key, prior ? { ...prior, amount: prior.amount + allocation.amount }
        : { blockId: result.blockId, title: result.title || "", amount: allocation.amount, sourceId: source.id, sourceName: source.name });
    }
  }
  for (const [sourceId, amount] of totals) {
    const source = this.actor.items.get(sourceId);
    if (!source || this._getMoneySourceBalance(source) < amount || !this._getMoneySourceDebit(source, amount)) {
      return { valid: false, reason: "insufficient", transactions: [], totals };
    }
  }
  return { valid: true, transactions: [...transactionMap.values()], totals };
}

_refreshTemplatePaymentBalances(html, budgetResults = []) {
  const selections = this._readTemplateReviewChoices(html).moneyAllocations;
  const running = new Map();
  html.find(".template-payment-line").each((_, line) => {
    const result = budgetResults.find(entry => entry.blockId === line.dataset.paymentId);
    if (!result) return;
    line.hidden = !(Number(result.spent) > 0);
    if (line.hidden) return;
    const allocations = selections[line.dataset.paymentId] || [];
    const allocated = allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.amount) || 0), 0);
    const complete = Math.abs(allocated - Number(result.spent)) <= 1e-6;
    let lineInvalid = !complete;
    let errorKey = complete ? "" : "PaymentAllocationIncomplete";
    line.querySelector("[data-payment-required]").textContent = Number(result.spent) || 0;
    line.querySelector("[data-payment-allocated]").textContent = allocated;
    $(line).find(".template-payment-allocation").each((index, row) => {
      const allocation = allocations[index] || {};
      const source = this.actor.items.get(allocation.sourceId);
      const balance = row.querySelector(".template-payment-balance");
      const amountInput = row.querySelector(".template-payment-amount input");
      if (amountInput) amountInput.step = source?.system?.mode === "physical" ? String(Math.max(0, Number(source.system.unit_value) || 0) || "any") : "any";
      if (!source || !(Number(allocation.amount) > 0)) {
        balance.textContent = "";
        const invalid = Number(allocation.amount) > 0 && !source;
        lineInvalid ||= invalid;
        if (invalid) errorKey = "NoPaymentSource";
        row.classList.toggle("template-payment-allocation--invalid", invalid);
        return;
      }
      const before = this._getMoneySourceBalance(source);
      const spentBefore = running.get(source.id) || 0;
      const amount = Math.max(0, Number(allocation.amount) || 0);
      const after = before - spentBefore - amount;
      running.set(source.id, spentBefore + amount);
      balance.textContent = `${before - spentBefore} → ${after}`;
      const exact = this._isExactPhysicalMoneyAmount(source, amount);
      const invalid = after < -1e-6 || !exact;
      lineInvalid ||= invalid;
      if (!exact) errorKey = "PaymentExactRequired";
      else if (after < -1e-6) errorKey = "PaymentInsufficient";
      row.classList.toggle("template-payment-allocation--invalid", invalid);
    });
    line.classList.toggle("template-payment-line--invalid", lineInvalid);
    const error = line.querySelector(".template-payment-error");
    if (error && errorKey) error.textContent = game.i18n.localize(`GUM.Template.${errorKey}`);
  });
}

_getMoneySourceBalance(item) {
  const system = item?.system || {};
  if (system.mode === "abstract") return Math.max(0, Number(system.balance) || 0);
  return Math.max(0, Number(system.quantity) || 0) * Math.max(0, Number(system.unit_value) || 0);
}

_getMoneySourceDebit(item, amount) {
  const system = item?.system || {};
  const spent = Math.max(0, Number(amount) || 0);
  if (system.mode === "abstract") return { "system.balance": Math.max(0, (Number(system.balance) || 0) - spent) };
  const unitValue = Number(system.unit_value) || 0;
  if (!unitValue || !this._isExactPhysicalMoneyAmount(item, spent)) return null;
  return { "system.quantity": Math.max(0, Math.round((Number(system.quantity) || 0) - spent / unitValue)) };
}

_readTemplateAttributeChoices(html) {
  const values = {};
  html.find(".template-attribute-choice").each((_, el) => {
    (values[el.dataset.entryId] ||= {})[el.dataset.attribute] = Number(el.value);
  });
  return values;
}

async _applyTemplatePlan(templateItem, plan, { pointsLeftoverTotal = 0, budgetResults = [], referencedTemplates = [], moneySourceId = "", moneySourceIds = {}, moneyAllocations = {} } = {}) {
  const conflictError = this._validateTemplateConflictPlan(plan);
  if (conflictError) {
    ui.notifications.error(game.i18n.localize(`GUM.Template.${conflictError}`));
    return false;
  }
  const applicationId = foundry.utils.randomID();
  const moneySpent = budgetResults.filter(result => result.type === "money" && result.accounting === "deduct")
    .reduce((sum, result) => sum + (Number(result.spent) || 0), 0);
  const paymentSelections = Object.keys(moneyAllocations || {}).length ? moneyAllocations : moneySourceIds;
  const paymentPlan = this._buildTemplatePaymentTransactions(budgetResults, paymentSelections);
  const hasPerBlockPayment = paymentPlan.transactions.length > 0;
  const moneySource = moneySpent && !hasPerBlockPayment ? this.actor.items.get(moneySourceId) : null;
  const legacyActorMoney = moneySpent && !hasPerBlockPayment && !moneySourceId;
  if (moneySpent && !hasPerBlockPayment && Object.keys(paymentSelections || {}).length && !paymentPlan.valid) {
    const message = paymentPlan.reason === "source" ? "GUM.Template.NoPaymentSource"
      : paymentPlan.reason === "allocation" ? "GUM.Template.PaymentAllocationIncomplete"
        : paymentPlan.reason === "denomination" ? "GUM.Template.PaymentExactRequired" : "GUM.Template.PaymentInsufficient";
    ui.notifications.error(game.i18n.localize(`GUM.Template.${message}`));
    return false;
  }
  if (moneySpent && !hasPerBlockPayment && !legacyActorMoney && (!moneySource || moneySource.type !== "money_source")) {
    ui.notifications.error(game.i18n.localize("GUM.Template.NoPaymentSource"));
    return false;
  }
  const moneyBefore = moneySource ? this._getMoneySourceBalance(moneySource) : (Number(this.actor.system.money?.value) || 0);
  const moneySourceBefore = moneySource?.toObject?.() || null;
  const moneyDebit = moneySource ? this._getMoneySourceDebit(moneySource, moneySpent) : {};
  if (moneySpent && moneySource && (!moneyDebit || moneyBefore < moneySpent)) {
    ui.notifications.error(game.i18n.localize("GUM.Template.PaymentInsufficient"));
    return false;
  }
  const itemCreates = [];
  const updates = [];
  const replacements = [];
  const attributeDeltas = {};
  const attributeChanges = [];
  let shouldRecalculateSecondary = false;
  let hasPrimaryAttributeChange = false;

  for (const entry of plan) {
    if (entry.kind === "attribute") {
      const result = this._accumulateAttributeChanges(entry, attributeDeltas, attributeChanges);
      if (entry.linkSecondary) shouldRecalculateSecondary = true;
      if (result.primaryChanged) hasPrimaryAttributeChange = true;
      continue;
    }

    const sourceItem = await this._resolveTemplateEntrySourceItem(entry);
    let createdData = null;

    if (sourceItem) {
      createdData = this._buildActorItemFromTemplateEntry(sourceItem, entry, templateItem);
    } else if (entry.inlineItem) {
      createdData = this._buildActorItemFromInlineTemplateEntry(entry, templateItem);
    }

    if (!createdData) {
      ui.notifications.error(game.i18n.format("GUM.Template.MissingSource", { name: entry.name || entry.label || "?" }));
      return false;
    }
    createdData.flags = createdData.flags || {};
    createdData.flags.gum = createdData.flags.gum || {};
    createdData.flags.gum.templateApplicationId = applicationId;
    if (entry.destinationGroup && ["advantage", "disadvantage", "skill", "spell", "power"].includes(createdData.type)) {
      createdData.system.group = entry.destinationGroup;
    }
    createdData.flags.gum.templateDestination = { group: entry.destinationGroup || "", containerName: entry.containerName || "", containerId: entry.containerId || "" };
    const action = entry.conflictAction || "duplicate";
    if (action === "update") {
      const target = this.actor.items.get(entry.conflictTargetId);
      updates.push({ itemId: target.id, before: target.toObject(), entry, data: createdData });
    } else {
      itemCreates.push(createdData);
      if (action === "replace") replacements.push({ itemId: entry.conflictTargetId, entryId: entry.id, before: this.actor.items.get(entry.conflictTargetId).toObject() });
    }
  }
  const containerNames = [...new Set(plan.filter(entry => entry.itemType === "equipment" && entry.containerName).map(entry => entry.containerName))];
  const containerCreates = containerNames.map(name => ({
    name, type: "equipment", img: "icons/containers/bags/sack-cloth-tan.webp",
    system: { quantity: 1, is_container: true, location: "carried", container: { max_weight: 0 }, parent_container_id: "" },
    flags: { gum: { templateApplicationId: applicationId, templateContainer: true } }
  }));

  const previous = {
    attributes: foundry.utils.deepClone(this.actor.system.attributes),
    unspent: Number(this.actor.system.points?.unspent) || 0,
    money: Number(this.actor.system.money?.value) || 0,
    appliedModels: foundry.utils.deepClone(this.actor.system.applied_models || []),
    skillOrganization: foundry.utils.deepClone(this.actor.system.skill_organization || {}),
    characteristicOrganization: foundry.utils.deepClone(this.actor.system.characteristic_organization || {})
  };
  const paymentSourceBefore = new Map();
  for (const sourceId of paymentPlan.totals.keys()) {
    const source = this.actor.items.get(sourceId);
    if (source) paymentSourceBefore.set(sourceId, source.toObject());
  }
  let createdItems = [];
  try {
    if (containerCreates.length) createdItems.push(...await this.actor.createEmbeddedDocuments("Item", containerCreates));
    if (itemCreates.length) createdItems.push(...await this.actor.createEmbeddedDocuments("Item", itemCreates));
    if (updates.length) {
      await this.actor.updateEmbeddedDocuments("Item", updates.map(change => ({
        _id: change.itemId, name: change.data.name, img: change.data.img,
        system: change.data.system, "flags.gum.templateApplied": change.data.flags?.gum?.templateApplied
      })));
    }
    if (replacements.length) await this.actor.deleteEmbeddedDocuments("Item", replacements.map(change => change.itemId));
    const createdContainers = createdItems.filter(item => item.getFlag("gum", "templateContainer"));
    const containerByName = new Map(createdContainers.map(item => [item.name, item.id]));
    const updatedItems = updates.map(change => this.actor.items.get(change.itemId)).filter(Boolean);
    const destinations = new Map(updates.map(change => [change.itemId, change.entry]));
    const containerLinks = [...createdItems, ...updatedItems].filter(item => !item.getFlag("gum", "templateContainer") && item.type === "equipment")
      .map(item => {
        const templateDestination = item.getFlag("gum", "templateDestination");
        const updateEntry = destinations.get(item.id);
        const destination = templateDestination || { containerName: updateEntry?.containerName || "", containerId: updateEntry?.containerId || "" };
        const parentId = destination.containerId || containerByName.get(destination.containerName);
        const container = parentId ? this.actor.items.get(parentId) : null;
        if (parentId && item.system?.is_container) throw new Error("Template cannot nest equipment containers");
        if (parentId && !container) throw new Error("Template equipment container not found");
        return container ? resolveEquipmentDrop(item, `container:${container.id}`, { container }) : null;
      }).filter(Boolean);
    if (containerLinks.length) await this.actor.updateEmbeddedDocuments("Item", containerLinks);

  const updateData = this._buildTemplateAttributeUpdateData(attributeDeltas, {
    recalculateSecondaryBases: shouldRecalculateSecondary && hasPrimaryAttributeChange
  });
  if (Number(pointsLeftoverTotal) !== 0) {
    updateData["system.points.unspent"] = (Number(this.actor.system.points?.unspent) || 0) + Number(pointsLeftoverTotal);
  }
  if (hasPerBlockPayment) {
    for (const [sourceId, amount] of paymentPlan.totals) {
      const source = this.actor.items.get(sourceId);
      await source.update(this._getMoneySourceDebit(source, amount));
    }
  }
  if (moneySpent && moneySource) await moneySource.update(moneyDebit);
  if (moneySpent && legacyActorMoney) updateData["system.money.value"] = moneyBefore - moneySpent;
  const attributeSnapshots = Object.fromEntries(Object.entries(updateData)
    .filter(([path, value]) => path.startsWith("system.attributes.") && !path.includes(".-=") && (typeof value === "number" || typeof value === "string"))
    .map(([path, after]) => [path, { before: foundry.utils.getProperty(this.actor, path), after }]));

  if (Object.keys(updateData).length) {
    await this.actor.update(updateData);
  }

  const createdGroups = { skills: [], characteristics: [] };
  for (const [kind, types, field] of [
    ["skills", ["skill"], "skill_organization"],
    ["characteristics", ["advantage", "disadvantage"], "characteristic_organization"]
  ]) {
    const items = this.actor.items.filter(item => types.includes(item.type));
    const grouped = [...createdItems, ...updatedItems].filter(item => types.includes(item.type) && (item.getFlag("gum", "templateDestination")?.group || destinations.get(item.id)?.destinationGroup));
    if (!grouped.length) continue;
    let organization = normalizeItemOrganization(this.actor.system[field], items.map(item => item.id));
    for (const item of grouped) {
      const name = item.getFlag("gum", "templateDestination")?.group || destinations.get(item.id)?.destinationGroup;
      let groupId = organization.groupOrder.find(id => organization.groups[id]?.name?.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (!groupId) {
        groupId = foundry.utils.randomID();
        organization = addItemOrganizationGroup(organization, { id: groupId, name }, items.map(entry => entry.id));
        createdGroups[kind].push(groupId);
      }
      organization = moveOrganizedItem(organization, { itemId: item.id, targetGroupId: groupId }, items.map(entry => entry.id));
    }
    if (kind === "skills") await this._saveSkillOrganization(organization);
    else await this._saveCharacteristicOrganization(organization);
  }

  const records = Array.isArray(this.actor.system.applied_models) ? foundry.utils.deepClone(this.actor.system.applied_models) : [];
  const secondaryRecalcApplied = shouldRecalculateSecondary && hasPrimaryAttributeChange;
  records.push({
    applicationId,
    templateId: templateItem.id,
    templateUuid: templateItem.uuid,
    templateName: templateItem.name,
    appliedAt: new Date().toISOString(),
    appliedBy: game.user?.id,
    createdItemIds: createdItems.map(item => item.id),
    createdContainerIds: createdContainers.map(item => item.id),
    createdGroups,
    entries: createdItems.filter(item => !item.getFlag("gum", "templateContainer")).map(item => ({
      itemId: item.id, entryId: item.getFlag("gum", "templateApplied")?.templateEntryId,
      name: item.name, type: item.type, originChain: item.getFlag("gum", "templateApplied")?.originChain || []
    })),
    updatedItems: updates.map(change => ({ itemId: change.itemId, name: change.before.name, type: change.before.type, before: change.before })),
    replacedItems: replacements.map(change => ({
      replacedItemId: createdItems.find(item => item.getFlag("gum", "templateApplied")?.templateEntryId === change.entryId)?.id || "",
      name: change.before.name, type: change.before.type, before: change.before
    })),
    attributeChanges,
    attributeSnapshots,
    secondaryRecalcApplied,
    pointsLeftover: Number(pointsLeftoverTotal) || 0,
    moneySpent,
    moneySource: moneySpent && moneySource ? { itemId: moneySource.id, name: moneySource.name, before: moneySourceBefore, beforeBalance: moneyBefore, afterBalance: moneyBefore - moneySpent } : null,
    moneyTransactions: hasPerBlockPayment ? (() => {
      const running = new Map();
      return paymentPlan.transactions.map(transaction => {
        const sourceBefore = paymentSourceBefore.get(transaction.sourceId);
        const initial = sourceBefore ? this._getMoneySourceBalance({ system: sourceBefore.system }) : 0;
        const beforeBalance = initial - (running.get(transaction.sourceId) || 0);
        running.set(transaction.sourceId, (running.get(transaction.sourceId) || 0) + Number(transaction.amount || 0));
        return { ...transaction, beforeBalance, afterBalance: beforeBalance - Number(transaction.amount || 0) };
      });
    })() : [],
    moneySnapshot: moneySpent && legacyActorMoney ? { before: moneyBefore, after: moneyBefore - moneySpent } : null,
    budgetResults: foundry.utils.deepClone(budgetResults),
    referencedTemplates: foundry.utils.deepClone(referencedTemplates),
    totalEntries: plan.length
  });

  await this.actor.update({ "system.applied_models": records });
  return true;
  } catch (error) {
    console.error("GUM template application failed", error);
    if (createdItems.length) await this.actor.deleteEmbeddedDocuments("Item", createdItems.map(item => item.id)).catch(console.error);
    if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates.filter(change => this.actor.items.has(change.itemId)).map(change => change.before)).catch(console.error);
    if (replacements.length) await this.actor.createEmbeddedDocuments("Item", replacements.map(change => change.before), { keepId: true }).catch(console.error);
    await this.actor.update({
      "system.attributes": previous.attributes,
      "system.points.unspent": previous.unspent,
      "system.money.value": previous.money,
      "system.applied_models": previous.appliedModels,
      "system.skill_organization": previous.skillOrganization,
      "system.characteristic_organization": previous.characteristicOrganization
    }).catch(console.error);
    if (moneySpent && moneySourceBefore && this.actor.items.has(moneySource.id)) await moneySource.update({ system: moneySourceBefore.system }).catch(console.error);
    for (const [sourceId, before] of paymentSourceBefore) {
      const source = this.actor.items.get(sourceId);
      if (source) await source.update({ system: before.system }).catch(console.error);
    }
    ui.notifications.error(game.i18n.localize("GUM.Template.ApplyFailed"));
    return false;
  }
}

_accumulateAttributeChanges(entry, attributeUpdates, attributeChanges) {
  const attributes = entry.attributes || {};
  const map = {
    st: "st",
    dx: "dx",
    iq: "iq",
    ht: "ht",
    will: "vont",
    per: "per",
    hp: "hp.max",
    fp: "fp.max",
    hp_max: "hp.max",
    fp_max: "fp.max",
    lifting_st: "lifting_st",
    vision: "vision",
    hearing: "hearing",
    tastesmell: "tastesmell",
    touch: "touch",
    mt: "mt",
    basic_speed: "basic_speed",
    move: "basic_move",
    basic_move: "basic_move",
    enhanced_move: "enhanced_move",
    dodge: "dodge"
  };

  for (const [sourceKey, amountRaw] of Object.entries(attributes)) {
    const amount = Number(amountRaw) || 0;
    if (!amount) continue;

    const actorKey = map[sourceKey];
    if (!actorKey) continue;
    attributeUpdates[actorKey] = (Number(attributeUpdates[actorKey]) || 0) + amount;

    attributeChanges.push({ key: actorKey, amount });
  }

  const primaryKeys = ["st", "dx", "ht", "per"];
  return {
    primaryChanged: primaryKeys.some(key => (Number(attributeUpdates[key]) || 0) !== 0)
  };
}

_buildTemplateAttributeUpdateData(attributeDeltas, { recalculateSecondaryBases = false } = {}) {
  const updateData = {};
  const getActorValue = (key) => Number(foundry.utils.getProperty(this.actor.system, `attributes.${key}.value`)) || 0;

  for (const [actorKey, deltaRaw] of Object.entries(attributeDeltas)) {
    const delta = Number(deltaRaw) || 0;
    if (!delta) continue;
    const path = actorKey.includes(".") ? `system.attributes.${actorKey}` : `system.attributes.${actorKey}.value`;
    updateData[path] = (Number(foundry.utils.getProperty(this.actor.system, path.slice(7))) || 0) + delta;
  }

  if (!recalculateSecondaryBases) return updateData;

  const st = getActorValue("st") + (Number(attributeDeltas.st) || 0);
  const dx = getActorValue("dx") + (Number(attributeDeltas.dx) || 0);
  const ht = getActorValue("ht") + (Number(attributeDeltas.ht) || 0);
  const per = getActorValue("per") + (Number(attributeDeltas.per) || 0);
  const basicSpeedBase = Math.round((((dx + ht) / 4) + Number.EPSILON) * 100) / 100;
  const basicMoveBase = Math.floor(basicSpeedBase);
  const damage = this._getBasicDamageFromST(st);

  updateData["system.attributes.hp.max"] = st + (Number(attributeDeltas["hp.max"]) || 0);
  updateData["system.attributes.fp.max"] = ht + (Number(attributeDeltas["fp.max"]) || 0);
  updateData["system.attributes.lifting_st.value"] = st + (Number(attributeDeltas.lifting_st) || 0);
  updateData["system.attributes.vision.value"] = per + (Number(attributeDeltas.vision) || 0);
  updateData["system.attributes.hearing.value"] = per + (Number(attributeDeltas.hearing) || 0);
  updateData["system.attributes.tastesmell.value"] = per + (Number(attributeDeltas.tastesmell) || 0);
  updateData["system.attributes.touch.value"] = per + (Number(attributeDeltas.touch) || 0);
  updateData["system.attributes.basic_speed.value"] = basicSpeedBase + (Number(attributeDeltas.basic_speed) || 0);
  updateData["system.attributes.basic_move.value"] = basicMoveBase + (Number(attributeDeltas.basic_move) || 0);
  updateData["system.attributes.dodge.value"] = Math.floor(updateData["system.attributes.basic_speed.value"]) + 3 + (Number(attributeDeltas.dodge) || 0);
  updateData["system.attributes.hp.max"] += (Number(attributeDeltas.hp) || 0);
  updateData["system.attributes.fp.max"] += (Number(attributeDeltas.fp) || 0);
  updateData["system.attributes.thrust_damage.value"] = damage.thrust;
  updateData["system.attributes.swing_damage.value"] = damage.swing;

  return updateData;
}

async _resolveTemplateEntrySourceItem(entry) {
  if (entry.uuid) {
    const byUuid = await fromUuid(entry.uuid).catch(() => null);
    if (byUuid) return byUuid;
  }

  if (entry.sourceId) {
    const worldItem = game.items.get(entry.sourceId);
    if (worldItem) return worldItem;

    for (const pack of game.packs.filter(p => p.documentName === "Item")) {
      const doc = await pack.getDocument(entry.sourceId).catch(() => null);
      if (doc) return doc;
    }
  }

  return null;
}

_buildActorItemFromTemplateEntry(sourceItem, entry, templateItem) {
  const data = sourceItem.toObject();
  data.name = entry.name || data.name;
  if (["advantage", "disadvantage"].includes(data.type) && entry.trait_cost) {
    Object.assign(data.system, foundry.utils.deepClone(entry.trait_cost));
  }

  const pointsField = sourceItem.type === "power" ? "points_skill" : "points";

  if (["skill", "spell", "power"].includes(sourceItem.type)) {
    data.system[pointsField] = Number(entry.cost ?? data.system?.[pointsField] ?? 0);
  }

  if (["skill", "spell", "power"].includes(sourceItem.type)) {
    const resolvedLevel = this._resolveTemplateEntryRelativeLevel(entry, data.system, sourceItem.type);
    if (resolvedLevel !== null) data.system.skill_level = resolvedLevel;
  }

  if (["advantage", "disadvantage"].includes(sourceItem.type) && entry.level !== "" && entry.level !== null && entry.level !== undefined) {
    data.system.level = this._templateEntryLevel(entry, entry.level);
  }

  if (sourceItem.type === "equipment") {
    data.system.quantity = Number(entry.quantity ?? data.system?.quantity ?? 1) || 1;
    data.system.cost = Number(entry.cost ?? data.system?.cost ?? 0) || 0;
    data.system.level = String(entry.level ?? data.system?.level ?? "").trim();
    data.system.points = Number(entry.pointsCost ?? data.system?.points ?? 0) || 0;
  }

  data.flags = data.flags || {};
  data.flags.gum = data.flags.gum || {};
  data.flags.gum.templateApplied = {
    templateId: templateItem.id,
    templateUuid: templateItem.uuid,
    templateName: templateItem.name,
    templateEntryId: entry.id,
    originChain: foundry.utils.deepClone(entry.originChain || [])
  };

  return data;
}


/**
 * Abre a ficha do item "grupo de ataque" (a engrenagem no cabeçalho do grupo).
 * Esse botão não fica dentro de um `.item`, então o handler genérico não acha o itemId.
 */
async _onEditAttackGroupItem(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const itemId = ev.currentTarget?.dataset?.itemId;
  if (!itemId) return;

  const item = this.actor.items.get(itemId);
  if (!item) return ui.notifications.warn("Item do grupo de ataque não encontrado.");

  item.sheet.render(true);
}
async _onRemoveCharacterModel(ev) {
  ev.preventDefault();
  const applicationId = ev.currentTarget?.dataset?.applicationId;
  if (!applicationId) return;

  const records = Array.isArray(this.actor.system.applied_models) ? foundry.utils.deepClone(this.actor.system.applied_models) : [];
  const record = records.find(entry => entry.applicationId === applicationId && !entry.removedAt);
  if (!record) return;

  const createdItemIds = Array.isArray(record.createdItemIds) ? record.createdItemIds.filter(Boolean) : [];
  const updatedItems = Array.isArray(record.updatedItems) ? record.updatedItems : [];
  const replacedItems = Array.isArray(record.replacedItems) ? record.replacedItems : [];
  const attributeChanges = Array.isArray(record.attributeChanges) ? record.attributeChanges : [];
  const t = key => game.i18n.localize(`GUM.Template.${key}`);
  const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
  const itemRows = createdItemIds.map(itemId => {
    const item = this.actor.items.get(itemId);
    if (!item) return "";
    return `<label class="template-choice-row"><input type="checkbox" name="remove-item" value="${esc(itemId)}" checked> ${esc(templateEntryDisplayName(item, item))}${item.system?.is_container ? ` (${t("Container")})` : ""}</label>`;
  }).join("");
  const attributeRows = attributeChanges.map((change, i) => {
    const path = `system.attributes.${change.key}.value`;
    const snapshot = record.attributeSnapshots?.[path];
    const current = foundry.utils.getProperty(this.actor, path);
    const changedSinceApplication = snapshot && Number(current) !== Number(snapshot.after);
    return `<label class="template-choice-row"><input type="checkbox" name="remove-attribute" value="${i}" ${changedSinceApplication ? "" : "checked"}> ${esc(change.key)} ${Number(change.amount) > 0 ? "+" : ""}${Number(change.amount) || 0}${changedSinceApplication ? ` · <strong>${t("ChangedSinceApplication")}</strong>` : ""}</label>`;
  }).join("");
  const updateRows = updatedItems.map((change, i) => {
    const item = this.actor.items.get(change.itemId);
    return `<label class="template-choice-row"><input type="checkbox" name="remove-update" value="${i}" ${item ? "checked" : ""}> ${esc(item ? templateEntryDisplayName(item, item) : change.name)} · ${t("ConflictUpdate")}</label>`;
  }).join("");
  const replacementRows = replacedItems.map((change, i) => {
    const item = this.actor.items.get(change.replacedItemId);
    return `<label class="template-choice-row"><input type="checkbox" name="remove-replacement" value="${i}" ${item ? "checked" : ""}> ${esc(item ? templateEntryDisplayName(item, item) : change.name)} · ${t("ConflictReplace")}</label>`;
  }).join("");
  const recordedTransactions = Array.isArray(record.moneyTransactions) ? record.moneyTransactions : [];
  const finalTransactionBalances = new Map();
  for (const transaction of recordedTransactions) finalTransactionBalances.set(transaction.sourceId, Number(transaction.afterBalance));
  const moneyRows = recordedTransactions.length ? recordedTransactions.map((transaction, i) => {
    const source = this.actor.items.get(transaction.sourceId);
    const changed = !source || this._getMoneySourceBalance(source) !== finalTransactionBalances.get(transaction.sourceId);
    return `<label class="template-choice-row"><input type="checkbox" name="remove-money-transaction" value="${i}" ${changed ? "" : "checked"}>
      ${t("MoneyRefund")}: ${Number(transaction.amount)} · ${esc(transaction.title || t("PurchaseBudget"))} → ${esc(transaction.sourceName || "?")}${changed ? ` · <strong>${t("PaymentChanged")}</strong>` : ""}</label>`;
  }).join("") : (() => {
    const recordedMoneySource = record.moneySource?.itemId ? this.actor.items.get(record.moneySource.itemId) : null;
    const currentMoney = recordedMoneySource ? this._getMoneySourceBalance(recordedMoneySource) : Number(this.actor.system.money?.value) || 0;
    const moneyChanged = record.moneySource ? (!recordedMoneySource || currentMoney !== Number(record.moneySource.afterBalance)) : record.moneySnapshot && currentMoney !== Number(record.moneySnapshot.after);
    return record.moneySpent ? `<label class="template-choice-row"><input type="checkbox" name="remove-money" ${moneyChanged ? "" : "checked"}>
      ${t("MoneyRefund")}: ${Number(record.moneySpent)}${moneyChanged ? ` · <strong>${t("PaymentChanged")}</strong>` : ""}</label>` : "";
  })();
  const selection = await new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    new Dialog({
      title: `${t("RemoveModel")}: ${esc(record.templateName || t("Model"))}`,
      content: `<div class="template-apply-block-dialog"><header class="template-flow-header"><span class="template-flow-eyebrow">${t("Model")}</span><h2>${t("RemoveModel")}</h2><p>${t("RemoveHint")}</p></header><div class="template-remove-options">${itemRows}${updateRows}${replacementRows}${attributeRows}${moneyRows}
        ${record.pointsLeftover ? `<label class="template-choice-row"><input type="checkbox" name="remove-points" checked> ${t("Leftover")}: ${Number(record.pointsLeftover)}</label>` : ""}
        </div><p class="template-detach-hint">${t("DetachHint")}</p></div>`,
      buttons: {
        detach: { label: t("DetachModel"), callback: () => finish({ detach: true }) },
        remove: { label: t("RemoveSelected"), callback: html => {
          const checkedValues = name => {
            const result = html.find(`input[name="${name}"]:checked`);
            return typeof result.map === "function" ? result.map((_, el) => el.value).get() : [];
          };
          finish({
            itemIds: checkedValues("remove-item"),
            updateIndexes: checkedValues("remove-update").map(Number),
            replacementIndexes: checkedValues("remove-replacement").map(Number),
            attributeIndexes: checkedValues("remove-attribute").map(Number),
            moneyTransactionIndexes: checkedValues("remove-money-transaction").map(Number),
            points: html.find('input[name="remove-points"]').is(":checked"),
            money: html.find('input[name="remove-money"]').is(":checked")
          });
        } },
        cancel: { label: t("Cancel"), callback: () => finish(null) }
      }, default: "cancel", close: () => finish(null)
    }, { classes: ["dialog", "gum", "template-apply-dialog", "gum-sheet-edit-dialog"], width: 720, height: 620 }).render(true);
  });
  if (!selection) return;
  if (selection.detach) {
    await this._detachTemplateApplication(record, records);
    return;
  }
  const missingIds = createdItemIds.filter(id => !this.actor.items.has(id));
  if (!selection.itemIds.length && !selection.updateIndexes.length && !selection.replacementIndexes.length && !selection.attributeIndexes.length && !selection.moneyTransactionIndexes.length && !selection.points && !selection.money && !missingIds.length) return;
  const selectedIds = selection.itemIds.filter(id => this.actor.items.has(id));
  const removedItemData = selectedIds.map(id => this.actor.items.get(id)?.toObject?.()).filter(Boolean);
  const selectedUpdates = selection.updateIndexes.map(i => updatedItems[i]).filter(Boolean);
  const selectedReplacements = selection.replacementIndexes.map(i => replacedItems[i]).filter(Boolean);
  const selectedSet = new Set([...selectedIds, ...missingIds, ...selectedReplacements.map(change => change.replacedItemId)]);
  const removedReplacementData = selectedReplacements.map(change => this.actor.items.get(change.replacedItemId)?.toObject?.()).filter(Boolean);
  const previousState = {
    attributes: foundry.utils.deepClone(this.actor.system.attributes),
    unspent: Number(this.actor.system.points?.unspent) || 0,
    money: Number(this.actor.system.money?.value) || 0,
    skillOrganization: foundry.utils.deepClone(this.actor.system.skill_organization || {}),
    characteristicOrganization: foundry.utils.deepClone(this.actor.system.characteristic_organization || {}),
    appliedModels: foundry.utils.deepClone(this.actor.system.applied_models || [])
  };
  const childUpdates = this.actor.items.filter(item => !selectedSet.has(item.id) && selectedSet.has(item.system?.parent_container_id))
    .map(item => ({ _id: item.id, "system.parent_container_id": "" }));
  const previousChildLinks = childUpdates.map(update => ({ _id: update._id,
    "system.parent_container_id": this.actor.items.get(update._id)?.system?.parent_container_id || "" }));
  try {
  if (childUpdates.length) await this.actor.updateEmbeddedDocuments("Item", childUpdates);
  if (selectedIds.length) await this.actor.deleteEmbeddedDocuments("Item", selectedIds);
  if (selectedUpdates.length) await this.actor.updateEmbeddedDocuments("Item", selectedUpdates.filter(change => this.actor.items.has(change.itemId)).map(change => change.before));
  const originals = selectedReplacements.filter(change => !this.actor.items.has(change.before?._id)).map(change => change.before);
  if (originals.length) await this.actor.createEmbeddedDocuments("Item", originals, { keepId: true });
  const replacementIds = selectedReplacements.map(change => change.replacedItemId).filter(id => this.actor.items.has(id));
  if (replacementIds.length) await this.actor.deleteEmbeddedDocuments("Item", replacementIds);
  for (const [kind, types, field] of [
    ["skills", ["skill"], "skill_organization"],
    ["characteristics", ["advantage", "disadvantage"], "characteristic_organization"]
  ]) {
    const createdGroupIds = record.createdGroups?.[kind] || [];
    if (!createdGroupIds.length) continue;
    const itemIds = this.actor.items.filter(item => types.includes(item.type)).map(item => item.id);
    let organization = normalizeItemOrganization(this.actor.system[field], itemIds);
    const retainedGroups = [];
    for (const groupId of createdGroupIds) {
      if (Object.values(organization.assignments).includes(groupId)) retainedGroups.push(groupId);
      else organization = removeItemOrganizationGroup(organization, groupId, itemIds);
    }
    if (retainedGroups.length !== createdGroupIds.length) {
      if (kind === "skills") await this._saveSkillOrganization(organization);
      else await this._saveCharacteristicOrganization(organization);
      record.createdGroups[kind] = retainedGroups;
    }
  }

  const attributeReverts = {};
  for (const i of selection.attributeIndexes) {
    const change = attributeChanges[i];
    const key = change?.key;
    const amount = Number(change?.amount) || 0;
    if (!key || !amount) continue;

    const path = key.includes(".") ? `system.attributes.${key}` : `system.attributes.${key}.value`;
    const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
    const previous = path in attributeReverts ? Number(attributeReverts[path]) : current;
    attributeReverts[path] = previous - amount;
  }

  const pointsLeftover = selection.points ? Number(record.pointsLeftover) || 0 : 0;
  if (pointsLeftover) {
    const currentUnspent = Number(this.actor.system?.points?.unspent) || 0;
    attributeReverts["system.points.unspent"] = currentUnspent - pointsLeftover;
  }

  const shouldRecalculateSecondary = Boolean(record.secondaryRecalcApplied && selection.attributeIndexes.some(i =>
    ["st", "dx", "ht", "per"].includes(attributeChanges[i]?.key)));
  if (shouldRecalculateSecondary) {
    const currentAttrs = this.actor.system?.attributes || {};
    const getCurrentValue = (key) => Number(currentAttrs?.[key]?.value) || 0;
    const getRevertedValue = (key) => {
      const path = `system.attributes.${key}.value`;
      if (path in attributeReverts) return Number(attributeReverts[path]) || 0;
      return getCurrentValue(key);
    };

    const st = getRevertedValue("st");
    const dx = getRevertedValue("dx");
    const ht = getRevertedValue("ht");
    const per = getRevertedValue("per");

    const basicSpeed = Math.round((((dx + ht) / 4) + Number.EPSILON) * 100) / 100;
    const basicMove = Math.floor(basicSpeed);
    const damage = this._getBasicDamageFromST(st);
    const allAttributesSelected = selection.attributeIndexes.length === attributeChanges.length;
    const remaining = attributeChanges.filter((_, i) => !selection.attributeIndexes.includes(i));
    const remainingAmount = key => remaining.filter(change => change.key === key).reduce((sum, change) => sum + (Number(change.amount) || 0), 0);
    const before = (path, fallback) => Number(record.attributeSnapshots?.[path]?.before ?? fallback);
    const baseSpeed = before("system.attributes.basic_speed.value", basicSpeed);
    const speedAfterPartial = baseSpeed + (remainingAmount("dx") + remainingAmount("ht")) / 4 + remainingAmount("basic_speed");
    const setDerived = (path, value) => {
      const snapshot = record.attributeSnapshots?.[path];
      if (snapshot && String(foundry.utils.getProperty(this.actor, path)) !== String(snapshot.after)) return;
      attributeReverts[path] = allAttributesSelected && snapshot ? snapshot.before : value;
    };
    setDerived("system.attributes.hp.max", before("system.attributes.hp.max", st) + remainingAmount("st") + remainingAmount("hp") + remainingAmount("hp.max"));
    setDerived("system.attributes.fp.max", before("system.attributes.fp.max", ht) + remainingAmount("ht") + remainingAmount("fp") + remainingAmount("fp.max"));
    setDerived("system.attributes.lifting_st.value", before("system.attributes.lifting_st.value", st) + remainingAmount("st") + remainingAmount("lifting_st"));
    setDerived("system.attributes.vision.value", before("system.attributes.vision.value", per) + remainingAmount("per") + remainingAmount("vision"));
    setDerived("system.attributes.hearing.value", before("system.attributes.hearing.value", per) + remainingAmount("per") + remainingAmount("hearing"));
    setDerived("system.attributes.tastesmell.value", before("system.attributes.tastesmell.value", per) + remainingAmount("per") + remainingAmount("tastesmell"));
    setDerived("system.attributes.touch.value", before("system.attributes.touch.value", per) + remainingAmount("per") + remainingAmount("touch"));
    setDerived("system.attributes.basic_speed.value", speedAfterPartial);
    setDerived("system.attributes.basic_move.value", before("system.attributes.basic_move.value", basicMove) + Math.floor(speedAfterPartial) - Math.floor(baseSpeed) + remainingAmount("basic_move"));
    setDerived("system.attributes.dodge.value", before("system.attributes.dodge.value", Math.floor(basicSpeed) + 3) + Math.floor(speedAfterPartial) - Math.floor(baseSpeed) + remainingAmount("dodge"));
    setDerived("system.attributes.thrust_damage.value", damage.thrust);
    setDerived("system.attributes.swing_damage.value", damage.swing);
  }

  record.createdItemIds = createdItemIds.filter(id => !selectedSet.has(id));
  record.createdContainerIds = (record.createdContainerIds || []).filter(id => !selectedSet.has(id));
  record.entries = (record.entries || []).filter(entry => !selectedSet.has(entry.itemId));
  record.updatedItems = updatedItems.filter((_, i) => !selection.updateIndexes.includes(i));
  record.replacedItems = replacedItems.filter((_, i) => !selection.replacementIndexes.includes(i));
  record.attributeChanges = attributeChanges.filter((_, i) => !selection.attributeIndexes.includes(i));
  for (const [path, value] of Object.entries(attributeReverts)) {
    if (record.attributeSnapshots?.[path]) record.attributeSnapshots[path].after = value;
  }
  if (selection.moneyTransactionIndexes.length) {
    const refunds = new Map();
    for (const index of selection.moneyTransactionIndexes) {
      const transaction = recordedTransactions[index];
      if (transaction) refunds.set(transaction.sourceId, (refunds.get(transaction.sourceId) || 0) + (Number(transaction.amount) || 0));
    }
    for (const [sourceId, amount] of refunds) {
      const source = this.actor.items.get(sourceId);
      if (!source) continue;
      const system = source.system || {};
      const refund = system.mode === "abstract"
        ? { "system.balance": (Number(system.balance) || 0) + amount }
        : { "system.quantity": (Number(system.quantity) || 0) + amount / Math.max(Number(system.unit_value) || 1, 1e-9) };
      await source.update(refund);
    }
    record.moneyTransactions = recordedTransactions.filter((_, index) => !selection.moneyTransactionIndexes.includes(index));
    record.moneySpent = record.moneyTransactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  }
  if (selection.money && record.moneySpent) {
    const source = record.moneySource?.itemId ? this.actor.items.get(record.moneySource.itemId) : null;
    if (source) {
      const system = source.system || {};
      const amount = Number(record.moneySpent) || 0;
      const refund = system.mode === "abstract"
        ? { "system.balance": (Number(system.balance) || 0) + amount }
        : { "system.quantity": (Number(system.quantity) || 0) + amount / Math.max(Number(system.unit_value) || 1, 1e-9) };
      await source.update(refund);
    } else {
      attributeReverts["system.money.value"] = (Number(this.actor.system.money?.value) || 0) + Number(record.moneySpent);
    }
    record.moneySpent = 0;
    record.moneySource = null;
    record.moneySnapshot = null;
  }
  if (selection.points) record.pointsLeftover = 0;
  if (!record.createdItemIds.length && !record.updatedItems.length && !record.replacedItems.length && !record.attributeChanges.length && !record.pointsLeftover && !record.moneySpent) {
    record.removedAt = new Date().toISOString();
    record.removedBy = game.user?.id;
  }

  await this.actor.update({
    ...attributeReverts,
    "system.applied_models": records
  });

  ui.notifications.info(game.i18n.format("GUM.Template.Removed", { name: record.templateName || game.i18n.localize("GUM.Template.Model") }));
  } catch (error) {
    console.error("GUM template removal failed", error);
    try {
      const missingData = removedItemData.filter(data => !this.actor.items.has(data._id));
      if (missingData.length) await this.actor.createEmbeddedDocuments("Item", missingData, { keepId: true });
      const replacementData = selectedReplacements.map(change => change.before).filter(data => data && !this.actor.items.has(data._id));
      if (replacementData.length) await this.actor.createEmbeddedDocuments("Item", replacementData, { keepId: true });
      const replacementCopies = removedReplacementData.filter(data => !this.actor.items.has(data._id));
      if (replacementCopies.length) await this.actor.createEmbeddedDocuments("Item", replacementCopies, { keepId: true });
      const updateData = selectedUpdates.filter(change => this.actor.items.has(change.itemId)).map(change => change.before);
      if (updateData.length) await this.actor.updateEmbeddedDocuments("Item", updateData);
      const links = previousChildLinks.filter(update => this.actor.items.has(update._id));
      if (links.length) await this.actor.updateEmbeddedDocuments("Item", links);
      await this.actor.update({
        "system.attributes": previousState.attributes,
        "system.points.unspent": previousState.unspent,
        "system.money.value": previousState.money,
        "system.skill_organization": previousState.skillOrganization,
        "system.characteristic_organization": previousState.characteristicOrganization,
        "system.applied_models": previousState.appliedModels
      });
    } catch (restoreError) {
      console.error("GUM template removal rollback failed", restoreError);
    }
    ui.notifications.error(game.i18n.localize("GUM.Template.RemoveFailed"));
  }
}

async _detachTemplateApplication(record, records) {
  const relatedIds = new Set([
    ...(record.createdItemIds || []),
    ...(record.updatedItems || []).map(change => change.itemId),
    ...(record.replacedItems || []).map(change => change.replacedItemId)
  ]);
  const ForcedDeletion = foundry.data?.operators?.ForcedDeletion;
  const itemUpdates = [...relatedIds].filter(id => this.actor.items.has(id)).map(id => {
    if (ForcedDeletion) {
      return { _id: id, flags: { gum: {
        templateApplicationId: new ForcedDeletion(),
        templateApplied: new ForcedDeletion(),
        templateDestination: new ForcedDeletion(),
        templateContainer: new ForcedDeletion()
      } } };
    }
    return { _id: id,
      "flags.gum.-=templateApplicationId": null,
      "flags.gum.-=templateApplied": null,
      "flags.gum.-=templateDestination": null,
      "flags.gum.-=templateContainer": null };
  });
  try {
    if (itemUpdates.length) await this.actor.updateEmbeddedDocuments("Item", itemUpdates);
    await this.actor.update({ "system.applied_models": records.filter(entry => entry.applicationId !== record.applicationId) });
    ui.notifications.info(game.i18n.format("GUM.Template.Detached", { name: record.templateName || game.i18n.localize("GUM.Template.Model") }));
  } catch (error) {
    console.error("GUM template detach failed", error);
    ui.notifications.error(game.i18n.localize("GUM.Template.DetachFailed"));
  }
}


async _buildTemplateEntryViewData(entry) {
  const cost = Number(entry.cost) || 0;
  const sourceItem = entry.kind === "attribute" ? null : await this._resolveTemplateEntrySourceItem(entry);
  const title = foundry.utils.escapeHTML(templateEntryDisplayName(entry, sourceItem) || "Entrada");
  const ruleDetails = [
    ...this._getTemplateEntryRequirements(entry).map(requirement => {
      const level = requirement.minimumLevel === null ? "" : ` · ${game.i18n.localize("GUM.Template.MinimumLevelShort")} ${requirement.minimumLevel}`;
      return `${game.i18n.localize(requirement.condition === "exclude" ? "GUM.Template.RequirementMustNotHave" : "GUM.Template.RequirementMustHave")}: ${requirement.name}${level}`;
    }),
    ...(entry.available === false ? [game.i18n.localize("GUM.Template.OptionManuallyUnavailable")] : [])
  ].map(detail => foundry.utils.escapeHTML(detail));

  if (entry.kind === "attribute") {
    return {
      id: entry.id,
      title,
      cost,
      details: [...this._getTemplateAttributeDetailChips(entry), ...ruleDetails]
    };
  }

  const details = [];
  if (entry.kind === "group") details.push(game.i18n.localize("GUM.Template.Package"));
  if (entry.kind === "template") details.push(game.i18n.localize("GUM.Template.ReferencedModel"));
  if (entry.itemType) details.push(this._getTemplateEntryTypeLabel(entry.itemType));
  if (entry.localNotes) details.push(String(entry.localNotes));
  if (Array.isArray(entry.subBlocks) && entry.subBlocks.length) details.push(game.i18n.format("GUM.Template.SubblocksCount", { count: entry.subBlocks.length }));

  if (sourceItem) {
    details.push(...this._getTemplateSourceItemDetails(sourceItem));
  } else {
    if (entry.level !== "" && entry.level !== null && entry.level !== undefined) {
      details.push(game.i18n.format("GUM.Template.EntryLevel", { level: foundry.utils.escapeHTML(String(entry.level)) }));
    }
    if (entry.quantity !== undefined && entry.quantity !== null && Number(entry.quantity) > 1) {
      details.push(game.i18n.format("GUM.Template.EntryQuantity", { quantity: Number(entry.quantity) }));
    }
  }

  return {
    id: entry.id,
    title,
    cost,
    details: [...details.filter(Boolean).map(detail => foundry.utils.escapeHTML(String(detail))), ...ruleDetails]
  };
}

_getTemplateAttributeDetailChips(entry) {
  const attributes = entry.attributes || {};
  const selected = new Set(Array.isArray(entry.selectedAttributes) ? entry.selectedAttributes : []);
  const details = Object.entries(attributes)
    .map(([key, value]) => {
      const initial = Number(value) || 0;
      const legacyLimit = Number(entry.attributeLimits?.[key]);
      const minimumRaw = entry.attributeMinimums?.[key];
      const maximumRaw = entry.attributeMaximums?.[key];
      const minimum = minimumRaw !== "" && minimumRaw !== null && minimumRaw !== undefined && Number.isFinite(Number(minimumRaw))
        ? Number(minimumRaw) : Number.isFinite(legacyLimit) && legacyLimit > 0 ? -Math.max(Math.abs(initial), legacyLimit) : null;
      const maximum = maximumRaw !== "" && maximumRaw !== null && maximumRaw !== undefined && Number.isFinite(Number(maximumRaw))
        ? Number(maximumRaw) : Number.isFinite(legacyLimit) && legacyLimit > 0 ? Math.max(Math.abs(initial), legacyLimit) : null;
      return { key, value: initial, minimum, maximum };
    })
    .filter(attr => attr.value !== 0 || attr.minimum !== null || attr.maximum !== null || selected.has(attr.key))
    .map(attr => {
      const sign = attr.value > 0 ? "+" : "";
      const range = attr.minimum !== null || attr.maximum !== null
        ? ` (${attr.minimum ?? "−∞"}…${attr.maximum ?? "∞"})` : "";
      return `${this._templateAttributeLabel(attr.key)} ${sign}${attr.value}${range}`;
    });

  if (entry.linkSecondary) details.push(game.i18n.localize("GUM.Template.RecalculateSecondaries"));
  if (!details.length) details.push(game.i18n.localize("GUM.Template.NoChanges"));

  return details.map(detail => foundry.utils.escapeHTML(detail));
}

_getTemplateSourceItemDetails(item) {
  const details = [];
  const system = item.system || {};

  if (item.type === "skill") {
    if (system.base_attribute) details.push(game.i18n.format("GUM.Template.BaseAttribute", { attribute: String(system.base_attribute).toUpperCase() }));
    if (system.difficulty) details.push(game.i18n.format("GUM.Template.DifficultyValue", { difficulty: system.difficulty }));
    if (system.skill_level !== null && system.skill_level !== undefined && system.skill_level !== "") {
      details.push(game.i18n.format("GUM.Template.SkillLevel", { level: system.skill_level }));
    }
  }

  if (item.type === "spell") {
    if (system.spell_class) details.push(system.spell_class);
    if (system.mana_cost !== undefined && system.mana_cost !== null && system.mana_cost !== "") {
      details.push(game.i18n.format("GUM.Template.ManaCost", { cost: system.mana_cost }));
    }
  }

  if (item.type === "power") {
    if (system.activation_cost !== undefined && system.activation_cost !== null && system.activation_cost !== "") {
      details.push(game.i18n.format("GUM.Template.ActivationCost", { cost: system.activation_cost }));
    }
    if (system.duration) details.push(game.i18n.format("GUM.Template.Duration", { duration: system.duration }));
  }

  if (["advantage", "disadvantage"].includes(item.type) && system.points !== undefined && system.points !== null && system.points !== "") {
    details.push(game.i18n.format("GUM.Template.BasePointsValue", { points: system.points }));
  }

  if (item.type === "equipment") {
    if (system.tech_level) details.push(game.i18n.format("GUM.Template.TechLevel", { level: system.tech_level }));
    if (system.legality_class) details.push(game.i18n.format("GUM.Template.LegalityClass", { value: system.legality_class }));
  }

  return details;
}

_getTemplateEntryTypeLabel(type) {
  return game.i18n.localize(`GUM.Template.ItemType.${type}`) || type;
}

_buildActorItemFromInlineTemplateEntry(entry, templateItem) {
  const data = foundry.utils.deepClone(entry.inlineItem || {});
  if (!data?.type) return null;
  const pointsField = data.type === "power" ? "points_skill" : "points";

  data.flags = data.flags || {};
  data.flags.gum = data.flags.gum || {};
  data.flags.gum.templateApplied = {
    templateId: templateItem.id,
    templateUuid: templateItem.uuid,
    templateName: templateItem.name,
    templateEntryId: entry.id,
    originChain: foundry.utils.deepClone(entry.originChain || [])
  };

  data.flags.gum.hybridImport = {
    mode: "template-inline",
    sourceUuid: null,
    sourceId: null,
    importedAt: new Date().toISOString()
  };

  data.name = entry.name || data.name;
  if (["advantage", "disadvantage"].includes(data.type) && entry.trait_cost) {
    Object.assign(data.system, foundry.utils.deepClone(entry.trait_cost));
  }

  data.img = entry.img || data.img;

  if (["skill", "spell", "power"].includes(data.type)) {
    data.system = data.system || {};
    data.system[pointsField] = Number(entry.cost ?? data.system[pointsField] ?? 0);
  }

  if (["skill", "spell", "power"].includes(data.type)) {
    const resolvedLevel = this._resolveTemplateEntryRelativeLevel(entry, data.system, data.type);
    if (resolvedLevel !== null) data.system.skill_level = resolvedLevel;
  }

  if (["advantage", "disadvantage"].includes(data.type) && entry.level !== "" && entry.level !== null && entry.level !== undefined) {
    data.system.level = this._templateEntryLevel(entry, entry.level);
  }

  if (data.type === "equipment") {
    data.system = data.system || {};
    data.system.quantity = Number(entry.quantity ?? data.system.quantity ?? 1) || 1;
    data.system.cost = Number(entry.cost ?? data.system.cost ?? 0) || 0;
    data.system.level = String(entry.level ?? data.system.level ?? "").trim();
    data.system.points = Number(entry.pointsCost ?? data.system.points ?? 0) || 0;
  }

  return data;
}

_resolveTemplateEntryRelativeLevel(entry, system = {}, itemType = "skill") {
  if (entry.level !== "" && entry.level !== null && entry.level !== undefined) {
    return this._templateEntryLevel(entry, entry.level);
  }

  const pointsField = itemType === "power" ? "points_skill" : "points";
  const points = Number(entry.cost ?? system?.[pointsField] ?? 0) || 0;
  const difficulty = system?.difficulty || "M";
  return this._calculateRelativeLevelFromPoints(difficulty, points);
}

_calculateRelativeLevelFromPoints(rawDifficulty, points = 0) {
  const pts = Number(points) || 0;
  if (pts <= 0) return 0;

  const normalized = ({
    "E": "F", "A": "M", "H": "D", "VH": "MD"
  })[rawDifficulty] || rawDifficulty || "M";

  if (normalized === "TecM") return Math.floor(pts);
  if (normalized === "TecD") return pts >= 2 ? Math.floor(pts - 1) : 0;

  const tables = {
    "F": { 0: 1, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
    "M": { "-1": 1, 0: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 },
    "D": { "-2": 1, "-1": 2, 0: 4, 1: 8, 2: 12, 3: 16, 4: 20, 5: 24 },
    "MD": { "-3": 1, "-2": 2, "-1": 4, 0: 8, 1: 12, 2: 16, 3: 20, 4: 24, 5: 28 }
  };

  const table = tables[normalized] || tables["M"];
  let bestLevel = 0;
  let bestCost = 0;

  for (const [levelRaw, costRaw] of Object.entries(table)) {
    const level = Number(levelRaw);
    const cost = Number(costRaw) || 0;
    if (cost <= pts && cost >= bestCost) {
      bestCost = cost;
      bestLevel = level;
    }
  }

  const maxLevel = Math.max(...Object.keys(table).map(Number));
  const maxCost = Number(table[maxLevel]) || bestCost;
  if (pts > maxCost) {
    return maxLevel + Math.floor((pts - maxCost) / 4);
  }

  return bestLevel;
}

}
