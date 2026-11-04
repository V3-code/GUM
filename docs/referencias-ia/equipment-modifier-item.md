# AI Reference — GUM Equipment Modifier Item

[Versão em português](./item-modificador-equipamento.md)

> Technical reference for producing Equipment Modifier Item data compatible with the unofficial GUM system.
>
> Mapping verified against GUM `1.4.3-beta`, Foundry VTT minimum 12 and verified 14, on October 14, 2026.

## 1. Purpose

Use this reference when an AI must create, review, or explain an Equipment Modifier Item. The recommended output is a Foundry Item JSON object with `type: "eqp_modifier"`.

An Equipment Modifier has two independent layers:

1. **Cost and weight adjustments** in `cost_adjustment_data` and `weight_adjustment_data`.
2. **Mechanical features** in `features_data`, which change equipment properties, DR, attacks, ammunition, or grant an Effect Item.

The Item is a reusable source. When attached to equipment, its data is copied into the equipment's `system.eqp_modifiers` collection and resolved with its other modifiers.

To transport the modifier, equipment, and their effects in one JSON file, use the [self-contained bundle format](./self-contained-item-bundle.md). It accepts `modifierRef` on equipment and `effectRef` in `granted_effect` features.

## 2. Recommended AI output contract

When creating a modifier:

1. Return valid JSON with no comments inside it.
2. Always use `type: "eqp_modifier"`.
3. Use `system.adjustment_schema: 1`.
4. Store structured adjustments in `cost_adjustment_data` and `weight_adjustment_data`.
5. Store features in `system.features_data` as an **object keyed by feature ID**, never as text and preferably not as an array.
6. Give every feature a short, non-empty, unique `id`; its object key must equal its `id`.
7. Include only fields relevant to that feature type.
8. Explicitly use `enabled: true` on the modifier and active features.
9. Never invent Effect Item UUIDs or body-location IDs. Leave them empty or request the real identifier when necessary.
10. Do not generate `_id`, `folder`, `sort`, `ownership`, or `_stats` unless an import workflow requires them.
11. Explain assumptions, broad selectors, or intentional conflicts outside the JSON.

## 3. Minimum structure

```json
{
  "name": "Modifier name",
  "type": "eqp_modifier",
  "img": "icons/svg/upgrade.svg",
  "system": {
    "description": "<p>Full description.</p>",
    "chat_description": "",
    "ref": "",
    "group": "",
    "tech_level": "",
    "enabled": true,
    "level": 1,
    "points": 0,
    "adjustment_schema": 1,
    "cost_adjustment": "0 CF",
    "cost_factor": 0,
    "weight_mod": "x1",
    "cost_adjustment_data": {
      "expression": "0 CF",
      "stage": "base",
      "per_level": false,
      "per_weight": false,
      "per_weight_unit": "kg"
    },
    "weight_adjustment_data": {
      "expression": "x1",
      "stage": "base",
      "per_level": false
    },
    "features_data": {},
    "gcs_features_unmapped": [],
    "scenario": {
      "rarity": "",
      "location": "",
      "availability": "",
      "components": ""
    }
  }
}
```

`cost_adjustment` and `weight_mod` are legacy mirrors of the structured expressions. Keeping them synchronized improves interoperability. `cost_factor` is a useful numeric mirror when the expression uses CF. The current primary source is the `*_adjustment_data` objects.

## 4. General fields

| Path | Type | Default | Use |
| --- | --- | --- | --- |
| `name` | string | — | Visible name. |
| `type` | string | `eqp_modifier` | Required document type. |
| `img` | string | icon | Item image. |
| `system.description` | HTML/string | `""` | Full description. |
| `system.chat_description` | HTML/string | `""` | Chat summary. |
| `system.ref` | string | `""` | Rules reference. |
| `system.group` | string | `""` | Free-form organizational group. |
| `system.tech_level` | string | `""` | Associated TL. |
| `system.enabled` | boolean | `true` | Default state when attached/applied. |
| `system.level` | number ≥ 0 | `1` | Modifier level; scales `per_level` fields. |
| `system.points` | integer | `0` | Informational point value. |
| `system.features_data` | object | `{}` | Keyed feature collection. |
| `system.gcs_features_unmapped` | array | `[]` | Imported GCS data that could not be mapped; an AI should not invent it. |
| `system.scenario.*` | string | `""` | Narrative rarity, location, availability, and components. |

