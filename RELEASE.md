# Processo de Release do GUM

Este documento padroniza publicação e atualização do sistema no Foundry VTT.

## 1) Pré-requisitos

- Branch principal atualizada;
- `system.json` válido;
- `CHANGELOG.md` atualizado;
- versão (`version`) incrementada em `system.json`.

## 2) Empacotamento

Gerar um zip com o conteúdo do sistema para distribuição no Foundry.

Nome do arquivo esperado no release:

- `gum.zip`

> O campo `download` no `system.json` aponta para:
> `https://github.com/V3-code/GUM/releases/latest/download/gum.zip`

## 3) Publicação no GitHub

1. Criar tag de versão (ex.: `v1.0.0`);
2. Criar release com essa tag;
3. Anexar `gum.zip` como asset da release;
4. Confirmar que `system.json` público já contém a versão correta.

## 4) Pós-publicação

- Testar instalação limpa por Manifest URL;
- Testar atualização de uma versão anterior;
- Registrar bugs conhecidos nas issues.

## 5) Convenção de versão (SemVer)

- `MAJOR`: quebra de compatibilidade;
- `MINOR`: novas funcionalidades compatíveis;
- `PATCH`: correções sem quebra de API/estrutura.