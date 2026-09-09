import {
  store,
  getContext,
  getElement,
} from '@wordpress/interactivity';

import {
  buildAIContext,
  formatAIItems,
  requestAICapability,
} from './ai-context';

const STORAGE_KEY = 'wpe_tasks';

function getAIErrorMessage(response) {
  const status = Number(response?.status || 0);

  if (status === 429) {
    return 'AI assistance is temporarily unavailable. Please try again later.';
  }

  if (status === 503) {
    return 'The AI service is currently busy. Please try again in a moment.';
  }

  return 'Unable to generate an AI response right now. Please try again.';
}

const { state } = store('wpe', {
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

      return Math.round(
        (state.completedTasks / state.totalTasks) * 100
      );
    },

    get progressBarStyle() {
      return `width: ${state.progressPercent}%; transition: width 0.5s ease;`;
    },

    get isAllDone() {
      return (
        state.totalTasks > 0 &&
        state.completedTasks === state.totalTasks
      );
    },
    get isCheckOption0Correct() {
  const context = getContext();

  return (
    context.hasAnsweredCheck &&
    context.checkCorrectAnswer === 0
  );
},

get isCheckOption1Correct() {
  const context = getContext();

  return (
    context.hasAnsweredCheck &&
    context.checkCorrectAnswer === 1
  );
},

get isCheckOption2Correct() {
  const context = getContext();

  return (
    context.hasAnsweredCheck &&
    context.checkCorrectAnswer === 2
  );
},

get isCheckOption0Incorrect() {
  const context = getContext();

  return (
    context.hasAnsweredCheck &&
    context.selectedCheckAnswer === 0 &&
    context.checkCorrectAnswer !== 0
  );
},

get isCheckOption1Incorrect() {
  const context = getContext();

  return (
    context.hasAnsweredCheck &&
    context.selectedCheckAnswer === 1 &&
    context.checkCorrectAnswer !== 1
  );
},

get isCheckOption2Incorrect() {
  const context = getContext();

  return (
    context.hasAnsweredCheck &&
    context.selectedCheckAnswer === 2 &&
    context.checkCorrectAnswer !== 2
  );
},
  },

  actions: {
    toggleOpen() {
      const context = getContext();

      context.isOpen = !context.isOpen;
      context.toggleText = context.isOpen
        ? context.closeText
        : context.openText;
    },

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
        // Local storage is optional.
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
        // Local completion remains available.
      }
    },

    /* ==========================================================================
       EXPLAIN ENTIRE CODE SNIPPET
       ========================================================================== */

    closeExplanation() {
      const context = getContext();

      context.isExplaining = false;
      context.isAnalyzingExplanation = false;
      context.explanationError = '';
    },

    *explainCode() {
      const context = getContext();

      if (
        context.isExplaining &&
        context.explanationText &&
        !context.isAnalyzingExplanation
      ) {
        context.isExplaining = false;
        return;
      }

      context.isExplaining = true;

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

      /*
       * Explain Code always receives the complete snippet.
       *
       * Selecting a line should not change the meaning of the
       * original Explain button. Line explanations use their
       * own action and Ability.
       */
      const response = yield requestAICapability(
        'explain-code',
        buildAIContext(context)
      );

      if (response?.error) {
  context.explanationText = '';
  context.explanationItems = [];
  context.explanationError = getAIErrorMessage(response);
} else if (
  response &&
  typeof response.explanation === 'string' &&
  response.explanation.trim()
) {
  context.explanationText = response.explanation.trim();
  context.explanationItems = formatAIItems(response.explanation);
  context.explanationError = '';
} else {
  context.explanationText = '';
  context.explanationItems = [];
  context.explanationError =
    'Unable to generate a code explanation right now.';
}

      context.isAnalyzingExplanation = false;
    },

    /* ==========================================================================
       STAGE 2: EXPLAIN SELECTED LINE
       ========================================================================== */

    *explainLine() {
  const context = getContext();

  if (!context.selectedLineNumber || !context.selectedLineText) {
    context.lineExplanationError = 'Select a line of code first.';
    return;
  }

  context.isExplainingLine = true;
  context.isAnalyzingLine = true;
  context.lineExplanation = '';
  context.lineExplanationError = '';

  const lines = (context.rawCodeText || '').split('\n');

  const selectedLineNumber = Number(
    context.selectedLineNumber
  );

  const start = Math.max(
    1,
    selectedLineNumber - 2
  );

  const end = Math.min(
    lines.length,
    selectedLineNumber + 2
  );

  const surroundingCode = lines
    .slice(start - 1, end)
    .map((line, index) => {
      const lineNumber = start + index;

      const marker =
        lineNumber === selectedLineNumber
          ? '>>>'
          : '   ';

      return `${marker} ${lineNumber}: ${line}`;
    })
    .join('\n');

  const payload = buildAIContext(
    context,
    {
      selectedLineNumber,
      selectedLine:
        context.selectedLineText,
      surroundingCode,
    }
  );

  const response =
    yield requestAICapability(
      'explain-line',
      payload
    );
if (response?.error) {
  context.lineExplanation = '';
  context.lineExplanationError = getAIErrorMessage(response);
} else if (
  response &&
  typeof response.explanation === 'string' &&
  response.explanation.trim()
) {
  context.lineExplanation = response.explanation.trim();
  context.lineExplanationError = '';
} else {
  context.lineExplanation = '';
  context.lineExplanationError =
    'Unable to explain this line right now.';
}

context.isAnalyzingLine = false;
},

