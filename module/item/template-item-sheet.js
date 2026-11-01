import { calculateTraitCost, traitCostInput } from "../utils/trait-cost.mjs";
import { templateEntryDisplayName } from "../utils/template-entry-display.mjs";
import { showTemplateEntryPreview } from "../apps/template-entry-preview.js";
const { ItemSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;
const templateText = key => game.i18n.localize(`GUM.Template.${key}`);
const ATTRIBUTE_FIELDS = [
    ["st", "ST", 10], ["dx", "DX", 20], ["iq", "IQ", 20], ["ht", "HT", 10],
    ["will", "Vont", 5], ["per", "Per", 5], ["hp", "PV", 2], ["fp", "PF", 3],
    ["hp_max", "PV máx.", 2], ["fp_max", "PF máx.", 3],
    ["lifting_st", "ST levantamento", 3], ["vision", "Visão", 2], ["hearing", "Audição", 2],
    ["tastesmell", "Olfato/Paladar", 2], ["touch", "Tato", 2], ["mt", "MT", 0],
    ["basic_speed", "Velocidade", 5, 0.25], ["basic_move", "Deslocamento", 5],
    ["enhanced_move", "Deslocamento ampliado", 0], ["dodge", "Esquiva", 0]
];

export class TemplateItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "theme-dark", "template-item-sheet"],
            width: 700,
            height: 580,
            template: "systems/gum/templates/items/template-item-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "structure"
            }],
            scrollY: [".sheet-body-content", ".template-structure-tab"],
            dragDrop: [{ dragSelector: null, dropSelector: ".template-dropzone" }]
        });
    }

    get title() {
        return this.item?.name ? `${templateText("Model")}: ${this.item.name}` : templateText("Model");
    }

    async getData(options = {}) {
        const context = await super.getData(options);
        context.system = this.item.system ?? {};
        context.enrichedDescription = await TextEditorImpl.enrichHTML(context.system.description || "", { async: true });
        context.enrichedChatDescription = await TextEditorImpl.enrichHTML(context.system.chat_description || "", { async: true });
        context.owner = context.owner ?? this.item.isOwner;
        context.editable = this.options.editable ?? this.isEditable;
        context.blocks = this._prepareBlocks(context.system.blocks ?? []);
        context.sharedBudgets = (Array.isArray(context.system.sharedBudgets) ? context.system.sharedBudgets : [])
            .map(budget => ({ ...budget, typeLabel: templateText(budget.type === "money" ? "Money" : "Points"),
                isMoney: budget.type === "money", isMoneyDeduct: budget.type === "money" && budget.accounting === "deduct" }));
        return context;
    }

    _prepareBlocks(blocks) {
        return (blocks || []).map(block => {
            const typeLabel = this._getBlockTypeLabel(block.type);
            const displayTitle = (block.title || "").trim() || typeLabel;
            const contents = (block.contents || []).map(entry => this._prepareEntry(entry, block.type));
            const icon = this._getBlockIcon(block.type);
            const iconClass = {
                guaranteed: "fas fa-check-double",
                selection: "fas fa-list-ul",
                points: "fas fa-sliders-h",
                money: "fas fa-coins"
            }[block.type] || "fas fa-layer-group";
            const moneyMode = block.type === "money" ? this._resolveMoneyMode(block) : "";
            const spendingLimitValue = block.type === "money" ? this._resolveSpendingLimitValue(block) : "";
            const paymentRules = this._normalizePaymentRules(block.paymentRules);

            return {
                ...block,
                displayTitle,
                typeLabel,
                isGuaranteed: block.type === "guaranteed",
                isSelection: block.type === "selection",
                isPoints: block.type === "points",
                isBudget: ["points", "money"].includes(block.type),
                isMoney: block.type === "money",
                moneyMode,
                paymentRules,
                paymentCategories: paymentRules.categories.join(", "),
                paymentMode: paymentRules.modes[0] || "any",
                paymentLocation: paymentRules.locations[0] || "any",
                spendingLimitValue,
                isMoneyDeduct: moneyMode === "deduct",
                isMoneyAvailable: moneyMode === "available",
                isMoneyShared: moneyMode === "shared",
                budgetField: block.type === "money" ? "moneyAvailable" : "pointsAvailable",
                budgetValue: block.type === "money" ? (block.moneyAvailable ?? 0) : (block.pointsAvailable ?? 0),
                summaryText: this._buildBlockSummary(block, contents),
                icon,
                iconClass,
                contents
            };
        });
    }

    _prepareEntry(entry, blockType = "") {
        const moneyCost = blockType === "money" ? Math.max(0, Number(entry.moneyCost ?? entry.cost) || 0) : null;
        if (entry.kind === "template") {
            return {
                ...entry,
                rowName: entry.name || templateText("ReferencedModel"),
                rowQty: "-",
                rowLevel: "-",
                rowCost: moneyCost ?? entry.cost ?? 0,
                rowSubtitle: templateText("ReferencedModel")
            };
        }
        if (entry.kind === "group") {
            return {
                ...entry,
                rowName: entry.name || templateText("Subgroup"),
                rowQty: "-",
                rowLevel: "-",
                rowCost: moneyCost ?? entry.cost ?? 0,
                rowSubtitle: this._buildGroupSubtitle(entry)
            };
        }

        if (entry.kind === "attribute") {
            return {
                ...entry,
                rowName: entry.label || templateText("Attributes"),
                rowQty: "-",
                rowLevel: "-",
                rowCost: moneyCost ?? entry.cost ?? 0,
                rowSubtitle: this._buildAttributeSummary(entry)
            };
        }

        return {
            ...entry,
            rowName: templateEntryDisplayName(entry) || templateText("Item"),
            rowQty: entry.quantity ?? "-",
            rowLevel: entry.level ?? "-",
            rowCost: blockType === "money" ? moneyCost : entry.itemType === "equipment"
                ? `${entry.cost ?? 0} $ / ${entry.pointsCost ?? 0} ${templateText("Points")}`
                : entry.cost ?? "-",
            rowSubtitle: this._buildItemSubtitle(entry)
        };
    }

    _buildBlockSummary(block, contents) {
        const count = contents.length;
        if (block.type === "selection") {
            return `${count} ${templateText("Items")} • ${block.choiceExact ? templateText("ChooseExactly") : templateText("ChooseUpTo")} ${block.choiceCount ?? 1}`;
        }
        if (block.type === "points") {
            return `${count} ${templateText("Options")} • ${block.pointsAvailable ?? 0} ${templateText("Points")}`;
        }
        if (block.type === "money") {
            const mode = this._resolveMoneyMode(block);
            if (mode === "shared") return `${count} ${templateText("Options")} • ${templateText("SharedBudget")}: ${block.sharedBudgetKey || "—"}`;
            const label = mode === "deduct" ? templateText("SpendingLimit") : templateText("MoneyAvailable");
            const amount = mode === "deduct" ? this._resolveSpendingLimitValue(block) : block.moneyAvailable ?? 0;
            return `${count} ${templateText("Options")} • ${label}: ${amount === "" || amount === null ? templateText("Unlimited") : `${amount} ${templateText("Money")}`}`;
        }
        return `${count} ${templateText("Items")}`;
    }

    _resolveMoneyMode(block = {}) {
        if (["deduct", "available", "shared"].includes(block.moneyMode)) return block.moneyMode;
        if (String(block.sharedBudgetKey || "").trim()) return "shared";
        return block.moneyAccounting === "deduct" ? "deduct" : "available";
    }

    _resolveSpendingLimitValue(block = {}) {
        if (Object.prototype.hasOwnProperty.call(block, "spendingLimit")) return block.spendingLimit ?? "";
        if (this._resolveMoneyMode(block) === "deduct" && block.moneyAvailable !== undefined && block.moneyAvailable !== null) {
            return block.moneyAvailable;
        }
        return "";
    }

    _normalizePaymentRules(rules = {}) {
        const list = value => (Array.isArray(value) ? value : String(value || "").split(","))
            .map(term => String(term).trim().toLocaleLowerCase()).filter(Boolean);
        return {
            categories: [...new Set(list(rules.categories))],
            modes: [...new Set(list(rules.modes).filter(mode => ["physical", "abstract"].includes(mode)))],
            locations: [...new Set(list(rules.locations).filter(location => ["equipped", "carried", "stored"].includes(location)))]
        };
    }

    _buildItemSubtitle(entry) {
        const parts = [];
        if (entry.itemType) parts.push(this._getItemTypeLabel(entry.itemType));
        if (entry.cost !== undefined && entry.cost !== null) parts.push(`${entry.cost} pts`);
        if (entry.level !== undefined && entry.level !== null && entry.level !== "") parts.push(`Nível ${entry.level}`);
        if (entry.quantity !== undefined && entry.quantity !== null && entry.quantity !== "" && entry.quantity !== 1) parts.push(`Qtd ${entry.quantity}`);
        return parts.join(" • ");
    }

    _buildGroupSubtitle(entry) {
        const parts = [templateText("Subgroup")];
        if (entry.localNotes) parts.push(String(entry.localNotes));
        const subBlocks = Array.isArray(entry.subBlocks) ? entry.subBlocks : [];
        parts.push(`${subBlocks.length} sub-bloco(s)`);
        return parts.join(" • ");
    }

    _buildAttributeSummary(entry) {
        const parts = this._getAttributeDisplayParts(entry);
        return parts.length ? parts.join(" • ") : templateText("NoChanges");
    }

    _getAttributeDisplayParts(entry) {
        const selected = new Set(Array.isArray(entry.selectedAttributes) ? entry.selectedAttributes : []);
        return Object.entries(entry.attributes || {}).flatMap(([key, raw]) => {
            const value = Number(raw) || 0;
            const configuredLimit = Number(entry.attributeLimits?.[key]);
            const hasLimit = Number.isFinite(configuredLimit) && configuredLimit > 0;
            if (!value && !hasLimit && !selected.has(key)) return [];
            const amount = `${value > 0 ? "+" : ""}${value}`;
            const limit = hasLimit ? ` (${templateText("AttributeMaxShort")} ${value < 0 ? "-" : "+"}${Math.max(Math.abs(value), configuredLimit)})` : "";
            return [`${this._getAttributeLabel(key)}: ${amount}${limit}`];
        });
    }

    _getItemTypeLabel(type) {
        const map = {
            skill: templateText("Skill"),
            spell: templateText("Spell"),
            power: templateText("Power"),
            advantage: templateText("Advantage"),
            disadvantage: templateText("Disadvantage"),
            equipment: templateText("Equipment")
        };
        return map[type] || type;
    }

    _getBlockTypeLabel(type) {
        const map = {
            guaranteed: templateText("Guaranteed"),
            selection: templateText("Selection"),
            points: templateText("PointAllocation"),
            money: templateText("MoneyAllocation")
        };
        return map[type] || templateText("Block");
    }

    _getBlockIcon(type) {
        const map = {
            guaranteed: "icons/sundries/misc/lock-open-yellow.webp",
            selection: "icons/sundries/misc/admission-ticket-grey.webp",
            points: "icons/sundries/books/book-open-purple.webp",
            money: "systems/gum/icons/svg/board.svg/coins.svg"
        };
        return map[type] || "icons/svg/item-bag.svg";
    }

    _getAttributeLabel(key) {
        const normalized = key === "move" ? "basic_move" : key;
        return ATTRIBUTE_FIELDS.some(field => field[0] === normalized) ? templateText(`AttributeLabel.${normalized}`) : key;
    }

    _getAttributeCostPerLevel(key) {
        return ATTRIBUTE_FIELDS.find(field => field[0] === key)?.[2] ?? (key === "move" ? 5 : 0);
    }

    _renderAttributeFieldRows(attributes = {}, costs = {}, limits = {}, selectedAttributes = undefined, lockedAttributes = []) {
        const hasExplicitSelection = Array.isArray(selectedAttributes);
        const selected = new Set(selectedAttributes || []);
        const locked = new Set(lockedAttributes || []);
        return ATTRIBUTE_FIELDS.map(([key, , defaultCost, step]) => {
            const value = attributes[key] ?? (key === "basic_move" ? attributes.move : undefined) ?? 0;
            const cost = costs[key] ?? (key === "basic_move" ? costs.move : undefined) ?? defaultCost;
            const limit = limits[key] ?? (key === "basic_move" ? limits.move : undefined) ?? "";
            const checked = hasExplicitSelection ? selected.has(key) : Boolean(Number(value) || Number(limit));
            return `
            <div class="template-attr-row">
                <label class="template-attr-selector" for="select-${key}" title="${templateText("SelectAttributeHint")}">
                    <input type="checkbox" id="select-${key}" class="template-attr-select" data-attribute="${key}" ${checked ? "checked" : ""}>
                    <span>${this._getAttributeLabel(key)}</span>
                </label>
                <input type="number" id="attr-${key}" value="${value}" step="${step || 1}">
                <input type="number" id="cost-${key}" value="${cost}">
                <input type="number" id="limit-${key}" value="${limit}" min="${step || 1}" step="${step || 1}" placeholder="∞" title="${templateText("AttributeLimitHint")}">
                <label class="template-attr-fixed" for="locked-${key}" title="${templateText("FixedValueHint")}">
                    <input type="checkbox" id="locked-${key}" class="template-attr-lock" ${locked.has(key) ? "checked" : ""}>
                    <span>${templateText("FixedValue")}</span>
                </label>
            </div>`;
        }).join("");
    }

    _readAttributeFields(html) {
        const attributes = {}, costs = {}, attributeLimits = {}, selectedAttributes = [], lockedAttributes = [];
        for (const [key] of ATTRIBUTE_FIELDS) {
            const value = Number(html.find(`#attr-${key}`).val()) || 0;
            const cost = Number(html.find(`#cost-${key}`).val()) || 0;
            const rawLimit = String(html.find(`#limit-${key}`).val() ?? "").trim();
            const limit = Number(rawLimit);
            const isSelected = html.find(`#select-${key}`).is(":checked") || value !== 0 || (rawLimit && Number.isFinite(limit) && limit > 0);
            if (!isSelected) continue;
            selectedAttributes.push(key);
            attributes[key] = value;
            costs[key] = cost;
            if (html.find(`#locked-${key}`).is(":checked")) lockedAttributes.push(key);
            if (rawLimit && Number.isFinite(limit) && limit > 0) {
                attributeLimits[key] = Math.max(Math.abs(value), limit);
            }
        }
        return { attributes, costs, attributeLimits, selectedAttributes, lockedAttributes };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.on("click", ".preview-block-entry", this._onPreviewEntry.bind(this));
        if (!this.isEditable) return;

        html.on("click", ".toggle-editor", this._toggleEditor.bind(this));
        html.on("click", ".save-description", this._saveDescription.bind(this));
        html.on("click", ".cancel-description", this._cancelDescription.bind(this));

        html.on("click", ".add-template-block", this._onAddBlock.bind(this));
        html.on("click", ".toggle-template-block", this._onToggleBlock.bind(this));
        html.on("click", ".delete-template-block", this._onDeleteBlock.bind(this));
        html.on("change", ".block-field", this._onBlockFieldChange.bind(this));
        html.on("click", ".add-template-shared-budget", this._onAddSharedBudget.bind(this));
        html.on("click", ".delete-template-shared-budget", this._onDeleteSharedBudget.bind(this));
        html.on("click", ".configure-template-shared-budget-payment", this._onConfigureSharedBudgetPayment.bind(this));
        html.on("change", ".template-shared-budget-field", this._onSharedBudgetFieldChange.bind(this));

        html.on("click", ".add-block-attribute", this._onAddAttribute.bind(this));
        html.on("click", ".add-block-group", this._onAddGroup.bind(this));
        html.on("click", ".delete-block-entry", this._onDeleteEntry.bind(this));
        html.on("click", ".edit-block-entry", this._onEditEntry.bind(this));

        html.on("dragover", ".template-dropzone", ev => ev.preventDefault());
 html.on("drop", ".template-dropzone", this._onDrop.bind(this));

    }

    _toggleEditor(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest(".description-section");
        container.find(".description-view").toggle();
        container.find(".description-editor").toggle();
        if (field) {
            const editor = container.find(`.editor[data-edit="${field}"]`);
            if (editor.length) editor.trigger("focus");
        }
    }

    async _saveDescription(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest(".description-section");
        const content = await this._getEditorContent(field, container);
        if (!field || content === null || content === undefined) return;

        await this.item.update({ [field]: content });
        const enriched = await TextEditorImpl.enrichHTML(content, { async: true });
        container.find(".description-view").html(enriched);
        container.find(".description-view").show();
        container.find(".description-editor").hide();
    }

    _cancelDescription(event) {
        event.preventDefault();
        const container = $(event.currentTarget).closest(".description-section");
        container.find(".description-view").show();
        container.find(".description-editor").hide();
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

    async _onAddBlock(event) {
        event.preventDefault();
        const config = await this._promptTemplateBlockConfiguration();
        if (!config) return;

        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const block = {
            ...this._createTemplateBlock(config.type),
            collapsed: false
        };
        blocks.push(block);
        await this.item.update({ "system.blocks": blocks });
        setTimeout(() => this.element?.find(`.block-field[data-block-id="${block.id}"][data-field="title"]`)?.trigger("focus"), 0);
    }

    _promptTemplateBlockConfiguration() {
        const content = `
        <div class="template-block-create-dialog">
            <div class="template-block-type-list">
                <label class="template-block-type-option">
                    <input type="radio" name="template-block-type" value="guaranteed" checked>
                    <span>${templateText("AutomaticDelivery")}</span>
                </label>
                <label class="template-block-type-option">
                    <input type="radio" name="template-block-type" value="selection">
                    <span>${templateText("ChooseItems")}</span>
                </label>
                <label class="template-block-type-option">
                    <input type="radio" name="template-block-type" value="points">
                    <span>${templateText("PointAllocation")}</span>
                </label>
                <label class="template-block-type-option">
                    <input type="radio" name="template-block-type" value="money">
                    <span>${templateText("MoneyAllocation")}</span>
                </label>
            </div>
        </div>
        `;

        return new Promise(resolve => new Dialog({
            title: templateText("AddBlock"),
            content,
            buttons: {
                create: {
                    label: templateText("Save"),
                    callback: dlgHtml => {
                        const type = String(dlgHtml.find("input[name='template-block-type']:checked").val() || "guaranteed");
                        resolve({ type });
                    }
                },
                cancel: { label: templateText("Cancel"), callback: () => resolve(null) }
            },
            default: "create",
            close: () => resolve(null)
        }, { classes: ["dialog", "gum", "template-config-dialog", "template-block-create-config", "gum-sheet-edit-dialog"], width: 450 }).render(true));
    }
    async _onToggleBlock(event) {
        event.preventDefault();

        const blockId = event.currentTarget.dataset.blockId;
        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const block = blocks.find(b => b.id === blockId);
        if (!block) return;

        block.collapsed = !block.collapsed;
        await this.item.update({ "system.blocks": blocks });
    }

    async _onDeleteBlock(event) {
        event.preventDefault();
        const blockId = event.currentTarget.dataset.blockId;
        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const filtered = blocks.filter(b => b.id !== blockId);
        await this.item.update({ "system.blocks": filtered });
    }

    async _onBlockFieldChange(event) {
        const input = event.currentTarget;
        const blockId = input.dataset.blockId;
        const field = input.dataset.field;
        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const block = blocks.find(b => b.id === blockId);
        if (!block) return;

        let value;
        if (input.type === "number") value = field === "spendingLimit" && input.value.trim() === "" ? "" : Number(input.value) || 0;
        else if (input.type === "checkbox") value = input.checked;
        else value = input.value;

        if (field.startsWith("paymentRules.")) {
            const key = field.split(".")[1];
            const rules = this._normalizePaymentRules(block.paymentRules);
            if (key === "categories") rules.categories = String(value || "").split(",").map(term => term.trim().toLocaleLowerCase()).filter(Boolean);
            else rules[key] = value === "any" ? [] : [String(value)];
            block.paymentRules = this._normalizePaymentRules(rules);
        } else block[field] = value;
        if (field === "moneyMode") {
            if (value === "deduct") {
                block.moneyAccounting = "deduct";
                block.sharedBudgetKey = "";
                if (!["hard", "gm"].includes(block.budgetPolicy)) block.budgetPolicy = "hard";
                if (!Object.prototype.hasOwnProperty.call(block, "spendingLimit")) block.spendingLimit = "";
            } else if (value === "available") {
                block.moneyAccounting = "budget";
                block.sharedBudgetKey = "";
            } else if (value === "shared") {
                block.moneyAccounting = "budget";
            }
        }
        await this.item.update({ "system.blocks": blocks });
    }

    async _showEntryPreview(entry) {
        const sourceItem = entry.uuid ? await fromUuid(entry.uuid).catch(() => null)
            : entry.sourceId ? game.items.get(entry.sourceId) : null;
        await showTemplateEntryPreview(entry, { sourceItem });
    }

    async _onPreviewEntry(event) {
        event.preventDefault();
        const block = (this.item.system.blocks || []).find(candidate => candidate.id === event.currentTarget.dataset.blockId);
        const entry = (block?.contents || []).find(candidate => candidate.id === event.currentTarget.dataset.entryId);
        if (entry) await this._showEntryPreview(entry);
    }

    async _onAddSharedBudget(event) {
        event.preventDefault();
        const content = `<div class="template-budget-form"><div class="form-group template-budget-name"><label for="shared-budget-name">${templateText("Name")}</label><input id="shared-budget-name" type="text"></div>
          <div class="form-group"><label for="shared-budget-type">${templateText("SharedBudgetType")}</label><select id="shared-budget-type">
          <option value="points">${templateText("Points")}</option><option value="money">${templateText("Money")}</option></select></div>
          <div class="form-group"><label for="shared-budget-amount">${templateText("SharedBudgetAmount")}</label><input id="shared-budget-amount" type="number" min="0" value="0"></div>
          <div class="form-group"><label for="shared-budget-policy">${templateText("BudgetPolicy")}</label><select id="shared-budget-policy">
          ${[["hard", "BudgetHard"], ["allow", "BudgetAllow"], ["gm", "BudgetGM"], ["unlimited", "BudgetUnlimited"]]
            .map(([value, label]) => `<option value="${value}">${templateText(label)}</option>`).join("")}</select></div>
          <div class="form-group template-budget-accounting" hidden><label for="shared-budget-accounting">${templateText("MoneyAccounting")}</label><select id="shared-budget-accounting">
          <option value="budget">${templateText("MoneyBudgetOnly")}</option><option value="deduct">${templateText("MoneyDeduct")}</option></select></div></div>`;
        new Dialog({
            title: templateText("AddSharedBudget"), content,
            render: html => {
                const updateAccounting = () => {
                    const isMoney = html.find("#shared-budget-type").val() === "money";
                    const deduct = isMoney && html.find("#shared-budget-accounting").val() === "deduct";
                    html.find(".template-budget-accounting").prop("hidden", !isMoney);
                    html.find('#shared-budget-policy option[value="allow"], #shared-budget-policy option[value="unlimited"]').prop("disabled", deduct).prop("hidden", deduct);
                    if (deduct && !["hard", "gm"].includes(html.find("#shared-budget-policy").val())) html.find("#shared-budget-policy").val("hard");
                };
                html.find("#shared-budget-type, #shared-budget-accounting").on("change", updateAccounting);
                updateAccounting();
            },
            buttons: { save: { label: templateText("Save"), callback: async html => {
                const name = String(html.find("#shared-budget-name").val() || "").trim();
                const type = html.find("#shared-budget-type").val();
                if (!name) return ui.notifications.warn(templateText("SharedBudgetNameRequired"));
                const budgets = foundry.utils.deepClone(this.item.system.sharedBudgets || []);
                if (budgets.some(budget => budget.type === type && String(budget.name).trim().toLocaleLowerCase() === name.toLocaleLowerCase()))
                    return ui.notifications.warn(templateText("SharedBudgetDuplicate"));
                const accounting = html.find("#shared-budget-accounting").val();
                const selectedPolicy = html.find("#shared-budget-policy").val();
                budgets.push({ id: foundry.utils.randomID(), name, type, amount: Number(html.find("#shared-budget-amount").val()) || 0,
                    policy: type === "money" && accounting === "deduct" && !["hard", "gm"].includes(selectedPolicy) ? "hard" : selectedPolicy,
                    accounting, paymentRules: this._normalizePaymentRules() });
                await this.item.update({ "system.sharedBudgets": budgets });
            } }, cancel: { label: templateText("Cancel") } }, default: "save"
        }, { classes: ["dialog", "gum", "template-config-dialog", "template-budget-config", "gum-sheet-edit-dialog"], width: 430 }).render(true);
    }

    async _onDeleteSharedBudget(event) {
        event.preventDefault();
        const id = event.currentTarget.dataset.budgetId;
        const budgets = foundry.utils.deepClone(this.item.system.sharedBudgets || []);
        await this.item.update({ "system.sharedBudgets": budgets.filter(budget => budget.id !== id) });
    }

    async _onSharedBudgetFieldChange(event) {
        const input = event.currentTarget;
        const budgets = foundry.utils.deepClone(this.item.system.sharedBudgets || []);
        const budget = budgets.find(entry => entry.id === input.dataset.budgetId);
        if (!budget) return;
        const value = input.type === "number" ? Number(input.value) || 0 : input.value;
        if (input.dataset.field === "name") {
            const name = String(value).trim();
            if (!name || budgets.some(entry => entry !== budget && entry.type === budget.type &&
                String(entry.name).trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
                ui.notifications.warn(templateText("SharedBudgetDuplicate"));
                this.render(false);
                return;
            }
            budget.name = name;
        } else budget[input.dataset.field] = value;
        if (budget.type === "money" && budget.accounting === "deduct" && !["hard", "gm"].includes(budget.policy)) budget.policy = "hard";
        await this.item.update({ "system.sharedBudgets": budgets });
    }

    async _onConfigureSharedBudgetPayment(event) {
        event.preventDefault();
        const budgets = foundry.utils.deepClone(this.item.system.sharedBudgets || []);
        const budget = budgets.find(entry => entry.id === event.currentTarget.dataset.budgetId);
        if (!budget || budget.type !== "money") return;
        const rules = this._normalizePaymentRules(budget.paymentRules);
        const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
        const content = `<div class="template-payment-rules-form">
          <p class="notes">${templateText("PaymentRulesHint")}</p>
          <div class="form-group"><label>${templateText("PaymentCategories")}</label><input id="payment-rule-categories" value="${esc(rules.categories.join(", "))}" placeholder="${templateText("PaymentCategoriesPlaceholder")}"></div>
          <div class="form-group"><label>${templateText("PaymentSourceMode")}</label><select id="payment-rule-mode"><option value="any">${templateText("PaymentAny")}</option><option value="physical" ${rules.modes[0] === "physical" ? "selected" : ""}>${templateText("PaymentPhysical")}</option><option value="abstract" ${rules.modes[0] === "abstract" ? "selected" : ""}>${templateText("PaymentAbstract")}</option></select></div>
          <div class="form-group"><label>${templateText("PaymentSourceLocation")}</label><select id="payment-rule-location"><option value="any">${templateText("PaymentAny")}</option><option value="carried" ${rules.locations[0] === "carried" ? "selected" : ""}>${templateText("PaymentCarried")}</option><option value="stored" ${rules.locations[0] === "stored" ? "selected" : ""}>${templateText("PaymentStored")}</option><option value="equipped" ${rules.locations[0] === "equipped" ? "selected" : ""}>${templateText("PaymentEquipped")}</option></select></div>
        </div>`;
        new Dialog({ title: templateText("PaymentRules"), content, buttons: {
            save: { label: templateText("Save"), callback: async html => {
                budget.paymentRules = this._normalizePaymentRules({
                    categories: html.find("#payment-rule-categories").val(),
                    modes: html.find("#payment-rule-mode").val() === "any" ? [] : [html.find("#payment-rule-mode").val()],
                    locations: html.find("#payment-rule-location").val() === "any" ? [] : [html.find("#payment-rule-location").val()]
                });
                await this.item.update({ "system.sharedBudgets": budgets });
            } }, cancel: { label: templateText("Cancel") }
        }, default: "save" }, { classes: ["dialog", "gum", "template-config-dialog", "gum-sheet-edit-dialog"], width: 480 }).render(true);
    }

    async _onAddAttribute(event) {
        event.preventDefault();
        const blockId = event.currentTarget.dataset.blockId;
        const block = (this.item.system.blocks || []).find(candidate => candidate.id === blockId);
        const entry = await this._configureEntryDraft({
            id: foundry.utils.randomID(), kind: "attribute", label: templateText("Attributes"),
            attributes: {}, costs: {}, attributeLimits: {}, selectedAttributes: [], lockedAttributes: [],
            linkSecondary: false, cost: 0
        }, { mode: "create", block });
        if (entry) await this._appendEntryToBlock(blockId, entry);
    }

    async _onAddGroup(event) {
        event.preventDefault();
        const blockId = event.currentTarget.dataset.blockId;
        const block = (this.item.system.blocks || []).find(candidate => candidate.id === blockId);
        const entry = await this._configureEntryDraft({
            id: foundry.utils.randomID(), kind: "group", name: templateText("Package"), quantity: 1,
            level: "", cost: 0, localNotes: "", subBlocks: [this._createTemplateBlock("guaranteed")]
        }, { mode: "create", block });
        if (entry) await this._appendEntryToBlock(blockId, entry);
    }

    _createTemplateBlock(type = "guaranteed") {
        return {
            id: foundry.utils.randomID(), type, title: "", instructions: "", destinationGroup: "", containerName: "", choiceCount: 1, choiceExact: false,
            pointsAvailable: 20, moneyAvailable: 1000, spendingLimit: "", budgetPolicy: "hard", moneyMode: "available", moneyAccounting: "budget", moneySourceFilter: "", paymentRules: this._normalizePaymentRules(), sharedBudgetKey: "", contents: [], collapsed: false
        };
    }

    _normalizeGroupSubBlocks(rawBlocks) {
        if (!Array.isArray(rawBlocks)) return [];

        return rawBlocks
            .map(block => {
                if (!block || typeof block !== "object") return null;

                const type = ["guaranteed", "selection", "points", "money"].includes(block.type) ? block.type : "guaranteed";
                return {
                    ...block,
                    id: block.id || foundry.utils.randomID(),
                    type,
                    title: String(block.title || "").trim(),
                    instructions: String(block.instructions || ""),
                    destinationGroup: String(block.destinationGroup || "").trim(),
                    containerName: String(block.containerName || "").trim(),
                    choiceCount: Math.max(1, Number(block.choiceCount) || 1),
                    choiceExact: Boolean(block.choiceExact),
                    pointsAvailable: Number(block.pointsAvailable) || 0,
                    moneyAvailable: Number(block.moneyAvailable) || 0,
                    spendingLimit: type === "money" ? this._resolveSpendingLimitValue(block) : "",
                    budgetPolicy: ["hard", "allow", "gm", "unlimited"].includes(block.budgetPolicy) ? block.budgetPolicy : "hard",
                    moneyMode: type === "money" ? this._resolveMoneyMode(block) : "",
                    moneyAccounting: block.moneyAccounting === "deduct" ? "deduct" : "budget",
                    moneySourceFilter: String(block.moneySourceFilter || "").trim(),
                    paymentRules: this._normalizePaymentRules(block.paymentRules),
                    contents: Array.isArray(block.contents) ? block.contents : []
                };
            })
            .filter(Boolean);
    }


    _calculateAttributeCost(attributes, costs = {}) {
        let total = 0;

        for (const [key, value] of Object.entries(attributes)) {
            const increment = Number(value) || 0;
            const costPerLevel = Number(costs[key] ?? this._getAttributeCostPerLevel(key)) || 0;

            if (key === "basic_speed") {
                const quarterSteps = increment / 0.25;
                total += quarterSteps * costPerLevel;
                continue;
            }

            total += increment * costPerLevel;
        }

        return total;
    }

    async _appendEntryToBlock(blockId, entry) {
        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const block = blocks.find(b => b.id === blockId);
        if (!block) return;
        block.contents = block.contents || [];
        block.contents.push(entry);
        await this.item.update({ "system.blocks": blocks });
    }

    async _onDeleteEntry(event) {
        event.preventDefault();
        const blockId = event.currentTarget.dataset.blockId;
        const entryId = event.currentTarget.dataset.entryId;

        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const block = blocks.find(b => b.id === blockId);
        if (!block) return;

        block.contents = (block.contents || []).filter(e => e.id !== entryId);
        await this.item.update({ "system.blocks": blocks });
    }

    async _onEditEntry(event) {
        event.preventDefault();
        const blockId = event.currentTarget.dataset.blockId;
        const entryId = event.currentTarget.dataset.entryId;

        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const block = blocks.find(b => b.id === blockId);
        if (!block) return;

        const entry = (block.contents || []).find(e => e.id === entryId);
        if (!entry) return;
        const replacement = await this._configureEntryDraft(entry, { mode: "edit", block });
        if (replacement) await this._replaceEntry(blockId, entryId, replacement);
    }

    _renderChoiceRuleFields(entry, prefix) {
        const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
        const requirements = this._getEntryRequirements(entry);
        const typeOptions = selected => [["", "AnyItemType"], ["advantage", "Advantage"], ["disadvantage", "Disadvantage"],
            ["skill", "Skill"], ["spell", "Spell"], ["power", "Power"], ["equipment", "Equipment"],
            ["group", "Package"], ["template", "ReferencedModel"], ["attribute", "Attributes"]]
            .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${templateText(label)}</option>`).join("");
        const requirementRow = requirement => `<div class="template-requirement-row">
          <select data-requirement-field="condition" title="${templateText("RequirementCondition")}"><option value="require" ${requirement.condition !== "exclude" ? "selected" : ""}>${templateText("RequirementMustHave")}</option><option value="exclude" ${requirement.condition === "exclude" ? "selected" : ""}>${templateText("RequirementMustNotHave")}</option></select>
          <select data-requirement-field="itemType" title="${templateText("RequirementItemType")}">${typeOptions(requirement.itemType)}</select>
          <input data-requirement-field="name" value="${esc(requirement.name)}" placeholder="${templateText("RequirementNamePlaceholder")}" title="${templateText("RequirementName")}">
          <input type="number" data-requirement-field="minimumLevel" value="${requirement.minimumLevel ?? ""}" placeholder="—" title="${templateText("RequirementMinimumLevel")}">
          <button type="button" class="template-remove-requirement" title="${templateText("RemoveRequirement")}" aria-label="${templateText("RemoveRequirement")}"><i class="fas fa-trash"></i></button>
        </div>`;
        return `<section class="template-entry-availability-fields" data-rule-prefix="${prefix}">
          <div class="template-entry-availability-options">
            <label><input type="checkbox" id="${prefix}-available" ${entry.available !== false ? "checked" : ""}> ${templateText("OptionAvailable")}</label>
            <label><input type="checkbox" id="${prefix}-gm-override" ${entry.allowGMOverride ? "checked" : ""}> ${templateText("AllowGMAvailabilityOverride")}</label>
            <label>${templateText("UnavailableBehavior")}<select id="${prefix}-unavailable-behavior"><option value="disabled" ${entry.unavailableBehavior !== "hidden" ? "selected" : ""}>${templateText("ShowUnavailable")}</option><option value="hidden" ${entry.unavailableBehavior === "hidden" ? "selected" : ""}>${templateText("HideUnavailable")}</option></select></label>
          </div>
          <div class="template-structured-requirements"><div class="template-requirements-heading"><strong>${templateText("CharacterRequirements")}</strong><button type="button" class="template-add-requirement"><i class="fas fa-plus"></i> ${templateText("AddRequirement")}</button></div>
            <div class="template-requirement-list">${requirements.map(requirementRow).join("")}</div>
            <template class="template-requirement-template">${requirementRow({ condition: "require", itemType: "", name: "", minimumLevel: null })}</template>
            <p class="notes">${templateText("CharacterRequirementsHint")}</p>
          </div>
          <div class="form-group template-unavailable-reason"><label>${templateText("UnavailableReason")}</label><input type="text" id="${prefix}-unavailable-reason" value="${esc(entry.unavailableReason)}" placeholder="${templateText("UnavailableReasonPlaceholder")}"></div>
        </section>`;
    }

    _readChoiceRuleFields(entry, html, prefix) {
        entry.available = html.find(`#${prefix}-available`).is(":checked");
        entry.allowGMOverride = html.find(`#${prefix}-gm-override`).is(":checked");
        entry.unavailableBehavior = html.find(`#${prefix}-unavailable-behavior`).val() === "hidden" ? "hidden" : "disabled";
        entry.unavailableReason = String(html.find(`#${prefix}-unavailable-reason`).val() || "").trim();
        const requirements = [];
        html.find(`[data-rule-prefix="${prefix}"] .template-requirement-row`).each((_, row) => {
            const field = name => row.querySelector(`[data-requirement-field="${name}"]`)?.value;
            const name = String(field("name") || "").trim();
            if (!name) return;
            const rawLevel = field("minimumLevel");
            requirements.push({ condition: field("condition") === "exclude" ? "exclude" : "require",
                itemType: String(field("itemType") || ""), name,
                minimumLevel: rawLevel === "" || rawLevel === undefined ? null : Number(rawLevel) });
        });
        entry.requirements = this._normalizeEntryRequirements(requirements);
        delete entry.requiresNames;
        delete entry.excludesNames;
    }

    _normalizeEntryRequirements(requirements = []) {
        return (Array.isArray(requirements) ? requirements : []).map(requirement => {
            const rawLevel = requirement?.minimumLevel;
            return { condition: requirement?.condition === "exclude" ? "exclude" : "require",
                itemType: ["advantage", "disadvantage", "skill", "spell", "power", "equipment", "group", "template", "attribute"].includes(requirement?.itemType) ? requirement.itemType : "",
                name: String(requirement?.name || "").trim(),
                minimumLevel: rawLevel === "" || rawLevel === null || rawLevel === undefined || !Number.isFinite(Number(rawLevel)) ? null : Number(rawLevel) };
        }).filter(requirement => requirement.name);
    }

    _getEntryRequirements(entry = {}) {
        const requirements = this._normalizeEntryRequirements(entry.requirements);
        for (const [field, condition] of [["requiresNames", "require"], ["excludesNames", "exclude"]]) {
            const names = Array.isArray(entry[field]) ? entry[field] : String(entry[field] || "").split(",");
            for (const rawName of names) {
                const name = String(rawName || "").trim();
                if (name) requirements.push({ condition, itemType: "", name, minimumLevel: null });
            }
        }
        const seen = new Set();
        return requirements.filter(requirement => {
            const key = `${requirement.condition}:${requirement.itemType}:${requirement.name.toLocaleLowerCase()}:${requirement.minimumLevel ?? ""}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    _activateChoiceRuleFields(html, prefix) {
        const root = html.find(`[data-rule-prefix="${prefix}"]`);
        root.find(".template-add-requirement").on("click", event => {
            event.preventDefault();
            const template = root.find(".template-requirement-template").get(0);
            if (template) root.find(".template-requirement-list").append(template.content.cloneNode(true));
        });
        root.on("click", ".template-remove-requirement", event => {
            event.preventDefault();
            event.currentTarget.closest(".template-requirement-row")?.remove();
        });
    }

    _renderPackageBlocks(blocks) {
        const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
        const typeLabel = type => ({
            guaranteed: templateText("AutomaticDelivery"),
            selection: templateText("Selection"),
            points: templateText("PointAllocation"),
            money: templateText("MoneyAllocation")
        })[type] || templateText("Block");
        return blocks.map(block => {
            const entries = (block.contents || []).map(item => {
              const prepared = this._prepareEntry(item, block.type);
              return `<div class="template-package-entry" data-entry-id="${esc(item.id)}">
              <span class="template-package-entry-main"><strong>${esc(prepared.rowName)}</strong>${prepared.rowSubtitle ? `<small>${esc(prepared.rowSubtitle)}</small>` : ""}</span>
              <span class="template-package-entry-meta">
                ${prepared.rowQty !== "-" ? `<span title="${templateText("QuantityShort")}">${templateText("QuantityShort")} ${esc(prepared.rowQty)}</span>` : ""}
                ${prepared.rowLevel !== "-" ? `<span title="${templateText("Level")}">${templateText("Level")} ${esc(prepared.rowLevel)}</span>` : ""}
                ${prepared.rowCost !== "-" ? `<span title="${templateText("Cost")}">${templateText("Cost")} · ${esc(prepared.rowCost)}</span>` : ""}
              </span>
              <span class="template-package-entry-controls"><button type="button" class="template-package-edit-entry" title="${templateText("Edit")}"><i class="fas fa-edit"></i></button>
              <button type="button" class="template-package-delete-entry" title="${templateText("Remove")}"><i class="fas fa-trash"></i></button>
              <button type="button" class="template-package-preview-entry" title="${templateText("PreviewEntry")}"><i class="fas fa-eye"></i></button></span></div>`;
            }).join("");
            const selectionFields = block.type === "selection" ? `<div class="form-group input-narrow"><label>${templateText("ChoiceCount")}</label>
              <input type="number" data-field="choiceCount" min="1" value="${Number(block.choiceCount) || 1}"></div>
              <div class="form-group template-package-checkbox-field"><label class="template-inline-check"><input type="checkbox" data-field="choiceExact" ${block.choiceExact ? "checked" : ""}><span>${templateText("ExactChoices")}</span></label></div>` : "";
            let budgetFields = "";
            if (["points", "money"].includes(block.type)) {
                const budgetField = block.type === "money" ? "moneyAvailable" : "pointsAvailable";
                const budgetValue = block.type === "money" ? Number(block.moneyAvailable) || 0 : Number(block.pointsAvailable) || 0;
                if (block.type === "money") {
                    const moneyMode = this._resolveMoneyMode(block);
                    const policies = moneyMode === "deduct" ? [["hard", "BudgetHard"], ["gm", "BudgetGM"]]
                        : [["hard", "BudgetHard"], ["allow", "BudgetAllow"], ["gm", "BudgetGM"], ["unlimited", "BudgetUnlimited"]];
                    const policyOptions = policies.map(([value, label]) => `<option value="${value}" ${block.budgetPolicy === value ? "selected" : ""}>${templateText(label)}</option>`).join("");
                    const ownBudgetFields = moneyMode === "shared" ? "" : `<div class="form-group input-narrow"><label title="${moneyMode === "deduct" ? templateText("SpendingLimitHint") : ""}">${templateText(moneyMode === "deduct" ? "SpendingLimit" : "MoneyAvailable")}</label>
                      <input type="number" data-field="${moneyMode === "deduct" ? "spendingLimit" : budgetField}" value="${moneyMode === "deduct" ? esc(this._resolveSpendingLimitValue(block)) : budgetValue}" min="0" ${moneyMode === "deduct" ? `placeholder="${templateText("Unlimited")}"` : ""}></div>
                      <div class="form-group"><label>${templateText("BudgetPolicy")}</label><select data-field="budgetPolicy">${policyOptions}</select></div>`;
                    const rules = this._normalizePaymentRules(block.paymentRules);
                    const sourceRules = moneyMode === "deduct" ? `<div class="template-payment-rules-fields"><div class="form-group"><label title="${templateText("PaymentRulesHint")}">${templateText("PaymentCategories")}</label><input type="text" data-field="paymentRules.categories" value="${esc(rules.categories.join(", "))}" placeholder="${templateText("PaymentCategoriesPlaceholder")}"></div>
                      <div class="form-group"><label>${templateText("PaymentSourceMode")}</label><select data-field="paymentRules.modes"><option value="any">${templateText("PaymentAny")}</option><option value="physical" ${rules.modes[0] === "physical" ? "selected" : ""}>${templateText("PaymentPhysical")}</option><option value="abstract" ${rules.modes[0] === "abstract" ? "selected" : ""}>${templateText("PaymentAbstract")}</option></select></div>
                      <div class="form-group"><label>${templateText("PaymentSourceLocation")}</label><select data-field="paymentRules.locations"><option value="any">${templateText("PaymentAny")}</option><option value="carried" ${rules.locations[0] === "carried" ? "selected" : ""}>${templateText("PaymentCarried")}</option><option value="stored" ${rules.locations[0] === "stored" ? "selected" : ""}>${templateText("PaymentStored")}</option><option value="equipped" ${rules.locations[0] === "equipped" ? "selected" : ""}>${templateText("PaymentEquipped")}</option></select></div></div>` : "";
                    const sharedBudget = moneyMode === "shared" ? `<div class="form-group"><label>${templateText("UseSharedBudget")}</label>
                      <input type="text" data-field="sharedBudgetKey" value="${esc(block.sharedBudgetKey)}" placeholder="${templateText("SharedBudget")}"></div>` : "";
                    budgetFields = `<div class="form-group"><label>${templateText("MoneyMode")}</label><select data-field="moneyMode">
                      <option value="deduct" ${moneyMode === "deduct" ? "selected" : ""}>${templateText("MoneyModeDeduct")}</option>
                      <option value="available" ${moneyMode === "available" ? "selected" : ""}>${templateText("MoneyModeAvailable")}</option>
                      <option value="shared" ${moneyMode === "shared" ? "selected" : ""}>${templateText("MoneyModeShared")}</option>
                      </select></div>${sharedBudget}${ownBudgetFields}${sourceRules}`;
                } else {
                    const policyOptions = [["hard", "BudgetHard"], ["allow", "BudgetAllow"], ["gm", "BudgetGM"], ["unlimited", "BudgetUnlimited"]]
                        .map(([value, label]) => `<option value="${value}" ${block.budgetPolicy === value ? "selected" : ""}>${templateText(label)}</option>`).join("");
                    const ownBudgetFields = block.sharedBudgetKey ? "" : `<div class="form-group input-narrow"><label>${templateText("PointsAvailable")}</label>
                      <input type="number" data-field="${budgetField}" value="${budgetValue}" min="0"></div>
                      <div class="form-group"><label>${templateText("BudgetPolicy")}</label><select data-field="budgetPolicy">${policyOptions}</select></div>`;
                    budgetFields = `<div class="form-group"><label>${templateText("UseSharedBudget")}</label>
                      <input type="text" data-field="sharedBudgetKey" value="${esc(block.sharedBudgetKey)}" placeholder="${templateText("OwnBudget")}"></div>${ownBudgetFields}`;
                }
            }
            const blockBody = block.collapsed ? "" : `<div class="template-package-block-fields"><div class="form-group"><label>${templateText("CustomTitle")}</label><input type="text" data-field="title" value="${esc(block.title)}" placeholder="${templateText("DefaultTitleHint")}"></div></div>
              <div class="template-package-block-destinations"><div class="form-group"><label title="${templateText("DestinationGroupHint")}">${templateText("DestinationGroup")}</label><input type="text" data-field="destinationGroup" value="${esc(block.destinationGroup)}" title="${templateText("DestinationGroupHint")}"></div>
              <div class="form-group"><label title="${templateText("DestinationContainerHint")}">${templateText("NewContainer")}</label><input type="text" data-field="containerName" value="${esc(block.containerName)}" title="${templateText("DestinationContainerHint")}"></div></div>
              ${selectionFields || budgetFields ? `<div class="template-package-block-fields template-package-block-specific-fields">${selectionFields}${budgetFields}</div>` : ""}
              <div class="form-group template-package-block-instructions"><label title="${templateText("BlockInstructionsHint")}">${templateText("BlockInstructions")}</label><textarea data-field="instructions" rows="2" placeholder="${templateText("BlockInstructionsPlaceholder")}">${esc(block.instructions)}</textarea></div>
              <div class="template-package-entries">${entries}</div>
              <div class="template-package-dropzone"><i class="fas fa-box-open"></i> ${templateText("DropItems")}</div>
              <div class="template-package-block-actions"><button type="button" class="template-package-add-attribute"><i class="fas fa-sliders-h"></i> ${templateText("AddAttribute")}</button></div>`;
            return `<section class="template-package-block" data-block-id="${esc(block.id)}">
              <header class="template-package-block-header"><button type="button" class="toggle-template-package-block" aria-expanded="${block.collapsed ? "false" : "true"}" title="${templateText(block.collapsed ? "ExpandBlock" : "CollapseBlock")}" aria-label="${templateText(block.collapsed ? "ExpandBlock" : "CollapseBlock")}"><i class="fas ${block.collapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i></button>
              <div class="template-package-block-heading"><strong class="template-package-block-title">${esc(block.title || typeLabel(block.type))}</strong><small>${esc(typeLabel(block.type))}</small></div>
              <button type="button" class="template-package-delete-block" title="${templateText("RemoveBlock")}"><i class="fas fa-trash"></i></button></header>
              ${blockBody}
            </section>`;
        }).join("") || `<p class="notes">${templateText("NoBlocks")}</p>`;
    }

    _activatePackageEditor(html, blocks) {
        const container = html.find(".template-package-blocks");
        const refresh = () => {
            container.html(this._renderPackageBlocks(blocks));
            container.find("[data-field]").on("change", event => {
                const section = event.currentTarget.closest(".template-package-block");
                const block = blocks.find(candidate => candidate.id === section?.dataset?.blockId);
                if (!block) return;
                const input = event.currentTarget;
                const hadSpendingLimit = Object.prototype.hasOwnProperty.call(block, "spendingLimit");
                const value = input.type === "checkbox" ? input.checked
                    : input.type === "number" ? input.dataset.field === "spendingLimit" && input.value.trim() === "" ? "" : Number(input.value) || 0
                        : input.value;
                if (input.dataset.field.startsWith("paymentRules.")) {
                    const key = input.dataset.field.split(".")[1];
                    const rules = this._normalizePaymentRules(block.paymentRules);
                    if (key === "categories") rules.categories = String(value || "").split(",").map(term => term.trim().toLocaleLowerCase()).filter(Boolean);
                    else rules[key] = value === "any" ? [] : [String(value)];
                    block.paymentRules = this._normalizePaymentRules(rules);
                } else block[input.dataset.field] = value;
                if (input.dataset.field === "moneyMode") {
                    if (input.value === "deduct") {
                        block.moneyAccounting = "deduct";
                        block.sharedBudgetKey = "";
                        if (!hadSpendingLimit) block.spendingLimit = "";
                    } else if (input.value === "available") {
                        block.moneyAccounting = "budget";
                        block.sharedBudgetKey = "";
                    } else {
                        block.moneyAccounting = "budget";
                    }
                }
                if (["title", "sharedBudgetKey", "moneyMode"].includes(input.dataset.field)) refresh();
            });
            container.find(".toggle-template-package-block").on("click", event => {
                event.preventDefault();
                const id = event.currentTarget.closest(".template-package-block")?.dataset?.blockId;
                const block = blocks.find(candidate => candidate.id === id);
                if (!block) return;
                block.collapsed = !block.collapsed;
                refresh();
            });
            container.find(".template-package-delete-block").on("click", event => {
                const id = event.currentTarget.closest(".template-package-block")?.dataset?.blockId;
                const index = blocks.findIndex(block => block.id === id);
                if (index >= 0) blocks.splice(index, 1);
                refresh();
            });
            container.find(".template-package-delete-entry").on("click", event => {
                const section = event.currentTarget.closest(".template-package-block");
                const block = blocks.find(candidate => candidate.id === section?.dataset?.blockId);
                const entryId = event.currentTarget.closest(".template-package-entry")?.dataset?.entryId;
                if (block) block.contents = (block.contents || []).filter(item => item.id !== entryId);
                refresh();
            });
            container.find(".template-package-edit-entry").on("click", async event => {
                const section = event.currentTarget.closest(".template-package-block");
                const block = blocks.find(candidate => candidate.id === section?.dataset?.blockId);
                const entryId = event.currentTarget.closest(".template-package-entry")?.dataset?.entryId;
                const entry = (block?.contents || []).find(item => item.id === entryId);
                if (entry && await this._editPackageLocalEntry(entry, block)) refresh();
            });
            container.find(".template-package-preview-entry").on("click", async event => {
                event.preventDefault();
                const section = event.currentTarget.closest(".template-package-block");
                const block = blocks.find(candidate => candidate.id === section?.dataset?.blockId);
                const entryId = event.currentTarget.closest(".template-package-entry")?.dataset?.entryId;
                const entry = (block?.contents || []).find(item => item.id === entryId);
                if (entry) await this._showEntryPreview(entry);
            });
            container.find(".template-package-add-attribute").on("click", async event => {
                const blockId = event.currentTarget.closest(".template-package-block")?.dataset?.blockId;
                const block = blocks.find(candidate => candidate.id === blockId);
                const attribute = await this._createPackageAttributeEntry({}, { mode: "create", block });
                if (!block || !attribute) return;
                block.contents ||= [];
                block.contents.push(attribute);
                refresh();
            });
            container.find(".template-package-dropzone").on("dragover", event => event.preventDefault()).on("drop", async event => {
                event.preventDefault();
                const blockId = event.currentTarget.closest(".template-package-block")?.dataset?.blockId;
                const block = blocks.find(candidate => candidate.id === blockId);
                if (!block) return;
                const item = await this._resolveTemplateDroppedItem(event.originalEvent || event);
                if (!item) return;
                const newEntry = await this._buildTemplateDropEntry(item, { block });
                if (!newEntry) return;
                block.contents ||= [];
                block.contents.push(newEntry);
                refresh();
            });
        };
        html.find(".template-package-add-block").on("click", async event => {
            event.preventDefault();
            const config = await this._promptTemplateBlockConfiguration();
            if (!config) return;
            blocks.push({ ...this._createTemplateBlock(config.type), collapsed: false });
            refresh();
        });
        refresh();
    }

    async _configureEntryDraft(entry, { mode = "edit", sourceItem = null, block = null } = {}) {
        const draft = foundry.utils.deepClone(entry || {});
        if (draft.kind === "attribute") return this._createPackageAttributeEntry(draft, { mode, block });
        if (draft.kind === "group") return this._configureGroupEntryDraft(draft, { mode, block });
        if (draft.kind === "template") return this._configureTemplateEntryDraft(draft, { mode, block });
        if (!sourceItem) {
            sourceItem = draft.uuid ? await fromUuid(draft.uuid).catch(() => null)
                : draft.sourceId ? game.items.get(draft.sourceId) : null;
        }
        return this._configureItemEntryDraft(draft, { mode, sourceItem, block });
    }

    _configureTemplateEntryDraft(entry, { mode = "edit", block = null } = {}) {
        const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
        const isMoney = block?.type === "money";
        const content = `<div class="form-group"><label>${templateText("Name")}</label>
          <input type="text" id="template-ref-name" value="${esc(entry.name)}"></div>
          <div class="form-group"><label>${templateText(isMoney ? "MoneyUnitPrice" : "DisplayCost")}</label>
          <input type="number" id="template-ref-cost" min="${isMoney ? 0 : ""}" value="${Number(isMoney ? entry.moneyCost : entry.cost) || 0}"></div>
          <div class="form-group"><label><input type="checkbox" id="template-ref-repeatable" ${entry.repeatable ? "checked" : ""}>
          ${templateText("AllowRepeatedModel")}</label></div>
          ${this._renderChoiceRuleFields(entry, "template-ref")}
          <p class="notes">${templateText("ReferencedModelHint")}</p>`;
        return new Promise(resolve => new Dialog({
            title: templateText("ReferencedModel"), content,
            buttons: {
                save: { label: templateText(mode === "create" ? "Add" : "Save"), callback: html => {
                    entry.name = String(html.find("#template-ref-name").val() || entry.name).trim();
                    if (isMoney) entry.moneyCost = Math.max(0, Number(html.find("#template-ref-cost").val()) || 0);
                    else entry.cost = Number(html.find("#template-ref-cost").val()) || 0;
                    entry.repeatable = html.find("#template-ref-repeatable").is(":checked");
                    this._readChoiceRuleFields(entry, html, "template-ref");
                    resolve(entry);
                } },
                cancel: { label: templateText("Cancel"), callback: () => resolve(null) }
            }, default: "save", close: () => resolve(null), render: html => this._activateChoiceRuleFields(html, "template-ref")
        }, { classes: ["dialog", "gum", "template-config-dialog", "gum-sheet-edit-dialog"], width: 540 }).render(true));
    }

    _configureGroupEntryDraft(entry, { mode = "edit", block = null } = {}) {
        const blocks = this._normalizeGroupSubBlocks(foundry.utils.deepClone(entry.subBlocks || []));
        if (!blocks.length) blocks.push(this._createTemplateBlock("guaranteed"));
        const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
        const isMoney = block?.type === "money";
        const content = `<div class="template-group-dialog template-package-editor">
          <section class="template-package-settings"><div class="template-package-metadata">
            <div class="form-group"><label>${templateText("PackageName")}</label><input type="text" id="group-name" value="${esc(entry.name)}" placeholder="${templateText("SubgroupExample")}"></div>
            <div class="form-group"><label>${templateText("LocalNotes")}</label><input type="text" id="group-notes" value="${esc(entry.localNotes)}" placeholder="${templateText("SubgroupNotesExample")}"></div>
            <div class="form-group"><label>${templateText(isMoney ? "MoneyUnitPrice" : "DisplayCost")}</label><input type="number" id="group-cost" ${isMoney ? "min=\"0\"" : ""} value="${Number(isMoney ? entry.moneyCost : entry.cost) || 0}"></div>
          </div><div class="template-package-rule-fields" title="${templateText("RuleNamesHint")}">${this._renderChoiceRuleFields(entry, "group")}</div></section>
          <div class="template-package-section-title"><span>${templateText("Blocks")}</span>
            <button type="button" class="template-package-add-block" title="${templateText("AddBlock")}" aria-label="${templateText("AddBlock")}"><i class="fas fa-plus"></i></button></div>
          <div class="template-package-blocks"></div></div>`;
        return new Promise(resolve => new Dialog({
            title: templateText(mode === "create" ? "AddSubgroup" : "EditSubgroup"), content,
            buttons: {
                save: { label: templateText(mode === "create" ? "Add" : "Save"), callback: html => {
                    entry.name = String(html.find("#group-name").val() || "").trim() || templateText("Package");
                    entry.localNotes = String(html.find("#group-notes").val() || "").trim();
                    if (isMoney) entry.moneyCost = Math.max(0, Number(html.find("#group-cost").val()) || 0);
                    else entry.cost = Number(html.find("#group-cost").val()) || 0;
                    this._readChoiceRuleFields(entry, html, "group");
                    entry.subBlocks = this._normalizeGroupSubBlocks(blocks);
                    resolve(entry);
                } },
                cancel: { label: templateText("Cancel"), callback: () => resolve(null) }
            }, default: "save", close: () => resolve(null), render: html => {
                this._activatePackageEditor(html, blocks);
                this._activateChoiceRuleFields(html, "group");
            }
        }, { classes: ["dialog", "gum", "template-config-dialog", "template-package-dialog", "gum-sheet-edit-dialog"], width: 760, height: 600, resizable: true }).render(true));
    }

    _configureItemEntryDraft(entry, { mode = "edit", sourceItem = null, block = null } = {}) {
        const isEquipment = entry.itemType === "equipment";
        const isTrait = ["advantage", "disadvantage"].includes(entry.itemType) && Boolean(entry.trait_cost);
        const isLevelledAbility = ["skill", "spell", "power"].includes(entry.itemType);
        const isMoney = block?.type === "money";
        const supportsLevelCap = isLevelledAbility || (isTrait && entry.trait_cost.can_level);
        const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
        const groupMode = entry.destinationMode || (entry.destinationGroup ? "group" : "inherit");
        const containerMode = entry.containerMode || (entry.containerName ? "new" : "inherit");
        const difficulty = isLevelledAbility && sourceItem ? this._getItemDifficulty(sourceItem) : "";
        const progression = isLevelledAbility && sourceItem ? this._getPointsPerLevelInfo(sourceItem) : "";
        const content = `<div class="template-entry-edit-form">
          <div class="form-group template-edit-name"><label for="entry-name">${templateText("Name")}</label><input type="text" id="entry-name" value="${esc(entry.name)}"></div>
          ${isLevelledAbility && (difficulty || progression) ? `<div class="template-entry-source-summary">${difficulty ? `<span><strong>${templateText("Difficulty")}</strong> ${esc(difficulty)}</span>` : ""}${progression ? `<span><strong>${templateText("PointsPerLevel")}</strong> ${esc(progression)}</span>` : ""}</div>` : ""}
          ${isEquipment ? `<div class="template-entry-equipment-fields">
            <div class="template-entry-equipment-grid template-entry-equipment-quantities">
              <div class="form-group template-entry-quantity-field"><label>${templateText("InitialQuantity")}</label><span class="template-entry-quantity-stepper"><button type="button" class="template-entry-quantity-step" data-step="-1"><i class="fas fa-minus"></i></button><input type="number" id="entry-qty" value="${entry.quantity ?? 1}" min="1"><button type="button" class="template-entry-quantity-step" data-step="1"><i class="fas fa-plus"></i></button></span></div>
              <div class="form-group"><label title="${templateText("MinimumQuantityHint")}">${templateText("MinimumQuantity")}</label><input type="number" id="entry-min-quantity" value="${Math.max(1, Number(entry.minimumQuantity) || 1)}" min="1" step="1"></div>
              <div class="form-group"><label title="${templateText("MaximumQuantityHint")}">${templateText("MaximumQuantity")}</label><input type="number" id="entry-max-quantity" value="${entry.maximumQuantity ?? ""}" min="1" step="1" placeholder="${templateText("NoQuantityLimit")}"></div>
            </div>
            <div class="template-entry-equipment-grid template-entry-equipment-values">
              <div class="form-group"><label title="${templateText("EntryLevelValueHint")}">${templateText("Level")}</label><input type="text" id="entry-level" value="${esc(entry.level)}"></div>
              <div class="form-group"><label for="entry-points-cost">${templateText("EquipmentPointCost")}</label><input type="number" id="entry-points-cost" value="${Number(entry.pointsCost) || 0}" min="0"></div>
              <div class="form-group"><label title="${templateText("MoneyUnitPriceHint")}">${templateText("MoneyUnitPrice")}</label><input type="number" id="entry-money-cost" min="0" step="any" value="${Math.max(0, Number(entry.moneyCost ?? entry.cost) || 0)}"></div>
            </div>
            <div class="template-entry-equipment-options"><label class="template-entry-equipment-option" title="${templateText("LockQuantityHint")}"><input type="checkbox" id="entry-quantity-locked" ${entry.quantityLocked ? "checked" : ""}><span>${templateText("LockQuantity")}</span></label><label class="template-entry-equipment-option" title="${templateText("QuantityConsumesChoicesHint")}"><input type="checkbox" id="entry-selection-quantity" ${entry.selectionQuantity ? "checked" : ""}><span>${templateText("QuantityConsumesChoices")}</span></label></div>
          </div>` : `<div class="template-entry-basic-fields">
            ${isTrait ? `<div class="form-group"><label>${templateText("BaseCost")}</label><input type="number" id="entry-base-cost" value="${entry.trait_cost.points ?? 0}"></div>
              <div class="form-group"><label>${templateText("PointsPerLevel")}</label><input type="number" id="entry-points-per-level" value="${entry.trait_cost.points_per_level ?? 0}"></div>` : ""}
            <div class="form-group"><label>${isLevelledAbility ? templateText("RelativeLevel") : templateText("Level")}</label><input type="number" id="entry-level" value="${esc(isTrait ? entry.trait_cost.level ?? entry.level ?? 0 : entry.level)}" ${isTrait ? "min=\"0\"" : ""}></div>
            ${isMoney ? `<div class="form-group"><label title="${templateText("MoneyUnitPriceHint")}">${templateText("MoneyUnitPrice")}</label><input type="number" id="entry-money-cost" min="0" step="any" value="${Math.max(0, Number(entry.moneyCost) || 0)}"></div>` : !isTrait ? `<div class="form-group"><label>${templateText("TotalCost")}</label><input type="number" id="entry-cost" value="${Number(entry.cost) || 0}" ${isLevelledAbility && sourceItem ? "readonly" : ""}></div>` : `<div class="form-group"><label>${templateText("FinalCost")}</label><input type="number" id="entry-cost" value="${Number(entry.cost) || 0}" readonly></div>`}
            ${supportsLevelCap ? `<div class="form-group"><label>${templateText("MaximumLevel")}</label><input type="number" id="entry-max-level" value="${entry.maxLevel ?? ""}" placeholder="${templateText("NoLevelLimit")}"></div>` : ""}
          </div>`}
          ${isEquipment ? `<section class="template-entry-destination-section"><h3>${templateText("EquipmentDestination")}</h3>` : ""}<div class="template-entry-destination">
            ${!isEquipment ? `<div class="form-group"><label for="entry-destination-mode">${templateText("GroupDestinationMode")}</label><select id="entry-destination-mode"><option value="inherit" ${groupMode === "inherit" ? "selected" : ""}>${templateText("InheritBlock")}</option><option value="group" ${groupMode === "group" ? "selected" : ""}>${templateText("UseNamedGroup")}</option><option value="source" ${groupMode === "source" ? "selected" : ""}>${templateText("KeepSourceGroup")}</option></select></div><div class="form-group template-destination-name"><label for="entry-destination-group" title="${templateText("DestinationGroupHint")}">${templateText("DestinationGroup")}</label><input type="text" id="entry-destination-group" value="${esc(entry.destinationGroup)}"></div>` : ""}
            ${isEquipment ? `<div class="form-group"><label for="entry-container-mode">${templateText("DestinationMode")}</label><select id="entry-container-mode"><option value="inherit" ${containerMode === "inherit" ? "selected" : ""}>${templateText("InheritBlock")}</option><option value="new" ${containerMode === "new" ? "selected" : ""}>${templateText("CreateContainer")}</option><option value="loose" ${containerMode === "loose" ? "selected" : ""}>${templateText("LooseEquipment")}</option></select></div><div class="form-group template-destination-name"><label for="entry-container-name" title="${templateText("DestinationContainerHint")}">${templateText("NewContainer")}</label><input type="text" id="entry-container-name" value="${esc(entry.containerName)}"></div>` : ""}
          </div>${isEquipment ? `</section>` : ""}
          <div class="template-entry-rule-fields" title="${templateText("RuleNamesHint")}">${this._renderChoiceRuleFields(entry, "entry")}</div></div>`;
        return new Promise(resolve => new Dialog({
            title: `${templateText(mode === "create" ? "Add" : "EditBlockItem")}: ${esc(entry.name)}`, content,
            buttons: {
                save: { label: templateText(mode === "create" ? "Add" : "Save"), callback: html => {
                    entry.name = String(html.find("#entry-name").val() || entry.name).trim();
                    if (isEquipment) {
                        entry.minimumQuantity = Math.max(1, Math.floor(Number(html.find("#entry-min-quantity").val()) || 1));
                        const rawMaximum = html.find("#entry-max-quantity").val();
                        entry.maximumQuantity = rawMaximum === "" ? null : Math.max(entry.minimumQuantity, Math.floor(Number(rawMaximum) || entry.minimumQuantity));
                        entry.quantity = Math.max(entry.minimumQuantity, Math.floor(Number(html.find("#entry-qty").val()) || entry.minimumQuantity));
                        if (entry.maximumQuantity !== null) entry.quantity = Math.min(entry.quantity, entry.maximumQuantity);
                        entry.quantityLocked = html.find("#entry-quantity-locked").is(":checked");
                        entry.selectionQuantity = html.find("#entry-selection-quantity").is(":checked");
                        entry.pointsCost = Math.max(0, Number(html.find("#entry-points-cost").val()) || 0);
                    }
                    entry.level = html.find("#entry-level").val();
                    if (!isEquipment) entry.level = Number(entry.level) || 0;
                    if (supportsLevelCap) {
                        const raw = html.find("#entry-max-level").val();
                        entry.maxLevel = raw === "" ? null : Number(raw);
                        if (entry.maxLevel !== null && Number(entry.level) > entry.maxLevel) entry.level = entry.maxLevel;
                    }
                    if (!isEquipment) {
                        entry.destinationMode = String(html.find("#entry-destination-mode").val() || "inherit");
                        entry.destinationGroup = String(html.find("#entry-destination-group").val() || "").trim();
                    } else {
                        entry.containerMode = String(html.find("#entry-container-mode").val() || "inherit");
                        entry.containerName = String(html.find("#entry-container-name").val() || "").trim();
                    }
                    if (entry.destinationMode === "group" && !entry.destinationGroup) {
                        ui.notifications.warn(templateText("GroupNameRequired"));
                        return false;
                    }
                    if (entry.containerMode === "new" && !entry.containerName) {
                        ui.notifications.warn(templateText("ContainerNameRequired"));
                        return false;
                    }
                    this._readChoiceRuleFields(entry, html, "entry");
                    if (isMoney || isEquipment) entry.moneyCost = Math.max(0, Number(html.find("#entry-money-cost").val()) || 0);
                    if (isTrait) {
                        entry.trait_cost.points = Number(html.find("#entry-base-cost").val()) || 0;
                        entry.trait_cost.points_per_level = Number(html.find("#entry-points-per-level").val()) || 0;
                        entry.trait_cost.level = Number(entry.level) || 0;
                        entry.level = entry.trait_cost.level;
                        entry.cost = calculateTraitCost(entry.trait_cost).finalPoints;
                    } else if (!isMoney && isLevelledAbility && sourceItem) entry.cost = this._calculateLevelledItemCost(sourceItem, entry.level);
                    else if (!isMoney && !isEquipment) entry.cost = Number(html.find("#entry-cost").val()) || 0;
                    resolve(entry);
                } },
                cancel: { label: templateText("Cancel"), callback: () => resolve(null) }
            }, default: "save", close: () => resolve(null), render: html => {
                this._activateChoiceRuleFields(html, "entry");
                const selector = html.find(isEquipment ? "#entry-container-mode" : "#entry-destination-mode");
                const updateDestination = () => html.find(".template-destination-name").toggle(selector.val() === (isEquipment ? "new" : "group"));
                selector.on("change", updateDestination);
                const clampEntryQuantity = value => {
                    const minimum = Math.max(1, Math.floor(Number(html.find("#entry-min-quantity").val()) || 1));
                    const rawMaximum = html.find("#entry-max-quantity").val();
                    const maximum = rawMaximum === "" ? Infinity : Math.max(minimum, Math.floor(Number(rawMaximum) || minimum));
                    return Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || minimum)));
                };
                html.find(".template-entry-quantity-step").on("click", event => { event.preventDefault(); const input = html.find("#entry-qty"); input.val(clampEntryQuantity((Number(input.val()) || 1) + (Number(event.currentTarget.dataset.step) || 0))); });
                html.find("#entry-min-quantity, #entry-max-quantity").on("change", () => html.find("#entry-qty").val(clampEntryQuantity(html.find("#entry-qty").val())));
                const recalc = () => {
                    const level = Number(html.find("#entry-level").val()) || 0;
                    if (!isMoney && isTrait) html.find("#entry-cost").val(calculateTraitCost({ ...entry.trait_cost, points: Number(html.find("#entry-base-cost").val()) || 0, points_per_level: Number(html.find("#entry-points-per-level").val()) || 0, level }).finalPoints);
                    else if (!isMoney && isLevelledAbility && sourceItem) html.find("#entry-cost").val(this._calculateLevelledItemCost(sourceItem, level));
                };
                html.find("#entry-base-cost, #entry-points-per-level, #entry-level").on("input", recalc);
                updateDestination(); recalc();
            }
        }, { classes: ["dialog", "gum", "template-config-dialog", "template-entry-config-dialog", "gum-sheet-edit-dialog"], width: 560, resizable: true }).render(true));
    }

    _createPackageAttributeEntry(existing = {}, { mode = "create", block = null } = {}) {
        const isMoney = block?.type === "money";
        const content = `<div class="template-attr-dialog"><div class="template-attr-grid-header">
          <span>${templateText("Attribute")}</span><span>${templateText("Increase")}</span><span>${templateText("Cost")}</span><span>${templateText("AttributeLimit")}</span><span>${templateText("FixedValue")}</span></div>
          <div class="template-attr-grid">${this._renderAttributeFieldRows(existing.attributes || {}, existing.costs || {}, existing.attributeLimits || {}, existing.selectedAttributes, existing.lockedAttributes)}</div>
          <div class="template-attr-summary"><label class="template-attr-secondary"><input type="checkbox" id="link-secondary" ${existing.linkSecondary ? "checked" : ""}> ${templateText("RecalculateSecondary")}</label>
          <div class="template-attr-total"><label for="template-attr-total-cost">${templateText("TotalCost")}</label><input type="number" id="template-attr-total-cost" value="${Number(existing.cost) || 0}" readonly></div></div>
          ${isMoney ? `<div class="form-group"><label for="template-attr-money-cost">${templateText("MoneyUnitPrice")}</label><input type="number" id="template-attr-money-cost" min="0" step="any" value="${Math.max(0, Number(existing.moneyCost) || 0)}"></div>` : ""}
          <div class="template-attr-rule-grid" title="${templateText("RuleNamesHint")}">${this._renderChoiceRuleFields(existing, "package-attr")}</div></div>`;
        return new Promise(resolve => new Dialog({
            title: templateText(mode === "create" ? "AddAttribute" : "EditAttribute"), content,
            buttons: {
                save: { label: templateText(mode === "create" ? "Add" : "Save"), callback: html => {
                    const { attributes, costs, attributeLimits, selectedAttributes, lockedAttributes } = this._readAttributeFields(html);
                    const entry = { ...foundry.utils.deepClone(existing), id: existing.id || foundry.utils.randomID(), kind: "attribute", label: existing.label || templateText("Attributes"), attributes, costs, attributeLimits, selectedAttributes, lockedAttributes,
                        linkSecondary: html.find("#link-secondary").is(":checked"), cost: this._calculateAttributeCost(attributes, costs) };
                    if (isMoney) entry.moneyCost = Math.max(0, Number(html.find("#template-attr-money-cost").val()) || 0);
                    this._readChoiceRuleFields(entry, html, "package-attr");
                    resolve(entry);
                } },
                cancel: { label: templateText("Cancel"), callback: () => resolve(null) }
            }, default: "save", close: () => resolve(null), render: html => {
                this._activateChoiceRuleFields(html, "package-attr");
                const recalc = () => {
                    const { attributes, costs } = this._readAttributeFields(html);
                    html.find("#template-attr-total-cost").val(this._calculateAttributeCost(attributes, costs));
                };
                html.find(".template-attr-grid input[type='number']").on("input", recalc);
                html.find(".template-attr-select").on("change", event => event.currentTarget.closest(".template-attr-row")?.classList.toggle("is-selected", event.currentTarget.checked));
                html.find(".template-attr-select").trigger("change");
                recalc();
            }
        }, { classes: ["dialog", "gum", "template-config-dialog", "template-attribute-dialog", "gum-sheet-edit-dialog"], width: 700, height: 760 }).render(true));
    }

    async _editPackageLocalEntry(entry, block = null) {
        const replacement = await this._configureEntryDraft(entry, { mode: "edit", block });
        if (!replacement) return false;
        Object.assign(entry, replacement, { id: entry.id });
        return true;
    }

    async _replaceEntry(blockId, entryId, newEntry) {
        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
        const block = blocks.find(b => b.id === blockId);
        if (!block) return;

        const index = (block.contents || []).findIndex(e => e.id === entryId);
        if (index < 0) return;

        block.contents[index] = newEntry;
        await this.item.update({ "system.blocks": blocks });
    }

    async _onDrop(event) {
        event.preventDefault();

        const blockEl = event.currentTarget.closest(".template-block");
        const blockId = blockEl?.dataset?.blockId;
        if (!blockId) return;
        const block = (this.item.system.blocks || []).find(candidate => candidate.id === blockId);

        const item = await this._resolveTemplateDroppedItem(event);
        if (!item) return;

        const entry = await this._buildTemplateDropEntry(item, { block });
        if (!entry) return;
        await this._appendEntryToBlock(blockId, entry);
    }

    async _resolveTemplateDroppedItem(event) {
        const data = TextEditor.getDragEventData(event);
        let item = null;
        if (data.uuid) item = await fromUuid(data.uuid).catch(() => null);
        if (!item && data.type === "Item" && data.id) item = game.items.get(data.id);
        return item;
    }

    async _buildTemplateDropEntry(item, { block = null } = {}) {
        let entry;
        if (item.type === "template") {
            if (item.uuid === this.item.uuid || item.id === this.item.id) {
                ui.notifications.warn(templateText("DirectSelfReference"));
                return null;
            }
            entry = {
                id: foundry.utils.randomID(), kind: "template", uuid: item.uuid, sourceId: item.id,
                name: item.name, img: item.img, cost: 0, subBlocks: []
            };
        } else if (!["skill", "spell", "power", "advantage", "disadvantage", "equipment"].includes(item.type)) {
            ui.notifications.warn(templateText("UnsupportedItem"));
            return null;
        } else {
            entry = await this._buildEntryFromItem(item);
        }
        if (entry && block?.type === "money" && entry.moneyCost === undefined) {
            entry.moneyCost = entry.itemType === "equipment" ? Math.max(0, Number(entry.cost) || 0) : 0;
        }
        return entry ? this._configureEntryDraft(entry, { mode: "create", sourceItem: item, block }) : null;
    }

    async _buildEntryFromItem(item) {
        const base = {
            id: foundry.utils.randomID(),
            kind: "item",
            itemType: item.type,
            uuid: item.uuid,
            sourceId: item.id,
            name: item.name,
            img: item.img,
            quantity: 1,
            level: "",
            cost: 0,
            pointsCost: 0
        };

        if (item.type === "equipment") {
            base.quantity = Math.max(1, Number(item.system?.quantity) || 1);
                base.minimumQuantity = 1;
                base.maximumQuantity = null;
            base.level = String(item.system?.level ?? "").trim();
            base.cost = Number(item.system?.cost) || 0;
            base.moneyCost = Math.max(0, base.cost);
            base.pointsCost = Number(item.system?.points) || 0;
            base.quantityLocked = false;
            return base;
        }

        if (["skill", "spell", "power"].includes(item.type)) {
            base.level = Number(item.system?.skill_level ?? item.system?.level ?? 0) || 0;
            base.maxLevel = null;
            base.cost = this._calculateLevelledItemCost(item, base.level);
            return base;
        }

        if (["advantage", "disadvantage"].includes(item.type)) {
            base.trait_cost = foundry.utils.deepClone(traitCostInput(item.system));
            base.level = item.system?.level ?? "";
            base.maxLevel = null;
            base.cost = calculateTraitCost(base.trait_cost).finalPoints;
            return base;
        }

        return base;
    }

    _getItemDifficulty(item) {
        const raw = item.system?.difficulty;
        if (raw === undefined || raw === null || raw === "") return "";

        const map = {
            "E": "Fácil",
            "A": "Média",
            "H": "Difícil",
            "VH": "Muito Difícil",
            "F": "Fácil",
            "M": "Média",
            "D": "Difícil",
            "MD": "Muito Difícil",
            "TecM": "Técnica Média",
            "TecD": "Técnica Difícil"
        };

        return map[raw] || String(raw);
    }

    _getPointsPerLevelInfo(item) {
        const difficulty = item.system?.difficulty ?? "M";
        const normalized = ({
            "E": "F", "A": "M", "H": "D", "VH": "MD"
        })[difficulty] || difficulty;

        if (normalized === "TecM") return "Progressão técnica: +1 ponto por nível";
        if (normalized === "TecD") return "Progressão técnica difícil: 2 pontos no primeiro nível, +1 ponto por nível adicional";

        const tables = {
            "F": "Tabela Fácil (1, 2, 4, 8, 12, 16...)",
            "M": "Tabela Média (1, 2, 4, 8, 12, 16, 20...)",
            "D": "Tabela Difícil (1, 2, 4, 8, 12, 16, 20, 24...)",
            "MD": "Tabela Muito Difícil (1, 2, 4, 8, 12, 16, 20, 24, 28...)"
        };

        return tables[normalized] || "Progressão por tabela do sistema";
    }

    _calculateLevelledItemCost(item, level) {
        const difficulty = item.system?.difficulty ?? "M";
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

        if (normalized === "TecM") return Math.max(0, level * 1);
        if (normalized === "TecD") return level > 0 ? level + 1 : 0;

        const table = tables[normalized] || tables["M"];
        const rl = Number(level) || 0;
        const keys = Object.keys(table).map(k => parseInt(k));
        const minKey = Math.min(...keys);
        const maxKey = Math.max(...keys);

        if (rl < minKey) return 0;
        if (rl in table) return table[rl];

        const base = table[maxKey];
        return base + (rl - maxKey) * 4;
    }
}
