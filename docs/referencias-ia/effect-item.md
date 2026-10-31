# AI Reference — GUM Effect Item

[Versão em português](./item-efeito.md)

> Technical reference for producing Effect Item data compatible with the GURPS GUM (Unofficial) system.
>
> Mapping reviewed against GUM `1.4.3-beta`, Foundry VTT minimum 12 and verified 14, on October 14, 2026.

## 1. Purpose of this document

Use this reference when an AI needs to create, review, or explain an Effect Item. The recommended output is a Foundry Item JSON object with `type: "effect"` and a canonical action list in `system.actions`.

When the effect must travel in the same JSON as equipment or a modifier that uses it, also follow the [self-contained bundle format](./self-contained-item-bundle.md). Bundle links use local keys and the importer generates the real UUIDs.

This document describes the current persisted format (`schemaVersion: 2`). Legacy action fields still exist at the root of `system` for compatibility, but new content must not use them as its primary representation.

## 2. Recommended AI output contract

When asked to create an effect:

1. Return valid JSON, without comments inside the JSON.
2. Always use `type: "effect"`.
3. Use `system.schemaVersion: 2`.
4. Store every action in `system.actions`, even when there is only one.
5. Give every action a non-empty ID that is unique within the item. A 16-character alphanumeric string is recommended.
6. Include only fields relevant to the action type, in addition to `id`, `label`, and `type`.
7. Do not invent status IDs, skill/equipment/attack IDs or UUIDs, or macro names. If the user does not provide them, leave the field empty or ask for the identifier.
8. Do not generate `_id`, `folder`, `sort`, `ownership`, or `_stats` unless the import workflow explicitly requires Foundry metadata.
9. Preserve numbers and formulas as strings in expression fields. Examples: `"-2"`, `"1d6"`, `"se(possui(\"Item\"), 2, 0)"`.
10. Explain any assumption that is not encoded in the JSON separately.

## 3. Minimum item structure

```json
{
  "name": "Effect name",
  "type": "effect",
  "img": "icons/svg/aura.svg",
  "system": {
    "description": "<p>Full description.</p>",
    "chat_description": "<p>Chat summary.</p>",
    "ref": "",
    "schemaVersion": 2,
    "conditionStackingMode": "stack",
    "tokenIconPolicy": "auto",
    "duration": {
      "value": 1,
      "unit": "rounds",
      "inCombat": true,
      "isPermanent": false,
      "startMode": "apply",
      "endMode": "turnEnd"
    },
    "resistanceRoll": {
      "isResisted": false,
      "attribute": "ht",
      "modifier": "0",
      "applyOn": "failure",
      "margin": "",
      "mode": "simple",
      "branches": [],
      "chatText": "",
      "skipPromptCard": false,
      "chatVisibility": "owners",
      "requestedPurposeIds": []
    },
    "actions": []
  }
}
```

Fields inherited from the base model (`activationEffects`, `onDamageEffects`, `generalConditions`, `passiveEffects`, `useEventEffects`, and `stateEffectGroups`) are not internal Effect Item settings. They may be omitted when generating an effect; the system model supplies their defaults.

## 4. General fields

| Path | Type | Default | Use |
| --- | --- | --- | --- |
| `name` | string | — | Visible Effect Item name. |
| `type` | string | `effect` | Required document type. |
| `img` | string | Foundry icon | Image used by the item, ActiveEffect, and possibly the token. |
| `system.description` | HTML/string | `""` | Full description. |
| `system.chat_description` | HTML/string | `""` | Summary shown in cards/messages. |
| `system.ref` | string | `""` | Book or rule reference. |
| `system.schemaVersion` | number | `2` | Action structure version. |
| `system.actions` | array | `[]` | Actions performed by the effect. |
| `system.conditionStackingMode` | enum | `stack` | Effect application stacking rule. The field name is retained for compatibility. |
| `system.tokenIconPolicy` | enum | `auto` | Token icon policy. |
| `system.duration` | object | — | Duration of persistent actions. |
| `system.resistanceRoll` | object | — | Optional barrier before application. |

### `conditionStackingMode`

| Value | Meaning |
| --- | --- |
| `stack` | Stacks normally. |
| `unique` | Keeps only one copy of each persistent action from the same Effect Item in the same application domain. The current copy and duration are preserved. |
| `refresh` | Keeps only one copy, but recalculates persistent actions and restarts duration on every new application. |

Instant actions (`resource_change`, `resource_create`, `damage_roll`, `macro`, and `chat`) always run. Direct and Condition applications use separate domains, so they never remove or reuse each other's copies. In the Condition domain, `unique` and `refresh` retain the owner-condition list until the last condition is disabled.

System-managed effects — Item passives, equipment grants, state groups, and status automations — keep the lifecycle of their own mechanisms and do not participate in generic deduplication.

