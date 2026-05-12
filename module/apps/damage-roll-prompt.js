export class GurpsDamageRollPrompt extends FormApplication {
    constructor(options = {}) {
        super(options);
        this.damageData = options.damageData || {};
        this.onRoll = options.onRoll;
        this._cleanFormula = (formula) => String(formula || "").replace(/[(){}\[\]]/g, "").replace(/\s+/g, "").trim();
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

        const visualCards = [
            {
                key: "main",
                label: "Dano Padrão",
                type: main.type,
                formula: this._simplifyFormula(this._cleanFormula(main.displayFormula)),
                tone: "standard"
            },
            {
                key: "fragmentation",
                label: "Dano de Fragmentação",
                type: fragmentation.type,
                formula: this._simplifyFormula(this._cleanFormula(fragmentation.displayFormula || fragmentation.formula)),
                tone: "fragmentation"
            },
            {
                key: "followUp",
                label: "Dano de Acompanhamento",
                type: followUp.type,
                formula: this._simplifyFormula(this._cleanFormula(followUp.displayFormula || followUp.formula)),
                tone: "followup"
            }
        ].filter((card) => card.formula);

        return {
            sourceName: this.damageData.sourceName || "Rolagem de Dano",
            main,
            followUp,
            fragmentation,
            visualCards,
            mainTypeLocked: !!main.type,
            followUpTypeLocked: !!followUp.type,
            fragmentationTypeLocked: !!fragmentation.type
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find("input[data-formula-input='true']").on("input", () => {
            this._validateForm(html);
            this._refreshVisualCards(html);
        });
        html.find("[data-type-input='true']").on("input change", () => {
            this._validateForm(html);
            this._refreshVisualCards(html);
        });
        html.find("button[data-action='cancel']").on("click", (ev) => { ev.preventDefault(); this.close(); });
        this._validateForm(html);
        this._refreshVisualCards(html);
    }

    _composeCardFormula(baseFormula, additionalFormula) {
        const base = this._cleanFormula(baseFormula);
        const addRaw = String(additionalFormula || "").trim();
        if (!addRaw) return this._simplifyFormula(base);
        const add = this._cleanFormula(addRaw);
        const normalizedAdd = /^[+\-]/.test(add) ? add : `+${add}`;
        return this._simplifyFormula(`${base}${normalizedAdd}`);
    }

    _simplifyFormula(formula) {
        const expr = this._cleanFormula(formula);
        if (!expr) return "";

        const tokenPattern = /([+\-]?)(\d*d\d+|\d+)/gi;
        const diceTerms = new Map();
        let constant = 0;
        let matchCount = 0;
        let consumed = "";

        let match;
        while ((match = tokenPattern.exec(expr)) !== null) {
            const sign = match[1] === "-" ? -1 : 1;
            const token = match[2].toLowerCase();
            matchCount += 1;
            consumed += `${match[1]}${match[2]}`;

            if (token.includes("d")) {
                const [countRaw, sidesRaw] = token.split("d");
                const count = Number(countRaw || "1");
                const sides = Number(sidesRaw || "0");
                if (!Number.isFinite(count) || !Number.isFinite(sides) || sides <= 0) return expr;
                const key = `d${sides}`;
                diceTerms.set(key, (diceTerms.get(key) || 0) + (sign * count));
            } else {
                const value = Number(token);
                if (!Number.isFinite(value)) return expr;
                constant += sign * value;
            }
        }

        if (!matchCount || consumed !== expr) return expr;

        const parts = [];
        const sortedDice = Array.from(diceTerms.entries())
            .filter(([, count]) => count !== 0)
            .sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)));

        for (const [dieKey, count] of sortedDice) {
            const absCount = Math.abs(count);
            const dieTerm = `${absCount}${dieKey}`;
            parts.push(count < 0 ? `-${dieTerm}` : (parts.length ? `+${dieTerm}` : dieTerm));
        }

        if (constant !== 0 || parts.length === 0) {
            parts.push(constant < 0 ? `${constant}` : (parts.length ? `+${constant}` : `${constant}`));
        }

        return parts.join("");
    }

    _buildLiveVisualCards(html) {
        const mainAdd = String(html.find("input[name='mainAdditional']").val() || "").trim();
        const fragAdd = String(html.find("input[name='fragmentationAdditional']").val() || "").trim();
        const fuAdd = String(html.find("input[name='followUpAdditional']").val() || "").trim();

        const mainType = this.damageData.main?.type || "";
        const fragType = this.damageData.fragmentation?.type || String(html.find("input[name='fragmentationType']").val() || "").trim();
        const fuType = this.damageData.followUp?.type || String(html.find("input[name='followUpType']").val() || "").trim();

        const mainFormula = this._composeCardFormula(this.damageData.main?.displayFormula || this.damageData.main?.formula, mainAdd);
        const fragFormula = this._composeCardFormula(this.damageData.fragmentation?.displayFormula || this.damageData.fragmentation?.formula, fragAdd);
        const fuFormula = this._composeCardFormula(this.damageData.followUp?.displayFormula || this.damageData.followUp?.formula, fuAdd);

        return [
            { key: "main", label: "Dano Padrão", tone: "standard", formula: mainFormula, type: mainType },
            { key: "fragmentation", label: "Dano de Fragmentação", tone: "fragmentation", formula: fragFormula, type: fragType },
            { key: "followUp", label: "Dano de Acompanhamento", tone: "followup", formula: fuFormula, type: fuType }
        ].filter((card) => card.formula);
    }

    _refreshVisualCards(html) {
        const cards = this._buildLiveVisualCards(html);
        const box = html.find(".damage-visual-box");
        if (!box.length) return;
        const esc = (value) => foundry.utils.escapeHTML(String(value || ""));
        const markup = cards.map((card) => `
            <div class="damage-visual-card tone-${card.tone}">
              <div class="damage-card-formula">${esc(card.formula)}</div>
              <div class="damage-card-meta">${card.type ? `${esc(card.type)}` : ""}</div>
            </div>
        `).join("");
        box.html(markup);
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