/* ==========================================================================
       ASK CODE QUESTION
  ========================================================================== */

handleCodeQuestionInput(event) {
  const context = getContext();

  context.codeQuestion = event.target.value;
  context.codeQuestionError = '';
},

toggleAskCode() {
  const context = getContext();

  context.isAskingCode = !context.isAskingCode;

  if (!context.isAskingCode) {
    context.codeQuestionError = '';
  }
},

*submitCodeQuestion() {
  const context = getContext();
  const question = (context.codeQuestion || '').trim();

  if (!question) {
    context.codeQuestionError = 'Enter a question about this code first.';
    return;
  }

  if (context.isSubmittingQuestion) {
    return;
  }

  context.isSubmittingQuestion = true;
  context.codeQuestionError = '';
  context.codeAnswer = '';

  const requestContext = {
    ...context,
    question,
  };

  try {
    const response = yield requestAICapability(
      'ask-code',
      buildAIContext(requestContext)
    );

    if (
      response &&
      typeof response.answer === 'string' &&
      response.answer.trim()
    ) {
      context.codeAnswer = response.answer.trim();
      context.codeQuestionError = '';
    } else {
      context.codeAnswer = '';
      context.codeQuestionError =
        'AI assistance is temporarily unavailable. Please try again later.';
    }
  } catch (error) {
    context.codeAnswer = '';
    context.codeQuestionError =
      'AI assistance is temporarily unavailable. Please try again later.';
  } finally {
    context.isSubmittingQuestion = false;
  }
},



*generateUnderstandingCheck() {
  const context = getContext();

  if (context.isGeneratingCheck) {
    return;
  }

  // If the panel already contains a generated question,
  // use the button as a toggle instead of generating again.
  if (context.checkQuestion) {
    context.isCheckingUnderstanding = !context.isCheckingUnderstanding;
    return;
  }

  context.isCheckingUnderstanding = true;
  context.isGeneratingCheck = true;
  context.checkError = '';

  // Reset any previous exercise state.
  context.checkQuestion = '';
  context.checkOptions = [];
  context.checkCorrectAnswer = null;
  context.checkExplanation = '';
  context.selectedCheckAnswer = null;
  context.hasAnsweredCheck = false;
  context.isCheckCorrect = false;

  try {
  // TEMPORARY: Mock structured AI response for local UI testing.
  const response = {
    question: 'Why is wp_unslash() used when handling this value?',
    options: [
      'To remove slashes added to request data',
      'To escape the value before displaying it',
      'To validate that the value is a string',
    ],
    correctAnswer: 0,
    explanation:
      'wp_unslash() removes slashes that WordPress may add to incoming request data.',
  };

  const hasValidResponse =
    response &&
    typeof response.question === 'string' &&
    response.question.trim() &&
    Array.isArray(response.options) &&
    response.options.length === 3 &&
    Number.isInteger(response.correctAnswer) &&
    response.correctAnswer >= 0 &&
    response.correctAnswer <= 2 &&
    typeof response.explanation === 'string';
  // try {
  //   const response = yield requestAICapability(
  //     'check-understanding',
  //     buildAIContext(context)
  //   );

  //   const hasValidResponse =
  //     response &&
  //     typeof response.question === 'string' &&
  //     response.question.trim() &&
  //     Array.isArray(response.options) &&
  //     response.options.length === 3 &&
  //     Number.isInteger(response.correctAnswer) &&
  //     response.correctAnswer >= 0 &&
  //     response.correctAnswer <= 2 &&
  //     typeof response.explanation === 'string';

    if (!hasValidResponse) {
      context.checkError =
        'Unable to generate a knowledge check right now.';
      return;
    }

    context.checkQuestion = response.question.trim();
    context.checkOptions = response.options;
    context.checkOption0 = response.options[0];
    context.checkOption1 = response.options[1];
    context.checkOption2 = response.options[2];
    context.checkCorrectAnswer = response.correctAnswer;
    context.checkExplanation = response.explanation.trim();
  } catch (error) {
    context.checkError =
      'Unable to generate a knowledge check right now.';
  } finally {
    context.isGeneratingCheck = false;
  }
},