`tech_level_mod` exists for compatibility/import purposes, but new content should prefer `tech_level`.

## 5. Cost and weight adjustments

### 5.1 Structure

```json
{
  "cost_adjustment_data": {
    "expression": "+1 CF",
    "stage": "base",
    "per_level": true,
    "per_weight": false,
    "per_weight_unit": "kg"
  },
  "weight_adjustment_data": {
    "expression": "-10%",
    "stage": "original",
    "per_level": false
  }
}
```

Accepted stages, processed in this order:

| `stage` | Timing |
| --- | --- |
| `original` | Applied to the original value. |
| `base` | Builds the base value. |
| `final_base` | Applied after the base value. |
| `final` | Final unit adjustment. |

Equipment quantity is applied only after the final per-unit value.

### 5.2 Accepted expressions

| Example | Meaning |
| --- | --- |
| `+1 CF`, `-0.5 CF` | Cost factor; cost only. |
| `x2`, `*1/2` | Multiplier. Fractions are accepted. |
| `+20%`, `-10%` | Percentage increase/reduction. |
| `x150%`, `*1/2%` | Percentage multiplier. |
| `+50`, `-10` | Fixed cost amount. |
| `+1 kg`, `-500 g`, `+2 lb`, `-4 oz` | Fixed weight converted to the active unit. |

Compatibility rules:

- Cost at `base`: use CF or multiplication. A multiplier is converted to equivalent CF; cumulative CF has a lower bound of `-0.8`.
- Weight at `original`: use a fixed amount or percentage.
- Weight at other stages: fixed amount, multiplication, or percentage multiplier.
- Cost outside `base`: fixed amount, multiplication, or percentage.
- Incompatible operations are not silently reinterpreted; resolution emits a warning.

`per_level: true` scales an adjustment by modifier level. Level `0` nullifies that contribution. `per_weight` is cost-only and scales the contribution by final unit weight in `kg` or `lb`.

## 6. Multiple features and resolution order

`features_data` is a map. To store multiple features, create multiple sibling properties:

```json
{
  "features_data": {
    "quality": {
      "id": "quality",
      "label": "Fine quality",
      "type": "equipment_property",
      "enabled": true,
      "path": "quality",
      "operation": "add",
      "value": "Fine"
    },
    "accuracy": {
      "id": "accuracy",
      "label": "Accuracy",
      "type": "attack_property",
      "enabled": true,
      "attack_type": "ranged",
      "selector_field": "all",
      "selector_value": "",
      "path": "accuracy",
      "operation": "add",
      "value": 1,
      "per_level": true
    }
  }
}
```

Common base:

```json
{
  "id": "feature-id",
  "label": "Readable name",
  "type": "equipment_property",
  "enabled": true
}
```

Disabled features and `per_level` features on a level-zero modifier are ignored. Attack/ammunition creation resolves first. Other operations have deterministic precedence: `set`, then `multiply`, then `add`, ordered by modifier ID and feature ID. Multiple `set` operations on the same target emit a warning; the last in that order wins.

Accepted types:

| `type` | Function |
| --- | --- |
| `equipment_property` | Changes an equipment property. |
| `equipment_descriptor` | Adds a structured narrative descriptor. |
| `equipment_dr` | Changes DR by body location/damage type. |
| `attack_property` | Changes existing or newly created attacks. |
| `attack_damage` | Defines follow-up or fragmentation damage. |
| `create_attack` | Creates an attack mode. |
| `create_ammunition` | Creates/replaces the ammunition profile. |
| `ammunition_property` | Changes part of the ammunition profile. |
| `granted_effect` | Links an Effect Item to the equipment. |

## 7. `equipment_property`

```json
{
  "id": "reinforced",
  "label": "Reinforced structure",
  "type": "equipment_property",
  "enabled": true,
  "path": "item_hp",
  "operation": "add",
  "value": 2,
  "per_level": true
}
```

| `path` | Value | Notes |
| --- | --- | --- |
| `tech_sm` | number | Technological size modifier. |
| `item_hp` | number | Item HP. |
| `item_ht` | number | Item HT. |
| `item_dr` | number | General DR. |
| `holdout` | number | Holdout/concealability. |
| `defense_bonus` | number | Defense bonus. |
| `equip_time` | number | Time to equip. |
| `max_uses` | number | Maximum charges/uses. |
| `legality_class` | string/number | Legality class. |
| `material` | string | Material. |
| `quality` | string | Quality. |

