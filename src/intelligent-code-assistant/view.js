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

      const response = yield requestAICapability('explain-code', buildAIContext(context));

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
    },
  },
});
