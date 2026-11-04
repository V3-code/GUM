# AI Reference — GUM Equipment Item

[Versão em português](./item-equipamento.md)

> Technical reference for producing Equipment Item data compatible with the unofficial GUM system.
>
> Mapping verified against GUM `1.4.3-beta`, Foundry VTT minimum 12 and verified 14, on October 14, 2026.

## 1. Purpose

Use this reference when an AI must create, review, or explain an Equipment Item. The recommended output is a Foundry Item JSON object with `type: "equipment"`.

When equipment depends on Effects, Conditions, or Modifiers that must be imported with it, use the [self-contained bundle format](./self-contained-item-bundle.md). It replaces the need for pre-existing UUIDs with safe local references during import.

Equipment can combine:

- economic, physical, technological, and integrity data;
- quantity-based or charge-based consumption;
- containers and inventory location;
- general protection and DR by body location;
- multiple melee and ranged attacks;
- an ammunition profile;
- multiple attached Equipment Modifiers;
- links to Effect Items and Condition Items.

## 2. Recommended AI output contract

1. Return valid JSON with no comments inside it.
2. Always use `type: "equipment"`.
3. Store attacks and modifiers as objects keyed by ID; the key should equal the entry's `id` when that field exists.
4. Use unique, stable IDs within the item. A 16-character alphanumeric sequence is recommended for attacks and links.
5. Treat `cost`, `weight`, and other editable properties as base values. Do not overwrite them with modifier-resolved results.
6. Do not persist `equipmentResolution`, final values, calculation traces, warnings, or attacks created by the resolver; they are runtime-derived data.
7. Never invent Effect/Condition UUIDs, body-location IDs, ammunition item IDs, or container IDs.
8. In a library/compendium item, leave actor-dependent references — `parent_container_id` and `ammunition_ids` — empty.
9. Do not generate `_id`, `folder`, `sort`, `ownership`, or `_stats` unless an import workflow requires them.
10. Explain assumptions, broad selectors, and references that must be filled later outside the JSON.

## 3. Recommended base structure

```json
{
  "name": "Equipment name",
  "type": "equipment",
  "img": "icons/svg/item-bag.svg",
  "system": {
    "description": "<p>Full description.</p>",
    "chat_description": "",
    "favorite_in_combat": false,
    "ref": "",
    "quantity": 1,
    "level": "",
    "points": 0,
    "cost": 0,
    "weight": 0,
    "location": "carried",
    "is_container": false,
    "container": {
      "max_weight": 0,
      "dimensions_cm": {
        "width": 0,
        "height": 0,
        "depth": 0
      }
    },
    "parent_container_id": "",
    "tech_level": "3",
    "tech_sm": 0,
    "legality_class": "4",
    "material": "",
    "quality": "",
    "item_hp": 0,
    "item_hp_current": 0,
    "item_ht": 12,
    "item_dr": 0,
    "integrity_record_enabled": false,
    "holdout": 0,
    "defense_bonus": 0,
    "defense_bonus_active": false,
    "equip_time": 1,
    "max_uses": 0,
    "current_uses": 0,
    "uses_mode": "quantity",
    "charge_reserve_type": "",
    "charge_reserve_name": "",
    "charge_reserve_scope": "any",
    "consume_quantity_when_empty": false,
    "descriptors": [],
    "dr_locations": {},
    "melee_attacks": {},
    "ranged_attacks": {},
    "ammunition": {
      "enabled": false,
      "attack_modifier": 0,
      "low_warning": 0,
      "main": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "follow_up": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "fragmentation": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      }
    },
    "eqp_modifiers": {},
    "activationEffects": {
      "success": {},
      "failure": {}
    },
    "onDamageEffects": {},
    "generalConditions": {},
    "passiveEffects": {},
    "useEventEffects": {},
    "stateEffectGroups": {}
  }
}
```

Empty collections may be omitted when the system model is applied automatically. For portable, self-describing JSON, the structure above is preferred.

## 4. General and physical fields

