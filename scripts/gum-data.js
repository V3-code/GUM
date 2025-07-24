// scripts/gum-data.js

export const GUM_DATA = {
    /**
     * Um dicionário que mapeia caminhos de dados do sistema para nomes amigáveis.
     * Isso alimenta os menus dropdown na ficha de condição para torná-la user-friendly.
     * A chave é o caminho do atributo que será usado na fórmula (ex: @attributes.st.value).
     * O valor é o texto que o Mestre verá no menu.
     */
    attributes: {
        // Atributos Primários (Base)
        "attributes.st.value": "ST (Base)",
        "attributes.dx.value": "DX (Base)",
        "attributes.iq.value": "IQ (Base)",
        "attributes.ht.value": "HT (Base)",
        "attributes.vont.value": "Vontade (Base)",
        "attributes.per.value": "Percepção (Base)",
        
        // Atributos Primários (Modificadores Temporários)
        "attributes.st.temp": "ST (Mod. Temp.)",
        "attributes.dx.temp": "DX (Mod. Temp.)",
        "attributes.iq.temp": "IQ (Mod. Temp.)",
        "attributes.ht.temp": "HT (Mod. Temp.)",
        "attributes.vont.temp": "Vontade (Mod. Temp.)",
        "attributes.per.temp": "Percepção (Mod. Temp.)",
        
        // Atributos Secundários
        ".attributes.hp.value": "HP (Atuais)",
        "attributes.hp.max": "HP (Máximos)",
        "attributes.fp.value": "FP (Atuais)",
        "attributes.fp.max": "FP (Máximos)",
        "attributes.basic_speed.value": "Velocidade Básica",
        "attributes.basic_move.value": "Deslocamento Básico",
        
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