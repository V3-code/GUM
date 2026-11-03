import { GMModifierBrowser } from "./gm-modifier-browser.js";
import { GMMacroBrowser } from "./gm-macro-browser.js";
import { GMRollTableBrowser } from "./gm-roll-table-browser.js";
import { EffectBrowser } from "./effect-browser.js";
import { applyCurrentRollPrivacy, applyEffectWithResistance, performGURPSRoll } from "../../scripts/main.js";
import { GurpsRollPrompt } from "./roll-prompt.js";
import { GurpsDamageRollPrompt } from "./damage-roll-prompt.js";
import { GumPreviewDialog } from "./preview-dialog.js";
import { normalizeGurpsDamageExpression } from "../utils/damage-normalization.js";
import { resolveAttackDamageDisplay } from "../utils/attack-damage-display.mjs";
import { getGMScreenPlayerTargeters, isGMScreenCardTargeted, resolveGMScreenCardTarget } from "../utils/gm-screen-target.mjs";
import { getGMScreenEffectState } from "../utils/gm-screen-effect-state.mjs";
import { openTestRequestLauncher } from "./test-request-launcher.js";
import { resolveCharacterImage } from "../utils/character-image.mjs";
import { clampFloatingPanelPosition } from "../utils/floating-panel-position.mjs";
import { resolveDefenseRollType } from "../utils/defense-roll-type.mjs";
import {
    buildConfigurationBundle,
    combineConfigurationImport,
    parseConfigurationBundle
} from "../utils/configuration-bundle-json.mjs";
import { chooseConfigurationImportMode, importConfigurationBundle } from "./configuration-bundle-import.js";
import { normalizeRequestedAttributeKey } from "../utils/requested-attributes.mjs";
import { buildGMScreenClearRequest, clearGMScreenLayout, moveEntryById, moveUuidBetweenGroups, normalizeMacroExecutionMode, planGMScreenMacroExecution } from "../utils/gm-screen-layout.mjs";

const GM_SCREEN_LAYOUT_DRAG_TYPE = "GUM.GMScreenLayout";
const GM_SCREEN_LAYOUT_MIME = "application/x-gum-gm-screen-layout";

export class GumGMScreen extends Application {
    
    constructor(options = {}) {
        super(options);
        // Mapa central de seleção (UUID -> Objeto)
        this.selectedModifiers = new Map();
        
        // Cache para os inputs manuais não resetarem ao renderizar
        this.manualCache = { name: "GM.MOD", value: 0 };
        
        // Mantém a rolagem rápida durante as renderizações automáticas da tela.
        // O Escudo é renderizado novamente por várias interações e atualizações
        // de atores, portanto esses valores não podem ficar fixos no template.
        this.quickRollCache = { nh: 10, formula: "1d6", type: "cont", private: true };

        // Estado local da interface. Apenas uma ferramenta do rodapé fica
        // expandida por vez para preservar o espaço vertical da paleta.
        this.utilityPanel = null;
        this.searchQuery = "";
        // O editor de layout e local a esta janela. Somente as alteracoes
        // estruturais confirmadas por uma acao sao persistidas no mundo.
        this.layoutEditMode = false;
        this._runningMacros = new Set();
        this._runningRollTables = new Set();

        this._lastContextClick = {
            actorId: null,
            at: 0
        };

        // Evita renderizações intermediárias enquanto um lote de itens está
        // sendo aplicado. O render final é feito pela própria operação.
        this._isApplyingSelection = false;

        this.gmTabs = [
            { id: "tab-1", name: "1" },
            { id: "tab-2", name: "2" },
            { id: "tab-3", name: "3" },
            { id: "tab-4", name: "4" },
            { id: "tab-5", name: "5" }
        ];

        // O Foundry transmite a alteração de alvo de cada usuário. Assim, o
        // Escudo acompanha tanto o alvo do Mestre como os alvos dos jogadores.
        this._onTargetToken = () => this.render(false);
        Hooks.on("targetToken", this._onTargetToken);
    }

    async close(options = {}) {
        Hooks.off("targetToken", this._onTargetToken);
        this.layoutEditMode = false;
        return super.close(options);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "gum-gm-screen",
            title: game.i18n.localize("GUM.GMScreen.Title"),
            template: "systems/gum/templates/apps/gm-screen.hbs",
            width: 1200, 
            height: 750,
            minWidth: 720,
            minHeight: 420,
            resizable: true,
            classes: ["gum", "gm-screen"],
            // Preserva a posição das duas áreas roláveis quando uma seleção ou
            // atualização de ator dispara uma nova renderização da janela.
            scrollY: [".screen-body", ".monitor-body"],
            tabs: [{ navSelector: ".screen-tabs", contentSelector: ".screen-body", initial: "modifiers" },
                { navSelector: ".monitor-tabs", contentSelector: ".monitor-body", initial: "characters" }
            ],
            // O DragDrop do Foundry continua recebendo Itens externos. O
            // arraste interno usa um payload proprio e alcas explicitas.
            dragDrop: [{ dragSelector: null, dropSelector: ".group-content-area" }]
        });
    }

    _canDragDrop(_selector) {
        return this.layoutEditMode;
    }

async getData() {
        // 1. DADOS DO POOL (Personagens de Jogadores)
        // Busca apenas atores de jogadores
        const actors = game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
        const targetedTokens = Array.from(game.user?.targets ?? []);
        const playerUsers = Array.from(game.users ?? []);
        const monitorData = actors.map(actor => this._prepareActorData(actor, null, targetedTokens, playerUsers));
        monitorData.sort((a, b) => a.name.localeCompare(b.name));

        // 2. DADOS DO COMBATE (Iniciativa)
        let combatData = [];
        const combat = game.combat;
        
        if (combat && combat.combatants.size > 0) {
            combatData = combat.turns.map(c => {
                let actor = c.actor;
                
                // --- CORREÇÃO DE SINCRONIA VISUAL ---
                // Se o ator não for um token sintético (ou seja, é um PJ Linkado),
                // forçamos o uso da instância global do game.actors.
                // Isso garante que os modificadores aplicados na aba 'PJs' apareçam aqui instantaneamente.
                if (actor && !actor.isToken) {
                    actor = game.actors.get(actor.id) || actor;
                }

                if (!actor) return null; 
                
                // Prepara os dados base (Lê HP, FP e Modificadores do ator correto)
                const data = this._prepareActorData(actor, c.token, targetedTokens, playerUsers);
                
                // Adiciona dados específicos do combate
                data.combatantId = c.id;
                data.tokenId = c.tokenId; // Essencial para identificar o token na cena
                
                // --- AJUSTE DE INICIATIVA (5 CASAS DECIMAIS) ---
                if (c.initiative !== null && c.initiative !== undefined) {
                    // toFixed(5) fixa 5 casas. Number() remove zeros extras à direita.
                    // Ex: 14.20000 vira 14.2
                    data.initiative = Number(c.initiative.toFixed(5));
                } else {
                    data.initiative = "-";
                }

                data.isTurn = combat.combatant?.id === c.id; 
                data.isHidden = c.hidden;
                data.isDefeated = c.isDefeated;
                
                return data;
            }).filter(c => c !== null);
        }

             // 3. DASHBOARD (Direita) - Configuração
        const config = await this._normalizeConfig();
        const activeMainTab = config.activeTabId || this.gmTabs[0].id;
        const activeTab = (config.tabs || []).find(tab => tab.id === activeMainTab) || config.tabs?.[0];
        const groups = activeTab?.groups || [];
        await Promise.all(groups.map(async (group) => {
            const enrichedItems = await Promise.all((group.items || []).map(async (itemUuid) => {
                try {
                    const item = await fromUuid(itemUuid);
                    if (!item) return this._prepareUnavailableReference(itemUuid, group.referenceMetadata?.[itemUuid]);
                    const itemData = item.documentName === "RollTable"
                        ? { id: item.id, name: item.name, img: item.img, type: "roll-table" }
                        : item.toObject();
                    itemData.uuid = itemUuid;
                    itemData.documentName = item.documentName;
                    itemData.isMacro = item.documentName === "Macro";
                    itemData.isRollTable = item.documentName === "RollTable";
                    itemData.isSelected = item.documentName === "Item" && this.selectedModifiers.has(itemUuid);
                    if (itemData.isMacro) {
                        itemData.canExecute = item.canExecute === true;
                        itemData.macroExecutionMode = normalizeMacroExecutionMode(group.macroOptions?.[itemUuid]?.executionMode);
                        itemData.macroExecutionLabel = this._t(`GUM.GMScreen.MacroMode.${itemData.macroExecutionMode}`);
                        itemData.macroExecutionIcon = {
                            standard: "fa-bolt",
                            "single-target": "fa-crosshairs",
                            "each-target": "fa-users"
                        }[itemData.macroExecutionMode];
                        itemData.macroRunning = this._runningMacros.has(`${group.id}:${itemUuid}`);
                    }
                    if (itemData.isRollTable) {
                        itemData.canDraw = item.visible !== false;
                        itemData.rollTableRunning = this._runningRollTables.has(`${group.id}:${itemUuid}`);
                    }
                    if (itemData.type === "gm_modifier") {
                        const presentation = this._formatModifierExpression(itemData.system?.modifier);
                        itemData.modifierDisplay = presentation.text;
                        itemData.modifierCompactDisplay = presentation.numeric ? presentation.text : "ƒ";
                        itemData.modifierIsNegative = presentation.numeric && presentation.value < 0;
                        itemData.modifierIsExpression = !presentation.numeric;
                    }
                    return itemData;
                } catch (e) {
                    return this._prepareUnavailableReference(itemUuid, group.referenceMetadata?.[itemUuid]);
                }
            }));
            group.unavailableItemCount = enrichedItems.filter(item => item.isUnavailable).length;
            group.unavailableItemsHint = this._t("GUM.GMScreen.UnavailableReferencesHint", { count: group.unavailableItemCount });
            group.itemCount = enrichedItems.length;
            group.selectedCount = enrichedItems.filter(item => item.isSelected).length;
            group.sortMode = group.sortMode === "manual" ? "manual" : "auto";
            group.isManualOrder = group.sortMode === "manual";
            group.enrichedItems = group.isManualOrder
                ? enrichedItems
                : enrichedItems.sort((a, b) => this._compareGroupedItems(a, b));
        }));

        const mainTabs = (config.tabs || this.gmTabs.map(tab => ({ ...tab, groups: [] }))).map(tab => ({
            ...tab,
            selectedCount: new Set((tab.groups || [])
                .flatMap(group => group.items || [])
                .filter(uuid => this.selectedModifiers.has(uuid))).size
        }));

        const selectionCount = this.selectedModifiers.size;
        const selectionTotal = this._getTotalActiveModifier();
        const selectionHasExpressions = Array.from(this.selectedModifiers.values()).some(mod =>
            mod?.type === "gm_modifier" && !this._formatModifierExpression(mod.value).numeric
        );
        const signedValue = value => `${value > 0 ? "+" : ""}${value}`;

        return {
            actors: monitorData,
            combatants: combatData,
            hasCombat: !!(combat && combat.combatants.size > 0), 
            groups,
            mainTabs,
            canDeleteTabs: mainTabs.length > 1,
            activeMainTab,
            isManualActive: this.selectedModifiers.has("manual"),
            manualCache: this.manualCache,
            quickRollCache: this.quickRollCache,
            searchQuery: this.searchQuery,
            selectionCount,
            selectionTotalText: selectionHasExpressions ? "ƒ" : signedValue(selectionTotal),
            manualTotalText: signedValue(Number(this.manualCache.value) || 0),
            utilityPanel: this.utilityPanel,
            quickRollOpen: this.utilityPanel === "quick-roll",
            manualOpen: this.utilityPanel === "manual-modifier",
            layoutEditMode: this.layoutEditMode
        };
    }

    /**
     * Helper para extrair dados vitais de um ator (Reuso de código)
     */
 _prepareActorData(actor, token = null, targetedTokens = [], playerUsers = []) {
        const attr = actor.system.attributes;
        const encumbranceNames = ["None", "Light", "Medium", "Heavy", "ExtraHeavy"]
            .map(level => game.i18n.localize(`GUM.GMScreen.Encumbrance${level}`));
        const encumbranceLevel = Math.min(4, Math.max(0, Number(actor.system.encumbrance?.level_value) || 0));
        const getFinalValue = (attribute, fallback = 0) => {
            const value = attribute?.final ?? attribute?.final_computed ?? attribute?.value ?? fallback;
            return Number.isFinite(Number(value)) ? Number(value) : fallback;
        };
        const formatSignedValue = (value) => value > 0 ? `+${value}` : String(value);
        const prepareResource = (attribute) => {
            const value = Number(attribute?.value) || 0;
            const max = getFinalValue(attribute, Number(attribute?.max) || 0);
            const percent = max > 0 ? (value / max) * 100 : 0;

            return {
                value,
                max,
                percent: Math.min(100, Math.max(0, percent))
            };
        };
        const activeGMModsRaw = actor.getFlag("gum", "gm_modifiers") || [];
        const activeGMMods = [];
        const groupedMods = new Map();

        const formatModifierValue = value => this._formatModifierExpression(value).text;

        for (const mod of activeGMModsRaw) {
            const groupId = mod?.applicationGroupId || null;

            if (!groupId) {
                const presentation = this._formatModifierExpression(mod?.value);
                activeGMMods.push({
                    ...mod,
                    displayName: mod?.name || game.i18n.localize("GUM.GMScreen.Modifier"),
                    displayValue: presentation.numeric ? presentation.value : null,
                    displayValueText: presentation.numeric ? presentation.text : "ƒ",
                    displayExpression: presentation.numeric ? "" : presentation.text,
                    removalGroupId: null
                });
                continue;
            }

            if (!groupedMods.has(groupId)) {
                groupedMods.set(groupId, {
                    displayName: mod?.sourceItemName || mod?.name || game.i18n.localize("GUM.GMScreen.Modifier"),
                    displayValue: 0,
                    displayValues: [],
                    displayExpressions: [],
                    displayValueText: "",
                    displayExpression: "",
                    removalGroupId: groupId
                });
            }

            const grouped = groupedMods.get(groupId);
            const presentation = this._formatModifierExpression(mod?.value);
            if (presentation.numeric) grouped.displayValue += presentation.value;
            grouped.displayValues.push(presentation.numeric ? presentation.text : "ƒ");
            if (!presentation.numeric) grouped.displayExpressions.push(presentation.text);
            grouped.displayValueText = grouped.displayValues.join(" | ");
            grouped.displayExpression = grouped.displayExpressions.join(" | ");
        }

 activeGMMods.push(...groupedMods.values());
        const activeGMEffects = Array.from(actor.effects || [])
            .map(effect => ({ effect, state: getGMScreenEffectState(effect) }))
            .filter(({ state }) => state.visible)
            .map(({ effect, state }) => ({
                id: effect.id,
                name: effect.name,
                isPending: state.pending,
                statusLabel: state.pendingReason
            }));

        return {
            id: actor.id,
            name: actor.name,
            img: resolveCharacterImage(actor, {
                token,
                sourceActor: game.actors.get(actor.id)
            }),
            hp: prepareResource(attr.hp),
            fp: prepareResource(attr.fp),
            defenses: {
                dodge: getFinalValue(attr.dodge)
            },
            move: getFinalValue(attr.basic_move),
            encumbrance: encumbranceNames[encumbranceLevel],
            sizeModifier: formatSignedValue(getFinalValue(attr.mt)),
            isTargeted: isGMScreenCardTargeted({ actor, token }, targetedTokens),
            playerTargeters: getGMScreenPlayerTargeters({ actor, token }, playerUsers),
            activeGMMods,
            activeGMEffects,
            hasActiveGMBadges: activeGMMods.length > 0 || activeGMEffects.length > 0
        };
    }

    /**
     * Resolve o alvo de um card sem depender de haver uma cena ativa.
     * Combatentes têm prioridade para preservar atores sintéticos de tokens
     * não vinculados; cards da aba PJs recaem no ator global.
     */
    _resolveCardTarget(card) {
        const actorId = card.data('actor-id');
        const tokenId = card.data('token-id');
        const combatantId = card.data('combatant-id');
        return resolveGMScreenCardTarget(
            { actorId, tokenId, combatantId },
            { gameRef: game, canvasRef: globalThis.canvas }
        );
    }

    _getGroupedItemModifierValue(item) {
        if (item?.type !== "gm_modifier") return null;
        const presentation = this._formatModifierExpression(item.system?.modifier);
        return presentation.numeric ? presentation.value : null;
    }

    _formatModifierExpression(value) {
        const source = String(value ?? "").trim() || "0";
        const numeric = /^[+-]?\d+(?:\.\d+)?$/.test(source);
        const resolved = numeric ? Number(source) : null;
        return {
            numeric,
            value: resolved,
            text: numeric ? `${resolved > 0 ? "+" : ""}${resolved}` : source
        };
    }

    _compareGroupedItems(a, b) {
        const valueA = this._getGroupedItemModifierValue(a);
        const valueB = this._getGroupedItemModifierValue(b);
        const hasValueA = valueA !== null;
        const hasValueB = valueB !== null;

        if (hasValueA && hasValueB && valueA !== valueB) return valueA - valueB;
        if (hasValueA !== hasValueB) return hasValueA ? -1 : 1;

        const nameA = String(a?.name || "");
        const nameB = String(b?.name || "");
        return nameA.localeCompare(nameB, game.i18n?.lang || undefined, { sensitivity: "base" });
    }

    _inferReferenceDocumentName(uuid) {
        const parts = String(uuid || "").split(".");
        return ["Macro", "RollTable", "Item"].find(type => parts.includes(type)) || "Document";
    }

    _referenceTypeLabel(documentName, itemType = "") {
        if (documentName === "Macro") return this._t("GUM.GMScreen.ReferenceTypeMacro");
        if (documentName === "RollTable") return this._t("GUM.GMScreen.ReferenceTypeRollTable");
        if (itemType === "effect") return this._t("GUM.GMScreen.ReferenceTypeEffect");
        if (itemType === "gm_modifier") return this._t("GUM.GMScreen.ReferenceTypeModifier");
        return this._t("GUM.GMScreen.ReferenceTypeDocument");
    }

    _prepareUnavailableReference(uuid, rawMetadata = {}) {
        const metadata = rawMetadata && typeof rawMetadata === "object" ? rawMetadata : {};
        const documentName = metadata.documentName || this._inferReferenceDocumentName(uuid);
        const type = metadata.type || "unavailable";
        const typeLabel = this._referenceTypeLabel(documentName, type);
        return {
            uuid,
            name: metadata.name || this._t("GUM.GMScreen.UnavailableReferenceName", { type: typeLabel }),
            img: metadata.img || "icons/svg/hazard.svg",
            documentName,
            type,
            isMacro: documentName === "Macro",
            isRollTable: documentName === "RollTable",
            isUnavailable: true,
            isSelected: false,
            unavailableHint: this._t("GUM.GMScreen.UnavailableReferenceHint", { uuid })
        };
    }

    _t(key, data = null) {
        return data ? game.i18n.format(key, data) : game.i18n.localize(key);
    }

    _applyModifierSearch(html) {
        const normalize = value => String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase(game.i18n?.lang || undefined)
            .trim();
        const query = normalize(this.searchQuery);

        html.find('.modifier-group').each((index, element) => {
            const group = $(element);
            const groupMatches = normalize(group.find('.group-title').first().text()).includes(query);
            let visibleItems = 0;

            group.find('.palette-mod').each((itemIndex, itemElement) => {
                const item = $(itemElement);
                const matches = !query || groupMatches || normalize(item.find('.mod-name').text()).includes(query);
                item.toggle(matches);
                if (matches) visibleItems++;
            });

            group.toggle(!query || groupMatches || visibleItems > 0);
            group.toggleClass('is-search-expanded', Boolean(query && visibleItems > 0));
        });
    }
    
