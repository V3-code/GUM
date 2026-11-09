# GUM public API

The public API lets macros, modules, and integrations use GUM without relying on UI internals. It is available during the `gum.apiReady` hook and afterwards at `game.gum.api`.

```js
Hooks.once("gum.apiReady", api => {
  console.log(`GUM API ${api.version} / system ${api.systemVersion}`);
});
```

## Compatibility

The API version is independent from the system version. Public names and signatures remain backward compatible within the `1.x` line. A future incompatible contract will increment the API major version.

Only members below `game.gum.api` are public. Other `game.gum` values, such as open windows and transient state, are internal. Historical aliases (`game.gum.rollFromHotbar`, `game.gum.applySingleEffect`, and others) remain available, but new code should use the versioned API.

## Documents and errors

Resolvers accept a document, world ID, or UUID. An embedded item ID can be resolved when its actor is supplied.

```js
const actor = await game.gum.api.actors.resolve("Actor.a1b2c3");
const item = await game.gum.api.items.resolve("itemId", { actor });

try {
  await game.gum.api.actors.resolve("Actor.missing");
} catch (error) {
  if (error instanceof game.gum.api.errors.GumApiError) {
    console.error(error.code, error.details);
  }
}
```

Stable error codes are `INVALID_ARGUMENT`, `INVALID_DOCUMENT`, `DOCUMENT_NOT_FOUND`, `PERMISSION_DENIED`, `CAPABILITY_UNAVAILABLE`, and `FOUNDRY_UNAVAILABLE`.

## Rolls

```js
const result = await game.gum.api.rolls.perform(actor, {
  label: "HT Check",
  value: actor.system.attributes.ht.final,
  type: "attribute",
  attributeKey: "ht"
});

await game.gum.api.rolls.fromHotbar({ actorUuid: actor.uuid, rollData });
await game.gum.api.rolls.executeRequest(request, targetKey, { prompt: true });
```

`rolls.perform` uses the normal GUM flow, including modifiers, confirmation, and configured consumption. `executeRequest` honors target permissions.

## Effects and item state

```js
await game.gum.api.effects.apply(effectUuid, [token], {
  actor: sourceActor,
  origin: sourceItem
});
await game.gum.api.effects.applyUseEvent(item, actor, "activate");
await game.gum.api.effects.setGroupActive(item, "group-id", true);
await game.gum.api.effects.syncItem(item);
const actions = game.gum.api.effects.actions(effectItem);
```

`effects.apply` preserves the effect's resistance barrier. `effects.applyDirect` deliberately bypasses it and is intended only for integrations that already resolved resistance.

## Combat damage

```js
const profile = game.gum.api.damage.resolveProfile(actor, item, attack, "ranged", {
  includeTargeted: true,
  rollData
});
const formula = game.gum.api.damage.resolveFormula(actor, item, attack, "ranged", rollData);
await game.gum.api.damage.fromHotbar({ actorUuid: actor.uuid, damageData });
```

`damage.fromHotbar` executes a damage shortcut after resolving the current actor, item, and attack mode again. `damage.resolveTargetDefenseModifiers(actor, rollContext, rollData)` is also available.

## Content sources

```js
const purposes = game.gum.api.content.purposes();
const sourceIds = game.gum.api.content.getSourceIds("skills");
const { entries, invalidSources } = await game.gum.api.content.getIndex("skills", {
  fields: ["system.specialization"]
});
const { documents } = await game.gum.api.content.getDocuments("effects");
```

`resolveSources`, `setSourceIds`, and `restoreDefaults` are also exposed. The last two change world settings and require a GM.

## Imports, statuses, and UI

```js
await game.gum.api.imports.gcs({ actor });
await game.gum.api.imports.gumJson(); // opens the GUM character JSON importer
const statuses = game.gum.api.status.list();

game.gum.api.ui.openTestRequest();
game.gum.api.ui.openGmScreen();
game.gum.api.ui.openContentSources();       // GM only
game.gum.api.ui.openStatusConfiguration(); // GM only
```

