export class TemplateItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "theme-dark", "template-item-sheet"],
            width: 520,
            height: 480,
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
        return this.item?.name ? `Modelo: ${this.item.name}` : "Modelo";
    }

    async getData(options = {}) {
        const context = await super.getData(options);
        context.system = this.item.system ?? {};
        context.blocks = this._prepareBlocks(context.system.blocks ?? []);
        return context;
    }

    _prepareBlocks(blocks) {
        return (blocks || []).map(block => {
            const typeLabel = this._getBlockTypeLabel(block.type);
            const displayTitle = (block.title || "").trim() || typeLabel;
            const contents = (block.contents || []).map(entry => this._prepareEntry(entry));
            const icon = this._getBlockIcon(block.type);

            return {
                ...block,
                displayTitle,
                typeLabel,
                isGuaranteed: block.type === "guaranteed",
                isSelection: block.type === "selection",
                isPoints: block.type === "points",
                summaryText: this._buildBlockSummary(block, contents),
                icon,
                contents
            };
        });
    }

    _prepareEntry(entry) {
        if (entry.kind === "attribute") {
            return {
                ...entry,
                rowName: entry.label || "Atributos",
                rowQty: "-",
                rowLevel: "-",
                rowCost: entry.cost ?? 0,
                rowSubtitle: this._buildAttributeSummary(entry)
            };
        }

        return {
            ...entry,
            rowName: entry.name || "Item",
            rowQty: entry.quantity ?? "-",
            rowLevel: entry.level ?? "-",
            rowCost: entry.cost ?? "-",
            rowSubtitle: this._buildItemSubtitle(entry)
        };
    }

    _buildBlockSummary(block, contents) {
        const count = contents.length;
        if (block.type === "selection") {
            return `${count} item(ns) • escolher ${block.choiceCount ?? 1}`;
        }
        if (block.type === "points") {
            return `${count} opção(ões) • ${block.pointsAvailable ?? 0} pontos`;
        }
        return `${count} item(ns)`;
    }

    _buildItemSubtitle(entry) {
        const parts = [];
        if (entry.itemType) parts.push(this._getItemTypeLabel(entry.itemType));
        if (entry.cost !== undefined && entry.cost !== null) parts.push(`${entry.cost} pts`);
        if (entry.level !== undefined && entry.level !== null && entry.level !== "") parts.push(`Nível ${entry.level}`);
        if (entry.quantity !== undefined && entry.quantity !== null && entry.quantity !== "" && entry.quantity !== 1) parts.push(`Qtd ${entry.quantity}`);
        return parts.join(" • ");
    }

    _buildAttributeSummary(entry) {
        const parts = [];
        const attrs = entry.attributes || {};

        for (const [key, value] of Object.entries(attrs)) {
            const numeric = Number(value) || 0;
            if (!numeric) continue;
            const label = this._getAttributeLabel(key);
            const sign = numeric > 0 ? "+" : "";
            parts.push(`${label} ${sign}${numeric}`);
        }

        if (!parts.length) return "Nenhuma alteração";
        return parts.join(" • ");
    }

    _getItemTypeLabel(type) {
        const map = {
            skill: "Perícia",
            spell: "Magia",
            power: "Poder",
            advantage: "Vantagem",
            disadvantage: "Desvantagem",
            equipment: "Equipamento"
        };
        return map[type] || type;
    }

    _getBlockTypeLabel(type) {
        const map = {
            guaranteed: "Garantido",
            selection: "Seleção",
            points: "Alocação por Pontos"
        };
        return map[type] || "Bloco";
    }

    _getBlockIcon(type) {
        const map = {
            guaranteed: "icons/sundries/misc/lock-open-yellow.webp",
            selection: "icons/sundries/misc/admission-ticket-grey.webp",
            points: "icons/sundries/books/book-open-purple.webp"
        };
        return map[type] || "icons/svg/item-bag.svg";
    }

    _getAttributeLabel(key) {
        const map = {
            st: "ST",
            dx: "DX",
            iq: "IQ",
            ht: "HT",
            will: "Vont",
            per: "Per",
            hp: "PV",
            fp: "PF",
            basic_speed: "Velocidade",
            move: "Deslocamento"
        };
        return map[key] || key;
    }

        _getAttributeCostPerLevel(key) {
        const map = {
            st: 10,
            dx: 20,
            iq: 20,
            ht: 10,
            will: 5,
            per: 5,
            hp: 2,
            fp: 3,
            basic_speed: 5,
            move: 5
        };
        return map[key] || 0;
    }

    _renderAttributeFieldRows(attributes = {}, costs = {}) {
        const rows = [
            { key: "st", label: "ST" },
            { key: "dx", label: "DX" },
            { key: "iq", label: "IQ" },
            { key: "ht", label: "HT" },
            { key: "will", label: "Vont" },
            { key: "per", label: "Per" },
            { key: "hp", label: "PV" },
            { key: "fp", label: "PF" },
            { key: "basic_speed", label: "Velocidade", step: "0.25" },
            { key: "move", label: "Deslocamento" }
        ];

        return rows.map(row => {
            const value = attributes[row.key] ?? 0;
            const cost = costs[row.key] ?? this._getAttributeCostPerLevel(row.key);
            const step = row.step ? `step="${row.step}"` : "";
            return `
            <div class="template-attr-row">
                <label for="attr-${row.key}">${row.label}</label>
                <input type="number" id="attr-${row.key}" value="${value}" ${step}>
                <input type="number" id="cost-${row.key}" value="${cost}">
            </div>`;
        }).join("");
    }

    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        html.on("click", ".add-template-block", this._onAddBlock.bind(this));
        html.on("click", ".edit-template-block", this._onEditBlock.bind(this));
        html.on("click", ".delete-template-block", this._onDeleteBlock.bind(this));
        html.on("change", ".block-field", this._onBlockFieldChange.bind(this));

        html.on("click", ".add-block-attribute", this._onAddAttribute.bind(this));
        html.on("click", ".delete-block-entry", this._onDeleteEntry.bind(this));
        html.on("click", ".edit-block-entry", this._onEditEntry.bind(this));

        html.on("dragover", ".template-dropzone", ev => ev.preventDefault());
        html.on("drop", ".template-dropzone", this._onDrop.bind(this));

    }

    async _onAddBlock(event) {
        event.preventDefault();

        const content = `
        <div class="template-block-create-dialog">
            <div class="form-group">
                <label>Nome do Bloco</label>
                <input type="text" id="template-block-title" placeholder="Digite um nome para o bloco"/>
            </div>

            <hr>

            <div class="template-block-type-list">
                <label class="template-block-type-option">
                    <input type="radio" name="template-block-type" value="guaranteed" checked>
                    <span>Garantido</span>
                </label>
                <label class="template-block-type-option">
                    <input type="radio" name="template-block-type" value="selection">
                    <span>Seleção</span>
                </label>
                <label class="template-block-type-option">
                    <input type="radio" name="template-block-type" value="points">
                    <span>Alocação por pontos</span>
                </label>
            </div>
        </div>
        `;

        new Dialog({
            title: "Adicionar Bloco",
            content,
            buttons: {
                create: {
                    label: "Salvar",
                    callback: async (dlgHtml) => {
                        const type = dlgHtml.find("input[name='template-block-type']:checked").val();
                        const title = (dlgHtml.find("#template-block-title").val() || "").trim();

                        const blocks = foundry.utils.deepClone(this.item.system.blocks || []);
                        const newBlock = {
                            id: foundry.utils.randomID(),
                            type,
                            title,
                            choiceCount: 1,
                            pointsAvailable: 20,
                            contents: [],
                            collapsed: true
                        };

                        blocks.push(newBlock);
                        await this.item.update({ "system.blocks": blocks });
                    }
                },
                cancel: { label: "Cancelar" }
            },
            default: "create"
        }).render(true);
    }

    async _onEditBlock(event) {
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
        if (input.type === "number") value = Number(input.value) || 0;
        else value = input.value;

        block[field] = value;
        await this.item.update({ "system.blocks": blocks });
    }

    async _onAddAttribute(event) {
        event.preventDefault();
        const blockId = event.currentTarget.dataset.blockId;

        const content = `
        <div class="template-attr-dialog">
            <div class="form-group">
                <label><input type="checkbox" id="link-secondary" checked> Vincular atributos secundários aos primários</label>
            </div>

            <div class="template-attr-grid-header">
                <span>Atributo</span>
                <span>Incremento</span>
                <span>Custo</span>
            </div>

            <div class="template-attr-grid">
                ${this._renderAttributeFieldRows()}
            </div>

            <div class="form-group" style="margin-top:10px;">
                <label>Custo Total</label>
                <input type="number" id="template-attr-total-cost" value="0" readonly>
            </div>
        </div>
        `;

        new Dialog({
            title: "Adicionar Atributo",
            content,
            buttons: {
                save: {
                    label: "Salvar",
                    callback: async (dlgHtml) => {
                        const attributes = {
                            st: Number(dlgHtml.find("#attr-st").val()) || 0,
                            dx: Number(dlgHtml.find("#attr-dx").val()) || 0,
                            iq: Number(dlgHtml.find("#attr-iq").val()) || 0,
                            ht: Number(dlgHtml.find("#attr-ht").val()) || 0,
                            will: Number(dlgHtml.find("#attr-will").val()) || 0,
                            per: Number(dlgHtml.find("#attr-per").val()) || 0,
                            hp: Number(dlgHtml.find("#attr-hp").val()) || 0,
                            fp: Number(dlgHtml.find("#attr-fp").val()) || 0,
                            basic_speed: Number(dlgHtml.find("#attr-basic_speed").val()) || 0,
                            move: Number(dlgHtml.find("#attr-move").val()) || 0
                        };

                        const costs = {
                            st: Number(dlgHtml.find("#cost-st").val()) || 0,
                            dx: Number(dlgHtml.find("#cost-dx").val()) || 0,
                            iq: Number(dlgHtml.find("#cost-iq").val()) || 0,
                            ht: Number(dlgHtml.find("#cost-ht").val()) || 0,
                            will: Number(dlgHtml.find("#cost-will").val()) || 0,
                            per: Number(dlgHtml.find("#cost-per").val()) || 0,
                            hp: Number(dlgHtml.find("#cost-hp").val()) || 0,
                            fp: Number(dlgHtml.find("#cost-fp").val()) || 0,
                            basic_speed: Number(dlgHtml.find("#cost-basic_speed").val()) || 0,
                            move: Number(dlgHtml.find("#cost-move").val()) || 0
                        };

                        const linkSecondary = dlgHtml.find("#link-secondary").is(":checked");
                        const cost = this._calculateAttributeCost(attributes, costs);

                        const entry = {
                            id: foundry.utils.randomID(),
                            kind: "attribute",
                            label: "Atributos",
                            attributes,
                            costs,
                            linkSecondary,
                            cost
                        };

                        await this._appendEntryToBlock(blockId, entry);
                    }
                },
                cancel: { label: "Cancelar" }
            },
                default: "save",
                render: (dlgHtml) => {
                    const recalc = () => {
                        const attributes = {
                            st: Number(dlgHtml.find("#attr-st").val()) || 0,
                            dx: Number(dlgHtml.find("#attr-dx").val()) || 0,
                            iq: Number(dlgHtml.find("#attr-iq").val()) || 0,
                            ht: Number(dlgHtml.find("#attr-ht").val()) || 0,
                            will: Number(dlgHtml.find("#attr-will").val()) || 0,
                            per: Number(dlgHtml.find("#attr-per").val()) || 0,
                            hp: Number(dlgHtml.find("#attr-hp").val()) || 0,
                            fp: Number(dlgHtml.find("#attr-fp").val()) || 0,
                            basic_speed: Number(dlgHtml.find("#attr-basic_speed").val()) || 0,
                            move: Number(dlgHtml.find("#attr-move").val()) || 0
                        };

                        const costs = {
                            st: Number(dlgHtml.find("#cost-st").val()) || 0,
                            dx: Number(dlgHtml.find("#cost-dx").val()) || 0,
                            iq: Number(dlgHtml.find("#cost-iq").val()) || 0,
                            ht: Number(dlgHtml.find("#cost-ht").val()) || 0,
                            will: Number(dlgHtml.find("#cost-will").val()) || 0,
                            per: Number(dlgHtml.find("#cost-per").val()) || 0,
                            hp: Number(dlgHtml.find("#cost-hp").val()) || 0,
                            fp: Number(dlgHtml.find("#cost-fp").val()) || 0,
                            basic_speed: Number(dlgHtml.find("#cost-basic_speed").val()) || 0,
                            move: Number(dlgHtml.find("#cost-move").val()) || 0
                        };

                        dlgHtml.find("#template-attr-total-cost").val(this._calculateAttributeCost(attributes, costs));
                    };

                    dlgHtml.find(".template-attr-grid input[type='number']").on("input", recalc);
                    recalc();
                }
            }).render(true);
    }

    _calculateAttributeCost(attributes, costs = {}) {
        let total = 0;

        for (const [key, value] of Object.entries(attributes)) {
            const increment = Number(value) || 0;
            const costPerLevel = Number(costs[key] ?? this._getAttributeCostPerLevel(key)) || 0;
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

        if (entry.kind === "attribute") {
            return this._editAttributeEntry(blockId, entryId, entry);
        }

        return this._editItemEntry(blockId, entryId, entry);
    }

    async _editAttributeEntry(blockId, entryId, entry) {
        const attrs = entry.attributes || {};
        const costs = entry.costs || {};

        const content = `
        <div class="template-attr-dialog">
            <div class="form-group">
                <label><input type="checkbox" id="link-secondary" ${entry.linkSecondary ? "checked" : ""}> Vincular atributos secundários aos primários</label>
            </div>

            <div class="template-attr-grid-header">
                <span>Atributo</span>
                <span>Incremento</span>
                <span>Custo</span>
            </div>

            <div class="template-attr-grid">
                ${this._renderAttributeFieldRows(attrs, costs)}
            </div>

            <div class="form-group" style="margin-top:10px;">
                <label>Custo Total</label>
                <input type="number" id="template-attr-total-cost" value="${entry.cost || 0}" readonly>
            </div>
        </div>
        `;

        new Dialog({
            title: "Editar Atributo",
            content,
            buttons: {
                save: {
                    label: "Salvar",
                    callback: async (dlgHtml) => {
                        entry.attributes = {
                            st: Number(dlgHtml.find("#attr-st").val()) || 0,
                            dx: Number(dlgHtml.find("#attr-dx").val()) || 0,
                            iq: Number(dlgHtml.find("#attr-iq").val()) || 0,
                            ht: Number(dlgHtml.find("#attr-ht").val()) || 0,
                            will: Number(dlgHtml.find("#attr-will").val()) || 0,
                            per: Number(dlgHtml.find("#attr-per").val()) || 0,
                            hp: Number(dlgHtml.find("#attr-hp").val()) || 0,
                            fp: Number(dlgHtml.find("#attr-fp").val()) || 0,
                            basic_speed: Number(dlgHtml.find("#attr-basic_speed").val()) || 0,
                            move: Number(dlgHtml.find("#attr-move").val()) || 0
                        };

                        entry.costs = {
                            st: Number(dlgHtml.find("#cost-st").val()) || 0,
                            dx: Number(dlgHtml.find("#cost-dx").val()) || 0,
                            iq: Number(dlgHtml.find("#cost-iq").val()) || 0,
                            ht: Number(dlgHtml.find("#cost-ht").val()) || 0,
                            will: Number(dlgHtml.find("#cost-will").val()) || 0,
                            per: Number(dlgHtml.find("#cost-per").val()) || 0,
                            hp: Number(dlgHtml.find("#cost-hp").val()) || 0,
                            fp: Number(dlgHtml.find("#cost-fp").val()) || 0,
                            basic_speed: Number(dlgHtml.find("#cost-basic_speed").val()) || 0,
                            move: Number(dlgHtml.find("#cost-move").val()) || 0
                        };

                        entry.linkSecondary = dlgHtml.find("#link-secondary").is(":checked");
                        entry.cost = this._calculateAttributeCost(entry.attributes, entry.costs);

                        await this._replaceEntry(blockId, entryId, entry);
                    }
                },
                cancel: { label: "Cancelar" }
            },
            default: "save",
            render: (dlgHtml) => {
                const recalc = () => {
                    const attributes = {
                        st: Number(dlgHtml.find("#attr-st").val()) || 0,
                        dx: Number(dlgHtml.find("#attr-dx").val()) || 0,
                        iq: Number(dlgHtml.find("#attr-iq").val()) || 0,
                        ht: Number(dlgHtml.find("#attr-ht").val()) || 0,
                        will: Number(dlgHtml.find("#attr-will").val()) || 0,
                        per: Number(dlgHtml.find("#attr-per").val()) || 0,
                        hp: Number(dlgHtml.find("#attr-hp").val()) || 0,
                        fp: Number(dlgHtml.find("#attr-fp").val()) || 0,
                        basic_speed: Number(dlgHtml.find("#attr-basic_speed").val()) || 0,
                        move: Number(dlgHtml.find("#attr-move").val()) || 0
                    };

                    const costs = {
                        st: Number(dlgHtml.find("#cost-st").val()) || 0,
                        dx: Number(dlgHtml.find("#cost-dx").val()) || 0,
                        iq: Number(dlgHtml.find("#cost-iq").val()) || 0,
                        ht: Number(dlgHtml.find("#cost-ht").val()) || 0,
                        will: Number(dlgHtml.find("#cost-will").val()) || 0,
                        per: Number(dlgHtml.find("#cost-per").val()) || 0,
                        hp: Number(dlgHtml.find("#cost-hp").val()) || 0,
                        fp: Number(dlgHtml.find("#cost-fp").val()) || 0,
                        basic_speed: Number(dlgHtml.find("#cost-basic_speed").val()) || 0,
                        move: Number(dlgHtml.find("#cost-move").val()) || 0
                    };

                    dlgHtml.find("#template-attr-total-cost").val(
                        this._calculateAttributeCost(attributes, costs)
                    );
                };

                dlgHtml.find(".template-attr-grid input[type='number']").on("input", recalc);
                recalc();
            }
        }).render(true);
    }

    async _editItemEntry(blockId, entryId, entry) {
        const isEquipment = entry.itemType === "equipment";
        const levelLabel = ["skill", "spell", "power"].includes(entry.itemType) ? "Nível" : "Nível/Valor";
        const content = `
        <div class="form-group">
            <label>Nome</label>
            <input type="text" id="entry-name" value="${entry.name || ""}">
        </div>
        <div class="form-grid-3">
            <div class="form-group">
                <label>Qtd</label>
                <input type="number" id="entry-qty" value="${entry.quantity ?? 1}" ${isEquipment ? "" : "disabled"}>
            </div>
            <div class="form-group">
                <label>${levelLabel}</label>
                <input type="text" id="entry-level" value="${entry.level ?? ""}">
            </div>
            <div class="form-group">
                <label>Custo</label>
                <input type="number" id="entry-cost" value="${entry.cost ?? 0}">
            </div>
        </div>
        `;

        new Dialog({
            title: "Editar Item do Bloco",
            content,
            buttons: {
                save: {
                    label: "Salvar",
                    callback: async (dlgHtml) => {
                        entry.name = dlgHtml.find("#entry-name").val();
                        entry.quantity = Number(dlgHtml.find("#entry-qty").val()) || 1;
                        entry.level = dlgHtml.find("#entry-level").val();
                        entry.cost = Number(dlgHtml.find("#entry-cost").val()) || 0;
                        await this._replaceEntry(blockId, entryId, entry);
                    }
                },
                cancel: { label: "Cancelar" }
            },
            default: "save"
        }).render(true);
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

        const data = TextEditor.getDragEventData(event);
        let item = null;

        if (data.uuid) item = await fromUuid(data.uuid);
        if (!item && data.type === "Item" && data.id) item = game.items.get(data.id);
        if (!item) return;

        if (!["skill", "spell", "power", "advantage", "disadvantage", "equipment"].includes(item.type)) {
            ui.notifications.warn("Esse tipo de item não pode ser usado em um Modelo.");
            return;
        }

        const entry = await this._buildEntryFromItem(item);
        if (!entry) return;

        await this._appendEntryToBlock(blockId, entry);
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
            cost: 0
        };

        if (item.type === "equipment") {
            return this._promptEquipmentEntry(item, base);
        }

        if (["skill", "spell", "power"].includes(item.type)) {
            return this._promptLevelledEntry(item, base);
        }

        if (["advantage", "disadvantage"].includes(item.type)) {
            return this._promptAdvantageEntry(item, base);
        }

        return base;
    }

    async _promptEquipmentEntry(item, base) {
        return new Promise(resolve => {
            new Dialog({
                title: `Adicionar ${item.name}`,
                content: `
                <div class="form-group">
                    <label>Quantidade</label>
                    <input type="number" id="entry-qty" value="1" min="1">
                </div>`,
                buttons: {
                    save: {
                        label: "Adicionar",
                        callback: (html) => {
                            base.quantity = Number(html.find("#entry-qty").val()) || 1;
                            base.cost = item.system?.cost ?? 0;
                            resolve(base);
                        }
                    },
                    cancel: {
                        label: "Cancelar",
                        callback: () => resolve(null)
                    }
                },
                default: "save"
            }).render(true);
        });
    }

    async _promptLevelledEntry(item, base) {
        return new Promise(resolve => {
            new Dialog({
                title: `Adicionar ${item.name}`,
                content: `
                <div class="form-group">
                    <label>Nível</label>
                    <input type="number" id="entry-level" value="${item.system?.skill_level ?? 0}">
                </div>`,
                buttons: {
                    save: {
                        label: "Adicionar",
                        callback: (html) => {
                            const level = Number(html.find("#entry-level").val()) || 0;
                            base.level = level;
                            base.cost = this._calculateLevelledItemCost(item, level);
                            resolve(base);
                        }
                    },
                    cancel: {
                        label: "Cancelar",
                        callback: () => resolve(null)
                    }
                },
                default: "save"
            }).render(true);
        });
    }

    async _promptAdvantageEntry(item, base) {
        const fixedCost = Number(item.system?.points) || 0;
        const currentLevel = item.system?.level ?? "";

        if (currentLevel === "" || currentLevel === null || currentLevel === undefined) {
            base.cost = fixedCost;
            return base;
        }

        return new Promise(resolve => {
            new Dialog({
                title: `Adicionar ${item.name}`,
                content: `
                <div class="form-group">
                    <label>Nível/Valor</label>
                    <input type="text" id="entry-level" value="${currentLevel}">
                </div>
                <div class="form-group">
                    <label>Custo</label>
                    <input type="number" id="entry-cost" value="${fixedCost}">
                </div>`,
                buttons: {
                    save: {
                        label: "Adicionar",
                        callback: (html) => {
                            base.level = html.find("#entry-level").val();
                            base.cost = Number(html.find("#entry-cost").val()) || fixedCost;
                            resolve(base);
                        }
                    },
                    cancel: {
                        label: "Cancelar",
                        callback: () => resolve(null)
                    }
                },
                default: "save"
            }).render(true);
        });
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
        if (normalized === "TecD") return Math.max(0, level * 2);

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