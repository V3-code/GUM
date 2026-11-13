import { EFFECT_EXCLUSION_SETTING, normalizeEffectExclusionGroups } from "../utils/effect-exclusion.mjs";

export class EffectExclusionConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "gum-effect-exclusion-config",
      title: "Grupos de exclusão de efeitos",
      template: "systems/gum/templates/apps/effect-exclusion-config.hbs",
      classes: ["gum", "effect-exclusion-config", "theme-dark"],
      width: 760,
      height: 560,
      resizable: true,
      scrollY: [".effect-exclusion-list"],
      closeOnSubmit: false
    });
  }

  getData() {
    return { groups: normalizeEffectExclusionGroups(game.settings.get("gum", EFFECT_EXCLUSION_SETTING))
      .map(group => ({ ...group, uuidLines: group.effectUuids.join("\n") })) };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-add-group]").on("click", () => {
      html.find(".effect-exclusion-empty").remove();
      html.find("[data-groups]").append(`<section class="effect-exclusion-row" data-exclusion-group><div class="effect-exclusion-row-header"><label>Grupo<input type="text" data-group-name placeholder="Nome do grupo"/></label><button type="button" data-remove-group title="Remover grupo"><i class="fas fa-trash"></i> Remover</button></div><label>Itens Efeito <small>(um UUID por linha)</small><textarea data-group-uuids rows="4" placeholder="Compendium.world.effects.Item.…"></textarea></label></section>`);
    });
    html.on("click", "[data-remove-group]", event => event.currentTarget.closest("[data-exclusion-group]")?.remove());
    html.find("[data-save-groups]").on("click", async () => {
      try {
        const groups = Array.from(html[0].querySelectorAll("[data-exclusion-group]"), (element, index) => ({
          id: element.dataset.groupId || foundry.utils.randomID(),
          name: element.querySelector("[data-group-name]").value.trim(),
          effectUuids: element.querySelector("[data-group-uuids]").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
        }));
        if (groups.some(group => !group.name || group.effectUuids.length < 2)) throw new Error("Cada grupo precisa de nome e pelo menos dois Itens Efeito.");
        const normalized = normalizeEffectExclusionGroups(groups);
        for (const group of normalized) for (const uuid of group.effectUuids) {
          const item = await fromUuid(uuid).catch(() => null);
          if (item?.type !== "effect") throw new Error(`Item Efeito não encontrado: ${uuid}`);
        }
        await game.settings.set("gum", EFFECT_EXCLUSION_SETTING, normalized);
        ui.notifications.info("Grupos de exclusão salvos.");
        this.render(false);
      } catch (error) {
        ui.notifications.error(error.message);
      }
    });
  }

  async _updateObject() {}
}
