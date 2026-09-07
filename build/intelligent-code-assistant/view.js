import * as __WEBPACK_EXTERNAL_MODULE__wordpress_interactivity_8e89b257__ from "@wordpress/interactivity";
/******/ var __webpack_modules__ = ({

/***/ "./src/intelligent-code-assistant/ai-context.js"
/*!******************************************************!*\
  !*** ./src/intelligent-code-assistant/ai-context.js ***!
  \******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildAIContext: () => (/* binding */ buildAIContext),
/* harmony export */   formatAIItems: () => (/* binding */ formatAIItems),
/* harmony export */   requestAICapability: () => (/* binding */ requestAICapability)
/* harmony export */ });
/**
 * Build the shared context sent to every AI assistant capability.
 *
 * Keeping context construction in one place means new assistant modes can
 * add intent-specific fields without duplicating the basic code metadata.
 *
 * @param {Object} context Block context from the Interactivity API.
 * @param {Object} extras Additional capability-specific context.
 * @return {Object} Normalized AI context.
 */
function buildAIContext(context, extras = {}) {
  return {
    code: context.rawCodeText || context.activeCodeText || '',
    language: context.codeLanguage || 'code',
    filename: context.filename || '',
    title: context.title || '',
    ...extras
  };
}

/**
 * Send a request to a WordPress AI Assistant capability.
 *
 * The direct REST route is attempted first so the block remains independent
 * of the public Abilities REST transport. The Ability route is the canonical
 * WordPress capability and acts as the fallback.
 *
 * @param {string} capability Capability slug, e.g. "explain-code".
 * @param {Object} payload Normalized AI context.
 * @return {Promise<Object|null>} Capability response or null on failure.
 */
async function requestAICapability(capability, payload) {
  const directResponse = await fetch(`/wp-json/intelligent-code-assistant/v1/${capability}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).catch(() => null);
  if (directResponse?.ok) {
    return directResponse.json();
  }
  const abilityResponse = await fetch(`/wp-json/wp/v2/abilities/intelligent-code-assistant/${capability}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).catch(() => null);
  if (abilityResponse?.ok) {
    return abilityResponse.json();
  }
  return null;
}

/**
 * Normalize a text response into safe plain-text items.
 *
 * @param {string} text AI response text.
 * @return {string[]} Plain-text response items.
 */
function formatAIItems(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  return text.split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => line.replace(/^(?:[•\-*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

/***/ },

/***/ "@wordpress/interactivity"
/*!*******************************************!*\
  !*** external "@wordpress/interactivity" ***!
  \*******************************************/
(module) {

module.exports = __WEBPACK_EXTERNAL_MODULE__wordpress_interactivity_8e89b257__;

/***/ }

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ const __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __webpack_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	const cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	const module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	if (!(moduleId in __webpack_modules__)) {
/******/ 		delete __webpack_module_cache__[moduleId];
/******/ 		const e = new Error("Cannot find module '" + moduleId + "'");
/******/ 		e.code = 'MODULE_NOT_FOUND';
/******/ 		throw e;
/******/ 	}
/******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ // define getter/value functions for harmony exports
/******/ __webpack_require__.d = (exports, definition) => {
/******/ 	for(var key in definition) {
/******/ 		if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 			Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 		}
/******/ 	}
/******/ };
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ __webpack_require__.o = (obj, prop) => (Object.hasOwn(obj, prop));
/******/ 
/******/ /* webpack/runtime/make namespace object */
/******/ // define __esModule on exports
/******/ __webpack_require__.r = (exports) => {
/******/ 	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 	Object.defineProperty(exports, '__esModule', { value: true });
/******/ };
/******/ 
/************************************************************************/
let __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!************************************************!*\
  !*** ./src/intelligent-code-assistant/view.js ***!
  \************************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @wordpress/interactivity */ "@wordpress/interactivity");
/* harmony import */ var _ai_context__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ai-context */ "./src/intelligent-code-assistant/ai-context.js");