| Path | Type | Default | Use |
| --- | --- | --- | --- |
| `name` | string | — | Visible name. |
| `type` | string | `equipment` | Required document type. |
| `img` | string | icon | Item image. |
| `system.description` | HTML/string | `""` | Full description. |
| `system.chat_description` | HTML/string | `""` | Chat summary. |
| `system.favorite_in_combat` | boolean | `false` | Highlights the item in combat interfaces. |
| `system.ref` | string | `""` | Book/rules reference; the UI accepts multiple comma-separated codes. |
| `system.quantity` | number | `1` | Number of units. Use a non-negative value. |
| `system.level` | string/number | `""` | Informational equipment level. |
| `system.points` | number | `0` | Informational point value. |
| `system.cost` | number | `0` | Base cost per unit. |
| `system.weight` | number | `0` | Base weight per unit, in kg. |
| `system.tech_level` | string | `"3"` | Tech level. |
| `system.tech_sm` | number | `0` | Technological size modifier. |
| `system.legality_class` | string/number | `"4"` | Legality class. |
| `system.material` | string | `""` | Base material. |
| `system.quality` | string | `""` | Base quality. |
| `system.holdout` | number | `0` | Holdout/concealability. |
| `system.equip_time` | number | `1` | Time to equip. |

`cost`, `weight`, properties, attacks, ammunition, and DR may be changed by `eqp_modifiers`. The resolver creates a final view without mutating these base values.

### Base descriptors

`system.descriptors` is an optional array of narrative descriptors. Modern content may use objects such as:

```json
{
  "descriptors": [
    {
      "id": "base-finish",
      "kind": "appearance",
      "value": "Black finish",
      "sourceName": "Base equipment"
    }
  ]
}
```

`kind` is one of `appearance`, `craftsmanship`, `material`, `origin`, `tag`, or `note`. Plain strings are still accepted and normalized as `tag`, but explicit objects are preferred. Modifiers may add more descriptors to the resolved view without changing this base array.

## 5. Inventory location and containers

### Canonical location

`system.location` accepts:

| Value | Meaning |
| --- | --- |
| `equipped` | Equipped/worn. |
| `carried` | Carried but not equipped. |
| `stored` | Stored; does not count as carried or available ammunition. |

Legacy `equipped` and `stored` fields may still appear in imported data, but new content should prefer `location`.

### Container

```json
{
  "is_container": true,
  "container": {
    "max_weight": 20,
    "dimensions_cm": {
      "width": 30,
      "height": 50,
      "depth": 20
    }
  },
  "parent_container_id": ""
}
```

- `is_container`: allows the item to contain other items.
- `container.max_weight`: weight capacity; number ≥ 0.
- Dimensions are in centimeters; numbers ≥ 0.
- `parent_container_id`: ID of a container Equipment Item on the same actor.

Never invent `parent_container_id`: document IDs only exist after actor creation. Leave it `""` in library items. The system propagates a container's inventory location to its children when it is moved.

Containers are top-level: the normal workflow does not allow placing a container inside another container.

## 6. Integrity and defense

| Field | Type | Use |
| --- | --- | --- |
| `item_hp` | number | Base/maximum object HP. |
| `item_hp_current` | number | Persisted current HP. |
| `item_ht` | number | Object HT. |
| `item_dr` | number | General object DR. |
| `integrity_record_enabled` | boolean | Exposes item HP/DR as an integrity record on the actor sheet. |
| `defense_bonus` | number | Granted defense bonus. |
| `defense_bonus_active` | boolean | Activates the bonus while the item is equipped. |

The integrity record exists only when enabled, `quantity > 0`, and resolved maximum HP is greater than zero. Current HP is clamped between zero and the resolved maximum. Changing integrity does not consume charges.

The defense bonus requires the item to be `equipped`, `defense_bonus_active: true`, and the final bonus to be nonzero.

## 7. Consumption, charges, and linked reserves

