export class TemplateBrowser extends FormApplication {
  constructor(actor, options = {}) {
    super({}, options);
    this.actor = actor;
    this.onSelect = options.onSelect;
    this.allTemplates = [];
    this.availableFolders = [];
    this.templatePackId = options.templatePackId || "gum.templates";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Navegador de Modelos",
      classes: ["gum", "template-browser", "theme-dark"],
      template: "systems/gum/templates/apps/template-browser.hbs",
      width: 760,
      height: 560,
      resizable: true
    });
  }

  async getData() {
    const context = await super.getData();
    const records = [];

    const templatePack = game.packs.get(this.templatePackId);
    if (!templatePack) {
      ui.notifications.warn("Compêndio de Modelos não encontrado. Verifique se o pack 'templates' está habilitado.");
    } else {
      let docs = [];
      try {
        docs = await templatePack.getDocuments();
      } catch (err) {
        console.warn(`GUM | Falha ao ler compêndio ${templatePack.collection}`, err);
      }

      const templates = docs.filter(doc => doc.type === "template");
      const folderInfoById = this._buildCompendiumFolderIndex(templatePack.folders ?? []);
      for (const item of templates) {
        const folderId = item.folder?.id ?? item.folder ?? item._source?.folder ?? null;
        const folderTrail = this._getCompendiumFolderTrail(folderId, folderInfoById);
        records.push({
          id: `${templatePack.collection}:${item.id}`,
          uuid: item.uuid,
          name: item.name,
          system: item.system,
          img: item.img,
          sourceLabel: templatePack.metadata?.label ?? templatePack.collection,
          folderId,
          folderTrail,
          folderLabel: this._getCompendiumFolderPath(folderId, folderInfoById),
          displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        });
      }
    }

    records.sort((a, b) => a.name.localeCompare(b.name));
    this.allTemplates = records;
    this.availableFolders = this._collectFolders(records);

    context.templates = this.allTemplates;
    context.folders = this.availableFolders;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".browser-sidebar input").on("keyup change", this._onFilterResults.bind(this));
    html.find('input[name="search"]').on("keydown", event => {
      if (event.key === "Enter") event.preventDefault();
    });

    html.find(".result-item").on("click", ev => {
      if ($(ev.target).closest("input, button").length) return;
      const radio = $(ev.currentTarget).find('input[type="radio"]');
      radio.prop("checked", true).trigger("change");
    });

    html.find('.results-list input[type="radio"]').on("change", ev => {
      html.find(".result-item").removeClass("selected");
      const li = $(ev.currentTarget).closest(".result-item");
      li.addClass("selected");
    });

    html.find(".browser-quick-view").on("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).closest(".result-item");
      const templateId = li.data("itemId");
      const template = this.allTemplates.find(t => t.id === templateId);
      if (template) await this._showQuickView(template);
    });
  }

  _onFilterResults() {
    const form = this.form;
    const resultsList = form.querySelector(".results-list");
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();

    const selectedFolders = new Set(
      Array.from(form.querySelectorAll('[name="filter-folder"]:checked')).map(input => input.value)
    );
    const hasFolderFilter = selectedFolders.size > 0;

    for (const li of resultsList.children) {
      if (li.classList.contains("placeholder-text")) continue;

      const templateId = li.querySelector('input[type="radio"]').value;
      const template = this.allTemplates.find(t => t.id === templateId);
      if (!template) continue;

      let isVisible = true;

      if (searchQuery && !template.name.toLowerCase().includes(searchQuery)) {
        isVisible = false;
      }

      if (isVisible && hasFolderFilter) {
        const trail = new Set((template.folderTrail || []).map(node => node.id));
        const match = Array.from(selectedFolders).some(folderId => trail.has(folderId));
        if (!match) isVisible = false;
      }

      li.style.display = isVisible ? "grid" : "none";
    }
  }

  async _showQuickView(templateData) {
    const template = templateData?.uuid ? (await fromUuid(templateData.uuid).catch(() => null)) || templateData : templateData;
    const system = template?.system || {};
    const blocks = system.blocks || [];

    const content = `
      <div class="gurps-dialog-canvas">
        <div class="gurps-item-preview-card">
          <header class="preview-header">
            <h3>${template?.name || "Modelo"}</h3>
            <div class="header-controls"><span class="preview-item-type">Modelo</span></div>
          </header>
          <div class="preview-content">
            <div class="preview-properties">
              <div class="property-tag"><label>Categoria</label><span>${system.model_category || "generic"}</span></div>
              <div class="property-tag"><label>Blocos</label><span>${blocks.length}</span></div>
              <div class="property-tag"><label>Origem</label><span>${templateData.sourceLabel || "-"}</span></div>
              <div class="property-tag"><label>Pasta</label><span>${templateData.folderLabel || "Sem pasta"}</span></div>
            </div>
          </div>
        </div>
      </div>
    `;

    new Dialog({
      title: `Detalhes: ${template?.name || "Modelo"}`,
      content,
      buttons: { close: { label: "Fechar" } },
      default: "close",
      options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 420 }
    }).render(true);
  }

  async _updateObject(_event, formData) {
    const selectedId = formData.selectedTemplate;
    if (!selectedId) return ui.notifications.warn("Nenhum Modelo foi selecionado.");

    const selectedTemplate = this.allTemplates.find(entry => entry.id === selectedId);
    if (!selectedTemplate) return ui.notifications.error("Modelo selecionado não encontrado.");

    if (this.onSelect) {
      this.onSelect(selectedTemplate);
    }
  }

  _collectFolders(records) {
    const map = new Map();
    for (const record of records) {
      const trail = record.folderTrail || [];
      for (const node of trail) {
        if (!map.has(node.id)) {
          map.set(node.id, { id: node.id, name: node.pathName || node.name });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  _buildCompendiumFolderIndex(folders) {
    const map = new Map();
    for (const folder of folders) {
      map.set(folder.id, {
        id: folder.id,
        name: folder.name,
        parentId: folder.folder?.id ?? folder.folder ?? folder._source?.folder ?? null
      });
    }
    return map;
  }

  _getCompendiumFolderTrail(folderId, folderInfoById) {
    if (!folderId) return [];

    const nodes = [];
    let cursorId = folderId;
    while (cursorId) {
      const node = folderInfoById.get(cursorId);
      if (!node) break;
      nodes.unshift({ id: `pack:${node.id}`, name: node.name });
      cursorId = node.parentId;
    }

    return nodes.map((entry, idx) => ({
      ...entry,
      depth: idx,
      pathName: nodes.slice(0, idx + 1).map(n => n.name).join(" / ")
    }));
  }

  _getCompendiumFolderPath(folderId, folderInfoById) {
    if (!folderId) return "";

    const names = [];
    let cursorId = folderId;
    while (cursorId) {
      const node = folderInfoById.get(cursorId);
      if (!node) break;
      names.unshift(node.name);
      cursorId = node.parentId;
    }

    return names.join(" / ");
  }
}