`operation`: `add`, `multiply`, or `set`. For `material` and `quality`, use only `add` or `set`: `add` appends distinct comma-separated text; `set` replaces it. `per_level` is supported.

With `path: "max_uses"`, these optional fields also control reserve presentation:

| Field | Values |
| --- | --- |
| `reserve_type` | `""` (inherit), `none`, `combat`, `power`, `spell` |
| `reserve_name` | free text |
| `reserve_scope` | `""` (inherit), `any`, `carried`, `equipped`, `stored`, `active` |

## 8. `equipment_descriptor`

Adds descriptive metadata without replacing the main description.

```json
{
  "id": "elven-origin",
  "label": "Elven origin",
  "type": "equipment_descriptor",
  "enabled": true,
  "descriptor_kind": "origin",
  "value": "Elven craftsmanship"
}
```

`descriptor_kind`: `appearance`, `craftsmanship`, `material`, `origin`, `tag`, or `note`. Descriptors accumulate and retain their source. An empty value emits a warning. This type does not use `operation` or `per_level`.

## 9. `equipment_dr`

```json
{
  "id": "torso-dr",
  "label": "Torso reinforcement",
  "type": "equipment_dr",
  "enabled": true,
  "location": "torso",
  "damage_type": "base",
  "operation": "add",
  "value": 2,
  "per_level": false
}
```

- `location`: `all` or a real ID from the active body-location profile.
- `damage_type`: `base` or a campaign damage-type key.
- `operation`: `add`, `multiply`, or `set`.
- `value`: number; `per_level` is supported.

`all` changes only locations already present on the equipment. The resolver may create a specifically named location. If nothing matches, it emits a warning. Do not assume an ID such as `torso`; verify the world's body-location profile when a specific location matters.

## 10. Attack selectors

`attack_property`, `attack_damage`, and attack domains of `granted_effect` use:

| Field | Values |
| --- | --- |
| `attack_type` | `all`, `melee`, `ranged`; `granted_effect` also accepts `none` |
| `selector_field` | `all`, `group`, `mode`, `skill_name` |
| `selector_value` | exact case-insensitive comparison text |

For `group`, each member of the attack's comma-separated group list is compared separately. `selector_field: "all"` or an empty filter matches every attack of the chosen type. To target an attack created by the same feature collection, give it a unique group and select that group.

## 11. `attack_property`

```json
{
  "id": "scope-accuracy",
  "label": "Precision scope",
  "type": "attack_property",
  "enabled": true,
  "attack_type": "ranged",
  "selector_field": "group",
  "selector_value": "rifle",
  "path": "accuracy",
  "operation": "add",
  "value": 2,
  "per_level": false
}
```

Accepted properties:

| Class | `path` | Recommended operations |
| --- | --- | --- |
| Formula | `damage_formula` | `add`, `set` |
| Text | `damage_type`, `damage_nature`, `reach`, `range`, `rof`, `shots`, `groups` | `set` |
| Numeric | `armor_divisor`, `skill_level_mod`, `min_strength`, `accuracy`, `rcl`, `mag` | `add`, `multiply`, `set` |
| Defense | `parry`, `block` | prefer `set`; use arithmetic only when the base value is numeric |

For `damage_formula`, `add` appends a numeric modifier to the formula; do not use `multiply`. `per_level` is supported. Incompatible operations emit a warning.

## 12. `attack_damage`

Fully defines a secondary damage component on selected attacks:

```json
{
  "id": "explosive-fragments",
  "label": "Fragments",
  "type": "attack_damage",
  "enabled": true,
  "attack_type": "ranged",
  "selector_field": "group",
  "selector_value": "explosive",
  "damage_slot": "fragmentation_damage",
  "damage": {
    "formula": "1d-1",
    "type": "cut",
    "nature": "",
    "armor_divisor": 1,
    "scaling": ""
  }
}
```

`damage_slot`: `follow_up_damage` or `fragmentation_damage`. The feature replaces the complete component and does not use `operation` or `per_level`. Multiple replacements of the same component emit a warning.

## 13. `create_attack`

### Melee