```json
{
  "quantity": 3,
  "uses_mode": "charges",
  "max_uses": 6,
  "current_uses": 2,
  "consume_quantity_when_empty": true,
  "charge_reserve_type": "power",
  "charge_reserve_name": "Battery",
  "charge_reserve_scope": "carried"
}
```

| Field | Values | Meaning |
| --- | --- | --- |
| `uses_mode` | `quantity`, `charges` | Consume units or charges. |
| `max_uses` | integer ≥ 0 | Charge capacity per unit. |
| `current_uses` | integer ≥ 0 | **Charges already spent**, not remaining charges. |
| `consume_quantity_when_empty` | boolean | When one unit is exhausted, reduce `quantity` and begin the next. |
| `charge_reserve_type` | `""`, `combat`, `power`, `spell` | Present charges as a linked reserve. |
| `charge_reserve_name` | string | Reserve name; empty uses the item name. |
| `charge_reserve_scope` | `any`, `carried`, `equipped`, `stored`, `active` | When the reserve is visible. |

In `quantity` mode, each use reduces `quantity`. In `charges` mode, remaining charges equal `max_uses - current_uses`. Without `consume_quantity_when_empty`, exhausting charges does not reduce the stack. With it, consumption can cross multiple units in the stack.

`active` means `system.active === true` or `system.switched_on === true`. These states may be managed by other system features and need not be present on an ordinary library item.

## 8. DR by body location

`dr_locations` is an object keyed by real body-location IDs. `all` represents character-wide protection.

```json
{
  "dr_locations": {
    "all": {
      "base": 2
    },
    "torso": {
      "base": 5,
      "cort": 2,
      "perf": -1
    }
  }
}
```

Critical rule: `base` is absolute DR, but each damage-type key stores a **modifier relative to base**. In the example, the torso displays DR 7 against cutting and DR 4 against impaling.

The sheet accepts text such as `5, 7 cut, 4 imp` and persists `{ "base": 5, "cort": 2, "perf": -1 }`.

Aliases translated by the editor include:

| Input | Persisted key |
| --- | --- |
| `cr` | `cont` |
| `cut` | `cort` |
| `imp` | `perf` |
| `pi`, `pi-`, `pi+`, `pi++` | `pa`, `pa-`, `pa+`, `pa++` |
| `burn` | `qmd` |
| `corr` | `cor` |
| `tox` | `tox` |

Location IDs depend on the world's body profile. Do not assume `torso` exists; verify it or use `all` only when universal coverage is intended.

## 9. Attack collections

`melee_attacks` and `ranged_attacks` are objects keyed by unique IDs:

```json
{
  "melee_attacks": {
    "slash01": {
      "id": "slash01",
      "mode": "Swing",
      "skill_name": "Broadsword"
    }
  },
  "ranged_attacks": {}
}
```

The editor normally generates random 16-character IDs. A persisted attack may work without an internal `id` in legacy data, but new content should keep key and `id` equal.

Common fields:

| Field | Type | Use |
| --- | --- | --- |
| `mode` | string | Mode name. |
| `skill_name` | string | Skill used; should match the actor's skill name. |
| `skill_level_mod` | number | Skill-level modifier. |
| `damage_formula` | string | Main damage formula. |
| `damage_type` | string | Damage type. |
| `damage_nature` | string | Special nature, for example `FOG`. |
| `damage_scaling` | string | Informational/editable progression such as `+1d6/point`. |
| `armor_divisor` | number | Armor divisor; normally `1`. |
| `min_strength` | string/number | Minimum ST. |
| `groups` | CSV string | Groups used by filters and modifiers. |
| `unbalanced` | boolean | Unbalanced weapon. |
| `fencing` | boolean | Fencing weapon. |
| `follow_up_damage` | object | Follow-up damage. |
| `fragmentation_damage` | object | Fragmentation. |
| `onDamageEffects` | object | Effects specific to this attack. |

`groups` is a comma-separated string, not an array. Basic formulas recognize aliases such as `GdP`/`thr` and `GdB`/`sw`, as well as dice formulas such as `2d+1`.

## 10. Melee attack

