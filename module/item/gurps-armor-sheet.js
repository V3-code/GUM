// systems/gum/module/apps/gurps-armor-sheet.js

import { GurpsItemSheet } from "./gurps-item-sheet.js";
import { listBodyLocations } from "../config/body-profiles.js";
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;

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
        const drLocations = this.item.system.dr_locations || {};
        const bodyLocationOptions = listBodyLocations();
        const locationLookup = new Map(bodyLocationOptions.map(option => [option.id, option]));

        context.bodyLocationOptions = bodyLocationOptions;
        context.drLocationRows = Object.entries(drLocations)
            .filter(([, drObject]) => this._hasVisibleDR(drObject))
            .map(([key, drObject]) => {
                const option = locationLookup.get(key);
                return {
                    key,
                    label: option?.name ?? key,
                    dr: this._formatDRObjectToString(drObject)
                };
            });
        
        // Prepara a descrição para o editor
        context.system.description = await TextEditorImpl.enrichHTML(this.item.system.description || "", {
            secrets: this.item.isOwner,
            async: true
        });

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

        for (const key in data) {
            if (key.startsWith("system.dr_locations.")) {
                delete data[key];
            }
        }

        data["system.dr_locations"] = this._collectDRLocationsFromForm();

        return data;
    }

    //
    // --- Funções Auxiliares de RD ---
    // (Estas são as mesmas funções que tentamos adicionar na GurpsItemSheet antes)
    //

/**
     * Converte o objeto de RD (ex: {base: 5, cont: -4})
     * em uma string GURPS legível (ex: "5, 1 cont").
     */
    _formatDRObjectToString(drObject) {
        if (!drObject || typeof drObject !== 'object' || Object.keys(drObject).length === 0) return "0";
        
        const parts = [];
        const baseDR = drObject.base || 0;
        parts.push(baseDR.toString()); // Sempre começa com o valor base

        for (const [type, mod] of Object.entries(drObject)) {
            if (type === 'base') continue; // Já cuidamos da base

            // ✅ CORREÇÃO: CALCULA O VALOR FINAL GURPS (Base + Modificador)
            const finalDR = Math.max(0, baseDR + (mod || 0));
            
            // Só mostra se for diferente da base
            if (finalDR !== baseDR) {
                parts.push(`${finalDR} ${type}`); // Mostra o VALOR FINAL (ex: 1)
            }
        }
        
        if (parts.length === 1 && parts[0] === "0") return "0"; 
        
        // Se a base for 0 e houver outros (ex: "3 cont"), remove o "0, "
        if (parts.length > 1 && parts[0] === "0") {
             parts.shift(); 
        }
        
        return parts.join(", ");
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
                // Converte o tipo de EN para PT-BR, se necessário
                type = DAMAGE_TYPE_MAP[type] || type;

                if (baseDR > 0) {
                    drObject[type] = value - baseDR; // Ex: 2 - 5 = -3
                } 
                else {
                    drObject[type] = value; // Ex: { cont: 3 }
                }
            }
        }
        
        return drObject;
    }

    _hasVisibleDR(drObject) {
        if (!drObject || typeof drObject !== "object") return false;
        return Object.values(drObject).some(value => Number(value) !== 0);
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

            const drString = valueInput?.value?.trim();
            if (!drString) return;

            drLocations[resolvedKey] = this._parseDRStringToObject(drString);
        });

        return drLocations;
    }

    /**
     * @override
     * Ativa os listeners da ficha.
     * Esta função herda os listeners da GurpsItemSheet (efeitos, modificadores)
     * e os listeners de descrição que acabamos de adicionar lá.
     */
    activateListeners(html) {
        // Chama a função activateListeners da "mãe" (GurpsItemSheet),
        // que agora contém:
        // 1. Listeners da aba de Efeitos
        // 2. Listeners da aba de Modificadores
        // 3. Listeners dos botões "Editar/Salvar/Cancelar" da Descrição
super.activateListeners(html);

        // Se você precisar de listeners *específicos* apenas para a
        // aba "Proteção" da armadura, eles iriam aqui.
        if (!this.isEditable) return;

        html.on("click", ".add-dr-location", () => {
            this._addDrLocationRow(html);
        });

        html.on("click", ".dr-location-delete", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.currentTarget.closest("[data-dr-location-row]")?.remove();
            await this.object.update({
                "system.dr_locations": this._collectDRLocationsFromForm()
            });
        });

        html.on("change", ".dr-location-label", (ev) => {
            this._syncDrLocationKey(ev.currentTarget);
        });
    }

    _addDrLocationRow(html, { label = "", key = "", dr = "" } = {}) {
        const container = html.find(".dr-locations-table");
        if (!container.length) return;

        const rowHtml = `
            <li class="attack-item dr-location-item" data-dr-location-row>
                <div class="attack-display-card">
                    <div class="attack-line">
                        <div class="attack-cell">
                            <input class="dr-location-label" type="text" list="gum-body-location-options" value="${label}" placeholder="Ex: Braço E"/>
                            <input class="dr-location-key" type="hidden" value="${key}"/>
                        </div>
                        <div class="attack-cell">
                            <input class="dr-location-value" type="text" value="${dr}" placeholder="0"/>
                        </div>
                        <div class="attack-cell">
                            <button class="dr-location-delete" type="button" title="Remover"><i class="fas fa-trash"></i></button>
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
            return;
        }

        keyInput.value = this._getLocationKeyFromLabel(label);
    }

    _getLocationKeyFromLabel(label) {
        const list = this.element?.[0]?.querySelector("#gum-body-location-options");
        if (!list) return label;

        const escape = window.CSS?.escape || ((value) => value.replace(/["\\]/g, "\\$&"));
        const option = list.querySelector(`option[value="${escape(label)}"]`);
        return option?.dataset?.key || label;
    }
}