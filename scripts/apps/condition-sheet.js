// GUM/scripts/apps/condition-sheet.js

import { EffectBuilder } from "./effect-builder.js";
import { TriggerBrowser } from "../../module/apps/trigger-browser.js";
// NOTA: O import do ConditionBuilder não é mais necessário aqui, mas pode ser mantido se você o usa em outro lugar.

export class ConditionSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "condition-sheet", "theme-dark"],
            width: 500, // Aumentei um pouco a largura para acomodar os resumos
            height: "auto",
            resizable: true,
            template: "systems/gum/templates/items/condition-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "efeitos" // Mudei a aba inicial para 'efeitos' para ser mais direto
            }]
        });
    }

    /**
     * ✅ [VERSÃO 2.0] Prepara os dados para a ficha.
     * Agora carrega os dados completos dos efeitos linkados por UUID.
     */
    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description, { async: true });
        
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
                        type: effectItem.system.type,
                        chat_description: effectItem.system.chat_description,
                        summary: this._getEffectSummary(effectItem), // Gera o resumo
                        index: index, // O índice original para a função de deletar
                        uuid: link.uuid // O UUID para a função de visualizar
                    });
                } else {
                    // Adiciona um placeholder se o link estiver quebrado
                    preparedEffects.push({ name: "Link Quebrado", img: "icons/svg/hazard.svg", summary: "UUID não encontrado", index: index, uuid: link.uuid });
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

            html.find('.view-effect').on('click', async (ev) => {
            ev.preventDefault();
            // Pega o UUID que armazenamos no elemento HTML
            const effectUuid = $(ev.currentTarget).closest('.effect-tag').data('effect-uuid');
            if (effectUuid) {
                const effectItem = await fromUuid(effectUuid);
                if (effectItem) {
                    // Renderiza a ficha do item original
                    effectItem.sheet.render(true);
                }
            }
        });

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
            effects.splice(effectIndex, 1);
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
        
        // Editor de Descrição
        html.find('.edit-text-btn').on('click', this._onEditText.bind(this));
    }

    // Função auxiliar para editar texto (mantida)
    _onEditText(event) {
        const fieldName = $(event.currentTarget).data('target');
        const title = $(event.currentTarget).attr('title');
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
        }).render(true);
    }
}