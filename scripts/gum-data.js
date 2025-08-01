// scripts/gum-data.js

export const GUM_DATA = {
    /**
     * Um dicionário que mapeia caminhos de dados do sistema para nomes amigáveis.
     * Isso alimenta os menus dropdown na ficha de condição para torná-la user-friendly.
     * A chave é o caminho do atributo que será usado na fórmula (ex: @attributes.st.value).
     * O valor é o texto que o Mestre verá no menu.
     */
    attributes: {
        // Atributos Primários (Mod. Temp.)
        "attributes.st.temp": "ST (Mod. Temp.)",
        "attributes.dx.temp": "DX (Mod. Temp.)",
        "attributes.iq.temp": "IQ (Mod. Temp.)",
        "attributes.ht.temp": "HT (Mod. Temp.)",
        "attributes.vont.temp": "Vontade (Mod. Temp.)",
        "attributes.per.temp": "Percepção (Mod. Temp.)",
        
        // Atributos Secundários (Mod. Temp.)
        "attributes.hp.temp": "PV Máximos (Mod. Temp.)",
        "attributes.fp.temp": "PF Máximos (Mod. Temp.)",
        "attributes.lifting_st.temp": "ST de Carga (Mod. Temp.)",
        "attributes.mt.temp": "MT (Mod. Temp.)",
        "attributes.basic_speed.temp": "Velocidade Básica (Mod. Temp.)",
        "attributes.basic_move.temp": "Deslocamento Básico (Mod. Temp.)",
        
        // Atributos Calculados (Modificadores Diretos)
        "attributes.final_dodge": "Esquiva Final",
        "attributes.final_move": "Deslocamento Final",

        // ✅ NOVOS: Modificadores de RD por Local
        "combat.dr_mods.head": "RD - Crânio (Mod.)",
        "combat.dr_mods.face": "RD - Rosto (Mod.)",
        "combat.dr_mods.neck": "RD - Pescoço (Mod.)",
        "combat.dr_mods.torso": "RD - Torso (Mod.)",
        "combat.dr_mods.vitals": "RD - Órgãos Vitais (Mod.)",
        "combat.dr_mods.groin": "RD - Virilha (Mod.)",
        "combat.dr_mods.arms": "RD - Braços (Mod.)",
        "combat.dr_mods.hands": "RD - Mãos (Mod.)",
        "combat.dr_mods.legs": "RD - Pernas (Mod.)",
        "combat.dr_mods.feet": "RD - Pés (Mod.)",
        "combat.dr_mods.eyes": "RD - Olhos (Mod.)",
        
        // Valores Calculados Finais (da sua função _prepareCharacterItems)
        "attributes.st.final": "ST Final",
        "attributes.dx.final": "DX Final",
        "attributes.iq.final": "IQ Final",
        "attributes.ht.final": "HT Final",
        "attributes.vont.final": "Vontade Final",
        "attributes.per.final": "Percepção Final",
        "attributes.final_dodge": "Esquiva Final",
        "attributes.final_move": "Deslocamento Final",
        "encumbrance.level_value": "Nível de Carga (0-4)",
        "encumbrance.penalty": "Penalidade de Carga (0 a -4)"
    },

    /**
     * Os operadores de comparação que o Mestre poderá escolher.
     */
    operators: {
        "==": "Igual a",
        "!=": "Diferente de",
        "<": "Menor que",
        "<=": "Menor ou Igual a",
        ">": "Maior que",
        ">=": "Maior ou Igual a"
    }
};