import { calculateItemTraitCost, parseTraitAdjustment } from "../utils/trait-cost.mjs";
import { EffectBrowser } from "../apps/effect-browser.js"; 
import { ConditionBrowser } from "../apps/condition-browser.js"; 
import { EqpModifierBrowser } from "../apps/eqp-modifier-browser.js"; 
import { ModifierBrowser } from "../apps/modifier-browser.js";
import { GM_MODIFIER_CATEGORY_OPTIONS } from "../utils/gm-modifier-categories.js"; 
import { listBodyLocations } from "../config/body-profiles.js";
import { bilingualLocationOptions } from "../utils/equipment-location-aliases.mjs";
import { SOCIAL_CATEGORIES } from "../config/social-aspects.mjs";
import { normalizeContextCsv, openContextPicker } from "../apps/context-picker.mjs";
import { describeEquipmentAttackChanges, describeEquipmentPropertyChanges, describeEquipmentResolutionWarnings, describeEquipmentUseChanges, normalizeEquipmentModifier, parseEquipmentAdjustment, resolveEquipment } from "../utils/equipment-resolution.mjs";
import { ammunitionLinkCandidates } from "../utils/ammunition.mjs";
import { collectMagicConsumptionSources, normalizeMagicConsumptionGroups } from "../utils/magic-consumption.mjs";
import { canonicalSkillLinkTargetPath, collectSkillLinkCandidates, normalizeSkillLinkSearch } from "../utils/skill-link.mjs";
import { HYBRID_ALIAS_ITEM_TYPES, normalizeItemAliases, normalizeItemName } from "../utils/item-name-aliases.mjs";
 
const { ItemSheet } = foundry.appv1.sheets; 
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;

