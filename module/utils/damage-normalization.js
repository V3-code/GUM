export function normalizeGurpsDamageDice(diceCount, modifier) {
    let normalizedDiceCount = Number.parseInt(diceCount, 10);
    let normalizedModifier = Number.parseInt(modifier, 10);

    if (!Number.isFinite(normalizedDiceCount) || normalizedDiceCount < 1) normalizedDiceCount = 1;
    if (!Number.isFinite(normalizedModifier)) normalizedModifier = 0;

    if (normalizedModifier > 0) {
        const hadHighPositiveModifier = normalizedModifier >= 7;
        while (normalizedModifier >= 7) {
            normalizedModifier -= 7;
            normalizedDiceCount += 2;
        }
        if (normalizedModifier >= 4) {
            normalizedModifier -= 4;
            normalizedDiceCount += 1;
        }
        if (hadHighPositiveModifier && normalizedModifier >= 3) {
            normalizedModifier -= 3;
            normalizedDiceCount += 1;
        }
    } else if (normalizedModifier < 0) {
        while (normalizedModifier <= -7 && normalizedDiceCount > 2) {
            normalizedModifier += 7;
            normalizedDiceCount -= 2;
        }
        if (normalizedModifier <= -4 && normalizedDiceCount > 1) {
            normalizedModifier += 4;
            normalizedDiceCount -= 1;
        }
    }

    const formula = formatGurpsDamageFormula(normalizedDiceCount, normalizedModifier);
    return { diceCount: normalizedDiceCount, modifier: normalizedModifier, formula };
}

export function formatGurpsDamageFormula(diceCount, modifier) {
    const base = `${diceCount}d6`;
    if (!modifier) return base;
    return modifier > 0 ? `${base}+${modifier}` : `${base}${modifier}`;
}

export function normalizeGurpsDamageExpression(formula) {
    const compact = String(formula || "").replace(/\s+/g, "").toLowerCase();
    const match = compact.match(/^(\d+)d6([+\-]\d+)?$/i);
    if (!match) return null;

    const diceCount = Number.parseInt(match[1], 10);
    const modifier = match[2] ? Number.parseInt(match[2], 10) : 0;
    if (!Number.isFinite(diceCount) || !Number.isFinite(modifier)) return null;

    return normalizeGurpsDamageDice(diceCount, modifier);
}