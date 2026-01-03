// GUM/module/apps/trigger-browser.js

// ✅ Alterado para FormApplication para lidar com o envio do formulário
export class TriggerBrowser extends FormApplication {
  
  constructor(textarea, options = {}) {
    super(options);
    this.textarea = textarea; // O campo de texto que vamos preencher
    this.allTriggers = [];
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
        this.allTriggers = (await pack.getDocuments()).map(item => ({
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            system: item.system,
            img: item.img,
            displayImg: item.img !== "icons/svg/mystery-man.svg" ? item.img : null
        }));
        this.allTriggers.sort((a, b) => a.name.localeCompare(b.name));
    }
    context.triggers = this.allTriggers; 
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    // Listener para a busca por nome permanece o mesmo
    html.find('input[name="search"]').on('keyup change', this._onFilterResults.bind(this));

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
    const searchQuery = $(event.currentTarget).val().toLowerCase();
    const resultsList = this.element.find(".results-list li");

    for (let li of resultsList) {
        const triggerName = $(li).find('.item-name').text().toLowerCase();
        li.style.display = triggerName.includes(searchQuery) ? "grid" : "none";
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