function localizeEquipmentLocation(option) {
    if (!String(game.i18n.lang || "").startsWith("en")) return option;
    const match = String(option.name || "").match(/^(ex-)?(.+?)(?:\s+([ED])(\d+)|\s+(\d+))?$/);
    if (!match) return option;
    const key = `GUM.Equipment.Location.${match[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    const root = game.i18n.localize(key);
    if (root === key) return option;
    const side = match[3] === "E" ? " L" : match[3] === "D" ? " R" : "";
    const number = match[4] || match[5] || "";
    const name = `${match[1] ? "Extra " : ""}${root}${side}${number ? (side ? number : ` ${number}`) : ""}`;
    return { ...option, name, label: name };
}

const ROLL_CONTEXT_OPTIONS = [ 
    { id: "all", label: "Qualquer rolagem" }, 
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
    { id: "check_st", label: "Teste de ST" }, 
    { id: "skill_st", label: "Perícias baseadas em ST" }, 
    { id: "spell_st", label: "Magias baseadas em ST" },
    { id: "power_st", label: "Poderes baseados em ST" },
    { id: "check_dx", label: "Teste de DX" }, 
    { id: "skill_dx", label: "Perícias baseadas em DX" }, 
    { id: "spell_dx", label: "Magias baseadas em DX" },
    { id: "power_dx", label: "Poderes baseados em DX" },
    { id: "check_iq", label: "Teste de IQ" }, 
    { id: "skill_iq", label: "Perícias baseadas em IQ" }, 
    { id: "spell_iq", label: "Magias baseadas em IQ" },
    { id: "power_iq", label: "Poderes baseados em IQ" },
    { id: "check_ht", label: "Teste de HT" }, 
    { id: "skill_ht", label: "Perícias baseadas em HT" }, 
    { id: "spell_ht", label: "Magias baseadas em HT" },
    { id: "power_ht", label: "Poderes baseados em HT" },
    { id: "check_per", label: "Teste de Per" }, 
    { id: "skill_per", label: "Perícias baseadas em Per" }, 
    { id: "spell_per", label: "Magias baseadas em Per" },
    { id: "power_per", label: "Poderes baseados em Per" },
    { id: "check_vont", label: "Teste de Vont" }, 
    { id: "skill_vont", label: "Perícias baseadas em Vont" }, 
    { id: "spell_vont", label: "Magias baseadas em Vont" },
    { id: "power_vont", label: "Poderes baseados em Vont" },
    { id: "sense_vision", label: "Visão" }, 
    { id: "sense_hearing", label: "Audição" }, 
    { id: "sense_tastesmell", label: "Olfato/Paladar" }, 
    { id: "sense_touch", label: "Tato" } 
]; 
 
// ================================================================== // 
//  CLASSE DA FICHA DO ITEM (GurpsItemSheet) - VERSÃO BLINDADA V12    // 
// ================================================================== // 
export class GurpsItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, { 
            classes: ["gum", "sheet", "item", "theme-dark"], 
            width: 635, 
            height: 600, 
            template: "systems/gum/templates/items/item-sheet.hbs", 
            tabs: [{ 
                navSelector: ".sheet-tabs", 
                contentSelector: ".sheet-body-content", 
                initial: "details" 
            }], 
            scrollY: [".sheet-body-content", ".sheet-body"] 
        }); 
    } 
 
    _findPdfViewerIframesBySource(sourcePath) { 
  const iframes = Array.from(document.querySelectorAll("iframe")); 
  if (!iframes.length) return []; 
 
  const want = (sourcePath || "").toString(); 
  const wantName = want.split("/").pop(); 
 
  const matches = (candidate) => { 
    if (!candidate) return false; 
    if (!want) return true; 
 
    // match direto 
    if (candidate.includes(want)) return true; 
 
    // match por nome do arquivo 
    if (wantName && (candidate.includes(wantName) || candidate.includes(encodeURIComponent(wantName)))) return true; 
 
    // match pelo parâmetro ?file=... 
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
 
    // normalmente viewer do pdfjs tem "pdfjs" e/ou "viewer.html" 
    const looksLikePdfViewer = /pdfjs|viewer\.html/i.test(cand); 
    if (!looksLikePdfViewer) return false; 
 
    return matches(cand); 
  }); 
} 
 
_setPageOnPdfViewerIframe(iframe, page) { 
  if (!(iframe instanceof HTMLIFrameElement)) return false; 
  const target = Math.max(1, Number(page) || 1); 
 
  // 1) tenta API do PDF.js (melhor) 
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
 
  // 2) fallback: força #page=N no src/data-src 
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
 
  // atualiza ambos pra evitar o Foundry “repor” o src depois 
  if (dataSrc) { 
    iframe.setAttribute("data-src", updated); 
    iframe.setAttribute("data-url", updated); 
    iframe.dataset.src = updated; 
    iframe.dataset.url = updated; 
  } 
  iframe.setAttribute("src", updated); 
 
  return true; 
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
  // monta botões com base no que existe de fato 
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
 
  // conteúdo do dialog (mostra também refs não encontradas) 
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

    _normalizeAttackMinStrength(value) {
        const values = Array.isArray(value) ? value : String(value ?? "").split(",");
        return values.map(entry => String(entry ?? "").trim()).filter(Boolean).at(-1) || "";
    }
 
    async getData(options) { 
        // Recupera os dados básicos 
        const context = await super.getData(options); 
        const itemData = context.item;  
 
        // Garante acesso fácil ao system e flags 
        context.system = this.item.type === "equipment"
            ? foundry.utils.deepClone(this.item._source?.system || itemData.system)
            : itemData.system;
        context.flags = itemData.flags;
        context.canUseItemAttachmentDrops = this._canUseItemAttachmentDrops();
        context.attackMinStrength = this._normalizeAttackMinStrength(itemData.system?.attack_roll?.min_strength);
        context.supportsHybridAliases = HYBRID_ALIAS_ITEM_TYPES.includes(this.item.type);
        context.itemAliases = normalizeItemAliases(itemData.system?.aliases).map((value, index) => ({ value, index }));
        if (["spell", "power"].includes(this.item.type)) {
            context.consumptionGroups = normalizeMagicConsumptionGroups(itemData.system.consumptionGroups);
            context.magicConsumptionSourceOptions = this.item.actor
                ? collectMagicConsumptionSources(this.item.actor)
                : [];
        }

        context.socialCategories = Object.entries(SOCIAL_CATEGORIES).map(([type, config]) => ({ type, label: game.i18n.localize(config.label) }));
        context.socialContributions = Object.entries(itemData.system.social_contributions || {}).map(([id, contribution]) => {
            const fields = (SOCIAL_CATEGORIES[contribution.type]?.fields || [])
                .filter(([name]) => name !== "points")
                .map(([name, label, type, layout = {}]) => ({ name, label: game.i18n.localize(label), type, value: contribution[name] ?? "", ...layout }));
            const fieldRows = [...new Set(fields.map(field => field.row || 1))].map(row => ({
                fields: fields.filter(field => (field.row || 1) === row)
            }));
            return {
                id, ...contribution, points: contribution.points ?? "",
                open: this._socialContributionOpenState?.get(id) ?? true,
                icon: SOCIAL_CATEGORIES[contribution.type]?.icon || "fas fa-users",
                typeLabel: game.i18n.localize(SOCIAL_CATEGORIES[contribution.type]?.label || "GUM.Social.Tab"),
                fieldRows
            };
        });
 
        // ======================================================= 
        // 1. LISTAS DE CONFIGURAÇÃO (DEFINIÇÃO EXPLÍCITA) 
        // ======================================================= 
        // Definimos o objeto config DIRETAMENTE no contexto para garantir que exista. 
        context.config = { 
            costModes: { 
                "standard": "Padrão (GURPS Basic)", 
                "linear": "Linear (Árvore/Técnica)" 
            }, 
            difficulties: { 
                "E": "Fácil (E)", 
                "A": "Média (A)", 
                "H": "Difícil (H)", 
                "VH": "Muito Difícil (VH)", 
                "TecM": "Técnica Média (TecM)", 
                "TecD": "Técnica Difícil (TecD)" 
            }, 
            attributes: { 
                "st": "ST", "dx": "DX", "iq": "IQ", "ht": "HT",  
                "per": "Per", "vont": "Vont" 
            }, 
            hierarchyTypes: { 
                "normal": "Padrão (Sem Árvore)", 
                "trunk": "Tronco (Trunk)", 
                "branch": "Galho (Branch)", 
                "twig": "Graveto (Twig)", 
                "leaf": "Folha (Leaf)" 
            } 
        }; 
 
        // Disponibiliza as listas também na raiz para facilitar (opcional, mas seguro) 
        context.skillDifficulties = context.config.difficulties; 
        context.hierarchyTypes = context.config.hierarchyTypes; 
        const standardSkillAttrs = ["st", "dx", "iq", "ht", "per", "will", "vont"];
        const resolveSkillBaseAttribute = (value, { defaultCustomType = "skill", storedType = "" } = {}) => {
            const baseAttrValue = (value ?? "").toString();
            const baseAttrNormalized = baseAttrValue.trim().toLowerCase();
            const isStandardAttr = standardSkillAttrs.includes(baseAttrNormalized);
            const normalizedType = (storedType ?? "").toString().trim().toLowerCase();
            const customTypes = ["skill", "spell", "power", "custom"];

            return {
                select: isStandardAttr ? baseAttrNormalized : (customTypes.includes(normalizedType) ? normalizedType : defaultCustomType),
                custom: isStandardAttr ? "" : baseAttrValue
            };
        };

        if (this.item.type === 'spell') {
            const spellBase = resolveSkillBaseAttribute(itemData.system.base_attribute, {
                defaultCustomType: "custom",
                storedType: itemData.system.base_attribute_type
            });
            context.spellBaseAttributeSelect = spellBase.select;
            context.spellBaseAttributeCustom = spellBase.custom;
            context.spellBaseAttributeCustomEnabled = ["skill", "spell", "custom"].includes(spellBase.select);
            context.spellBaseAttributePlaceholder = ({
                skill: game.i18n.localize("GUM.SpellPower.PlaceholderBaseSkill"),
                spell: game.i18n.localize("GUM.SpellPower.PlaceholderBaseSpell"),
                custom: game.i18n.localize("GUM.SpellPower.PlaceholderCustomValue")
            })[spellBase.select] || "";

            const normalizeSpellDifficulty = (difficulty) => ({
                E: "F",
                A: "M",
                H: "D",
                VH: "MD"
            })[(difficulty ?? "").toString()] || (difficulty || "D");
            context.spellDifficultyOptions = {
                F: game.i18n.localize("GUM.SpellPower.DifficultyEasy"),
                M: game.i18n.localize("GUM.SpellPower.DifficultyAverage"),
                D: game.i18n.localize("GUM.SpellPower.DifficultyHard"),
                MD: game.i18n.localize("GUM.SpellPower.DifficultyVeryHard"),
                linear: game.i18n.localize("GUM.SpellPower.DifficultyLinear")
            };
            context.spellUsesLinearCost = itemData.system.cost_mode === "linear" || itemData.system.difficulty === "linear";
            context.spellDifficultySelected = context.spellUsesLinearCost ? "linear" : normalizeSpellDifficulty(itemData.system.difficulty);
        }

        if (this.item.type === 'power') {
            const powerBase = resolveSkillBaseAttribute(itemData.system.base_attribute, {
                defaultCustomType: "custom",
                storedType: itemData.system.base_attribute_type
            });
            context.powerBaseAttributeSelect = powerBase.select;
            context.powerBaseAttributeCustom = powerBase.custom;
            context.powerBaseAttributeCustomEnabled = ["skill", "spell", "power", "custom"].includes(powerBase.select);
            context.powerBaseAttributePlaceholder = ({
                skill: game.i18n.localize("GUM.SpellPower.PlaceholderBaseSkill"),
                spell: game.i18n.localize("GUM.SpellPower.PlaceholderBaseSpell"),
                power: game.i18n.localize("GUM.SpellPower.PlaceholderBasePower"),
                custom: game.i18n.localize("GUM.SpellPower.PlaceholderCustomValue")
            })[powerBase.select] || "";

            const normalizePowerDifficulty = (difficulty) => ({
                E: "F",
                A: "M",
                H: "D",
                VH: "MD"
            })[(difficulty ?? "").toString()] || (difficulty || "D");
            context.powerDifficultyOptions = {
                F: game.i18n.localize("GUM.SpellPower.DifficultyEasy"),
                M: game.i18n.localize("GUM.SpellPower.DifficultyAverage"),
                D: game.i18n.localize("GUM.SpellPower.DifficultyHard"),
                MD: game.i18n.localize("GUM.SpellPower.DifficultyVeryHard"),
                linear: game.i18n.localize("GUM.SpellPower.DifficultyLinear")
            };
            context.powerUsesLinearCost = itemData.system.cost_mode === "linear" || itemData.system.difficulty === "linear";
            context.powerDifficultySelected = context.powerUsesLinearCost ? "linear" : normalizePowerDifficulty(itemData.system.difficulty);
        }
 
        if (this.item.type === 'skill') { 

            const standardBase = resolveSkillBaseAttribute(itemData.system.base_attribute);
            context.skillBaseAttributeSelect = standardBase.select;
            context.skillBaseAttributeCustom = standardBase.custom;

            const treeBaseAttribute = itemData.system.tree_base_attribute ?? itemData.system.base_attribute;
            const treeBase = resolveSkillBaseAttribute(treeBaseAttribute);
            context.treeBaseAttributeSelect = treeBase.select;
            context.treeBaseAttributeCustom = treeBase.custom;

            context.treeHierarchyType = itemData.system.tree_hierarchy_type ?? itemData.system.hierarchy_type ?? "normal";
            const savedTreePointsPerLevel = itemData.system.tree_points_per_level;
            context.treePointsPerLevel = savedTreePointsPerLevel !== undefined && savedTreePointsPerLevel !== "" ? savedTreePointsPerLevel : this._getTreePointsPerLevelDefault(context.treeHierarchyType);
            context.treeSkillLevel = itemData.system.tree_skill_level ?? itemData.system.skill_level ?? 0;
            context.treeNhMod = itemData.system.tree_nh_mod ?? 0;
            context.treePoints = itemData.system.tree_points ?? this._calculateTreeSkillPoints(context.treeSkillLevel, context.treePointsPerLevel);

            const legacyTreeParent = (() => {
                if (context.treeHierarchyType === "branch") return itemData.system.root_parent ?? "";
                if (context.treeHierarchyType === "twig") return itemData.system.branch_parent ?? "";
                if (context.treeHierarchyType === "leaf") return itemData.system.twig_parent ?? itemData.system.parent_skill ?? "";
                return "";
            })();
            context.treeParentValue = itemData.system.tree_parent ?? legacyTreeParent;

            const treeParentConfig = {
                normal: { enabled: false, placeholder: "Não usa árvore", filter: "" },
                trunk: { enabled: false, placeholder: "Tronco não possui pai", filter: "" },
                branch: { enabled: true, placeholder: "Nome do tronco pai", filter: "trunk" },
                twig: { enabled: true, placeholder: "Nome do galho/ramo pai", filter: "branch" },
                leaf: { enabled: true, placeholder: "Nome do pai imediato", filter: "twig|branch" }
            };
            const parentConfig = treeParentConfig[context.treeHierarchyType] ?? treeParentConfig.normal;
            context.treeParentEnabled = parentConfig.enabled;
            context.treeParentPlaceholder = parentConfig.placeholder;
            context.treeParentSkillFilter = parentConfig.filter;
        } 
 
        // =======================================================
        // 2. LÓGICA DE EQUIPAMENTOS 
        // ======================================================= 
            if (['equipment', 'melee_weapon', 'ranged_weapon'].includes(this.item.type)) {
            context.ammunitionLabels = Object.fromEntries(Array.from(this.item.actor?.items || []).map(item => [item.id, item.name]));
            const baseEquipmentSystem = this.item._source?.system || this.item.system;
            const eqpModsObj = baseEquipmentSystem.eqp_modifiers || {};
            const modifiersArray = Object.entries(eqpModsObj).map(([id, data]) => ({ 
                id, ...data 
            })).sort((a, b) => a.name.localeCompare(b.name)); 
            context.eqpModifiersList = modifiersArray; 
            context.eqpModifiersHasFeatures = modifiersArray.some(mod => mod.features); 
 
            const resolution = resolveEquipment(baseEquipmentSystem, eqpModsObj);
            const normalizedById = new Map(resolution.modifiers.map(modifier => [modifier.id, modifier]));
            for (const mod of modifiersArray) {
                const normalized = normalizedById.get(mod.id) || normalizeEquipmentModifier(mod);
                mod.enabled = normalized.enabled;
                mod.level = normalized.level;
                mod.costDisplay = normalized.cost.expression || "—";
                mod.weightDisplay = normalized.weight.expression || "—";
                mod.costStage = normalized.cost.stage;
                mod.weightStage = normalized.weight.stage;
            }

            context.equipmentResolution = resolution;
            context.equipmentAmmunitionChanged = resolution.steps.some(step => ["create_ammunition", "ammunition_property"].includes(step.type))
                && JSON.stringify(baseEquipmentSystem.ammunition || {}) !== JSON.stringify(resolution.ammunition);
            context.equipmentResolvedAmmunition = resolution.ammunition;
            context.equipmentUses = resolution.uses;
            context.equipmentPropertyChanges = describeEquipmentPropertyChanges(baseEquipmentSystem, resolution.properties);
            const useChanges = describeEquipmentUseChanges(baseEquipmentSystem, resolution.uses);
            const useLabels = {
                mode: { quantity: "GUM.Equipment.Label.ConsumeQuantity", charges: "GUM.Equipment.Label.UseCharges" },
                reserveType: { "": "GUM.Equipment.Reserve.None", combat: "GUM.Equipment.Reserve.Combat", power: "GUM.Equipment.Reserve.Power", spell: "GUM.Equipment.Reserve.Spell" },
                reserveScope: { any: "GUM.Equipment.Reserve.Any", carried: "GUM.Equipment.Reserve.Carried", equipped: "GUM.Equipment.Reserve.Equipped", stored: "GUM.Equipment.Reserve.Stored", active: "GUM.Equipment.Reserve.Active" }
            };
            context.equipmentUseChanges = Object.fromEntries(Object.entries(useChanges).map(([key, change]) => [key, {
                ...change,
                finalLabel: useLabels[key]?.[change.final] ? game.i18n.localize(useLabels[key][change.final]) : change.final
            }]));
            const attackFieldKeys = {
                damage_formula: "GUM.Equipment.Attacks.Damage", damage_type: "GUM.EquipmentModifier.Properties.DamageType",
                damage_nature: "GUM.EquipmentModifier.Properties.DamageNature", armor_divisor: "GUM.Equipment.Attacks.ArmorDivisor",
                skill_level_mod: "GUM.Equipment.Attacks.SkillModifier", min_strength: "GUM.Equipment.Attacks.MinimumStrength",
                reach: "GUM.Equipment.Attacks.Reach", parry: "GUM.Equipment.Attacks.Parry", block: "GUM.Equipment.Attacks.Block",
                accuracy: "GUM.Equipment.Attacks.Accuracy", range: "GUM.Equipment.Attacks.Distance",
                rof: "GUM.EquipmentModifier.Properties.RateOfFire", shots: "GUM.EquipmentModifier.Properties.Shots",
                rcl: "GUM.EquipmentModifier.Properties.Recoil", mag: "GUM.EquipmentModifier.Properties.Magnitude",
                follow_up_damage: "GUM.Equipment.Attacks.FollowUp", fragmentation_damage: "GUM.Equipment.Attacks.Fragmentation",
                groups: "GUM.Equipment.Attacks.Groups"
            };
            const localizeAttackChanges = changes => Object.fromEntries(Object.entries(changes).map(([id, change]) => {
                const displaySummary = change.valueParts.length
                    ? change.valueParts.map(part => `${game.i18n.localize(attackFieldKeys[part.path] || part.path)}: ${part.value}`).join(" · ")
                    : game.i18n.localize("GUM.Equipment.Attacks.ModeCreated");
                const title = change.sources.length
                    ? game.i18n.format("GUM.Equipment.Attacks.ModifiedBy", { sources: change.sources.join(", ") })
                    : game.i18n.localize("GUM.Equipment.Attacks.Modified");
                return [id, { ...change, displaySummary, title }];
            }));
            const meleeAttackChanges = localizeAttackChanges(describeEquipmentAttackChanges(baseEquipmentSystem.melee_attacks, resolution.meleeAttacks, resolution.steps, "melee"));
            const rangedAttackChanges = localizeAttackChanges(describeEquipmentAttackChanges(baseEquipmentSystem.ranged_attacks, resolution.rangedAttacks, resolution.steps, "ranged"));
            const createdAttackCards = (attacks, changes) => Object.entries(attacks || {})
                .filter(([id]) => changes[id]?.created)
                .map(([id, attack]) => ({ id, ...attack, change: changes[id] }));
            context.equipmentMeleeAttackChanges = meleeAttackChanges;
            context.equipmentRangedAttackChanges = rangedAttackChanges;
            context.equipmentCreatedMeleeAttacks = createdAttackCards(resolution.meleeAttacks, meleeAttackChanges);
            context.equipmentCreatedRangedAttacks = createdAttackCards(resolution.rangedAttacks, rangedAttackChanges);
            context.equipmentFeatureSteps = resolution.steps;
            const stageLabels = { original: "GUM.EquipmentModifier.Stages.Original", base: "GUM.EquipmentModifier.Stages.Base", final_base: "GUM.EquipmentModifier.Stages.FinalBase", final: "GUM.EquipmentModifier.Stages.Final" };
            const describeCalculationSteps = steps => steps.map(step => ({ ...step, stageLabel: stageLabels[step.stage] ? game.i18n.localize(stageLabels[step.stage]) : step.stage }));
            context.equipmentCostSteps = describeCalculationSteps(resolution.cost.steps);
            context.equipmentWeightSteps = describeCalculationSteps(resolution.weight.steps);
            context.equipmentResolutionWarnings = describeEquipmentResolutionWarnings(resolution.warnings).map(warning => {
                const keys = {
                    invalid_expression: "InvalidExpression", unsupported_operation: "UnsupportedOperation",
                    unsupported_feature_path: "UnsupportedPath", feature_no_match: "NoMatch",
                    conflicting_feature_override: "ConflictingOverride", missing_effect_uuid: "MissingEffect",
                    missing_descriptor_value: "MissingDescriptor"
                };
                const key = `GUM.Equipment.Warning.${keys[warning.type] || "Generic"}`;
                return {
                    ...warning,
                    source: warning.source === "Modificador desconhecido" ? game.i18n.localize("GUM.Equipment.Warning.UnknownSource") : warning.source,
                    message: game.i18n.format(key, {
                        value: warning.expression || warning.operation || warning.path || warning.selectorValue || "—"
                    })
                };
            });
            context.calculatedFinalCost = resolution.cost.unitFinal;
            context.calculatedFinalWeight = resolution.weight.unitFinal;
             
            context.finalCostString = context.calculatedFinalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); 
 context.finalWeightString = context.calculatedFinalWeight.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); 
            context.hasCostChange = resolution.cost.unitFinal !== resolution.cost.base;
            context.hasWeightChange = resolution.weight.unitFinal !== resolution.weight.base;
        }

        if (this.item.type === "eqp_modifier") {
            const normalized = normalizeEquipmentModifier(this.item.system);
            context.eqpModifierAdjustment = normalized;
            context.eqpModifierFeatures = normalized.features.map(feature => ({
                ...feature,
                per_level: feature.perLevel,
                attack_type: feature.attackType,
                selector_field: feature.selectorField,
                selector_value: feature.selectorValue,
                location: feature.location,
                damage_type: feature.damageType,
                damage_slot: feature.damageSlot,
                descriptor_kind: feature.descriptorKind,
                effect_uuid: feature.effectUuid,
                effect_name: feature.effect_name || feature.effectName || "",
                effect_img: feature.effect_img || feature.effectImg || "",
                effect_domain: feature.effectDomain,
                min_injury: feature.minInjury,
                activation_chance: feature.activationChance,
                required_damage_type: feature.requiredDamageType,
                owner_kind: feature.ownerKind,
                name_compare: feature.nameCompare,
                name_value: feature.nameValue,
                situation: feature.situation,
                damage: feature.damage,
                cumulative_text_equipment_value: ["material", "quality"].includes(feature.path),
                formula_attack_value: feature.path === "damage_formula",
                textual_attack_value: ["damage_type", "damage_nature", "reach", "range", "rof", "shots", "groups"].includes(feature.path),
                numeric_equipment_value: ["item_dr", "item_hp", "item_ht", "tech_sm", "holdout", "defense_bonus", "equip_time", "max_uses"].includes(feature.path),
                charge_capacity_feature: feature.path === "max_uses",
                reserve_type: feature.reserveType,
                reserve_name: feature.reserveName,
                reserve_scope: feature.reserveScope,
                numeric_attack_value: ["skill_level_mod", "armor_divisor", "min_strength", "accuracy", "rcl", "mag", "parry_bonus", "block_bonus", "effective_st_bonus"].includes(feature.path),
                numeric_ammunition_value: ["attack_modifier", "low_warning"].includes(feature.path) || feature.path.endsWith(".armor_divisor"),
                formula_ammunition_value: feature.path.endsWith(".formula"),
                enabled_ammunition_value: feature.path === "enabled",
                operation_ammunition_value: feature.path.endsWith(".operation"),
                textual_ammunition_value: feature.path.endsWith(".type") || feature.path.endsWith(".nature"),
                ammunition_value_string: String(feature.value)
            }));
            context.equipmentAdjustmentStageOptions = [
                { id: "original", label: game.i18n.localize("GUM.EquipmentModifier.Stages.Original") },
                { id: "base", label: game.i18n.localize("GUM.EquipmentModifier.Stages.Base") },
                { id: "final_base", label: game.i18n.localize("GUM.EquipmentModifier.Stages.FinalBase") },
                { id: "final", label: game.i18n.localize("GUM.EquipmentModifier.Stages.Final") }
            ];
            context.equipmentFeatureTypeOptions = [
                { id: "equipment_property", label: game.i18n.localize("GUM.EquipmentModifier.Types.Property") },
                { id: "equipment_descriptor", label: game.i18n.localize("GUM.EquipmentModifier.Types.Descriptor") },
                { id: "equipment_dr", label: game.i18n.localize("GUM.EquipmentModifier.Types.DR") },
                { id: "attack_property", label: game.i18n.localize("GUM.EquipmentModifier.Types.AttackProperty") },
                { id: "attack_damage", label: game.i18n.localize("GUM.EquipmentModifier.Types.AttackDamage") },
                { id: "create_attack", label: game.i18n.localize("GUM.EquipmentModifier.Types.CreateAttack") },
                { id: "create_ammunition", label: game.i18n.localize("GUM.EquipmentModifier.Types.CreateAmmunition") },
                { id: "ammunition_property", label: game.i18n.localize("GUM.EquipmentModifier.Types.AmmunitionProperty") },
                { id: "granted_effect", label: game.i18n.localize("GUM.EquipmentModifier.Types.GrantEffect") }
                ,{ id: "owner_modifier", label: game.i18n.localize("GUM.EquipmentModifier.Types.OwnerModifier") }
            ];
            context.equipmentFeatureOperationOptions = [
                { id: "add", label: game.i18n.localize("GUM.EquipmentModifier.Operations.Add") },
                { id: "multiply", label: game.i18n.localize("GUM.EquipmentModifier.Operations.Multiply") },
                { id: "set", label: game.i18n.localize("GUM.EquipmentModifier.Operations.Set") }
            ];
            context.ammunitionPropertyOptions = [
                { id: "enabled", label: game.i18n.localize("GUM.Equipment.Ammunition.Enabled") },
                { id: "attack_modifier", label: game.i18n.localize("GUM.Equipment.Ammunition.AttackModifier") },
                { id: "low_warning", label: game.i18n.localize("GUM.Equipment.Ammunition.LowWarning") },
                ...["main", "follow_up", "fragmentation"].flatMap(part => {
                    const label = game.i18n.localize(`GUM.Equipment.Ammunition.${{ main: "MainDamage", follow_up: "FollowUpDamage", fragmentation: "FragmentationDamage" }[part]}`);
                    return ["formula", "operation", "type", "nature", "armor_divisor", "divisor_operation"].map(field => ({
                        id: `${part}.${field}`,
                        label: `${label} · ${game.i18n.localize(`GUM.Equipment.Ammunition.${{ formula: "Formula", operation: "FormulaOperation", type: "Type", nature: "Nature", armor_divisor: "ArmorDivisor", divisor_operation: "DivisorOperation" }[field]}`)}`
                    }));
                })
            ];
            context.equipmentPropertyOptions = [
                { id: "item_dr", label: game.i18n.localize("GUM.Equipment.Label.ItemDR") }, { id: "item_hp", label: game.i18n.localize("GUM.Equipment.Label.ItemHP") },
                { id: "item_ht", label: game.i18n.localize("GUM.Equipment.Label.ItemHT") }, { id: "tech_sm", label: game.i18n.localize("GUM.Equipment.Label.SizeModifier") },
                { id: "holdout", label: game.i18n.localize("GUM.Equipment.Label.Holdout") }, { id: "defense_bonus", label: game.i18n.localize("GUM.Equipment.Label.DefenseBonus") },
                { id: "equip_time", label: game.i18n.localize("GUM.EquipmentModifier.Properties.EquipTime") }, { id: "max_uses", label: game.i18n.localize("GUM.EquipmentModifier.Properties.ChargeCapacity") },
                { id: "legality_class", label: game.i18n.localize("GUM.Equipment.Label.Legality") }, { id: "material", label: game.i18n.localize("GUM.Equipment.Label.Material") },
                { id: "quality", label: game.i18n.localize("GUM.Equipment.Label.Quality") }
            ];
            context.attackPropertyOptions = [
                { id: "damage_formula", label: game.i18n.localize("GUM.EquipmentModifier.Properties.Damage") }, { id: "damage_type", label: game.i18n.localize("GUM.EquipmentModifier.Properties.DamageType") },
                { id: "damage_nature", label: game.i18n.localize("GUM.EquipmentModifier.Properties.DamageNature") }, { id: "armor_divisor", label: game.i18n.localize("GUM.EquipmentModifier.Properties.ArmorDivisor") },
                { id: "skill_level_mod", label: game.i18n.localize("GUM.EquipmentModifier.Properties.SkillModifier") }, { id: "min_strength", label: game.i18n.localize("GUM.EquipmentModifier.Properties.MinStrength") },
                { id: "reach", label: game.i18n.localize("GUM.EquipmentModifier.Properties.Reach") }, { id: "parry", label: game.i18n.localize("GUM.Equipment.Attacks.Parry") },
                { id: "block", label: game.i18n.localize("GUM.Equipment.Attacks.Block") }, { id: "parry_bonus", label: game.i18n.localize("GUM.EquipmentModifier.Properties.ParryBonus") },
                { id: "block_bonus", label: game.i18n.localize("GUM.EquipmentModifier.Properties.BlockBonus") }, { id: "effective_st_bonus", label: game.i18n.localize("GUM.EquipmentModifier.Properties.EffectiveStrength") },
                { id: "unbalanced", label: game.i18n.localize("GUM.EquipmentModifier.Properties.Unbalanced") }, { id: "accuracy", label: game.i18n.localize("GUM.Equipment.Attacks.Accuracy") },
                { id: "range", label: game.i18n.localize("GUM.Equipment.Attacks.Distance") }, { id: "rof", label: game.i18n.localize("GUM.EquipmentModifier.Properties.RateOfFire") },
                { id: "shots", label: game.i18n.localize("GUM.EquipmentModifier.Properties.Shots") }, { id: "rcl", label: game.i18n.localize("GUM.EquipmentModifier.Properties.Recoil") },
                { id: "mag", label: game.i18n.localize("GUM.EquipmentModifier.Properties.Magnitude") }, { id: "groups", label: game.i18n.localize("GUM.EquipmentModifier.Properties.Groups") }
            ];
            context.equipmentBodyLocationOptions = listBodyLocations().map(localizeEquipmentLocation);
            context.equipmentDescriptorKindOptions = [
                { id: "appearance", label: game.i18n.localize("GUM.EquipmentModifier.Descriptor.Appearance") }, { id: "craftsmanship", label: game.i18n.localize("GUM.EquipmentModifier.Descriptor.Craftsmanship") },
                { id: "material", label: game.i18n.localize("GUM.EquipmentModifier.Descriptor.Material") }, { id: "origin", label: game.i18n.localize("GUM.EquipmentModifier.Descriptor.Origin") },
                { id: "tag", label: game.i18n.localize("GUM.EquipmentModifier.Descriptor.Tag") }, { id: "note", label: game.i18n.localize("GUM.EquipmentModifier.Descriptor.Note") }
            ];
        }
 
        if (this.item.type === "equipment") { 
            const drLocations = this.item._source?.system?.dr_locations || this.item.system.dr_locations || {};
            const drLocationOptions = this.item._source?.system?.dr_location_options || this.item.system.dr_location_options || {};
            const resolvedDrLocations = context.equipmentResolution?.drLocations || drLocations;
            const allLocationsOption = {
                id: "all",
                name: game.i18n.localize("GUM.Equipment.Protection.AllLocations")
            };
            const actorAdditionalLocations = Object.entries(this.item.actor?.system?.combat?.additional_locations || {})
                .map(([id, definition]) => ({ id, name: definition?.label || definition?.name || id, label: definition?.label || definition?.name || id }));
            const seenLocationIds = new Set();
            const originalBodyLocationOptions = [allLocationsOption, ...listBodyLocations(), ...actorAdditionalLocations]
                .filter(option => {
                    if (!option?.id || seenLocationIds.has(option.id)) return false;
                    seenLocationIds.add(option.id);
                    return true;
                });
            const bodyLocationOptions = originalBodyLocationOptions.map(localizeEquipmentLocation);
            const locationLookup = new Map(bodyLocationOptions.map(option => [option.id, option])); 
 
            context.bodyLocationOptions = bilingualLocationOptions(originalBodyLocationOptions, bodyLocationOptions, game.i18n.lang);
            context.drLocationRows = Object.entries(drLocations)
                .filter(([, drObject]) => this._hasVisibleDR(drObject))
                .map(([key, drObject]) => {
                    const option = locationLookup.get(key); 
                    return { 
                        key, 
                        label: option?.name ?? key, 
                        dr: this._formatDRObjectToString(drObject),
                        providesLocation: drLocationOptions?.[key]?.provides_location !== false,
                        finalDr: this._formatDRObjectToString(resolvedDrLocations[key] || {}),
                        changed: JSON.stringify(drObject) !== JSON.stringify(resolvedDrLocations[key] || {})
                    };
                });
            context.derivedDrLocationRows = Object.keys(resolvedDrLocations)
                .filter(key => !Object.prototype.hasOwnProperty.call(drLocations, key) && this._hasVisibleDR(resolvedDrLocations[key]))
                .map(key => ({ key, label: locationLookup.get(key)?.name ?? key, finalDr: this._formatDRObjectToString(resolvedDrLocations[key]) }));
        } 
 
        // ======================================================= 
        // 3. CUSTO DE VANTAGENS 
        // ======================================================= 
        if (['advantage', 'disadvantage', 'power'].includes(this.item.type)) { 
            context.calculatedCost = calculateItemTraitCost(this.item);
        } 
 
        // ======================================================= 
        // 4. PREPARAÇÃO DE EFEITOS 
        // ======================================================= 
        const _prepareLinkedItems = async (sourceObject) => {        
            const entries = Object.entries(sourceObject || {}); 
            const promises = entries.map(async ([id, linkData]) => { 
                const uuid = linkData.effectUuid || linkData.uuid;  
                const originalItem = await fromUuid(uuid).catch(() => null); 
                return { 
                    id: id, 
                    uuid: uuid, 
                    ...linkData, 
                    name: originalItem ? originalItem.name : "Item não encontrado/excluído", 
                    img: originalItem ? originalItem.img : "icons/svg/mystery-man.svg" 
                }; 
            }); 
            return Promise.all(promises); 
        }; 
 
        context.system.preparedEffects = { 
            activation: { 
                success: await _prepareLinkedItems(this.item.system.activationEffects?.success), 
                failure: await _prepareLinkedItems(this.item.system.activationEffects?.failure) 
            }, 
            onDamage: await _prepareLinkedItems(this.item.system.onDamageEffects), 
            general: await _prepareLinkedItems(this.item.system.generalConditions), 
            passive: await _prepareLinkedItems(this.item.system.passiveEffects), 
            useEvent: await _prepareLinkedItems(this.item.system.useEventEffects),
            stateGroups: await Promise.all(Object.entries(this.item.system.stateEffectGroups || {}).map(async ([id, group]) => ({
                id,
                ...group,
                effects: await _prepareLinkedItems(group.effects),
                isManual: ["manual", "equipped_manual"].includes(group.mode || "manual")
            })))
        };
 
        // ======================================================= 
        // 5. LISTA DE MODIFICADORES 
        // ======================================================= 
        const modifiersObj = this.item.system.modifiers || {}; 
        const modifiersArray = Object.entries(modifiersObj).map(([id, data]) => { 
            const isLimitation = (data.cost || "").includes('-'); 
            return { id, ...data, isLimitation: isLimitation }; 
        }); 
         
        modifiersArray.sort((a, b) => { 
            const costA = String(a.cost || "");
            const costB = String(b.cost || "");
            if (costB !== costA) return costA.localeCompare(costB);
            return a.name.localeCompare(b.name); 
        }); 
        context.sortedModifiers = modifiersArray; 
 
        if (this.item.type === "gm_modifier") { 
            context.gmRollContextOptions = ROLL_CONTEXT_OPTIONS;
            context.gmModifierCategoryOptions = GM_MODIFIER_CATEGORY_OPTIONS; 
            const rawEntries = Array.isArray(this.item.system.modifier_entries) ? this.item.system.modifier_entries : []; 
            context.gmModifierEntries = rawEntries.length 
                ? rawEntries.map((entry, index) => ({ 
                    index,
                    displayIndex: index + 1, 
                    label: entry?.label || "", 
                    value: entry?.value ?? 0, 
                    nh_cap: entry?.nh_cap ?? entry?.cap ?? "", 
                    contexts: Array.isArray(entry?.contexts) ? entry.contexts.join(",") : (entry?.contexts || "all") 
                })) 
                : [{ 
                    index: 0,
                    displayIndex: 1, 
                    label: "", 
                    value: this.item.system.modifier ?? 0, 
                    nh_cap: this.item.system.nh_cap ?? "", 
                    contexts: "all" 
                }]; 
        } 
 
        return context;  
    } 
 
    /* -------------------------------------------- */ 
    /* Listeners e Callbacks                       */ 
    /* -------------------------------------------- */ 
 
 async _onAddItemSocial(event) {
   event.preventDefault();
   const id = foundry.utils.randomID();
   this._socialContributionOpenState ??= new Map();
   this._socialContributionOpenState.set(id, true);
   await this.item.update({ [`system.social_contributions.${id}`]: { type: "status" } });
 }

 async _onDeleteItemSocial(event) {
   event.preventDefault();
   this._socialContributionOpenState?.delete(event.currentTarget.dataset.id);
   await this.item.update({ [`system.social_contributions.-=${event.currentTarget.dataset.id}`]: null });
 }

 async _onChangeItemSocialType(event) {
   const row = event.currentTarget.closest("[data-id]");
   await this.item.update({ [`system.social_contributions.${row.dataset.id}`]: { type: event.currentTarget.value } });
 }

    activateListeners(html) {
        super.activateListeners(html);
        this._activateItemAttachmentDropzones(html);
        this._bindHeaderNameAutosize(html); 
 
        html.on('click', '.open-reference-link', this._onOpenReferenceLink.bind(this)); 
        if (!this.isEditable) return;
        const saveItemAlias = async () => {
            const input = html.find(".item-alias-input");
            const value = String(input.val() || "").replace(/\s+/g, " ").trim();
            if (!value) return;
            const aliases = normalizeItemAliases(this.item.system?.aliases);
            const editIndexRaw = input.attr("data-edit-index");
            const editIndex = editIndexRaw === undefined ? -1 : Number(editIndexRaw);
            const normalized = normalizeItemName(value);
            const canonicalNames = [
                this.item.name,
                this.item.system?.specialization
                    ? `${this.item.name} (${this.item.system.specialization})`
                    : ""
            ].map(normalizeItemName).filter(Boolean);
            if (canonicalNames.includes(normalized)) {
                return ui.notifications.warn(game.i18n.localize("GUM.ItemAliases.CanonicalDuplicate"));
            }
            const duplicateIndex = aliases.findIndex((alias, index) => index !== editIndex && normalizeItemName(alias) === normalized);
            if (duplicateIndex >= 0) {
                return ui.notifications.warn(game.i18n.localize("GUM.ItemAliases.Duplicate"));
            }
            if (editIndex >= 0 && editIndex < aliases.length) aliases[editIndex] = value;
            else aliases.push(value);
            await this.item.update({ "system.aliases": normalizeItemAliases(aliases) });
        };
        html.on("click", ".add-item-alias", async event => {
            event.preventDefault();
            await saveItemAlias();
        });
        html.on("keydown", ".item-alias-input", async event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            await saveItemAlias();
        });
        html.on("click", ".edit-item-alias", event => {
            event.preventDefault();
            const button = $(event.currentTarget);
            const input = html.find(".item-alias-input");
            input.val(button.attr("data-alias") || "");
            input.attr("data-edit-index", button.attr("data-index"));
            input.trigger("focus");
            html.find(".add-item-alias").addClass("is-editing").attr("title", game.i18n.localize("GUM.ItemAliases.SaveEdit"));
        });
        html.on("click", ".remove-item-alias", async event => {
            event.preventDefault();
            event.stopPropagation();
            const index = Number(event.currentTarget.dataset.index);
            const aliases = normalizeItemAliases(this.item.system?.aliases);
            if (!Number.isInteger(index) || index < 0 || index >= aliases.length) return;
            aliases.splice(index, 1);
            await this.item.update({ "system.aliases": aliases });
        });
        html.on("click", ".add-item-social", this._onAddItemSocial.bind(this));
        html.on("click", ".delete-item-social", this._onDeleteItemSocial.bind(this));
        html.on("change", ".item-social-type", this._onChangeItemSocialType.bind(this));
        html.on("click", ".add-magic-consumption-group", async event => {
            event.preventDefault();
            const groupId = foundry.utils.randomID();
            const sourceId = foundry.utils.randomID();
            await this.item.update({ [`system.consumptionGroups.${groupId}`]: {
                id: groupId,
                name: game.i18n.localize("GUM.MagicConsumption.DefaultGroup"),
                trigger: "attempt",
                amount: "1",
                variableAmount: false,
                confirm: true,
                sources: { [sourceId]: { id: sourceId, type: "fp", name: "" } }
            }});
        });
        html.on("click", ".delete-magic-consumption-group", async event => {
            event.preventDefault();
            const groupId = event.currentTarget.closest("[data-consumption-group-id]")?.dataset.consumptionGroupId;
            if (groupId) await this.item.update({ [`system.consumptionGroups.-=${groupId}`]: null });
        });
        html.on("click", ".add-magic-consumption-source", async event => {
            event.preventDefault();
            const groupId = event.currentTarget.closest("[data-consumption-group-id]")?.dataset.consumptionGroupId;
            if (!groupId) return;
            const sourceId = foundry.utils.randomID();
            await this.item.update({ [`system.consumptionGroups.${groupId}.sources.${sourceId}`]: { id: sourceId, type: "fp", name: "" } });
        });
        html.on("click", ".delete-magic-consumption-source", async event => {
            event.preventDefault();
            const groupId = event.currentTarget.closest("[data-consumption-group-id]")?.dataset.consumptionGroupId;
            const sourceId = event.currentTarget.closest("[data-consumption-source-id]")?.dataset.consumptionSourceId;
            if (groupId && sourceId) await this.item.update({ [`system.consumptionGroups.${groupId}.sources.-=${sourceId}`]: null });
        });
        const updateMagicConsumptionSourceNameState = sourceRow => {
            const sourceType = String(sourceRow.find(".magic-consumption-source-type").val() || "");
            const nameInput = sourceRow.find(".magic-consumption-source-name");
            const acceptsName = !["hp", "fp"].includes(sourceType);
            nameInput.prop("disabled", !acceptsName);
            sourceRow.toggleClass("is-name-disabled", !acceptsName);
            if (!acceptsName) sourceRow.find(".magic-consumption-source-key").val("");
        };
        const updateMagicConsumptionSourceKey = (sourceRow, { force = false } = {}) => {
            const keyInput = sourceRow.find(".magic-consumption-source-key");
            if (!force && String(keyInput.val() || "").trim()) return;
            const sourceType = String(sourceRow.find(".magic-consumption-source-type").val() || "");
            const sourceName = String(sourceRow.find(".magic-consumption-source-name").val() || "").trim();
            if (["hp", "fp"].includes(sourceType) || !sourceName) {
                keyInput.val("");
                return;
            }
            const matches = html.find("#magic-consumption-source-names option").toArray().filter(option => (
                String(option.dataset.sourceType || "") === sourceType
                && String(option.value || "").trim() === sourceName
            ));
            keyInput.val(matches.length === 1 ? String(matches[0].dataset.sourceKey || "") : "");
        };
        html.find(".magic-consumption-source").each((_index, element) => {
            const sourceRow = $(element);
            updateMagicConsumptionSourceNameState(sourceRow);
            updateMagicConsumptionSourceKey(sourceRow);
        });
        html.on("change", ".magic-consumption-source-type", event => {
            const sourceRow = $(event.currentTarget).closest(".magic-consumption-source");
            updateMagicConsumptionSourceNameState(sourceRow);
            updateMagicConsumptionSourceKey(sourceRow, { force: true });
        });
        html.on("input change", ".magic-consumption-source-name", event => {
            updateMagicConsumptionSourceKey($(event.currentTarget).closest(".magic-consumption-source"), { force: true });
        });
        html.find(".item-social-contribution").on("toggle", event => {
            const contribution = event.currentTarget;
            this._socialContributionOpenState ??= new Map();
            this._socialContributionOpenState.set(contribution.dataset.id, contribution.open);
        });
 
        // Auto-Cálculo 
        html.find('input[name="system.auto_points"], select[name="system.difficulty"], input[name="system.skill_level"], select[name="system.cost_mode"], input[name="system.cost_per_level"], select[name="system.tree_hierarchy_type"], input[name="system.tree_skill_level"], input[name="system.tree_points_per_level"]').on('change', this._onAutoCalcPoints.bind(this));

        const toggleSkillBaseAttribute = (select) => {
            const selector = select.data('custom-target');
            const customField = selector ? html.find(selector) : select.closest('.skill-compact-controls, .form-group').find('.skill-base-attribute-custom');
            const selected = select.val();
            const usesCustomBase = ["skill", "spell", "power", "custom"].includes(selected);
            const placeholder = ({
                skill: game.i18n.localize("GUM.SpellPower.PlaceholderBaseSkill"),
                spell: game.i18n.localize("GUM.SpellPower.PlaceholderBaseSpell"),
                power: game.i18n.localize("GUM.SpellPower.PlaceholderBasePower"),
                custom: game.i18n.localize("GUM.SpellPower.PlaceholderCustomValue")
            })[selected] || "";
            customField.prop('disabled', !usesCustomBase);
            customField.toggleClass('is-disabled', !usesCustomBase);
            if (placeholder) customField.attr('placeholder', placeholder);
 };
        html.find('.skill-base-attribute-select').each((_idx, el) => {
            const select = $(el);
            toggleSkillBaseAttribute(select);
            select.on('change', () => toggleSkillBaseAttribute(select));
        });

        const toggleSpellLinearPoints = () => {
            const isLinear = html.find('.spell-difficulty-select').val() === "linear";
            html.find('.spell-linear-points')
                .prop('disabled', !isLinear)
                .toggleClass('is-disabled', !isLinear);
        };
        html.find('.spell-difficulty-select').on('change', toggleSpellLinearPoints);
        toggleSpellLinearPoints();

        const toggleAttackFields = (toggleSelector) => {
            const toggle = html.find(toggleSelector);
            const grid = toggle.closest('.spell-power-attack-grid');
            const usesAttack = toggle.is(':checked');
            const attackType = grid.find('.spell-power-attack-type').val() || "ranged";

            grid.find('.spell-power-attack-type, input[name="system.attack_roll.skill_name"], input[name="system.attack_roll.skill_level_mod"], input[name="system.attack_roll.min_strength"]')
                .prop('disabled', !usesAttack)
                .toggleClass('is-disabled', !usesAttack);
            grid.find('.spell-power-attack-common-fields').toggleClass('is-hidden', !usesAttack);

            grid.find('.spell-power-attack-type-fields').each((_index, element) => {
                const fields = $(element);
                const isActiveType = fields.data('attackFields') === attackType;
                fields.toggleClass('is-hidden', !usesAttack || !isActiveType);
                fields.find('input, select').prop('disabled', !usesAttack || !isActiveType);
            });
        };

        const bindAttackFields = (toggleSelector) => {
            const toggle = html.find(toggleSelector);
            const grid = toggle.closest('.spell-power-attack-grid');
            toggle.on('change', () => toggleAttackFields(toggleSelector));
            grid.find('.spell-power-attack-type').on('change', () => toggleAttackFields(toggleSelector));
            toggleAttackFields(toggleSelector);
        };
        bindAttackFields('.spell-uses-attack-toggle');

        const togglePowerLinearPoints = () => {
            const isLinear = html.find('.power-difficulty-select').val() === "linear";
            html.find('.power-linear-points')
                .prop('disabled', !isLinear)
                .toggleClass('is-disabled', !isLinear);
        };
        html.find('.power-difficulty-select').on('change', togglePowerLinearPoints);
        togglePowerLinearPoints();

        bindAttackFields('.power-uses-attack-toggle');

        const updateTraitCostLevelState = () => {
            html.find('[data-trait-cost-editor]').each((_index, element) => {
                const editor = $(element);
                const canLevel = editor.find('.trait-cost-can-level').is(':checked');
                editor.find('.trait-cost-level-dependent').prop('disabled', !canLevel);
                editor.find('.trait-cost-level-card')
                    .toggleClass('is-cost-disabled', !canLevel)
                    .attr('aria-disabled', String(!canLevel));
            });
        };
        html.find('.trait-cost-can-level').on('change', updateTraitCostLevelState);
        updateTraitCostLevelState();

        const updateModifierCostState = () => {
            html.find('[data-modifier-cost-editor]').each((_index, element) => {
                const editor = $(element);
                const costText = String(editor.find('.modifier-cost-input').val() ?? '').trim();
                const isMultiplier = /^(?:x|×)/i.test(costText);
                const ignoresLevel = editor.find('.modifier-ignore-level').is(':checked');
                const useTraitLevel = editor.find('.modifier-use-trait-level').is(':checked');

                editor.find('.modifier-affects-select').prop('disabled', isMultiplier);
                editor.find('.modifier-affects-card')
                    .toggleClass('is-cost-disabled', isMultiplier)
                    .attr('aria-disabled', String(isMultiplier));

                editor.find('.modifier-use-trait-level').prop('disabled', ignoresLevel);
                editor.find('.modifier-use-trait-level').closest('.modifier-cost-toggle')
                    .toggleClass('is-cost-disabled', ignoresLevel)
                    .attr('aria-disabled', String(ignoresLevel));

                const disableOwnLevel = ignoresLevel || useTraitLevel;
                editor.find('.modifier-level-input').prop('disabled', disableOwnLevel);
                editor.find('.modifier-level-card')
                    .toggleClass('is-cost-disabled', disableOwnLevel)
                    .attr('aria-disabled', String(disableOwnLevel));
            });
        };
        html.find('.modifier-cost-input, .modifier-use-trait-level, .modifier-ignore-level')
            .on('input change', updateModifierCostState);
        updateModifierCostState();


        const updateTreeParentState = (select) => {
            const type = (select.val() || "normal").toString();
            const config = {
                normal: { enabled: false, placeholder: "Não usa árvore", filter: "" },
                trunk: { enabled: false, placeholder: "Tronco não possui pai", filter: "" },
                branch: { enabled: true, placeholder: "Nome do tronco pai", filter: "trunk" },
                twig: { enabled: true, placeholder: "Nome do galho/ramo pai", filter: "branch" },
                leaf: { enabled: true, placeholder: "Nome do pai imediato", filter: "twig|branch" }
            }[type] || { enabled: false, placeholder: "Não usa árvore", filter: "" };
            const wrapper = select.closest('.tree-parent-control');
            const input = wrapper.find('.tree-parent-input');
            const link = wrapper.find('.tree-parent-link');
            input.prop('disabled', !config.enabled).attr('placeholder', config.placeholder);
            link.toggleClass('disabled', !config.enabled).attr('data-skill-filter', config.filter);

            const pointsPerLevelInput = html.find('input[name="system.tree_points_per_level"]');
            if (pointsPerLevelInput.length) {
                const defaultValues = ["7", "3", "2", "1"];
                const currentValue = (pointsPerLevelInput.val() ?? "").toString().trim();
                const defaultValue = this._getTreePointsPerLevelDefault(type);
                if (defaultValue !== "" && (!currentValue || defaultValues.includes(currentValue))) {
                    pointsPerLevelInput.val(defaultValue);
                }
            }
        };
        html.find('.tree-hierarchy-select').each((_idx, el) => {
            const select = $(el);
            updateTreeParentState(select);
            select.on('change', () => updateTreeParentState(select));
        });
 
          // Ajuste de Valor (+/-) 
        html.find('.adjust-value').click(ev => { 
            ev.preventDefault(); 
            const btn = $(ev.currentTarget); 
            const action = btn.data('action'); 
            const targetField = btn.data('target');  
            let currentLevel = foundry.utils.getProperty(this.item, targetField) || 0; 
            let newLevel = action === 'increase' ? currentLevel + 1 : currentLevel - 1; 
             
            // Sincroniza o input na tela antes do update (evita ler valor antigo no formulário) 
            const input = this.form?.querySelector(`input[name="${targetField}"]`); 
            if (input) input.value = newLevel; 
 
            const sys = this.item.system; 
            const updateData = { [targetField]: newLevel }; 
 
            // Recalcula pontos automaticamente (aplicado em magias/poderes também) 
            if (sys.auto_points !== false && targetField === "system.skill_level") { 
                const pointsField = (this.item.type === 'power') ? "system.points_skill" : "system.points"; 
                const costMode = sys.difficulty === "linear" ? "linear" : (sys.cost_mode || "standard"); 
                if (costMode === 'linear') { 
                    const cost = Number(sys.cost_per_level) || 1; 
                    updateData[pointsField] = Math.max(0, newLevel * cost); 
                } else { 
                    const diff = sys.difficulty || "A";  
                    const newPoints = this._calculateSkillPoints(diff, newLevel); 
                    updateData[pointsField] = newPoints; 
                } 
            }

            if (sys.auto_points !== false && targetField === "system.tree_skill_level") {
                const pointsPerLevelInput = this.form?.querySelector('input[name="system.tree_points_per_level"]');
                const pointsPerLevel = pointsPerLevelInput?.value ?? sys.tree_points_per_level ?? this._getTreePointsPerLevelDefault(sys.tree_hierarchy_type);
                const newTreePoints = this._calculateTreeSkillPoints(newLevel, pointsPerLevel);
                updateData["system.tree_points"] = newTreePoints;

                // Atualiza imediatamente o campo desabilitado para refletir os botões +/- antes do rerender.
                const treePointsInput = this.form?.querySelector('input[name="system.tree_points"]');
                if (treePointsInput) treePointsInput.value = newTreePoints;
            } 
            this.item.update(updateData); 
        }); 
if (this.item?.type === "gm_modifier") { 
            this._activateGmModifierBehaviors(html); 
 
            const normalizeCsv = value => normalizeContextCsv(value, ROLL_CONTEXT_OPTIONS);
 
            html.on('change blur', '.context-csv-input', (ev) => { 
                ev.currentTarget.value = normalizeCsv(ev.currentTarget.value); 
            }); 
 
            html.on('click', '.open-context-picker', (ev) => { 
                ev.preventDefault(); 
                const targetInputName = ev.currentTarget.dataset.targetInput; 
                const input = this.form?.querySelector(`[name="${targetInputName}"]`); 
                if (!input) return; 
                const selected = new Set(normalizeCsv(input.value).split(',').filter(Boolean)); 
 
                const content = `<div class="gum-context-picker">${ROLL_CONTEXT_OPTIONS.map(opt => ` 
                    <label class="gm-checkbox" style="display:flex; gap:6px; margin:2px 0;"> 
                        <input type="checkbox" name="ctx" value="${opt.id}" ${selected.has(opt.id) ? "checked" : ""}/> 
                        <span>${opt.label} <small style="opacity:.7">(${opt.id})</small></span> 
                    </label>`).join('')}</div>`; 
 
                new Dialog({ 
                    title: "Selecionar Contextos", 
                    content, 
                    buttons: { 
                        ok: { 
                            icon: '<i class="fas fa-check"></i>', 
                            label: 'Aplicar', 
                            callback: (dlgHtml) => { 
                                const checked = dlgHtml.find('input[name="ctx"]:checked').toArray().map(el => el.value); 
                                input.value = normalizeCsv(checked.join(',')); 
                            } 
                        }, 
                        cancel: { icon: '<i class="fas fa-times"></i>', label: 'Cancelar' } 
                    }, 
                    default: 'ok' 
                }).render(true); 
            }); 
 
            html.on("click", ".add-gm-mod-entry", async (ev) => { 
                ev.preventDefault(); 
                const entries = Array.isArray(this.item.system.modifier_entries) ? foundry.utils.deepClone(this.item.system.modifier_entries) : []; 
                entries.push({ label: "", value: "0", nh_cap: "", contexts: "all" }); 
                await this.item.update({ "system.modifier_entries": entries }); 
            }); 
 
            html.on("click", ".remove-gm-mod-entry", async (ev) => { 
                ev.preventDefault(); 
                const index = Number(ev.currentTarget.dataset.index); 
                const entries = Array.isArray(this.item.system.modifier_entries) ? foundry.utils.deepClone(this.item.system.modifier_entries) : []; 
                if (Number.isNaN(index) || index < 0 || index >= entries.length) return; 
                entries.splice(index, 1); 
                await this.item.update({ "system.modifier_entries": entries.length ? entries : [{ label: "", value: "0", nh_cap: "", contexts: "all" }] }); 
            }); 
        } 
 
        // Editor de Descrição 
        html.find(".toggle-editor").on("click", ev => { 
            ev.preventDefault(); 
            ev.stopPropagation(); 
            const section = $(ev.currentTarget).closest(".description-section"); 
            const field = $(ev.currentTarget).data("field"); 
            const editorWrapper = section.find(".description-editor"); 
            section.find(".description-view, .toggle-editor").hide(); 
            editorWrapper.show(); 
            const editor = this._getEditorInstance(field); 
            if (editor?.focus) { 
                // Aguarda o próximo tick para garantir que o editor esteja visível antes do foco 
                setTimeout(() => editor.focus(), 0); 
            } else if (editor?.view?.focus) { 
                setTimeout(() => editor.view.focus(), 0); 
            } 
        }); 
        html.find(".expand-description").on("click", ev => { 
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
        html.find(".cancel-description").on("click", ev => { 
            const section = $(ev.currentTarget).closest(".description-section"); 
            section.find(".description-editor").hide(); 
            section.find(".description-view, .toggle-editor").show(); 
        }); 
        html.find(".save-description").on("click", async ev => { 
            ev.preventDefault(); 
            const btn = $(ev.currentTarget); 
            const section = btn.closest(".description-section"); 
            const field = btn.data("field"); 
            const content = await this._getEditorContent(field, section); 
            if (content === null || content === undefined) return; 
            await this.item.update({[field]: content}); 
             
            const enriched = await TextEditorImpl.enrichHTML(content, {async: true}); 
            section.find(".description-view").html(enriched); 
            section.find(".description-editor").hide(); 
            section.find(".description-view, .toggle-editor").show(); 
        }); 
 
if (this.item?.type === "equipment") { 
            html.on("click", ".add-dr-location", () => { 
                this._addDrLocationRow(html); 
            }); 
 
            html.on("click", ".dr-location-delete", async (ev) => { 
                ev.preventDefault(); 
                ev.stopPropagation(); 
                ev.currentTarget.closest("[data-dr-location-row]")?.remove(); 
                const drLocations = this._collectDRLocationsFromForm();
                await this.object.update({
                    ...this._buildDRLocationsUpdate(drLocations),
                    ...this._buildDRLocationOptionsUpdate(this._collectDRLocationOptionsFromForm(drLocations))
                });
            }); 
 
            html.on("change", ".dr-location-label", (ev) => { 
                this._syncDrLocationKey(ev.currentTarget); 
            }); 
            html.on("change", ".dr-location-provides", async () => {
                const drLocations = this._collectDRLocationsFromForm();
                await this.object.update({
                    ...this._buildDRLocationsUpdate(drLocations),
                    ...this._buildDRLocationOptionsUpdate(this._collectDRLocationOptionsFromForm(drLocations))
                });
            });
        } 
 
        // Adicionar/Remover Ataques 
        html.find('.add-attack').click(this._onAddAttack.bind(this)); 
        html.find('.delete-attack').click(this._onDeleteAttack.bind(this)); 
         
        // Vincular Perícia 
        html.find('.link-skill-button').click(this._onLinkSkill.bind(this)); 
 
        // Modificadores de Equipamento 
        html.find('.add-eqp-modifier').click(ev => { 
            ev.preventDefault(); 
            new EqpModifierBrowser(this.item).render(true); 
        }); 
 html.find('.delete-eqp-modifier').click(async ev => { 
            ev.preventDefault(); 
            const modId = $(ev.currentTarget).closest('[data-modifier-id]').data('modifier-id'); 
            if (!modId) return; 
            const confirmed = await Dialog.confirm({ 
                title: "Remover modificador de equipamento", 
                content: "<p>Tem certeza que deseja remover este modificador?</p>" 
            }); 
            if (!confirmed) return; 
            await this.item.update({ [`system.eqp_modifiers.-=${modId}`]: null }); 
        }); 
        html.find('.view-eqp-modifier').click(this._onViewEqpModifier.bind(this));
        html.find('.add-eqp-feature').click(async ev => {
            ev.preventDefault();
            const id = foundry.utils.randomID();
            await this.item.update({ [`system.features_data.${id}`]: {
                id, label: "Nova feature", enabled: true, type: "equipment_property",
                path: "item_dr", operation: "add", value: 0, per_level: false,
                attack_type: "all", selector_field: "all", selector_value: "", attack: {},
                effect_uuid: "", effect_domain: "wearer", lifecycle: "while_equipped"
            }});
        });
        html.find('.delete-eqp-feature').click(async ev => {
            ev.preventDefault();
            const id = $(ev.currentTarget).closest('[data-feature-id]').data('feature-id');
            if (!id) return;
            await this.item.update({ [`system.features_data.-=${id}`]: null });
        });
        html.find('.eqp-feature-shape-select').on('change', async ev => {
            const select = ev.currentTarget;
            if (select.name?.endsWith('.type') && this.item.type === 'eqp_modifier'
                && ['ammunition_property', 'create_ammunition'].includes(select.value)) {
                const id = $(select).closest('[data-feature-id]').data('feature-id');
                await this.submit({ preventClose: true, preventRender: true });
                if (id && select.value === 'ammunition_property') {
                    await this.item.update({ [`system.features_data.${id}.path`]: 'attack_modifier', [`system.features_data.${id}.operation`]: 'set', [`system.features_data.${id}.value`]: 0 });
                } else this.render(false);
                return;
            }
            if (select.name?.endsWith('.path') && this.item.type === 'eqp_modifier') {
                const id = $(select).closest('[data-feature-id]').data('feature-id');
                const feature = this.item.system.features_data?.[id];
                if (id && feature?.type === 'ammunition_property') {
                    const path = select.value;
                    const value = path === 'enabled' ? 'true'
                        : path.endsWith('.operation') ? 'replace'
                        : ["attack_modifier", "low_warning"].includes(path) || path.endsWith('.armor_divisor') ? 0 : '';
                    await this.submit({ preventClose: true, preventRender: true });
                    await this.item.update({ [`system.features_data.${id}.value`]: value, [`system.features_data.${id}.operation`]: 'set' });
                    return;
                }
            }
            await this.submit({ preventClose: true });
        });
        html.find('.eqp-feature-conditional-select').on('change', async () => {
            await this.submit({ preventClose: true });
        });
        html.find('.select-eqp-feature-effect').click(async ev => {
            ev.preventDefault();
            const id = $(ev.currentTarget).closest('[data-feature-id]').data('feature-id');
            if (!id) return;
            await this.submit({ preventClose: true, preventRender: true });
            new EffectBrowser(this.item, {
                onSelect: async selectedEffects => {
                    const effect = selectedEffects[0];
                    if (!effect) return;
                    await this.item.update({
                        [`system.features_data.${id}.effect_uuid`]: effect.uuid,
                        [`system.features_data.${id}.effect_name`]: effect.name,
                        [`system.features_data.${id}.effect_img`]: effect.img
                    });
                    if (selectedEffects.length > 1) ui.notifications.info("Somente o primeiro efeito selecionado foi vinculado à feature.");
                }
            }).render(true);
        });
        html.find('.view-eqp-feature-effect').click(async ev => {
            ev.preventDefault();
            const uuid = $(ev.currentTarget).data('uuid');
            if (!uuid) return ui.notifications.warn("Esta feature ainda não possui um Efeito vinculado.");
            const effect = await fromUuid(uuid).catch(() => null);
            if (!effect) return ui.notifications.warn("O Efeito vinculado não foi encontrado.");
            effect.sheet?.render(true);
        });
 
        // Modificadores (Vantagens) 
        html.find('.add-modifier').click(ev => { 
            ev.preventDefault(); 
            new ModifierBrowser(this.item).render(true); 
        }); 
html.find('.delete-modifier').click(async ev => { 
            ev.preventDefault(); 
            const modId = $(ev.currentTarget).data('modifier-id'); 
            if (!modId) return; 
            const confirmed = await Dialog.confirm({ 
                title: "Remover modificador", 
                content: "<p>Tem certeza que deseja remover este modificador?</p>" 
            }); 
            if (!confirmed) return; 
            await this.item.update({ [`system.modifiers.-=${modId}`]: null }); 
        }); 
        html.find('.view-modifier').click(async ev => { 
            ev.preventDefault(); 
            const modId = $(ev.currentTarget).data('modifier-id'); 
            const modifierData = this.item.system.modifiers?.[modId]; 
            if (!modifierData) return; 
            if (modifierData.source_id) { 
                const sourceItem = await fromUuid(modifierData.source_id).catch(() => null); 
                if (sourceItem?.sheet) return sourceItem.sheet.render(true); 
            } 
 
            const createTag = (label, value) => value ? `<div class="property-tag"><label>${label}</label><span>${value}</span></div>` : ""; 
            const tags = [ 
                createTag("Custo", modifierData.cost), 
                createTag("Referência", modifierData.ref), 
                createTag("Efeito", modifierData.applied_effect) 
            ].join(""); 
            const description = await TextEditorImpl.enrichHTML(modifierData.description || "<i>Sem descrição.</i>", { async: true }); 
            const content = ` 
                <div class="gurps-dialog-canvas"> 
                    <div class="gurps-item-preview-card"> 
                        <header class="preview-header"> 
                            <h3>${modifierData.name || "Modificador"}</h3> 
                            <div class="header-controls"><span class="preview-item-type">Modificador</span></div> 
                        </header> 
                        <div class="preview-content"> 
                            <div class="preview-properties">${tags}</div> 
                            <hr class="preview-divider"> 
                            <div class="preview-description">${description}</div> 
                        </div> 
                    </div> 
                </div> 
            `; 
            new Dialog({ 
                title: `Detalhes: ${modifierData.name || "Modificador"}`, 
                content, 
                buttons: { close: { label: "Fechar" } }, 
                default: "close", 
                options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 420 } 
            }).render(true); 
        }); 
         
        // Efeitos
        html.find('.add-state-effect-group').click(async ev => {
            ev.preventDefault();
            const id = foundry.utils.randomID();
            await this.item.update({ [`system.stateEffectGroups.${id}`]: {
                id, name: "Novo grupo", mode: "manual", active: false,
                runtimeActive: false, exclusiveSet: "", effects: {}
            }});
        });
        html.find('.delete-state-effect-group').click(async ev => {
            ev.preventDefault();
            const id = $(ev.currentTarget).closest('[data-state-group-id]').data('state-group-id');
            if (!id) return;
            const confirmed = await Dialog.confirm({ title: "Excluir grupo", content: "<p>Excluir este grupo e desativar seus efeitos?</p>" });
            if (confirmed) await this.item.update({ [`system.stateEffectGroups.-=${id}`]: null });
        });
        html.find('.add-effect').click(async (ev) => {
            const targetList = $(ev.currentTarget).data('target-list'); 
            new EffectBrowser(this.item, { 
                onSelect: (selectedEffects) => { 
                    const updates = {}; 
                    for (const effect of selectedEffects) { 
                        const newId = foundry.utils.randomID(); 
                        const effectEntry = { id: newId, effectUuid: effect.uuid, recipient: 'target', name: effect.name, img: effect.img }; 
                        if (targetList === "useEventEffects") { 
                            effectEntry.useEventTrigger = "consume"; 
                        } 
                        updates[`system.${targetList}.${newId}`] = effectEntry; 
                    } 
                    this.item.update(updates); 
                } 
            }).render(true); 
        }); 
       html.find('.delete-effect').click(async ev => { 
            ev.preventDefault(); 
            const target = $(ev.currentTarget); 
            const entry = target.closest('[data-list-name][data-effect-id]'); 
            const listName = entry.data('list-name'); 
            const effectId = entry.data('effect-id'); 
            if (!listName || !effectId) return; 
            const confirmed = await Dialog.confirm({ 
                title: "Remover efeito", 
                content: "<p>Tem certeza que deseja remover este efeito?</p>" 
            }); 
            if (!confirmed) return; 
            await this.item.update({ [`system.${listName}.-=${effectId}`]: null }); 
        }); 
        html.find('.view-original-effect, .view-original-condition').click(async ev => { 
            ev.preventDefault(); 
            const uuid = $(ev.currentTarget).data('uuid'); 
            if (!uuid) return ui.notifications.warn("Nenhum item vinculado foi encontrado."); 
            const linkedItem = await fromUuid(uuid).catch(() => null); 
            if (!linkedItem) return ui.notifications.warn("Item vinculado não encontrado."); 
            linkedItem.sheet?.render(true); 
        }); 
        html.find('.add-general-condition').click(ev => { 
             new ConditionBrowser(this.item, { 
                onSelect: (selectedConditions) => { 
                    const updates = {}; 
                    for (const condition of selectedConditions) { 
                        const newId = foundry.utils.randomID(); 
                        updates[`system.generalConditions.${newId}`] = { id: newId, uuid: condition.uuid, name: condition.name, img: condition.img }; 
                    } 
                    this.item.update(updates); 
                } 
            }).render(true); 
        }); 
         
        // Modo Edição de Ataque 
        html.find('.edit-attack-mode').click(ev => {
            ev.preventDefault(); 
            this._onEditAttack(ev); 
        });
        html.find('.choose-attack-ammunition').click(ev => this._chooseAttackAmmunition(ev));
        html.find('.ammunition-enabled-toggle').on('change', ev => {
            html.find('.ammunition-options').toggleClass('is-hidden', !ev.currentTarget.checked);
        });
 
        const saveAttackHandler = this._onSaveAttackMode ? this._onSaveAttackMode.bind(this) : null; 
        if (saveAttackHandler) { 
            html.find('.save-attack-mode').click(saveAttackHandler); 
        } 
 
        const cancelAttackHandler = this._onCancelAttackEdit ? this._onCancelAttackEdit.bind(this) : null; 
        if (cancelAttackHandler) { 
            html.find('.cancel-attack-edit').click(cancelAttackHandler); 
        } 
    }

    _canUseItemAttachmentDrops() {
        if (!this.isEditable || !this.item?.isOwner) return false;
        if (game.user?.isGM) return true;
        if (!game.settings.get("gum", "allowPlayerItemAttachmentDrops")) return false;
        const minimumRole = Number(game.settings.get("gum", "itemAttachmentDropMinimumRole"));
        return Number(game.user?.role) >= minimumRole;
    }

    _activateItemAttachmentDropzones(html) {
        html.on("dragenter dragover", ".item-attachment-dropzone", event => {
            if (!this._canUseItemAttachmentDrops()) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.classList.add("is-dragover");
        });
        html.on("dragleave dragend", ".item-attachment-dropzone", event => {
            event.currentTarget.classList.remove("is-dragover");
        });
        html.on("drop", ".item-attachment-dropzone", this._onItemAttachmentDrop.bind(this));
    }

    async _onItemAttachmentDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const zone = event.currentTarget;
        zone.classList.remove("is-dragover");
        if (!this._canUseItemAttachmentDrops()) {
            return ui.notifications.warn(game.i18n.localize("GUM.ItemAttachments.NotAllowed"));
        }

        // Listeners delegated by jQuery receive a jQuery.Event; Foundry's parser
        // requires the native DragEvent and its dataTransfer payload.
        const nativeEvent = event.originalEvent ?? event;
        const data = TextEditorImpl.getDragEventData(nativeEvent);
        if (data?.type !== "Item") return;
        const source = await Item.fromDropData(data).catch(() => null);
        if (!source?.uuid || source.parent?.documentName === "Actor") {
            return ui.notifications.warn(game.i18n.localize("GUM.ItemAttachments.InvalidSource"));
        }

        const attachmentType = zone.dataset.attachmentType;
        const targetList = zone.dataset.targetList;
        const accepted = attachmentType === "effect" ? source.type === "effect"
            : attachmentType === "modifier" ? source.type === "modifier" && ["advantage", "disadvantage", "power"].includes(this.item.type)
                : attachmentType === "eqp-modifier" ? source.type === "eqp_modifier" && this.item.type === "equipment"
                    : false;
        if (!accepted) return ui.notifications.warn(game.i18n.localize("GUM.ItemAttachments.Incompatible"));

        if (attachmentType === "effect") return this._attachDroppedEffect(source, targetList);
        if (attachmentType === "modifier") return this._attachDroppedModifier(source);
        return this._attachDroppedEquipmentModifier(source);
    }

    async _attachDroppedEffect(effect, targetList) {
        if (!targetList) return;
        const id = foundry.utils.randomID();
        const entry = { id, effectUuid: effect.uuid, recipient: "target", name: effect.name, img: effect.img };
        if (targetList === "useEventEffects") entry.useEventTrigger = "consume";
        await this.item.update({ [`system.${targetList}.${id}`]: entry });
        ui.notifications.info(game.i18n.format("GUM.ItemAttachments.Added", { name: effect.name }));
    }

    async _attachDroppedModifier(modifier) {
        const id = foundry.utils.randomID();
        await this.item.update({ [`system.modifiers.${id}`]: {
            name: modifier.name, cost: modifier.system.cost, level: modifier.system.level,
            affects: modifier.system.affects, use_level_from_trait: modifier.system.use_level_from_trait,
            cost_ignores_level: modifier.system.cost_ignores_level, disabled: modifier.system.disabled,
            ref: modifier.system.ref, applied_effect: modifier.system.applied_effect,
            source_id: modifier.uuid, description: modifier.system.description
        } });
        ui.notifications.info(game.i18n.format("GUM.ItemAttachments.Added", { name: modifier.name }));
    }

    async _attachDroppedEquipmentModifier(modifier) {
        const id = foundry.utils.randomID();
        const clone = (value, fallback = {}) => foundry.utils.deepClone(value ?? fallback);
        await this.item.update({ [`system.eqp_modifiers.${id}`]: {
            id, name: modifier.name, cost_adjustment: modifier.system.cost_adjustment,
            cost_factor: modifier.system.cost_factor, weight_mod: modifier.system.weight_mod,
            enabled: modifier.system.enabled !== false, level: modifier.system.level ?? 1,
            adjustment_schema: modifier.system.adjustment_schema ?? 0,
            cost_adjustment_data: clone(modifier.system.cost_adjustment_data),
            weight_adjustment_data: clone(modifier.system.weight_adjustment_data),
            features_data: clone(modifier.system.features_data, []),
            gcs_features_unmapped: clone(modifier.system.gcs_features_unmapped, []),
            tech_level: modifier.system.tech_level, group: modifier.system.group,
            ref: modifier.system.ref, source_uuid: modifier.uuid
        } });
        ui.notifications.info(game.i18n.format("GUM.ItemAttachments.Added", { name: modifier.name }));
    }

    async _chooseAttackAmmunition(ev) {
        ev.preventDefault();
        const attackId = ev.currentTarget.dataset.attackId;
        const attack = this.item.system?.ranged_attacks?.[attackId];
        if (!attack || !this.item.actor) return ui.notifications.warn(game.i18n.localize("GUM.Equipment.Ammunition.NeedsActor"));
        const escape = value => foundry.utils.escapeHTML(String(value));
        const choices = ammunitionLinkCandidates(this.item.actor);
        const selected = new Set(attack.ammunition_ids || []);
        const content = `<div class="gum-ammunition-picker-content">
            <p class="gum-ammunition-dialog-intro">${game.i18n.localize("GUM.Equipment.Ammunition.AcceptedHint")}</p>
            <div class="gum-ammunition-choice-list">${choices.length ? choices.map(item =>
                `<label class="gum-ammunition-choice-card"><input type="checkbox" name="ammo" value="${escape(item.id)}" ${selected.has(item.id) ? "checked" : ""}>
                    <span class="gum-ammunition-choice-copy"><strong>${escape(item.name)}</strong><small>${game.i18n.format("GUM.Equipment.Ammunition.Available", { quantity: Number(item.system.quantity) || 0 })}</small></span>
                </label>`
            ).join("") : `<p class="gum-ammunition-empty">${game.i18n.localize("GUM.Equipment.Ammunition.None")}</p>`}</div>
        </div>`;
        new Dialog({ title: game.i18n.localize("GUM.Equipment.Ammunition.Accepted"), content, buttons: {
            save: { label: game.i18n.localize("GUM.Equipment.Attacks.Save"), callback: async html => {
                const ids = html.find('input[name="ammo"]:checked').map((_, input) => input.value).get();
                await this.item.update({ [`system.ranged_attacks.${attackId}.ammunition_ids`]: ids });
            } },
            cancel: { label: game.i18n.localize("GUM.Equipment.Attacks.Cancel") }
        }, default: "save" }, { classes: ["dialog", "gum", "gum-ammunition-picker-dialog"], width: 430, height: "auto" }).render(true);
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
 
  // Se for só uma, abre direto (comportamento atual) 
  if (parsedList.length === 1) { 
    return this._openSingleReference(parsedList[0]); 
  } 
 
  // Múltiplas referências: perguntar qual abrir 
  return this._promptMultipleReferences(parsedList); 
} 
 
 
 
_parseReferenceCodes(rawRef) { 
  const text = (rawRef ?? "").toString().trim().toUpperCase(); 
  if (!text) return []; 
 
  // separadores aceitos: vírgula, ponto e vírgula, quebra de linha e espaços 
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
 
 
    _matchesPdfSource(candidate, sourcePath) { 
        if (!candidate) return false; 
        if (!sourcePath) return true; 
 
        if (candidate.includes(sourcePath)) return true; 
 
        let decodedCandidate = candidate; 
        try { 
            decodedCandidate = decodeURIComponent(candidate); 
            if (decodedCandidate.includes(sourcePath)) return true; 
        } catch (_e) { 
            // noop 
        } 
 
        const sourceName = sourcePath.split('/').pop(); 
        if (!sourceName) return false; 
 
        if (candidate.includes(encodeURIComponent(sourceName)) || decodedCandidate.includes(sourceName)) { 
            return true; 
        } 
 
        try { 
            const absolute = new URL(candidate, window.location.origin); 
            const fileParam = absolute.searchParams.get('file'); 
            if (!fileParam) return false; 
            const decodedFile = decodeURIComponent(fileParam); 
            return decodedFile.includes(sourcePath) || decodedFile.includes(sourceName); 
        } catch (_e) { 
            return false; 
        } 
    } 
 
    _applyPdfPageToEmbed(root, sourcePath, targetPage) { 
        if (!root) return false; 
 
        const embeds = Array.from( 
  root.querySelectorAll( 
    'iframe, iframe.pdf, iframe.pdf-viewer, iframe[src*="pdfjs" i], object[type="application/pdf"], embed[type="application/pdf"]' 
  ) 
); 
        let positioned = false; 
 
        for (const el of embeds) { 
            const attr = el instanceof HTMLObjectElement ? 'data' : 'src'; 
            const current = el.getAttribute(attr) || ''; 
            const dataSrc = el.getAttribute('data-src') || el.getAttribute('data-url') || ''; 
            const candidate = current || dataSrc; 
            if (!candidate) continue; 
 
            if (!this._matchesPdfSource(candidate, sourcePath)) continue; 
 
            // PDF.js embutido em iframe: tenta atualizar por API primeiro (sem recarregar o documento). 
            if (el instanceof HTMLIFrameElement) { 
            try { 
                const cw = el.contentWindow; 
                const viewerApp = cw?.PDFViewerApplication; 
                const viewer = viewerApp?.pdfViewer; 
 
                if (viewerApp && viewer) { 
                viewer.currentPageNumber = targetPage; 
                viewerApp.page = targetPage; 
                positioned = true; 
                } 
            } catch (_e) { 
                // sandbox/cross-origin -> ignora e cai pro fallback por URL 
            } 
            } 
 
 
            const updated = this._setPdfPageInUrl(candidate, targetPage); 
            if (updated !== current) { 
                el.setAttribute(attr, updated); 
                positioned = true; 
                continue; 
            } 
 
            // Se já está com a URL correta, ainda consideramos sucesso. 
            if (updated === current) { 
                positioned = true; 
            } 
        } 
 
        return positioned; 
    } 
 
 
async _openPdfReferencePage(pdfPage, targetPage) { 
  const journal = pdfPage?.parent; 
  if (!journal) return; 
 
  const page = Math.max(1, Number(targetPage) || 1); 
  const sourcePath = (pdfPage.src ?? pdfPage.system?.src ?? "").toString(); 
 
  // 1) abre o Journal na página PDF correta 
  await journal.sheet.render(true, { pageId: pdfPage.id, mode: "view" }); 
 
  // 3) tenta achar o iframe do viewer no DOM inteiro (mais confiável) 
  const tryPosition = () => { 
    const frames = this._findPdfViewerIframesBySource(sourcePath); 
 
    // se não conseguiu casar por source, tenta “o último viewer aberto” 
    const fallback = frames.length ? frames : Array.from(document.querySelectorAll('iframe[src*="pdfjs" i], iframe[src*="viewer.html" i]')); 
    if (!fallback.length) return false; 
 
    let ok = false; 
    for (const f of fallback) ok = this._setPageOnPdfViewerIframe(f, page) || ok; 
    return ok; 
  }; 
 
  // 4) estratégia: polling + load-event (porque o viewer inicializa assíncrono) 
  const delays = [0, 80, 180, 350, 600, 900, 1300, 1800, 2500]; 
  for (const d of delays) { 
    await new Promise(r => setTimeout(r, d)); 
    if (tryPosition()) return; 
  } 
 
  // Se ainda não deu, adiciona “uma última tentativa” quando o iframe carregar 
  const frames = this._findPdfViewerIframesBySource(sourcePath); 
  for (const f of frames) { 
    f.addEventListener("load", () => { 
      try { this._setPageOnPdfViewerIframe(f, page); } catch (_e) {} 
    }, { once: true }); 
  } 
 
  // DEBUG: lista iframes candidatos pra você ver o que o Foundry realmente está renderizando 
try { 
  const all = Array.from(document.querySelectorAll('iframe')); 
  const pdfish = all 
    .map(f => ({ 
      src: f.getAttribute("src") || "", 
      dataSrc: f.getAttribute("data-src") || f.getAttribute("data-url") || f.dataset?.src || f.dataset?.url || "" 
    })) 
    .filter(x => /pdfjs|viewer\.html/i.test(x.src || x.dataSrc)); 
 
  console.warn("GUM | Falha ao posicionar PDF", { 
    targetPage: page, 
    sourcePath, 
    pdfViewerIframes: pdfish 
  }); 
} catch (_e) {} 
 
  ui.notifications.warn("Não foi possível posicionar o PDF na página solicitada automaticamente."); 
} 
 
 
 
 
 
    /* -------------------------------------------- */ 
    /* Métodos Auxiliares                          */ 
    /* -------------------------------------------- */ 
 
    _activateGmModifierBehaviors(html) { 
        if (!this._gmTreeState) this._gmTreeState = {}; 
 
        // Persistência de colapsáveis 
        html.find('.gm-tree-group').each((index, el) => { 
            const id = el.id || `gm-tree-${index}`; 
            if (this._gmTreeState[id] === undefined) { 
                this._gmTreeState[id] = el.hasAttribute('open'); 
            } 
            el.dataset.treeId = id; 
            el.open = !!this._gmTreeState[id]; 
            el.addEventListener('toggle', ev => { 
                const treeId = ev.currentTarget.dataset.treeId; 
                this._gmTreeState[treeId] = ev.currentTarget.open; 
            }); 
        }); 
 
        // Lógica de checkboxes (implicações) 
        html.on('change', '.gm-modifier-layout input[type="checkbox"]', (event) => { 
            event.preventDefault(); 
            event.stopPropagation(); 
            event.stopImmediatePropagation(); 
            this._handleGmCheckboxChange(event, html); 
        }); 
    } 
 
    _handleGmCheckboxChange(event, html) { 
        const target = event.currentTarget; 
        const name = target.name || ""; 
        const checked = target.checked; 
 
        const setChecked = (selector, value) => { 
            html.find(selector).each((_, el) => { el.checked = value; }); 
        }; 
 
        const syncAttrRow = (attr) => { 
            const rowInputs = Array.from(html.find(`input.attr-child-${attr}`)); 
            const allChecked = rowInputs.length > 0 && rowInputs.every(el => el.checked); 
            const parent = html.find(`input.attr-parent-toggle[data-attr="${attr}"]`)[0]; 
            if (parent) parent.checked = allChecked; 
        }; 
 
        const syncAttrAll = () => { 
            const parents = Array.from(html.find('input.attr-parent-toggle')); 
            const allChecked = parents.length > 0 && parents.every(el => el.checked); 
            const attrAll = html.find('input[name="system.target_type.attr_all"]')[0]; 
            if (attrAll) attrAll.checked = allChecked; 
        }; 
 
        const applySkillAll = (value) => { 
            setChecked('input[name^="system.target_type.skill_"]', value); 
        }; 
 
        // Regras principais 
        if (name === "system.target_type.global") { 
            setChecked('.gm-modifier-layout input[type="checkbox"]', checked); 
        } else if (name === "system.target_type.combat_all") { 
            setChecked('input[name^="system.target_type.combat_"]', checked); 
        } else if (name === "system.target_type.attr_all") { 
            setChecked('input.attr-parent-toggle', checked); 
            setChecked('input[name^="system.target_type.check_"]', checked); 
            setChecked('input[name^="system.target_type.skill_"]', checked); 
            setChecked('input[name^="system.target_type.spell_"]', checked); 
            setChecked('input[name^="system.target_type.power_"]', checked); 
        } else if (name === "system.target_type.skill_all") { 
            applySkillAll(checked); 
        } else if (target.classList.contains('attr-parent-toggle')) { 
            const attr = target.dataset.attr; 
            if (attr) { 
                setChecked(`input.attr-child-${attr}`, checked); 
            } 
        } else if (name.startsWith("system.target_type.check_") || 
                   name.startsWith("system.target_type.skill_") || 
                   name.startsWith("system.target_type.spell_") || 
                   name.startsWith("system.target_type.power_")) { 
            const parts = name.split("_"); 
            const attr = parts[parts.length - 1]; 
            if (attr) { 
                syncAttrRow(attr); 
            } 
        } 
 
        // Ajustes derivados 
        syncAttrAll(); 
 
        // Atualizar apenas campos alterados para minimizar re-render 
        const updateData = {}; 
        html.find('.gm-modifier-layout input[type="checkbox"]').each((_, el) => { 
            const input = el; 
            const path = input.name; 
            if (!path) return; 
            const value = input.checked; 
            const current = foundry.utils.getProperty(this.item, path); 
            if (current !== value) { 
                foundry.utils.setProperty(updateData, path, value); 
            } 
        }); 
        if (Object.keys(updateData).length > 0) { 
            this.item.update(updateData); 
        } 
    } 

    _getTreePointsPerLevelDefault(hierarchyType) {
        const defaults = { trunk: 7, branch: 3, twig: 2, leaf: 1 };
        return defaults[(hierarchyType || "normal").toString()] ?? "";
    }

    _calculateTreeSkillPoints(relativeLevel, pointsPerLevel) {
        const level = Number(relativeLevel) || 0;
        const perLevel = Number(pointsPerLevel) || 0;
        return Math.max(0, level * perLevel);
    }

 
    _calculateSkillPoints(difficulty, relativeLevel) { 
        const rl = parseInt(relativeLevel) || 0; 
        const normalized = ({ 
            "E": "F", "A": "M", "H": "D", "VH": "MD" 
        })[difficulty] || difficulty; 
 
 
        const tables = { 
            "F": { 0: 1, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 }, 
            "M": { "-1": 1, 0: 2, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 }, 
            "D": { "-2": 1, "-1": 2, 0: 4, 1: 8, 2: 12, 3: 16, 4: 20, 5: 24 }, 
            "MD": { "-3": 1, "-2": 2, "-1": 4, 0: 8, 1: 12, 2: 16, 3: 20, 4: 24, 5: 28 }, 
            "TecM": {}, 
            "TecD": {} 
        }; 
 
        if (normalized === "TecM") return Math.max(0, rl * 1); 
        if (normalized === "TecD") return rl > 0 ? rl + 1 : 0; 
 
        const table = tables[normalized] || tables["M"]; 
        const keys = Object.keys(table).map(k => parseInt(k)); 
        const minKey = Math.min(...keys); 
        const maxKey = Math.max(...keys); 
 
        if (rl < minKey) return 0; 
        if (rl in table) return table[rl]; 
 
        const base = table[maxKey]; 
        return base + (rl - maxKey) * 4; 
    } 
 
    async _onAutoCalcPoints(event) { 
        const formData = new FormDataExtended(this.form).object; 
        const autoPoints = formData["system.auto_points"] || false; 
        const selectedDifficulty = formData["system.difficulty"] ?? this.item.system?.difficulty;
        const costMode = selectedDifficulty === "linear" ? "linear" : (formData["system.cost_mode"] || "standard");  
         
        if (event.currentTarget.name === "system.auto_points") { 
             await this.item.update({"system.auto_points": autoPoints}); 
             if (!autoPoints) return; 
        } 
 
        if (autoPoints) { 
            const difficulty = formData["system.difficulty"] ?? this.item.system.difficulty ?? "M"; 
            const relativeLevel = formData["system.skill_level"]; 
            const pointsField = (this.item.type === 'power') ? "system.points_skill" : "system.points"; 
            let newPoints; 
            if (costMode === "linear") { 
                const perLevel = Number(formData["system.cost_per_level"] ?? this.item.system?.cost_per_level ?? 1) || 0;
                newPoints = Math.max(0, (Number(relativeLevel) || 0) * perLevel); 
            } else { 
                newPoints = this._calculateSkillPoints(difficulty, relativeLevel); 
            } 
             
            if (foundry.utils.getProperty(this.item, pointsField) !== newPoints) { 
                await this.item.update({[pointsField]: newPoints}); 
            } 
        } 
    } 
 
_onAddAttack(ev) { 
        ev.preventDefault(); 
        const attackType = $(ev.currentTarget).data('type'); 
        const newAttackId = foundry.utils.randomID(16); 
        const newAttackData = this._getDefaultAttackData(attackType); 
 
        this._openAttackEditorDialog({ 
            attackType, 
            attackId: newAttackId, 
            attackData: newAttackData 
        }); 
    } 
 
    _getDefaultAttackData(attackType) { 
        const baseAttack = { 
            mode: "", 
            skill_name: "", 
            skill_level_mod: 0, 
            damage_formula: "", 
            damage_type: "", 
            damage_scaling: "", 
            armor_divisor: null, 
            min_strength: null, 
            unbalanced: false, 
            fencing: false, 
            follow_up_damage: { 
                formula: "", 
                type: "",
                scaling: "",  
                armor_divisor: null
            }, 
            fragmentation_damage: { 
                formula: "", 
                type: "",
                scaling: "",  
                armor_divisor: null 
            } 
        }; 
 
        if (attackType === "melee") { 
        return { 
                ...baseAttack, 
                mode: "Novo Ataque", 
                damage_formula: "GdB", 
                damage_type: "cort",
                damage_scaling: "", 
                reach: "C", 
                parry: "0", 
                block: "", 
                parry_default: true, 
                block_default: true, 
                min_strength: "" 
            }; 
        } 
 
        return { 
            ...baseAttack, 
            mode: "Novo Tiro", 
            damage_formula: "GdP", 
            damage_type: "perf",
            damage_scaling: "",  
            accuracy: "", 
            range: "100/200", 
            rof: "1", 
            shots: "1", 
            rcl: "", 
            mag: "", 
            min_strength: "" 
        }; 
    } 
 
    _openAttackEditorDialog({attackType, attackId, attackData, isEdit = false}) { 
        const title = isEdit 
            ? (attackType === "melee" ? "Editar Ataque Corpo a Corpo" : "Editar Ataque à Distância") 
            : (attackType === "melee" ? "Novo Ataque Corpo a Corpo" : "Novo Ataque à Distância"); 
        const content = this._renderAttackEditorForm(attackType, attackId, attackData); 
 
new Dialog({ 
            title, 
            content, 
            buttons: { 
                save: { 
                    icon: '<i class="fas fa-save"></i>', 
                    label: "Salvar", 
                    callback: async (html) => { 
                        const form = html.find("form")[0]; 
                        const updateData = this._collectAttackFormData(form); 
                        if (Object.keys(updateData).length > 0) { 
                            await this.item.update(updateData); 
                        } 
                    } 
                }, 
                cancel: { 
                    icon: '<i class="fas fa-times"></i>', 
                    label: "Cancelar" 
                } 
            }, 
            default: "save" 
        }, { 
            classes: ["dialog", "gum-dialog", "attack-editor-dialog", "gum", "sheet", "item"],
            width: 560,
            height: 660,
            resizable: true
        }).render(true); 
    } 
 
    _onEditAttack(ev) { 
        const attackItem = $(ev.currentTarget).closest('.attack-item'); 
        const attackId = attackItem.data('attack-id'); 
        const attackType = attackItem.data('attack-type'); 
        if (!attackId || !attackType) return; 
 
        const attackData = foundry.utils.getProperty(this.item, `system.${attackType}_attacks.${attackId}`); 
        if (!attackData) return; 
 
        this._openAttackEditorDialog({ 
            attackType, 
            attackId, 
            attackData, 
            isEdit: true 
        }); 
    } 
 
    _collectAttackFormData(form) { 
        const inputs = Array.from(form.querySelectorAll("[data-name]")); 
        const updateData = {}; 
 
        inputs.forEach((input) => { 
            const path = input.dataset.name; 
            if (!path) return; 
 
            let value; 
            if (input.type === "checkbox") { 
                value = input.checked; 
            } else if (input.type === "number") { 
                const raw = input.value.trim(); 
                if (raw === "") { 
                    value = null; 
                } else { 
                    const normalized = raw.replace(',', '.'); 
                    const parsed = Number(normalized); 
                    value = Number.isNaN(parsed) ? normalized : parsed; 
                } 
            } else { 
                value = input.value; 
            } 
 
            foundry.utils.setProperty(updateData, path, value); 
        }); 
 
        return updateData; 
    } 
 
    _renderAttackEditorForm(attackType, attackId, attackData) { 
        const safe = (value) => foundry.utils.escapeHTML(String(value ?? "")); 
        const basePath = `system.${attackType}_attacks.${attackId}`; 
        const followUp = attackData.follow_up_damage ?? {}; 
        const fragmentation = attackData.fragmentation_damage ?? {}; 
 
       const defaultParry = Boolean(attackData.parry_default); 
        const defaultBlock = Boolean(attackData.block_default); 
        const resolveDefaultDefense = (nhValue) => { 
            const parsed = Number(nhValue); 
            if (!Number.isFinite(parsed)) return ""; 
            return Math.floor(parsed / 2) + 3; 
        }; 
        const defaultDefenseValue = resolveDefaultDefense(attackData.final_nh); 
        const parryValue = defaultParry && defaultDefenseValue !== "" ? defaultDefenseValue : attackData.parry; 
        const blockValue = defaultBlock && defaultDefenseValue !== "" ? defaultDefenseValue : attackData.block; 
 
        const commonFields = ` 
            <div class="form-section"> 
                <h4 class="section-title">Identificação</h4> 
                <div class="form-row"> 
                    <div class="row-label">Modo de Uso</div> 
                    <div class="row-fields"> 
                        <input type="text" data-name="${basePath}.mode" value="${safe(attackData.mode)}"/> 
                    </div> 
                </div> 
                <div class="form-row"> 
                    <div class="row-label">Perícia Vinculada</div> 
                    <div class="row-fields"> 
                        <input type="text" data-name="${basePath}.skill_name" value="${safe(attackData.skill_name)}" placeholder="Atributo, Perícia ou Valor Fixo"/> 
                    </div> 
                </div> 
                <div class="form-row"> 
                    <div class="row-label">Modificador Base de NH </div> 
                    <div class="row-fields"> 
                        <input type="number" data-name="${basePath}.skill_level_mod" value="${safe(attackData.skill_level_mod)}"/> 
                    </div> 
                </div> 
                ${attackType === "melee" ? ` 
                <div class="form-row"> 
                    <div class="row-label">Alcance</div> 
                    <div class="row-fields"> 
                        <input type="text" data-name="${basePath}.reach" value="${safe(attackData.reach)}"/> 
                    </div> 
                </div> 
                ` : ` 
                <div class="form-row"> 
                    <div class="row-label">Alcance</div> 
                    <div class="row-fields"> 
                        <input type="text" data-name="${basePath}.range" value="${safe(attackData.range)}"/> 
                    </div> 
                </div> 
                `} 
                <div class="form-row"> 
                    <div class="row-label">Força Mínima(ST min)</div> 
                    <div class="row-fields"> 
                        <input type="text" data-name="${basePath}.min_strength" value="${safe(attackData.min_strength)}"/> 
                    </div> 
                </div> 
            </div> 
            <div class="form-section"> 
                <h4 class="section-title">Dano</h4> 
                <div class="attack-damage-table">
                    <div class="damage-table-spacer"></div>
                    <div class="damage-col-label">Fórmula</div>
                    <div class="damage-col-label">Tipo</div>
                    <div class="damage-col-label">Natureza</div>
                    <div class="damage-col-label">Div.</div>
                    <div class="damage-col-label">Escala</div>

                    <div class="row-label">Dano Primário</div>
                    <input type="text" data-name="${basePath}.damage_formula" value="${safe(attackData.damage_formula)}"/>
                    <input type="text" data-name="${basePath}.damage_type" value="${safe(attackData.damage_type)}"/>
                    <input type="text" data-name="${basePath}.damage_nature" value="${safe(attackData.damage_nature)}" placeholder="FOG"/>
                    <input type="number" step="0.1" data-name="${basePath}.armor_divisor" value="${safe(attackData.armor_divisor)}" title="Divisor de Armadura"/>
                    <input type="text" data-name="${basePath}.damage_scaling" value="${safe(attackData.damage_scaling)}" placeholder="Ex: +1d6/point" title="Progressão de dano importada/editável. Ex: +1d6/point"/>
                    
                    <div class="row-label">Dano Acompanhamento</div>
                    <input type="text" data-name="${basePath}.follow_up_damage.formula" value="${safe(followUp.formula)}"/>
                    <input type="text" data-name="${basePath}.follow_up_damage.type" value="${safe(followUp.type)}"/>
                    <input type="text" data-name="${basePath}.follow_up_damage.nature" value="${safe(followUp.nature)}" placeholder="Natureza"/>
                    <input type="number" step="0.1" data-name="${basePath}.follow_up_damage.armor_divisor" value="${safe(followUp.armor_divisor)}" title="Divisor"/>
                    <input type="text" data-name="${basePath}.follow_up_damage.scaling" value="${safe(followUp.scaling)}" placeholder="Ex: +1d6/point" title="Progressão de dano importada/editável. Ex: +1d6/point"/>
                    <div class="row-label">Dano de Fragmentação</div>
                    <input type="text" data-name="${basePath}.fragmentation_damage.formula" value="${safe(fragmentation.formula)}"/>
                    <input type="text" data-name="${basePath}.fragmentation_damage.type" value="${safe(fragmentation.type)}"/>
                    <input type="text" data-name="${basePath}.fragmentation_damage.nature" value="${safe(fragmentation.nature)}" placeholder="Natureza"/>
                    <input type="number" step="0.1" data-name="${basePath}.fragmentation_damage.armor_divisor" value="${safe(fragmentation.armor_divisor)}" title="Divisor"/>
                    <input type="text" data-name="${basePath}.fragmentation_damage.scaling" value="${safe(fragmentation.scaling)}" placeholder="Ex: +1d6/point" title="Progressão de dano importada/editável. Ex: +1d6/point"/>
                </div>
            </div>
        `; 
 
        const meleeFields = ` 
            <div class="form-section"> 
                <h4 class="section-title">Defesa</h4> 
                <div class="form-row"> 
                    <div class="row-label">Aparar</div> 
                    <div class="row-fields"> 
                        <div class="form-grid-2"> 
                            <input type="text" data-name="${basePath}.parry" value="${safe(parryValue)}" ${defaultParry ? "disabled" : ""}/> 
                            <label class="custom-checkbox defense-toggle"> 
                                <input type="checkbox" data-name="${basePath}.parry_default" ${defaultParry ? "checked" : ""}/> 
                                <span>Aparar Padrão</span> 
                            </label> 
                        </div> 
                    </div> 
                </div> 
                <div class="form-row"> 
                    <div class="row-label">Bloqueio</div> 
                    <div class="row-fields"> 
                        <div class="form-grid-2"> 
                            <input type="text" data-name="${basePath}.block" value="${safe(blockValue)}" ${defaultBlock ? "disabled" : ""}/> 
                            <label class="custom-checkbox defense-toggle"> 
                                <input type="checkbox" data-name="${basePath}.block_default" ${defaultBlock ? "checked" : ""}/> 
                                <span>Bloqueio Padrão</span> 
                            </label> 
                        </div> 
                    </div> 
                </div> 
                <div class="form-row"> 
                    <div class="row-label">Características</div> 
                    <div class="row-fields"> 
                        <div class="form-grid-2"> 
                            <label class="custom-checkbox"> 
                                <input type="checkbox" data-name="${basePath}.unbalanced" ${attackData.unbalanced ? "checked" : ""}/> 
                                <span>Desbalanceada(U)</span> 
                            </label> 
                            <label class="custom-checkbox"> 
                                <input type="checkbox" data-name="${basePath}.fencing" ${attackData.fencing ? "checked" : ""}/> 
                                <span>Esgrima(F)</span> 
                            </label> 
                        </div> 
                    </div> 
                </div> 
            </div> 
        `; 
 
const rangedFields = ` 
    <div class="form-section"> 
        <h4 class="section-title">Precisão & Alcance</h4> 
        <div class="form-row"> 
            <div class="row-label">Precisão(PREC)</div> 
            <div class="row-fields"> 
                <input type="text" data-name="${basePath}.accuracy" value="${safe(attackData.accuracy)}"/> 
            </div> 
        </div> 
        <div class="form-row"> 
            <div class="row-label">Cadência de Tiros(CdT)</div> 
            <div class="row-fields"> 
                <input type="text" data-name="${basePath}.rof" value="${safe(attackData.rof)}"/> 
            </div> 
        </div> 
        <div class="form-row"> 
            <div class="row-label">Tiros(T)</div> 
            <div class="row-fields"> 
                <input type="text" data-name="${basePath}.shots" value="${safe(attackData.shots)}"/> 
            </div> 
        </div> 
        <div class="form-row"> 
            <div class="row-label">Recuo(RCO)</div> 
            <div class="row-fields"> 
                <input type="text" data-name="${basePath}.rcl" value="${safe(attackData.rcl)}"/> 
            </div> 
        </div> 
        <div class="form-row"> 
            <div class="row-label">Magnitude(Mag)</div> 
            <div class="row-fields"> 
                <input type="text" data-name="${basePath}.mag" value="${safe(attackData.mag)}"/> 
            </div> 
        </div> 
    </div> 
`; 
 
               return ` 
            <div class="attack-editor-dialog gum sheet item"> 
                <form class="gum-dialog-content attack-editor-form"> 
                    ${commonFields} 
                    ${attackType === "melee" ? meleeFields : rangedFields} 
                </form> 
            </div> 
        `; 
    } 
 
    _onDeleteAttack(ev) { 
        const target = $(ev.currentTarget); 
        const attackId = target.closest('.attack-item').data('attack-id'); 
        const listName = target.data('list');  
        Dialog.confirm({ 
            title: "Deletar Modo de Ataque", 
            content: "<p>Tem certeza?</p>", 
            yes: () => this.item.update({ [`system.${listName}.-=${attackId}`]: null }) 
       }); 
    } 
 
    async _onSaveAttackMode(ev) { 
        ev.preventDefault(); 
        const attackItem = $(ev.currentTarget).closest('.attack-item'); 
        const inputs = attackItem.find('input[data-name]'); 
        const updateData = {}; 
 
        inputs.each((_, el) => { 
            const input = el; 
            const path = input.dataset.name; 
            if (!path) return; 
 
            let value; 
            if (input.type === "checkbox") { 
                value = input.checked; 
            } else if (input.type === "number") { 
                const raw = input.value.trim(); 
                if (raw === "") { 
                    value = null; 
                } else { 
                    const normalized = raw.replace(',', '.'); 
                    const parsed = Number(normalized); 
                    value = Number.isNaN(parsed) ? normalized : parsed; 
                } 
            } else { 
                value = input.value; 
            } 
 
            foundry.utils.setProperty(updateData, path, value); 
        }); 
 
        if (Object.keys(updateData).length > 0) { 
            await this.item.update(updateData); 
        } 
 
        attackItem.find('.attack-edit-mode').hide(); 
        attackItem.find('.attack-display-mode').show(); 
    } 
 
    _onCancelAttackEdit(ev) { 
        ev.preventDefault(); 
        const attackItem = $(ev.currentTarget).closest('.attack-item'); 
        attackItem.find('.attack-edit-mode').hide(); 
        attackItem.find('.attack-display-mode').show(); 
    } 
 
 async _onLinkSkill(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const trigger = $(ev.currentTarget);
        if (trigger.hasClass('disabled')) return; 
        if (!this.item.isOwned) return ui.notifications.warn(game.i18n.localize("GUM.SkillLink.RequiresActor"));
        const actor = this.item.parent; 
        const skillFilter = String(trigger.data('skill-filter') || '').trim();
        const allowedHierarchyTypes = skillFilter.split('|').map(type => type.trim()).filter(Boolean);
        const explicitPath = trigger.data('link-target'); 
        const scopedInput = trigger.closest('.form-group, .skill-hierarchy-card, .skill-compact-row, .skill-dashboard-linked-input').find('input[type="text"]').first();
        const input = scopedInput.length ? scopedInput : trigger.closest('label').siblings('input[type="text"]').first(); 
        const rawPath = explicitPath || input.attr('name') || input.data('name');
        const path = canonicalSkillLinkTargetPath(rawPath);
        if (!path) return; 
 
        const inputValue = String(input.val() ?? "").trim();
        const currentValue = inputValue || foundry.utils.getProperty(this.item, path) || "";
        const candidates = collectSkillLinkCandidates(actor.items, { allowedHierarchyTypes, currentValue });
        if (!candidates.length) return ui.notifications.warn(game.i18n.localize("GUM.SkillLink.NoCompatibleSkills"));

        const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
        const rows = candidates.map(candidate => {
            const details = [
                candidate.group ? `${game.i18n.localize("GUM.SkillLink.Group")}: ${candidate.group}` : "",
                candidate.baseAttribute ? `${game.i18n.localize("GUM.SkillLink.BaseAttribute")}: ${candidate.baseAttribute.toUpperCase()}` : "",
                candidate.difficulty ? `${game.i18n.localize("GUM.SkillLink.Difficulty")}: ${candidate.difficulty}` : ""
            ].filter(Boolean).join(" · ");
            const finalNh = candidate.finalNh === "" ? game.i18n.localize("GUM.SkillLink.Unavailable") : candidate.finalNh;
            return `<label class="skill-link-option${candidate.selected ? " is-selected" : ""}" data-search="${escape(candidate.searchText)}">
                <input type="radio" name="skill_id" value="${escape(candidate.id)}" ${candidate.selected ? "checked" : ""}>
                <span class="skill-link-option__image"><img src="${escape(candidate.image)}" alt=""></span>
                <span class="skill-link-option__text"><strong>${escape(candidate.displayName)}</strong><small>${escape(details || game.i18n.localize("GUM.SkillLink.NoDetails"))}</small></span>
                <span class="skill-link-option__level"><small>${escape(game.i18n.localize("GUM.SkillLink.FinalLevel"))}</small><strong>${escape(finalNh)}</strong></span>
            </label>`;
        }).join("");
 
        new Dialog({ 
            title: game.i18n.localize("GUM.SkillLink.Title"),
            content: `<form class="skill-link-picker" autocomplete="off">
                <div class="skill-link-picker__intro"><span class="skill-link-picker__intro-icon"><i class="fas fa-link"></i></span><p>${escape(game.i18n.localize("GUM.SkillLink.Hint"))}</p></div>
                <label class="skill-link-search" aria-label="${escape(game.i18n.localize("GUM.SkillLink.SearchLabel"))}"><i class="fas fa-search"></i><input type="search" placeholder="${escape(game.i18n.localize("GUM.SkillLink.SearchPlaceholder"))}"></label>
                <div class="skill-link-options">${rows}</div>
                <p class="skill-link-no-results" hidden>${escape(game.i18n.localize("GUM.SkillLink.NoResults"))}</p>
            </form>`,
            buttons: { 
                link: {
                    icon: '<i class="fas fa-link"></i>',
                    label: game.i18n.localize("GUM.SkillLink.Link"),
                    callback: html => {
                        const selectedId = String(html.find('input[name="skill_id"]:checked').val() || "");
                        const selected = candidates.find(candidate => candidate.id === selectedId);
                        if (!selected) {
                            ui.notifications.warn(game.i18n.localize("GUM.SkillLink.SelectRequired"));
                            return false;
                        }
                        input.val(selected.displayName);
                        return this.item.update({ [path]: selected.displayName });
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("GUM.SkillLink.Cancel") }
            },
            default: "link",
            render: html => {
                const syncSelection = () => html.find(".skill-link-option").each((_index, element) => {
                    element.classList.toggle("is-selected", Boolean(element.querySelector('input[type="radio"]')?.checked));
                });
                html.find('input[name="skill_id"]').on("change", syncSelection);
                html.find('.skill-link-search input').on("input", event => {
                    const term = normalizeSkillLinkSearch(event.currentTarget.value);
                    let visible = 0;
                    html.find(".skill-link-option").each((_index, element) => {
                        const matches = !term || String(element.dataset.search || "").includes(term);
                        element.hidden = !matches;
                        if (matches) visible += 1;
                    });
                    html.find(".skill-link-no-results").prop("hidden", visible > 0);
                });
                syncSelection();
                html.find('.skill-link-search input').trigger("focus");
            } 
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-skill-link-dialog"], width: 540, height: "auto" }).render(true);
    } 
     
 async _onViewEqpModifier(ev) { 
        ev.preventDefault(); 
        const modId = $(ev.currentTarget).closest('[data-modifier-id]').data('modifier-id'); 
        const modData = this.item.system.eqp_modifiers?.[modId]; 
        if (!modData) return; 
 
        if (modData.source_uuid) { 
            const sourceModifier = await fromUuid(modData.source_uuid).catch(() => null); 
            if (sourceModifier?.sheet) return sourceModifier.sheet.render(true); 
        } 
 
        const tempItem = await Item.create({ 
            name: modData.name || "Modificador de Equipamento", 
            type: "eqp_modifier", 
            img: modData.img || "icons/svg/mystery-man.svg", 
                system: { 
                cost_adjustment: modData.cost_adjustment ?? `${modData.cost_factor ?? 0} CF`, 
                cost_factor: modData.cost_factor ?? 0,
                weight_mod: modData.weight_mod ?? "x1",
                enabled: modData.enabled !== false,
                level: modData.level ?? 1,
                adjustment_schema: modData.adjustment_schema ?? 0,
                cost_adjustment_data: modData.cost_adjustment_data ?? {},
                weight_adjustment_data: modData.weight_adjustment_data ?? {},
                features_data: modData.features_data ?? {},
                tech_level_mod: modData.tech_level_mod ?? "", 
                target_type: modData.target_type ?? {}, 
                features: modData.features ?? "", 
                ref: modData.ref ?? "" 
            } 
        }, { temporary: true, renderSheet: true }); 
 
        tempItem?.sheet?.render(true); 
    } 
 
     activateEditor(name, options = {}, ...args) { 
        options.engine = "prosemirror"; 
        options.minHeight ??= (name === "system.chat_description") ? 300 : 400; 
        return super.activateEditor(name, options, ...args); 
    } 
 
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
 
 

    /**
     * Capture the actual state of every social contribution immediately before
     * Foundry replaces the sheet DOM. The native details toggle event is not
     * reliable enough on its own during automatic form submissions.
     */
    _captureSocialContributionOpenState() {
        const root = this.element?.[0] ?? this.element;
        if (!root?.querySelectorAll) return;

        this._socialContributionOpenState ??= new Map();
        for (const contribution of root.querySelectorAll(".item-social-contribution[data-id]")) {
            const id = contribution.dataset.id;
            if (id) this._socialContributionOpenState.set(id, contribution.open);
        }
    }

    _saveUIState() {
        const details = Array.from(this.form?.querySelectorAll("details") ?? []);
        this._openDetailsState = details.flatMap((element, index) => {
            // Social contributions have their own stable state keyed by contribution ID.
            if (!element.open || element.matches(".item-social-contribution[data-id]")) return [];
            return [{ id: element.id || null, index }];
        });
    } 
 
 async _render(force, options) { 
        this._captureSocialContributionOpenState();
        await super._render(force, options); 
        this._refreshHeaderNameAutosize(); 
        if (this._openDetailsState) {
            const details = Array.from(this.form?.querySelectorAll("details") ?? []);
            for (const state of this._openDetailsState) {
                const element = state.id
                    ? details.find(detail => detail.id === state.id)
                    : details[state.index];
                if (element) element.open = true;
            }
        } 
    } 
 
    _bindHeaderNameAutosize(html) { 
        const nameField = html.find('.sheet-header textarea[name="name"]'); 
        if (!nameField.length) return; 
 
        const resize = (el) => { 
            if (!el) return; 
            el.style.height = 'auto'; 
            el.style.height = `${el.scrollHeight}px`; 
        }; 
 
        nameField.each((_, el) => resize(el)); 
        nameField.on('input.gumNameAutosize', (ev) => resize(ev.currentTarget)); 
    } 
 
    _refreshHeaderNameAutosize() { 
        const nameField = this.form?.querySelector('.sheet-header textarea[name="name"]'); 
        if (!nameField) return; 
        nameField.style.height = 'auto'; 
        nameField.style.height = `${nameField.scrollHeight}px`; 
    } 
     
 _getSubmitData(updateData) { 
        const data = super._getSubmitData(updateData); 
 
        if (this.item?.type === "equipment") { 
            for (const key in data) { 
                if (key.startsWith("system.dr_locations.") || key.startsWith("system.dr_location_options.")) {
                    delete data[key]; 
                } 
            } 
 
            const drLocations = this._collectDRLocationsFromForm(); 
            Object.assign(data, this._buildDRLocationsUpdate(drLocations)); 
            const drLocationOptions = this._collectDRLocationOptionsFromForm(drLocations);
            Object.assign(data, this._buildDRLocationOptionsUpdate(drLocationOptions));
        } 
 
        return data; 
    } 
 
 async _updateObject(event, formData) {
        const attackMinStrengthPath = "system.attack_roll.min_strength";
        if (formData[attackMinStrengthPath] !== undefined) {
            formData[attackMinStrengthPath] = this._normalizeAttackMinStrength(formData[attackMinStrengthPath]);
        }
    

        if (this.item?.type === "gm_modifier") {
            const entriesByIndex = new Map(); 
            for (const [key, value] of Object.entries(formData)) { 
                const match = key.match(/^system\.modifier_entries\.(\d+)\.(label|value|nh_cap|contexts)$/); 
                if (!match) continue; 
                const index = Number(match[1]); 
                const field = match[2]; 
                if (!entriesByIndex.has(index)) entriesByIndex.set(index, { label: "", value: "0", nh_cap: "", contexts: "all" }); 
                entriesByIndex.get(index)[field] = value; 
                delete formData[key]; 
            } 
            if (entriesByIndex.size) { 
                const entries = Array.from(entriesByIndex.entries()) 
                    .sort((a, b) => a[0] - b[0]) 
                    .map(([, entry]) => ({ 
                        label: (entry.label || "").toString().trim(), 
                        value: (entry.value ?? "").toString().trim() || "0", 
                        nh_cap: (entry.nh_cap ?? "").toString().trim(), 
                        contexts: (entry.contexts || "all").toString().trim() || "all" 
                    })); 
                formData["system.modifier_entries"] = entries; 
                if (entries.length) { 
                    formData["system.modifier"] = entries[0].value; 
                    formData["system.nh_cap"] = entries[0].nh_cap; 
                } 
            } 
        }

        if (this.item?.type === "eqp_modifier") {
            const costExpression = formData["system.cost_adjustment_data.expression"];
            const weightExpression = formData["system.weight_adjustment_data.expression"];
            formData["system.adjustment_schema"] = 1;
            if (costExpression !== undefined) {
                formData["system.cost_adjustment"] = costExpression;
                const parsedCost = parseEquipmentAdjustment(costExpression, { target: "cost", stage: formData["system.cost_adjustment_data.stage"] || "base" });
                formData["system.cost_factor"] = parsedCost.valid && parsedCost.operation === "cost_factor" ? parsedCost.value : 0;
            }
            if (weightExpression !== undefined) formData["system.weight_mod"] = weightExpression;
        }
 
        for (const [k, v] of Object.entries(formData)) { 
            const isDescriptionField = k.includes("description"); 
            const isNumericStringWithComma = typeof v === 'string' && /^[+-]?\d+(,\d+)?$/.test(v.trim()); 
            if (!isDescriptionField && isNumericStringWithComma && v.includes(',')) formData[k] = v.replace(',', '.'); 
        } 

        if (this.item?.type === "equipment") {
            const nextIntegrityEnabled = formData["system.integrity_record_enabled"] === true
                || formData["system.integrity_record_enabled"] === "true"
                || formData["system.integrity_record_enabled"] === "on";
            const wasIntegrityEnabled = this.item.system?.integrity_record_enabled === true;
            if (nextIntegrityEnabled) {
                const pending = foundry.utils.mergeObject(
                    foundry.utils.deepClone(this.item._source?.system || this.item.system || {}),
                    foundry.utils.expandObject(formData).system || {},
                    { inplace: false }
                );
                const maximum = Math.max(0, Math.floor(Number(resolveEquipment(pending).properties?.item_hp) || 0));
                const rawCurrent = formData["system.item_hp_current"] ?? this.item.system?.item_hp_current;
                const parsedCurrent = Number(rawCurrent);
                // Enabling a fresh record starts the item undamaged. Afterwards,
                // its current integrity is preserved and only clamped to its max.
                const current = !wasIntegrityEnabled && (!Number.isFinite(parsedCurrent) || parsedCurrent <= 0)
                    ? maximum
                    : Math.max(0, Math.min(maximum, Number.isFinite(parsedCurrent) ? parsedCurrent : maximum));
                formData["system.item_hp_current"] = current;
            }
        }
        const standardSkillAttrs = ["st", "dx", "iq", "ht", "per", "will", "vont"];
        if (formData["system.base_attribute_select"] !== undefined) { 
            const selected = formData["system.base_attribute_select"]; 
            const customValue = (formData["system.base_attribute_custom"] ?? "").toString().trim();
            const customBaseTypes = ["skill", "spell", "power", "custom"]; 

            if (customBaseTypes.includes(selected)) { 
                formData["system.base_attribute"] = customValue; 
                if (["spell", "power"].includes(this.item?.type)) formData["system.base_attribute_type"] = selected;
            } else if (standardSkillAttrs.includes(selected)) { 
                formData["system.base_attribute"] = selected; 
                if (["spell", "power"].includes(this.item?.type)) formData["system.base_attribute_type"] = "attribute";
            } 
            delete formData["system.base_attribute_select"]; 
            delete formData["system.base_attribute_custom"]; 
         }

        if (["spell", "power"].includes(this.item?.type) && formData["system.difficulty"] !== undefined) {
            if (formData["system.difficulty"] === "linear") {
                formData["system.cost_mode"] = "linear";
            } else {
                formData["system.cost_mode"] = "standard";
            }
        }

        if (formData["system.tree_base_attribute_select"] !== undefined) {
            const selected = formData["system.tree_base_attribute_select"];
            const customValue = (formData["system.tree_base_attribute_custom"] ?? "").toString().trim();
            if (selected === "skill") {
                formData["system.tree_base_attribute"] = customValue;
            } else if (standardSkillAttrs.includes(selected)) {
                formData["system.tree_base_attribute"] = selected;
            }
            delete formData["system.tree_base_attribute_select"];
            delete formData["system.tree_base_attribute_custom"];
        }

        if (this.item?.type === "skill") {
            const treeHierarchyType = formData["system.tree_hierarchy_type"] ?? this.item.system?.tree_hierarchy_type ?? this.item.system?.hierarchy_type ?? "normal";
            const parentEnabled = ["branch", "twig", "leaf"].includes(treeHierarchyType);
            const treeParent = parentEnabled ? (formData["system.tree_parent"] ?? this.item.system?.tree_parent ?? "").toString().trim() : "";
            const treePointsPerLevel = formData["system.tree_points_per_level"] ?? this.item.system?.tree_points_per_level ?? this._getTreePointsPerLevelDefault(treeHierarchyType);

            const autoPointsEnabled = formData["system.auto_points"] !== undefined
                ? formData["system.auto_points"] !== false
                : this.item.system?.auto_points !== false;
            if (autoPointsEnabled) {
                const treeLevel = formData["system.tree_skill_level"] ?? this.item.system?.tree_skill_level ?? 0;
                formData["system.tree_points"] = this._calculateTreeSkillPoints(treeLevel, treePointsPerLevel);
            }

            // Mantém os campos legados sincronizados para compatibilidade com itens, macros e importadores antigos.
            formData["system.tree_parent"] = treeParent;
            formData["system.hierarchy_type"] = treeHierarchyType;
            formData["system.root_parent"] = treeHierarchyType === "branch" ? treeParent : "";
            formData["system.branch_parent"] = treeHierarchyType === "twig" ? treeParent : "";
            formData["system.twig_parent"] = treeHierarchyType === "leaf" ? treeParent : "";
        }
 
        if (this.item?.type === "equipment" && this.item?.actor) { 
            const wasContainer = this.item.system?.is_container === true; 
            const willBeContainer = formData["system.is_container"] === true || formData["system.is_container"] === "true" || formData["system.is_container"] === "on"; 
            if (wasContainer && !willBeContainer) { 
                const children = this.item.actor.items.filter(i => (i.system?.parent_container_id || "") === this.item.id); 
                if (children.length) { 
                    const shouldEmpty = await Dialog.confirm({ 
                        title: "Esvaziar container?", 
                        content: `<p>Este item possui ${children.length} item(ns) dentro. Deseja esvaziar automaticamente antes de remover status de container?</p>`, 
                        yes: () => true, 
                        no: () => false, 
                        defaultYes: true 
                    }); 
                    if (!shouldEmpty) { 
                        ui.notifications.warn("Operação cancelada. Esvazie o container para desmarcar essa opção."); 
                        return; 
                    } 
                    await this.item.actor.updateEmbeddedDocuments("Item", children.map(child => ({ 
                        _id: child.id, 
                        "system.parent_container_id": "" 
                    }))); 
                } 
            } 
        } 
        try {
            const pending = foundry.utils.mergeObject(this.item.toObject(), foundry.utils.expandObject(formData), { inplace: false });
            if (["advantage", "disadvantage", "power"].includes(this.item.type)) calculateItemTraitCost(pending);
            if (this.item.type === "modifier") parseTraitAdjustment(pending.system.cost);
        } catch (error) {
            ui.notifications.error(error.message);
            return;
        }
        this._saveUIState(); 
        return super._updateObject(event, formData); 
    } 
 
    _formatDRObjectToString(drObject) { 
        if (!drObject || typeof drObject !== 'object' || Object.keys(drObject).length === 0) return "0"; 
 
        const parts = []; 
        const baseDR = drObject.base || 0; 
        parts.push(baseDR.toString()); 
 
        for (const [type, mod] of Object.entries(drObject)) { 
            if (type === 'base') continue; 
 
            const finalDR = Math.max(0, baseDR + (mod || 0)); 
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
 
    _parseDRStringToObject(drString) { 
        if (typeof drString === 'object' && drString !== null) return drString; 
        if (!drString || typeof drString !== 'string' || drString.trim() === "") return {}; 
 
        const DAMAGE_TYPE_MAP = { 
            "cr": "cont", "cut": "cort", "imp": "perf", "pi": "pa", 
            "pi-": "pa-", "pi+": "pa+", "pi++": "pa++", "burn": "qmd", 
            "corr": "cor", "tox": "tox" 
        }; 
 
        const drObject = {}; 
        const parts = drString.split(',').map(s => s.trim().toLowerCase()); 
 
        let baseDR = 0; 
 
        for (const part of parts) { 
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean); 
            if (segments.length === 1 && !isNaN(Number(segments[0]))) { 
                baseDR = Number(segments[0]); 
                drObject['base'] = baseDR; 
                break; 
            } 
        } 
 
        for (const part of parts) { 
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean); 
            if (segments.length === 2 && !isNaN(Number(segments[0]))) { 
                let type = segments[1]; 
                const value = Number(segments[0]); 
 
                type = DAMAGE_TYPE_MAP[type] || type; 
 
                if (baseDR > 0) { 
                    drObject[type] = value - baseDR; 
                } else { 
                    drObject[type] = value; 
                } 
            } 
        } 
 
        return drObject; 
    } 
 
    _hasVisibleDR(drObject) { 
        if (!drObject || typeof drObject !== "object") return false; 
        return Object.keys(drObject).length > 0; 
    } 
 
    _collectDRLocationsFromForm() { 
        const drLocations = {}; 
        const rows = this.element?.[0]?.querySelectorAll("[data-dr-location-row]") || []; 
 
        rows.forEach(row => { 
            const keyInput = row.querySelector(".dr-location-key"); 
            const labelInput = row.querySelector(".dr-location-label"); 
            const valueInput = row.querySelector(".dr-location-value"); 
 
            const label = labelInput?.value?.trim() || ""; 
            const resolvedKey = label ? this._getLocationKeyFromLabel(label) : (keyInput?.value?.trim() || ""); 
            if (!resolvedKey) return; 
 
            const rawDrString = valueInput?.value; 
            const drString = typeof rawDrString === "string" ? rawDrString.trim() : ""; 
            const normalizedDrString = drString === "" ? "0" : drString; 
 
            drLocations[resolvedKey] = this._parseDRStringToObject(normalizedDrString); 
        }); 
 
        return drLocations; 
    } 

    _collectDRLocationOptionsFromForm(drLocations = {}) {
        const options = {};
        const rows = this.element?.[0]?.querySelectorAll("[data-dr-location-row]") || [];
        rows.forEach(row => {
            const label = row.querySelector(".dr-location-label")?.value?.trim() || "";
            const key = label ? this._getLocationKeyFromLabel(label) : (row.querySelector(".dr-location-key")?.value?.trim() || "");
            if (!key || !(key in drLocations)) return;
            options[key] = { provides_location: row.querySelector(".dr-location-provides")?.checked !== false };
        });
        return options;
    }
 
    _buildDRLocationsUpdate(drLocations) { 
        const update = { 
            "system.dr_locations": drLocations 
        }; 
        const existing = this.item.system.dr_locations || {}; 
 
        for (const key of Object.keys(existing)) { 
            if (!(key in drLocations)) { 
                update[`system.dr_locations.-=${key}`] = null; 
            } 
        } 
 
        return update; 
    } 

    _buildDRLocationOptionsUpdate(options) {
        const update = { "system.dr_location_options": options };
        const existing = this.item.system.dr_location_options || {};
        for (const key of Object.keys(existing)) {
            if (!(key in options)) update[`system.dr_location_options.-=${key}`] = null;
        }
        return update;
    }
 
    _addDrLocationRow(html, { label = "", key = "", dr = "", providesLocation = true } = {}) {
        const container = html.find(".dr-locations-table"); 
        if (!container.length) return; 
 
        const rowHtml = ` 
            <li class="attack-item dr-location-item" data-dr-location-row> 
                <div class="attack-display-card"> 
                    <div class="attack-line"> 
                        <div class="attack-cell"> 
                            <input class="dr-location-label" type="text" list="gum-body-location-options" value="${label}" placeholder="${game.i18n.localize("GUM.Equipment.Protection.LocationExample")}"/>
                            <input class="dr-location-key" type="hidden" value="${key}"/> 
                        </div> 
                        <div class="attack-cell"> 
                            <input class="dr-location-value" type="text" value="${dr}" placeholder="0"/> 
                        </div> 
                        <label class="attack-cell dr-location-provides-label" title="${game.i18n.localize("GUM.Equipment.Protection.ProvidesLocationHint")}">
                            <input class="dr-location-provides" type="checkbox" ${providesLocation ? "checked" : ""}/>
                            <span>${game.i18n.localize("GUM.Equipment.Protection.ProvidesLocation")}</span>
                        </label>
                        <div class="attack-cell"> 
                            <button class="dr-location-delete" type="button" title="${game.i18n.localize("GUM.Equipment.Protection.RemoveDR")}"><i class="fas fa-trash"></i></button>
                        </div> 
                    </div> 
                </div> 
            </li> 
        `; 
 
        container.append(rowHtml); 
    } 
 
    _syncDrLocationKey(input) { 
        const row = input.closest("[data-dr-location-row]"); 
        if (!row) return; 
 
        const keyInput = row.querySelector(".dr-location-key"); 
        if (!keyInput) return; 
 
        const label = input.value?.trim(); 
        if (!label) { 
            keyInput.value = ""; 
            const providesLabel = row.querySelector(".dr-location-provides-label");
            if (providesLabel) providesLabel.hidden = false;
            return; 
        } 
 
        keyInput.value = this._getLocationKeyFromLabel(label); 
        const providesLabel = row.querySelector(".dr-location-provides-label");
        if (providesLabel) providesLabel.hidden = keyInput.value === "all";
    } 
 
    _getLocationKeyFromLabel(label) { 
        const normalizedLabel = String(label || "").trim().toLocaleLowerCase();
        const allLocationsLabel = game.i18n.localize("GUM.Equipment.Protection.AllLocations").toLocaleLowerCase();
        if (["all", "todos", allLocationsLabel].includes(normalizedLabel)) return "all";

        const list = this.element?.[0]?.querySelector("#gum-body-location-options"); 
        if (!list) return label; 
 
        const escape = window.CSS?.escape || ((value) => value.replace(/["\\]/g, "\\$&")); 
        const option = list.querySelector(`option[value="${escape(label)}"]`); 
        if (option?.dataset?.key) return option.dataset.key;
        const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
        const normalized = normalize(label);
        const normalizedOption = Array.from(list.querySelectorAll("option"))
            .find(candidate => normalize(candidate.value) === normalized || normalize(candidate.dataset?.key) === normalized);
        return normalizedOption?.dataset?.key || label;
    } 
}
