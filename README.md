# GURPS GUM – Sistema não oficial para Foundry VTT

**Autor:** Victor Valentim  
**Versão atual:** `1.0.0`  
**Compatibilidade Foundry VTT:** `12` (mínimo) / `13` (verificado)

---

O **GUM (GURPS Universal Module)** é um sistema de RPG para jogar no estilo GURPS dentro do **Foundry VTT**.

> ⚠️ Este é um projeto **não oficial** e **sem fins lucrativos**.  
> GURPS é marca registrada de **Steve Jackson Games**; este projeto não é afiliado, endossado ou licenciado por ela.

## 🚀 Objetivo do projeto

- Permitir campanhas com mecânicas inspiradas no GURPS no Foundry VTT;
- Manter fluxo de jogo rápido para mestre e jogadores;
- Distribuir gratuitamente para a comunidade.

## 🧩 Estrutura principal do repositório

- `system.json`: manifesto do sistema (instalação/update do Foundry);
- `scripts/` e `module/`: lógica e apps do sistema;
- `templates/`: templates Handlebars;
- `styles/`: folhas de estilo;
- `packs/`: compêndios (itens, macros, efeitos, etc);
- `icons/` e `fonts/`: ativos visuais.

## 🛠️ Instalação

### Opção A — Instalação por Manifest URL (recomendada)

No Foundry:
1. Vá em **Game Systems**;
2. Clique em **Install System**;
3. Cole a URL do manifesto:

```txt
https://raw.githubusercontent.com/V3-code/GUM/master/system.json
```

4. Confirme a instalação.

### Opção B — Instalação manual

1. Baixe o `.zip` da release;
2. Extraia na pasta `Data/systems/gum`;
3. Reinicie o Foundry;
4. Selecione o sistema GUM ao criar/editar um mundo.

## 🔄 Atualização

- Atualizações via Foundry dependem do campo `download` no manifesto;
- Cada release deve publicar o arquivo `gum.zip`;
- Consulte o histórico em [`CHANGELOG.md`](CHANGELOG.md).

## 📋 Troubleshooting

Se algo não carregar corretamente:

1. Verifique se está no Foundry v12 ou v13;
2. Abra o console do navegador (F12) e confira erros;
3. Faça refresh forçado (Ctrl+F5);
4. Teste em um mundo novo sem módulos de terceiros ativos.

Se persistir, abra issue em:  
👉 https://github.com/V3-code/GUM/issues

## 🤝 Versionamento e releases

O projeto segue SemVer (`MAJOR.MINOR.PATCH`) e um fluxo de release documentado em [`RELEASE.md`](RELEASE.md).

## 📌 Licença

Este projeto está licenciado sob **CC BY-NC-ND 4.0**.  
Consulte os detalhes em [`LICENSE.md`](LICENSE.md).

## 📬 Contato

- GitHub: https://github.com/V3-code
- Issues: https://github.com/V3-code/GUM/issues

## 📚 Créditos e direitos

GURPS © Steve Jackson Games.  
Este sistema é uma adaptação feita por fãs, distribuída gratuitamente.