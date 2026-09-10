import { listBodyLocations } from "../config/body-profiles.js";

const ATTRIBUTE_GROUPS = Object.freeze([
  { id: "primary", label: "Atributos primários", entries: [["st", "ST"], ["dx", "DX"], ["iq", "IQ"], ["ht", "HT"]] },
  { id: "secondary", label: "Atributos secundários", entries: [["vont", "Vontade"], ["per", "Percepção"], ["hp", "Pontos de Vida"], ["fp", "Pontos de Fadiga"], ["mt", "Margem de Tolerância"]] },
  { id: "movement", label: "Movimento e defesa", entries: [["basic_speed", "Velocidade Básica"], ["basic_move", "Deslocamento Básico"], ["enhanced_move", "Deslocamento Ampliado"], ["lifting_st", "ST de Levantamento"], ["dodge", "Esquiva"]] },
  { id: "senses", label: "Sentidos", entries: [["vision", "Visão"], ["hearing", "Audição"], ["tastesmell", "Olfato/Paladar"], ["touch", "Tato"]] },
  { id: "damage", label: "Dano básico", entries: [["thrust_damage", "GdP"], ["swing_damage", "GeB"], ["thrust_damage_alt", "GdPa"], ["swing_damage_alt", "GeBa"]] }
]);

const ATTRIBUTE_LAYERS = Object.freeze([
  { id: "passive", label: "Bônus passivo", operation: "ADD" },
  { id: "temp", label: "Bônus temporário", operation: "ADD" },
  { id: "override", label: "Definir valor", operation: "OVERRIDE" }
]);

export const DAMAGE_RESISTANCE_TYPES = Object.freeze([
  { id: "base", label: "RD base" }, { id: "cont", label: "Contusão" },
  { id: "cort", label: "Corte" }, { id: "perf", label: "Perfuração" },
  { id: "pi", label: "Perfurante" }, { id: "pi-", label: "Pouco perfurante" },
  { id: "pi+", label: "Muito perfurante" }, { id: "pi++", label: "Extremamente perfurante" },
  { id: "qmd", label: "Queimadura" }, { id: "cor", label: "Corrosão" }, { id: "tox", label: "Toxina" }
]);

export function buildAttributeEffectPathOptions() {
  return ATTRIBUTE_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    options: group.entries.flatMap(([key, label]) => ATTRIBUTE_LAYERS.map(layer => ({
      id: `${key}.${layer.id}`,
      label: `${label} — ${layer.label}`,
      path: `system.attributes.${key}.${layer.id}`,
      operation: layer.operation
    })))
  }));
}

export function buildDamageResistanceEffectPath({ location, damageType = "base", operation = "ADD", durationMode = "permanent" } = {}) {
  if (!location) return "";
  const layer = operation === "OVERRIDE" ? "overrides" : durationMode === "combat" ? "temp_mods" : "passive_mods";
  return `system.combat.dr_${layer}.${location}.${damageType || "base"}`;
}

export function findEffectPathOption(path) {
  return buildAttributeEffectPathOptions().flatMap(group => group.options).find(option => option.path === String(path ?? "").trim()) ?? null;
}

