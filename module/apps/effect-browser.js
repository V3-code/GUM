// GUM/module/apps/effect-browser.js

// ✅ PASSO 1: Mudar o nome da classe de ModifierBrowser para EffectBrowser

const EFFECT_TYPE_LABELS = {
    attribute: "Atributo",
    flag: "Flag",
    roll_modifier: "Modificador de Rolagem",
    status: "Status"
};

const getEffectTypeLabel = (type) => EFFECT_TYPE_LABELS[type] || type || "-";

const getPrimaryRollModifierValue = (system = {}) => {
    const first = Array.isArray(system.roll_modifier_entries) && system.roll_modifier_entries.length ? system.roll_modifier_entries[0] : null;
    const value = first?.value ?? system.roll_modifier_value ?? system.roll_modifier ?? null;
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return value > 0 ? `+${value}` : `${value}`;
    const raw = `${value}`.trim();
    if (!raw) return null;
    if (/^[+-]?\d+(\.\d+)?$/.test(raw)) {
        const asNumber = Number(raw);
        return asNumber > 0 ? `+${asNumber}` : `${asNumber}`;
    }
    return raw;
};

const parseReferenceCodes = (rawRef) => {
    const text = (rawRef ?? "").toString().trim().toUpperCase();
    if (!text) return [];
    return text
        .split(/[,;]+|\s+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map((part) => {
            const match = part.replace(/\s+/g, "").match(/^([A-Z]+)(\d+)$/);
            if (!match) return null;
            return { code: match[1], page: Number(match[2]) };
        })
        .filter(Boolean);
};

export class EffectBrowser extends FormApplication {
constructor(targetItem, options = {}) {
    super({}, options); // Usamos um objeto vazio como base
    this.targetItem = targetItem;
    // Armazena o callback se ele for passado nas opções
    this.onSelect = options.onSelect; 
    this.allEffects = [];
    this.availableFolders = [];
}

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      // ✅ PASSO 1: Atualizar título, classes e arquivo de template
      title: "Navegador de Efeitos",
      classes: ["gum", "effect-browser", "theme-dark"], // Classe CSS atualizada
      template: "systems/gum/templates/apps/effect-browser.hbs", // Arquivo .hbs atualizado
      width: 700, height: 500, resizable: true
    });
  }

async getData() {
    const context = await super.getData();
    context.targetItem = this.targetItem;
    
    const pack = game.packs.get("gum.efeitos");
    if (pack) {
        const folderMap = new Map();
        for (const folder of pack.folders ?? []) {
            folderMap.set(folder.id, folder.name);
        }

        this.allEffects = await pack.getDocuments();
        this.allEffects = this.allEffects.map(item => ({
            id: item.id,
            uuid: item.uuid, // ✅ LINHA CRUCIAL QUE FALTAVA
            name: item.name, 
            system: item.system, 
            img: item.img,
            folderId: item.folder?.id ?? item.folder ?? item._source?.folder ?? null,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        }));
        this.allEffects.sort((a, b) => a.name.localeCompare(b.name));

        const usedFolderIds = new Set(this.allEffects.map(effect => effect.folderId).filter(Boolean));
        this.availableFolders = Array.from(usedFolderIds)
          .map(folderId => ({ id: folderId, name: folderMap.get(folderId) ?? "Pasta" }))
          .sort((a, b) => a.name.localeCompare(b.name));
    }
    context.effects = this.allEffects; 
    context.folders = this.availableFolders;
    return context;
}

