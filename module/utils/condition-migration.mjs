export const CONDITION_MIGRATION_SOURCE_FLAG = "conditionMigrationSourceUuid";

export const applyFlatUpdate = (target, update) => {
    for (const [path, value] of Object.entries(update)) {
        const segments = path.split(".");
        let cursor = target;
        for (const segment of segments.slice(0, -1)) {
            if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) {
                cursor[segment] = {};
            }
            cursor = cursor[segment];
        }
        cursor[segments.at(-1)] = value;
    }
    return target;
};

export const getConditionMigrationSourceUuid = (item) => item?.getFlag?.("gum", CONDITION_MIGRATION_SOURCE_FLAG)
    ?? item?.flags?.gum?.[CONDITION_MIGRATION_SOURCE_FLAG]
    ?? null;

export async function withUnlockedPack(pack, operation) {
    const originalLocked = pack?.locked;
    try {
        if (pack?.locked) await pack.configure({ locked: false });
        return await operation();
    } finally {
        if (pack && originalLocked !== undefined && pack.locked !== originalLocked) {
            await pack.configure({ locked: originalLocked });
        }
    }
}

export async function replaceWithConditionItem(
    item,
    conditionUpdate,
    candidates = [],
    { ItemClass = globalThis.Item } = {}
) {
    const existingReplacement = candidates.find((candidate) =>
        candidate !== item
        && candidate?.type === "condition"
        && getConditionMigrationSourceUuid(candidate) === item.uuid
    );

    let replacementItem = existingReplacement;
    if (!replacementItem) {
        const replacement = applyFlatUpdate(item.toObject(), conditionUpdate);
        delete replacement._id;
        replacement.flags ??= {};
        replacement.flags.gum ??= {};
        replacement.flags.gum[CONDITION_MIGRATION_SOURCE_FLAG] = item.uuid;

        if (item.parent?.documentName === "Actor" && typeof item.parent.createEmbeddedDocuments === "function") {
            [replacementItem] = await item.parent.createEmbeddedDocuments("Item", [replacement], { renderSheet: false });
        } else {
            const createOptions = item.pack
                ? { pack: item.pack, renderSheet: false }
                : { renderSheet: false };
            replacementItem = await ItemClass.create(replacement, createOptions);
        }
        if (replacementItem) candidates.push(replacementItem);
    }

    await item.delete({ render: false });
    return replacementItem;
}
