# Processo de Release do GUM

Este documento padroniza publicação e atualização do sistema no Foundry VTT.

## 1) Pré-requisitos

- Branch principal atualizada;
- `system.json` válido;
- `CHANGELOG.md` atualizado;
- versão (`version`) incrementada em `system.json`.

## 2) Empacotamento

Gerar um zip com o conteúdo do sistema para distribuição no Foundry.

Na pasta do repositório, depois de confirmar todas as alterações na `master`, execute:

```powershell
git archive --format=zip --output=gum.zip HEAD
```

O manifesto `system.json` deve estar na raiz do ZIP, sem uma pasta `gum` adicional.
Esse método inclui apenas arquivos versionados: não leva `.git`, resíduos locais de
compêndios em `packs/` nem outros dados temporários do mundo. Não use um ZIP da
pasta inteira do Foundry para a publicação.

Nome do arquivo esperado no release:

- `gum.zip`

> O campo `download` no `system.json` deve apontar para a própria versão:
> `https://github.com/V3-code/GURPS-GUM/releases/download/v<VERSÃO>/gum.zip`
>
> Exemplo para `1.5.1-beta`:
> `https://github.com/V3-code/GURPS-GUM/releases/download/v1.5.1-beta/gum.zip`

Não use `releases/latest` no manifesto: uma versão publicada inicialmente como
pré-release pode não assumir esse marcador e deixar a atualização apontando para
um pacote anterior.

## 3) Publicação no GitHub

1. Criar tag de versão (ex.: `v1.0.0`);
2. Criar release com essa tag;
3. Anexar `gum.zip` como asset da release;
4. Confirmar que `system.json` público já contém a versão correta.

A tag deve ser exatamente `v` seguido do valor de `version` no manifesto. Por
exemplo, para `"version": "1.2.2-beta"`, use a tag `v1.2.2-beta`. A validação
automática rejeita tags que não correspondam ao manifesto.

Antes de anexar o pacote, confirme também que o manifesto dentro dele possui a
mesma versão:

```bash
unzip -p gum.zip system.json | python -m json.tool | grep '"version"'
```

## 4) Pós-publicação

- Testar instalação limpa por Manifest URL;
- Testar atualização de uma versão anterior;
- Registrar bugs conhecidos nas issues.

## 5) Convenção de versão (SemVer)

- `MAJOR`: quebra de compatibilidade;
- `MINOR`: novas funcionalidades compatíveis;
- `PATCH`: correções sem quebra de API/estrutura.
