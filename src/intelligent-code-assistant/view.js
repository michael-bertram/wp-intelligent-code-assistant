import { store, getContext, getElement } from '@wordpress/interactivity';

const STORAGE_KEY = 'wpe_tasks';

/**
 * Convert the AI explanation into an array of plain-text items.
 *
 * This is intentionally plain text rather than HTML because
 * data-wp-html is not an Interactivity API directive.
 *
 * @param {string} text Raw response from the AI generator.
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
    .map((line) => {
      // Remove common AI list/bullet prefixes:
      // *, -, •, 1., 2), etc.
      return line
        .replace(/^(?:[•\-*]|\d+[.)])\s*/, '')
        .trim();
    })
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
      return state.registeredIds.filter(
        (id) => state.tasks[id]
      ).length;
    },

    get progressPercent() {
      if (state.totalTasks === 0) {
        return 0;
      }

      return Math.round(
        (state.completedTasks / state.totalTasks) * 100
      );
    },

    get progressBarStyle() {
      return `width: ${state.progressPercent}%; background-color: #4caf50; transition: width 0.5s ease;`;
    },

    get isAllDone() {
      return (
        state.totalTasks > 0 &&
        state.completedTasks === state.totalTasks
      );
    },
  },

  actions: {
    /* ==========================================================================
       TASK OPEN/CLOSE
       ========================================================================== */

    toggleOpen() {
      const context = getContext();

      context.isOpen = !context.isOpen;

      context.toggleText = context.isOpen
        ? context.closeText
        : context.openText;
    },

    /* ==========================================================================
       TASK COMPLETION
       ========================================================================== */

    *toggleComplete() {
      const context = getContext();

      context.isComplete = !context.isComplete;

      context.completeText = context.isComplete
        ? '✓'
        : 'Mark as complete';

      state.tasks = {
        ...state.tasks,
        [context.id]: context.isComplete,
      };

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(state.tasks)
        );
      } catch (err) {
        // Ignore localStorage errors.
      }

      try {
        yield fetch(
          '/wp-json/intelligent-code-assistant/v1/toggle-complete',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WP-Nonce':
                window.wpApiSettings?.nonce || '',
            },
            body: JSON.stringify({
              block_id: context.id,
              status: context.isComplete,
            }),
          }
        );
      } catch (err) {
        // Silent catch for guest users.
      }
    },

    /* ==========================================================================
       STEP 4: AI EXPLANATION DRAWER
       ========================================================================== */

    closeExplanation() {
      const context = getContext();

      context.isExplaining = false;
      context.isAnalyzingExplanation = false;
      context.explanationError = '';
    },

    *explainCode() {
      const context = getContext();

      /*
       * If the explanation drawer is already open and we have
       * completed explanation content, close the drawer.
       */
      if (
        context.isExplaining &&
        context.explanationText &&
        !context.isAnalyzingExplanation
      ) {
        context.isExplaining = false;
        return;
      }

      context.isExplaining = true;

      /*
       * Use the existing explanation if we already have one.
       */
      if (
        context.explanationText &&
        !context.explanationError
      ) {
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

      /*
       * ------------------------------------------------------------------------
       * First attempt: Direct REST endpoint
       * ------------------------------------------------------------------------
       */

      try {
        const directRes = yield fetch(
          '/wp-json/intelligent-code-assistant/v1/explain-code',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: payload,
          }
        );

        if (directRes.ok) {
          response = yield directRes.json();
        }
      } catch (err) {
        // Fall through to the Abilities API.
        console.warn(
          '[Code Dropdown AI] Direct REST request failed:',
          err
        );
      }

      /*
       * ------------------------------------------------------------------------
       * Second attempt: WordPress Abilities API
       * ------------------------------------------------------------------------
       */

      if (!response) {
        try {
          const abilityRes = yield fetch(
            '/wp-json/wp/v2/abilities/intelligent-code-assistant/explain-code/run',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: payload,
            }
          );

          if (abilityRes.ok) {
            response = yield abilityRes.json();
          }
        } catch (err) {
          console.warn(
            '[Code Dropdown AI] Abilities API request failed:',
            err
          );
        }
      }

      /*
       * ------------------------------------------------------------------------
       * Process response
       * ------------------------------------------------------------------------
       */

      if (
        response &&
        typeof response.explanation === 'string' &&
        response.explanation.trim()
      ) {
        context.explanationText =
          response.explanation.trim();

        /*
         * Store the explanation as an array of plain-text
         * items for data-wp-each rendering.
         */
        context.explanationItems =
          formatExplanationItems(
            response.explanation
          );

        context.explanationError = '';
      } else {
        context.explanationError =
          'Unable to generate code explanation right now.';

        context.explanationText = '';
        context.explanationItems = [];
      }

      context.isAnalyzingExplanation = false;
    },

    /* ==========================================================================
       STEP 5: CODE PERSONALIZER
       ========================================================================== */

    handleCustomInstructionInput(e) {
      const context = getContext();

      context.userInstruction = e.target.value;
    },

    togglePersonalizeDrawer() {
      const context = getContext();

      context.isPersonalizing =
        !context.isPersonalizing;
    },

    *customizeCode() {
      const context = getContext();

      if (
        !context.userInstruction ||
        !context.userInstruction.trim()
      ) {
        context.personalizeError =
          'Please enter your setup variables or instructions.';

        return;
      }

      context.isCustomizing = true;
      context.personalizeError = '';

      const payload = JSON.stringify({
        code:
          context.activeCodeText ||
          context.rawCodeText ||
          '',

        userInstruction:
          context.userInstruction,

        language:
          context.codeLanguage || 'PHP',
      });

      let response = null;

      /*
       * ------------------------------------------------------------------------
       * First attempt: Direct REST endpoint
       * ------------------------------------------------------------------------
       */

      try {
        const directRes = yield fetch(
          '/wp-json/intelligent-code-assistant/v1/customize-code',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: payload,
          }
        );

        if (directRes.ok) {
          response = yield directRes.json();
        }
      } catch (err) {
        console.warn(
          '[Code Dropdown AI] Direct customize request failed:',
          err
        );
      }

      /*
       * ------------------------------------------------------------------------
       * Second attempt: WordPress Abilities API
       * ------------------------------------------------------------------------
       */

      if (!response) {
        try {
          const abilityRes = yield fetch(
            '/wp-json/wp/v2/abilities/intelligent-code-assistant/customize-code/run',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: payload,
            }
          );

          if (abilityRes.ok) {
            response = yield abilityRes.json();
          }
        } catch (err) {
          console.warn(
            '[Code Dropdown AI] Abilities customize request failed:',
            err
          );
        }
      }

      /*
       * ------------------------------------------------------------------------
       * Process response
       * ------------------------------------------------------------------------
       */

      if (
        response &&
        typeof response.personalizedCode === 'string' &&
        response.personalizedCode.trim()
      ) {
        context.activeCodeText =
          response.personalizedCode;

        context.isPersonalized = true;
        context.isPersonalizing = false;
        context.userInstruction = '';
        context.personalizeError = '';
      } else {
        context.personalizeError =
          'Unable to adapt code to your setup right now.';
      }

      context.isCustomizing = false;
    },

    resetCode() {
      const context = getContext();

      context.activeCodeText =
        context.rawCodeText || '';

      context.isPersonalized = false;
      context.personalizeError = '';
    },

    /* ==========================================================================
       CLIPBOARD UTILITY
       ========================================================================== */

    async copyToClipboard() {
      const context = getContext();

      const { ref: buttonElement } = getElement();

      if (!buttonElement) {
        return;
      }

      const blockElement = buttonElement.closest(
        '[data-wp-interactive="wpe"]'
      );

      const contentContainer =
        blockElement?.querySelector(
          '.panel-content'
        );

      if (!contentContainer) {
        return;
      }

      try {
        const textToCopy =
          contentContainer.textContent ||
          contentContainer.innerText ||
          '';

        const cleanedText = textToCopy.trim();

        /*
         * Modern Clipboard API.
         */
        if (
          navigator.clipboard &&
          window.isSecureContext
        ) {
          await navigator.clipboard.writeText(
            cleanedText
          );
        } else {
          /*
           * Fallback for older browsers / non-secure contexts.
           */
          const textarea =
            document.createElement('textarea');

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
        console.error(
          '[Code Dropdown] Failed to copy text:',
          err
        );
      }
    },
  },

  /* ============================================================================
     CALLBACKS
     ============================================================================ */

  callbacks: {
    /* --------------------------------------------------------------------------
       Shared initialisation
       -------------------------------------------------------------------------- */

    initShared() {
      if (state._storageLoaded) {
        return;
      }

      try {
        const storedTasks =
          localStorage.getItem(STORAGE_KEY);

        state.tasks = storedTasks
          ? JSON.parse(storedTasks)
          : {};
      } catch (err) {
        state.tasks = {};
      }

      state._storageLoaded = true;
    },

    /* --------------------------------------------------------------------------
       Individual task initialisation
       -------------------------------------------------------------------------- */

    initTask() {
      const context = getContext();

      if (!context.id) {
        return;
      }

      /*
       * Load local storage if initShared hasn't run yet.
       */
      if (!state._storageLoaded) {
        try {
          const storedTasks =
            localStorage.getItem(STORAGE_KEY);

          state.tasks = storedTasks
            ? JSON.parse(storedTasks)
            : {};
        } catch (err) {
          state.tasks = {};
        }

        state._storageLoaded = true;
      }

      /*
       * Register this task.
       */
      if (
        !state.registeredIds.includes(context.id)
      ) {
        state.registeredIds = [
          ...state.registeredIds,
          context.id,
        ];
      }

      /*
       * Completion state.
       */
      context.isComplete =
        state.tasks[context.id] ?? false;

      context.isCopied = false;

      /*
       * ------------------------------------------------------------------------
       * Step 4: Explanation state
       * ------------------------------------------------------------------------
       */

      context.isExplaining = false;
      context.isAnalyzingExplanation = false;
      context.explanationText = '';
      context.explanationItems = [];
      context.explanationError = '';

      /*
       * ------------------------------------------------------------------------
       * Step 5: Personalizer state
       * ------------------------------------------------------------------------
       */

      context.isPersonalizing = false;
      context.isCustomizing = false;
      context.isPersonalized = false;
      context.userInstruction = '';
      context.personalizeError = '';

      context.activeCodeText =
        context.rawCodeText || '';

      /*
       * Completion button text.
       */
      context.completeText =
        context.isComplete
          ? '✓'
          : 'Mark as complete';

      /*
       * ------------------------------------------------------------------------
       * Highlighted lines
       * ------------------------------------------------------------------------
       */

      if (context.highlightLines) {
        const targetLines = new Set();

        const ranges =
          context.highlightLines.split(',');

        ranges.forEach((range) => {
          const parts = range
            .split('-')
            .map((num) =>
              parseInt(num.trim(), 10)
            );

          /*
           * Range, e.g. 3-7
           */
          if (
            parts.length === 2 &&
            !isNaN(parts[0]) &&
            !isNaN(parts[1])
          ) {
            const start = Math.min(
              parts[0],
              parts[1]
            );

            const end = Math.max(
              parts[0],
              parts[1]
            );

            for (
              let i = start;
              i <= end;
              i++
            ) {
              targetLines.add(i);
            }
          }

          /*
           * Single line, e.g. 4
           */
          else if (
            parts.length === 1 &&
            !isNaN(parts[0])
          ) {
            targetLines.add(parts[0]);
          }
        });

        context.highlightedNumbers =
          Array.from(targetLines);
      } else {
        context.highlightedNumbers = [];
      }
    },
  },
});