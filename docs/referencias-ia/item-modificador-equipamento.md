# Referência para IA — Item Modificador de Equipamento do GUM

[English version](./equipment-modifier-item.md)

> Documento técnico para produzir dados de um Item Modificador de Equipamento compatível com o sistema GUM (Não Oficial).
>
> Mapeamento conferido no GUM `1.4.3-beta`, Foundry VTT mínimo 12 e verificado 14, em 14/10/2026.

## 1. Finalidade deste documento

Use esta referência quando uma IA precisar criar, revisar ou explicar um Item Modificador de Equipamento. O resultado recomendado é um objeto JSON de Item do Foundry com `type: "eqp_modifier"`.

Um modificador possui duas camadas independentes:

1. **Ajustes de preço e peso**, em `cost_adjustment_data` e `weight_adjustment_data`.
2. **Features mecânicas**, em `features_data`, que alteram propriedades, DR, ataques, munição ou concedem um Item Efeito.

O Item Modificador é uma fonte reutilizável. Quando anexado a um equipamento, seus dados são copiados para `system.eqp_modifiers` do equipamento e resolvidos juntamente com os demais modificadores.

Para transportar o modificador, o equipamento e seus efeitos em um único JSON, use o [formato de pacote autocontido](./pacote-itens-autocontido.md). Ele aceita `modifierRef` no equipamento e `effectRef` em features `granted_effect`.

## 2. Contrato de saída recomendado para a IA

Ao criar um modificador:

1. Retorne JSON válido, sem comentários dentro do JSON.
2. Use sempre `type: "eqp_modifier"`.
3. Use `system.adjustment_schema: 1`.
4. Grave os ajustes estruturados em `cost_adjustment_data` e `weight_adjustment_data`.
5. Registre as features em `system.features_data` como **objeto indexado por ID**, nunca como texto e preferencialmente não como array.
6. Dê a cada feature um `id` curto, não vazio e único; a chave do objeto deve ser igual ao `id`.
7. Inclua somente campos pertinentes ao tipo da feature.
8. Use `enabled: true` explicitamente no modificador e nas features ativas.
9. Não invente UUIDs de Itens Efeito nem IDs de localizações corporais. Se forem necessários e não tiverem sido fornecidos, deixe-os vazios ou solicite-os.
10. Não gere `_id`, `folder`, `sort`, `ownership` ou `_stats`, salvo exigência do fluxo de importação.
11. Explique fora do JSON qualquer hipótese, seletor amplo ou conflito intencional.

## 3. Estrutura mínima

