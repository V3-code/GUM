# AI Reference — GUM Condition and Trigger Items

[Versão em português](./item-condicao-e-gatilho.md)

> Technical reference for producing, reviewing, and explaining Condition and Trigger Items compatible with the unofficial GURPS GUM system.
>
> Mapping checked against GUM `1.5.0-beta`, Foundry VTT minimum 13 and verified 14, on 2026-10-31.

## 1. Purpose and mental model

This reference describes the persisted structure of both Items and the evaluation contract provided by GUM.

- A **Condition** Item (`type: "condition"`) stores the expression that is actually evaluated in `system.when` and links the Effect Items to execute.
- A **Trigger** Item (`type: "trigger"`) is a reusable library entry. `system.code` stores an expression that the UI can copy into `system.when`; the Trigger Item does not listen for events or execute effects by itself.

Condition and Trigger therefore share the same expression language, but only Condition participates in the execution engine.

When a Condition and its Effects must travel in the same JSON, also see the [self-contained item bundle](./self-contained-item-bundle.md). Inside `system.effects`, use `effectRef` instead of a UUID when the effect belongs to that bundle.

## 2. Recommended AI output contract

1. Return valid JSON without comments inside JSON.
2. Use `type: "condition"` for an executable rule and `type: "trigger"` for a saved fragment.
3. Write one JavaScript expression in `system.when` or `system.code`; do not include `return`, declarations, blocks, or semicolons.
4. The expression must be read-only and produce a boolean value. Do not update documents, publish messages, or run macros inside a trigger.
5. Use optional chaining (`?.`) and fallbacks (`??`) whenever a path may be absent.
6. For point-in-time events, test `eventData?.type` first and then the event-specific fields.
7. Do not invent Effect UUIDs or status, Item, attack, resource, or combatant IDs. Use an ID supplied by the user or leave the reference to be completed or imported.
8. Give every effect link a unique, stable `id`. A 16-character alphanumeric sequence is recommended.
9. Choose each effect phase explicitly. Do not rely on `always` for new content when `enter`, `event`, `turnStart`, or `exit` better expresses the intent.
10. Do not generate `_id`, `folder`, `sort`, `ownership`, or `_stats` unless the import flow requires them.
11. Explain outside JSON any assumption, world-dependent path, or identifier that still needs replacement.

## 3. Minimum structures

### 3.1 Condition Item

```json
{
  "name": "Condition name",
  "type": "condition",
  "img": "icons/svg/aura.svg",
  "system": {
    "description": "<p>Full description.</p>",
    "chat_description": "<p>Summary.</p>",
    "ref": "",
    "bindingMode": "conditional",
    "when": "Number(actor.system.attributes.hp?.value ?? 0) <= 0",
    "triggerOnTurnStartWhileActive": false,
    "effects": []
  }
}
```

### 3.2 Trigger Item

```json
{
  "name": "HP at or below zero",
  "type": "trigger",
  "img": "icons/svg/clockwork.svg",
  "system": {
    "description": "<p>Remains true while current HP is zero or lower.</p>",
    "chat_description": "",
    "ref": "",
    "code": "Number(actor.system.attributes.hp?.value ?? 0) <= 0"
  }
}
```

Inherited base-model fields may be omitted; the system model supplies their defaults.

## 4. Condition Item fields

| Path | Type | Default | Use |
| --- | --- | --- | --- |
| `system.bindingMode` | enum | `conditional` | Use `conditional` for new expression-based content. `status-link` is a legacy mode reserved for status-link migration. |
| `system.when` | string | `""` | Expression evaluated by the engine. Empty is equivalent to true. |
| `system.triggerOnTurnStartWhileActive` | boolean | `false` | Repeats compatible phases at the start of this actor's turn while a continuous condition is active. |
| `system.effects` | array | `[]` | Links to Effect Items. |
| `system.description` | HTML/string | `""` | Full explanation. |
| `system.chat_description` | HTML/string | `""` | UI and chat summary. |
| `system.ref` | string | `""` | Bibliographic or rule reference. |

