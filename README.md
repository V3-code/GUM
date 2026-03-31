# GURPS GUM (Não Oficial)

Sistema para Foundry Virtual Tabletop inspirado no GURPS, mantido pela comunidade.

**Autor:** Victor Valentim  
**Versão:** `1.0.0`  
**Compatibilidade Foundry VTT:** `12` (mínimo) / `13` (verificado)

> Projeto não oficial e sem fins lucrativos. GURPS é marca registrada de Steve Jackson Games. Este repositório não é afiliado, licenciado ou endossado pela Steve Jackson Games.

## Visão geral

O GUM oferece uma base completa para campanhas no estilo GURPS dentro do Foundry VTT, com:

1. ficha de personagem dedicada;
2. compêndios prontos para uso;
3. ferramentas para mestre (modificadores, condições, efeitos e tela de apoio);
4. importação e exportação de dados do GCS;
5. automações de regras e gerenciamento de estados.

## Recursos disponíveis para usuários

### 1) Ficha e mecânicas de personagem

- atributos, recursos (HP/FP), iniciativa e cálculos derivados;
- controle de carga/encumbrance e efeitos de equipamento;
- estados e penalidades com ícones próprios;
- suporte a condições e efeitos aplicados ao personagem.

### 2) Compêndios prontos

O sistema inclui compêndios públicos com conteúdo para uso direto em jogo:

- Modelos;
- Ampliações e Limitações;
- Gatilhos;
- Efeitos;
- Condições;
- Condições Passivas (Regras);
- Perícias;
- Vantagens;
- Desvantagens;
- Magias;
- Poderes;
- Equipamentos;
- Modificadores de Equipamento;
- Modificadores de Rolagem;
- Macros.

### 3) Ferramentas para mestre

- navegador de modificadores;
- navegador de condições, efeitos, gatilhos e modelos;
- escudo do mestre (GM Screen);
- aplicação de dano;
- sincronização das regras passivas do compêndio para personagens existentes.

### 4) Importação e exportação

Disponível nas configurações do sistema:

- importar personagem do GCS (`.gcs`);
- importar template do GCS (`.gct/.gcs`);
- importar itens por JSON para compêndios;
- exportar compêndio para JSON;
- exportar ficha de personagem para JSON.

## Como usar no dia a dia

### Para jogadores

1. Crie ou abra um personagem no mundo configurado com GUM.
2. Preencha atributos, perícias, vantagens/desvantagens, equipamentos e recursos.
3. Use os itens dos compêndios para montar a ficha com mais rapidez.
4. Acompanhe condições e estados ativos diretamente na ficha/token.

### Para mestres

1. Importe conteúdos iniciais pelos compêndios e ferramentas de importação.
2. Use os navegadores de condições/efeitos/modificadores durante a sessão.
3. Acione a sincronização de regras quando atualizar compêndios de condições passivas.
4. Utilize exportação JSON como rotina de backup e migração.

## Instalação

### Opção A — URL de manifesto (recomendada)

Como o GURPS GUM ainda não está na lista oficial de sistemas do Foundry, a instalação deve ser feita manualmente via Manifest URL.

Passo a passo:

1. Abra o Foundry VTT
2. Vá até a aba "Game Systems"
3. Clique em "Install System"
4. No campo "Manifest URL", cole o link abaixo:

 https://raw.githubusercontent.com/V3-code/GUM/master/system.json

5. Clique em "Install"

Pronto! O sistema será instalado automaticamente.

Sempre que uma nova versão for publicada, o Foundry detectará automaticamente e permitirá atualizar o sistema.

### Opção B — instalação manual

1. Baixe o arquivo `.zip` da release;
2. Extraia para `Data/systems/gum`;
3. Reinicie o Foundry VTT;
4. Selecione o sistema GUM ao criar/editar um mundo.

## Atualizações

- atualizações automáticas no Foundry dependem do campo `download` no `system.json`;
- cada release deve publicar o artefato `gum.zip`;
- consulte o histórico em [`CHANGELOG.md`](CHANGELOG.md).

## Estrutura do repositório

- `system.json`: manifesto do sistema;
- `scripts/` e `module/`: lógica principal e aplicações;
- `templates/`: templates Handlebars;
- `styles/`: estilos da interface;
- `packs/`: compêndios;
- `icons/` e `fonts/`: ativos visuais.

## Solução de problemas

Se algo não carregar corretamente:

1. verifique a versão do Foundry (v12 ou v13);
2. abra o console do navegador (F12) e confira erros;
3. faça refresh forçado (Ctrl+F5);
4. teste em um mundo limpo, sem módulos de terceiros.

Se o problema persistir, abra uma issue:  
https://github.com/V3-code/GUM/issues

## Versionamento

O projeto segue SemVer (`MAJOR.MINOR.PATCH`).  
Fluxo de release em [`RELEASE.md`](RELEASE.md).

## Licença

Licenciado sob **CC BY-NC-ND 4.0**.  
Detalhes em [`LICENSE.md`](LICENSE.md).

## Contato

- GitHub: https://github.com/V3-code
- Issues: https://github.com/V3-code/GUM/issues

## Créditos e direitos

GURPS © Steve Jackson Games. Este sistema é uma adaptação feita por fãs e distribuída gratuitamente.