### `tokenIconPolicy`

| Value | Meaning |
| --- | --- |
| `auto` | Temporary effects show an icon; permanent effects hide it. |
| `always` | Always show on the token. |
| `never` | Never show on the token. |

## 5. Actions overview

Every element in `system.actions` has this base:

```json
{
  "id": "a1B2c3D4e5F6g7H8",
  "label": "Action name",
  "type": "attribute"
}
```

`label` identifies the action on the sheet, in effect details, and in the conditional barrier action selector. It does not need to repeat the item name.

Accepted types:

| `type` | Function | Nature |
| --- | --- | --- |
| `attribute` | Attribute/data-path modifier | Persistent |
| `status` | Foundry/GUM status | Persistent |
| `resource_change` | Change an existing resource | Instant |
| `resource_create` | Create/update a resource | Instant |
| `damage_roll` | Roll damage to a card | Instant |
| `roll_modifier` | Generic roll modifier | Persistent |
| `skill_modifier` | Skill modifier | Persistent |
| `combat_modifier` | Combat-mode modifier | Persistent |
| `chat` | Message, optionally with a test | Instant |
| `macro` | Run a macro by name | Instant |
| `flag` | Mechanical `flags.gum` flag | Persistent |

Duration applies to persistent actions. Instant actions run when the effect is applied and do not repeat while the ActiveEffect remains active.

### Instant `damage_roll` action

Creates one damage card for each target receiving the effect. The card retains the target UUID and offers the normal manual damage-application workflow; the action does not reduce HP automatically. Follow-up and fragmentation damage are optional.

```json
{
  "id": "damage0000000001",
  "label": "Spike trap",
  "type": "damage_roll",
  "damage_formula": "2d6+1",
  "damage_type": "imp",
  "damage_nature": "",
  "damage_armor_divisor": 1,
  "damage_follow_up_formula": "1d6",
  "damage_follow_up_type": "tox",
  "damage_follow_up_nature": "",
  "damage_follow_up_armor_divisor": 1,
  "damage_fragmentation_formula": "",
  "damage_fragmentation_type": "",
  "damage_fragmentation_nature": "",
  "damage_fragmentation_armor_divisor": 1,
  "damage_show_prompt": false,
  "roll_visibility": "owners"
}
```

`damage_formula` is required. Formulas accept the same data as ordinary damage, including `thr`/`sw` aliases and the effect's conditional expressions. A secondary component is only rolled when its formula is filled in. `damage_show_prompt: true` opens the adjustment dialog before rolling. `roll_visibility` accepts `public`, `owners`, `target`, or `gm`.

## 6. Multiple selections and collections

The system uses three different formats. Do not mix them.

### Real arrays

- `system.actions`: multiple actions in one Effect Item.
- `roll_modifier_entries`: multiple entries inside a `roll_modifier` action.
- `combat_damage_changes`: multiple damage changes inside a `combat_modifier` action.
- `requestedPurposeIds`: multiple test purposes.
- `resistanceRoll.branches`: multiple conditional outcomes.
- `branches[].actionIds`: multiple action IDs triggered by an outcome.

### CSV strings

The following fields are strings containing comma-separated values. Whitespace is allowed and duplicates are normalized:

- `roll_modifier_entries[].contexts`
- `roll_modifier_entries[].roll_tags`
- `roll_modifier_entries[].target_values`
- `roll_modifier_entries[].source_item_ids`
- `roll_modifier_entries[].source_attack_ids`
- `skill_targets`
- `combat_source_item_ids`
- `combat_source_attack_ids`

Example:

```json
{
  "contexts": "attack_melee, defense_parry",
  "roll_tags": "source.magic, resistance.magic",
  "target_values": "Broadsword, Two-Handed Axe/Mace"
}
```

### Single selection

`statusId`, `category`, `skill_attribute`, `application_side`, `operation`, `value_mode`, and the other enumerated fields accept one value only.

## 7. `attribute` action

Modifies a supported numeric path or formula on the actor.

```json
{
  "id": "attr000000000001",
  "label": "DX penalty",
  "type": "attribute",
  "path": "system.attributes.dx.temp",
  "operation": "ADD",
  "value": "-2",
  "value_mode": "fixed",
  "attribute_chat_visibility": "public"
}
```

| Field | Values/form | Use |
| --- | --- | --- |
| `path` | string | Data path to change. Required. |
| `operation` | `ADD`, `OVERRIDE` | Add/subtract or replace the value. |
| `value` | number or expression string | Evaluated when the effect is applied. |
| `value_mode` | `fixed`, `per_origin_level` | Fixed or multiplied by the origin item level. |
| `attribute_chat_visibility` | `public`, `owners`, `gm`, `none` | Who sees the applied value in chat. |

Visibility:

