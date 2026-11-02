export class GMMacroBrowser extends FormApplication {
    constructor(options = {}) {
        super({}, options);
        this.onSelect = options.onSelect;
        this.macros = [];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: game.i18n.localize("GUM.GMScreen.MacroBrowserTitle"),
            classes: ["gum", "gm-macro-browser", "theme-dark"],
            template: "systems/gum/templates/apps/gm-macro-browser.hbs",
            width: 720,
            height: 620,
            resizable: true
        });
    }

    async getData() {
        const context = await super.getData();
        this.macros = Array.from(game.macros || [])
            .filter(macro => macro.visible !== false)
            .sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang || undefined, { sensitivity: "base" }));
        context.macros = this.macros.map(macro => ({
            id: macro.id,
            uuid: macro.uuid,
            name: macro.name,
            img: macro.img,
            type: macro.type,
            typeLabel: game.i18n.localize(macro.type === "chat" ? "GUM.GMScreen.MacroTypeChat" : "GUM.GMScreen.MacroTypeScript"),
            folderName: macro.folder?.name || "",
            canExecute: macro.canExecute
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
        html.find('.browser-open-macro').click(event => {
            event.preventDefault();
            event.stopPropagation();
            game.macros.get($(event.currentTarget).data('macro-id'))?.sheet?.render(true);
        });
    }

    async _updateObject(_event, formData) {
        const ids = Object.entries(formData)
            .filter(([key, value]) => key.startsWith('macro-') && value === true)
            .map(([key]) => key.slice('macro-'.length));
        const selected = ids.map(id => game.macros.get(id)).filter(Boolean);
        if (!selected.length) return ui.notifications.warn(game.i18n.localize("GUM.GMScreen.NoMacrosSelected"));
        await this.onSelect?.(selected);
    }
}