`system.code` is the only Trigger-specific mechanical field. Description, summary, and reference come from the base model.

## 5. Expression evaluation

Conceptually, GUM executes:

```js
Function("actor", "game", "eventData", `return (${condition.system.when})`)(actor, game, eventData)
```

Available variables:

- `actor`: the Actor that owns the Condition;
- `game`: Foundry's public game instance;
- `eventData`: the current structured event or `null` during an ordinary reevaluation.

If the expression throws, its result is treated as false.

### 5.1 Continuous condition

An expression that does not reference `eventData` describes state:

```js
Number(actor.system.attributes.fp?.value ?? 0) <= 0
```

The engine records entry and exit. Persistent effects can be applied on entry and removed when the expression stops being true.

### 5.2 Event-driven condition

An expression that literally references `eventData` describes a pulse:

```js
eventData?.type === "defense_roll" && eventData?.defenseType === "dodge"
```

Each matching event may execute the `event` phase. This mode does not preserve an on/off state between events and has no automatic exit.

### 5.3 Readable state is not necessarily reactive

An expression can read public information from `game`, a Scene, or world time, but it only notices a change when the Condition engine reevaluates it. GUM emits dedicated pulses for Region entry/exit, ambient Scene darkness changes, and World Time changes. Other scene state remains non-reactive until it has a dedicated emitter.

## 6. Effect Item links

Persisted format:

```json
{
  "id": "effectlink000001",
  "uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
  "phase": "enter",
  "removeOnConditionEnd": true
}
```

Self-contained bundle format:

```json
{
  "id": "effectlink000001",
  "effectRef": "local-effect-key",
  "phase": "enter",
  "removeOnConditionEnd": true
}
```

| `phase` | Execution |
| --- | --- |
| `always` | Compatibility behavior: runs on entry, event, or turn start as applicable. It does not run on exit. |
| `enter` | When a continuous condition changes from false to true. |
| `event` | On every matching event for an event-driven condition. |
| `turnStart` | At the actor's turn start while the continuous condition is active. This phase enables turn repetition by itself. |
| `exit` | When a continuous condition changes from true to false. |

`removeOnConditionEnd` controls cleanup of persistent actions created through the link. When false, the effect remains under its own lifecycle. Exit-phase effects are not removed by the cleanup that occurs before they are applied.

## 7. Useful Actor paths

### 7.1 Attributes and basic resources

| Path | Meaning |
| --- | --- |
| `actor.system.attributes.<key>.value` | Base or current value, depending on the attribute. |
| `actor.system.attributes.<key>.final` | Final prepared value. |
| `actor.system.attributes.<key>.max` | Legacy maximum, when present. |
| `actor.system.attributes.hp.value` | Current HP. |
| `actor.system.attributes.hp.final` | Effective maximum HP. |
| `actor.system.attributes.fp.value` | Current FP. |
| `actor.system.attributes.fp.final` | Effective maximum FP. |

Common attribute keys: `st`, `dx`, `iq`, `ht`, `vont`, `per`, `hp`, `fp`, `mt`, `basic_speed`, `basic_move`, `enhanced_move`, `lifting_st`, `dodge`, `vision`, `hearing`, `tastesmell`, and `touch`.

### 7.2 Resource collections

| Path | Meaning |
| --- | --- |
| `actor.system.combat.combat_meters.<id>.current` | Current combat-meter value. |
| `actor.system.combat.combat_meters.<id>.max` | Combat-meter maximum. |
| `actor.system.spell_reserves.<id>.current` | Current spell-reserve value. |
| `actor.system.spell_reserves.<id>.max` | Spell-reserve maximum. |
| `actor.system.power_reserves.<id>.current` | Current power-reserve value. |
| `actor.system.power_reserves.<id>.max` | Power-reserve maximum. |

Older entries may use `value` instead of `current`. When the source can vary, use `entry.current ?? entry.value ?? 0`.

### 7.3 Items, effects, statuses, and flags

```js
actor.items.some(item => item.type === "advantage" && item.name === "NAME")
```

