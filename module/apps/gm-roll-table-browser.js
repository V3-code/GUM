export class GMRollTableBrowser extends FormApplication {
    constructor(options = {}) {
        super({}, options);
        this.onSelect = options.onSelect;
        this.tables = [];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: game.i18n.localize("GUM.GMScreen.RollTableBrowserTitle"),
            classes: ["gum", "gm-roll-table-browser", "theme-dark"],
            template: "systems/gum/templates/apps/gm-roll-table-browser.hbs",
            width: 720,
            height: 620,
            resizable: true
        });
    }

    async getData() {
        const context = await super.getData();
        this.tables = Array.from(game.tables || [])
            .filter(table => table.visible !== false)
            .sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang || undefined, { sensitivity: "base" }));
        context.tables = this.tables.map(table => ({
            id: table.id,
            uuid: table.uuid,
            name: table.name,
            img: table.img,
            formula: table.formula || "1d20",
            folderName: table.folder?.name || ""
        }));
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const applyFilter = () => {
            const query = String(html.find('[name="search"]').val() || "").trim().toLocaleLowerCase(game.i18n?.lang || undefined);
            html.find('.result-item').each((_index, element) => {
                const haystack = String(element.dataset.search || "").toLocaleLowerCase(game.i18n?.lang || undefined);
                element.style.display = !query || haystack.includes(query) ? "grid" : "none";
            });
        };
        html.find('[name="search"]').on('input', applyFilter).on('keydown', event => {
            if (event.key === 'Enter') event.preventDefault();
        });
        html.find('.result-item').click(event => {
            if ($(event.target).closest('button, input').length) return;
            const checkbox = $(event.currentTarget).find('input[type="checkbox"]');
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        });
        html.find('.result-item input[type="checkbox"]').on('change', event => {
            $(event.currentTarget).closest('.result-item').toggleClass('selected', event.currentTarget.checked);
        });
        html.find('.browser-open-roll-table').click(event => {
            event.preventDefault();
            event.stopPropagation();
            game.tables.get($(event.currentTarget).data('table-id'))?.sheet?.render(true);
        });
    }

    async _updateObject(_event, formData) {
        const ids = Object.entries(formData)
            .filter(([key, value]) => key.startsWith('roll-table-') && value === true)
            .map(([key]) => key.slice('roll-table-'.length));
        const selected = ids.map(id => game.tables.get(id)).filter(Boolean);
        if (!selected.length) return ui.notifications.warn(game.i18n.localize("GUM.GMScreen.NoRollTablesSelected"));
        await this.onSelect?.(selected);
    }
}
