const PDF_ACTION_CANDIDATES = [
  'loadPDF',
  'load-pdf',
  'openPDF',
  'open-pdf',
  'viewPDF',
  'view-pdf'
];

const PDF_BUTTON_SELECTORS = [
  '.load-pdf',
  'button.load-pdf',
  '[data-action="loadPDF"]',
  '[data-action="load-pdf"]',
  '[data-action="openPDF"]',
  '[data-action="open-pdf"]',
  '[data-action="viewPDF"]',
  '[data-action="view-pdf"]',
  '[data-action*="pdf" i]'
].join(', ');

const JOURNAL_PDF_OBSERVERS = new Map();
const PDF_META_OBSERVERS = new Map();
const PDF_META_INTERVALS = new Map();

function resolveRootElement(renderArg) {
  if (!renderArg) return null;
  if (renderArg instanceof HTMLElement) return renderArg;
  if (renderArg instanceof DocumentFragment) return renderArg.firstElementChild;
  if (Array.isArray(renderArg) && renderArg[0] instanceof HTMLElement) return renderArg[0];
  if (renderArg[0] instanceof HTMLElement) return renderArg[0]; // compat jQuery
  if (renderArg.element instanceof HTMLElement) return renderArg.element;
  if (renderArg instanceof NodeList || renderArg instanceof HTMLCollection) {
    return renderArg[0] instanceof HTMLElement ? renderArg[0] : null;
  }
  return null;
}

function resolveAppRoot(app, renderArg) {
  return resolveRootElement(renderArg)
    ?? resolveRootElement(app?.element)
    ?? (app?.element instanceof HTMLElement ? app.element : null)
    ?? null;
}

function getAppIdentifier(app) {
  return app?.id ?? app?.appId ?? app?.applicationId ?? app?.document?.uuid;
}

function isPdfPageApp(app) {
  const doc = app?.document ?? app?.object;
  return doc?.documentName === 'JournalEntryPage' && doc?.type === 'pdf';
}

function getPdfButtons(root) {
  if (!root) return [];

  return Array.from(root.querySelectorAll(PDF_BUTTON_SELECTORS)).filter((button) => {
    if (!(button instanceof HTMLElement)) return false;

    const action = (button.dataset?.action || '').toLowerCase();
    const label = (button.textContent || '').toLowerCase();

    const actionLooksLikePdf = action.includes('pdf') && (action.includes('load') || action.includes('open') || action.includes('view'));
    const labelLooksLikePdf = label.includes('pdf') && (label.includes('carregar') || label.includes('abrir') || label.includes('load') || label.includes('open') || label.includes('view'));

    return button.classList.contains('load-pdf') || actionLooksLikePdf || labelLooksLikePdf;
  });
}

function ensurePdfEmbedsLoaded(root) {
  if (!root) return 0;

  let changed = 0;

  const iframes = Array.from(root.querySelectorAll('iframe[data-src], iframe[data-url], iframe[data-pdf-src], iframe[src=""], iframe:not([src])'));
  for (const iframe of iframes) {
    if (!(iframe instanceof HTMLIFrameElement)) continue;
    const src = iframe.getAttribute('src') || '';
    const dataSrc = iframe.dataset?.src || iframe.dataset?.url || iframe.dataset?.pdfSrc || iframe.getAttribute('data-src') || iframe.getAttribute('data-url');
    if (!src && dataSrc) {
      iframe.setAttribute('src', dataSrc);
      changed += 1;
    }
  }

  const objects = Array.from(root.querySelectorAll('object[type="application/pdf"][data-src], object[type="application/pdf"][data=""]'));
  for (const objectEl of objects) {
    if (!(objectEl instanceof HTMLObjectElement)) continue;
    const data = objectEl.getAttribute('data') || '';
    const dataSrc = objectEl.getAttribute('data-src');
    if (!data && dataSrc) {
      objectEl.setAttribute('data', dataSrc);
      changed += 1;
    }
  }

  return changed;
}