```js
Array.from(actor.effects ?? []).some(effect =>
  !effect.disabled && effect.statuses?.has?.("STATUS_ID")
)
```

```js
actor.getFlag("gum", "FLAG_NAME") === true
```

Prefer IDs or UUIDs when exact identity matters. Name comparisons are convenient but depend on language and world-side renaming.

## 8. Common event envelope

New and expanded events use these fields when applicable:

| Field | Use |
| --- | --- |
| `version` | Payload version for that event. |
| `pulse` | `true` for point-in-time events. |
| `type` | Compatible family to test first. |
| `eventId` | Identifier used to prevent duplicate processing. |

Use specific filters:

```js
eventData?.type === "resource_change" && eventData?.resourceKind === "spell-reserve"
```

Do not use only `Boolean(eventData)`, because any event family could satisfy it.

## 9. `resource_change` event

Emitted when HP, FP, combat meters, spell/power reserves, equipment-backed reserves, or equipment integrity change.

| Field | Use |
| --- | --- |
| `resource` | Short resource key. For equipment, also inspect `path` and `owner`. |
| `resourceKind` | `hp`, `fp`, `combat-meter`, `spell-reserve`, `power-reserve`, `equipment-reserve`, or `equipment-integrity`. |
| `path` | Canonical path of the changed resource. |
| `label` | Display name. |
| `before`, `after` | Previous and next values. |
| `maximum` | Known maximum. |
| `delta` | `after - before`. |
| `direction` | `increase` or `decrease`. |
| `source.type` | Causing event, such as `damage`, `actor_update`, or `item_update`. |
| `source.eventId` | Causing event ID, when available. |
| `owner` | For an Item-backed resource: `type`, `id`, `uuid`, and `name`. |

HP aliases: `appliedToHP`, `hpBefore`, `hpAfter`, `hpMaximum`.

FP aliases: `appliedToFP`, `fpBefore`, `fpAfter`, `fpMaximum`.

One damage application to HP can produce two different pulses: `damage`, which contains injury details, and `resource_change`, which represents the value crossing. Filter the intended family.

## 10. `damage` event — version 2

Emitted when positive injury is actually applied through the damage-application window. Healing and effects-only applications do not emit this event, although HP/FP changes may still emit `resource_change`.

| Path | Use |
| --- | --- |
| `eventData.type` | `"damage"`. |
| `eventData.reason` | `"damageApplication"`. |
| `eventData.applicationId` | Application/window identifier. |
| `eventData.damage.injury` | Final applied injury. |
| `eventData.damage.rolled` | Rolled damage. |
| `eventData.damage.modified` | Damage after pre-penetration modifiers. |
| `eventData.damage.penetrating` | Penetrating damage after DR. |
| `eventData.damage.type` | Damage type. |
| `eventData.damage.nature` | Configured nature ID. |
| `eventData.damage.armorDivisor` | Armor divisor. |
| `eventData.damage.woundingModifier` | Wounding modifier. |
| `eventData.damage.component` | Main, follow-up, or fragmentation component. |
| `eventData.damage.shockPenalty` | Calculated HP shock penalty. |
| `eventData.targetPool.kind` | `hp`, `fp`, `combat-meter`, `spell-reserve`, `power-reserve`, `equipment-reserve`, `equipment-integrity`, or `other`. |
| `eventData.targetPool.path` | Target resource path. |
| `eventData.targetPool.before`, `.after` | Values before and after. |
| `eventData.targetPool.applied` | Amount applied to the resource. |
| `eventData.targetPool.maximum` | Known maximum or `null`. |
| `eventData.hitLocation.key`, `.label` | Hit-location ID and display name. |
| `eventData.protection.rawDR`, `.effectiveDR`, `.ignored` | Protection details. |
| `eventData.source.*` | Source actor, token, Item, and attack identifiers. |
| `eventData.target.*` | Target actor and token UUIDs. |
| `eventData.combat.*` | Combat ID, round, and turn. |

Short aliases: `injury`, `damageType`, `poolPath`, `hitLocationKey`, `appliedToHP`, `hpBefore`, `hpAfter`, and `hpMaximum`.

