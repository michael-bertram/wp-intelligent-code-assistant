import { store, getContext, getElement } from '@wordpress/interactivity';
import { buildAIContext, formatAIItems, requestAICapability } from './ai-context';

const STORAGE_KEY = 'wpe_tasks';

const { state, actions } = store('wpe', {
  state: {
    currentlyOpenId: null,
    registeredIds: [],
    tasks: {},
    _storageLoaded: false,

    get totalTasks() { return state.registeredIds.length; },
    get completedTasks() { return state.registeredIds.filter((id) => state.tasks[id]).length; },
    get progressPercent() {
      if (!state.totalTasks) return 0;
      return Math.round((state.completedTasks / state.totalTasks) * 100);
    },
    get progressBarStyle() { return `width: ${state.progressPercent}%; transition: width 0.5s ease;`; },
    get isAllDone() { return state.totalTasks > 0 && state.completedTasks === state.totalTasks; },
  },

  actions: {
    toggleOpen() {
      const context = getContext();
      context.isOpen = !context.isOpen;
      context.toggleText = context.isOpen ? context.closeText : context.openText;
    },

    *toggleComplete() {
      const context = getContext();
      context.isComplete = !context.isComplete;
      context.completeText = context.isComplete ? '✓' : 'Mark as complete';
      state.tasks = { ...state.tasks, [context.id]: context.isComplete };

      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks)); } catch (err) { /* Optional storage. */ }

      try {
        yield fetch('/wp-json/intelligent-code-assistant/v1/toggle-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': window.wpApiSettings?.nonce || '' },
          body: JSON.stringify({ block_id: context.id, status: context.isComplete }),
        });
      } catch (err) { /* Local completion remains available. */ }
    },

    closeExplanation() {
      const context = getContext();
      context.isExplaining = false;
      context.isAnalyzingExplanation = false;
      context.explanationError = '';
    },

    *explainCode() {
      const context = getContext();

      if (context.isExplaining && context.explanationText && !context.isAnalyzingExplanation) {
        context.isExplaining = false;
        return;
      }

      context.isExplaining = true;
      if (context.explanationText && !context.explanationError) return;

      context.isAnalyzingExplanation = true;
      context.explanationError = '';
      context.explanationText = '';
      context.explanationItems = [];

      let requestContext = context;

      if (context.selectedLineNumber) {
        const lines = (context.rawCodeText || '').split('\n');
        const selectedLineNumber = Number(context.selectedLineNumber);
        const start = Math.max(1, selectedLineNumber - 2);
        const end = Math.min(lines.length, selectedLineNumber + 2);
        const focusedCode = lines
          .slice(start - 1, end)
          .map((line, index) => {
            const lineNumber = start + index;
            const marker = lineNumber === selectedLineNumber ? '>>> SELECTED LINE' : '    context';
            return `${marker} ${lineNumber}: ${line}`;
          })
          .join('\n');

        requestContext = {
          ...context,
          rawCodeText: focusedCode,
          activeCodeText: focusedCode,
        };
      }

      const response = yield requestAICapability('explain-code', buildAIContext(requestContext));

      if (response && typeof response.explanation === 'string' && response.explanation.trim()) {
        context.explanationText = response.explanation.trim();
        context.explanationItems = formatAIItems(response.explanation);
      } else {
        context.explanationError = 'Unable to generate a code explanation right now.';
      }

      context.isAnalyzingExplanation = false;
    },

    async copyToClipboard() {
      const context = getContext();
      const { ref: buttonElement } = getElement();
      if (!buttonElement) return;

      const blockElement = buttonElement.closest('[data-wp-interactive="wpe"]');
      const contentContainer = blockElement?.querySelector('.panel-content');
      if (!contentContainer) return;

      try {
        const cleanedText = (contentContainer.textContent || contentContainer.innerText || '').trim();
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(cleanedText);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = cleanedText;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        context.isCopied = true;
        setTimeout(() => { context.isCopied = false; }, 2000);
      } catch (err) {
        console.error('[Intelligent Code Assistant] Failed to copy code.', err);
      }
    },
  },

  callbacks: {
    initShared() {
      if (state._storageLoaded) return;
      try {
        const storedTasks = localStorage.getItem(STORAGE_KEY);
        state.tasks = storedTasks ? JSON.parse(storedTasks) : {};
      } catch (err) { state.tasks = {}; }
      state._storageLoaded = true;
    },

    initTask() {
      const context = getContext();
      if (!context.id) return;

      if (!state._storageLoaded) {
        try {
          const storedTasks = localStorage.getItem(STORAGE_KEY);
          state.tasks = storedTasks ? JSON.parse(storedTasks) : {};
        } catch (err) { state.tasks = {}; }
        state._storageLoaded = true;
      }

      if (!state.registeredIds.includes(context.id)) {
        state.registeredIds = [...state.registeredIds, context.id];
      }

      context.isComplete = state.tasks[context.id] ?? false;
      context.isCopied = false;
      context.isExplaining = false;
      context.isAnalyzingExplanation = false;
      context.explanationText = '';
      context.explanationItems = [];
      context.explanationError = '';
      context.selectedLineNumber = 0;
      context.selectedLineText = '';
      context.isExplainingLine = false;
      context.isAnalyzingLine = false;
      context.lineExplanation = '';
      context.lineExplanationError = '';
      context.completeText = context.isComplete ? '✓' : 'Mark as complete';

      if (context.highlightLines) {
        const targetLines = new Set();
        context.highlightLines.split(',').forEach((range) => {
          const parts = range.split('-').map((num) => parseInt(num.trim(), 10));
          if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
            for (let i = Math.min(parts[0], parts[1]); i <= Math.max(parts[0], parts[1]); i += 1) targetLines.add(i);
          } else if (parts.length === 1 && !Number.isNaN(parts[0])) {
            targetLines.add(parts[0]);
          }
        });
        context.highlightedNumbers = Array.from(targetLines);
      } else {
        context.highlightedNumbers = [];
      }

      const { ref: blockElement } = getElement();
      const panel = blockElement?.querySelector('.panel-content');
      const pre = panel?.querySelector('pre');

      if (panel && pre && !panel.dataset.lineSelectionBound) {
        panel.dataset.lineSelectionBound = 'true';
        panel.setAttribute('aria-label', 'Code. Click a line to select it for AI explanation.');

        panel.addEventListener('click', (event) => {
          if (event.target.closest('button, a, input, textarea, select')) return;

          const rect = pre.getBoundingClientRect();
          const computed = window.getComputedStyle(pre);
          const lineHeight = parseFloat(computed.lineHeight) || (parseFloat(computed.fontSize) * 1.5);
          const relativeY = event.clientY - rect.top;
          const lines = (context.rawCodeText || '').split('\n');
          const lineNumber = Math.max(1, Math.min(lines.length, Math.floor(relativeY / lineHeight) + 1));

          context.selectedLineNumber = lineNumber;
          context.selectedLineText = lines[lineNumber - 1] || '';
          context.isExplainingLine = false;
          context.isAnalyzingLine = false;
          context.lineExplanation = '';
          context.lineExplanationError = '';

          pre.style.backgroundImage = `linear-gradient(to bottom, transparent 0, transparent ${(lineNumber - 1) * lineHeight}px, rgba(37, 99, 235, 0.10) ${(lineNumber - 1) * lineHeight}px, rgba(37, 99, 235, 0.10) ${lineNumber * lineHeight}px, transparent ${lineNumber * lineHeight}px)`;
          pre.style.backgroundRepeat = 'no-repeat';
          pre.style.backgroundSize = '100% 100%';

          const block = panel.closest('[data-wp-interactive="wpe"]');
          const explainButton = block?.querySelector('.explain-button');
          if (explainButton) {
            const label = explainButton.querySelector('span');
            if (label) label.textContent = `Explain line ${lineNumber}`;
            explainButton.classList.add('line-selected');
            explainButton.setAttribute('aria-label', `Explain line ${lineNumber} using AI`);
          }
        });
      }
    },
  },
});
