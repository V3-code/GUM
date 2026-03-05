// GUM/module/apps/trigger-browser.js

// ✅ Alterado para FormApplication para lidar com o envio do formulário
export class TriggerBrowser extends FormApplication {
  
  constructor(textarea, options = {}) {
    super(options);
    this.textarea = textarea; // O campo de texto que vamos preencher
    this.allTriggers = [];
    this.availableFolders = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Navegador de Gatilhos",
      classes: ["gum", "trigger-browser", "theme-dark"],
      template: "systems/gum/templates/apps/trigger-browser.hbs",
      width: 700, height: 500, resizable: true
    });
  }

async getData() {
    const context = await super.getData();
    
    const pack = game.packs.get("gum.gatilhos");
    if (pack) {
        const folderMap = new Map();
        for (const folder of pack.folders ?? []) {
            folderMap.set(folder.id, folder.name);
        }

        this.allTriggers = (await pack.getDocuments()).map(item => ({
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            system: item.system,
            img: item.img,
            folderId: item.folder?.id ?? item.folder ?? item._source?.folder ?? null,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        }));
        this.allTriggers.sort((a, b) => a.name.localeCompare(b.name));

        const usedFolderIds = new Set(this.allTriggers.map(trigger => trigger.folderId).filter(Boolean));
        this.availableFolders = Array.from(usedFolderIds)
          .map(folderId => ({ id: folderId, name: folderMap.get(folderId) ?? "Pasta" }))
          .sort((a, b) => a.name.localeCompare(b.name));
    }
    context.triggers = this.allTriggers; 
    context.folders = this.availableFolders;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    // Listener para a busca por nome permanece o mesmo
    html.find('.browser-sidebar input').on('keyup change', this._onFilterResults.bind(this));

    html.find('.result-item').on('click', ev => {
        if ($(ev.target).closest('input, button').length) return;
        const radio = $(ev.currentTarget).find('input[type="radio"]');
        radio.prop('checked', true);
        html.find('.result-item').removeClass('selected');
        $(ev.currentTarget).addClass('selected');
    });

    html.find('.results-list input[type="radio"]').on('change', ev => {
        const li = $(ev.currentTarget).closest('.result-item');
        html.find('.result-item').removeClass('selected');
        li.addClass('selected');
    });

    html.find('.browser-quick-view').on('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const li = $(ev.currentTarget).closest('.result-item');
        const triggerId = li.data('itemId');
        const trigger = this.allTriggers.find(t => t.id === triggerId);
        if (trigger) await this._showQuickView(trigger);
    });
  }

  _onFilterResults(event) {
    const form = this.form;
    const searchQuery = form.querySelector('[name="search"]').value.toLowerCase();
    const selectedFolders = new Set(
      Array.from(form.querySelectorAll('[name="filter-folder"]:checked')).map(input => input.value)
    );
    const hasFolderFilter = selectedFolders.size > 0;
    const resultsList = this.element.find(".results-list li");

    for (let li of resultsList) {
        if (li.classList.contains("placeholder-text")) continue;
        const triggerId = li.querySelector('input[type="radio"]').value;
        const trigger = this.allTriggers.find(t => t.id === triggerId);
        if (!trigger) continue;
        const triggerName = $(li).find('.item-name').text().toLowerCase();
        let isVisible = triggerName.includes(searchQuery);
        if (isVisible && hasFolderFilter && !selectedFolders.has(trigger.folderId)) isVisible = false;
        li.style.display = isVisible ? "grid" : "none";
    }
  }

  /**
   * ✅ Esta função é chamada quando o botão "Inserir Gatilho" é clicado.
   * @param {Event} event O evento do formulário.
   * @param {object} formData Os dados do formulário, contendo o gatilho selecionado.
   */
  async _updateObject(event, formData) {
    const selectedTriggerId = formData.triggerSelection;
    if (!selectedTriggerId) {
        return ui.notifications.warn("Nenhum gatilho foi selecionado.");
    }

    const trigger = this.allTriggers.find(t => t.id === selectedTriggerId);
    if (!trigger) return;

    const code = trigger.system.code;
    const textarea = this.textarea;

    // Lógica para inserir o texto no campo
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
     textarea.value = textarea.value.substring(0, start) + code + textarea.value.substring(end);
    
    const newCursorPos = start + code.length;
    textarea.focus();
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }

  async _showQuickView(triggerData) {
      const trigger = triggerData?.uuid ? (await fromUuid(triggerData.uuid).catch(() => null)) || triggerData : triggerData;
      const system = trigger?.system || {};
      const description = await TextEditor.enrichHTML(system.description || "<i>Sem descrição.</i>", { async: true });

      const content = `
        <div class="gurps-dialog-canvas">
            <div class="gurps-item-preview-card">
                <header class="preview-header">
                    <h3>${trigger?.name || "Gatilho"}</h3>
                    <div class="header-controls"><span class="preview-item-type">Gatilho</span></div>
                </header>
                <div class="preview-content">
                    <div class="preview-description">${description}</div>
                    ${system.code ? `<pre class="preview-code">${system.code}</pre>` : ""}
                </div>
            </div>
        </div>
      `;

      new Dialog({
        title: `Detalhes: ${trigger?.name || "Gatilho"}`,
        content,
        buttons: { close: { label: "Fechar" } },
        default: "close",
        options: { classes: ["dialog", "gurps-item-preview-dialog"], width: 420 }
      }).render(true);
  }
}