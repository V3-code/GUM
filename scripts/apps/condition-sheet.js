// GUM/scripts/apps/condition-sheet.js

import { EffectBuilder } from "./effect-builder.js";
import { TriggerBrowser } from "../../module/apps/trigger-browser.js";

const { ItemSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;

export class ConditionSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "condition-sheet", "theme-dark"],
            width: 500,
            height: 600,
            resizable: true,
            template: "systems/gum/templates/items/condition-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "description"
            }],
            scrollY: [".sheet-body-content"]
        });
    }

    /**
     * ✅ [VERSÃO 2.0] Prepara os dados para a ficha.
     * Agora carrega os dados completos dos efeitos linkados por UUID.
     */
   async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        context.enrichedDescription = await TextEditorImpl.enrichHTML(this.item.system.description, { async: true });
        context.enrichedChatDescription = await TextEditorImpl.enrichHTML(this.item.system.chat_description || "", { async: true });
        context.owner = this.item.isOwner;
        context.editable = this.options.editable;
        
        const effectLinks = this.item.system.effects || [];
        const preparedEffects = [];

        // Para cada link na lista de efeitos, carregamos o item completo.
        for (const [index, link] of effectLinks.entries()) {
            if (link.uuid) {
                const effectItem = await fromUuid(link.uuid);
                if (effectItem) {
                    preparedEffects.push({
                        name: effectItem.name,
                        img: effectItem.img,
                        type: effectItem.system.type || "indefinido",
                        chat_description: effectItem.system.chat_description,
                        summary: this._getEffectSummary(effectItem), // Gera o resumo␊
                        index: index, // O índice original para a função de deletar␊
                        uuid: link.uuid // O UUID para a função de visualizar␊
                    });
                } else {
                    // Adiciona um placeholder se o link estiver quebrado␊
                    preparedEffects.push({ name: "Link Quebrado", img: "icons/svg/hazard.svg", summary: "UUID não encontrado", index: index, uuid: link.uuid, type: "desconhecido" });
                }
            }
        }
        
        context.preparedEffects = preparedEffects;
        return context;
    }

    /**
     * ✅ [NOVO] Gera um resumo textual para um Item Efeito.
     */
    _getEffectSummary(effectItem) {
        const sys = effectItem.system;
        switch (sys.type) {
            case 'attribute': return `Modificador: ${sys.path || ''} ${sys.operation || ''} ${sys.value || ''}`;
            case 'resource_change': return `Recurso: ${sys.category} (${sys.value || '0'})`;
            case 'status':
                const status = CONFIG.statusEffects.find(s => s.id === sys.statusId);
                return `Status: ${status ? status.name : sys.statusId}`;
            case 'chat': return `Mensagem no Chat`;
            case 'macro': return `Executa Macro: ${sys.value}`;
            case 'flag': return `Define Flag: ${sys.key}`;
            default: return "Efeito desconhecido";
        }
    }

    /**
     * ✅ [VERSÃO 2.0] Listeners limpos e aprimorados.
     */
    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;

        // --- ABA DE EFEITOS ---

        // Adicionar um novo efeito (linkado)
         html.find('.add-effect').on('click', (ev) => {
            ev.preventDefault();
            new EffectBuilder(this.item).render();
        });

        // Deletar um link de efeito
        html.find('.delete-effect').on('click', (ev) => {
            ev.preventDefault();
            const effectIndex = $(ev.currentTarget).closest('.effect-entry').data('effectIndex');
            const effects = foundry.utils.deepClone(this.item.system.effects || []);
            if (Number.isInteger(effectIndex)) {
                effects.splice(effectIndex, 1);
            }
            this.item.update({ "system.effects": effects });
        });
        
        // Visualizar a ficha do Item Efeito original
        html.find('.view-effect').on('click', async (ev) => {
            ev.preventDefault();
            const effectUuid = $(ev.currentTarget).closest('.effect-entry').data('effectUuid');
            const effectItem = await fromUuid(effectUuid);
            if (effectItem) {
                effectItem.sheet.render(true);
            }
        });

        // --- ABA DE ATIVAÇÃO ---

        // Assistente de Gatilho 'when'
        html.find('.saved-triggers-btn').on('click', (ev) => {
            const textarea = this.element.find('textarea[name="system.when"]')[0];
            new TriggerBrowser(textarea).render(true);
        });

               // --- ABA DE DETALHES ---
        
        html.find('.toggle-editor').on('click', this._toggleEditor.bind(this));
        html.find('.save-description').on('click', this._saveDescription.bind(this));
        html.find('.cancel-description').on('click', this._cancelDescription.bind(this));
    }

    _toggleEditor(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        container.find('.description-view').toggle();
        container.find('.description-editor').toggle();
        if (field) {
            const editor = container.find(`.editor[data-edit="${field}"]`);
            if (editor.length) editor.trigger('focus');
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
}