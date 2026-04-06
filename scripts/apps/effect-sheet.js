// GUM/scripts/apps/effect-sheet.js

const { ItemSheet } = foundry.appv1.sheets;
const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? foundry?.applications?.ux?.TextEditor ?? TextEditor;


const ROLL_MODIFIER_CONTEXT_OPTIONS = [
    { id: "all", label: "Qualquer rolagem de teste" },
    { id: "attack", label: "Ataque (qualquer)" },
    { id: "attack_melee", label: "Ataque corpo-a-corpo" },
    { id: "attack_ranged", label: "Ataque à distância" },
    { id: "defense", label: "Defesa (qualquer)" },
    { id: "defense_dodge", label: "Esquiva" },
    { id: "defense_parry", label: "Aparar" },
    { id: "defense_block", label: "Bloqueio" },
    { id: "spell", label: "Magias" },
    { id: "power", label: "Poderes" },
    { id: "sense_vision", label: "Visão" },
    { id: "sense_hearing", label: "Audição" },
    { id: "sense_tastesmell", label: "Olfato/Paladar" },
    { id: "sense_touch", label: "Tato" },
    { id: "check_st", label: "Atributo Específico: ST" },
    { id: "skill_st", label: "Perícias baseadas em ST" },
    { id: "check_dx", label: "Atributo Específico: DX" },
    { id: "skill_dx", label: "Perícias baseadas em DX" },
    { id: "check_iq", label: "Atributo Específico: IQ" },
    { id: "skill_iq", label: "Perícias baseadas em IQ" },
    { id: "check_ht", label: "Atributo Específico: HT" },
    { id: "skill_ht", label: "Perícias baseadas em HT" },
    { id: "check_per", label: "Atributo Específico: Per" },
    { id: "skill_per", label: "Perícias baseadas em Per" },
    { id: "check_vont", label: "Atributo Específico: Vont" },
    { id: "skill_vont", label: "Perícias baseadas em Vont" }
];

