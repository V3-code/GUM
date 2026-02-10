// systems/gum/module/gum-defaults.js

export const GUM_DEFAULTS = {
    
    // 1. MODIFICADORES NATIVOS (LIMPO)
    // Deixamos vazio. Todo o conteúdo virá do Compêndio ou da Ficha.
    modifiers: {},

    // 2. DEFINIÇÃO DE CONTEXTOS E SEUS BLOCOS (MANTIDO)
    // Isso define a "Estante". Os "Livros" (itens) virão do Compêndio.
    layouts: {
        "attack_melee": [
            { id: "location",         title: "Pontos de Impacto",      color: "#a53541" }, 
            { id: "maneuver",         title: "Manobras",               color: "#c5a05b" }, 
            { id: "attack_opt",       title: "Opções de Ataque",       color: "#e67e22" },
            { id: "posture",          title: "Cobertura e Postura",    color: "#7f8c8d" },
            { id: "terrain_light",    title: "Terreno e Iluminação",   color: "#34495e" },
            { id: "state_affliction", title: "Estado e Atribulações",  color: "#6c5ce7" },
            { id: "task_difficulty",  title: "Dificuldade da Tarefa",  color: "#d35400" },
            { id: "effort",           title: "Esforço Adicional",      color: "#8e44ad" },
            { id: "situation",        title: "Cenário",                color: "#2980b9" },
            { id: "equipment",        title: "Equipamento",            color: "#2c3e50" },
            { id: "other",            title: "Customizado",            color: "#27ae60" }
        ],
        "attack_ranged": [
            { id: "location",         title: "Pontos de Impacto",      color: "#a53541" },
            { id: "maneuver",         title: "Manobras",               color: "#c5a05b" },
            { id: "attack_opt",       title: "Opções de Ataque",       color: "#e67e22" },
            { id: "range",            title: "Distância e Velocidade", color: "#16a085" },
            { id: "posture",          title: "Cobertura e Postura",    color: "#7f8c8d" },
            { id: "terrain_light",    title: "Terreno e Iluminação",   color: "#34495e" },
            { id: "state_affliction", title: "Estado e Atribulações",  color: "#6c5ce7" },
            { id: "task_difficulty",  title: "Dificuldade da Tarefa",  color: "#d35400" },
            { id: "effort",           title: "Esforço Adicional",      color: "#8e44ad" },
            { id: "situation",        title: "Cenário",                color: "#2980b9" },
            { id: "equipment",        title: "Equipamento",            color: "#2c3e50" },
            { id: "other",            title: "Customizado",            color: "#27ae60" }
        ],
        "defense": [
            { id: "maneuver",         title: "Manobras",               color: "#c5a05b" },
            { id: "defense_opt",      title: "Opções de Defesa",       color: "#2ecc71" },
            { id: "posture",          title: "Cobertura e Postura",    color: "#7f8c8d" },
            { id: "terrain_light",    title: "Terreno e Iluminação",   color: "#34495e" },
            { id: "state_affliction", title: "Estado e Atribulações",  color: "#6c5ce7" },
            { id: "task_difficulty",  title: "Dificuldade da Tarefa",  color: "#d35400" },
            { id: "effort",           title: "Esforço Adicional",      color: "#8e44ad" },
            { id: "situation",        title: "Cenário",                color: "#2980b9" },
            { id: "equipment",        title: "Equipamento",            color: "#2c3e50" },
            { id: "other",            title: "Customizado",            color: "#27ae60" }
        ],
        "spell": [
            { id: "maneuver",         title: "Manobras",               color: "#c5a05b" },
            { id: "ritual",           title: "Operação Mágica",        color: "#9b59b6" },
            { id: "time",             title: "Modo de Execução",       color: "#f39c12" },
            { id: "range",            title: "Distância e Velocidade", color: "#16a085" },
            { id: "state_affliction", title: "Estado e Atribulações",  color: "#6c5ce7" },
            { id: "task_difficulty",  title: "Dificuldade da Tarefa",  color: "#d35400" },
            { id: "effort",           title: "Esforço Adicional",      color: "#8e44ad" },
            { id: "situation",        title: "Cenário",                color: "#2980b9" },
            { id: "equipment",        title: "Equipamento",            color: "#2c3e50" },
            { id: "other",            title: "Customizado",            color: "#27ae60" }
        ],
        "power": [
            { id: "maneuver",         title: "Manobras",               color: "#c5a05b" },
            { id: "power_operation",  title: "Operação de Poderes",    color: "#9b59b6" },
            { id: "time",             title: "Modo de Execução",       color: "#f39c12" },
            { id: "state_affliction", title: "Estado e Atribulações",  color: "#6c5ce7" },
            { id: "task_difficulty",  title: "Dificuldade da Tarefa",  color: "#d35400" },
            { id: "effort",           title: "Esforço Adicional",      color: "#8e44ad" },
            { id: "situation",        title: "Cenário",                color: "#2980b9" },
            { id: "equipment",        title: "Equipamento",            color: "#2c3e50" },
            { id: "other",            title: "Customizado",            color: "#27ae60" }
        ],
        "skill": [
            { id: "time",             title: "Modo de Execução",       color: "#f39c12" },
            { id: "task_difficulty",  title: "Dificuldade da Tarefa",  color: "#d35400" },
            { id: "state_affliction", title: "Estado e Atribulações",  color: "#6c5ce7" },
            { id: "effort",           title: "Esforço Adicional",      color: "#8e44ad" },
            { id: "situation",        title: "Cenário",                color: "#2980b9" },
            { id: "equipment",        title: "Equipamento",            color: "#2c3e50" },
            { id: "other",            title: "Customizado",            color: "#27ae60" }
        ],
        "default": [
            { id: "time",             title: "Modo de Execução",       color: "#f39c12" },
            { id: "task_difficulty",  title: "Dificuldade da Tarefa",  color: "#d35400" },
            { id: "effort",           title: "Esforço Adicional",      color: "#8e44ad" },
            { id: "situation",        title: "Cenário",                color: "#2980b9" },
            { id: "other",            title: "Customizado",            color: "#444" }
        ]
    }
};