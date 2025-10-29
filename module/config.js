// systems/gum/module/config.js

// Este objeto conterá todas as configurações estáticas do nosso sistema.
export const GUM = {};

/**
 * A lista oficial de efeitos de status para o sistema GURPS.
 * Cada objeto contém:
 * - id: Um identificador único para o código (em inglês).
 * - name: O nome exibido para o jogador (em português).
 * - img: O caminho para o ícone correspondente.
 */
GUM.statusEffects = [
    { id: "shock_1", name: "Choque (-1)", img: "systems/gum/icons/status/shock_1.png" },
    { id: "shock_2", name: "Choque (-2)", img: "systems/gum/icons/status/shock_2.png" },
    { id: "shock_3", name: "Choque (-3)", img: "systems/gum/icons/status/shock_3.png" },
    { id: "shock_4", name: "Choque (-4)", img: "systems/gum/icons/status/shock_4.png" },
    { id: "bleeding", name: "Sangrando", img: "systems/gum/icons/status/bleeding.png" },
    { id: "poisoned", name: "Envenenado", img: "systems/gum/icons/status/poisoned.png" },
    { id: "burning", name: "Em Chamas", img: "systems/gum/icons/status/burning.png" },
    { id: "flying", name: "Voando", img: "systems/gum/icons/status/flying.png" },
    { id: "stealth", name: "Furtivo", img: "systems/gum/icons/status/stealth.png" },
    { id: "nauseated", name: "Nauseado", img: "systems/gum/icons/status/nauseated.png" },
    { id: "grappled", name: "Agarrado", img: "systems/gum/icons/status/grappled.png" },
    { id: "fascinated", name: "Fascinado", img: "systems/gum/icons/status/fascinated.png" },
    { id: "exhausted", name: "Exausto", img: "systems/gum/icons/status/exhausted.png" },
    { id: "blinded", name: "Cego", img: "systems/gum/icons/status/blinded.png" },
    { id: "silenced", name: "Silenciado", img: "systems/gum/icons/status/silenced.png" },
    { id: "drugged", name: "Drogado", img: "systems/gum/icons/status/drugged.png" },
    { id: "frightened", name: "Amedrontado", img: "systems/gum/icons/status/frightened.png" },
    { id: "suffocate", name: "Sufocado", img: "systems/gum/icons/status/suffocate.png" },
    { id: "deafened", name: "Surdo", img: "systems/gum/icons/status/deafened.png" },
    { id: "major_wound", name: "Ferimento Grave", img: "systems/gum/icons/status/major_wound.png" },
    { id: "stunned", name: "Atordoado", img: "systems/gum/icons/status/stunned.png" },
    { id: "reeling", name: "Cambaleando", img: "systems/gum/icons/status/reeling.png" },
    { id: "drunk_1", name: "Bêbado 1", img: "systems/gum/icons/status/drunk_1.png" },
    { id: "drunk_2", name: "Bêbado 2", img: "systems/gum/icons/status/drunk_2.png" },
    { id: "cough", name: "Tosse", img: "systems/gum/icons/status/cough.png" },
    { id: "madness", name: "Loucura", img: "systems/gum/icons/status/madness.png" },
    { id: "position_crouch", name: "Agachado", img: "systems/gum/icons/status/position_crouch.png" },
    { id: "position_crawl", name: "Engatinhando", img: "systems/gum/icons/status/position_crawl.png" },
    { id: "position_kneel", name: "Ajoelhado", img: "systems/gum/icons/status/position_kneel.png" },
    { id: "position_standing", name: "Em Pé", img: "systems/gum/icons/status/position_standing.png" },
    { id: "position_sitting", name: "Sentado", img: "systems/gum/icons/status/position_sitting.png" },
    { id: "pain", name: "Dor", img: "systems/gum/icons/status/pain.png" },
    { id: "unconscious", name: "Inconsciente", img: "systems/gum/icons/status/unconscious.png" },
    { id: "dead", name: "Morto", img: "systems/gum/icons/status/dead.png" },
    { id: "paralyze", name: "Paralisado", img: "systems/gum/icons/status/paralyze.png" },
    { id: "sleeping", name: "Dormindo", img: "systems/gum/icons/status/sleeping.png" },
    { id: "swimming", name: "Nadando", img: "systems/gum/icons/status/swimming.png" },
    { id: "num_1", name: "Número 1", img: "systems/gum/icons/status/num_1.png" },
    { id: "num_2", name: "Número 2", img: "systems/gum/icons/status/num_2.png" },
    { id: "num_3", name: "Número 3", img: "systems/gum/icons/status/num_3.png" }
    
];