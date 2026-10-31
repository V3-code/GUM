<div align="center">

# GURPS GUM

### Sistema não oficial de GURPS para Foundry Virtual Tabletop

Uma ferramenta não oficial para criar personagens, conduzir combates e administrar campanhas de GURPS no Foundry VTT.

![Versão](https://img.shields.io/badge/versão-1.5.0-beta-8a7d5f)
![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-13–14-8a7d5f)
![Status](https://img.shields.io/badge/status-beta_funcional-4f6b58)
![Idiomas](https://img.shields.io/badge/idiomas-PT--BR_%7C_EN-596878)

</div>

## Instalação

No Foundry VTT, acesse **Game Systems → Install System**, cole a URL abaixo no campo **Manifest URL** e clique em **Install**:

```text
https://raw.githubusercontent.com/V3-code/GURPS-GUM/master/system.json
```

As novas versões serão detectadas pelo próprio Foundry. Se preferir, você também pode baixar o pacote na página de [releases](https://github.com/V3-code/GURPS-GUM/releases/latest).

## O que o GUM oferece

- **Ficha completa:** atributos, perícias, vantagens, desvantagens, equipamentos, magias, poderes, recursos e cálculos derivados.
- **Integração com o GCS:** importação de personagens, templates e bibliotecas, além de ferramentas de importação e exportação em JSON.
- **Fontes de conteúdo configuráveis:** cada mesa cria seus próprios compêndios e escolhe quais serão usados pelo sistema; os status do token são configurados diretamente nas opções do mundo.
- **Combate assistido:** aplicação de dano, ferimentos, condições, efeitos, modificadores e gerenciamento de estados.
- **Modificadores de equipamento:** o cálculo centralizado de preço e peso, suas etapas e a evolução planejada estão documentados em [`docs/equipment-modifiers.md`](docs/equipment-modifiers.md).
- **Ferramentas para o mestre:** Escudo do Mestre, solicitação de testes e navegadores de regras e conteúdos.

## Compatibilidade e desenvolvimento

| Informação | Estado atual |
| --- | --- |
| Versão do GUM | 1.5.0-beta |
| Foundry VTT mínimo | 13 |
| Foundry VTT verificado | 14 |
| Idiomas da interface | Português (Brasil) e inglês |
| Estado do projeto | Beta funcional, em melhoria de uso |

## Documentação e suporte

- [Histórico de alterações](CHANGELOG.md)
- [Manual de solicitação de testes](docs/test-request-manual.md)
- [Expressões de valor de Efeitos e Modificadores do Mestre](docs/effect-value-expressions.md)
- [Itens Condição, Itens Gatilho e gatilhos úteis — referência para IA](docs/referencias-ia/item-condicao-e-gatilho.md)
- [API pública para macros e módulos (PT-BR)](docs/API.pt-BR.md)
- [Public API for macros and modules (English)](docs/API.md)
- [Versões publicadas](https://github.com/V3-code/GURPS-GUM/releases)
- [Relatar um problema ou sugerir uma melhoria](https://github.com/V3-code/GURPS-GUM/issues)

## Conteúdo do pacote

O GUM distribui apenas a estrutura técnica de fichas, rolagens e automações, sem compêndios próprios do sistema. Ele **não inclui** catálogos, bibliotecas GCS, textos de regras, imagens, trechos de livros ou conteúdo pré-preenchido de GURPS. Cada grupo cria ou importa o conteúdo que utilizará em sua própria mesa, a partir dos materiais que possuir legitimamente.

### Comandos rápidos no chat

O namespace `/gum` oferece rolagens rápidas e exibe uma ajuda resumida no chat ao iniciar o sistema:

```text
/gum                         Exibe a ajuda
/gum nh 14-4                 Rola contra um NH informado
/gum furtividade-4           Usa o NH da perícia na ficha
/gum dmg 3d6+1 cont          Rola dano com botão para aplicar ao alvo
```

Aliases de NH: `n`, `niv`, `nivel` e `nível`. Aliases de dano: `d`, `damage` e `dano`.


## Autor e licença

Desenvolvido por [V3-Code](https://github.com/V3-code) e distribuído sob a licença [CC BY-NC-ND 4.0](LICENSE.md).

> **Projeto não oficial e sem fins lucrativos.** GURPS é marca registrada da Steve Jackson Games. O GURPS GUM é uma ferramenta criada por fãs e não é afiliado, licenciado ou endossado pela Steve Jackson Games.
