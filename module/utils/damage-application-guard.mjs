const finiteNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export function canUserApplyDamage(user) {
  return user?.isGM === true;
}

/**
 * Resolve the persisted value of a damageable pool.
 *
 * HP stops at the automatic-death boundary already used by the GUM UI
 * (-5 x maximum HP). This keeps an accidental extreme value from leaving the
 * actor with an arbitrarily deep negative resource while preserving the full
 * injury amount for wounds, effects, and condition events.
 */
export function resolveDamagePoolUpdate({ current, amount, heal = false, kind = "other", maximum = null } = {}) {
  const before = finiteNumber(current);
  const appliedAmount = finiteNumber(amount);
  const poolMaximum = finiteNumber(maximum);

  if (before === null || appliedAmount === null || appliedAmount < 0) {
    return { valid: false, before, amount: appliedAmount, after: null, rawAfter: null, minimum: null, clamped: false };
  }

  const rawAfter = before + (heal ? appliedAmount : -appliedAmount);
  const minimum = !heal && kind === "hp" && poolMaximum !== null && poolMaximum > 0
    ? -5 * poolMaximum
    : null;
  const after = minimum === null ? rawAfter : Math.max(minimum, rawAfter);

  return {
    valid: Number.isFinite(rawAfter) && Number.isFinite(after),
    before,
    amount: appliedAmount,
    after,
    rawAfter,
    minimum,
    clamped: after !== rawAfter
  };
}