```json
{
  "id": "bladeSlash01",
  "mode": "Sword swing",
  "skill_name": "Broadsword",
  "skill_level_mod": 0,
  "damage_formula": "sw+1",
  "damage_type": "cut",
  "damage_nature": "",
  "damage_scaling": "",
  "armor_divisor": 1,
  "reach": "1",
  "parry": "0",
  "block": "",
  "parry_default": true,
  "block_default": true,
  "min_strength": 10,
  "groups": "sword, blade",
  "unbalanced": false,
  "fencing": false,
  "follow_up_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "fragmentation_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "onDamageEffects": {}
}
```

Exclusive fields: `reach`, `parry`, `block`, `parry_default`, and `block_default`. When a `*_default` field is `true`, defense may be calculated from the actor's skill; use `false` to preserve an explicitly fixed value.

## 11. Ranged attack

```json
{
  "id": "rifleShot01",
  "mode": "Shot",
  "skill_name": "Guns (Rifle)",
  "skill_level_mod": 0,
  "damage_formula": "5d",
  "damage_type": "pi",
  "damage_nature": "",
  "damage_scaling": "",
  "armor_divisor": 1,
  "accuracy": "5",
  "range": "500/3000",
  "rof": "3",
  "shots": "30(3)",
  "rcl": "2",
  "mag": "1",
  "min_strength": 10,
  "groups": "rifle, ballistic",
  "ammunition_ids": [],
  "unbalanced": false,
  "fencing": false,
  "follow_up_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "fragmentation_damage": {
    "formula": "",
    "type": "",
    "nature": "",
    "scaling": "",
    "armor_divisor": 1
  },
  "onDamageEffects": {}
}
```

Exclusive fields: `accuracy`, `range`, `rof`, `shots`, `rcl`, `mag`, and `ammunition_ids`. Many remain strings because they accept GURPS notation, not just numbers.

`ammunition_ids` is an array of IDs of other Equipment Items on the same actor, each with `system.ammunition.enabled: true`. Stored ammunition and ammunition with no quantity or available uses are ignored. Do not put UUIDs in this list and do not invent IDs for compendium content.

## 12. Secondary damage and on-damage effects

`follow_up_damage` and `fragmentation_damage` contain:

```json
{
  "formula": "1d-1",
  "type": "burn",
  "nature": "FOG",
  "scaling": "",
  "armor_divisor": 2
}
```

An empty formula disables the component. `scaling` preserves an imported/editable progression; it does not replace `formula`.

Each attack may link its own effects:

```json
{
  "onDamageEffects": {
    "burnEffect01": {
      "id": "burnEffect01",
      "effectUuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
      "name": "On fire",
      "img": "icons/svg/fire.svg",
      "minInjury": 1,
      "requiredDamageType": "burn",
      "activationChance": 100
    }
  }
}
```

`minInjury` is non-negative; `activationChance` ranges from 0 to 100; an empty `requiredDamageType` accepts any type. `effectUuid` must point to a real Effect Item.

## 13. Ammunition profile

An Equipment Item can represent ammunition applied to another equipment's attacks:

```json
{
  "ammunition": {
    "enabled": true,
    "attack_modifier": 1,
    "low_warning": 5,
    "main": {
      "formula": "+1",
      "operation": "add",
      "type": "pi+",
      "nature": "",
      "armor_divisor": 2,
      "divisor_operation": "replace"
    },
    "follow_up": {
      "formula": "1d",
      "operation": "replace",
      "type": "burn",
      "nature": "",
      "armor_divisor": 1,
      "divisor_operation": "replace"
    },
    "fragmentation": {
      "formula": "",
      "operation": "replace",
      "type": "",
      "nature": "",
      "armor_divisor": "",
      "divisor_operation": "replace"
    }
  }
}
```

- `enabled`: makes the item selectable as ammunition.
- `attack_modifier`: attack-roll bonus/penalty.
- `low_warning`: non-negative low-stock warning threshold.
- Components: `main`, `follow_up`, and `fragmentation`.
- `operation` and `divisor_operation`: `replace`, `add`, or `multiply`.
- `type` and `nature` have no separate operation; non-empty text replaces the attack value.
- `armor_divisor` must be empty or greater than zero.