activateListeners(html) {
        super.activateListeners(html);
        this._activateLayoutEditor(html);
        html.on('keydown.gm-layout-editor', ev => {
            if (ev.key !== 'Escape' || !this.layoutEditMode) return;
            ev.preventDefault();
            this.layoutEditMode = false;
            this.render(false);
        });
        html.find('.palette-mod, .monitor-card, .group-actions-menu a, .mod-quick-view, .macro-open-btn, .roll-table-open-btn, .delete-mod-btn, .move-item-btn').on('keydown', ev => {
            if (!['Enter', ' '].includes(ev.key)) return;
            ev.preventDefault();
            $(ev.currentTarget).trigger('click');
        });
        html.find('.gm-request-test').click(event => {
            event.preventDefault();
            if (this.layoutEditMode) return;
            openTestRequestLauncher();
        });

        html.find('.layout-edit-toggle').click(ev => {
            ev.preventDefault();
            this.layoutEditMode = !this.layoutEditMode;
            this.utilityPanel = null;
            this.render(false);
        });

        html.find('.main-tab-btn').click(async ev => {
            ev.preventDefault();
            const tabId = $(ev.currentTarget).data('tab-id');
            if (!tabId) return;
            await this._setActiveMainTab(tabId);
        });
        
        // Atualiza display do rolador assim que abre
        this._updateQRDisplay(html);

        
        // Preserva os dados digitados caso qualquer outra ação provoque uma
        // nova renderização do Escudo antes de a rolagem ser efetuada.
        html.find('.qr-formula').on('input change', ev => {
            this.quickRollCache.formula = ev.currentTarget.value;
        });
        html.find('.qr-type').on('input change', ev => {
            this.quickRollCache.type = ev.currentTarget.value;
        });
        html.find('.qr-nh').on('input change', ev => {
            this.quickRollCache.nh = Number(ev.currentTarget.value) || 0;
        });

        html.find('.gm-utility-toggle').click(ev => {
            ev.preventDefault();
            if (this.layoutEditMode) return;
            const panel = $(ev.currentTarget).data('utility-panel');
            this.utilityPanel = this.utilityPanel === panel ? null : panel;
            this.render(false);
        });

        // ===========================================================
        // 1. APLICAÇÃO DE MODIFICADOR (CLIQUE NO CARD)
        // ===========================================================
        html.find('.monitor-card').click(async ev => {
            if (this.layoutEditMode) return;
            // Ignora cliques em botões internos (remover, link, etc)
            if ($(ev.target).closest('.remove-mod, .remove-effect, .actor-identity, .active-mod-tag').length) return;
            
            // Se nada selecionado, não faz nada
            if (this.selectedModifiers.size === 0) return;

            const card = $(ev.currentTarget);
            const { actor, token } = this._resolveCardTarget(card);

            // 3. Aplica
            if (actor) {
                // Shift funciona como uma ação temporária de "manter seleção" para
                // permitir a aplicação da mesma seleção em outros personagens.
                const keepSelection = ev.shiftKey;

                // Atualiza cache do manual se necessário (caso tenha digitado e não ativado)
                if (this.selectedModifiers.has("manual")) {
                    this.selectedModifiers.set("manual", { 
                        type: "manual",
                        isManual: true,
                        name: this.manualCache.name, 
                        value: this.manualCache.value 
                    });
                }

                // Desmarca imediatamente no DOM. A aplicação de alguns tipos de
                // ação (por exemplo, alteração de recurso) atualiza o ator durante
                // o processamento e pode disparar uma renderização intermediária.
                if (!keepSelection) {
                    const currentHtml = this.element;
                    currentHtml.find('.palette-mod.active').removeClass('active');
                    currentHtml.find('.manual-mod-toolbar.active').removeClass('active');
                    this._updateQRDisplay(currentHtml);
                }

                await this._applySelectionToActor(actor, token, { keepSelection });
                
                // Feedback visual (Piscar Verde)
                card.addClass('flash-success');
                setTimeout(() => card.removeClass('flash-success'), 500);
            } else {
                ui.notifications.warn(this._t("GUM.GMScreen.ActorNotFound"));
            }
        });

        // ===========================================================
        // 2. REMOÇÃO DE MODIFICADOR (CLIQUE NO X DA TAG)
        // ===========================================================
        html.find('.remove-mod').click(async ev => {
            if (this.layoutEditMode) return;
            ev.stopPropagation(); // Não ativa o clique do card
            
            const tag = $(ev.currentTarget).closest('.active-mod-tag');
            const index = tag.data('index');
            const groupId = tag.data('group-id');
            
            // Busca o card pai para pegar os IDs
            const card = tag.closest('.monitor-card');
            const { actor } = this._resolveCardTarget(card);

            if (actor) {
                // Remove o item do array de flags
                const mods = actor.getFlag("gum", "gm_modifiers") || [];
                const updatedMods = groupId
                    ? mods.filter(mod => mod?.applicationGroupId !== groupId)
                    : (() => {
                        const clone = [...mods];
                        clone.splice(index, 1);
                        return clone;
                    })();
                
                // Salva de volta
                await actor.setFlag("gum", "gm_modifiers", updatedMods);
                
                // O Hook 'updateActor' no main.js vai cuidar de renderizar a tela
            } else {
 ui.notifications.warn(this._t("GUM.GMScreen.ActorNotFoundForModifierRemoval"));
            }
        });

        // ===========================================================
        // 2.1 REMOÇÃO DE EFEITO DO ESCUDO DO MESTRE (CLIQUE NO X DA TAG)
        // ===========================================================
        html.find('.remove-effect').click(async ev => {
            if (this.layoutEditMode) return;
            ev.stopPropagation();

            const tag = $(ev.currentTarget).closest('.active-mod-tag');
            const effectId = tag.data('effect-id');

            const card = tag.closest('.monitor-card');
            const { actor } = this._resolveCardTarget(card);

            if (!actor || !effectId) {
                return ui.notifications.warn(this._t("GUM.GMScreen.EffectNotFoundForRemoval"));
            }

            const effect = actor.effects.get(effectId);
            const source = foundry.utils.getProperty(effect, "flags.gum.source");

            if (!effect || source !== "GM Screen") {
                return ui.notifications.warn(this._t("GUM.GMScreen.OnlyGMScreenEffectsCanBeRemoved"));
            }

            await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
        });

        // ===========================================================
        // 3. SELEÇÃO NA PALETA E MANUAL
        // ===========================================================

// Seleção na Paleta (Toggle)
        html.find('.palette-mod').click(ev => {
            ev.preventDefault();
            if (this.layoutEditMode) return;
            if ($(ev.target).closest('.mod-hover-controls').length) return;

            const btn = $(ev.currentTarget);
            if (btn.hasClass('is-unavailable')) return;
            if (btn.data('documentName') !== 'Item') return;
            const itemType = btn.data('item-type') || "gm_modifier";
            const modUuid = btn.data('uuid');
            const modValue = btn.data('value');
            const modCap = btn.data('cap'); // ✅ LÊ O TETO DO HTML
            const modName = btn.find('.mod-name').text().trim();

            this.selectedModifiers.delete("manual");

            if (this.selectedModifiers.has(modUuid)) {
                this.selectedModifiers.delete(modUuid);
            } else {
                if (itemType === "effect") {
                    this.selectedModifiers.set(modUuid, {
                        type: "effect",
                        name: modName,
                        uuid: modUuid
                    });
                } else {
                    // ✅ SALVA O TETO NO MAPA DE SELEÇÃO
                    this.selectedModifiers.set(modUuid, { 
                        type: "gm_modifier",
                        name: modName, 
                        value: modValue,
                        cap: modCap 
                    });
                }
            }
            this.render(false);
        });

        // Ativar Manual
        html.find('.activate-manual-btn').click(ev => {
            ev.preventDefault();
            if (this.layoutEditMode) return;
            if (this.selectedModifiers.has("manual")) {
                this.selectedModifiers.delete("manual");
            } else {
                this.selectedModifiers.clear(); // Limpa paleta
                this.selectedModifiers.set("manual", { 
                    type: "manual",
                    name: this.manualCache.name, 
                    value: this.manualCache.value,
                    isManual: true
                });
            }
            this.render(false);
        });

        // Inputs Manuais (Nome/Valor)
        html.find('.manual-name').on('input', ev => {
            this.manualCache.name = ev.target.value;
            if (this.selectedModifiers.has("manual")) this.selectedModifiers.get("manual").name = ev.target.value;
        });
        
        html.find('.manual-value').on('input', ev => { 
            this.manualCache.value = parseInt(ev.target.value) || 0; 
            if (this.selectedModifiers.has("manual")) this.selectedModifiers.get("manual").value = this.manualCache.value; 
            this._updateManualDockTotal(html);
            this._updateQRDisplay(html); 
        });

        // Botões de Passo (+/-)
        html.find('.step-btn').click(ev => {
            ev.preventDefault();
            if (this.layoutEditMode) return;
            const action = $(ev.currentTarget).data('action');
            let current = parseInt(this.manualCache.value) || 0;
            if (action === 'inc') current += 1;
            if (action === 'dec') current -= 1;
            
            this.manualCache.value = current;
            html.find('.manual-value').val(current);
            if (this.selectedModifiers.has("manual")) this.selectedModifiers.get("manual").value = current;
            this._updateManualDockTotal(html);
            this._updateQRDisplay(html);
        });

        // Botões de Preset (-6, +4...)
        html.find('.preset-btn').click(ev => {
            ev.preventDefault();
            if (this.layoutEditMode) return;
            const val = parseInt($(ev.currentTarget).data('val'));
            this.manualCache.value = val;
            html.find('.manual-value').val(val);
            
            this.selectedModifiers.clear();
            this.selectedModifiers.set("manual", { 
                type: "manual",
                name: this.manualCache.name, 
                value: val, 
                isManual: true 
            });
            this.render(false);
        });

        // Limpar Seleção
        html.find('.clear-selection-btn').click(ev => {
            ev.preventDefault();
            if (this.layoutEditMode) return;
            this.selectedModifiers.clear();
            this.render(false);
        });

        // Busca (Filtro)
        html.find('.mod-search').on('input', ev => {
            this.searchQuery = ev.target.value;
            this._applyModifierSearch(html);
        });
        this._applyModifierSearch(html);

        // ===========================================================
        // 4. GESTÃO DE GRUPOS (CRUD)
        // ===========================================================
        
        html.find('.mod-quick-view').click(async ev => {
            ev.stopPropagation(); ev.preventDefault();
            const uuid = $(ev.currentTarget).closest('.palette-mod').data('uuid');
            const item = await fromUuid(uuid);
            if (!item) return;
            this._showQuickView(item);
        });
        
        html.find('.add-group-btn').click(async ev => {
            if (!this.layoutEditMode) return;
            new Dialog({
                title: this._t("GUM.GMScreen.NewGroup"), content: `<div class="form-group"><label>${this._t("GUM.GMScreen.Name")}:</label><input type="text" id="group-name" autofocus/></div>`,
                buttons: { create: { label: this._t("GUM.GMScreen.Create"), callback: async (html) => { const name = html.find('#group-name').val(); if(name) await this._addGroup(name); } } }, default: "create"
            }).render(true);
        });

        html.find('.bulk-clear-layout-btn').click(ev => {
            ev.preventDefault();
            if (!this.layoutEditMode) return;
            this._openBulkClearDialog();
        });

  html.find('.group-collapse-toggle').click(async ev => {
            ev.preventDefault();
            const groupId = $(ev.currentTarget).data('group-id');
            await this._toggleGroupCollapse(groupId);
        });

        html.find('.group-menu-trigger').click(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const trigger = $(ev.currentTarget);
            const actions = trigger.closest('.group-actions');
            const isOpen = actions.hasClass('is-open');

            html.find('.group-actions.is-open').removeClass('is-open');
            html.find('.group-menu-trigger').attr('aria-expanded', 'false');
            if (!isOpen) {
                actions.addClass('is-open');
                trigger.attr('aria-expanded', 'true');
            }
        });

        html.on('click', '.edit-group-name-btn', async ev => {
            ev.preventDefault();
            if (!this.layoutEditMode) return;
            const button = $(ev.currentTarget);
            const groupId = button.data('group-id');
            const currentName = button.data('group-name') || '';
            const escapedCurrentName = foundry.utils.escapeHTML(String(currentName));

            new Dialog({
                title: this._t("GUM.GMScreen.RenameGroup"),
                content: `<div class="form-group"><label>${this._t("GUM.GMScreen.Name")}:</label><input type="text" id="group-name" value="${escapedCurrentName}" autofocus/></div>`,
                buttons: {
                    save: {
                        label: this._t("GUM.GMScreen.Save"),
                        callback: async dialogHtml => {
                            const newName = dialogHtml.find('#group-name').val()?.trim();
                            if (newName) await this._renameGroup(groupId, newName);
                        }
                    }
                },
                default: "save"
            }).render(true);
        });
        
        html.find('.delete-group-btn').click(async ev => {
            if (!this.layoutEditMode) return;
            const groupId = $(ev.currentTarget).data('group-id');
            Dialog.confirm({ title: this._t("GUM.GMScreen.DeleteGroup"), content: `<p>${this._t("GUM.GMScreen.ConfirmDeleteGroup")}</p>`, yes: () => this._removeGroup(groupId) });
        });
        
        html.find('.add-mod-to-group-btn').click(ev => {
            if (!this.layoutEditMode) return;
            const groupId = $(ev.currentTarget).data('group-id');
            new GMModifierBrowser({ onSelect: async (items) => { await this._addItemsToGroup(groupId, items); } }).render(true);
        });

        html.find('.add-effect-to-group-btn').click(ev => {
            if (!this.layoutEditMode) return;
            const groupId = $(ev.currentTarget).data('group-id');
            new EffectBrowser(null, { onSelect: async (items) => { await this._addItemsToGroup(groupId, items); } }).render(true);
        });

        html.find('.add-macro-to-group-btn').click(ev => {
            if (!this.layoutEditMode) return;
            const groupId = $(ev.currentTarget).data('group-id');
            new GMMacroBrowser({ onSelect: async macros => { await this._addItemsToGroup(groupId, macros); } }).render(true);
        });

        html.find('.add-roll-table-to-group-btn').click(ev => {
            if (!this.layoutEditMode) return;
            const groupId = $(ev.currentTarget).data('group-id');
            new GMRollTableBrowser({ onSelect: async tables => { await this._addItemsToGroup(groupId, tables); } }).render(true);
        });
        
        html.find('.delete-mod-btn').click(async ev => {
            ev.stopPropagation();
            if (!this.layoutEditMode) return;
            const uuid = $(ev.currentTarget).closest('.palette-mod').data('uuid');
            const groupId = $(ev.currentTarget).closest('.modifier-group').data('group-id');
            await this._removeItemFromGroup(groupId, uuid);
        });

        html.find('.rename-main-tab-btn').click(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            if (!this.layoutEditMode) return;
            const button = $(ev.currentTarget);
            this._promptRenameMainTab(button.data('tab-id'), button.data('tab-name') || '');
        });

        html.find('.add-main-tab-btn').click(ev => {
            ev.preventDefault();
            if (!this.layoutEditMode) return;
            this._promptCreateMainTab();
        });

        html.find('.delete-main-tab-btn').click(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            if (!this.layoutEditMode) return;
            this._confirmRemoveMainTab($(ev.currentTarget).data('tab-id'));
        });

        html.find('.move-group-btn').click(async ev => {
            ev.preventDefault();
            if (!this.layoutEditMode) return;
            await this._moveGroup($(ev.currentTarget).data('group-id'), Number($(ev.currentTarget).data('offset')) || 0);
        });

        html.find('.toggle-group-sort-btn').click(async ev => {
            ev.preventDefault();
            if (!this.layoutEditMode) return;
            await this._toggleGroupSortMode($(ev.currentTarget).data('group-id'));
        });

        html.find('.move-item-btn').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            if (!this.layoutEditMode) return;
            const item = $(ev.currentTarget).closest('.palette-mod');
            await this._moveItemByOffset(
                item.closest('.modifier-group').data('group-id'),
                item.data('uuid'),
                Number($(ev.currentTarget).data('offset')) || 0
            );
        });

        html.find('.macro-execution-mode').on('change', async ev => {
            if (!this.layoutEditMode) return;
            const item = $(ev.currentTarget).closest('.palette-mod');
            await this._setMacroExecutionMode(
                item.closest('.modifier-group').data('group-id'),
                item.data('uuid'),
                ev.currentTarget.value
            );
        });

        html.find('.macro-run-btn').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            if (this.layoutEditMode) return;
            const button = $(ev.currentTarget);
            const item = button.closest('.palette-mod');
            await this._executeMacroFromGroup(
                item.closest('.modifier-group').data('group-id'),
                item.data('uuid'),
                button
            );
        });

        html.find('.macro-open-btn').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const macro = await fromUuid($(ev.currentTarget).closest('.palette-mod').data('uuid')).catch(() => null);
            macro?.sheet?.render(true);
        });

        html.find('.roll-table-draw-btn').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            if (this.layoutEditMode) return;
            const button = $(ev.currentTarget);
            const item = button.closest('.palette-mod');
            await this._drawRollTableFromGroup(
                item.closest('.modifier-group').data('group-id'),
                item.data('uuid'),
                button
            );
        });

        html.find('.roll-table-open-btn').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const table = await fromUuid($(ev.currentTarget).closest('.palette-mod').data('uuid')).catch(() => null);
            table?.sheet?.render(true);
        });

        html.on('click', ev => {
            const target = $(ev.target);
            if (!target.closest('.group-actions').length) {
                html.find('.group-actions.is-open').removeClass('is-open');
                html.find('.group-menu-trigger').attr('aria-expanded', 'false');
            }
        });

        // ===========================================================
        // 5. CONTROLES DE COMBATE
        // ===========================================================
        
        html.find('.next-turn').click(async ev => {
            if (this.layoutEditMode) return;
            ev.preventDefault();
            if (game.combat) await game.combat.nextTurn();
        });

        html.find('.prev-turn').click(async ev => {
            if (this.layoutEditMode) return;
            ev.preventDefault();
            if (game.combat) await game.combat.previousTurn();
        });

        html.find('.end-combat').click(async ev => {
            if (this.layoutEditMode) return;
            ev.preventDefault();
            if (game.combat) {
                Dialog.confirm({
                    title: this._t("GUM.GMScreen.EndCombat"),
                    content: `<p>${this._t("GUM.GMScreen.ConfirmEndCombat")}</p>`,
                    yes: () => game.combat.endCombat()
                });
            }
        });

        // ===========================================================
        // 6. ROLADOR RÁPIDO
        // ===========================================================

        html.find('.qr-toggle-mode').click(ev => {
            if (this.layoutEditMode) return;
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            btn.toggleClass('active');
            this.quickRollCache.private = btn.hasClass('active');
            const icon = btn.find('i');
            if (btn.hasClass('active')) {
                icon.removeClass('fa-eye').addClass('fa-eye-slash');
                const label = game.i18n.localize('GUM.GMScreen.PrivateMode');
                btn.attr({ title: label, 'aria-label': label });
            } else {
                icon.removeClass('fa-eye-slash').addClass('fa-eye');
                const label = game.i18n.localize('GUM.GMScreen.PublicMode');
                btn.attr({ title: label, 'aria-label': label });
            }
        });

        html.find('.roll-test').click(async ev => {
            if (this.layoutEditMode) return;
            ev.preventDefault();
            const nhBase = parseInt(html.find('.qr-nh').val()) || 10;
            const activeModsTotal = this._getTotalActiveModifier(); 
            const isPrivate = html.find('.qr-toggle-mode').hasClass('active');
            
            const fallbackFormula = "3d6";
            const configuredFormula = (game.settings.get("gum", "defaultSkillRollFormula") || fallbackFormula).toString().trim() || fallbackFormula;
            let rollFormula = configuredFormula;
            let roll;
            try {
                roll = new Roll(rollFormula);
            } catch (_err) {
                rollFormula = fallbackFormula;
                roll = new Roll(rollFormula);
            }
            await roll.evaluate();
            const total = roll.total;
            const effectiveLevel = nhBase + activeModsTotal;
            const isSuccess = total <= effectiveLevel;
            const margin = Math.abs(effectiveLevel - total);
            
            if (isPrivate) {
                const resultBox = html.find('.qr-result-display');
                const colorClass = isSuccess ? "success" : "failure";
                const text = isSuccess ? this._t("GUM.GMScreen.Success") : this._t("GUM.GMScreen.Failure");
                const resultHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><span><i class="fas fa-dice"></i> <strong>${total}</strong></span><span>vs <strong>${effectiveLevel}</strong> <small>(${activeModsTotal >= 0 ? '+' : ''}${activeModsTotal})</small></span><span class="${colorClass}" style="text-transform:uppercase; font-weight:bold;">${text} (${margin})</span></div>`;
                resultBox.removeClass("success failure").addClass(colorClass).html(resultHTML).slideDown(100);
            } else {
                const gmActor = { name: this._t("GUM.GMScreen.GameMaster"), img: "icons/svg/mystery-man.svg", id: null };
                await performGURPSRoll(gmActor, {
                    label: this._t("GUM.GMScreen.QuickCheckLabel"),
                    value: effectiveLevel, 
                    originalValue: nhBase,
                    modifier: activeModsTotal,
                    img: "icons/svg/d20.svg"
                });
            }
        });

        html.find('.roll-damage').click(async ev => {
            if (this.layoutEditMode) return;
            ev.preventDefault();
            const formula = html.find('.qr-formula').val();
            const type = html.find('.qr-type').val() || ""; 
            if (!formula) return;

            const roll = new Roll(formula);
            await roll.evaluate();
            const diceHtml = roll.dice.flatMap(d => d.results).map(r => `<span class="die-face" style="font-size:0.8em; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #ccc; border-radius:2px; margin:0 1px;">${r.result}</span>`).join('');
            
            const quickDamageLabel = this._t("GUM.GMScreen.QuickDamage");
            const content = `<div class="gurps-damage-card"><header class="card-header"><h3>${quickDamageLabel}</h3></header><div class="card-formula-container"><span class="formula-pill">${formula} ${type}</span></div><div class="card-content"><div class="card-main-flex"><div class="roll-column"><span class="column-label">${this._t("GUM.GMScreen.Dice")}</span><div class="individual-dice-damage">${diceHtml}</div></div><div class="column-separator"></div><div class="target-column"><span class="column-label">${this._t("GUM.GMScreen.Total")}</span><div class="damage-total"><span class="damage-value">${roll.total}</span><span class="damage-type" style="font-size:0.5em; vertical-align:middle;">${type}</span></div></div></div></div><footer class="card-actions"><button type="button" class="apply-damage-button" data-damage='${JSON.stringify({attackerId: null, sourceName: quickDamageLabel, main: { total: roll.total, type: type, armorDivisor: 1 }, onDamageEffects: {}, generalConditions: {}})}'><i class="fas fa-crosshairs"></i> ${this._t("GUM.GMScreen.Apply")}</button></footer></div>`;

            const chatData = applyCurrentRollPrivacy({
                user: game.user.id,
                speaker: { alias: this._t("GUM.GMScreen.GameMaster") },
                content,
                rolls: [roll]
            });
            await ChatMessage.create(chatData);
        });
    
        // ===========================================================
        // MENU DE CONTEXTO (CLIQUE DIREITO)
        // ===========================================================
        html.find('.monitor-card').contextmenu(async ev => {
            if (this.layoutEditMode) return;
            ev.preventDefault();
            ev.stopPropagation();

            // Remove menus antigos se existirem
            $('.gum-ctx-menu').remove();

            const card = $(ev.currentTarget);
            const { actor } = this._resolveCardTarget(card);

            if (actor) {
                const now = Date.now();
                const isDoubleRightClick = this._lastContextClick.actorId === actor.id && (now - this._lastContextClick.at) <= 350;
                this._lastContextClick = { actorId: actor.id, at: now };

                if (ev.shiftKey || isDoubleRightClick) {
                    actor.sheet?.render(true);
                    return;
                }

                this._createContextMenu(actor, ev.clientX, ev.clientY);
            }
        });

        // Fechar menu ao clicar em qualquer lugar
        $(document).on('click.gum-ctx', (e) => {
            if (!$(e.target).closest('.gum-ctx-menu').length) {
                $('.gum-ctx-menu').remove();
            }
        });
    
    }

/**
     * Helper: Resolve fórmulas como "GdP+1" para "1d6-1" usando os dados do ator
     */
    _resolveDamageFormula(actor, rawFormula) {
        if (!rawFormula) return null;
        
    return resolveAttackDamageDisplay(rawFormula, actor.system.attributes || {});
    }

/**
     * Constrói e exibe o menu de contexto flutuante (OTIMIZADO EM GRADE)
     */
    _createContextMenu(actor, x, y) {
        const system = actor.system || {};
        const attr = system.attributes || {};
        const itemsArray = actor.items.contents || (Array.isArray(actor.items) ? actor.items : []);

        let html = `<div class="gum-ctx-menu" style="top:${y}px; left:${x}px;">`;
        html += `<div class="gum-ctx-header" title="${this._t("GUM.GMScreen.DragQuickMenuHint")}"><i class="fas fa-grip-lines" aria-hidden="true"></i><span>${actor.name}</span></div>`;
        
        // ---------------------------------------------------------
        // 1. ATRIBUTOS (GRADE COMPACTA)
        // ---------------------------------------------------------
        
        // Helper seguro para valor
        const getVal = (obj) => {
            if (!obj) return 10;
            return (obj.final !== undefined && obj.final !== null) ? obj.final : (obj.value !== undefined ? obj.value : 10);
        };

        // --- LINHA 1: PRINCIPAIS (ST, DX, IQ, HT) ---
        html += `<div class="gum-ctx-stats-grid">`;
        ['st', 'dx', 'iq', 'ht'].forEach(key => {
            const obj = attr[key] || attr[key.toUpperCase()];
            // Mesmo se não achar, mostra 10 para manter o grid alinhado
            const val = obj ? getVal(obj) : 10; 
            html += `<div class="gum-ctx-stat-box roll-attr" data-attr="${key.toUpperCase()}" data-val="${val}">
                        <span class="stat-label">${key.toUpperCase()}</span>
                        <span class="stat-value">${val}</span>
                     </div>`;
        });
        html += `</div>`;

        // --- LINHA 2: SECUNDÁRIOS (Per, Vont, Esq) ---
        // Busca robusta por Percepção e Vontade
        const perObj = attr.per || attr.Per || attr.PER || attr.perception;
        const willObj = attr.will || attr.Will || attr.WILL || attr.willpower;
        const dodgeObj = attr.dodge;

        const perVal = perObj ? getVal(perObj) : 10;
        const willVal = willObj ? getVal(willObj) : 10;
        const dodgeVal = dodgeObj ? getVal(dodgeObj) : 0;

        html += `<div class="gum-ctx-stats-grid secondary">`;
        
        // Percepção
        html += `<div class="gum-ctx-stat-box roll-attr" data-attr="Percepção" data-val="${perVal}">
                    <span class="stat-label">PER</span>
                    <span class="stat-value">${perVal}</span>
                 </div>`;
        
        // Vontade
        html += `<div class="gum-ctx-stat-box roll-attr" data-attr="Vontade" data-val="${willVal}">
                    <span class="stat-label">VONT</span>
                    <span class="stat-value">${willVal}</span>
                 </div>`;
                 
        // Esquiva
        html += `<div class="gum-ctx-stat-box roll-def" data-def="Esquiva" data-defense-type="dodge" data-val="${dodgeVal}" data-defense-bonus-included="true">
                    <span class="stat-label">ESQ</span>
                    <span class="stat-value">${dodgeVal}</span>
                 </div>`;
        html += `</div>`;

        // ---------------------------------------------------------
        // 2. ATAQUES (AGRUPADOS)
        // ---------------------------------------------------------
        const attackGroups = {};

      const calculateDefaultDefense = (nhValue) => {
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

      const processAttack = (item, atk, attackId, attackType) => {
            if (!atk || !atk.mode) return;
            if (!attackGroups[item.id]) attackGroups[item.id] = { name: item.name, modes: [] };
            
            const nh = atk.final_nh !== undefined ? atk.final_nh : atk.level;
            const rawDmg = game.gum?.resolveCombatDamageFormula?.(actor, item, atk, attackType)
                || atk.effective_damage_formula || atk.damage || atk.damage_formula || "";
            const resolvedDmg = this._resolveDamageFormula(actor, rawDmg);
            const defaultDefense = calculateDefaultDefense(nh);
            const fallbackParry = atk.parry_default && defaultDefense !== null ? defaultDefense : atk.parry;
            const fallbackBlock = atk.block_default && defaultDefense !== null ? defaultDefense : atk.block;
            const parry = normalizeDefenseValue(atk.final_parry ?? fallbackParry);
            const block = normalizeDefenseValue(atk.final_block ?? fallbackBlock);

            attackGroups[item.id].modes.push({
                label: atk.mode,
                nh: nh,
                damage: resolvedDmg,
                damageDisplay: rawDmg,
                type: atk.damage_type || "",
                parry: parry,
                block: block,
                parryDefenseBonusIncluded: atk.final_parry !== null && atk.final_parry !== undefined,
                blockDefenseBonusIncluded: atk.final_block !== null && atk.final_block !== undefined,
                fullLabel: `${item.name} (${atk.mode})`,
                itemId: item.id,
                itemUuid: item.uuid,
                attackId,
                attackType
            });
        };

        itemsArray.forEach(item => {
            if (item.system.melee_attacks) Object.entries(item.system.melee_attacks).forEach(([atkId, atk]) => processAttack(item, atk, atkId, "melee"));
            if (item.system.ranged_attacks) Object.entries(item.system.ranged_attacks).forEach(([atkId, atk]) => processAttack(item, atk, atkId, "ranged"));
        });

        if (Object.keys(attackGroups).length > 0) {
            html += `<div class="gum-ctx-group"><div class="gum-ctx-group-title"><i class="fas fa-swords"></i> ${this._t("GUM.GMScreen.Attacks")}</div>`;
            for (const [itemId, group] of Object.entries(attackGroups)) {
                html += `
                <div class="gum-ctx-item has-submenu">
                    <span>${group.name}</span> <i class="fas fa-caret-right gum-ctx-caret"></i>
                    <div class="gum-ctx-submenu">
                        ${group.modes.map(mode => `
                            <div class="gum-ctx-item" style="cursor:default;">
                                <div class="gum-ctx-attack-row">
<div class="attack-roll-btn roll-attack-ctx" style="cursor:pointer;" data-label="${mode.fullLabel}" data-nh="${mode.nh}" data-item-id="${mode.itemId}" data-item-uuid="${mode.itemUuid}" data-attack-id="${mode.attackId}" data-attack-type="${mode.attackType}">
                                        <span>${mode.label}</span> <span class="gum-ctx-val skill">${mode.nh}</span>
                                    </div>
                                    <div class="ctx-actions-right">
                                        ${mode.damage ? `<div class="damage-roll-btn roll-damage-ctx" data-damage="${mode.damage}" data-display-damage="${mode.damageDisplay}" data-type="${mode.type}" data-label="${mode.fullLabel}" title="${this._t("GUM.GMScreen.Damage")}: ${mode.damageDisplay}"><i class="fas fa-skull"></i> ${mode.damageDisplay}</div>` : ''}
                                        ${mode.parry ? `<div class="def-roll-btn-ctx roll-def" data-def="${this._t("GUM.GMScreen.Parry")}" data-defense-type="parry" data-val="${mode.parry}" data-defense-bonus-included="${mode.parryDefenseBonusIncluded}" data-item-id="${mode.itemId}" data-item-uuid="${mode.itemUuid}" data-attack-id="${mode.attackId}" data-attack-type="${mode.attackType}" title="${this._t("GUM.GMScreen.Parry")}"><i class="fas fa-swords"></i> ${mode.parry}</div>` : ''}
                                        ${mode.block ? `<div class="def-roll-btn-ctx roll-def" data-def="${this._t("GUM.GMScreen.Block")}" data-defense-type="block" data-val="${mode.block}" data-defense-bonus-included="${mode.blockDefenseBonusIncluded}" data-item-id="${mode.itemId}" data-item-uuid="${mode.itemUuid}" data-attack-id="${mode.attackId}" data-attack-type="${mode.attackType}" title="${this._t("GUM.GMScreen.Block")}"><i class="fas fa-shield-alt"></i> ${mode.block}</div>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        // ---------------------------------------------------------
        // 3. FAVORITOS DE COMBATE (AGRUPADOS)
        // ---------------------------------------------------------
        const favoriteGroups = {};
        const combatFavoriteTypes = new Set(["advantage", "disadvantage", "skill", "spell", "power"]);

        const resolveFavoriteGroup = (item) => {
            const typedGroup = String(item.system?.group || "").trim();
            if (typedGroup) return typedGroup;

            if (item.type === "advantage") return this._t("GUM.GMScreen.Advantages");
            if (item.type === "disadvantage") return this._t("GUM.GMScreen.Disadvantages");
            if (item.type === "skill") return this._t("GUM.GMScreen.Skills");
            if (item.type === "spell") return this._t("GUM.GMScreen.Spells");
            if (item.type === "power") return this._t("GUM.GMScreen.Powers");

            return this._t("GUM.GMScreen.General");
        };

        const extractFavoriteLevel = (item) => {
            const candidates = [
                item.system?.final_nh,
                item.system?.final_level,
                item.system?.level,
                item.system?.skill_level,
                item.system?.effective_level,
                item.system?.relative_level
            ];

            for (const value of candidates) {
                const parsed = Number(value);
                if (Number.isFinite(parsed) && parsed > 0) return parsed;
            }
            return null;
        };

        const extractFavoriteDamage = (item) => {
            const candidates = [
                item.system?.damage,
                item.system?.damage_formula,
                item.system?.damage?.formula
            ];

            let raw = "";
            for (const candidate of candidates) {
                if (typeof candidate === "string" && candidate.trim()) {
                    raw = candidate.trim();
                    break;
                }
            }

            if (!raw) return null;

            const resolved = this._resolveDamageFormula(actor, raw);
            return {
                raw,
                resolved: resolved || raw,
                type: item.system?.damage?.type || item.system?.damage_type || ""
            };
        };

        itemsArray.forEach(item => {
            if (!combatFavoriteTypes.has(item.type)) return;
            if (item.system?.favorite_in_combat !== true) return;
            const level = extractFavoriteLevel(item);
            const fallbackLevel = Number(item.system?.self_control_roll);
            const normalizedLevel = level || (Number.isFinite(fallbackLevel) && fallbackLevel > 0 ? fallbackLevel : null);
            if (!normalizedLevel) return;

            const groupName = resolveFavoriteGroup(item);
            if (!favoriteGroups[groupName]) favoriteGroups[groupName] = [];

            favoriteGroups[groupName].push({
                name: item.name,
                nh: normalizedLevel,
                damage: extractFavoriteDamage(item),
                itemId: item.id,
                itemUuid: item.uuid,
                rollType: item.type === "spell" || item.type === "power" ? item.type : "skill"
            });
        });

        const favoriteGroupEntries = Object.entries(favoriteGroups).sort((a, b) => {
            const generalLabel = this._t("GUM.GMScreen.General");
            if (a[0] === generalLabel) return -1;
            if (b[0] === generalLabel) return 1;
            return a[0].localeCompare(b[0]);
        });

        if (favoriteGroupEntries.length > 0) {
            html += `<div class="gum-ctx-group"><div class="gum-ctx-group-title"><i class="fas fa-star"></i> ${this._t("GUM.GMScreen.Favorites")}</div>`;
            for (const [groupName, entries] of favoriteGroupEntries) {
                const sortedEntries = entries.sort((a, b) => a.name.localeCompare(b.name));
                html += `
                <div class="gum-ctx-item has-submenu">
                    <span>${groupName}</span> <i class="fas fa-caret-right gum-ctx-caret"></i>
                    <div class="gum-ctx-submenu">
                        ${sortedEntries.map(entry => `
                            <div class="gum-ctx-item" style="cursor:default;">
                                <div class="gum-ctx-attack-row">
                                    <div class="attack-roll-btn roll-attack-ctx" style="cursor:pointer;" data-label="${entry.name}" data-nh="${entry.nh}" data-roll-type="${entry.rollType}" data-item-id="${entry.itemId}" data-item-uuid="${entry.itemUuid}">
                                        <span>${entry.name}</span> <span class="gum-ctx-val skill">${entry.nh}</span>
                                    </div>
                                    <div class="ctx-actions-right">
                                        ${entry.damage ? `<div class="damage-roll-btn roll-damage-ctx" data-damage="${entry.damage.resolved}" data-display-damage="${entry.damage.raw}" data-type="${entry.damage.type}" data-label="${entry.name}" title="${this._t("GUM.GMScreen.Damage")}: ${entry.damage.raw}"><i class="fas fa-bolt"></i> ${entry.damage.raw}</div>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        html += `</div>`; // Fim

        $('body').append(html);
        const menu = $('.gum-ctx-menu');

        const positionMenu = (left, top) => {
            const bounds = menu[0]?.getBoundingClientRect?.();
            if (!bounds) return;
            const position = clampFloatingPanelPosition({
                left,
                top,
                width: bounds.width,
                height: bounds.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
            });
            menu.css({ left: `${position.left}px`, top: `${position.top}px` });
        };

        positionMenu(x, y);
        menu.find('.gum-ctx-header').on('pointerdown.gum-ctx-drag', ev => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            const start = menu[0].getBoundingClientRect();
            const startX = ev.clientX;
            const startY = ev.clientY;
            const onMove = moveEvent => positionMenu(
                start.left + moveEvent.clientX - startX,
                start.top + moveEvent.clientY - startY
            );
            const stopDragging = () => {
                $(document).off('.gum-ctx-drag');
                menu.removeClass('is-dragging');
            };
            menu.addClass('is-dragging');
            $(document).on('pointermove.gum-ctx-drag', onMove);
            $(document).on('pointerup.gum-ctx-drag pointercancel.gum-ctx-drag', stopDragging);
        });

        // --- LISTENERS ---
        
        menu.find('.roll-attr').click(ev => {
            const el = $(ev.currentTarget);
            this._performContextRoll(actor, el.data('attr'), parseInt(el.data('val')), {
                quick: ev.ctrlKey,
                                rollType: 'attribute',
                attributeKey: this._resolveContextAttributeKey(el.data('attr'))
            });
            menu.remove();
        });

        menu.find('.roll-def').click(ev => {
            ev.stopPropagation();
            const el = $(ev.currentTarget);
            this._performContextRoll(actor, el.data('def'), parseInt(el.data('val')), {
                quick: ev.ctrlKey,
                rollType: 'defense',
                 defenseType: el.data('defenseType') || null,
                defenseBonusIncluded: el.data('defenseBonusIncluded') === true || String(el.data('defenseBonusIncluded')) === 'true',
                itemId: el.data('itemId') || null,
                itemUuid: el.data('itemUuid') || null,
                 attackId: el.data('attackId') || null,
                 attackType: el.data('attackType') || null
            });
            menu.remove();
        });

        menu.find('.roll-attack-ctx').click(ev => {
            ev.stopPropagation();
            const el = $(ev.currentTarget);
            this._performContextRoll(actor, el.data('label'), parseInt(el.data('nh')), {
                quick: ev.ctrlKey,
                rollType: el.data('rollType') || 'attack',
                itemId: el.data('itemId') || null,
                itemUuid: el.data('itemUuid') || null,
                attackId: el.data('attackId') || null,
                attackType: el.data('attackType') || null
            });
            menu.remove();
        });

        menu.find('.roll-damage-ctx').click(async ev => {
            ev.stopPropagation();
            const el = $(ev.currentTarget);
            const resolvedFormula = String(el.data('damage') || '').trim();
            const displayFormula = String(el.data('displayDamage') || resolvedFormula).trim();
            const dmgType = String(el.data('type') || '').trim();
            const label = String(el.data('label') || actor.name).trim();

            const maybeNormalizeDamageFormula = (f) => {
                if (!game.settings.get("gum", "normalizeGurpsDamageDice")) return f;
                return normalizeGurpsDamageExpression(f)?.formula || f;
            };

            const resolvedDisplayFormula = String(resolvedFormula).match(/^([0-9dDkK+\-/*\s()]+)/i)?.[1]?.trim() || displayFormula || "0";
            const promptResult = await GurpsDamageRollPrompt.prompt({
                sourceName: label,
                main: {
                    formula: resolvedFormula,
                    displayFormula: resolvedDisplayFormula,
                    summaryFormula: `${resolvedDisplayFormula} ${dmgType}`.trim(),
                    type: dmgType
                }
            });
            if (!promptResult) {
                menu.remove();
                return;
            }

            const mainAdditional = String(promptResult.mainAdditional || "").trim();
            const finalFormula = maybeNormalizeDamageFormula(`${resolvedFormula}${mainAdditional}`.trim());
            if (!finalFormula) {
                ui.notifications.warn(this._t("GUM.GMScreen.InvalidDamageFormula"));
                menu.remove();
                return;
            }

            const roll = new Roll(finalFormula);
            await roll.evaluate();

            const diceHtml = roll.dice.flatMap(d => d.results).map(r => `<span class="die-damage">${r.result}</span>`).join('');
            const content = `<div class="gurps-damage-card"><header class="card-header"><h3>${label}</h3></header><div class="card-formula-container"><span class="formula-pill">${finalFormula} ${dmgType}</span></div><div class="card-content"><div class="card-main-flex"><div class="roll-column"><span class="column-label">${this._t("GUM.GMScreen.Dice")}</span><div class="individual-dice-damage">${diceHtml}</div></div><div class="column-separator"></div><div class="target-column"><span class="column-label">${this._t("GUM.GMScreen.Total")}</span><div class="damage-total"><span class="damage-value">${roll.total}</span><span class="damage-type">${dmgType}</span></div></div></div></div><footer class="card-actions"><button type="button" class="apply-damage-button" data-damage='${JSON.stringify({attackerId: actor.id, sourceName: label, main: { total: roll.total, type: dmgType, armorDivisor: 1 }, onDamageEffects: {}, generalConditions: {}})}'><i class="fas fa-crosshairs"></i> ${this._t("GUM.GMScreen.Apply")}</button></footer></div>`;

            const chatData = applyCurrentRollPrivacy({
                user: game.user.id,
                speaker: { alias: actor.name },
                content,
                rolls: [roll]
            }, { rollMode: promptResult.rollMode });
            await ChatMessage.create(chatData);
            menu.remove();
        });
    }

/**
     * Executa a rolagem do menu somando Modificadores E aplicando Tetos (Caps)
     */
     _performContextRoll(actor, label, targetValue, options = {}) {
        const { quick = false, rollType = 'skill', itemId = null, itemUuid = null, attackId = null, attackType = null, attributeKey = null, defenseBonusIncluded = false } = options;
        const defenseType = rollType === 'defense'
            ? resolveDefenseRollType(options.defenseType, label)
            : null;
        
        let selectedModsTotal = 0;
        let lowestCap = Infinity; // Começa infinito (sem teto))

        // 1. Processa Modificadores da TELA (Selecionados agora)
        this.selectedModifiers.forEach(mod => {
            if (mod?.type === "effect") return;
            selectedModsTotal += (parseInt(mod.value) || 0);
            
            // Verifica se tem teto e se é menor que o atual
            if (mod.cap !== undefined && mod.cap !== null && mod.cap !== "") {
                const capVal = parseInt(mod.cap);
                if (!isNaN(capVal) && capVal < lowestCap) lowestCap = capVal;
            }
        });

              if (!quick) {
            const promptRollData = {
                label,
                value: targetValue,
                originalValue: targetValue,
                modifier: 0,
                fixedModifier: selectedModsTotal,
                fixedModifierLabel: this._t("GUM.GMScreen.Title"),
                type: rollType,
                itemId,
                itemUuid,
                                attackId,
                attackType,
                attributeKey,
                defenseType,
                defenseBonusIncluded
            };

            new GurpsRollPrompt(actor, promptRollData).render(true);
            return;
        }

 // 2. Rola direto (Ctrl+Click)
        performGURPSRoll(actor, {
            label: label + " (EM)",
            value: targetValue,
            originalValue: targetValue, // NH Base
            modifier: selectedModsTotal,
            type: rollType,
            itemId,
            itemUuid,
            attackId,
                        attackType,
            attributeKey,
            defenseType,
            defenseBonusIncluded,
            img: actor.img || "icons/svg/d20.svg"
        }, {
            effectiveCap: lowestCap
        });
    }
        _resolveContextAttributeKey(label) {
        return normalizeRequestedAttributeKey(label);
    }

    /**
     * Atualiza o visual do mostrador de modificadores no rodapé
     */
    _updateQRDisplay(html) {
        // Usa o html passado ou o elemento da janela
        const root = html || this.element;
        const total = this._getTotalActiveModifier();
        const display = root.find('.qr-mod-display');
        
        // Formata o texto (+2, -5, 0)
        const sign = total > 0 ? '+' : '';
        display.text(`${sign}${total}`);
        root.find('.qr-dock-total').text(`${sign}${total}`);
        
        // Remove classes antigas
        display.removeClass('pos neg');
        
        // Adiciona cor
        if (total > 0) display.addClass('pos');
        if (total < 0) display.addClass('neg');
    }

    _updateManualDockTotal(html) {
        const value = Number(this.manualCache.value) || 0;
        const sign = value > 0 ? '+' : '';
        (html || this.element).find('.manual-dock-total').text(`${sign}${value}`);
    }
    /**
     * Helper: Soma todos os modificadores atualmente selecionados no EM
     */
    _getTotalActiveModifier() {
        let total = 0;
        
        // 1. Modificador Manual
        if (this.selectedModifiers.has("manual")) {
            total += parseInt(this.manualCache.value) || 0;
        }

        // 2. Modificadores da Paleta
        const configuredUuids = this._getConfiguredItemUuids();
        this.selectedModifiers.forEach((mod, key) => {
            if (key !== "manual" && configuredUuids.has(key) && mod?.type !== "effect") {
                const presentation = this._formatModifierExpression(mod.value);
                if (presentation.numeric) total += presentation.value;
            }
        });

        return total;
    }

    _getConfiguredItemUuids() {
        const config = game.settings.get("gum", "gmScreenConfig");
        const uuids = new Set();

        const groups = this._extractGroupsFromConfig(config);
        for (const group of groups) {
            for (const uuid of group.items || []) {
                uuids.add(uuid);
            }
        }

        return uuids;
    }
    
    // --- LÓGICA DE APLICAÇÃO ---
async _applySelectionToActor(actor, targetToken = null, { keepSelection = false } = {}) {
        this._isApplyingSelection = true;
        try {
            await this._applySelectionBatch(actor, targetToken, { keepSelection });
        } finally {
            this._isApplyingSelection = false;
            this.render(false);
        }
    }

    async _applySelectionBatch(actor, targetToken = null, { keepSelection = false } = {}) {
        const currentMods = actor.getFlag("gum", "gm_modifiers") || [];
        let countMods = 0;
        let countEffects = 0;
        let countResistanceRequests = 0;

        const effectUuids = [];
        const configuredUuids = this._getConfiguredItemUuids();
        const selection = new Map(this.selectedModifiers);

        // Consome a seleção antes de qualquer operação assíncrona. Ações de efeito
        // podem atualizar o ator e provocar renders enquanto ainda estão sendo
        // executadas; nesses renders o estado já deve refletir o fluxo padrão de
        // aplicação única. Shift mantém o mapa intacto para aplicações repetidas.
        if (!keepSelection) {
            this.selectedModifiers.clear();
        }

      for (const [key, mod] of selection.entries()) {
            if (key !== "manual" && !configuredUuids.has(key)) continue;

            if (mod?.type === "effect") {
                if (mod.uuid) effectUuids.push(mod.uuid);
                continue;
            }

            if (key !== "manual") {
                const sourceItem = await fromUuid(key).catch(() => null);
                const entryList = Array.isArray(sourceItem?.system?.modifier_entries) && sourceItem.system.modifier_entries.length
                    ? sourceItem.system.modifier_entries
                    : null;

                if (entryList) {
                    const applicationGroupId = foundry.utils.randomID();
                    entryList.forEach((entry) => {
                        currentMods.push({
                            name: entry?.label ? `${sourceItem.name} — ${entry.label}` : sourceItem.name,
                            value: String(entry?.value ?? "").trim() || "0",
                            cap: entry?.nh_cap ?? entry?.cap ?? mod.cap,
                            contexts: (entry?.contexts || "all").toString().trim() || "all",
                            id: foundry.utils.randomID(),
                            source: "GM Screen",
                            sourceUuid: key,
                            sourceItemName: sourceItem.name,
                            applicationGroupId
                        });
                        countMods++;
                    });
                    continue;
                }
            }

            currentMods.push({
                name: mod.name,
                value: mod?.isManual ? (Number(mod.value) || 0) : (String(mod.value ?? "").trim() || "0"),
                cap: mod.cap, // ✅ AGORA SALVAMOS O TETO NA FLAG DO ATOR
                contexts: mod.contexts || "all",
                id: foundry.utils.randomID(),
                source: "GM Screen"
            });
            countMods++;
        }

        if (countMods > 0) {
            await actor.update(
                { "flags.gum.gm_modifiers": currentMods },
                { gumSkipGMScreenRefresh: true }
            );
        }

        if (effectUuids.length) {
            const targets = targetToken ? [targetToken] : [{ actor }];

            for (const effectUuid of effectUuids) {
                const effectItem = await fromUuid(effectUuid);
                if (!effectItem || effectItem.type !== "effect") continue;

                const application = await applyEffectWithResistance(effectItem, targets, {
                    actor,
                    origin: effectItem,
                    source: "GM Screen",
                    mode: "gm-screen"
                });
                if (application.requested) countResistanceRequests++;
                if (application.applied) countEffects++;
            }
        }

        // Garante atualização visual imediata das badges do card no Escudo do Mestre,
        // mesmo quando a criação de ActiveEffect não dispara updateActor instantaneamente.
        const resistanceSummary = countResistanceRequests
            ? this._t("GUM.GMScreen.ResistanceRequestSummary", { count: countResistanceRequests })
            : "";
        ui.notifications.info(this._t("GUM.GMScreen.AppliedSummary", {
            actor: actor.name,
            modifiers: countMods,
            effects: countEffects,
            resistances: resistanceSummary
        }));
    }
    
       async _showQuickView(item) {
        if (!item) return;
        return GumPreviewDialog.showItem(item, {
            actor: null,
            sendToChat: true,
            speaker: { alias: this._t("GUM.GMScreen.Title") }
        });
 }
    
    _extractGroupsFromConfig(config) {
        if (Array.isArray(config?.tabs)) {
            return config.tabs.flatMap(tab => tab.groups || []);
        }
        if (Array.isArray(config?.groups)) return config.groups;
        if (Array.isArray(config?.columns)) {
            return config.columns.flatMap(col => col.groups || []);
        }
        return [];
    }

    _readLayoutDragData(dataTransfer) {
        if (!dataTransfer) return null;
        for (const mime of [GM_SCREEN_LAYOUT_MIME, "text/plain"]) {
            const raw = dataTransfer.getData(mime);
            if (!raw) continue;
            try {
                const data = JSON.parse(raw);
                if (data?.type === GM_SCREEN_LAYOUT_DRAG_TYPE) return data;
            } catch (_error) {
                // O payload pode pertencer ao Foundry ou a outro modulo.
            }
        }
        return null;
    }

    _activateLayoutEditor(html) {
        const root = html?.[0];
        if (!root) return;

        const clearDropState = () => {
            root.querySelectorAll('.is-layout-drop-target, .layout-drop-before, .layout-drop-after')
                .forEach(element => element.classList.remove('is-layout-drop-target', 'layout-drop-before', 'layout-drop-after'));
        };
        const blockedBySearch = () => this.searchQuery.trim().length > 0;

        root.addEventListener('dragstart', event => {
            const handle = event.target.closest('.layout-drag-handle');
            if (!handle || !root.contains(handle) || !this.layoutEditMode || !event.dataTransfer) return;
            if (blockedBySearch()) {
                event.preventDefault();
                ui.notifications.warn(this._t("GUM.GMScreen.ClearFilterToReorder"));
                return;
            }

            const groupElement = handle.closest('.modifier-group');
            const itemElement = handle.closest('.palette-mod');
            const payload = itemElement
                ? {
                    type: GM_SCREEN_LAYOUT_DRAG_TYPE,
                    kind: 'item',
                    itemUuid: itemElement.dataset.uuid,
                    sourceGroupId: groupElement?.dataset.groupId
                }
                : {
                    type: GM_SCREEN_LAYOUT_DRAG_TYPE,
                    kind: 'group',
                    groupId: groupElement?.dataset.groupId
                };
            if ((payload.kind === 'item' && (!payload.itemUuid || !payload.sourceGroupId)) || !groupElement) {
                event.preventDefault();
                return;
            }
            const serialized = JSON.stringify(payload);
            event.dataTransfer.setData(GM_SCREEN_LAYOUT_MIME, serialized);
            event.dataTransfer.setData('text/plain', serialized);
            event.dataTransfer.effectAllowed = 'move';
            requestAnimationFrame(() => (itemElement || groupElement).classList.add('is-layout-dragging'));
        }, true);

        root.addEventListener('dragover', event => {
            if (!this.layoutEditMode || blockedBySearch()) return;
            const data = this._readLayoutDragData(event.dataTransfer);
            if (!data) return;

            if (data.kind === 'item') {
                const area = event.target.closest('.group-content-area');
                if (!area || !root.contains(area)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                clearDropState();
                area.classList.add('is-layout-drop-target');
                const targetItem = event.target.closest('.palette-mod');
                if (targetItem && targetItem.dataset.uuid !== data.itemUuid) {
                    const bounds = targetItem.getBoundingClientRect();
                    targetItem.classList.add(event.clientY > bounds.top + bounds.height / 2
                        ? 'layout-drop-after'
                        : 'layout-drop-before');
                }
                return;
            }

            if (data.kind === 'group') {
                const targetGroup = event.target.closest('.modifier-group');
                if (!targetGroup || !root.contains(targetGroup) || targetGroup.dataset.groupId === data.groupId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                clearDropState();
                const bounds = targetGroup.getBoundingClientRect();
                const after = event.clientY > bounds.top + bounds.height / 2
                    || (Math.abs(event.clientY - (bounds.top + bounds.height / 2)) < bounds.height / 4
                        && event.clientX > bounds.left + bounds.width / 2);
                targetGroup.classList.add(after ? 'layout-drop-after' : 'layout-drop-before');
            }
        }, true);

        root.addEventListener('drop', async event => {
            if (!this.layoutEditMode || blockedBySearch()) return;
            const data = this._readLayoutDragData(event.dataTransfer);
            if (!data) return; // Deixa o DragDrop do Foundry tratar Itens externos.
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (data.kind === 'item') {
                const area = event.target.closest('.group-content-area');
                const targetGroupId = area?.closest('.modifier-group')?.dataset.groupId;
                if (!area || !targetGroupId) return clearDropState();
                const targetItem = event.target.closest('.palette-mod');
                if (targetItem?.dataset.uuid === data.itemUuid && targetGroupId === data.sourceGroupId) return clearDropState();
                const candidates = [...area.querySelectorAll('.palette-mod')]
                    .filter(element => !(targetGroupId === data.sourceGroupId && element.dataset.uuid === data.itemUuid));
                let targetIndex = candidates.length;
                if (targetItem) {
                    const index = candidates.indexOf(targetItem);
                    if (index >= 0) {
                        const bounds = targetItem.getBoundingClientRect();
                        targetIndex = index + (event.clientY > bounds.top + bounds.height / 2 ? 1 : 0);
                    }
                }
                clearDropState();
                await this._moveItemToGroup(data.sourceGroupId, targetGroupId, data.itemUuid, targetIndex);
                return;
            }

            if (data.kind === 'group') {
                const targetGroup = event.target.closest('.modifier-group');
                if (!targetGroup || targetGroup.dataset.groupId === data.groupId) return clearDropState();
                const candidates = [...root.querySelectorAll('.modular-grid > .modifier-group')]
                    .filter(element => element.dataset.groupId !== data.groupId);
                const index = candidates.indexOf(targetGroup);
                if (index < 0) return clearDropState();
                const bounds = targetGroup.getBoundingClientRect();
                const after = event.clientY > bounds.top + bounds.height / 2
                    || (Math.abs(event.clientY - (bounds.top + bounds.height / 2)) < bounds.height / 4
                        && event.clientX > bounds.left + bounds.width / 2);
                clearDropState();
                await this._moveGroupToIndex(data.groupId, index + (after ? 1 : 0));
            }
        }, true);

        root.addEventListener('dragend', event => {
            event.target.closest('.palette-mod, .modifier-group')?.classList.remove('is-layout-dragging');
            clearDropState();
        }, true);
    }

    _getDisplayedItemOrder(groupId) {
        const group = this.element?.find?.('.modifier-group')
            ?.filter?.((_index, element) => element.dataset.groupId === String(groupId))
            ?.first?.();
        if (!group?.length) return [];
        return group.find('.palette-mod').toArray().map(element => element.dataset.uuid).filter(Boolean);
    }

    _materializeManualOrder(group) {
        const displayed = this._getDisplayedItemOrder(group.id);
        const current = Array.isArray(group.items) ? group.items : [];
        group.items = [...displayed.filter(uuid => current.includes(uuid)), ...current.filter(uuid => !displayed.includes(uuid))];
        group.sortMode = 'manual';
    }

    async _moveItemToGroup(sourceGroupId, targetGroupId, itemUuid, targetIndex) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const source = (activeTab?.groups || []).find(group => group.id === sourceGroupId);
        const target = (activeTab?.groups || []).find(group => group.id === targetGroupId);
        if (!source || !target || !source.items?.includes(itemUuid)) return;

        this._materializeManualOrder(source);
        if (target !== source) this._materializeManualOrder(target);
        source.macroOptions = this._normalizeMacroOptions(source.macroOptions);
        target.macroOptions = this._normalizeMacroOptions(target.macroOptions);
        source.referenceMetadata = this._normalizeReferenceMetadata(source.referenceMetadata, source.items);
        target.referenceMetadata = this._normalizeReferenceMetadata(target.referenceMetadata, target.items);
        const macroOption = source.macroOptions[itemUuid];
        const referenceMetadata = source.referenceMetadata[itemUuid];
        if (!moveUuidBetweenGroups(source, target, itemUuid, targetIndex)) return;
        if (target !== source && macroOption) {
            delete source.macroOptions[itemUuid];
            target.macroOptions[itemUuid] = macroOption;
        }
        if (target !== source && referenceMetadata) {
            delete source.referenceMetadata[itemUuid];
            target.referenceMetadata[itemUuid] = referenceMetadata;
        }
        await this._saveConfig(config);
    }

    async _moveItemByOffset(groupId, itemUuid, offset) {
        if (!offset) return;
        const config = await this._normalizeConfig();
        const group = (this._getActiveConfigTab(config)?.groups || []).find(entry => entry.id === groupId);
        if (!group) return;
        this._materializeManualOrder(group);
        const index = group.items.indexOf(itemUuid);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= group.items.length) return;
        [group.items[index], group.items[target]] = [group.items[target], group.items[index]];
        await this._saveConfig(config);
    }

    async _moveGroupToIndex(groupId, targetIndex) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const groups = activeTab?.groups || [];
        const sourceIndex = groups.findIndex(group => group.id === groupId);
        if (sourceIndex < 0) return;
        activeTab.groups = moveEntryById(groups, groupId, targetIndex);
        await this._saveConfig(config);
    }

    async _moveGroup(groupId, offset) {
        if (!offset) return;
        const config = await this._normalizeConfig();
        const groups = this._getActiveConfigTab(config)?.groups || [];
        const index = groups.findIndex(group => group.id === groupId);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= groups.length) return;
        [groups[index], groups[target]] = [groups[target], groups[index]];
        await this._saveConfig(config);
    }

    async _toggleGroupSortMode(groupId) {
        const config = await this._normalizeConfig();
        const group = (this._getActiveConfigTab(config)?.groups || []).find(entry => entry.id === groupId);
        if (!group) return;
        if (group.sortMode === 'manual') group.sortMode = 'auto';
        else this._materializeManualOrder(group);
        await this._saveConfig(config);
    }

    _promptRenameMainTab(tabId, currentName) {
        const escapedName = foundry.utils.escapeHTML(String(currentName || ''));
        new Dialog({
            title: this._t("GUM.GMScreen.RenameWorkspace"),
            content: `<div class="form-group"><label>${this._t("GUM.GMScreen.Name")}:</label><input type="text" id="tab-name" value="${escapedName}" autofocus maxlength="24"/></div>`,
            buttons: {
                save: {
                    label: this._t("GUM.GMScreen.Save"),
                    callback: async dialogHtml => {
                        const name = dialogHtml.find('#tab-name').val()?.trim();
                        if (!name) return;
                        const config = await this._normalizeConfig();
                        const tab = (config.tabs || []).find(entry => entry.id === tabId);
                        if (!tab) return;
                        tab.name = name;
                        await this._saveConfig(config);
                    }
                }
            },
            default: 'save'
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-gm-screen-tab-dialog"], width: 420, height: "auto" }).render(true);
    }

    async _promptCreateMainTab() {
        const config = await this._normalizeConfig();
        const usedNames = new Set((config.tabs || []).map(tab => String(tab.name || "").trim()));
        let sequence = 1;
        while (usedNames.has(String(sequence))) sequence += 1;
        const suggestedName = String(sequence);
        new Dialog({
            title: this._t("GUM.GMScreen.CreateWorkspace"),
            content: `<div class="form-group"><label>${this._t("GUM.GMScreen.Name")}:</label><input type="text" id="tab-name" value="${suggestedName}" autofocus maxlength="24"/></div>`,
            buttons: {
                create: {
                    icon: '<i class="fas fa-plus"></i>',
                    label: this._t("GUM.GMScreen.Create"),
                    callback: dialogHtml => this._addMainTab(dialogHtml.find('#tab-name').val()?.trim() || suggestedName)
                },
                cancel: { label: this._t("GUM.GMScreen.Cancel") }
            },
            default: "create"
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-gm-screen-tab-dialog"], width: 420, height: "auto" }).render(true);
    }

    async _addMainTab(name) {
        const config = await this._normalizeConfig();
        const id = foundry.utils.randomID();
        config.tabs.push({ id, name: String(name || config.tabs.length + 1), groups: [] });
        config.activeTabId = id;
        await this._saveConfig(config);
    }

    async _confirmRemoveMainTab(tabId) {
        const config = await this._normalizeConfig();
        if (config.tabs.length <= 1) return ui.notifications.warn(this._t("GUM.GMScreen.KeepOneWorkspace"));
        const tab = config.tabs.find(entry => entry.id === tabId);
        if (!tab) return;
        const groups = tab.groups?.length || 0;
        const items = new Set((tab.groups || []).flatMap(group => group.items || [])).size;
        Dialog.confirm({
            title: this._t("GUM.GMScreen.DeleteWorkspace"),
            content: `<p>${this._t("GUM.GMScreen.ConfirmDeleteWorkspace", {
                name: foundry.utils.escapeHTML(String(tab.name || "")), groups, items
            })}</p>`,
            yes: () => this._removeMainTab(tabId),
            defaultYes: false
        }, { classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-gm-screen-tab-dialog"], width: 440, height: "auto" });
    }

    async _removeMainTab(tabId) {
        const config = await this._normalizeConfig();
        if (config.tabs.length <= 1) return ui.notifications.warn(this._t("GUM.GMScreen.KeepOneWorkspace"));
        const index = config.tabs.findIndex(tab => tab.id === tabId);
        if (index < 0) return;
        const [removed] = config.tabs.splice(index, 1);
        if (config.activeTabId === tabId) {
            config.activeTabId = config.tabs[Math.min(index, config.tabs.length - 1)].id;
        }
        const remainingUuids = new Set(config.tabs.flatMap(tab => (tab.groups || []).flatMap(group => group.items || [])));
        for (const uuid of (removed.groups || []).flatMap(group => group.items || [])) {
            if (!remainingUuids.has(uuid)) this.selectedModifiers.delete(uuid);
        }
        await this._saveConfig(config);
    }

    _createDefaultTabs() {
        return this.gmTabs.map(tab => ({ id: tab.id, name: tab.name, groups: [] }));
    }

    _normalizeMacroOptions(options) {
        if (!options || typeof options !== "object" || Array.isArray(options)) return {};
        return Object.fromEntries(Object.entries(options).map(([uuid, value]) => [uuid, {
            executionMode: normalizeMacroExecutionMode(value?.executionMode)
        }]));
    }

    _normalizeReferenceMetadata(metadata, items = []) {
        const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
        const itemUuids = new Set(Array.isArray(items) ? items : []);
        return Object.fromEntries(Object.entries(source).flatMap(([uuid, value]) => {
            if (!itemUuids.has(uuid) || !value || typeof value !== "object" || Array.isArray(value)) return [];
            return [[uuid, {
                name: String(value.name || ""),
                img: String(value.img || ""),
                documentName: String(value.documentName || this._inferReferenceDocumentName(uuid)),
                type: String(value.type || "")
            }]];
        }));
    }

    _referenceMetadataFromDocument(document) {
        return {
            name: String(document?.name || ""),
            img: String(document?.img || ""),
            documentName: String(document?.documentName || "Document"),
            type: String(document?.type || "")
        };
    }

    async _backfillReferenceMetadata(tabs) {
        const missing = new Set();
        for (const group of (tabs || []).flatMap(tab => tab.groups || [])) {
            group.referenceMetadata = this._normalizeReferenceMetadata(group.referenceMetadata, group.items);
            for (const uuid of group.items || []) {
                if (!group.referenceMetadata[uuid]) missing.add(uuid);
            }
        }
        const resolved = new Map(await Promise.all([...missing].map(async uuid => {
            const document = await fromUuid(uuid).catch(() => null);
            return [uuid, document ? this._referenceMetadataFromDocument(document) : null];
        })));
        let changed = false;
        for (const group of (tabs || []).flatMap(tab => tab.groups || [])) {
            for (const uuid of group.items || []) {
                const metadata = resolved.get(uuid);
                if (!group.referenceMetadata[uuid] && metadata) {
                    group.referenceMetadata[uuid] = metadata;
                    changed = true;
                }
            }
        }
        return changed;
    }

    _normalizeConfigGroup(group = {}) {
        const items = Array.isArray(group?.items) ? group.items : [];
        return {
            id: group?.id || foundry.utils.randomID(),
            name: group?.name || this._t("GUM.GMScreen.Group"),
            items,
            macroOptions: this._normalizeMacroOptions(group?.macroOptions),
            referenceMetadata: this._normalizeReferenceMetadata(group?.referenceMetadata, items),
            collapsed: group?.collapsed === true,
            sortMode: group?.sortMode === "manual" ? "manual" : "auto"
        };
    }

    _normalizeConfigTabs(rawTabs) {
        const sourceTabs = Array.isArray(rawTabs) && rawTabs.length
            ? rawTabs
            : [{ id: foundry.utils.randomID(), name: "1", groups: [] }];
        const usedIds = new Set();
        return sourceTabs.map((existing, index) => {
            let id = String(existing?.id || "").trim();
            if (!id || usedIds.has(id)) id = foundry.utils.randomID();
            usedIds.add(id);
            return {
                id,
                name: String(existing?.name || index + 1),
                groups: this._extractGroupsFromConfig(existing).map(group => this._normalizeConfigGroup(group))
            };
        });
    }

    async _normalizeConfig() {
        const config = game.settings.get("gum", "gmScreenConfig") || {};

        if (Array.isArray(config.tabs)) {
            const normalizedTabs = this._normalizeConfigTabs(config.tabs);
            await this._backfillReferenceMetadata(normalizedTabs);
            const activeTabId = normalizedTabs.some(tab => tab.id === config.activeTabId) ? config.activeTabId : normalizedTabs[0].id;
            const normalized = { tabs: normalizedTabs, activeTabId };
            if (JSON.stringify(normalized) !== JSON.stringify(config)) {
                await game.settings.set("gum", "gmScreenConfig", normalized);
            }
            return normalized;
        }

        if (Array.isArray(config.groups)) {
            const tabs = this._createDefaultTabs();
            tabs[0].groups = config.groups.map(group => this._normalizeConfigGroup(group));
            await this._backfillReferenceMetadata(tabs);
            const migrated = { tabs, activeTabId: tabs[0].id };
            await game.settings.set("gum", "gmScreenConfig", migrated);
            return migrated;
        }

        const groups = this._extractGroupsFromConfig(config).map(group => this._normalizeConfigGroup(group));

        const tabs = this._createDefaultTabs();
        tabs[0].groups = groups;
        await this._backfillReferenceMetadata(tabs);
        const normalized = { tabs, activeTabId: tabs[0].id };
        await game.settings.set("gum", "gmScreenConfig", normalized);
        return normalized;
    }

    // Métodos de Persistência
    async _saveConfig(newConfig) { await game.settings.set("gum", "gmScreenConfig", newConfig); this.render(false); }
    async _setActiveMainTab(tabId) {
        const config = await this._normalizeConfig();
        if (!(config.tabs || []).some(tab => tab.id === tabId)) return;
        config.activeTabId = tabId;
        await this._saveConfig(config);
    }

    _getActiveConfigTab(config) {
        const activeId = config.activeTabId || this.gmTabs[0].id;
        return (config.tabs || []).find(tab => tab.id === activeId) || config.tabs?.[0] || null;
    }

    async _addGroup(name) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        if (!activeTab) return;
        activeTab.groups = activeTab.groups || [];
        activeTab.groups.push({ id: foundry.utils.randomID(), name, items: [], macroOptions: {}, referenceMetadata: {}, collapsed: false, sortMode: "auto" });
        await this._saveConfig(config);
    }
    async _toggleGroupCollapse(groupId) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const group = (activeTab?.groups || []).find(g => g.id === groupId);
        if (!group) return;
        group.collapsed = !group.collapsed;
        await this._saveConfig(config);
    }
    async _removeGroup(groupId) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const group = (activeTab?.groups || []).find(g => g.id === groupId);
        if (group) {
            (group.items || []).forEach(uuid => this.selectedModifiers.delete(uuid));
            activeTab.groups = (activeTab.groups || []).filter(g => g.id !== groupId);
            await this._saveConfig(config);
        }
    }

    async _openBulkClearDialog() {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
        const groupOptions = (activeTab?.groups || []).map(group => `
            <label class="checkbox"><input type="checkbox" name="clear-group" value="${escape(group.id)}"> ${escape(group.name)}</label>
        `).join("") || `<p class="notes">${this._t("GUM.GMScreen.NoGroupsInCurrentTab")}</p>`;
        const tabOptions = (config.tabs || []).map(tab => `
            <label class="checkbox"><input type="checkbox" name="clear-tab" value="${escape(tab.id)}"> ${escape(tab.name)}</label>
        `).join("");

        new Dialog({
            title: this._t("GUM.GMScreen.BulkClearTitle"),
            content: `
                <form class="gum-bulk-clear-form">
                    <p class="notes">${this._t("GUM.GMScreen.BulkClearHint")}</p>
                    <div class="form-group"><label>${this._t("GUM.GMScreen.BulkClearAction")}</label><select name="clear-action">
                        <option value="contents">${this._t("GUM.GMScreen.ClearContentsOnly")}</option>
                        <option value="groups">${this._t("GUM.GMScreen.ClearGroupsAndContents")}</option>
                    </select></div>
                    <fieldset><legend>${this._t("GUM.GMScreen.BulkClearScope")}</legend>
                        <div class="gum-bulk-clear-scopes">
                            <label class="gum-bulk-clear-scope"><input type="radio" name="clear-scope" value="active-tab" checked><span><i class="fas fa-table-columns"></i><strong>${this._t("GUM.GMScreen.CurrentTab")}</strong><small>${this._t("GUM.GMScreen.CurrentTabHint")}</small></span></label>
                            <label class="gum-bulk-clear-scope"><input type="radio" name="clear-scope" value="groups"><span><i class="fas fa-layer-group"></i><strong>${this._t("GUM.GMScreen.SelectedGroups")}</strong><small>${this._t("GUM.GMScreen.SelectedGroupsHint")}</small></span></label>
                            <label class="gum-bulk-clear-scope"><input type="radio" name="clear-scope" value="tabs"><span><i class="fas fa-clone"></i><strong>${this._t("GUM.GMScreen.SelectedTabs")}</strong><small>${this._t("GUM.GMScreen.SelectedTabsHint")}</small></span></label>
                            <label class="gum-bulk-clear-scope is-danger"><input type="radio" name="clear-scope" value="all-tabs"><span><i class="fas fa-triangle-exclamation"></i><strong>${this._t("GUM.GMScreen.EntireScreen")}</strong><small>${this._t("GUM.GMScreen.EntireScreenHint")}</small></span></label>
                        </div>
                        <div class="gum-bulk-clear-targets" data-clear-targets="groups"><span class="gum-bulk-clear-targets-label">${this._t("GUM.GMScreen.ChooseGroups")}</span><div class="gum-bulk-clear-choices">${groupOptions}</div></div>
                        <div class="gum-bulk-clear-targets" data-clear-targets="tabs"><span class="gum-bulk-clear-targets-label">${this._t("GUM.GMScreen.ChooseTabs")}</span><div class="gum-bulk-clear-choices">${tabOptions}</div></div>
                    </fieldset>
                    <p class="notes warning"><i class="fas fa-triangle-exclamation"></i> ${this._t("GUM.GMScreen.BulkClearReferencesOnly")}</p>
                </form>
            `,
            render: html => {
                const updateTargets = () => {
                    const scope = html.find('[name="clear-scope"]:checked').val();
                    html.find('.gum-bulk-clear-scope').removeClass('is-selected');
                    html.find(`[name="clear-scope"][value="${scope}"]`).closest('.gum-bulk-clear-scope').addClass('is-selected');
                    html.find('[data-clear-targets]').prop('hidden', true);
                    html.find(`[data-clear-targets="${scope}"]`).prop('hidden', false);
                };
                html.find('[name="clear-scope"]').on('change', updateTargets);
                updateTargets();
            },
            buttons: {
                clear: {
                    icon: '<i class="fas fa-trash"></i>',
                    label: this._t("GUM.GMScreen.ClearLayout"),
                    callback: html => {
                        const form = html.find('form.gum-bulk-clear-form')[0];
                        const formData = new FormData(form);
                        const options = buildGMScreenClearRequest({
                            action: String(formData.get("clear-action") || "contents"),
                            scope: String(formData.get("clear-scope") || "active-tab"),
                            activeTabId: activeTab?.id || null,
                            selectedGroupIds: formData.getAll("clear-group").map(String),
                            selectedTabIds: formData.getAll("clear-tab").map(String)
                        });
                        if (options.scope !== "all-tabs" && options.targetIds.length === 0) {
                            ui.notifications.warn(this._t("GUM.GMScreen.SelectClearTargets"));
                            return false;
                        }
                        this._confirmBulkClear(options);
                    }
                },
                cancel: { label: this._t("GUM.GMScreen.Cancel") }
            },
            default: "cancel"
        }, {
            classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-gm-screen-clear-dialog"],
            width: 560,
            height: "auto"
        }).render(true);
    }

    _confirmBulkClear(options) {
        Dialog.confirm({
            title: this._t("GUM.GMScreen.ConfirmBulkClearTitle"),
            content: `<p>${this._t(options.removeGroups ? "GUM.GMScreen.ConfirmClearGroups" : "GUM.GMScreen.ConfirmClearContents")}</p>`,
            yes: () => this._clearLayout(options),
            defaultYes: false
        }, {
            classes: ["dialog", "gum", "gum-sheet-edit-dialog", "gum-gm-screen-clear-confirm"],
            width: 420,
            height: "auto"
        });
    }

    async _clearLayout(options) {
        const config = await this._normalizeConfig();
        const result = clearGMScreenLayout(config, options);
        result.removedUuids.forEach(uuid => this.selectedModifiers.delete(uuid));
        await this._saveConfig(result.config);
        ui.notifications.info(this._t("GUM.GMScreen.LayoutCleared"));
    }
    async _renameGroup(groupId, newName) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const group = (activeTab?.groups || []).find(g => g.id === groupId);
        if (!group) return;
        group.name = newName;
        await this._saveConfig(config);
    }
    async _addItemsToGroup(groupId, items) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const group = (activeTab?.groups || []).find(g => g.id === groupId);
        if (group) {
            group.macroOptions = this._normalizeMacroOptions(group.macroOptions);
            group.referenceMetadata = this._normalizeReferenceMetadata(group.referenceMetadata, group.items);
            items.forEach(item => {
                if (!item?.uuid) return;
                if (!group.items.includes(item.uuid)) group.items.push(item.uuid);
                group.referenceMetadata[item.uuid] = this._referenceMetadataFromDocument(item);
                if (item.documentName === "Macro") {
                    group.macroOptions[item.uuid] ??= { executionMode: "standard" };
                }
            });
            await this._saveConfig(config);
        }
    }
    async _removeItemFromGroup(groupId, itemUuid) {
        const config = await this._normalizeConfig();
        const activeTab = this._getActiveConfigTab(config);
        const group = (activeTab?.groups || []).find(g => g.id === groupId);
        if (group) {
            group.items = group.items.filter(u => u !== itemUuid);
            if (group.macroOptions) delete group.macroOptions[itemUuid];
            if (group.referenceMetadata) delete group.referenceMetadata[itemUuid];
            this.selectedModifiers.delete(itemUuid);
            await this._saveConfig(config);
        }
    }

    async _setMacroExecutionMode(groupId, macroUuid, executionMode) {
        const config = await this._normalizeConfig();
        const group = (this._getActiveConfigTab(config)?.groups || []).find(entry => entry.id === groupId);
        if (!group || !group.items?.includes(macroUuid)) return;
        group.macroOptions = this._normalizeMacroOptions(group.macroOptions);
        group.macroOptions[macroUuid] = { executionMode: normalizeMacroExecutionMode(executionMode) };
        await this._saveConfig(config);
    }

    async _executeMacroFromGroup(groupId, macroUuid, button) {
        const executionKey = `${groupId}:${macroUuid}`;
        if (this._runningMacros.has(executionKey)) return;
        this._runningMacros.add(executionKey);
        const icon = button?.find?.('i');
        button?.prop?.('disabled', true)?.addClass?.('is-running');
        icon?.removeClass?.('fa-play')?.addClass?.('fa-spinner fa-spin');
        try {
            const macro = await fromUuid(macroUuid).catch(() => null);
            if (!macro || macro.documentName !== "Macro") {
                return ui.notifications.warn(this._t("GUM.GMScreen.MacroNotFound"));
            }
            if (!macro.canExecute) {
                return ui.notifications.warn(this._t("GUM.GMScreen.MacroPermissionDenied"));
            }

            const config = await this._normalizeConfig();
            const group = (this._getActiveConfigTab(config)?.groups || []).find(entry => entry.id === groupId);
            const plan = planGMScreenMacroExecution(group?.macroOptions?.[macroUuid]?.executionMode, game.user?.targets);
            const mode = plan.executionMode;
            const targets = plan.targets;
            if (plan.reason === "single-target") {
                return ui.notifications.warn(this._t("GUM.GMScreen.MacroRequiresSingleTarget"));
            }
            if (plan.reason === "targets") {
                return ui.notifications.warn(this._t("GUM.GMScreen.MacroRequiresTargets"));
            }

            const origin = { type: "gm-screen", source: "GM Screen", groupId, macroUuid };
            const gmScreen = { groupId, macroUuid, executionMode: mode, allTargets: targets };
            const executeForTarget = target => macro.execute({
                actor: target.actor,
                token: target,
                speaker: ChatMessage.getSpeaker({ actor: target.actor, token: target }),
                targets: [target],
                origin,
                gmScreen
            });
            if (mode === "standard") {
                await macro.execute({ targets, origin, gmScreen });
            } else {
                for (const execution of plan.executions) await executeForTarget(execution.target);
            }
        } catch (error) {
            console.error("GUM | Falha ao executar Macro pelo Escudo do Mestre.", error);
            ui.notifications.error(this._t("GUM.GMScreen.MacroExecutionFailed", { error: error?.message || String(error) }));
        } finally {
            this._runningMacros.delete(executionKey);
            if (button?.[0]?.isConnected) {
                button.prop('disabled', false).removeClass('is-running');
                icon.removeClass('fa-spinner fa-spin').addClass('fa-play');
            }
        }
    }

    async _drawRollTableFromGroup(groupId, tableUuid, button) {
        const executionKey = `${groupId}:${tableUuid}`;
        if (this._runningRollTables.has(executionKey)) return;
        this._runningRollTables.add(executionKey);
        const icon = button?.find?.('i');
        button?.prop?.('disabled', true)?.addClass?.('is-running');
        icon?.removeClass?.('fa-dice-d20')?.addClass?.('fa-spinner fa-spin');
        try {
            const table = await fromUuid(tableUuid).catch(() => null);
            if (!table || table.documentName !== "RollTable") {
                return ui.notifications.warn(this._t("GUM.GMScreen.RollTableNotFound"));
            }
            if (table.visible === false) {
                return ui.notifications.warn(this._t("GUM.GMScreen.RollTablePermissionDenied"));
            }
            const draw = await table.draw({ displayChat: true });
            if (!Array.from(draw?.results || []).length) {
                ui.notifications.warn(this._t("GUM.GMScreen.RollTableNoResults"));
            }
        } catch (error) {
            console.error("GUM | Falha ao rolar tabela pelo Escudo do Mestre.", error);
            ui.notifications.error(this._t("GUM.GMScreen.RollTableDrawFailed", { error: error?.message || String(error) }));
        } finally {
            this._runningRollTables.delete(executionKey);
            if (button?.[0]?.isConnected) {
                button.prop('disabled', false).removeClass('is-running');
                icon.removeClass('fa-spinner fa-spin').addClass('fa-dice-d20');
            }
        }
    }
    async _onDrop(event) { 
        if (!this.layoutEditMode) return;
        const data = TextEditor.getDragEventData(event);
        if (!["Item", "Macro", "RollTable"].includes(data.type)) return;
        const dropTarget = event.target.closest(".group-content-area");
        if (!dropTarget) return;
        const groupId = $(dropTarget).closest('.modifier-group').data('group-id');
        const item = await fromUuid(data.uuid);
        const isSupportedItem = item?.documentName === "Item" && ["gm_modifier", "effect"].includes(item.type);
        const isMacro = item?.documentName === "Macro";
        const isRollTable = item?.documentName === "RollTable";
        if (!isSupportedItem && !isMacro && !isRollTable) {
            return ui.notifications.warn(this._t("GUM.GMScreen.OnlySupportedEntries"));
        }
        await this._addItemsToGroup(groupId, [item]);
    }

/**
     * Adiciona botões ao cabeçalho da janela (Ao lado do X)
     */
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        
        // Botão Exportar
        buttons.unshift({
            label: this._t("GUM.GMScreen.ExportLayout"),
            class: "export-config",
            icon: "fas fa-download",
            onclick: () => this._exportConfig()
        });

        // Botão Importar
        buttons.unshift({
            label: this._t("GUM.GMScreen.ImportLayout"),
            class: "import-config",
            icon: "fas fa-upload",
            onclick: () => this._importConfig()
        });

        return buttons;
    }
    /**
     * Exporta a configuração atual para um arquivo JSON
     */
    async _exportConfig() {
        const config = game.settings.get("gum", "gmScreenConfig");
        const bundle = await buildConfigurationBundle({
            id: `${game.world?.id || "world"}-gm-screen`,
            name: `${game.world?.title || "GUM"} — ${this._t("GUM.GMScreen.Title")}`,
            kind: "gm-screen",
            configuration: config,
            resolveUuid: uuid => fromUuid(uuid).catch(() => null),
            systemVersion: game.system?.version,
            foundryVersion: game.version
        });
        if (!bundle.portability.complete) {
            ui.notifications.warn(this._t("GUM.ConfigurationBundle.PortabilityWarning", {
                references: bundle.portability.unresolvedReferences.length + bundle.portability.unsupportedReferences.length,
                assets: bundle.portability.externalAssets.length
            }));
        }
        const filename = `gum-gm-screen-config.json`;
        saveDataToFile(JSON.stringify(bundle, null, 2), "application/json", filename);
    }

    /**
     * Importa um arquivo JSON e substitui a configuração
     */
    async _importConfig() {
        new Dialog({
            title: this._t("GUM.GMScreen.ImportScreenLayout"),
            content: `
                <div class="form-group">
                    <p class="notes">${this._t("GUM.GMScreen.ImportReplacesLayout")}</p>
                    <label>${this._t("GUM.GMScreen.JsonFile")}:</label>
                    <input type="file" name="import-file" accept=".json">
                </div>
            `,
            buttons: {
                import: {
                    label: this._t("GUM.GMScreen.Import"),
                    icon: "<i class='fas fa-file-import'></i>",
                    callback: async (html) => {
                        const input = html.find('[name="import-file"]')[0];
                        if (!input.files[0]) return ui.notifications.warn(this._t("GUM.GMScreen.SelectFile"));
                        
                        const file = input.files[0];
                        const text = await file.text();
                        
                        try {
                            const json = JSON.parse(text);
                            const bundle = parseConfigurationBundle(json);
                            if (bundle) {
                                const result = await importConfigurationBundle(bundle, {
                                    expectedKind: "gm-screen",
                                    getCurrentConfiguration: () => game.settings.get("gum", "gmScreenConfig") || {},
                                    applyConfiguration: configuration => game.settings.set("gum", "gmScreenConfig", configuration)
                                });
                                if (result) this.render(true);
                                return;
                            }
                            let tabs;
                            let activeTabId;
                            if (Array.isArray(json.tabs)) {
                                tabs = this._normalizeConfigTabs(json.tabs);
                                activeTabId = tabs.some(tab => tab.id === json.activeTabId) ? json.activeTabId : tabs[0].id;
                            } else {
                                tabs = this._createDefaultTabs();
                                tabs[0].groups = this._extractGroupsFromConfig(json).map(group => this._normalizeConfigGroup(group));
                                activeTabId = tabs[0].id;
                            }
                            const incomingConfiguration = { tabs, activeTabId };
                            const currentConfiguration = game.settings.get("gum", "gmScreenConfig") || {};
                            const mode = await chooseConfigurationImportMode(
                                "gm-screen",
                                currentConfiguration,
                                incomingConfiguration
                            );
                            if (!mode) return;
                            await game.settings.set("gum", "gmScreenConfig", combineConfigurationImport(
                                "gm-screen",
                                currentConfiguration,
                                incomingConfiguration,
                                mode
                            ));
                            this.render(true);
                            ui.notifications.info(this._t("GUM.GMScreen.LayoutImported"));
                        } catch (err) {
                            console.error(err);
                            ui.notifications.error(this._t("GUM.GMScreen.LayoutImportError", {
                                error: err?.message || String(err)
                            }));
                        }
                    }
                }
            },
            default: "import"
        }).render(true);
    }
}
