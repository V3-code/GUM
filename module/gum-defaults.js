// systems/gum/module/gum-defaults.js

export const GUM_DEFAULTS = {
    
    // 1. MODIFICADORES NATIVOS (LIMPO)
    // Deixamos vazio. Todo o conteúdo virá do Compêndio ou da Ficha.
    modifiers: {},

    // 2. DEFINIÇÃO DE CONTEXTOS E SEUS BLOCOS (MANTIDO)
    // Isso define a "Estante". Os "Livros" (itens) virão do Compêndio.
    layouts: {
        "attack_melee": [
            { id: "location",    title: "Localização",    color: "#a53541" }, 
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" }, 
            { id: "attack_opt",  title: "Opções de Ataque", color: "#e67e22" },
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "posture",     title: "Postura",        color: "#7f8c8d" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Customizado",    color: "#27ae60" }
        ],
        "attack_ranged": [
            { id: "location",    title: "Localização",    color: "#a53541" },
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" },
            { id: "attack_opt",  title: "Opções de Tiro", color: "#e67e22" },
            { id: "range",       title: "Distância",      color: "#16a085" },
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "posture",     title: "Postura",        color: "#7f8c8d" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Customizado",    color: "#27ae60" }
        ],
        "defense": [
            { id: "maneuver",    title: "Manobra Realizada", color: "#c5a05b" },
            { id: "defense_opt", title: "Opções de Defesa",  color: "#2ecc71" },
            { id: "effort",      title: "Esforço Extra",     color: "#8e44ad" },
            { id: "posture",     title: "Postura",           color: "#7f8c8d" },
            { id: "situation",   title: "Situação",          color: "#2980b9" },
            { id: "other",       title: "Customizado",       color: "#27ae60" }
        ],
        "spell": [
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" },
            { id: "ritual",      title: "Ritual & Mana",  color: "#9b59b6" },
            { id: "time",        title: "Tempo",          color: "#f39c12" },
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "range",       title: "Distância",      color: "#16a085" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Customizado",    color: "#27ae60" }
        ],
        "power": [
            { id: "maneuver",    title: "Manobras",       color: "#c5a05b" },
            { id: "ritual",      title: "Nuances do Poder", color: "#9b59b6" },
            { id: "time",        title: "Tempo",          color: "#f39c12" },
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Customizado",    color: "#27ae60" }
        ],
        "skill": [
            { id: "time",        title: "Tempo & Dificuldade", color: "#f39c12" },
            { id: "effort",      title: "Esforço Extra",       color: "#8e44ad" },
            { id: "situation",   title: "Situação",            color: "#2980b9" },
            { id: "other",       title: "Customizado",         color: "#27ae60" }
        ],
        "default": [
            { id: "time",        title: "Tempo",          color: "#f39c12" },
            { id: "effort",      title: "Esforço Extra",  color: "#8e44ad" },
            { id: "situation",   title: "Situação",       color: "#2980b9" },
            { id: "other",       title: "Outros",         color: "#444" }
        ]
    }
};