## 11. `defense_roll` event

Preserves historical selectors while adding the complete defense result.

| Path | Use |
| --- | --- |
| `eventData.type` | `"defense_roll"`. |
| `eventData.family`, `.category` | `"roll"` and `"defense"`. |
| `eventData.defenseType` | `dodge`, `parry`, or `block`. |
| `eventData.context` | Normalized context such as `defense_parry`. |
| `eventData.inCombat` | Whether a combat was active. |
| `eventData.outcome` | `success`, `failure`, `critical-success`, or `critical-failure`. |
| `eventData.success`, `.isSuccess` | Boolean result. |
| `eventData.criticalSuccess`, `.isCriticalSuccess` | Critical success. |
| `eventData.criticalFailure`, `.isCriticalFailure` | Critical failure. |
| `eventData.total` | Roll total. |
| `eventData.target`, `.effectiveLevel` | Effective target number. |
| `eventData.margin` | Absolute margin reported by GUM. |
| `eventData.modifier`, `.baseValue` | Total modifier and unmodified base. |
| `eventData.purposeIds` | Test purpose IDs. |
| `eventData.source.*` | Source Actor, Token, Item, and attack. |
| `eventData.targetActor.*` | Selected counterpart when exactly one exists. |
| `eventData.combat.*` | Combat ID, round, and turn. |

## 12. `combat` event

| Path | Use |
| --- | --- |
| `eventData.type` | `"combat"`. |
| `eventData.phase` | `combat_start`, `round_start`, `turn_start`, `turn_end`, `round_end`, or `combat_end`. |
| `eventData.reason` | Keeps `turnStart` on turn start; otherwise follows the phase name. |
| `eventData.combatId` | Combat ID alias. |
| `eventData.combat.id`, `.round`, `.turn`, `.started` | Current combat state. |
| `eventData.combatant.*` | Related combatant, Actor, and Token identifiers. |
| `eventData.previous.*` | Previous round, turn, and combatant when available. |

Combat/round start and end events are delivered to every combatant's Conditions. `turn_start` and `turn_end` go to the corresponding combatant's Actor. Execution is coordinated by the primary active GM to prevent duplicates.

## 13. `active_effect_change` event

Emitted whenever an Actor ActiveEffect is created, updated, or deleted. Continuous Conditions that inspect `actor.effects` are reevaluated immediately.

| Path | Use |
| --- | --- |
| `eventData.operation` | `create`, `update`, or `delete`. |
| `eventData.effect.id`, `.uuid`, `.name` | ActiveEffect identity. |
| `eventData.effect.disabled` | Enabled/disabled state. |
| `eventData.effect.statusIds` | Status IDs carried by the effect. |
| `eventData.effect.origin` | ActiveEffect origin when known. |
| `eventData.changedFields` | Top-level fields received during an update. |

### 13.1 `region` event

Emitted for the Token Actor when it enters or exits a Region during movement and when a Token is created inside a Region. The Region does not need a GUM Behavior.

| Path | Use |
| --- | --- |
| `eventData.type` | `"region"`. |
| `eventData.phase` | `enter` or `exit`. |
| `eventData.path` / `.event` | `region.enter` or `region.exit`. |
| `eventData.regionId`, `.regionUuid`, `.regionName` | Region identity. |
| `eventData.sceneId`, `.sceneUuid` | Scene containing the Region. |
| `eventData.token.*` | Related Token and Actor. |
| `eventData.movement.method`, `.action` | Movement method and final action. |
| `eventData.movement.origin`, `.destination` | Position, elevation, and level before/after. |
| `eventData.movement.teleport`, `.forced` | Teleport and forced-displacement indicators. |

### 13.2 Scene darkness event

Emitted to Actors represented by Tokens in the Scene when `environment.darknessLevel` changes.

| Path | Use |
| --- | --- |
| `eventData.type` | `"scene"`. |
| `eventData.category` | `"darkness"`. |
| `eventData.path` | `scene.darkness.change`. |
| `eventData.before`, `.after`, `.delta` | Previous and current darkness plus the difference. |
| `eventData.direction` | `darken`, `brighten`, or `none`. |
| `eventData.sceneId`, `.sceneUuid`, `.sceneName` | Scene identity. |

