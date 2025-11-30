// systems/gum/module/gum-defaults.js

export const GUM_DEFAULTS = {
    
    // 1. MODIFICADORES NATIVOS (REGRAS DO SISTEMA)
    modifiers: {
        // --- LOCALIZAÇÃO DE ACERTO ---
        "loc_torso": { id: "loc_torso", label: "Torso", value: 0, type: "system", desc: "Sem penalidade. Local padrão." },
        "loc_vitals": { id: "loc_vitals", label: "Órg. Vitais", value: -3, type: "system", desc: "Coração/Pulmões. Aumenta dano de Perfuração (x3)." },
        "loc_skull": { id: "loc_skull", label: "Crânio", value: -7, type: "system", desc: "Dano x4. Alvo tem RD 2 extra natural." },
        "loc_face": { id: "loc_face", label: "Rosto", value: -5, type: "system", desc: "Sem RD natural. Crítico automático em Nocaute." },
        "loc_neck": { id: "loc_neck", label: "Pescoço", value: -5, type: "system", desc: "Aumenta dano de Corte e Esmagamento (x1.5)." },
        "loc_leg": { id: "loc_leg", label: "Perna", value: -2, type: "system", desc: "Pode derrubar ou aleijar o alvo." },
        "loc_arm": { id: "loc_arm", label: "Braço", value: -2, type: "system", desc: "Pode derrubar arma ou aleijar o braço." },
        "loc_hand": { id: "loc_hand", label: "Mão", value: -4, type: "system", desc: "Pode derrubar arma (-4 na defesa para manter)." },
        "loc_foot": { id: "loc_foot", label: "Pé", value: -4, type: "system", desc: "Pode derrubar ou aleijar." },
        "loc_eye": { id: "loc_eye", label: "Olho", value: -9, type: "system", desc: "Dano x4. Cegueira potencial." },

        // --- MANOBRAS ---
        "man_all_out": { id: "man_all_out", label: "Atq. Total (+4)", value: 4, type: "system", desc: "Bônus +4 no ataque. Sem defesas ativas neste turno." },
        "man_move_attack": { id: "man_move_attack", label: "Mover e Atacar", value: 0, type: "system", desc: "Move total. Ataque com -4 ou NH máx 9. Sem aparar." },
        "man_defensive": { id: "man_defensive", label: "Atq. Defensivo", value: -4, type: "system", desc: "Penalidade -4 no ataque. +1 em uma Defesa Ativa." },
        "man_deceptive_1": { id: "man_deceptive_1", label: "Enganoso (-2)", value: -2, type: "system", desc: "-2 no seu ataque. -1 na defesa do inimigo." },
        "man_deceptive_2": { id: "man_deceptive_2", label: "Enganoso (-4)", value: -4, type: "system", desc: "-4 no seu ataque. -2 na defesa do inimigo." },
        "man_rapid": { id: "man_rapid", label: "Ataque Rápido", value: -6, type: "system", desc: "Dois ataques contra o mesmo alvo (ou alvos próximos). -6 em cada." },
        
        // --- OPÇÕES GERAIS (Para testes de Atributo) ---
        "opt_extra_effort": { id: "opt_extra_effort", label: "Esforço Extra (-1 PF)", value: 0, type: "system", desc: "Gasta 1 PF para ganhar bônus no teste (regra opcional)." },
        "opt_time_1": { id: "opt_time_1", label: "Tempo: Dobro (+1)", value: 1, type: "system", desc: "Gastou o dobro do tempo necessário." },
        "opt_time_2": { id: "opt_time_2", label: "Tempo: x4 (+2)", value: 2, type: "system", desc: "Gastou 4x o tempo necessário." },

        // --- SITUAÇÃO (CHOQUE) ---
        "sit_shock_1": { id: "sit_shock_1", label: "Choque -1", value: -1, type: "system", desc: "Penalidade por dano leve recebido no turno anterior." },
        "sit_shock_2": { id: "sit_shock_2", label: "Choque -2", value: -2, type: "system", desc: "Penalidade por dano moderado recebido no turno anterior." },
        "sit_shock_3": { id: "sit_shock_3", label: "Choque -3", value: -3, type: "system", desc: "Penalidade por dano sério recebido no turno anterior." },
        "sit_shock_4": { id: "sit_shock_4", label: "Choque -4", value: -4, type: "system", desc: "Penalidade máxima por choque." }
    },

    // 2. LAYOUTS PADRÃO
    layouts: {
        // Layout para Ataques Corpo a Corpo
        "attack_melee": [
            {
                title: "Localização",
                color: "#a53541", // Vermelho
                items: ["loc_torso", "loc_skull", "loc_neck", "loc_face", "loc_vitals", "loc_arm", "loc_leg", "loc_hand", "loc_eye"]
            },
            {
                title: "Manobras",
                color: "#c5a05b", // Dourado
                items: ["man_all_out", "man_defensive", "man_move_attack", "man_deceptive_1", "man_deceptive_2", "man_rapid"]
            },
            {
                title: "Situação",
                color: "#56819c", // Azul
                items: ["sit_shock_1", "sit_shock_2", "sit_shock_3", "sit_shock_4"]
            }
        ],

        // Layout para Ataques à Distância
        "attack_ranged": [
            {
                title: "Localização",
                color: "#a53541",
                items: ["loc_torso", "loc_skull", "loc_eye", "loc_vitals", "loc_arm", "loc_leg"]
            },
            {
                title: "Opções",
                color: "#c5a05b",
                items: ["man_all_out", "man_move_attack"] 
            },
            {
                title: "Situação",
                color: "#56819c",
                items: ["sit_shock_1", "sit_shock_2", "sit_shock_3", "sit_shock_4"]
            }
        ],
        
        // Layout Genérico (Atributos e Perícias)
        "default": [
            {
                title: "Opções de Teste",
                color: "#389c68", // Verde
                items: ["opt_time_1", "opt_time_2", "opt_extra_effort"]
            },
            {
                title: "Condição Física",
                color: "#56819c",
                items: ["sit_shock_1", "sit_shock_2", "sit_shock_3", "sit_shock_4"]
            }
        ]
    }
};