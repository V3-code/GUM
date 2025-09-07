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
        this.allTriggers = await pack.getDocuments();
        this.allTriggers.sort((a, b) => a.name.localeCompare(b.name));
    }
    context.triggers = this.allTriggers; 
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    // Listener para a busca por nome permanece o mesmo
    html.find('input[name="search"]').on('keyup change', this._onFilterResults.bind(this));

    // O listener de clique no item foi removido, pois agora usamos o botão de submit.
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
}