function runPdfActionHandlers(app, root) {
  const actions = app?.options?.actions;
  if (!actions || typeof actions !== 'object') return 0;

  let invoked = 0;
  for (const actionName of PDF_ACTION_CANDIDATES) {
    const entry = actions[actionName];
    if (!entry) continue;

    const handler = typeof entry === 'function' ? entry : entry.handler;
    if (typeof handler !== 'function') continue;

    const target = root?.querySelector?.(`[data-action="${actionName}"]`) ?? root;
    const event = new PointerEvent('click', { bubbles: true, cancelable: true, button: 0 });

    try {
      handler.call(app, event, target ?? root);
      invoked += 1;
    } catch (error) {
      console.warn('GUM | Falha ao executar ação de PDF no Journal.', { actionName, error });
    }
  }

  return invoked;
}

function clickPendingPdfButtons(root) {
  if (!root) return 0;

  let clicks = 0;
  for (const button of getPdfButtons(root)) {
    if (button.dataset.gumPdfAutoLoaded === '1') continue;

    button.dataset.gumPdfAutoLoaded = '1';
    button.click();
    clicks += 1;
  }

  return clicks;
}

function queuePdfAutoLoad(app, root) {
  if (!root) return;

  const perform = () => {
    ensurePdfEmbedsLoaded(root);
    runPdfActionHandlers(app, root);
    clickPendingPdfButtons(root);
  };

  requestAnimationFrame(perform);
  setTimeout(perform, 80);
  setTimeout(perform, 220);
  setTimeout(perform, 500);
}

function setupPdfMetaTabReinject(app, root) {
  if (!root) return;

  const tabs = root.querySelector('.sheet-tabs, nav.tabs');
  if (!tabs) return;

  if (tabs.dataset.gumPdfTabsBound === "1") return;
  tabs.dataset.gumPdfTabsBound = "1";

  tabs.addEventListener("click", () => {
    setTimeout(() => ensurePdfMetadataFields(app, app?.element ?? root), 50);
    setTimeout(() => ensurePdfMetadataFields(app, app?.element ?? root), 150);
    setTimeout(() => ensurePdfMetadataFields(app, app?.element ?? root), 350);
  });
}



