export function hasActorOwnershipChange(changes = {}) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return false;
    return Object.keys(changes).some(key => key === "ownership" || key.startsWith("ownership."));
}

export function shouldRefreshGMScreenForActor(actor, changes = {}, { combatActive = false } = {}) {
    return hasActorOwnershipChange(changes) || actor?.hasPlayerOwner === true || combatActive === true;
}