### 13.3 `world_time` event

Emitted whenever Foundry World Time changes. Evaluation reaches world Actors and synthetic Actors present in Scenes.

| Path | Use |
| --- | --- |
| `eventData.type` | `"world_time"`. |
| `eventData.phase` | `advance`, `rewind`, or `change`. |
| `eventData.path` | `world.time.advance`, `world.time.rewind`, or `world.time.change`. |
| `eventData.worldTime`, `.previousWorldTime` | Current and previous World Time in seconds. |
| `eventData.delta` | Difference in seconds. |
| `eventData.components` | Calendar components supplied by Foundry. |

## 14. Complete useful triggers

These are neutral examples of the system structure. Replace only the indicated IDs and parameters.

### 14.1 HP at or below zero

```js
Number(actor.system.attributes.hp?.value ?? 0) <= 0
```

### 14.2 FP at or below zero

```js
Number(actor.system.attributes.fp?.value ?? 0) <= 0
```

### 14.3 HP below one third of maximum

```js
Number(actor.system.attributes.hp?.value ?? 0) < (Math.max(1, Number(actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) / 3)
```

### 14.4 FP below one third of maximum

```js
Number(actor.system.attributes.fp?.value ?? 0) < (Math.max(1, Number(actor.system.attributes.fp?.final ?? actor.system.attributes.fp?.max ?? 0)) / 3)
```

### 14.5 HP at or below −5 times maximum