export function applyEffectPathSelection({ pathInput, operationInput, path, operation }) {
  if (!pathInput || !path) return;
  pathInput.value = path;
  if (operationInput && operation) operationInput.value = operation;
  const EventConstructor = pathInput.ownerDocument?.defaultView?.Event ?? globalThis.Event;
  pathInput.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  pathInput.dispatchEvent(new EventConstructor("change", { bubbles: true }));
  operationInput?.dispatchEvent(new EventConstructor("change", { bubbles: true }));
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const fold = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function openEffectPathPicker({ pathInput, operationInput, durationMode = "permanent" } = {}) {
  if (!pathInput) return null;
  const groups = buildAttributeEffectPathOptions();
  const locations = listBodyLocations();
  const selected = findEffectPathOption(pathInput.value);
  const optionMarkup = groups.map(group => `<details class="effect-path-group" open><summary>${escapeHtml(group.label)}</summary><div class="effect-path-options">${group.options.map(option => `<label class="effect-path-option${selected?.path === option.path ? " is-selected" : ""}" data-search="${escapeHtml(fold(`${option.label} ${option.path}`))}"><input type="radio" name="effect-path" value="${escapeHtml(option.path)}" data-operation="${option.operation}" ${selected?.path === option.path ? "checked" : ""}><span><strong>${escapeHtml(option.label)}</strong><code>${escapeHtml(option.path)}</code></span></label>`).join("")}</div></details>`).join("");
  const selectOptions = (items, selectedId) => items.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");

  const dialog = new Dialog({
    title: "Selecionar caminho do modificador",
    content: `<div class="gum-effect-path-picker"><p class="effect-path-intro">Escolha um destino suportado pelo sistema. A operação será ajustada automaticamente.</p><div class="effect-path-searchbox"><i class="fas fa-search" aria-hidden="true"></i><input type="search" placeholder="Buscar atributo ou caminho..." aria-label="Buscar caminho"></div><div class="effect-path-results">${optionMarkup}<details class="effect-path-group effect-path-dr"><summary>Resistência a Dano (RD)</summary><div class="effect-path-dr-grid"><label>Localização<select name="dr-location">${selectOptions(locations, "torso")}</select></label><label>Natureza<select name="dr-type">${selectOptions(DAMAGE_RESISTANCE_TYPES, "base")}</select></label><label>Aplicação<select name="dr-operation"><option value="ADD">Adicionar bônus</option><option value="OVERRIDE">Definir valor</option></select></label><button type="button" class="select-dr-path"><i class="fas fa-shield-halved"></i> Usar caminho de RD</button></div><code class="effect-path-dr-preview"></code></details><p class="effect-path-empty" hidden>Nenhum caminho encontrado.</p></div><p class="effect-path-custom-note"><i class="fas fa-code"></i> O campo continua editável para caminhos personalizados ou legados.</p></div>`,
    render: dialogHtml => {
      const root = dialogHtml.find(".gum-effect-path-picker");
      const refreshDrPreview = () => root.find(".effect-path-dr-preview").text(buildDamageResistanceEffectPath({ location: root.find('[name="dr-location"]').val(), damageType: root.find('[name="dr-type"]').val(), operation: root.find('[name="dr-operation"]').val(), durationMode }));
      root.on("input", ".effect-path-searchbox input", event => {
        const query = fold(event.currentTarget.value.trim());
        let visible = 0;
        root.find(".effect-path-option").each((_index, option) => { option.hidden = Boolean(query && !option.dataset.search.includes(query)); visible += option.hidden ? 0 : 1; });
        root.find(".effect-path-group:not(.effect-path-dr)").each((_index, group) => { group.hidden = !$(group).find(".effect-path-option:not([hidden])").length; if (query && !group.hidden) group.open = true; });
        root.find(".effect-path-dr").prop("hidden", Boolean(query));
        root.find(".effect-path-empty").prop("hidden", visible !== 0 || !query);
      });
      root.on("change", 'input[name="effect-path"]', event => { root.data("drSelection", false); root.find(".effect-path-option").removeClass("is-selected"); $(event.currentTarget).closest(".effect-path-option").addClass("is-selected"); });
      root.on("change", ".effect-path-dr select", refreshDrPreview);
      root.on("click", ".select-dr-path", () => { root.find('input[name="effect-path"]').prop("checked", false); root.data("drSelection", true); refreshDrPreview(); });
      refreshDrPreview();
      root.find(".effect-path-searchbox input").trigger("focus");
    },
    buttons: {
      apply: { icon: '<i class="fas fa-check"></i>', label: "Aplicar", callback: dialogHtml => {
        const root = dialogHtml.find(".gum-effect-path-picker");
        const chosen = root.find('input[name="effect-path"]:checked')[0];
        if (root.data("drSelection")) return applyEffectPathSelection({ pathInput, operationInput, path: root.find(".effect-path-dr-preview").text(), operation: root.find('[name="dr-operation"]').val() });
        if (chosen) applyEffectPathSelection({ pathInput, operationInput, path: chosen.value, operation: chosen.dataset.operation });
      } },
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancelar" }
    }, default: "apply"
  }, { classes: ["gum-effect-path-picker-window"], width: 720 });
  return dialog.render(true);
}