```json
{
  "name": "Nome do modificador",
  "type": "eqp_modifier",
  "img": "icons/svg/upgrade.svg",
  "system": {
    "description": "<p>Descrição completa.</p>",
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

`cost_adjustment` e `weight_mod` são espelhos legados das expressões estruturadas. Mantê-los sincronizados melhora a interoperabilidade. `cost_factor` é um espelho numérico útil quando a expressão é CF. A fonte principal atual são os objetos `*_adjustment_data`.

## 4. Campos gerais

| Caminho | Tipo | Padrão | Uso |
| --- | --- | --- | --- |
| `name` | string | — | Nome visível. |
| `type` | string | `eqp_modifier` | Tipo obrigatório. |
| `img` | string | ícone | Imagem do item. |
| `system.description` | HTML/string | `""` | Descrição completa. |
| `system.chat_description` | HTML/string | `""` | Resumo para o chat. |
| `system.ref` | string | `""` | Referência de regra. |
| `system.group` | string | `""` | Grupo livre para organização. |
| `system.tech_level` | string | `""` | TL/NT associado. |
| `system.enabled` | boolean | `true` | Estado padrão ao anexar/aplicar. |
| `system.level` | number ≥ 0 | `1` | Nível do modificador; escala campos `per_level`. |
| `system.points` | integer | `0` | Valor informativo em pontos. |
| `system.features_data` | object | `{}` | Coleção indexada de features. |
| `system.gcs_features_unmapped` | array | `[]` | Dados importados do GCS que não puderam ser convertidos; uma IA não deve inventá-los. |
| `system.scenario.*` | string | `""` | Raridade, local, disponibilidade e componentes narrativos. |

`tech_level_mod` existe por compatibilidade/importação, mas conteúdo novo deve preferir `tech_level`.

## 5. Ajustes de preço e peso

### 5.1 Estrutura

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

Estágios aceitos, processados nesta ordem:

| `stage` | Momento |
| --- | --- |
| `original` | Sobre o valor original. |
| `base` | Construção do valor-base. |
| `final_base` | Após o valor-base. |
| `final` | Ajuste final da unidade. |

A quantidade do equipamento só é aplicada depois do valor final unitário.

### 5.2 Expressões aceitas

| Exemplo | Interpretação |
| --- | --- |
| `+1 CF`, `-0.5 CF` | Fator de custo; somente preço. |
| `x2`, `*1/2` | Multiplicador. Frações são aceitas. |
| `+20%`, `-10%` | Acréscimo/redução percentual. |
| `x150%`, `*1/2%` | Multiplicador percentual. |
| `+50`, `-10` | Valor fixo de preço. |
| `+1 kg`, `-500 g`, `+2 lb`, `-4 oz` | Peso fixo convertido para a unidade usada. |

Regras de compatibilidade:

- Preço em `base`: use CF ou multiplicação. Uma multiplicação é convertida ao CF equivalente; o CF acumulado tem limite inferior de `-0.8`.
- Peso em `original`: use valor fixo ou percentual.
- Peso nos outros estágios: valor fixo, multiplicação ou multiplicador percentual.
- Preço fora de `base`: valor fixo, multiplicação ou percentual.
- Operações incompatíveis não são silenciosamente reinterpretadas; geram aviso na resolução.

`per_level: true` multiplica o ajuste pelo nível. Nível `0` anula essa contribuição. `per_weight` existe somente no ajuste de preço e multiplica a contribuição pelo peso final unitário, em `kg` ou `lb`.

## 6. Múltiplas features e ordem de resolução

`features_data` é um mapa. Para várias features, crie várias propriedades irmãs:

```json
{
  "features_data": {
    "quality": {
      "id": "quality",
      "label": "Qualidade fina",
      "type": "equipment_property",
      "enabled": true,
      "path": "quality",
      "operation": "add",
      "value": "Fina"
    },
    "accuracy": {
      "id": "accuracy",
      "label": "Precisão",
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

Base comum:

```json
{
  "id": "feature-id",
  "label": "Nome legível",
  "type": "equipment_property",
  "enabled": true
}
```

Features desabilitadas e features `per_level` em modificador de nível `0` são ignoradas. Criações de ataque/munição são resolvidas primeiro. As demais operações seguem ordem determinística: `set`, depois `multiply`, depois `add`, ordenadas pelo ID do modificador e da feature. Múltiplos `set` no mesmo destino geram aviso; o último nessa ordem prevalece.

Tipos aceitos:

| `type` | Função |
| --- | --- |
| `equipment_property` | Altera propriedade do equipamento. |
| `equipment_descriptor` | Acrescenta descritor narrativo estruturado. |
| `equipment_dr` | Altera DR por localização/tipo de dano. |
| `attack_property` | Altera propriedades de ataques existentes ou criados. |
| `attack_damage` | Define dano subsequente ou de fragmentação. |
| `create_attack` | Cria um modo de ataque. |
| `create_ammunition` | Cria/substitui o perfil de munição. |
| `ammunition_property` | Altera parte do perfil de munição. |
| `granted_effect` | Vincula um Item Efeito ao equipamento. |

## 7. `equipment_property`

```json
{
  "id": "reinforced",
  "label": "Estrutura reforçada",
  "type": "equipment_property",
  "enabled": true,
  "path": "item_hp",
  "operation": "add",
  "value": 2,
  "per_level": true
}
```

| `path` | Valor | Observação |
| --- | --- | --- |
| `tech_sm` | number | Modificador de tamanho tecnológico. |
| `item_hp` | number | HP do item. |
| `item_ht` | number | HT do item. |
| `item_dr` | number | DR geral. |
| `holdout` | number | Ocultabilidade. |
| `defense_bonus` | number | Bônus de defesa. |
| `equip_time` | number | Tempo para equipar. |
| `max_uses` | number | Cargas/usos máximos. |
| `legality_class` | string/number | Classe de legalidade. |
| `material` | string | Material. |
| `quality` | string | Qualidade. |

`operation`: `add`, `multiply` ou `set`. Para `material` e `quality`, use apenas `add` ou `set`: `add` acrescenta texto distinto separado por vírgula; `set` substitui. `per_level` é suportado.

Com `path: "max_uses"`, estes campos opcionais também controlam a apresentação como reserva:

| Campo | Valores |
| --- | --- |
| `reserve_type` | `""` (herdar), `none`, `combat`, `power`, `spell` |
| `reserve_name` | texto livre |
| `reserve_scope` | `""` (herdar), `any`, `carried`, `equipped`, `stored`, `active` |

## 8. `equipment_descriptor`

Acrescenta metadado descritivo sem substituir a descrição principal.

```json
{
  "id": "elven-origin",
  "label": "Origem élfica",
  "type": "equipment_descriptor",
  "enabled": true,
  "descriptor_kind": "origin",
  "value": "Fabricação élfica"
}
```

`descriptor_kind`: `appearance`, `craftsmanship`, `material`, `origin`, `tag` ou `note`. Descritores acumulam e preservam a origem. Valor vazio gera aviso. Não usa `operation` nem `per_level`.

## 9. `equipment_dr`

```json
{
  "id": "torso-dr",
  "label": "Reforço no torso",
  "type": "equipment_dr",
  "enabled": true,
  "location": "torso",
  "damage_type": "base",
  "operation": "add",
  "value": 2,
  "per_level": false
}
```

- `location`: `all` ou um ID real do perfil de localizações corporais.
- `damage_type`: `base` ou uma chave de tipo de dano usada pela campanha.
- `operation`: `add`, `multiply` ou `set`.
- `value`: número; `per_level` é suportado.

`all` altera apenas localizações que já existem no equipamento. Uma localização específica pode ser criada pelo resolvedor. Se nada corresponder, o sistema emite aviso. Não invente IDs como `torso`: confirme o perfil do mundo quando a feature depender de uma localização específica.

## 10. Seletores de ataque

`attack_property`, `attack_damage` e os domínios de ataque de `granted_effect` usam:

| Campo | Valores |
| --- | --- |
| `attack_type` | `all`, `melee`, `ranged`; `granted_effect` também aceita `none` |
| `selector_field` | `all`, `group`, `mode`, `skill_name` |
| `selector_value` | texto para comparação exata, sem diferenciar maiúsculas/minúsculas |

Em `group`, cada grupo da lista separada por vírgulas do ataque é comparado individualmente. `selector_field: "all"` ou filtro vazio corresponde a todos os ataques do tipo escolhido. Se quiser atingir um ataque criado pela mesma feature collection, atribua-lhe um grupo exclusivo e selecione por esse grupo.

## 11. `attack_property`

```json
{
  "id": "scope-accuracy",
  "label": "Mira de precisão",
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

Propriedades aceitas:

| Classe | `path` | Operações recomendadas |
| --- | --- | --- |
| Fórmula | `damage_formula` | `add`, `set` |
| Texto | `damage_type`, `damage_nature`, `reach`, `range`, `rof`, `shots`, `groups` | `set` |
| Numérico | `armor_divisor`, `skill_level_mod`, `min_strength`, `accuracy`, `rcl`, `mag` | `add`, `multiply`, `set` |
| Defesa | `parry`, `block` | prefira `set`; use aritmética apenas se o valor-base for numérico |

`damage_formula` com `add` anexa um modificador numérico à fórmula; não use `multiply`. `per_level` é suportado. Operações incompatíveis geram aviso.

## 12. `attack_damage`

Define por completo um componente secundário dos ataques selecionados:

```json
{
  "id": "explosive-fragments",
  "label": "Fragmentos",
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

`damage_slot`: `follow_up_damage` ou `fragmentation_damage`. A feature substitui o componente completo, não usa `operation` ou `per_level`. Múltiplas substituições do mesmo componente geram aviso.

## 13. `create_attack`

### Corpo a corpo

```json
{
  "id": "bayonet",
  "label": "Baioneta",
  "type": "create_attack",
  "enabled": true,
  "attack_type": "melee",
  "attack": {
    "mode": "Estocada de baioneta",
    "skill_name": "Armas de Haste",
    "skill_level_mod": 0,
    "damage_formula": "GdP+1",
    "damage_type": "perf",
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

### À distância

```json
{
  "id": "launcher",
  "label": "Lançador integrado",
  "type": "create_attack",
  "enabled": true,
  "attack_type": "ranged",
  "attack": {
    "mode": "Granada integrada",
    "skill_name": "Armas de Fogo",
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

O ID do ataque é derivado automaticamente como `eqpmod_<modifierId>_<featureId>`; não forneça `attack.id`. Ataques criados são resolvidos antes de `attack_property` e `attack_damage`. A feature não usa `operation` nem `per_level`.

## 14. `create_ammunition`

```json
{
  "id": "special-ammo",
  "label": "Munição especial",
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

Cada componente (`main`, `follow_up`, `fragmentation`) aceita `operation` e `divisor_operation`: `replace`, `add` ou `multiply`. Mais de uma `create_ammunition` ativa gera conflito; a última na ordem determinística prevalece. Não usa `per_level`.

## 15. `ammunition_property`

```json
{
  "id": "ammo-penetration",
  "label": "Munição perfurante",
  "type": "ammunition_property",
  "enabled": true,
  "path": "main.armor_divisor",
  "operation": "multiply",
  "value": 2,
  "per_level": false
}
```

`path` aceitos:

- `enabled`, `attack_modifier`, `low_warning`.
- Para `main`, `follow_up` e `fragmentation`: `.formula`, `.operation`, `.type`, `.nature`, `.armor_divisor`, `.divisor_operation`.

Regras:

- `enabled`: `set` com booleano ou `"true"`/`"false"`.
- `.operation` e `.divisor_operation`: `set` com `replace`, `add` ou `multiply`.
- `.type` e `.nature`: `set`.
- `attack_modifier`, `low_warning` e `.armor_divisor`: `add`, `multiply` ou `set`; `low_warning` nunca fica abaixo de zero e divisor deve ser maior que zero.
- `.formula`: `set`, `add` ou `multiply`; as duas últimas combinam fórmulas.
- `per_level` é válido apenas para valores numéricos.

## 16. `granted_effect`

Vincula um Item Efeito real. Consulte também a [referência do Item Efeito](./item-efeito.md).

```json
{
  "id": "protective-aura",
  "label": "Aura protetora",
  "type": "granted_effect",
  "enabled": true,
  "effect_uuid": "Compendium.world.effects.Item.REAL_ITEM_ID",
  "effect_name": "Aura protetora",
  "effect_img": "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
  "effect_domain": "wearer",
  "lifecycle": "while_equipped"
}
```

`effect_uuid` é obrigatório no Item persistido e precisa resolver para um Item Efeito existente. `effect_name` e `effect_img` são metadados auxiliares. Nunca invente o UUID. Em um pacote autocontido ainda não importado, use `effectRef` conforme a referência do pacote; o importador produzirá esses três campos.

Domínios:

| `effect_domain` | Comportamento |
| --- | --- |
| `wearer` | Sincroniza no ator as ações persistentes do Item Efeito; ações instantâneas são ignoradas e a duração fica permanente enquanto o ciclo de vida estiver ativo. |
| `source_attack` | Aplica ações persistentes compatíveis de rolagem/perícia/combate, limitadas ao equipamento e ataques selecionados. |
| `hit_target` | Insere o Item Efeito em `onDamageEffects` dos ataques selecionados. |

Ciclos de vida:

| `lifecycle` | Ativo quando… |
| --- | --- |
| `while_possessed` | o equipamento pertence ao ator. |
| `while_carried` | está carregado ou equipado. |
| `while_equipped` | está equipado. Padrão. |
| `while_active` | o equipamento está ativo/ligado. |

Para `source_attack` e `hit_target`, use também os seletores da seção 10. Em `hit_target` podem ser usados:

- `min_injury`: dano mínimo, número ≥ 0; padrão `0`.
- `activation_chance`: chance percentual de 0 a 100; padrão `100`.
- `required_damage_type`: tipo de dano exigido; vazio aceita qualquer tipo.

Não usa `operation` nem `per_level`.

## 17. Exemplo completo

```json
{
  "name": "Qualidade Superior",
  "type": "eqp_modifier",
  "img": "icons/skills/trades/smithing-anvil-silver-red.webp",
  "system": {
    "description": "<p>Construção mais leve, resistente e precisa.</p>",
    "chat_description": "<p>Qualidade superior.</p>",
    "ref": "Regra da campanha",
    "group": "Qualidade",
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
        "label": "Qualidade fina",
        "type": "equipment_property",
        "enabled": true,
        "path": "quality",
        "operation": "add",
        "value": "Superior",
        "per_level": false
      },
      "durability": {
        "id": "durability",
        "label": "Durabilidade",
        "type": "equipment_property",
        "enabled": true,
        "path": "item_hp",
        "operation": "add",
        "value": 2,
        "per_level": true
      },
      "precision": {
        "id": "precision",
        "label": "Precisão",
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
      "rarity": "Incomum",
      "location": "Armeiros especializados",
      "availability": "Sob encomenda",
      "components": "Materiais de alta qualidade"
    }
  }
}
```

## 18. Validação antes de entregar

- [ ] `type` é exatamente `eqp_modifier`.
- [ ] `adjustment_schema` é `1`.
- [ ] Expressões e estágios de preço/peso são compatíveis.
- [ ] `per_weight` aparece somente no ajuste de preço.
- [ ] `features_data` é um objeto; cada chave coincide com `feature.id`.
- [ ] IDs de features são únicos.
- [ ] Todo `type`, `path`, `operation`, domínio e ciclo de vida pertence às listas válidas.
- [ ] Campos exclusivos de outro tipo de feature foram omitidos.
- [ ] Seletores amplos (`all` ou filtro vazio) são intencionais.
- [ ] `per_level` foi usado somente onde é suportado.
- [ ] Localizações corporais e UUIDs foram confirmados, não inventados.
- [ ] Não há dois `set`, dois danos completos ou dois perfis de munição conflitantes sem intenção explícita.
- [ ] O JSON é sintaticamente válido e não contém comentários.

## 19. Resumo operacional para outra IA

> Gere um Item Foundry com `type: "eqp_modifier"` e `system.adjustment_schema: 1`. Represente preço e peso nos objetos estruturados, mantendo os espelhos legados sincronizados. Registre várias capacidades como propriedades de `system.features_data`, com chave e `id` iguais e únicos. Escolha apenas um dos nove tipos de feature e seus campos válidos. Não invente UUIDs nem IDs de localização. Considere a ordem criação → set → multiply → add e avise sobre seletores amplos ou substituições concorrentes.
