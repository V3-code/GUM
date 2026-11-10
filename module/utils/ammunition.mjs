import { buildEquipmentConsumptionUpdate, equipmentAvailableUses, resolveEquipment } from "./equipment-resolution.mjs";

export function ammunitionLinkCandidates(actor) {
    const collection = actor?.items;
    const items = typeof collection?.values === "function" ? collection.values() : collection || [];
    return Array.from(items).filter(item => item?.system?.ammunition?.enabled);
}

export function numericRateOfFire(value) {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) return null;
    const rate = Number(text);
    return Number.isSafeInteger(rate) && rate > 0 ? rate : null;
}

export function resolveRapidFireMaximum({ cadence, ammunitionAvailable = null, ignoreCadence = false } = {}) {
    const limits = [];
    const numericCadence = Number(cadence);
    const numericAvailable = Number(ammunitionAvailable);
    if (!ignoreCadence && Number.isFinite(numericCadence) && numericCadence > 0) limits.push(Math.floor(numericCadence));
    if (ammunitionAvailable !== null && Number.isFinite(numericAvailable) && numericAvailable >= 0) limits.push(Math.floor(numericAvailable));
    return limits.length ? Math.min(...limits) : null;
}

export function calculateRapidFireHits({ isSuccess = false, isCriticalSuccess = false, margin = 0, recoil, shotsFired }) {
    const shots = Math.floor(Number(shotsFired));
    const rcl = Number(recoil);
    if (!Number.isSafeInteger(shots) || shots < 2 || !Number.isFinite(rcl) || rcl <= 0) return null;
    if (!isSuccess) return { shotsFired: shots, recoil: rcl, hits: 0, isCriticalSuccess: false };
    const successMargin = Math.max(0, Math.floor(Number(margin) || 0));
    const hits = isCriticalSuccess ? shots : Math.min(shots, 1 + Math.floor(successMargin / rcl));
    return { shotsFired: shots, recoil: rcl, hits, isCriticalSuccess: Boolean(isCriticalSuccess) };
}

export function availableAmmunition(actor, attack) {
    const ids = Array.isArray(attack?.ammunition_ids) ? attack.ammunition_ids : [];
    return ids.map(id => actor?.items?.get(id)).filter(item => item && item.system?.ammunition?.enabled &&
        !item.system?.stored && item.system?.location !== "stored" && ammunitionAvailableUses(item) > 0);
}

export function linkedAmmunition(actor, attack) {
    const ids = Array.isArray(attack?.ammunition_ids) ? attack.ammunition_ids : [];
    return ids.map(id => actor?.items?.get(id)).filter(item => item && item.system?.ammunition?.enabled &&
        !item.system?.stored && item.system?.location !== "stored");
}

export function normalizeAmmunitionLoadout(value = {}) {
    const shots = Math.floor(Number(value?.shots));
    return {
        ammunitionId: String(value?.ammunitionId || ""),
        shots: Number.isSafeInteger(shots) && shots > 0 ? shots : 1,
        ignoreCadence: value?.ignoreCadence === true,
        locked: value?.locked === true
    };
}

export function validateAmmunitionLoadout(actor, attack, value = {}) {
    const loadout = normalizeAmmunitionLoadout(value);
    const cadence = numericRateOfFire(attack?.rof);
    if (cadence && !loadout.ignoreCadence && loadout.shots > cadence) {
        return { valid: false, reason: "cadence", loadout, cadence, ammunition: null, available: null };
    }
    if (!loadout.ammunitionId) {
        return { valid: true, reason: null, loadout, cadence, ammunition: null, available: null };
    }
    const ammunition = linkedAmmunition(actor, attack).find(item => item.id === loadout.ammunitionId) || null;
    if (!ammunition) return { valid: false, reason: "unavailable", loadout, cadence, ammunition: null, available: 0 };
    const available = ammunitionAvailableUses(ammunition);
    if (loadout.shots > available) return { valid: false, reason: "insufficient", loadout, cadence, ammunition, available };
    return { valid: true, reason: null, loadout, cadence, ammunition, available };
}

export function ammunitionAvailableUses(item) {
    if (!item) return 0;
    const system = item._source?.system || item.system || {};
    // Resolve from the persisted equipment data at the moment of use. The prepared
    // resolution may still describe the item before its latest charge-mode update,
    // which is especially visible when the weapon uses itself as ammunition.
    const resolution = resolveEquipment(system);
    return equipmentAvailableUses(system, resolution);
}

export function ammunitionUseState(item) {
    if (!item) return { mode: "standard", available: null, uses: null };
    const system = item._source?.system || item.system || {};
    const resolution = resolveEquipment(system);
    return {
        mode: resolution.uses?.mode === "charges" ? "charges" : "quantity",
        available: equipmentAvailableUses(system, resolution),
        uses: resolution.uses
    };
}

/** Consume ammunition through the same quantity/charge contract used by Equipment Items. */
export function buildAmmunitionConsumptionUpdate(item, amount = 1) {
    if (!item) return { consumed: false, reason: "missing_ammunition", updates: {} };
    const system = item._source?.system || item.system || {};
    return buildEquipmentConsumptionUpdate(system, resolveEquipment(system), amount);
}

export function applyAmmunition(profile, ammunition) {
    const result = structuredClone(profile);
    const effects = ammunition?.system?.ammunition || ammunition || {};
    for (const key of ["main", "follow_up", "fragmentation"]) {
        const change = effects[key] || {};
        const component = result[key];
        if (!component) continue;
        if (String(change.formula || "").trim()) {
            const value = String(change.formula).trim();
            const original = String(component.formula || "0");
            component.formula = change.operation === "add" ? `(${original})+(${value})`
                : change.operation === "multiply" ? `(${original})*(${value})` : value;
        }
        for (const field of ["type", "nature"]) {
            if (String(change[field] || "").trim()) component[field] = String(change[field]).trim();
        }
        const divisor = Number(change.armor_divisor);
        if (change.armor_divisor !== "" && change.armor_divisor != null && Number.isFinite(divisor) && divisor > 0) {
            component.armor_divisor = change.divisor_operation === "multiply"
                ? Number(component.armor_divisor || 1) * divisor
                : change.divisor_operation === "add" ? Number(component.armor_divisor || 1) + divisor : divisor;
        }
    }
    return result;
}

export function ammunitionRollModifier(ammunition) {
    return Number(ammunition?.system?.ammunition?.attack_modifier) || 0;
}

export function reconcileAmmunitionModifier(rollModifier, selectedModifier, promptModifier = 0, includedInPrompt = false) {
    return (Number(rollModifier) || 0) + (Number(selectedModifier) || 0)
        - (includedInPrompt ? Number(promptModifier) || 0 : 0);
}