```js
Number(actor.system.attributes.hp?.value ?? 0) <= -5 * Math.max(1, Number(actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

### 14.6 FP at or below −1 times maximum

```js
Number(actor.system.attributes.fp?.value ?? 0) <= -1 * Math.max(1, Number(actor.system.attributes.fp?.final ?? actor.system.attributes.fp?.max ?? 0))
```

### 14.7 Cross −1×HP during a decrease

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -1 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -1 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

### 14.8 Cross −2×HP during a decrease

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -2 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -2 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

### 14.9 Cross −3×HP during a decrease

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -3 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -3 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

### 14.10 Cross −4×HP during a decrease

```js
eventData?.type === "resource_change" && eventData?.resource === "hp" && Number(eventData?.before) > -4 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) <= -4 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0)) && Number(eventData?.after) > -5 * Math.max(1, Number(eventData?.maximum ?? actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))
```

A single decrease can cross several thresholds and match every applicable expression.

### 14.11 One HP injury greater than half maximum HP

```js
eventData?.type === "damage" && eventData?.appliedToHP === true && Number(eventData?.injury ?? 0) > (Number(eventData?.hpMaximum ?? Math.max(1, Number(actor.system.attributes.hp?.final ?? actor.system.attributes.hp?.max ?? 0))) / 2)
```

This checks the current application, not merely whether current HP is below half.

### 14.12 A Dodge roll in combat

```js
eventData?.inCombat && eventData?.type === "defense_roll" && eventData?.defenseType === "dodge"
```

### 14.13 A Parry roll in combat

```js
eventData?.inCombat && eventData?.type === "defense_roll" && eventData?.defenseType === "parry"
```

### 14.14 A Block roll in combat

```js
eventData?.inCombat && eventData?.type === "defense_roll" && eventData?.defenseType === "block"
```

These expressions represent the roll occurring, not necessarily succeeding. Add `&& eventData?.success === true` when the outcome matters.

### 14.15 Enter a specific Region

```js
eventData?.type === "region" && eventData?.phase === "enter" && eventData?.regionUuid === "Scene.SCENE.Region.REGION"
```

### 14.16 Scene darkness reached at least 70%

```js
eventData?.type === "scene" && eventData?.category === "darkness" && Number(eventData?.after ?? 0) >= 0.7
```

### 14.17 World Time advanced by at least one hour

```js
eventData?.type === "world_time" && eventData?.phase === "advance" && Number(eventData?.delta ?? 0) >= 3600
```

## 15. Additional structures using current events

### Critical failure on a defense

```js
eventData?.type === "defense_roll" && eventData?.criticalFailure === true
```

### Start of this Actor's turn

```js
eventData?.type === "combat" && eventData?.phase === "turn_start"
```

### Start of a round

```js
eventData?.type === "combat" && eventData?.phase === "round_start"
```

### A specific status is created

```js
eventData?.type === "active_effect_change" && eventData?.operation === "create" && eventData?.effect?.statusIds?.includes("STATUS_ID")
```

### A spell reserve decreases

```js
eventData?.type === "resource_change" && eventData?.resourceKind === "spell-reserve" && eventData?.direction === "decrease"
```

### Equipment integrity reaches zero

```js
eventData?.type === "resource_change" && eventData?.resourceKind === "equipment-integrity" && Number(eventData?.before) > 0 && Number(eventData?.after) <= 0
```

## 16. Complete continuous Condition example

```json
{
  "name": "Resource threshold example",
  "type": "condition",
  "img": "icons/svg/down.svg",
  "system": {
    "description": "<p>Active while the resource is below its threshold.</p>",
    "chat_description": "",
    "ref": "",
    "bindingMode": "conditional",
    "when": "Number(actor.system.attributes.fp?.value ?? 0) < (Math.max(1, Number(actor.system.attributes.fp?.final ?? actor.system.attributes.fp?.max ?? 0)) / 3)",
    "triggerOnTurnStartWhileActive": false,
    "effects": [
      {
        "id": "effectlink000001",
        "uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
        "phase": "enter",
        "removeOnConditionEnd": true
      }
    ]
  }
}
```

## 17. Complete event-driven Condition example

```json
{
  "name": "Defense event example",
  "type": "condition",
  "img": "icons/svg/shield.svg",
  "system": {
    "description": "<p>Reacts to a critical failure on a defense.</p>",
    "chat_description": "",
    "ref": "",
    "bindingMode": "conditional",
    "when": "eventData?.type === \"defense_roll\" && eventData?.criticalFailure === true",
    "triggerOnTurnStartWhileActive": false,
    "effects": [
      {
        "id": "effectlink000002",
        "uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
        "phase": "event",
        "removeOnConditionEnd": false
      }
    ]
  }
}
```

## 18. Limitations and security

- `system.when` is JavaScript evaluated on the client. Treat imported content as code and review it before use.
- A trigger should only decide true or false. All mutation belongs in Effect Items and dedicated system mechanisms.
- Foundry objects may change between versions. Prefer the normalized paths and payloads documented here.
- Global events are deduplicated and combat events are coordinated by the primary active GM. Do not implement authority inside the expression.
- A Condition embedded in a world Actor affects that Actor. Do not base persistent mechanics on local UI state, user selection, or `canvas`.
- Movement, Regions, Scene, and time do not yet have a reactive contract in this document.

## 19. AI checklist

- [ ] The Item type is `condition` or `trigger` as intended.
- [ ] The expression is singular, boolean, read-only, and contains no `return`.
- [ ] Every point-in-time trigger filters `eventData.type`.
- [ ] Optional paths use `?.` and `??`.
- [ ] A continuous Condition deliberately uses `enter`, `turnStart`, or `exit`.
- [ ] An event-driven Condition uses `phase: "event"`.
- [ ] `removeOnConditionEnd` matches the intended lifecycle.
- [ ] UUIDs and IDs were supplied, left as explicit placeholders, or converted into local bundle references.
- [ ] The description explains meaning without hiding mechanical assumptions.

## 20. Technical sources

- `template.json`: Condition and Trigger Item models.
- `scripts/main.js`: event emission and processing.
- `module/utils/condition-event-data.mjs`: defense, combat, and ActiveEffect events.
- `module/utils/actor-resource-change.mjs`: Actor resource changes.
- `module/utils/item-resource-change.mjs`: equipment-backed resources and integrity.
- `module/utils/damage-application-event.mjs`: structured damage payload.
- `module/utils/condition-effect-link.mjs`: link phases and normalization.