`status.list()` reflects the world's current configuration instead of a hardcoded list.

## Public hooks

Hook names are also available at `game.gum.api.hooks`:

- `gum.apiReady`: the installed API is ready to use.
- `gumWorldStatusConfigurationChanged`: world status configuration changed; receives `{ configuration, rows }`.
- `gum.rollCompleted`: a GUM roll completed with its final result.
- `gum.damageRolled`: a damage package was rolled and is ready to be applied.
- `gum.damageApplied`: damage was effectively applied to an actor or resource.
- `gum.effectApplied`: an Effect Item finished processing its actions on its targets.
- `gum.effectRemoved`: a GUM-managed Active Effect was removed.
- `gum.effectStateChanged`: an Active Effect was enabled or disabled.
- `gum.conditionStateChanged`: a continuous Condition transitioned between active and inactive.
- `gum.stateEffectGroupChanged`: a manual State Effects group was enabled or disabled and synchronized.
- `gum.itemUseCompleted`: an item use completed; emitted after item-originated rolls (`activate`) and resource consumption (`consume`), even without configured Use Event effects.

Lifecycle hooks are informational and cannot cancel the operation. They all receive one version `1` context:

```js
Hooks.on(game.gum.api.hooks.ROLL_COMPLETED, context => {
  if (context.action.type !== "attack") return;
  console.log(context.actor, context.sourceToken, context.targets, context.result);
});
```

The common envelope contains `{ version, eventId, userId, timestamp, actor, sourceToken, item, action, targets, result, metadata }`. The `action` property contains `{ type, id, attackType, label, data }`. Foundry documents are passed by reference without being cloned or sent over the network by the hook. `eventId` identifies one occurrence, while `userId` identifies its originating user.

Specific results:

- `rollCompleted`: `result` is the structured roll result, including `isSuccess`, `margin`, `outcome`, and the other calculated values.
- `damageRolled`: `result` contains `{ damage, rolls, message }`.
- `damageApplied`: `result` contains `{ event, targetActor, injury }`; `event` is the serializable damage-application pulse.
- `effectApplied`: `result` contains the processed action IDs and count plus `{ persistent, activeEffects, activeEffectUuids }`. `metadata` identifies `source`, `sourceUuid`, `mode`, `originUuid`, `applicationId`, and `eventData`, allowing integrations to distinguish sheet, Region, GM Screen, and other sources.
- `effectRemoved`: `result` contains `{ active: false, transition: "removed", activeEffect, targetActor }`.
- `effectStateChanged`: `result` contains `{ active, transition, activeEffect, targetActor }`; `transition` is `enabled` or `disabled`, and `metadata.previousActive` contains the prior state.

When one Effect Item creates multiple persistent ActiveEffects, only one receives `flags.gum.lifecycleCarrier: true`. External integration flags configured on the Effect Item's native ActiveEffect bridge are copied to that carrier. This provides one visual lifecycle for modules such as Automated Animations: creation/enabling starts the persistent effect, while disabling/removal ends it. The remaining mechanical ActiveEffects receive `lifecycleCarrier: false`, preventing duplicate animations.
- `conditionStateChanged`: `result` contains `{ active }`; `metadata.previousActive` and `metadata.reason` describe the transition.
- `stateEffectGroupChanged`: `result` contains `{ active, synchronized, report }`. This hook covers explicit manual-group changes through the API or sheet.
- `itemUseCompleted`: `result` contains `{ trigger, effectCount, appliedEffectUuids, pendingResistanceCount }`; `metadata` includes the roll result when available.

External listeners should treat these objects as read-only. Exceptions thrown by listeners are isolated so they cannot interrupt GUM rules.

TypeScript declarations are provided in [`types/gum-api.d.ts`](../types/gum-api.d.ts). A Portuguese guide is available at [`API.pt-BR.md`](API.pt-BR.md).
