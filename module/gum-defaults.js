// systems/gum/module/gum-defaults.js

export const GUM_DEFAULTS = {
    
    // 1. MODIFICADORES NATIVOS (REGRAS DO SISTEMA)
    modifiers: {
        // --- LOCALIZAÇÃO DE ACERTO (Mantido) ---
        "loc_torso": { id: "loc_torso", label: "Torso (0)", value: 0, type: "system", desc: "Alvo padrão. Sem penalidades." },
        "loc_vitals": { id: "loc_vitals", label: "Órg. Vitais (-3)", value: -3, type: "system", desc: "Coração/Pulmões. Aumenta dano de Perfuração (x3)." },
        "loc_skull": { id: "loc_skull", label: "Crânio (-7)", value: -7, type: "system", desc: "RD 2 extra. Dano x4." },
        "loc_face": { id: "loc_face", label: "Rosto (-5)", value: -5, type: "system", desc: "Sem RD natural. Nocaute fácil." },
        "loc_neck": { id: "loc_neck", label: "Pescoço (-5)", value: -5, type: "system", desc: "Corte/Esmagamento ganham bônus de x1.5." },
        "loc_leg": { id: "loc_leg", label: "Perna (-2)", value: -2, type: "system", desc: "Pode derrubar ou aleijar." },
        "loc_arm": { id: "loc_arm", label: "Braço (-2)", value: -2, type: "system", desc: "Pode derrubar arma ou aleijar." },
        "loc_eye": { id: "loc_eye", label: "Olho (-9)", value: -9, type: "system", desc: "Dano x4. Cegueira." },

        // --- MANOBRAS (Expandido) ---
        "man_all_out": { id: "man_all_out", label: "Ataque Total (+4)", value: 4, type: "system", desc: "Determinado. Sem defesa ativa." },
        "man_move_attack": { id: "man_move_attack", label: "Mover e Atacar", value: 0, type: "system", desc: "NH máx 9 (ou -4). Sem aparar." },
        "man_defensive": { id: "man_defensive", label: "Ataque Defensivo", value: -4, type: "system", desc: "Ataque com -4. +1 na defesa." },
        "man_concentrate": { id: "man_concentrate", label: "Concentração", value: 0, type: "system", desc: "Necessário para conjurar a maioria das magias." },

        // --- OPÇÕES DE ATAQUE ---
        "opt_deceptive_1": { id: "opt_deceptive_1", label: "Enganoso (-2)", value: -2, type: "system", desc: "-2 no ataque, -1 na defesa do alvo." },
        "opt_deceptive_2": { id: "opt_deceptive_2", label: "Enganoso (-4)", value: -4, type: "system", desc: "-4 no ataque, -2 na defesa do alvo." },
        "opt_rapid_strike": { id: "opt_rapid_strike", label: "Ataque Rápido (-6)", value: -6, type: "system", desc: "Realiza um ataque extra." },
        "opt_telegraphic": { id: "opt_telegraphic", label: "Telegráfico (+4)", value: 4, type: "system", desc: "+4 no ataque, +2 na defesa do alvo." },

        // --- OPÇÕES DE DEFESA ---
        "def_retreat": { id: "def_retreat", label: "Retirada (+1/+3)", value: 0, type: "system", desc: "Bônus de +3 na Esquiva ou +1 em Aparar/Bloqueio (Requer recuo)." },
        "def_dodge_drop": { id: "def_dodge_drop", label: "Se Jogar no Chão (+3)", value: 3, type: "system", desc: "+3 na Esquiva. Termina deitado." },
        "def_acrobatic": { id: "def_acrobatic", label: "Esq. Acrobática (+2)", value: 2, type: "system", desc: "Requer teste de Acrobacia." },

        // --- POSTURA (Corpo a Corpo e Distância) ---
        "pos_crouching": { id: "pos_crouching", label: "Agachado (-2)", value: -2, type: "system", desc: "-2 em ataques C.C. Alvo tem -2 para acertar torso." },
        "pos_kneeling": { id: "pos_kneeling", label: "Ajoelhado (-2)", value: -2, type: "system", desc: "-2 em ataques C.C. Defesa reduzida." },
        "pos_prone": { id: "pos_prone", label: "Deitado (-4)", value: -4, type: "system", desc: "-4 em ataques C.C. Alvo tem -2 para acertar (distância)." },

        // --- DISTÂNCIA / ALCANCE (Genéricos para placeholders) ---
        "range_point_blank": { id: "range_point_blank", label: "À Queima Roupa", value: 0, type: "system", desc: "Sem penalidade de tamanho/distância." },
        // (O GURPS calcula isso na tabela, mas o GM pode criar botões de alcance fixo se quiser)

        // --- TEMPO ---
        "time_rushed": { id: "time_rushed", label: "Apressado (-5)", value: -5, type: "system", desc: "Menos tempo que o necessário." },
        "time_extra_1": { id: "time_extra_1", label: "Tempo Dobrado (+1)", value: 1, type: "system", desc: "2x o tempo necessário." },
        "time_extra_2": { id: "time_extra_2", label: "Tempo x4 (+2)", value: 2, type: "system", desc: "4x o tempo necessário." },

        // --- ESFORÇO EXTRA ---
        "eff_mighty_blow": { id: "eff_mighty_blow", label: "Golpe Poderoso (-1 PF)", value: 0, type: "system", desc: "Gasta 1 PF para +1 de dano por dado." },
        "eff_feverish_def": { id: "eff_feverish_def", label: "Febre de Batalha (-1 PF)", value: 2, type: "system", desc: "Gasta 1 PF para +2 em uma defesa ativa." },
        "eff_flurry": { id: "eff_flurry", label: "Sequência de Golpes (-1 PF)", value: 0, type: "system", desc: "Reduz penalidade de Ataque Rápido pela metade." },

        // --- SITUAÇÃO (CHOQUE) ---
        "sit_shock_1": { id: "sit_shock_1", label: "Choque -1", value: -1, type: "system", desc: "Dano leve recebido." },
        "sit_shock_2": { id: "sit_shock_2", label: "Choque -2", value: -2, type: "system", desc: "Dano moderado recebido." },
        "sit_shock_3": { id: "sit_shock_3", label: "Choque -3", value: -3, type: "system", desc: "Dano sério recebido." },
        "sit_shock_4": { id: "sit_shock_4", label: "Choque -4", value: -4, type: "system", desc: "Dano máximo de choque." },
        "sit_bad_footing": { id: "sit_bad_footing", label: "Piso Ruim (-2)", value: -2, type: "system", desc: "Chão escorregadio, instável ou lama." },
        "sit_darkness_1": { id: "sit_darkness_1", label: "Penumbra (-1)", value: -1, type: "system", desc: "Pouca luz." },
        "sit_darkness_5": { id: "sit_darkness_5", label: "Escuridão (-5)", value: -5, type: "system", desc: "Necessário uso de tocha ou lanterna." }
    },

    // 2. DEFINIÇÃO DE CONTEXTOS E SEUS BLOCOS
    layouts: {
        // --- 1. ATAQUE CORPO A CORPO ---
        "attack_melee": [
            { id: "location",    title: "Localização",    color: "#a53541" }, // Vermelho
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" }, // Dourado
            { id: "attack_opt",  title: "Opções de Ataque", color: "#e67e22" }, // Laranja
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" }, // Roxo
            { id: "posture",     title: "Postura",        color: "#7f8c8d" }, // Cinza
            { id: "situation",   title: "Situação",       color: "#2980b9" }, // Azul
            { id: "other",       title: "Customizado",    color: "#27ae60" }  // Verde
        ],

        // --- 2. ATAQUE À DISTÂNCIA ---
        "attack_ranged": [
            { id: "location",    title: "Localização",    color: "#a53541" },
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" },
            { id: "attack_opt",  title: "Opções de Tiro", color: "#e67e22" },
            { id: "range",       title: "Distância",      color: "#16a085" }, // Turquesa
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "posture",     title: "Postura",        color: "#7f8c8d" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Customizado",    color: "#27ae60" }
        ],

        // --- 3. DEFESA ATIVA ---
        "defense": [
            { id: "maneuver",    title: "Manobra Realizada", color: "#c5a05b" },
            { id: "defense_opt", title: "Opções de Defesa",  color: "#2ecc71" }, // Verde Claro
            { id: "effort",      title: "Esforço Extra",     color: "#8e44ad" },
            { id: "posture",     title: "Postura",           color: "#7f8c8d" },
            { id: "situation",   title: "Situação",          color: "#2980b9" },
            { id: "other",       title: "Customizado",       color: "#27ae60" }
        ],

        // --- 4. MAGIA (CONJURAÇÃO) ---
        "spell": [
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" },
            { id: "ritual",      title: "Ritual & Mana",  color: "#9b59b6" }, // Roxo Claro
            { id: "time",        title: "Tempo",          color: "#f39c12" }, // Laranja Amarelo
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "range",       title: "Distância",      color: "#16a085" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Customizado",    color: "#27ae60" }
        ],

        // --- 5. PODERES ---
        "power": [
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" },
            { id: "ritual",      title: "Nuances do Poder", color: "#9b59b6" },
            { id: "time",        title: "Tempo",          color: "#f39c12" },
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Customizado",    color: "#27ae60" }
        ],

        // --- 6. PERÍCIAS / PADRÃO ---
        "skill": [
            { id: "time",        title: "Tempo & Dificuldade", color: "#f39c12" },
            { id: "effort",      title: "Esforço Extra",       color: "#8e44ad" },
            { id: "situation",   title: "Situação",            color: "#2980b9" },
            { id: "other",       title: "Customizado",         color: "#27ae60" }
        ],

        // Fallback genérico
        "default": [
            { id: "time",        title: "Tempo",          color: "#f39c12" },
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Outros",         color: "#444" }
        ]
    }
};