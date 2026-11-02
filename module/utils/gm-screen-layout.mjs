function clampIndex(index, length) {
    const numeric = Number.isFinite(Number(index)) ? Number(index) : 0;
    return Math.max(0, Math.min(Math.trunc(numeric), length));
}

export function moveEntryById(entries, id, targetIndex) {
    const next = Array.isArray(entries) ? [...entries] : [];
    const sourceIndex = next.findIndex(entry => entry?.id === id);
    if (sourceIndex < 0) return next;
    const [entry] = next.splice(sourceIndex, 1);
    next.splice(clampIndex(targetIndex, next.length), 0, entry);
    return next;
}

export function moveUuidBetweenGroups(source, target, uuid, targetIndex) {
    if (!source || !target || !Array.isArray(source.items) || !source.items.includes(uuid)) return false;
    source.items = source.items.filter(entry => entry !== uuid);
    target.items = (Array.isArray(target.items) ? target.items : []).filter(entry => entry !== uuid);
    target.items.splice(clampIndex(targetIndex, target.items.length), 0, uuid);
    return true;
}