function setupJournalPdfObserver(app, root) {
  const appId = getAppIdentifier(app);
  if (!appId || !root) return;

  const previous = JOURNAL_PDF_OBSERVERS.get(appId);
  if (previous) previous.disconnect();

  const observer = new MutationObserver((mutations) => {
    const hasChildMutation = mutations.some((mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0);
    if (!hasChildMutation) return;

    queuePdfAutoLoad(app, root);
  });

  observer.observe(root, { childList: true, subtree: true });
  JOURNAL_PDF_OBSERVERS.set(appId, observer);
}

function teardownJournalPdfObserver(app) {
  const appId = getAppIdentifier(app);
  if (!appId) return;

  const observer = JOURNAL_PDF_OBSERVERS.get(appId);
  if (!observer) return;

  observer.disconnect();
  JOURNAL_PDF_OBSERVERS.delete(appId);
}

function injectPdfMetadataFields(app, renderArg) {
  if (!isPdfPageApp(app)) return;

  const root = resolveAppRoot(app, renderArg ?? app?.element ?? null);
  if (!root) return;

  // pega a janela/app inteira (mais estável que root local)
  const appEl = root.closest?.(".app") ?? root;
  const content = appEl.querySelector?.(".window-content") ?? appEl;

  const form = content.querySelector?.("form") ?? (root.matches?.("form") ? root : root.querySelector("form"));
  if (!form) return;

  // se já existe, não duplica
  if (form.querySelector(".gum-pdf-meta-fields")) return;

  // tenta ancorar na sheet-body (é a parte que costuma persistir)
  const sheetBody =
    form.querySelector(".sheet-body") ||
    form.querySelector(".tab.active") ||
    form;

  // tenta achar o grupo do src (mas não depende dele)
  const srcGroup = Array.from(form.querySelectorAll(".form-group")).find((group) =>
    group.querySelector('[name="src"], [name="system.src"]')
  );

  const pageDoc = app.document ?? app.object;
  const codeValue = pageDoc?.getFlag?.("gum", "pdfCode") ?? "";
  const pageOffsetValue = Number(pageDoc?.getFlag?.("gum", "pageOffset") ?? 0);

  const wrapper = document.createElement("fieldset");
  wrapper.classList.add("gum-pdf-meta-fields");
    wrapper.innerHTML = `
    <div class="gum-pdf-meta-row">
        <div class="form-group">
        <label for="gum-pdf-code">Código do PDF</label>
        <input id="gum-pdf-code" type="text"
            name="flags.gum.pdfCode"
            value="${foundry.utils.escapeHTML(codeValue)}"
            placeholder="Ex.: B, MA, PY ..." />
        </div>

        <div class="form-group">
        <label for="gum-page-offset">Ajuste de Página</label>
        <input id="gum-page-offset" type="number"
            step="1"
            name="flags.gum.pageOffset"
            value="${pageOffsetValue}" 
            placeholder="Correção de pág.: 1, -1, 2, 3 ..."/>
        </div>
    </div>
    `;

  // Coloca SEMPRE no fim do formulário (abaixo do conteúdo)
  // Isso evita sumir com rerender do PDF e melhora o layout (não briga com tabs/menu)
  form.append(wrapper);
}


function ensurePdfMetadataFields(app, renderArg) {
  // sempre tenta usar o root atual do app (evita root “velho”)
  injectPdfMetadataFields(app, renderArg ?? app?.element ?? null);
}

function setupPdfMetadataObserver(app, root) {
  const appId = getAppIdentifier(app);
  if (!appId || !root) return;

  const prev = PDF_META_OBSERVERS.get(appId);
  if (prev) prev.disconnect();

  const appEl = root.closest?.(".app") ?? root;
  const content = appEl.querySelector?.(".window-content") ?? appEl;

  const observer = new MutationObserver(() => {
    ensurePdfMetadataFields(app, app?.element ?? root);
  });

  observer.observe(content, { childList: true, subtree: true });
  PDF_META_OBSERVERS.set(appId, observer);
}



function teardownPdfMetadataObserver(app) {
  const appId = getAppIdentifier(app);
  if (!appId) return;

  const observer = PDF_META_OBSERVERS.get(appId);
  if (observer) {
    observer.disconnect();
    PDF_META_OBSERVERS.delete(appId);
  }

  const interval = PDF_META_INTERVALS.get(appId);
  if (interval) {
    clearInterval(interval);
    PDF_META_INTERVALS.delete(appId);
  }
}

function setupPdfMetadataInterval(app) {
  const appId = getAppIdentifier(app);
  if (!appId) return;

  const previous = PDF_META_INTERVALS.get(appId);
  if (previous) clearInterval(previous);

  const intervalId = setInterval(() => {
    if (!app?.rendered) return;
    ensurePdfMetadataFields(app, app?.element ?? null);
  }, 400);

  PDF_META_INTERVALS.set(appId, intervalId);
}

function onRenderJournal(app, renderArg) {
  const root = resolveAppRoot(app, renderArg);
  if (!root) return;

  queuePdfAutoLoad(app, root);
  setupJournalPdfObserver(app, root);
}

function onCloseJournal(app) {
  teardownJournalPdfObserver(app);
}

Hooks.on('renderJournalSheet', onRenderJournal);
Hooks.on('renderJournalEntrySheet', onRenderJournal);
Hooks.on('closeJournalSheet', onCloseJournal);
Hooks.on('closeJournalEntrySheet', onCloseJournal);

Hooks.on('renderJournalPageSheet', onRenderPdfPageAny);
Hooks.on('renderJournalEntryPageSheet', onRenderPdfPageAny);
Hooks.on('renderJournalEntryPagePDFSheet', (app, renderArg) => {
  onRenderPdfPageAny(app, renderArg);

  const root = resolveAppRoot(app, renderArg ?? app?.element ?? null);
  if (root) queuePdfAutoLoad(app, root);
});


Hooks.on('closeJournalEntryPagePDFSheet', (app) => {
  teardownPdfMetadataObserver(app);
});
Hooks.on('closeJournalEntryPageSheet', (app) => {
  teardownPdfMetadataObserver(app);
});

function onRenderPdfPageAny(app, renderArg) {
  if (!isPdfPageApp(app)) return;

  const root = resolveAppRoot(app, renderArg ?? app?.element ?? null);
  if (!root) return;

  ensurePdfMetadataFields(app, root);
  setupPdfMetaTabReinject(app, root);
  setupPdfMetadataObserver(app, root);
  setupPdfMetadataInterval(app);
}
