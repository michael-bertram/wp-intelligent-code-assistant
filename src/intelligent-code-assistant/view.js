import { store, getContext, getElement } from '@wordpress/interactivity';

const STORAGE_KEY = 'wpe_tasks';

/**
 * Convert an AI response into plain-text items for safe Interactivity API rendering.
 *
 * @param {string} text Raw AI response.
 * @return {string[]} Explanation items.
 */
function formatExplanationItems(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:[•\-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

const { state, actions } = store('wpe', {
  state: {
    currentlyOpenId: null,
    registeredIds: [],
    tasks: {},
    _storageLoaded: false,

    get totalTasks() {
      return state.registeredIds.length;
    },

    get completedTasks() {
      return state.registeredIds.filter((id) => state.tasks[id]).length;
    },

    get progressPercent() {
      if (!state.totalTasks) {
        return 0;
      }
      return Math.round((state.completedTasks / state.totalTasks) * 100);
    },

    get progressBarStyle() {
      return `width: ${state.progressPercent}%; transition: width 0.5s ease;`;
    },

    get isAllDone() {
      return state.totalTasks > 0 && state.completedTasks === state.totalTasks;
    },
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

      state.tasks = {
        ...state.tasks,
        [context.id]: context.isComplete,
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
      } catch (err) {
        // Guest/private browsing storage may be unavailable.
      }

      try {
        yield fetch('/wp-json/intelligent-code-assistant/v1/toggle-complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': window.wpApiSettings?.nonce || '',
          },
          body: JSON.stringify({
            block_id: context.id,
            status: context.isComplete,
          }),
        });
      } catch (err) {
        // Completion remains available locally for guests.
      }
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

      if (context.explanationText && !context.explanationError) {
        return;
      }

      context.isAnalyzingExplanation = true;
      context.explanationError = '';
      context.explanationText = '';
      context.explanationItems = [];

      const payload = JSON.stringify({
        code: context.rawCodeText || '',
        language: context.codeLanguage || 'PHP',
      });

      let response = null;

      // Direct endpoint keeps the feature usable independently of the Abilities REST route.
      try {
        const directRes = yield fetch('/wp-json/intelligent-code-assistant/v1/explain-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });

        if (directRes.ok) {
          response = yield directRes.json();
        }
      } catch (err) {
        console.warn('[Intelligent Code Assistant] Direct explanation request failed.', err);
      }

      // Abilities API is the canonical WordPress capability exposed by the plugin.
      if (!response) {
        try {
          const abilityRes = yield fetch(
            '/wp-json/wp/v2/abilities/intelligent-code-assistant/explain-code/run',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
            }
          );

          if (abilityRes.ok) {
            response = yield abilityRes.json();
          }
        } catch (err) {
          console.warn('[Intelligent Code Assistant] Abilities request failed.', err);
        }
      }

      if (response && typeof response.explanation === 'string' && response.explanation.trim()) {
        context.explanationText = response.explanation.trim();
        context.explanationItems = formatExplanationItems(response.explanation);
        context.explanationError = '';
      } else {
        context.explanationText = '';
        context.explanationItems = [];
        context.explanationError = 'Unable to generate a code explanation right now.';
      }

      context.isAnalyzingExplanation = false;
    },

    async copyToClipboard() {
      const context = getContext();
      const { ref: buttonElement } = getElement();

      if (!buttonElement) {
        return;
      }

      const blockElement = buttonElement.closest('[data-wp-interactive="wpe"]');
      const contentContainer = blockElement?.querySelector('.panel-content');

      if (!contentContainer) {
        return;
      }

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
        setTimeout(() => {
          context.isCopied = false;
        }, 2000);
      } catch (err) {
        console.error('[Intelligent Code Assistant] Failed to copy code.', err);
      }
    },
  },

  callbacks: {
    initShared() {
      if (state._storageLoaded) {
        return;
      }

      try {
        const storedTasks = localStorage.getItem(STORAGE_KEY);
        state.tasks = storedTasks ? JSON.parse(storedTasks) : {};
      } catch (err) {
        state.tasks = {};
      }

      state._storageLoaded = true;
    },

    initTask() {
      const context = getContext();

      if (!context.id) {
        return;
      }

      if (!state._storageLoaded) {
        try {
          const storedTasks = localStorage.getItem(STORAGE_KEY);
          state.tasks = storedTasks ? JSON.parse(storedTasks) : {};
        } catch (err) {
          state.tasks = {};
        }
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
            const start = Math.min(parts[0], parts[1]);
            const end = Math.max(parts[0], parts[1]);
            for (let i = start; i <= end; i += 1) {
              targetLines.add(i);
            }
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