```json
{
  "id": "bayonet",
  "label": "Bayonet",
  "type": "create_attack",
  "enabled": true,
  "attack_type": "melee",
  "attack": {
    "mode": "Bayonet thrust",
    "skill_name": "Polearm",
    "skill_level_mod": 0,
    "damage_formula": "thr+1",
    "damage_type": "imp",
    "damage_nature": "",
    "armor_divisor": 1,
    "min_strength": 10,
    "groups": "bayonet, weapon-addon",
    "reach": "1",
    "parry": "0",
    "block": "0",
    "parry_default": true,
    "block_default": true
  }
}
```

### Ranged

```json
{
  "id": "launcher",
  "label": "Integrated launcher",
  "type": "create_attack",
  "enabled": true,
  "attack_type": "ranged",
  "attack": {
    "mode": "Integrated grenade",
    "skill_name": "Guns",
    "skill_level_mod": -1,
    "damage_formula": "3d",
    "damage_type": "cr ex",
    "damage_nature": "",
    "armor_divisor": 1,
    "min_strength": 10,
    "groups": "explosive, integrated-launcher",
    "accuracy": 2,
    "range": "100/1500",
    "rof": "1",
    "shots": "1",
    "rcl": 1,
    "mag": 1
  }
}
```

The attack ID is derived automatically as `eqpmod_<modifierId>_<featureId>`; do not provide `attack.id`. Created attacks resolve before `attack_property` and `attack_damage`. This feature does not use `operation` or `per_level`.

## 14. `create_ammunition`

```json
{
  "id": "special-ammo",
  "label": "Special ammunition",
  "type": "create_ammunition",
  "enabled": true,
  "ammunition": {
    "enabled": true,
    "attack_modifier": 0,
    "low_warning": 3,
    "main": {
      "formula": "+1",
      "operation": "add",
      "type": "",
      "nature": "",
      "armor_divisor": 1,
      "divisor_operation": "replace"
    },
    "follow_up": {
      "formula": "",
      "operation": "replace",
      "type": "",
      "nature": "",
      "armor_divisor": 1,
      "divisor_operation": "replace"
    },
    "fragmentation": {
      "formula": "",
      "operation": "replace",
      "type": "",
      "nature": "",
      "armor_divisor": 1,
      "divisor_operation": "replace"
    }
  }
}
```

Each component (`main`, `follow_up`, `fragmentation`) accepts `operation` and `divisor_operation`: `replace`, `add`, or `multiply`. More than one active `create_ammunition` causes a conflict warning; the last in deterministic order wins. It does not use `per_level`.

## 15. `ammunition_property`

```json
{
  "id": "ammo-penetration",
  "label": "Armor-piercing ammunition",
  "type": "ammunition_property",
  "enabled": true,
  "path": "main.armor_divisor",
  "operation": "multiply",
  "value": 2,
  "per_level": false
}
```

Accepted `path` values:

- `enabled`, `attack_modifier`, `low_warning`.
- For each of `main`, `follow_up`, and `fragmentation`: `.formula`, `.operation`, `.type`, `.nature`, `.armor_divisor`, `.divisor_operation`.

Rules:

- `enabled`: `set` with a boolean or `"true"`/`"false"`.
- `.operation` and `.divisor_operation`: `set` with `replace`, `add`, or `multiply`.
- `.type` and `.nature`: `set`.
- `attack_modifier`, `low_warning`, and `.armor_divisor`: `add`, `multiply`, or `set`; `low_warning` is clamped to zero or above and a divisor must be greater than zero.
- `.formula`: `set`, `add`, or `multiply`; the latter two combine formulas.
- `per_level` is valid only for numeric values.

## 16. `granted_effect`

Links a real Effect Item. See the [Effect Item reference](./effect-item.md) as well.

```json
{
  "id": "protective-aura",
  "label": "Protective aura",
  "type": "granted_effect",
  "enabled": true,
  "effect_uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
  "effect_name": "Protective aura",
  "effect_img": "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
  "effect_domain": "wearer",
  "lifecycle": "while_equipped"
}
```

`effect_uuid` is required in the persisted Item and must resolve to an existing Effect Item. `effect_name` and `effect_img` are auxiliary metadata. Never invent the UUID. In a self-contained bundle that has not been imported yet, use `effectRef` as documented in the bundle reference; the importer produces all three fields.