- `public`: everyone.
- `owners`: actor owners and GMs.
- `gm`: GMs only, as a blind message.
- `none`: do not publish the value.

### Attribute paths supported by the UI

Each key below has three layers:

- `system.attributes.<key>.passive` with `ADD`: passive bonus.
- `system.attributes.<key>.temp` with `ADD`: temporary bonus.
- `system.attributes.<key>.override` with `OVERRIDE`: set/replace value.

Available keys:

- Primary: `st`, `dx`, `iq`, `ht`.
- Secondary: `vont`, `per`, `hp`, `fp`, `mt`.
- Movement/defense: `basic_speed`, `basic_move`, `enhanced_move`, `lifting_st`, `dodge`.
- Senses: `vision`, `hearing`, `tastesmell`, `touch`.
- Basic damage: `thrust_damage`, `swing_damage`, `thrust_damage_alt`, `swing_damage_alt`.

For basic-damage paths, `OVERRIDE` preserves the formula for the future damage roll instead of rolling dice when the effect is applied.

### Damage Resistance by hit location

Format:

```text
system.combat.dr_<layer>.<location>.<damage-type>
```

Layers:

- `passive_mods`: `ADD` on a permanent effect.
- `temp_mods`: `ADD` on a temporary combat effect.
- `overrides`: `OVERRIDE`.

Damage types accepted by the picker: `base`, `cont`, `cort`, `perf`, `pi`, `pi-`, `pi+`, `pi++`, `qmd`, `cor`, `tox`.

Locations depend on the configured body profile. `all` represents all locations; for a specific location, use the real ID supplied by the world/system.

## 8. `status` action

Applies a status configured in the world.

```json
{
  "id": "status0000000001",
  "label": "Stunned",
  "type": "status",
  "statusId": "stunned"
}
```

`statusId` must be the technical ID present in `CONFIG.statusEffects`, not merely the visible name. The catalog is dynamic and may be customized by the world, so an AI must not assume that a translated name is a valid ID. A missing reference is not applied and produces a warning.

## 9. `resource_change` action

Changes an existing resource. The value is added to the current value; use a negative number for cost/damage and a positive number for recovery.

```json
{
  "id": "resourcechange01",
  "label": "Fatigue loss",
  "type": "resource_change",
  "category": "fp",
  "name": "",
  "value": "-2",
  "chat_notice": true,
  "confirm_prompt": false,
  "variable_value": false
}
```

| `category` | Target | Use of `name` |
| --- | --- | --- |
| `hp` | Actor HP | Ignored. |
| `fp` | Actor FP | Ignored. |
| `energy_reserve` | Spell/power energy reserve | Exact reserve name. |
| `combat_tracker` | Combat tracker/meter | Exact tracker name. |
| `item_quantity` | Equipment quantity | Exact item name. |

Other fields:

- `chat_notice`: publishes the change in chat.
- `confirm_prompt`: asks for confirmation before execution.
- `variable_value`: opens an input so the user can replace the value at application time.

The value accepts expressions. Ordinary formulas are evaluated once and shared across targets; actor-dependent conditional expressions are evaluated separately for each target.

## 10. `resource_create` action

Creates or updates a named reserve/tracker.

```json
{
  "id": "resourcecreate01",
  "label": "Create reserve",
  "type": "resource_create",
  "category": "spell_reserve",
  "name": "Temporary Mana",
  "value": "5",
  "max": "5",
  "source": "Magic effect",
  "exists_policy": "ignore",
  "chat_notice": true
}
```

Categories:

- `spell_reserve`: spell energy reserve.
- `power_reserve`: power energy reserve.
- `combat_tracker`: combat tracker/meter.

`name` is required. `value` is the initial value, `max` is the maximum, and `source` identifies the origin for spell/power reserves.

Policies when a resource with the same name already exists:

| Value | Behavior |
| --- | --- |
| `ignore` | Keep the existing resource. |
| `update_max` | Replace only the maximum. |
| `sum_max` | Add `max` to the current maximum. |
| `replace` | Replace the data with the new resource. |
| `restore` | Restore the current value to the existing maximum. |

## 11. `roll_modifier` action

This is the most flexible roll-modifier mode. One action contains one or more entries in `roll_modifier_entries`.

```json
{
  "id": "rollmodifier0001",
  "label": "Circumstantial modifiers",
  "type": "roll_modifier",
  "roll_modifier_entries": [
    {
      "label": "Melee attack penalty",
      "value": "-2",
      "value_mode": "fixed",
      "cap": "",
      "contexts": "attack_melee",
      "application_side": "self",
      "target_kind": "any",
      "target_mode": "all",
      "target_values": "",
      "source_item_ids": "",
      "source_attack_ids": "",
      "roll_tags": "",
      "roll_tag_match": "any",
      "nh_display_mode": "roll_only"
    }
  ]
}
```

