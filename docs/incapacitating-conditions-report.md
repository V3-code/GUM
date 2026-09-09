# Condições incapacitantes: implementação GUM

## Fonte e escopo

As regras foram transcritas da biblioteca local `Basic Set/Conditions_pt_br.adq`, com referências ao GURPS Basic Set B428–B429. A migração não inclui nem altera arquivos do GCS.

## Comportamento implementado

- `Agonia` permanece tratada pela migração V3 existente, com os efeitos de incapacidade e queda.
- `Asfixia`, `Atordoamento`, `Êxtase`, `Alucinação`, `Paralisia`, `Ânsia` e `Convulsão` são convertidas para Itens `condition` quando o registro importado ainda está como `advantage`.
- Cada condição recebe descrição oficial em português, referência, SVG dedicado e um efeito persistente reutilizável.
- Os modificadores objetivos são aplicados como efeitos GUM: −4 nas defesas; Ânsia também aplica −5 em testes de DX, IQ e Percepção.
- As condições cuja regra diz que o personagem cai vinculam o efeito existente `Deitado`.
- Decisões narrativas ou temporais previstas no livro (por exemplo, teste de Vontade e duração da Alucinação, perda de PF e recuperação do Atordoamento) permanecem na descrição para aplicação pelo GM.
- `High Pain Threshold` agora ignora completamente Choque por Ferimento I–IV no fluxo de aplicação de dano, conforme B419. O flag `ignoreShock` continua compatível.

## Ícones

`icons/svg/state.svg/`: `agony.svg`, `choking.svg`, `daze.svg`, `ecstasy.svg`, `hallucinating.svg`, `paralysis.svg`, `retching.svg`, `seizure.svg`.

## Migração

A chave de mundo `incapacitatingConditionsMigrationV1` impede repetição após o sucesso. A substituição registra a UUID do Item de origem, retoma uma execução parcial sem criar outra cópia, preserva itens embutidos no mesmo ator e restaura o estado de lock dos compêndios. Os binários LevelDB gerados durante o teste ficam fora da entrega Git.

## Limitações conhecidas

A descrição mantém instruções que exigem decisão do GM quando o motor não possui evento seguro para executá-las automaticamente. O efeito `Deitado` representa a queda prescrita pela regra, mas não força mudança de postura em um ator que já esteja em posição incompatível.
