// GUM/scripts/apps/trigger-sheet.js

export class TriggerSheet extends ItemSheet {
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "trigger-sheet", "theme-dark"],
            width: 535,
            height: 378,
            resizable: true,
            template: "systems/gum/templates/items/trigger-sheet.hbs"
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        return context;
    }
}