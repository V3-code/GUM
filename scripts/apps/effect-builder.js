// GUM/scripts/apps/effect-builder.js

import { EffectBrowser } from "../../module/apps/effect-browser.js";

/**
 * [VERSÃO REATORADA]
 * Esta classe abre o EffectBrowser para permitir que o usuário selecione
 * Itens Efeito para vincular a um item pai (ex: uma Condição).
 * Ela salva os UUIDs dos itens selecionados, em vez de dados brutos.
 */
export class EffectBuilder {
    /**
     * @param {Item} item O Item (ex: Condição) que conterá os links para os efeitos.
     */
    constructor(item) {
        this.parentItem = item;
    }

    /**
     * O método principal que inicia o processo.
     */
    render() {
        // Abre o EffectBrowser que você já possui.
        // A chave é a função 'onSelect' que passamos como callback.
        new EffectBrowser(this.parentItem, {
            onSelect: (selectedEffects) => {
                // Quando o usuário selecionar efeitos, esta função será chamada.
                this._onEffectsSelected(selectedEffects);
            }
        }).render(true);
    }

    /**
     * Manipula os efeitos selecionados no browser.
     * @param {Array<Item>} selectedEffects - Os Itens Efeito completos que foram selecionados.
     * @private
     */
    async _onEffectsSelected(selectedEffects) {
        if (!selectedEffects || selectedEffects.length === 0) return;

        // Pega a lista de links de efeito que já existem na Condição.
        const existingEffectLinks = foundry.utils.deepClone(this.parentItem.system.effects || []);

        // Para cada Item Efeito selecionado, criamos um objeto de "link" com seu UUID.
        for (const effectItem of selectedEffects) {
            const effectLink = {
                uuid: effectItem.uuid
            };
            existingEffectLinks.push(effectLink);
        }

        // Atualiza o Item Condição com a nova lista de links de efeito.
        await this.parentItem.update({ "system.effects": existingEffectLinks });
        
        // Força a ficha da Condição a se redesenhar para mostrar os novos efeitos.
        this.parentItem.sheet.render(true);
    }
}