const STORAGE_KEY = 'wpe_tasks';
const {
  state
} = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.store)('wpe', {
  state: {
    currentlyOpenId: null,
    registeredIds: [],
    tasks: {},
    _storageLoaded: false,
    get totalTasks() {
      return state.registeredIds.length;
    },
    get completedTasks() {
      return state.registeredIds.filter(id => state.tasks[id]).length;
    },
    get progressPercent() {
      if (!state.totalTasks) {
        return 0;
      }
      return Math.round(state.completedTasks / state.totalTasks * 100);
    },
    get progressBarStyle() {
      return `width: ${state.progressPercent}%; transition: width 0.5s ease;`;
    },
    get isAllDone() {
      return state.totalTasks > 0 && state.completedTasks === state.totalTasks;
    }
  },
  actions: {
    toggleOpen() {
      const context = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getContext)();
      context.isOpen = !context.isOpen;
      context.toggleText = context.isOpen ? context.closeText : context.openText;
    },
    *toggleComplete() {
      const context = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getContext)();
      context.isComplete = !context.isComplete;
      context.completeText = context.isComplete ? '✓' : 'Mark as complete';
      state.tasks = {
        ...state.tasks,
        [context.id]: context.isComplete
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
      } catch (err) {
        // Local storage is optional.
      }
      try {
        yield fetch('/wp-json/intelligent-code-assistant/v1/toggle-complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': window.wpApiSettings?.nonce || ''
          },
          body: JSON.stringify({
            block_id: context.id,
            status: context.isComplete
          })
        });
      } catch (err) {
        // Local completion remains available.
      }
    },
    /* ==========================================================================
       EXPLAIN ENTIRE CODE SNIPPET
       ========================================================================== */

    closeExplanation() {
      const context = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getContext)();
      context.isExplaining = false;
      context.isAnalyzingExplanation = false;
      context.explanationError = '';
    },
    *explainCode() {
      const context = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getContext)();
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

      /*
       * Explain Code always receives the complete snippet.
       *
       * Selecting a line should not change the meaning of the
       * original Explain button. Line explanations use their
       * own action and Ability.
       */
      const response = yield (0,_ai_context__WEBPACK_IMPORTED_MODULE_1__.requestAICapability)('explain-code', (0,_ai_context__WEBPACK_IMPORTED_MODULE_1__.buildAIContext)(context));
      if (response && typeof response.explanation === 'string' && response.explanation.trim()) {
        context.explanationText = response.explanation.trim();
        context.explanationItems = (0,_ai_context__WEBPACK_IMPORTED_MODULE_1__.formatAIItems)(response.explanation);
      } else {
        context.explanationError = 'Unable to generate a code explanation right now.';
      }
      context.isAnalyzingExplanation = false;
    },
    /* ==========================================================================
       STAGE 2: EXPLAIN SELECTED LINE
       ========================================================================== */

    *explainLine() {
      const context = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getContext)();
      if (!context.selectedLineNumber || !context.selectedLineText) {
        context.lineExplanationError = 'Select a line of code first.';
        return;
      }
      context.isExplainingLine = true;
      context.isAnalyzingLine = true;
      context.lineExplanation = '';
      context.lineExplanationError = '';

      /*
       * Temporary Stage 2 test.
       *
       * The next step will replace this with:
       *
       * requestAICapability(
       *   'explain-line',
       *   buildAIContext(...)
       * )
       */
      console.log('[Intelligent Code Assistant] Explain line request:', {
        lineNumber: context.selectedLineNumber,
        lineText: context.selectedLineText,
        language: context.codeLanguage
      });
      context.isAnalyzingLine = false;
    },
    /* ==========================================================================
       CLIPBOARD
       ========================================================================== */

    async copyToClipboard() {
      const context = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getContext)();

      /*
       * Use the original code context rather than panel.textContent.
       *
       * The panel now also contains line-selection controls, so
       * copying the panel would include UI text such as:
       *
       * "Selected: Line 4 Explain this line".
       */
      const cleanedText = (context.rawCodeText || '').trim();
      if (!cleanedText) {
        return;
      }
      try {
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
    }
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
      const context = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getContext)();
      if (!context.id) {
        return;
      }

      /*
       * Load shared completion state.
       */
      if (!state._storageLoaded) {
        try {
          const storedTasks = localStorage.getItem(STORAGE_KEY);
          state.tasks = storedTasks ? JSON.parse(storedTasks) : {};
        } catch (err) {
          state.tasks = {};
        }
        state._storageLoaded = true;
      }

      /*
       * Register this block instance.
       */
      if (!state.registeredIds.includes(context.id)) {
        state.registeredIds = [...state.registeredIds, context.id];
      }

      /*
       * Base block state.
       */
      context.isComplete = state.tasks[context.id] ?? false;
      context.isCopied = false;

      /*
       * Whole-code explanation state.
       */
      context.isExplaining = false;
      context.isAnalyzingExplanation = false;
      context.explanationText = '';
      context.explanationItems = [];
      context.explanationError = '';

      /*
       * Selected-line state.
       */
      context.selectedLineNumber = 0;
      context.selectedLineText = '';
      context.isExplainingLine = false;
      context.isAnalyzingLine = false;
      context.lineExplanation = '';
      context.lineExplanationError = '';
      context.completeText = context.isComplete ? '✓' : 'Mark as complete';

      /*
       * Existing author-defined important lines.
       *
       * This remains separate from the reader's selected line.
       */
      if (context.highlightLines) {
        const targetLines = new Set();
        context.highlightLines.split(',').forEach(range => {
          const parts = range.split('-').map(num => parseInt(num.trim(), 10));
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

      /*
       * Stage 2 line selection.
       *
       * Each source-code line now exists as a real .code-line
       * element, so we no longer need to calculate a line based
       * on mouse coordinates and line height.
       */
      const {
        ref: blockElement
      } = (0,_wordpress_interactivity__WEBPACK_IMPORTED_MODULE_0__.getElement)();
      const panel = blockElement?.querySelector('.panel-content');
      if (!panel || panel.dataset.lineSelectionBound) {
        return;
      }
      panel.dataset.lineSelectionBound = 'true';
      panel.setAttribute('aria-label', 'Code. Select a line to explain it with AI.');

      /**
       * Select one source-code line.
       *
       * @param {HTMLElement} lineElement
       */
      const selectLine = lineElement => {
        const lineNumber = Number(lineElement.dataset.lineNumber);
        if (!lineNumber || Number.isNaN(lineNumber)) {
          return;
        }
        const lines = (context.rawCodeText || '').split('\n');
        context.selectedLineNumber = lineNumber;
        context.selectedLineText = lines[lineNumber - 1] || '';

        /*
         * Selecting another line invalidates any previous
         * line-specific explanation.
         */
        context.isExplainingLine = false;
        context.isAnalyzingLine = false;
        context.lineExplanation = '';
        context.lineExplanationError = '';

        /*
         * Remove the previous reader selection.
         */
        panel.querySelectorAll('.code-line').forEach(line => {
          line.classList.remove('is-selected');
          line.removeAttribute('aria-current');
        });

        /*
         * Highlight only the newly selected line.
         */
        lineElement.classList.add('is-selected');
        lineElement.setAttribute('aria-current', 'true');
      };

      /*
       * Mouse/pointer selection.
       *
       * Prism may add token spans inside each code line,
       * therefore event.target.closest('.code-line') is used
       * instead of assuming the clicked element is the line.
       */
      panel.addEventListener('click', event => {
        const lineElement = event.target.closest('.code-line');
        if (!lineElement || !panel.contains(lineElement)) {
          return;
        }
        selectLine(lineElement);
      });

      /*
       * Keyboard selection.
       *
       * Lines are focusable in render.php, so Enter or Space
       * performs the same selection as clicking.
       */
      panel.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        const lineElement = event.target.closest('.code-line');
        if (!lineElement || !panel.contains(lineElement)) {
          return;
        }
        event.preventDefault();
        selectLine(lineElement);
      });
    }
  }
});
})();


//# sourceMappingURL=view.js.map