### Entry fields

| Field | Form/default | Use |
| --- | --- | --- |
| `label` | string | Modifier text in the roll window. |
| `value` | number/formula/expression | Evaluated for each compatible roll. |
| `value_mode` | `fixed`, `per_origin_level` | Origin-level scaling. |
| `cap` | empty string or number | Skill-level/value cap when applicable. |
| `contexts` | CSV, default `all` | Accepted roll contexts. |
| `application_side` | `self`, `vs_targeter` | Apply to the bearer or to someone targeting the bearer. |
| `target_kind` | string, default `any` | Internal/compatibility field; keep `any` unless a known rule requires otherwise. |
| `target_mode` | string, default `all` | Internal/compatibility field; keep `all` unless a known rule requires otherwise. |
| `target_values` | CSV | Specific skill/target names, IDs, or UUIDs, depending on context. |
| `source_item_ids` | CSV | Allowed source item IDs/UUIDs. |
| `source_attack_ids` | CSV | Allowed attack-mode IDs. |
| `roll_tags` | CSV | Semantic tags that filter the roll purpose. |
| `roll_tag_match` | `any`, `all` | Require at least one tag or all tags. |
| `nh_display_mode` | `roll_only`, `include_in_nh` | Show only on rolls or incorporate into prepared skill level. |

If `roll_tags` is not empty, the system forces `nh_display_mode: "roll_only"`. Targeted modifiers (`vs_targeter`) and data/dice formulas must also remain roll-only.

### Accepted contexts

`all`, `attack`, `attack_melee`, `attack_ranged`, `defense`, `defense_dodge`, `defense_parry`, `defense_block`, `skill`, `spell`, `power`, `sense_vision`, `sense_hearing`, `sense_tastesmell`, `sense_touch`, `check_st`, `skill_st`, `check_dx`, `skill_dx`, `check_iq`, `skill_iq`, `check_ht`, `skill_ht`, `check_per`, `skill_per`, `check_vont`, `skill_vont`.

Use CSV to accept more than one. `all` by itself means every context.

### Accepted tags

The current catalog contains:

- General: `test.resistance`, `test.survival`, `test.sense`.
- Injury/survival: `injury.knockdown_stun`, `injury.knockdown`, `injury.stun.physical`, `recovery.stun.physical`, `injury.stay_conscious`, `recovery.consciousness`, `injury.avoid_death`, `injury.bleeding`, `recovery.natural`, `recovery.crippling`, `resistance.pain`, `resistance.torture`.
- Physical resistance: `resistance.physical`, `resistance.metabolic`, `resistance.poison`, `resistance.disease`, `resistance.infection`, `resistance.addiction`, `resistance.alcohol`, `resistance.paralysis`, `resistance.incapacitation`, `resistance.unconsciousness`, `resistance.nausea`, `resistance.seizure`.
- Mental: `resistance.mental`, `resistance.fear`, `mental.fright_check`, `resistance.intimidation`, `mental.stun.avoid`, `mental.stun.recover`, `mental.self_control`, `resistance.mental_influence`, `resistance.possession`, `mental.concentration`, `resistance.confusion`, `mental.memory`, `mental.memory.memorize`, `mental.memory.recall`, `mental.task.prolonged`, `mental.creativity`.
- Movement: `movement.balance`, `movement.avoid_fall`, `movement.controlled_fall`, `movement.takedown`, `movement.knockback_fall`, `movement.mounted`, `movement.break_free`.
- Environment: `resistance.environmental`, `environment.suffocation`, `environment.exertion`, `environment.heat`, `environment.cold`, `environment.altitude`, `environment.pressure`, `environment.vacuum`, `environment.radiation`, `environment.acceleration`, `environment.sleep_deprivation`, `environment.sleep_rest`, `environment.aging`.
- Senses: `sense.general`, `sense.vision`, `sense.hearing`, `sense.smell_taste`, `sense.smell`, `sense.taste`, `sense.touch`, `sense.detection`.
- Supernatural/sources: `resistance.supernatural`, `resistance.magic`, `resistance.psionic`, `resistance.telepathy`, `resistance.power`, `source.supernatural`, `source.magic`, `source.psionic`, `source.telepathic`, `source.power`.
- Social: `social.reaction`, `social.influence`, `social.resist_deception`, `social.resist_interrogation`, `communication.be_heard`, `social.appear_honest`, `social.fashion`, `social.healthy_appearance`.
- Vectors: `vector.sensory`, `vector.sensory.vision`, `vector.sensory.hearing`, `vector.sensory.smell_taste`, `vector.sensory.smell`, `vector.sensory.taste`, `vector.sensory.touch`, `vector.inhaled`.
- Circumstances: `risk.unnecessary`.

Some tags have a hierarchy: a roll with a specific tag may also satisfy filters for its ancestors. Prefer the most specific tag that describes the case.