`add`/`multiply` formulas are combined with the attack formula. The effective profile may also be changed by Equipment Modifiers without overwriting this base profile.

## 14. Attached modifiers

`eqp_modifiers` is an object containing snapshots of `eqp_modifier` Items. See the [complete Equipment Modifier reference](./equipment-modifier-item.md).

```json
{
  "eqp_modifiers": {
    "fineMod01": {
      "id": "fineMod01",
      "name": "Superior Quality",
      "enabled": true,
      "level": 1,
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
      "features_data": {},
      "gcs_features_unmapped": [],
      "tech_level": "",
      "group": "Quality",
      "ref": "",
      "source_uuid": "Compendium.world.eqp-modifiers.Item.REAL_ITEM_ID"
    }
  }
}
```

Each entry is an independent copy: later changes to the source Item are not automatically applied to the snapshot. `source_uuid` records provenance and must be real. An AI producing self-contained equipment without an external source may omit it, but must retain the complete required snapshot.

The resolver calculates final cost/weight, properties, DR, attacks, ammunition, descriptors, uses, and granted effects without mutating base data. Do not persist its derived fields.

## 15. General Effect and Condition links

See the [Effect Item reference](./effect-item.md). Every collection below is a keyed object; never invent UUIDs.

Base Effect link:

```json
{
  "id": "effectLink01",
  "effectUuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
  "recipient": "self",
  "name": "Informational name",
  "img": "icons/svg/aura.svg"
}
```

`name` and `img` are metadata; the system attempts to resolve the original document. `recipient` accepts `self` or `target` where applicable.

| Collection | Timing/character |
| --- | --- |
| `activationEffects.success` | After successful activation. |
| `activationEffects.failure` | After failed activation. |
| `onDamageEffects` | On causing damage; accepts the filters in section 12. |
| `passiveEffects` | Automatic/passive effect. |
| `useEventEffects` | When the item is consumed or activated. |
| `stateEffectGroups` | Effects controlled by item state. |
| `generalConditions` | Links to Condition Items, not Effect Items. |

For `useEventEffects`, add `useEventTrigger: "consume"` or `"activate"`.

A general Condition uses `uuid`, not `effectUuid`:

```json
{
  "id": "conditionLink01",
  "uuid": "Compendium.world.conditions.Item.REAL_ITEM_ID",
  "name": "Linked condition",
  "img": "icons/svg/daze.svg"
}
```

## 16. State Effect groups

```json
{
  "stateEffectGroups": {
    "poweredState01": {
      "id": "poweredState01",
      "name": "Field switched on",
      "mode": "equipped_manual",
      "active": false,
      "exclusiveSet": "field-mode",
      "effects": {
        "effectLink01": {
          "id": "effectLink01",
          "effectUuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
          "recipient": "self",
          "name": "Defensive field",
          "img": "icons/svg/shield.svg"
        }
      }
    }
  }
}
```

Modes:

| `mode` | Activation |
| --- | --- |
| `manual` | Depends on `active`. |
| `equipped` | Automatic while equipped. |
| `carried` | Automatic while carried or equipped. |
| `present` | While the item exists on the actor. |
| `equipped_manual` | Requires both equipped and `active: true`. |

`exclusiveSet` is free text. Active manual groups with the same value form an exclusive set: activating one deactivates the others. Do not persist `runtimeActive`; it is derived presentation state.

## 17. Complete example

