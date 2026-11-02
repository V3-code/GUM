function clampIndex(index, length) {
    const numeric = Number.isFinite(Number(index)) ? Number(index) : 0;
    return Math.max(0, Math.min(Math.trunc(numeric), length));
}

export const GM_SCREEN_MACRO_EXECUTION_MODES = Object.freeze(["standard", "single-target", "each-target"]);

export function normalizeMacroExecutionMode(mode) {
    return GM_SCREEN_MACRO_EXECUTION_MODES.includes(mode) ? mode : "standard";
}

export function planGMScreenMacroExecution(mode, rawTargets = []) {
    const executionMode = normalizeMacroExecutionMode(mode);
    const targets = Array.from(rawTargets || []);
    if (executionMode === "single-target" && targets.length !== 1) {
        return { ok: false, reason: "single-target", executionMode, targets, executions: [] };
    }
    if (executionMode === "each-target" && targets.length === 0) {
        return { ok: false, reason: "targets", executionMode, targets, executions: [] };
    }
    if (executionMode === "single-target") {
        return { ok: true, reason: null, executionMode, targets, executions: [{ target: targets[0], targets }] };
    }
    if (executionMode === "each-target") {
        return { ok: true, reason: null, executionMode, targets, executions: targets.map(target => ({ target, targets: [target] })) };
    }
    return { ok: true, reason: null, executionMode, targets, executions: [{ target: null, targets }] };
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