selectCheckAnswer(event) {
  const context = getContext();

  if (context.hasAnsweredCheck) {
    return;
  }

  const answerIndex = Number(
    event.currentTarget.dataset.answerIndex
  );

  if (
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex >= context.checkOptions.length
  ) {
    return;
  }

  context.selectedCheckAnswer = answerIndex;
  context.hasAnsweredCheck = true;
  context.isCheckCorrect =
    answerIndex === context.checkCorrectAnswer;

},

    /* ==========================================================================
       CLIPBOARD
       ========================================================================== */

    async copyToClipboard() {
      const context = getContext();

      /*
       * Use the original code context rather than panel.textContent.
       *
       * The panel now also contains line-selection controls, so
       * copying the panel would include UI text such as:
       *
       * "Selected: Line 4 Explain this line".
       */
      const cleanedText = (
        context.rawCodeText || ''
      ).trim();

      if (!cleanedText) {
        return;
      }

      try {
        if (
          navigator.clipboard &&
          window.isSecureContext
        ) {
          await navigator.clipboard.writeText(
            cleanedText
          );
        } else {
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
          '[Intelligent Code Assistant] Failed to copy code.',
          err
        );
      }
    },
  },

  callbacks: {
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

    initTask() {
      const context = getContext();

      if (!context.id) {
        return;
      }

      /*
       * Load shared completion state.
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
       * Register this block instance.
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
       * Base block state.
       */
      context.isComplete =
        state.tasks[context.id] ?? false;

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

      /*
       * Ask question state.
       */
      context.isAskingCode = false;
      context.isSubmittingQuestion = false;
      context.codeQuestion = '';
      context.codeAnswer = '';
      context.codeQuestionError = '';

      /*
       * Check understanding state.
       */
      context.isCheckingUnderstanding = false;
      context.isGeneratingCheck = false;

      context.checkQuestion = '';
      context.checkOptions = [];
      context.checkCorrectAnswer = null;
      context.checkExplanation = '';

      context.selectedCheckAnswer = null;
      context.hasAnsweredCheck = false;
      context.isCheckCorrect = false;

      context.checkError = '';

      context.completeText = context.isComplete
        ? '✓'
        : 'Mark as complete';

      context.checkOption0 = '';
      context.checkOption1 = '';
      context.checkOption2 = '';



      /*
       * Existing author-defined important lines.
       *
       * This remains separate from the reader's selected line.
       */
      if (context.highlightLines) {
        const targetLines = new Set();

        context.highlightLines
          .split(',')
          .forEach((range) => {
            const parts = range
              .split('-')
              .map((num) =>
                parseInt(num.trim(), 10)
              );

            if (
              parts.length === 2 &&
              !Number.isNaN(parts[0]) &&
              !Number.isNaN(parts[1])
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
                i += 1
              ) {
                targetLines.add(i);
              }
            } else if (
              parts.length === 1 &&
              !Number.isNaN(parts[0])
            ) {
              targetLines.add(parts[0]);
            }
          });

        context.highlightedNumbers =
          Array.from(targetLines);
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
      const { ref: blockElement } = getElement();

      const panel =
        blockElement?.querySelector(
          '.panel-content'
        );

      if (
        !panel ||
        panel.dataset.lineSelectionBound
      ) {
        return;
      }

      panel.dataset.lineSelectionBound = 'true';

      panel.setAttribute(
        'aria-label',
        'Code. Select a line to explain it with AI.'
      );

      /**
       * Select one source-code line.
       *
       * @param {HTMLElement} lineElement
       */
      const selectLine = (lineElement) => {
        const lineNumber = Number(
          lineElement.dataset.lineNumber
        );

        if (
          !lineNumber ||
          Number.isNaN(lineNumber)
        ) {
          return;
        }

        const lines = (
          context.rawCodeText || ''
        ).split('\n');

        context.selectedLineNumber =
          lineNumber;

        context.selectedLineText =
          lines[lineNumber - 1] || '';

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
        panel
          .querySelectorAll('.code-line')
          .forEach((line) => {
            line.classList.remove(
              'is-selected'
            );

            line.removeAttribute(
              'aria-current'
            );
          });

        /*
         * Highlight only the newly selected line.
         */
        lineElement.classList.add(
          'is-selected'
        );

        lineElement.setAttribute(
          'aria-current',
          'true'
        );
      };

      /*
       * Mouse/pointer selection.
       *
       * Prism may add token spans inside each code line,
       * therefore event.target.closest('.code-line') is used
       * instead of assuming the clicked element is the line.
       */
      panel.addEventListener(
        'click',
        (event) => {
          const lineElement =
            event.target.closest('.code-line');

          if (
            !lineElement ||
            !panel.contains(lineElement)
          ) {
            return;
          }

          selectLine(lineElement);
        }
      );

      /*
       * Keyboard selection.
       *
       * Lines are focusable in render.php, so Enter or Space
       * performs the same selection as clicking.
       */
      panel.addEventListener(
        'keydown',
        (event) => {
          if (
            event.key !== 'Enter' &&
            event.key !== ' '
          ) {
            return;
          }

          const lineElement =
            event.target.closest('.code-line');

          if (
            !lineElement ||
            !panel.contains(lineElement)
          ) {
            return;
          }

          event.preventDefault();

          selectLine(lineElement);
        }
      );
    },
  },
});