```json
{
  "name": "Fine Longsword",
  "type": "equipment",
  "img": "icons/weapons/swords/sword-guard-steel.webp",
  "system": {
    "description": "<p>A well-balanced longsword.</p>",
    "chat_description": "<p>Longsword.</p>",
    "favorite_in_combat": true,
    "ref": "B271",
    "quantity": 1,
    "level": "",
    "points": 0,
    "cost": 700,
    "weight": 1.5,
    "location": "carried",
    "is_container": false,
    "container": {
      "max_weight": 0,
      "dimensions_cm": {
        "width": 0,
        "height": 0,
        "depth": 0
      }
    },
    "parent_container_id": "",
    "tech_level": "3",
    "tech_sm": 0,
    "legality_class": "4",
    "material": "Steel",
    "quality": "Fine",
    "item_hp": 12,
    "item_hp_current": 12,
    "item_ht": 12,
    "item_dr": 6,
    "integrity_record_enabled": true,
    "holdout": -3,
    "defense_bonus": 0,
    "defense_bonus_active": false,
    "equip_time": 1,
    "max_uses": 0,
    "current_uses": 0,
    "uses_mode": "quantity",
    "charge_reserve_type": "",
    "charge_reserve_name": "",
    "charge_reserve_scope": "any",
    "consume_quantity_when_empty": false,
    "descriptors": [],
    "dr_locations": {},
    "melee_attacks": {
      "swordSlash01": {
        "id": "swordSlash01",
        "mode": "Swing",
        "skill_name": "Broadsword",
        "skill_level_mod": 0,
        "damage_formula": "sw+1",
        "damage_type": "cut",
        "damage_nature": "",
        "damage_scaling": "",
        "armor_divisor": 1,
        "reach": "1",
        "parry": "0",
        "block": "",
        "parry_default": true,
        "block_default": true,
        "min_strength": 10,
        "groups": "sword, blade",
        "unbalanced": false,
        "fencing": false,
        "follow_up_damage": {
          "formula": "",
          "type": "",
          "nature": "",
          "scaling": "",
          "armor_divisor": 1
        },
        "fragmentation_damage": {
          "formula": "",
          "type": "",
          "nature": "",
          "scaling": "",
          "armor_divisor": 1
        },
        "onDamageEffects": {}
      }
    },
    "ranged_attacks": {},
    "ammunition": {
      "enabled": false,
      "attack_modifier": 0,
      "low_warning": 0,
      "main": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "follow_up": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      },
      "fragmentation": {
        "formula": "",
        "operation": "replace",
        "type": "",
        "nature": "",
        "armor_divisor": "",
        "divisor_operation": "replace"
      }
    },
    "eqp_modifiers": {},
    "activationEffects": {
      "success": {},
      "failure": {}
    },
    "onDamageEffects": {},
    "generalConditions": {},
    "passiveEffects": {},
    "useEventEffects": {},
    "stateEffectGroups": {}
  }
}
```

## 18. Pre-delivery validation

- [ ] `type` is exactly `equipment`.
- [ ] `cost` and `weight` are base per-unit values.
- [ ] `location` is `equipped`, `carried`, or `stored`.
- [ ] `current_uses` represents spent charges.
- [ ] A linked charge reserve is configured only intentionally.
- [ ] `parent_container_id` and `ammunition_ids` reference real IDs on the same actor or are empty.
- [ ] `dr_locations` uses real IDs and damage-type modifiers relative to base DR.
- [ ] Attack keys and IDs are unique and match.
- [ ] Notational attack fields remain strings where necessary.
- [ ] `groups` is CSV; `ammunition_ids` is an array.
- [ ] Armor divisors are empty or greater than zero.
- [ ] `eqp_modifiers` contains complete snapshots rather than calculated results.
- [ ] Effect/Condition UUIDs exist and use `effectUuid`/`uuid` correctly.
- [ ] No derived field (`equipmentResolution`, final cost, resolved attacks, warnings) was persisted.
- [ ] The JSON is syntactically valid and contains no comments.

## 19. Operational summary for another AI

> Generate a Foundry Item with `type: "equipment"`. Persist only editable base data. Use keyed objects for attacks, modifiers, and links; keep keys and IDs unique. Preserve GURPS notation in attack strings, treat `current_uses` as spent charges, and represent damage-specific DR as a difference from `base`. Never invent world- or actor-dependent IDs/UUIDs. Do not persist resolver output. Follow the specialized references in this folder for modifiers and effects.
