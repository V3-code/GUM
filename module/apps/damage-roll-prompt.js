export class GurpsDamageRollPrompt extends FormApplication {
    constructor(options = {}) {
        super(options);
        this.damageData = options.damageData || {};
        this.onRoll = options.onRoll;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Configurar Rolagem de Dano",
            id: "gurps-damage-roll-prompt",
            template: "systems/gum/templates/apps/damage-roll-prompt.hbs",
            width: 460,
            height: "auto",
            classes: ["gum", "damage-roll-prompt", "theme-dark"],
            closeOnSubmit: true
        });
    }

    static async prompt(damageData = {}) {
        return new Promise((resolve) => {
            const app = new GurpsDamageRollPrompt({
                damageData,
                onRoll: (result) => resolve(result)
            });
            app._resolvePrompt = resolve;
            app.render(true);
        });
    }

    getData() {
        const main = this.damageData.main || {};
        const followUp = this.damageData.followUp || {};
        const fragmentation = this.damageData.fragmentation || {};

        return {
            sourceName: this.damageData.sourceName || "Rolagem de Dano",
            main,
            followUp,
            fragmentation,
            mainTypeLocked: !!main.type,
            followUpTypeLocked: !!followUp.type,
            fragmentationTypeLocked: !!fragmentation.type
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find("input[data-formula-input='true']").on("input", () => this._validateForm(html));
        html.find("[data-type-input='true']").on("input change", () => this._validateForm(html));
        html.find("button[data-action='cancel']").on("click", (ev) => { ev.preventDefault(); this.close(); });
        this._validateForm(html);
    }

    async _updateObject(_event, formData) {
        const result = this._buildResult(formData);
        if (!result.valid) {
            ui.notifications.warn(result.error || "Revise os campos de dano adicional.");
            return;
        }

        if (typeof this.onRoll === "function") {
            await this.onRoll(result.payload);
        }
    }

    async close(options = {}) {
        if (!this._submitted && typeof this._resolvePrompt === "function") {
            this._resolvePrompt(null);
            this._resolvePrompt = null;
        }
        return super.close(options);
    }

    async submit(...args) {
        this._submitted = true;
        return super.submit(...args);
    }

    _isValidAdditionalFormula(value) {
        const raw = String(value || "").trim();
        if (!raw) return true;
        const normalized = raw.replace(/\s+/g, "").replace(/[dD]/g, "d");
        return /^[+\-]?((\d*d\d+)|\d+)([+\-]((\d*d\d+)|\d+))*$/.test(normalized);
    }

    _validateForm(html) {
        let valid = true;

        html.find("input[data-formula-input='true']").each((_i, el) => {
            const $el = $(el);
            const expr = $el.val();
            const ok = this._isValidAdditionalFormula(expr);
            $el.toggleClass("is-invalid", !ok);
            if (!ok) valid = false;

            const row = $el.closest(".damage-row");
            const typeInput = row.find("[data-type-input='true']");
            const needsType = String(expr || "").trim().length > 0 && typeInput.length > 0;
            if (needsType && !typeInput.val()) {
                typeInput.addClass("is-invalid");
                valid = false;
            } else {
                typeInput.removeClass("is-invalid");
            }
        });

        html.find("button[type='submit']").prop("disabled", !valid);
        return valid;
    }

    _normalizeAdditionalFormula(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        const compact = raw.replace(/\s+/g, "");
        if (/^[+\-]/.test(compact)) return compact;
        return `+${compact}`;
    }

    _buildResult(formData) {
        const mainExpr = String(formData.mainAdditional || "").trim();
        const followExpr = String(formData.followUpAdditional || "").trim();
        const fragExpr = String(formData.fragmentationAdditional || "").trim();

        const sections = [
            { key: "main", expr: mainExpr, type: this.damageData.main?.type || "", fallbackType: "" },
            { key: "followUp", expr: followExpr, type: this.damageData.followUp?.type || formData.followUpType || "", fallbackType: formData.followUpType || "" },
            { key: "fragmentation", expr: fragExpr, type: this.damageData.fragmentation?.type || formData.fragmentationType || "", fallbackType: formData.fragmentationType || "" }
        ];

        for (const section of sections) {
            if (!this._isValidAdditionalFormula(section.expr)) {
                return { valid: false, error: `Expressão inválida em ${section.key}.` };
            }
            if (section.expr && !section.type) {
                return { valid: false, error: `Selecione o tipo de dano para ${section.key}.` };
            }
        }

        return {
            valid: true,
            payload: {
                mainAdditional: this._normalizeAdditionalFormula(mainExpr),
                followUpAdditional: this._normalizeAdditionalFormula(followExpr),
                fragmentationAdditional: this._normalizeAdditionalFormula(fragExpr),
                followUpType: sections[1].type,
                fragmentationType: sections[2].type
            }
        };
    }
}