Domains:

| `effect_domain` | Behavior |
| --- | --- |
| `wearer` | Synchronizes persistent Effect Item actions onto the actor; instant actions are skipped and duration remains permanent while the lifecycle is active. |
| `source_attack` | Applies compatible persistent roll/skill/combat actions scoped to the equipment and selected attacks. |
| `hit_target` | Inserts the Effect Item into selected attacks' `onDamageEffects`. |

Lifecycles:

| `lifecycle` | Active while… |
| --- | --- |
| `while_possessed` | the actor owns the equipment. |
| `while_carried` | it is carried or equipped. |
| `while_equipped` | it is equipped. Default. |
| `while_active` | the equipment is active/switched on. |

For `source_attack` and `hit_target`, also use the selectors in section 10. `hit_target` accepts:

- `min_injury`: minimum injury, number ≥ 0; default `0`.
- `activation_chance`: percentage from 0 to 100; default `100`.
- `required_damage_type`: required damage type; empty accepts any type.

This feature does not use `operation` or `per_level`.

## 17. Complete example

```json
{
  "name": "Superior Quality",
  "type": "eqp_modifier",
  "img": "icons/skills/trades/smithing-anvil-silver-red.webp",
  "system": {
    "description": "<p>Lighter, tougher, and more precise construction.</p>",
    "chat_description": "<p>Superior quality.</p>",
    "ref": "Campaign rule",
    "group": "Quality",
    "tech_level": "",
    "enabled": true,
    "level": 1,
    "points": 0,
    "adjustment_schema": 1,
    "cost_adjustment": "+3 CF",
    "cost_factor": 3,
    "weight_mod": "-10%",
    "cost_adjustment_data": {
      "expression": "+3 CF",
      "stage": "base",
      "per_level": false,
      "per_weight": false,
      "per_weight_unit": "kg"
    },
    "weight_adjustment_data": {
      "expression": "-10%",
      "stage": "original",
      "per_level": false
    },
    "features_data": {
      "fine-quality": {
        "id": "fine-quality",
        "label": "Fine quality",
        "type": "equipment_property",
        "enabled": true,
        "path": "quality",
        "operation": "add",
        "value": "Superior",
        "per_level": false
      },
      "durability": {
        "id": "durability",
        "label": "Durability",
        "type": "equipment_property",
        "enabled": true,
        "path": "item_hp",
        "operation": "add",
        "value": 2,
        "per_level": true
      },
      "precision": {
        "id": "precision",
        "label": "Precision",
        "type": "attack_property",
        "enabled": true,
        "attack_type": "all",
        "selector_field": "all",
        "selector_value": "",
        "path": "skill_level_mod",
        "operation": "add",
        "value": 1,
        "per_level": false
      }
    },
    "gcs_features_unmapped": [],
    "scenario": {
      "rarity": "Uncommon",
      "location": "Specialist armorers",
      "availability": "Made to order",
      "components": "High-quality materials"
    }
  }
}
```

## 18. Pre-delivery validation

- [ ] `type` is exactly `eqp_modifier`.
- [ ] `adjustment_schema` is `1`.
- [ ] Cost/weight expressions and stages are compatible.
- [ ] `per_weight` appears only on the cost adjustment.
- [ ] `features_data` is an object and every key equals its `feature.id`.
- [ ] Feature IDs are unique.
- [ ] Every `type`, `path`, `operation`, domain, and lifecycle belongs to a valid list.
- [ ] Fields exclusive to another feature type have been omitted.
- [ ] Broad selectors (`all` or empty filters) are intentional.
- [ ] `per_level` is used only where supported.
- [ ] Body locations and UUIDs were verified, not invented.
- [ ] There are no unintended competing `set` operations, complete damage replacements, or ammunition profiles.
- [ ] The JSON is syntactically valid and contains no comments.

## 19. Operational summary for another AI

> Generate a Foundry Item with `type: "eqp_modifier"` and `system.adjustment_schema: 1`. Represent cost and weight with the structured objects while keeping legacy mirrors synchronized. Store multiple capabilities as properties of `system.features_data`, with matching unique key and `id`. Choose exactly one of the nine feature types and only its valid fields. Never invent UUIDs or location IDs. Account for creation → set → multiply → add resolution order and disclose broad selectors or competing replacements.
