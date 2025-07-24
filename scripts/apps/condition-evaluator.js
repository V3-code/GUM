// scripts/apps/condition-evaluator.js
let evaluatingActors = new Set();

export async function evaluateConditions(actor) {
    if (evaluatingActors.has(actor.id)) return;
    evaluatingActors.add(actor.id);

    try {
        const conditions = actor.items.filter(i => i.type === "condition");
        const updates = {};
        const modifiers = {};

        const pathsToReset = new Set();
        conditions.forEach(cond => {
            const effectsData = cond.system.effects || [];
            const effectsArray = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
            effectsArray.forEach(eff => pathsToReset.add(eff.path));
        });
        pathsToReset.forEach(path => {
            if (path && path.endsWith('.temp')) updates[path] = 0;
        });

           for (const condition of conditions) {
        // Se o interruptor manual estiver ligado, pula esta condição.
        if (condition.getFlag("gum", "manual_override")) continue;

        let isConditionActive = false;
            if (!condition.system.when || condition.system.when.trim() === "") {
                isConditionActive = true;
            } else {
                try {
                    isConditionActive = Function("actor", `return ( ${condition.system.when} )`)(actor);
                } catch (e) {
                    console.warn(`GUM | Erro na regra "${condition.system.when}" da condição "${condition.name}".`, e);
                }
            }

            if (isConditionActive) {
                const effectsData = condition.system.effects || [];
                const effectsArray = Array.isArray(effectsData) ? effectsData : Object.values(effectsData);
                effectsArray.forEach(effect => {
                    if (!modifiers[effect.path]) modifiers[effect.path] = 0;
                    const value = Number(effect.value) || 0;
                    if (effect.operation === "ADD") modifiers[effect.path] += value;
                    else if (effect.operation === "SUB") modifiers[effect.path] -= value;
                    else if (effect.operation === "SET") modifiers[effect.path] = value;
                });
            }
        }

        for (const [path, totalModifier] of Object.entries(modifiers)) {
            updates[path] = totalModifier;
        }

        if (Object.keys(updates).length > 0) {
            await actor.update(updates);
        }
    } finally {
        evaluatingActors.delete(actor.id);
    }
}