## 12. `skill_modifier` action

A structured shortcut for skills.

```json
{
  "id": "skillmodifier001",
  "label": "Specialized training",
  "type": "skill_modifier",
  "skill_scope": "specific",
  "skill_targets": "Broadsword, Saber",
  "skill_attribute": "dx",
  "modifier_value": "1",
  "modifier_value_mode": "fixed",
  "modifier_cap": "",
  "modifier_application_side": "self",
  "modifier_nh_display_mode": "include_in_nh"
}
```

| Field | Values | Use |
| --- | --- | --- |
| `skill_scope` | `all`, `specific`, `attribute` | All skills, a specific list, or skills based on an attribute. |
| `skill_targets` | CSV | Used only with `specific`; accepts recognized names, names with specialization, IDs, or UUIDs. |
| `skill_attribute` | `st`, `dx`, `iq`, `ht`, `per`, `vont` | Used only with `attribute`. |
| `modifier_value` | expression | Bonus/penalty. |
| `modifier_value_mode` | `fixed`, `per_origin_level` | Scaling. |
| `modifier_cap` | string/number | Optional cap. |
| `modifier_application_side` | `self`, `vs_targeter` | Application side. |
| `modifier_nh_display_mode` | `roll_only`, `include_in_nh` | Roll only or displayed skill level. |

`all` affects Skill Item rolls, not generic direct checks using the same attribute.

## 13. `combat_modifier` action

Modifies attack, Parry, Block, and/or damage for combat modes.

```json
{
  "id": "combatmodifier01",
  "label": "Energized weapon",
  "type": "combat_modifier",
  "combat_scope": "specific",
  "combat_source_item_ids": "Item.abc123",
  "combat_source_attack_ids": "swing-01",
  "modifier_application_side": "self",
  "modifier_nh_display_mode": "roll_only",
  "combat_attack_enabled": true,
  "combat_attack_value": "1",
  "combat_attack_value_mode": "fixed",
  "combat_parry_enabled": false,
  "combat_parry_value": "0",
  "combat_parry_value_mode": "fixed",
  "combat_block_enabled": false,
  "combat_block_value": "0",
  "combat_block_value_mode": "fixed",
  "combat_recalculate_parry": false,
  "combat_recalculate_block": false,
  "combat_damage_enabled": true,
  "combat_damage_changes": [
    {
      "component": "main",
      "operation": "extra_dice",
      "value": "1d6",
      "value_mode": "fixed",
      "cap": "",
      "replace_armor_divisor": "",
      "replace_type": "qmd",
      "replace_nature": ""
    }
  ]
}
```

### Scope

| `combat_scope` | Use |
| --- | --- |
| `all` | Every combat mode. |
| `melee` | Melee only. |
| `ranged` | Ranged only. |
| `specific` | Filter through `combat_source_item_ids` and/or `combat_source_attack_ids` CSV strings. |

Preserved filters are ignored while the scope is not `specific`.

### Attack and defenses

- `combat_attack_enabled`, `combat_parry_enabled`, `combat_block_enabled`: enable each component.
- Each component uses `<component>_value` and `<component>_value_mode`.
- `combat_recalculate_parry` and `combat_recalculate_block`: recalculate defense from the modified attack skill instead of directly adding the value.
- `modifier_application_side` and `modifier_nh_display_mode` accept the same values as the skill action.

### Damage changes

`combat_damage_changes` is an array. Each entry contains:

| Field | Values | Use |
| --- | --- | --- |
| `component` | `main`, `follow_up`, `fragmentation` | Main, follow-up, or fragmentation damage. |
| `operation` | `fixed`, `per_die`, `extra_dice`, `override` | Fixed bonus, per-die bonus, extra dice, or formula replacement. |
| `value` | number/formula/expression | Change value. |
| `value_mode` | `fixed`, `per_origin_level` | Scaling. |
| `cap` | string/number | Optional maximum bonus. |
| `replace_armor_divisor` | string | New divisor; empty keeps the current one. |
| `replace_type` | string | New damage type; empty keeps the current one. |
| `replace_nature` | string | New nature; empty keeps the current one. |

Do not use the old `property` field in new content. The three replacements have dedicated fields.

## 14. `chat` action

Publishes a message for each target. `{actor.name}` in the text is replaced with the target actor's name.

```json
{
  "id": "chat000000000001",
  "label": "Recovery check",
  "type": "chat",
  "chat_text": "<p>{actor.name} must make an HT check.</p>",
  "has_roll": true,
  "roll_label": "HT Check",
  "roll_attribute": "ht",
  "roll_modifier": "0",
  "requestedPurposeIds": ["recover_physical_stun"],
  "whisperMode": "public"
}
```

Fields:

- `chat_text`: published HTML/text.
- `has_roll`: includes a test request.
- `roll_label`: test title.
- `roll_attribute`: attribute or test key. Known values: `st`, `dx`, `iq`, `ht`, `per`, `vont`, `vision`, `hearing`, `tastesmell`, `touch`, `dodge`; skill names may also be resolved by the test workflow.
- `roll_modifier`: fixed modifier or formula.
- `requestedPurposeIds`: array of purpose-catalog IDs.
- `whisperMode`: `public`, `gm`, or `blind`. The current sheet does not expose this field directly, but the engine honors it.

## 15. `macro` action

```json
{
  "id": "macro00000000001",
  "label": "Run automation",
  "type": "macro",
  "value": "Exact Macro Name"
}
```

`value` is the exact name of a world macro. The macro receives `{ actor, origin, targets }`. Because macros are external content and may execute code, an AI must never invent or silently create one.

## 16. `flag` action

Creates a property at `flags.gum.<key>` on the ActiveEffect.

```json
{
  "id": "flag000000000001",
  "label": "Ignore shock",
  "type": "flag",
  "key": "ignoreShock",
  "flag_value": "true"
}
```

`flag_value` converts the exact strings `"true"` and `"false"` to booleans. Other values remain strings. The key must be recognized by consuming code; do not invent a flag and expect it to produce mechanics.

## 17. Values and expressions

Numeric action fields accept fixed values, Foundry formulas, numeric JavaScript, and the GUM conditional language.

### Scaling

- `fixed`: uses the supplied value.
- `per_origin_level`: multiplies the value by `system.level` from the item that originated the application. A missing, invalid, or lower-than-1 level is treated as 1.

### Conditional syntax

```text
se(CONDITION, VALUE_IF_TRUE, VALUE_IF_FALSE)
```

Queries use Portuguese function names because these are technical language tokens, not localized labels:

- Items: `possui`, `naopossui`/`nãopossui`, `possuiAlgum`, `possuiTodos`, `equipado`, `nivel`, `quantidade`.
- Actor: `atributo`, `condicaoAtiva`, `status`.
- Logic: `todos`, `algum`, `nao`/`não`.
- Comparisons: `=`, `==`, `!=`, `>`, `>=`, `<`, `<=`.

Examples:

```text
se(possui("Trained by a Master"), -2, -4)
se(nivel("Martial Talent") >= 2, 2, 1)
se(todos(equipado("Sword"), nao(status("stunned"))), 1, 0)
```

Item references may be a name, ID, UUID, or `sourceId`. Names ignore case and accents; use an ID/UUID when duplicate names exist.

Numeric JavaScript exposes `actor`, `game`, `rollData`, and `Math`:

```text
Math.floor(actor.system.attributes.dx.final / 2)
```

An invalid or non-numeric expression is neutralized to `0` and logs a console warning. Dice formulas and targeted modifiers must be evaluated at roll time rather than permanently incorporated into skill level.

## 18. Duration

Duration is only displayed/useful when at least one persistent action exists (`attribute`, `flag`, `roll_modifier`, `skill_modifier`, `combat_modifier`, or `status`).

### Permanent

```json
{
  "value": 1,
  "unit": "rounds",
  "inCombat": false,
  "isPermanent": true,
  "startMode": "apply",
  "endMode": "turnEnd"
}
```

### Temporary in combat

```json
{
  "value": 3,
  "unit": "rounds",
  "inCombat": true,
  "isPermanent": false,
  "startMode": "apply",
  "endMode": "turnEnd"
}
```

| Field | Values | Use |
| --- | --- | --- |
| `value` | integer >= 1 | Number of rounds/turns counted by the system. |
| `unit` | normally `rounds` | Persisted unit; the current sheet handles combat duration in rounds/seconds. |
| `inCombat` | boolean | Count during combat. |
| `isPermanent` | boolean | No automatic expiration. When `true`, use `inCombat: false`. |
| `startMode` | `apply`, `nextTurnStart` | Start on application or at the beginning of the target's next turn. |
| `endMode` | `turnStart`, `turnEnd` | Expire at the beginning or end of the final turn. |

The UI field `_uiMode` does not need to be persisted; it is derived. If included, use `permanent` or `combat` consistently with the booleans.

## 19. Resistance barrier

The barrier requests a test before applying the effect.

### Simple mode

```json
{
  "isResisted": true,
  "attribute": "ht",
  "modifier": "-2",
  "applyOn": "failure",
  "margin": "0",
  "mode": "simple",
  "branches": [],
  "chatText": "Resist the poison.",
  "skipPromptCard": false,
  "chatVisibility": "owners",
  "requestedPurposeIds": ["resist_poison"]
}
```