export class EffectSheet extends ItemSheet {
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["gum", "sheet", "item", "effect-sheet", "theme-dark"],
            width: "450",
            height: "495",
            resizable: true,
            template: "systems/gum/templates/items/effect-sheet.hbs",
            tabs: [{
                navSelector: ".sheet-tabs",
                contentSelector: ".sheet-body-content",
                initial: "description"
            }]
        });
    }

    async getData(options) {
        const context = await super.getData(options);
        context.system = this.item.system;
        context.statusEffects = CONFIG.statusEffects
            .map(s => ({ id: s.id, label: s.name }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
        context.macros = game.macros.map(m => m.name);
        const flagValue = context.system.flag_value;
            context.flagValueIsBoolean = (flagValue === 'true' || flagValue === 'false');
            context.flagValueSelection = context.flagValueIsBoolean ? flagValue : 'custom';
        context.enrichedChatDescription = await TextEditorImpl.enrichHTML(this.item.system.chat_description || "", { async: true });
        context.enrichedDescription = await TextEditorImpl.enrichHTML(this.item.system.description || "", { async: true });
        context.owner = context.owner ?? this.item.isOwner;
        context.editable = this.options.editable ?? this.isEditable;

        if (context.system.duration) {
            context.system.duration.startMode = context.system.duration.startMode || "apply";
            context.system.duration.endMode = context.system.duration.endMode || "turnEnd";
            if (context.system.duration.isPermanent) {
                context.system.duration.inCombat = false;
                context.system.duration._uiMode = "permanent";
            } else if (context.system.duration.inCombat) {
                context.system.duration._uiMode = "combat";
            } else {
                context.system.duration._uiMode = context.system.duration._uiMode || "permanent";
            }
        }
        context.rollModifierContextOptions = ROLL_MODIFIER_CONTEXT_OPTIONS;

        const rawEntries = Array.isArray(context.system.roll_modifier_entries) ? context.system.roll_modifier_entries : [];
        context.rollModifierEntries = rawEntries.length
            ? rawEntries.map((entry, index) => ({
                index,
                label: entry?.label || "",
                value: entry?.value ?? 0,
                cap: entry?.cap ?? entry?.nh_cap ?? "",
                contexts: Array.isArray(entry?.contexts) ? entry.contexts.join(",") : (entry?.contexts || "all")
            }))
            : [{
                index: 0,
                label: "",
                value: context.system.roll_modifier_value ?? 0,
                cap: context.system.roll_modifier_cap ?? "",
                contexts: Array.isArray(context.system.roll_modifier_context)
                    ? context.system.roll_modifier_context.join(",")
                    : (context.system.roll_modifier_context || "all")
            }];

        return context;
    }


    /**
     * Preserve scroll position when the sheet re-renders to avoid jumping to the top.
     */
    async _render(force, options = {}) {
        const container = this.element?.[0]?.querySelector('.sheet-body-content');
        const scrollTop = container?.scrollTop ?? null;
        const result = await super._render(force, options);
        if (scrollTop !== null) {
            const refreshed = this.element?.[0]?.querySelector('.sheet-body-content');
            if (refreshed) refreshed.scrollTop = scrollTop;
        }
        return result;
    }

activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return; // Adicionando uma verificação de segurança

    html.on('click', '.open-reference-link', this._onOpenReferenceLink.bind(this));

    const permanentInput = html.find('input[name="system.duration.isPermanent"]');
    const inCombatInput = html.find('input[name="system.duration.inCombat"]');
    const startModeInputs = html.find('input[name="system.duration.startMode"]');
    const endModeInputs = html.find('input[name="system.duration.endMode"]');
    const presetInputs = html.find('input[name="duration-preset"]');

    const clearPresetSelection = () => {
        presetInputs.each((_, input) => {
            input.checked = false;
        });
    };

    permanentInput.on('change', async (event) => {
        if (!event.currentTarget.checked) return;
        inCombatInput.prop('checked', false);
        await this.item.update({
            "system.duration.isPermanent": true,
            "system.duration.inCombat": false
        });
    });

    inCombatInput.on('change', async (event) => {
        if (!event.currentTarget.checked) return;
        permanentInput.prop('checked', false);
        await this.item.update({
            "system.duration.inCombat": true,
            "system.duration.isPermanent": false,
            "system.duration.startMode": this.item.system.duration?.startMode || "apply",
            "system.duration.endMode": this.item.system.duration?.endMode || "turnEnd"
        });
    });

    startModeInputs.on('change', () => {
        clearPresetSelection();
    });

    endModeInputs.on('change', () => {
        clearPresetSelection();
    });

    presetInputs.on('change', async (event) => {
        const target = event.currentTarget;
        const startMode = target.dataset.startMode || "apply";
        const endMode = target.dataset.endMode || "turnEnd";
        await this.item.update({
            "system.duration.startMode": startMode,
            "system.duration.endMode": endMode
        });
    });

    // Listener para o seletor de valor da flag (funciona independentemente)
    html.find('input[name="system.flag_value_selector"]').on('change', (event) => {
        const selectorValue = event.currentTarget.value;
        if (selectorValue === 'true' || selectorValue === 'false') {
            this.item.update({ 'system.flag_value': selectorValue });
        }
    });
    
 // ✅ OUVINTE DO BOTÃO DE EDITAR AGORA É ATIVADO SEMPRE ✅
    html.find('.edit-text-btn').on('click', this._onEditText.bind(this));

    // Alterna os editores padrão da aba de descrição (padrão dos outros itens)
    html.find('.toggle-editor').on('click', this._toggleEditor.bind(this));
    html.find('.save-description').on('click', this._saveDescription.bind(this));
    html.find('.cancel-description').on('click', this._cancelDescription.bind(this));

    // ✅ LÓGICA DA MACRO AGORA ESTÁ DENTRO DE UMA VERIFICAÇÃO SEGURA ✅
    const macroInput = html.find('input[name="system.value"]')[0];
    // Só executa este bloco SE o campo da macro existir na ficha
    if (macroInput) {
        
        // A função de validação agora vive dentro do 'if'
        const validateMacro = () => {
            const icon = html.find('.validation-icon')[0];
            if (!icon) return; // Segurança extra para o ícone
            const macroName = macroInput.value;
            const macroExists = game.macros.some(m => m.name === macroName);

            if (macroName === "") {
                icon.innerHTML = "";
            } else if (macroExists) {
                icon.innerHTML = '<i class="fas fa-check"></i>';
                icon.style.color = "var(--c-accent-green, #389c68)";
            } else {
                icon.innerHTML = '<i class="fas fa-times"></i>';
                icon.style.color = "var(--c-accent-red, #a53541)";
            }
        };

  macroInput.addEventListener('keyup', validateMacro);
        validateMacro(); // Valida ao abrir a ficha
    }

    const contextIds = new Set(ROLL_MODIFIER_CONTEXT_OPTIONS.map(opt => opt.id));
    const normalizeCsv = (value) => {
        const parts = `${value || ""}`.split(',').map(v => v.trim()).filter(Boolean);
        if (!parts.length) return "all";
        const valid = [...new Set(parts.filter(v => contextIds.has(v)))];
        if (!valid.length) return "all";
        if (valid.includes("all")) return "all";
        return valid.join(',');
    };

    html.on('change blur', '.context-csv-input', (ev) => {
        ev.currentTarget.value = normalizeCsv(ev.currentTarget.value);
    });

    html.on('click', '.open-context-picker', (ev) => {
        ev.preventDefault();
        const targetInputName = ev.currentTarget.dataset.targetInput;
        const input = this.form?.querySelector(`[name="${targetInputName}"]`);
        if (!input) return;
        const selected = new Set(normalizeCsv(input.value).split(',').filter(Boolean));

        const content = `<div class="gum-context-picker">${ROLL_MODIFIER_CONTEXT_OPTIONS.map(opt => `
            <label class="gm-checkbox" style="display:flex; gap:6px; margin:2px 0;">
                <input type="checkbox" name="ctx" value="${opt.id}" ${selected.has(opt.id) ? "checked" : ""}/>
                <span>${opt.label} <small style="opacity:.7">(${opt.id})</small></span>
            </label>`).join('')}</div>`;

        new Dialog({
            title: "Selecionar Contextos",
            content,
            buttons: {
                ok: {
                    icon: '<i class="fas fa-check"></i>',
                    label: 'Aplicar',
                    callback: (dlgHtml) => {
                        const checked = dlgHtml.find('input[name="ctx"]:checked').toArray().map(el => el.value);
                        input.value = normalizeCsv(checked.join(','));
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: 'Cancelar' }
            },
            default: 'ok'
        }).render(true);
    });
    html.find(".duration-mode-select").on("change", async (ev) => {
    const mode = ev.currentTarget.value;
    const isPermanent = mode === "permanent";
    const inCombat = mode === "combat";

    await this.item.update({
        "system.duration._uiMode": mode,
        "system.duration.isPermanent": isPermanent,
        "system.duration.inCombat": inCombat
    });
    });

    html.on("click", ".add-roll-mod-entry", async (ev) => {
        ev.preventDefault();
        const entries = Array.isArray(this.item.system.roll_modifier_entries) ? foundry.utils.deepClone(this.item.system.roll_modifier_entries) : [];
        entries.push({ label: "", value: 0, cap: "", contexts: "all" });
        await this.item.update({ "system.roll_modifier_entries": entries });
    });

    html.on("click", ".remove-roll-mod-entry", async (ev) => {
        ev.preventDefault();
        const index = Number(ev.currentTarget.dataset.index);
        const entries = Array.isArray(this.item.system.roll_modifier_entries) ? foundry.utils.deepClone(this.item.system.roll_modifier_entries) : [];
        if (Number.isNaN(index) || index < 0 || index >= entries.length) return;
        entries.splice(index, 1);
        await this.item.update({ "system.roll_modifier_entries": entries.length ? entries : [{ label: "", value: 0, cap: "", contexts: "all" }] });
    });

}

     // ✅ FUNÇÃO AUXILIAR PARA ABRIR O EDITOR DE TEXTO (A PARTE QUE FALTAVA) ✅
    _onEditText(event) {
        const target = $(event.currentTarget);
        const fieldName = target.data('target');
        const title = target.attr('title');
        const currentContent = foundry.utils.getProperty(this.item, fieldName) || "";

        new Dialog({
            title: title,
            content: `<form><textarea name="content" style="width: 100%; height: 300px;">${currentContent}</textarea></form>`,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Salvar",
                    callback: (html) => {
                        const newContent = html.find('textarea[name="content"]').val();
                        this.item.update({ [fieldName]: newContent });
                    }
                }
            },
            default: "save"
        }, { width: 500, height: 400, resizable: true }).render(true);
    }

    _toggleEditor(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        container.find('.description-view').toggle();
        container.find('.description-editor').toggle();
        if (field) {
            const editor = container.find(`.editor[data-edit=\"${field}\"]`);
            if (editor.length) {
                editor.trigger('focus');
            }
        }
    }

    async _saveDescription(event) {
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        const container = $(event.currentTarget).closest('.description-section');
        const content = await this._getEditorContent(field, container);
        if (!field || content === null || content === undefined) return;
        await this.item.update({ [field]: content });
        const enriched = await TextEditorImpl.enrichHTML(content, { async: true });
        container.find('.description-view').html(enriched);
        if (field === "system.chat_description") {
            this.element?.find('.effect-card .rendered-text').html(enriched);
        }
        container.find('.description-view').show();
        container.find('.description-editor').hide();
    }

    _cancelDescription(event) {
        event.preventDefault();
        const container = $(event.currentTarget).closest('.description-section');
 container.find('.description-view').show();
        container.find('.description-editor').hide();
    }

    _getEditorInstance(field) {
        const editor = this.editors?.[field];
        if (!editor) return null;
        return editor.editor ?? editor.instance ?? editor;
    }

    async _getEditorContent(field, container) {
        if (!field) return null;
        const instance = this._getEditorInstance(field);
        if (instance?.getHTML) {
            const html = instance.getHTML();
            return html?.then ? await html : html;
        }
        if (instance?.getContent) {
            const content = instance.getContent();
            return content?.then ? await content : content;
        }
        if (instance?.view?.dom?.innerHTML) return instance.view.dom.innerHTML;
        if (TextEditorImpl?.getContent) {
            const element = container.find(`[name="${field}"]`).get(0)
                ?? container.find(`.editor[data-edit="${field}"]`).get(0);
            if (element) return TextEditorImpl.getContent(element);
        }
        const namedInput = container.find(`[name="${field}"]`);
        if (namedInput.length) return namedInput.val();
        const editorElement = container.find(`.editor[data-edit="${field}"]`);
        if (editorElement.length) return editorElement.val() ?? editorElement.html();
        return "";
    }

    async _updateObject(event, formData) {
        const entriesByIndex = new Map();
        for (const [key, value] of Object.entries(formData)) {
            const match = key.match(/^system\.roll_modifier_entries\.(\d+)\.(label|value|cap|contexts)$/);
            if (!match) continue;
            const index = Number(match[1]);
            const field = match[2];
            if (!entriesByIndex.has(index)) entriesByIndex.set(index, { label: "", value: 0, cap: "", contexts: "all" });
            entriesByIndex.get(index)[field] = value;
            delete formData[key];
        }

        if (entriesByIndex.size) {
            const entries = Array.from(entriesByIndex.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([, entry]) => ({
                    label: (entry.label || "").toString().trim(),
                    value: Number(entry.value) || 0,
                    cap: (entry.cap ?? "").toString().trim(),
                    contexts: (entry.contexts || "all").toString().trim() || "all"
                }));

            formData["system.roll_modifier_entries"] = entries;
            if (entries.length) {
                formData["system.roll_modifier_value"] = entries[0].value;
                formData["system.roll_modifier_cap"] = entries[0].cap;
                formData["system.roll_modifier_context"] = entries[0].contexts;
            }
        }

 return super._updateObject(event, formData);
    }

    async _onOpenReferenceLink(event) {
        event.preventDefault();
        event.stopPropagation();

        const trigger = event.currentTarget;
        const container = trigger.closest('.form-group') ?? this.form;
        const refInput =
            container?.querySelector('input[name="system.ref"]') ??
            this.form?.querySelector('input[name="system.ref"]');

        const rawRef = (refInput?.value ?? this.item.system?.ref ?? '').toString().trim();

        if (!rawRef) {
            return ui.notifications.warn("Preencha o campo REF antes de abrir a referência.");
        }

        const parsedList = this._parseReferenceCodes(rawRef);

        if (!parsedList.length) {
            return ui.notifications.warn("Formato de REF inválido. Use ex.: BA23 ou BA23, MA45.");
        }

        if (parsedList.length === 1) {
            return this._openSingleReference(parsedList[0]);
        }

        return this._promptMultipleReferences(parsedList);
    }

    _parseReferenceCodes(rawRef) {
        const text = (rawRef ?? "").toString().trim().toUpperCase();
        if (!text) return [];

        const parts = text.split(/[,;]+|\s+/).map(s => s.trim()).filter(Boolean);
        const out = [];
        for (const part of parts) {
            const match = part.replace(/\s+/g, "").match(/^([A-Z]+)(\d+)$/);
            if (!match) continue;
            out.push({ code: match[1], page: Number(match[2]) });
        }
        return out;
    }

    _findPdfPageByCode(code) {
        const journals = game.journal ? Array.from(game.journal) : [];

        for (const journal of journals) {
            const pages = journal?.pages ? Array.from(journal.pages) : [];
            for (const page of pages) {
                if (page?.type !== 'pdf') continue;

                const pageCode = (page.getFlag('gum', 'pdfCode') ?? '').toString().trim().toUpperCase();
                if (!pageCode || pageCode !== code) continue;

                return {
                    journal,
                    page,
                    pageOffset: Number(page.getFlag('gum', 'pageOffset') ?? 0)
                };
            }
        }

        return null;
    }

    async _openSingleReference(parsed) {
        const match = this._findPdfPageByCode(parsed.code);
        if (!match) {
            return ui.notifications.warn(`Nenhum PDF com código "${parsed.code}" foi encontrado nos periódicos.`);
        }

        const pageNumber = Math.max(1, parsed.page + (Number(match.pageOffset) || 0));
        await this._openPdfReferencePage(match.page, pageNumber);
    }

    _promptMultipleReferences(parsedList) {
        const buttons = {};
        const missing = [];

        for (const parsed of parsedList) {
            const match = this._findPdfPageByCode(parsed.code);
            if (!match) {
                missing.push(`${parsed.code}${parsed.page}`);
                continue;
            }

            const pageNumber = Math.max(1, parsed.page + (Number(match.pageOffset) || 0));
            const key = `${parsed.code}${parsed.page}`;

            buttons[key] = {
                label: `${parsed.code}${parsed.page}`,
                callback: () => this._openPdfReferencePage(match.page, pageNumber)
            };
        }

        if (!Object.keys(buttons).length) {
            return ui.notifications.warn("Nenhuma das referências informadas foi encontrada nos periódicos.");
        }

        const missingHtml = missing.length
            ? `<p style="opacity:.8;margin-top:.5rem"><b>Não encontradas:</b> ${missing.join(", ")}</p>`
            : "";

        new Dialog({
            title: "Múltiplas Referências",
            content: `<p>Escolha qual referência deseja abrir:</p>${missingHtml}`,
            buttons,
            default: Object.keys(buttons)[0]
        }).render(true);
    }

    _findPdfViewerIframesBySource(sourcePath) {
        const iframes = Array.from(document.querySelectorAll("iframe"));
        if (!iframes.length) return [];

        const want = (sourcePath || "").toString();
        const wantName = want.split("/").pop();

        const matches = (candidate) => {
            if (!candidate) return false;
            if (!want) return true;
            if (candidate.includes(want)) return true;
            if (wantName && (candidate.includes(wantName) || candidate.includes(encodeURIComponent(wantName)))) return true;

            try {
                const u = new URL(candidate, window.location.origin);
                const file = u.searchParams.get("file");
                if (!file) return false;
                const decoded = decodeURIComponent(file);
                return decoded.includes(want) || (wantName && decoded.includes(wantName));
            } catch (_e) {
                return false;
            }
        };

        return iframes.filter((f) => {
            const src = f.getAttribute("src") || "";
            const dataSrc = f.getAttribute("data-src") || f.getAttribute("data-url") || f.dataset?.src || f.dataset?.url || "";
            const cand = src || dataSrc;
            if (!cand) return false;

            const looksLikePdfViewer = /pdfjs|viewer\.html/i.test(cand);
            if (!looksLikePdfViewer) return false;

            return matches(cand);
        });
    }

    _setPageOnPdfViewerIframe(iframe, page) {
        if (!(iframe instanceof HTMLIFrameElement)) return false;
        const target = Math.max(1, Number(page) || 1);

        try {
            const app = iframe.contentWindow?.PDFViewerApplication;
            if (app?.pdfViewer) {
                app.pdfViewer.currentPageNumber = target;
                app.page = target;
                return true;
            }
        } catch (_e) {
            // noop
        }

        const attr = "src";
        const current = iframe.getAttribute(attr) || "";
        const dataSrc = iframe.getAttribute("data-src") || iframe.getAttribute("data-url") || iframe.dataset?.src || iframe.dataset?.url || "";
        const candidate = current || dataSrc;
        if (!candidate) return false;

        const updated = (() => {
            const [base, rawHash = ""] = candidate.split("#");
            const params = new URLSearchParams(rawHash);
            params.set("page", String(target));
            return `${base}#${params.toString()}`;
        })();

        if (dataSrc) {
            iframe.setAttribute("data-src", updated);
            iframe.setAttribute("data-url", updated);
            iframe.dataset.src = updated;
            iframe.dataset.url = updated;
        }
        iframe.setAttribute("src", updated);

        return true;
    }

    async _openPdfReferencePage(pdfPage, targetPage) {
        const journal = pdfPage?.parent;
        if (!journal) return;

        const page = Math.max(1, Number(targetPage) || 1);
        const sourcePath = (pdfPage.src ?? pdfPage.system?.src ?? "").toString();
        await journal.sheet.render(true, { pageId: pdfPage.id, mode: "view" });

        const tryPosition = () => {
            const frames = this._findPdfViewerIframesBySource(sourcePath);
            const fallback = frames.length ? frames : Array.from(document.querySelectorAll('iframe[src*="pdfjs" i], iframe[src*="viewer.html" i]'));
            if (!fallback.length) return false;

            let ok = false;
            for (const f of fallback) ok = this._setPageOnPdfViewerIframe(f, page) || ok;
            return ok;
        };

        const delays = [0, 80, 180, 350, 600, 900, 1300, 1800, 2500];
        for (const d of delays) {
            await new Promise(r => setTimeout(r, d));
            if (tryPosition()) return;
        }

        const frames = this._findPdfViewerIframesBySource(sourcePath);
        for (const f of frames) {
            f.addEventListener("load", () => {
                try { this._setPageOnPdfViewerIframe(f, page); } catch (_e) {}
            }, { once: true });
        }

        ui.notifications.warn("Não foi possível posicionar o PDF na página solicitada automaticamente.");
    }

}