// systems/gum/module/apps/gurps-armor-sheet.js

// Importa a classe principal que vamos estender
import { GurpsItemSheet } from "./gurps-item-sheet.js";

/**
 * A Ficha de Item dedicada para Armaduras.
 * Estende a GurpsItemSheet para herdar a lógica comum (como a aba de Efeitos),
 * mas sobrescreve o getData() e _getSubmitData() para lidar com a RD.
 */
export class GurpsArmorSheet extends GurpsItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "armor-sheet", "theme-dark"],
            template: "systems/gum/templates/items/armor-sheet.hbs", // Nosso novo template
            width: 500,
            height: 600,
            tabs: [{ 
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "protection" // Começa na aba "Proteção"
            }]
        });
    }

    async getData(options) {
        // Pega todos os dados da GurpsItemSheet (abas de efeitos, etc.)
        const context = await super.getData(options);
        
        // --- Lógica Específica da Armadura ---
        context.formattedDrLocations = {};
        const drLocations = this.item.system.dr_locations || {};
        
        for (const [loc, drObject] of Object.entries(drLocations)) {
            // Chama a função de formatação (que também existe nesta classe)
            context.formattedDrLocations[loc] = this._formatDRObjectToString(drObject);
        }
        
        return context;
    }

    /**
     * @override
     * Esta função substitui a _updateObject da GurpsItemSheet
     * para impedir que ela converta nossa vírgula em ponto.
     * Ela usa os dados já processados pelo _getSubmitData.
     */
    async _updateObject(event, formData) {
        // 'formData' já contém nossos objetos de RD processados 
        // pelo _getSubmitData desta classe.
        
        // Simplesmente impede a lógica de vírgula da classe-mãe
        // e salva os dados corretos.
        return this.object.update(formData);
    }
    
/**
     * @override
     * Intercepta os dados ANTES de serem salvos.
     * Converte todas as strings de RD em objetos de RD.
     */
    _getSubmitData(updateData) {
        // Pega os dados do formulário (flat object, e.g., "system.dr_locations.torso": "5, 2 cont")
        const data = super._getSubmitData(updateData);
        
        // Itera sobre as chaves do objeto 'data'
        for (const key in data) {
            // Se a chave for uma de nossas RDs...
            if (key.startsWith("system.dr_locations.")) {
                // ...pega a string (ex: "5, 2 cont")...
                const drString = data[key];
                // ...e substitui no objeto 'data' pelo objeto processado.
                data[key] = this._parseDRStringToObject(drString);
            }
        }
        
        // Retorna o objeto 'data' agora modificado
        // (ex: "system.dr_locations.torso": { base: 5, cont: 2 })
        return data;
    }

    //
    // --- Funções Auxiliares de RD ---
    // (Estas são as mesmas funções que tentamos adicionar na GurpsItemSheet antes)
    //

    /**
     * Converte o objeto de RD (ex: {base: 5, cont: 2})
     * em uma string legível (ex: "5, 2 cont").
     */
    _formatDRObjectToString(drObject) {
        if (!drObject) return "0";
        if (typeof drObject !== 'object' || drObject === null) return drObject.toString();

        const parts = [];
        if (drObject.base) {
            parts.push(drObject.base.toString());
        }
        for (const [type, value] of Object.entries(drObject)) {
            if (type === 'base') continue;
            parts.push(`${value} ${type}`);
        }
        if (parts.length === 0) return "0";
        if (parts.length > 1 && parts[0] === "0") {
            parts.shift();
        }
        return parts.join(", ");
    }

/**
     * Converte a string de RD (ex: "5, 2 cont" ou "3 qmd")
     * em um objeto de modificador (ex: {base: 5, cont: -3} ou {qmd: 3}).
     */
    _parseDRStringToObject(drString) {
        if (typeof drString === 'object' && drString !== null) return drString;
        if (!drString || typeof drString !== 'string' || drString.trim() === "") return {}; // Retorna objeto VAZIO
        
        const drObject = {};
        const parts = drString.split(',').map(s => s.trim().toLowerCase());
        
        let baseDR = 0; // Armazena o 'base' temporariamente

        // 1. Primeira passada: Encontra o 'base'
        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 1 && !isNaN(Number(segments[0]))) {
                baseDR = Number(segments[0]);
                drObject['base'] = baseDR;
                break; // Encontrou a base, para
            }
        }

        // 2. Segunda passada: Calcula os modificadores
        for (const part of parts) {
            const segments = part.split(' ').map(s => s.trim()).filter(Boolean);
            if (segments.length === 2 && !isNaN(Number(segments[0]))) {
                const type = segments[1];
                const value = Number(segments[0]);
                
                // Se uma base foi definida (ex: "5, 2 cont"), salva a DIFERENÇA
                if (baseDR > 0) {
                    drObject[type] = value - baseDR; // Ex: 2 - 5 = -3
                } 
                // Se não há base (ex: "3 cont"), salva o valor como um bônus
                else {
                    drObject[type] = value; // Ex: { cont: 3 }
                }
            }
        }
        
        // Remove a linha "base: 0" que estava causando o bug
        return drObject;
    }
}