- `applyOn`: `failure` or `success`.
- `margin`: minimum margin, a non-negative number; empty is equivalent to 0.
- `modifier`: fixed modifier or test formula.
- `chatVisibility`: `public` (everyone), `owners` (target and GM), or `target` (target only; falls back to GMs if no valid recipient exists).
- `skipPromptCard`: skip the preliminary card when `true`.
- `requestedPurposeIds`: array of IDs, not CSV.

### Conditional mode

`conditional` mode selects action subsets according to the outcome. All matching `outcome` branches are combined; if none match, at most one `otherwise` branch is used.

```json
{
  "isResisted": true,
  "attribute": "ht",
  "modifier": "0",
  "applyOn": "failure",
  "margin": "",
  "mode": "conditional",
  "branches": [
    {
      "id": "branchFailure001",
      "label": "Ordinary failure",
      "condition": {
        "type": "outcome",
        "outcome": "failure",
        "minimumMargin": 0,
        "maximumMargin": 4
      },
      "actionIds": ["attr000000000001"]
    },
    {
      "id": "branchBadFail01",
      "label": "Failure by 5 or more",
      "condition": {
        "type": "outcome",
        "outcome": "failure",
        "minimumMargin": 5,
        "maximumMargin": null
      },
      "actionIds": ["attr000000000001", "status0000000001"]
    },
    {
      "id": "branchOtherwise1",
      "label": "No consequence",
      "condition": {
        "type": "otherwise",
        "outcome": "failure",
        "minimumMargin": 0,
        "maximumMargin": null
      },
      "actionIds": []
    }
  ],
  "chatText": "Make the resistance roll.",
  "skipPromptCard": false,
  "chatVisibility": "owners",
  "requestedPurposeIds": []
}
```

Rules:

- `condition.type`: `outcome` or `otherwise`.
- `condition.outcome`: `success` or `failure`; ignored for `otherwise`.
- `minimumMargin`: non-negative number.
- `maximumMargin`: `null` for no limit; if lower than the minimum, the normalizer raises it to the minimum.
- `actionIds`: array of IDs that exist in `system.actions`.
- Only one `otherwise` branch is retained, and it is sorted last.
- When an action is removed through the sheet, its ID is removed from branches.

## 20. Test purposes (`requestedPurposeIds`)

Purposes are semantic IDs used by `chat` action tests and the resistance barrier. They may be combined in an array; normally use one primary purpose plus source/vector/circumstance qualifiers when needed.

Current catalog by group:

- General: `general`.
- Survival: `knockdown_stun`, `recover_physical_stun`, `consciousness`, `regain_consciousness`, `death`, `resist_bleeding`, `natural_recovery`, `crippling_recovery`, `pain`, `resist_torture`.
- Resistances: `resist_metabolic_hazard`, `resist_poison`, `resist_disease`, `resist_infection`, `resist_paralysis`, `resist_incapacitation`, `resist_unconsciousness`, `resist_nausea`, `resist_seizure`, `resist_addiction`, `resist_alcohol`.
- Mental: `fright_check`, `resist_fear`, `resist_intimidation`, `avoid_mental_stun`, `recover_mental_stun`, `self_control`, `resist_mental_influence`, `resist_possession`, `maintain_concentration`, `resist_confusion`, `memorize`, `recall_information`, `prolonged_mental_task`, `creativity`.
- Movement: `maintain_balance`, `avoid_fall`, `controlled_fall`, `resist_takedown`, `resist_knockback_fall`, `stay_mounted`, `break_free`.
- Environment: `resist_suffocation`, `resist_exertion`, `resist_heat`, `resist_cold`, `resist_altitude`, `resist_pressure`, `resist_vacuum`, `resist_radiation`, `resist_acceleration`, `resist_sleep_deprivation`, `sleep_rest`, `aging_check`.
- Senses: `sense_general`, `sense_vision`, `sense_hearing`, `sense_taste_smell`, `sense_smell`, `sense_taste`, `sense_touch`, `sense_detection`.
- Source qualifiers: `resist_magic`, `resist_psionic`, `resist_supernatural_power`, `resist_power`, `resist_telepathy`.
- Vector qualifiers: `sensory_vector_vision`, `sensory_vector_hearing`, `sensory_vector_smell`, `sensory_vector_taste`, `sensory_vector_touch`, `sensory_vector_smell_taste`, `inhaled_agent`.
- Social: `reaction_roll`, `influence_roll`, `resist_deception`, `resist_interrogation`, `be_heard`, `appear_honest`, `fashion_context`, `healthy_appearance`.
- Circumstance: `unnecessary_risk`.

Combination example:

```json
{
  "requestedPurposeIds": ["resist_mental_influence", "resist_telepathy"]
}
```

Do not put tags (`resistance.telepathy`) in `requestedPurposeIds`; purposes and tags are separate catalogs.

## 21. Complete multi-action example