activateListeners(html) {
    super.activateListeners(html);
    
    // ✅ AGORA O LISTENER OBSERVA MUDANÇAS EM QUALQUER INPUT DA SIDEBAR ✅
    html.find('.browser-sidebar input').on('keyup change', this._onFilterResults.bind(this));
    
    
    html.find('input[name="search"]').on('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
    });

    html.find('.result-item').on('click', ev => {
        if ($(ev.target).closest('input, button').length) return;
        const checkbox = $(ev.currentTarget).find('input[type="checkbox"]');
        const isChecked = !checkbox.prop('checked');
        checkbox.prop('checked', isChecked);
        $(ev.currentTarget).toggleClass('selected', isChecked);
    });

    html.find('.results-list input[type="checkbox"]').on('change', ev => {
        const li = $(ev.currentTarget).closest('.result-item');
        li.toggleClass('selected', ev.currentTarget.checked);
    });

    html.find('.browser-quick-view').on('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const li = $(ev.currentTarget).closest('.result-item');
        const effectId = li.data('itemId');
        const effect = this.allEffects.find(e => e.id === effectId);
        if (effect) await this._showQuickView(effect);
    });
  }

_onFilterResults(event) {
    const form = this.form;
    const resultsList = form.querySelector(".results-list");
    
    // Lê o valor da busca por nome
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();
    const selectedFolders = new Set(
        Array.from(form.querySelectorAll('[name="filter-folder"]:checked')).map(input => input.value)
    );
    const hasFolderFilter = selectedFolders.size > 0;

    // ✅ LÊ O ESTADO DE CADA CHECKBOX DE FILTRO DE TIPO ✅
    const typesToShow = {
        attribute: form.querySelector('[name="filter-attribute"]').checked,
        status: form.querySelector('[name="filter-status"]').checked,
        roll_modifier: form.querySelector('[name="filter-roll_modifier"]').checked,
        chat: form.querySelector('[name="filter-chat"]').checked,
        macro: form.querySelector('[name="filter-macro"]').checked,
        flag: form.querySelector('[name="filter-flag"]').checked
    };

    // Verifica se algum filtro de tipo está ativo. Se nenhum estiver, mostra todos.
    const hasActiveTypeFilter = Object.values(typesToShow).some(v => v);

    for (const li of resultsList.children) {
        if (li.classList.contains("placeholder-text")) continue;
        
        const effectId = li.querySelector('input[type="checkbox"]').name;
        const effect = this.allEffects.find(e => e.id === effectId);
        if (!effect) continue;

        let isVisible = true;

        // 1. Aplica o filtro de busca por nome
        if (searchQuery && !effect.name.toLowerCase().includes(searchQuery)) {
            isVisible = false;
        }

        // 2. Aplica o filtro de tipo, se houver algum ativo
        if (hasActiveTypeFilter && !typesToShow[effect.system.type]) {
            isVisible = false;
        }

        // 3. Aplica o filtro de pasta
        if (isVisible && hasFolderFilter && !selectedFolders.has(effect.folderId)) {
            isVisible = false;
        }

      li.style.display = isVisible ? "grid" : "none";
    }
}

  async _showQuickView(effectData) {
      const effect = effectData?.uuid ? (await fromUuid(effectData.uuid).catch(() => null)) || effectData : effectData;
      const system = effect?.system || {};
      const createTag = (label, value) => {
        if (value !== null && value !== undefined && value !== "") {
            return `<div class="property-tag"><label>${label}</label><span>${value}</span></div>`;
        }
        return "";
      };
      const createRefTag = (value) => {
        const ref = (value ?? "").toString().trim();
        if (!ref) return "";
        return `<div class="property-tag"><label>REF</label><span><a href="#" class="quick-open-reference" data-ref="${foundry.utils.escapeHTML(ref)}">${foundry.utils.escapeHTML(ref)}</a></span></div>`;
      };

      const effectRef = system.ref ?? system.reference;
      const tags = [
        createTag("Tipo", getEffectTypeLabel(system.type)),
        createTag("Modificador", getPrimaryRollModifierValue(system)),
        createRefTag(effectRef)
      ].join("");

      const quickDescriptionSource = (system.chat_description ?? "").toString().trim()
        ? system.chat_description
        : (system.description || system.notes || "<i>Sem descrição.</i>");
      const description = await TextEditor.enrichHTML(quickDescriptionSource, { async: true });

      const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card" data-item-id="${effect?.id ?? ""}">
                <header class="preview-header">
                    <img src="${effect?.img || "icons/svg/mystery-man.svg"}" class="header-icon"/>
                    <div class="header-text">
                        <h3>${effect?.name || "Efeito"}</h3>
                        <span class="preview-item-type">Efeito</span>
                    </div>
                    <div class="header-controls">
                        <a class="send-to-chat" title="Enviar para o Chat"><i class="fas fa-comment"></i></a>
                    </div>
                </header>
                <div class="preview-content">
                    <div class="preview-properties">${tags}</div>
                    <hr class="preview-divider">
                    <div class="preview-description">${description}</div>
                </div>
            </div>
        </div>
      `;

      new Dialog({
        title: `Detalhes: ${effect?.name || "Efeito"}`,
        content,
        buttons: {},
        default: "",
        render: (dlgHtml) => {
          dlgHtml.on("click", ".quick-open-reference", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const rawRef = (event.currentTarget?.dataset?.ref ?? "").toString().trim();
            const parsed = parseReferenceCodes(rawRef);
            if (!parsed.length) return ui.notifications.warn("Formato de REF inválido. Use ex.: BA23 ou BA23, MA45.");
            const target = parsed[0];
            const journals = game.journal ? Array.from(game.journal) : [];
            for (const journal of journals) {
              const pages = journal?.pages ? Array.from(journal.pages) : [];
              const pdfPage = pages.find((p) => p?.type === "pdf" && ((p.getFlag("gum", "pdfCode") ?? "").toString().trim().toUpperCase() === target.code));
              if (!pdfPage) continue;
              const pageOffset = Number(pdfPage.getFlag("gum", "pageOffset") ?? 0);
              const targetPage = Math.max(1, target.page + pageOffset);
              await journal.sheet.render(true, { pageId: pdfPage.id, mode: "view" });
              Hooks.once("renderJournalSheet", () => {
                const frames = Array.from(document.querySelectorAll('iframe[src*="pdfjs" i], iframe[src*="viewer.html" i]'));
                for (const frame of frames) {
                  const src = frame.getAttribute("src") || "";
                  if (!src.includes("#")) continue;
                  const [base, hash = ""] = src.split("#");
                  const params = new URLSearchParams(hash);
                  params.set("page", String(targetPage));
                  frame.setAttribute("src", `${base}#${params.toString()}`);
                }
              });
              return;
            }
            ui.notifications.warn(`Nenhum PDF com código "${target.code}" foi encontrado nos periódicos.`);
          });
        }
      }, {
        classes: ["gurps-item-preview-dialog"],
        width: 480,
        height: "auto",
        resizable: true
      }).render(true);
  }

  // ✅ PASSO 3: Reescrever a lógica de salvamento
  async _updateObject(event, formData) {
      const selectedIds = Object.keys(formData).filter(key => formData[key] === true && key.length === 16);
      if (selectedIds.length === 0) return ui.notifications.warn("Nenhum efeito foi selecionado.");
      
      const selectedEffects = selectedIds.map(id => this.allEffects.find(e => e.id === id)).filter(e => e);

      // ✅ LÓGICA CORRIGIDA: Se um callback onSelect existir, execute-o.
      if (this.onSelect) {
          // Isso executa a lógica que está dentro da ficha do item (GurpsItemSheet)
          this.onSelect(selectedEffects);
      } else {
          // Lógica antiga para a ficha de Condição
          const existingEffects = this.targetItem.system.effects || [];
          for (const sourceEffect of selectedEffects) {
            const newEffectData = { ...sourceEffect.system, name: sourceEffect.name, sourceUuid: sourceEffect.uuid };
            existingEffects.push(newEffectData);
          }
          await this.targetItem.update({ "system.effects": existingEffects });
          ui.notifications.info(`${selectedEffects.length} efeito(s) adicionado(s).`);
      }
  }
}