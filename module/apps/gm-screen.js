import { GMModifierBrowser } from "./gm-modifier-browser.js";

export class GumGMScreen extends Application {
    
    constructor(options = {}) {
        super(options);
        // Mapa central de seleção (UUID -> Objeto)
        this.selectedModifiers = new Map();
        
        // Cache para os inputs manuais não resetarem ao renderizar
        this.manualCache = { name: "Manual", value: 0 };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "gum-gm-screen",
            title: "Escudo do Mestre (GUM)",
            template: "systems/gum/templates/apps/gm-screen.hbs",
            width: 1200, 
            height: 750,
            resizable: true,
            classes: ["gum", "gm-screen"],
            tabs: [{ navSelector: ".screen-tabs", contentSelector: ".screen-body", initial: "modifiers" }],
            dragDrop: [{ dragSelector: ".palette-mod", dropSelector: ".group-content-area" }]
        });
    }

    async getData() {
        // 1. MONITOR (Esquerda)
        const actors = game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
        const monitorData = actors.map(actor => {
            const attr = actor.system.attributes;
            return {
                id: actor.id,
                name: actor.name,
                img: actor.img,
                hp: { value: attr.hp.value, max: attr.hp.max, percent: Math.min(100, (attr.hp.value / attr.hp.max) * 100) },
                fp: { value: attr.fp.value, max: attr.fp.max, percent: Math.min(100, (attr.fp.value / attr.fp.max) * 100) },
                defenses: {
                    dodge: attr.dodge.final,
                    parry: this._getBestDefense(actor, 'parry'),
                    block: this._getBestDefense(actor, 'block')
                },
                activeGMMods: actor.getFlag("gum", "gm_modifiers") || []
            };
        });
        monitorData.sort((a, b) => a.name.localeCompare(b.name));

        // 2. DASHBOARD (Direita)
        const config = game.settings.get("gum", "gmScreenConfig");
        
        // Verifica se o modo manual está ativo no MAP
        const isManualActive = this.selectedModifiers.has("manual");

        // Enriquece os itens e marca visualmente se estão selecionados
        for (const col of config.columns) {
            for (const group of col.groups) {
                group.enrichedItems = [];
                for (const itemUuid of group.items) {
                    try {
                        const item = await fromUuid(itemUuid);
                        if (item) {
                            const itemData = item.toObject();
                            itemData.uuid = itemUuid;
                            // O HBS vai ler isso para adicionar a classe .active
                            itemData.isSelected = this.selectedModifiers.has(itemUuid);
                            group.enrichedItems.push(itemData);
                        }
                    } catch (e) {}
                }
            }
        }

        return {
            actors: monitorData,
            columns: config.columns,
            // Passa os estados para o template
            isManualActive: isManualActive,
            manualCache: this.manualCache
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // --- MODIFICADOR MANUAL ---

        // Atualiza o cache quando digita (para não perder ao renderizar)
        html.find('.manual-name').on('input', ev => this.manualCache.name = ev.target.value);
        html.find('.manual-value').on('input', ev => this.manualCache.value = parseInt(ev.target.value) || 0);

        // Botão ATIVAR Manual
        html.find('.activate-manual-btn').click(ev => {
            ev.preventDefault();
            
            if (this.selectedModifiers.has("manual")) {
                // Desativar
                this.selectedModifiers.delete("manual");
            } else {
                // Ativar (Limpa a paleta primeiro para evitar confusão)
                this.selectedModifiers.clear();
                this.selectedModifiers.set("manual", { 
                    name: this.manualCache.name, 
                    value: this.manualCache.value 
                });
            }
            this.render(false); // Redesenha para atualizar as classes CSS
        });

        // --- MODIFICADOR DA PALETA ---

        html.find('.palette-mod').click(ev => {
            ev.preventDefault();
            if ($(ev.target).closest('.mod-hover-controls').length) return;

            const btn = $(ev.currentTarget);
            const modUuid = btn.data('uuid');
            const modValue = btn.data('value');
            const modName = btn.find('.mod-name').text().trim();

            // Se clicar na paleta, remove o Manual automaticamente
            this.selectedModifiers.delete("manual");

            if (this.selectedModifiers.has(modUuid)) {
                this.selectedModifiers.delete(modUuid);
            } else {
                this.selectedModifiers.set(modUuid, { name: modName, value: modValue });
            }
            this.render(false); // Redesenha para manter o visual syncado
        });


        // --- APLICAÇÃO (Clique no Personagem) ---
        
        html.find('.monitor-card').click(async ev => {
            if ($(ev.target).closest('.remove-mod, .actor-identity').length) return;
            
            // Se nada selecionado, não faz nada
            if (this.selectedModifiers.size === 0) return;

            const card = $(ev.currentTarget);
            const actorId = card.data('actor-id');
            const actor = game.actors.get(actorId);

            if (actor) {
                // Atualiza dados do manual caso tenham mudado sem re-render
                if (this.selectedModifiers.has("manual")) {
                    this.selectedModifiers.set("manual", { 
                        name: this.manualCache.name, 
                        value: this.manualCache.value 
                    });
                }

                await this._applyModifiersToActor(actor);
                
                // Feedback visual
                card.addClass('flash-success');
                setTimeout(() => card.removeClass('flash-success'), 500);
            }
        });

        // Remover Modificador
        html.find('.remove-mod').click(async ev => {
            ev.stopPropagation();
            const tag = $(ev.currentTarget).closest('.active-mod-tag');
            const index = tag.data('index');
            const actor = game.actors.get(tag.closest('.monitor-card').data('actor-id'));

            if (actor) {
                const mods = actor.getFlag("gum", "gm_modifiers") || [];
                mods.splice(index, 1);
                await actor.setFlag("gum", "gm_modifiers", mods);
                this.render(false);
            }
        });

        // --- GESTÃO DE GRUPOS (Mantido igual) ---
        html.find('.mod-quick-view').click(async ev => {
            ev.stopPropagation(); ev.preventDefault();
            const uuid = $(ev.currentTarget).closest('.palette-mod').data('uuid');
            const item = await fromUuid(uuid);
            if (item) this._showQuickView(item);
        });
        
        html.find('.add-group-btn').click(async ev => {
            const colId = $(ev.currentTarget).data('col');
            new Dialog({
                title: "Novo Grupo", content: `<div class="form-group"><label>Nome:</label><input type="text" id="group-name" autofocus/></div>`,
                buttons: { create: { label: "Criar", callback: async (html) => { const name = html.find('#group-name').val(); if(name) await this._addGroup(colId, name); } } }, default: "create"
            }).render(true);
        });
        html.find('.delete-group-btn').click(async ev => {
            const groupId = $(ev.currentTarget).data('group-id');
            const colId = $(ev.currentTarget).closest('.modular-column').data('col-id');
            Dialog.confirm({ title: "Excluir Grupo", content: "<p>Tem certeza?</p>", yes: () => this._removeGroup(colId, groupId) });
        });
        html.find('.add-mod-to-group-btn').click(ev => {
            const groupId = $(ev.currentTarget).data('group-id');
            const colId = $(ev.currentTarget).closest('.modular-column').data('col-id');
            new GMModifierBrowser({ onSelect: async (items) => { await this._addItemsToGroup(colId, groupId, items); } }).render(true);
        });
        html.find('.delete-mod-btn').click(async ev => {
            ev.stopPropagation();
            const uuid = $(ev.currentTarget).closest('.palette-mod').data('uuid');
            const groupId = $(ev.currentTarget).closest('.modifier-group').data('group-id');
            const colId = $(ev.currentTarget).closest('.modular-column').data('col-id');
            await this._removeItemFromGroup(colId, groupId, uuid);
        });
    }

    // --- LÓGICA DE APLICAÇÃO ---
    async _applyModifiersToActor(actor) {
        const currentMods = actor.getFlag("gum", "gm_modifiers") || [];
        let count = 0;

        this.selectedModifiers.forEach(mod => {
            currentMods.push({
                name: mod.name,
                value: mod.value,
                id: foundry.utils.randomID(),
                source: "GM Screen"
            });
            count++;
        });

        await actor.setFlag("gum", "gm_modifiers", currentMods);
        ui.notifications.info(`Aplicado(s) ${count} modificador(es) em ${actor.name}.`);
        
        // NÃO limpamos this.selectedModifiers aqui para permitir aplicação múltipla contínua!
    }
    
        async _showQuickView(item) {
        const s = item.system;
        const createTag = (label, value) => {
             if (value !== null && value !== undefined && value !== "") 
                return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
             return '';
        };
        let tagsHtml = '';
        const modSign = s.modifier > 0 ? '+' : '';
        tagsHtml += createTag('Valor', `${modSign}${s.modifier}`);
        const catLabels = { location: "Localização", maneuver: "Manobra", situation: "Situação", attack_opt: "Opção Atq.", defense_opt: "Opção Def.", posture: "Postura", range: "Distância", time: "Tempo", effort: "Esforço", lighting: "Iluminação", cover: "Cobertura", difficulty: "Dificuldade" };
        tagsHtml += createTag('Categoria', catLabels[s.ui_category] || "Outros");
        if (s.nh_cap) tagsHtml += createTag('Teto (Cap)', s.nh_cap);
        if (s.duration) tagsHtml += createTag('Duração', s.duration);
        const description = await TextEditor.enrichHTML(s.description || "<i>Sem descrição.</i>", { async: true });
        const content = `
            <div class="gurps-dialog-canvas">
                <div class="gurps-item-preview-card" style="border:none; box-shadow:none;">
                    <header class="preview-header">
                        <h3>${item.name}</h3>
                        <div class="header-controls"><span class="preview-item-type">Modificador</span><a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a></div>
                    </header>
                    <div class="preview-content">
                        <div class="preview-properties">${tagsHtml}</div>
                        <hr class="preview-divider">
                        <div class="preview-description">${description}</div>
                    </div>
                </div>
            </div>`;
        new Dialog({
            title: `Detalhes: ${item.name}`, content: content, buttons: { close: { icon: '<i class="fas fa-times"></i>', label: "Fechar" } }, default: "close", options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 400, height: "auto" },
            render: (dlgHtml) => {
                dlgHtml.on('click', '.send-to-chat', (e) => {
                    e.preventDefault();
                    let cardHTML = $(e.currentTarget).closest('.gurps-item-preview-card').html();
                    cardHTML = cardHTML.replace(/<div class="header-controls">.*?<\/div>/s, `<span class="preview-item-type" style="float:right;">Modificador</span>`);
                    ChatMessage.create({ content: `<div class="gurps-item-preview-card chat-card">${cardHTML}</div>`, user: game.user.id, speaker: { alias: "Escudo do Mestre" } });
                    ui.notifications.info("Regra enviada para o chat.");
                });
            }
        }).render(true);
    }
    
    // Métodos de Persistência
    async _saveConfig(newConfig) { await game.settings.set("gum", "gmScreenConfig", newConfig); this.render(false); }
    async _addGroup(colId, name) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        if (col) { col.groups.push({ id: foundry.utils.randomID(), name: name, items: [] }); await this._saveConfig(config); }
    }
    async _removeGroup(colId, groupId) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        if (col) { col.groups = col.groups.filter(g => g.id !== groupId); await this._saveConfig(config); }
    }
    async _addItemsToGroup(colId, groupId, items) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        const group = col?.groups.find(g => g.id === groupId);
        if (group) { items.forEach(item => { if (!group.items.includes(item.uuid)) group.items.push(item.uuid); }); await this._saveConfig(config); }
    }
    async _removeItemFromGroup(colId, groupId, itemUuid) { 
        const config = game.settings.get("gum", "gmScreenConfig");
        const col = config.columns.find(c => c.id === colId);
        const group = col?.groups.find(g => g.id === groupId);
        if (group) { group.items = group.items.filter(u => u !== itemUuid); await this._saveConfig(config); }
    }
    async _onDrop(event) { 
        const data = TextEditor.getDragEventData(event);
        if (data.type !== "Item") return;
        const dropTarget = event.target.closest(".group-content-area");
        if (!dropTarget) return;
        const groupId = $(dropTarget).closest('.modifier-group').data('group-id');
        const colId = $(dropTarget).closest('.modular-column').data('col-id');
        const item = await fromUuid(data.uuid);
        if (!item || item.type !== "gm_modifier") return ui.notifications.warn("Apenas Modificadores.");
        await this._addItemsToGroup(colId, groupId, [item]);
    }
    _getBestDefense(actor, type) { 
        let best = 0;
        actor.items.filter(i => i.system.equipped).forEach(i => {
            if (i.system.melee_attacks) { Object.values(i.system.melee_attacks).forEach(atk => { const val = type === 'parry' ? atk.final_parry : atk.final_block; if (Number(val) > best) best = Number(val); }); }
        });
        return best || "-"; 
    }
}