```json
{
  "name": "Debilitating Poison",
  "type": "effect",
  "img": "icons/consumables/potions/bottle-bulb-corked-green.webp",
  "system": {
    "description": "<p>A poison that reduces HT and causes nausea when resistance fails.</p>",
    "chat_description": "<p>Make an HT roll to resist.</p>",
    "ref": "",
    "schemaVersion": 2,
    "conditionStackingMode": "stack",
    "tokenIconPolicy": "auto",
    "duration": {
      "value": 3,
      "unit": "rounds",
      "inCombat": true,
      "isPermanent": false,
      "startMode": "apply",
      "endMode": "turnEnd"
    },
    "resistanceRoll": {
      "isResisted": true,
      "attribute": "ht",
      "modifier": "0",
      "applyOn": "failure",
      "margin": "0",
      "mode": "simple",
      "branches": [],
      "chatText": "Resist the poison.",
      "skipPromptCard": false,
      "chatVisibility": "owners",
      "requestedPurposeIds": ["resist_poison"]
    },
    "actions": [
      {
        "id": "PoisonHtPenalty1",
        "label": "HT reduction",
        "type": "attribute",
        "path": "system.attributes.ht.temp",
        "operation": "ADD",
        "value": "-2",
        "value_mode": "fixed",
        "attribute_chat_visibility": "public"
      },
      {
        "id": "PoisonNausea001",
        "label": "Nausea",
        "type": "status",
        "statusId": "nausea"
      },
      {
        "id": "PoisonChat00001",
        "label": "Notice",
        "type": "chat",
        "chat_text": "<p>{actor.name} was affected by the poison.</p>",
        "has_roll": false
      }
    ]
  }
}
```

Note: `nausea` is illustrative only; confirm the world's actual `statusId` before use.

## 22. Validation before delivering JSON

An AI should verify:

- [ ] `type` is `effect`.
- [ ] `system.schemaVersion` is `2`.
- [ ] `system.actions` is an array.
- [ ] Every `action.id` is unique and non-empty.
- [ ] Every `action.type` belongs to the ten-type catalog.
- [ ] Arrays and CSV strings are used in the correct fields.
- [ ] `value_mode` is only `fixed` or `per_origin_level`.
- [ ] Status, action, item, attack, macro, and purpose IDs were not invented.
- [ ] `branches[].actionIds` points to existing actions.
- [ ] There is no more than one `otherwise` branch.
- [ ] A permanent effect uses `isPermanent: true` and `inCombat: false`.
- [ ] Instant actions do not rely on duration to repeat.
- [ ] `include_in_nh` is not used with dice, tags, or `vs_targeter` application.
- [ ] Formulas and HTML are correctly escaped as JSON.

## 23. Legacy and compatibility fields

The model still mirrors the first action into root fields such as `system.type`, `system.path`, `system.operation`, `system.value`, `system.roll_modifier_*`, `system.category`, and others. This allows old content to open, but `system.actions` is the current canonical source.

Historical aliases also exist inside actions, including singular roll-modifier fields and the old `combat_damage_changes[].property`. The normalizer can migrate some of them, but AI-generated content must use:

- `system.actions` instead of a root-level action;
- `roll_modifier_entries[]` instead of singular `roll_modifier_value`, `roll_modifier_context`, and related fields;
- `combat_damage_changes[]` with `replace_armor_divisor`, `replace_type`, and `replace_nature` instead of `property`.

## 24. Scope and limitations

- Statuses are configurable per world and must be queried in the target environment.
- Macros, item IDs/UUIDs, specializations, attacks, and body locations also depend on the world/actor.
- This document describes the structure accepted by the system, but does not create an import API. A future implementation must decide whether JSON is pasted, imported, received by a macro, or sent through an API.
- Catalogs may change in later versions; update the version at the top when the effect model, sheet, or engine changes.

## 25. Technical sources used for this mapping

- `template.json`: Effect Item model and defaults.
- `templates/items/effect-sheet.hbs`: all visible controls and option values.
- `scripts/apps/effect-sheet.js`: normalization, persistence, arrays, CSV strings, and compatibility.
- `scripts/effects-engine.js`: execution of all ten actions, duration, and ActiveEffect creation.
- `module/apps/effect-path-picker.mjs`: supported paths and localized DR.
- `module/utils/effect-value-expression.mjs`: conditional language.
- `module/utils/effect-value-scaling.mjs`: per-level scaling.
- `module/utils/roll-request-data.mjs`: resistance barrier and conditional branches.
- `module/utils/roll-purposes.mjs`: purpose catalog.
- `module/utils/roll-tags.mjs`: tag catalog and hierarchy.
- `module/utils/requested-attributes.mjs`: known test attributes.
- `module/utils/effect-chat-visibility.mjs`: message privacy.
- `docs/effect-value-expressions.md`: existing expression guide.
- Automated effect tests under `tests/`.
