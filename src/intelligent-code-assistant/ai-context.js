/**
 * Find the code block currently being used by the assistant.
 *
 * The floating assistant marks its active block. As a fallback, match the
 * rendered code text so inline interactions still receive useful context.
 *
 * @param {string} code Current code snippet.
 * @return {Element|null} Matching code block element.
 */
function getCurrentCodeBlock(code = '') {
  if (typeof document === 'undefined') {
    return null;
  }

  const activeBlock = document.querySelector(
    '[data-ai-assistant-enabled="true"][data-ai-assistant-active="true"]'
  );

  if (activeBlock) {
    return activeBlock;
  }

  const normalizedCode = code.trim();

  if (!normalizedCode) {
    return null;
  }

  return (
    Array.from(
      document.querySelectorAll('[data-ai-assistant-enabled="true"]')
    ).find((block) => {
      const renderedCode = block.querySelector('.code-lines')?.textContent || '';
      return renderedCode.trim() === normalizedCode;
    }) || null
  );
}

/**
 * Derive the article title without storing the same value on every code block.
 *
 * @return {string} Tutorial/article title.
 */
function getTutorialTitle() {
  if (typeof document === 'undefined') {
    return '';
  }

  const titleElement = document.querySelector(
    'article h1, h1.wp-block-post-title, h1.entry-title, main h1'
  );

  if (titleElement?.textContent?.trim()) {
    return titleElement.textContent.trim();
  }

  return document.title?.trim() || '';
}

/**
 * Return useful tutorial text from an element in document order.
 *
 * @param {Element} element Element to inspect.
 * @return {Element[]} Heading and paragraph candidates.
 */
function getTutorialTextCandidates(element) {
  if (element.matches('h2, h3, h4, p')) {
    return [element];
  }

  return Array.from(element.querySelectorAll('h2, h3, h4, p'));
}

/**
 * Collect a deliberately small amount of nearby article content.
 *
 * Start with previous siblings of the active block. If the block is nested in
 * a Group, Column or another layout wrapper, progressively climb the DOM and
 * inspect the wrapper's previous siblings too. Stop at the nearest section
 * heading so the model receives the current lesson context rather than the
 * entire article.
 *
 * @param {Element|null} block Current code block element.
 * @return {string} Focused section context.
 */
function getFocusedTutorialContext(block) {
  if (!block) {
    return '';
  }

  const fragments = [];
  let current = block;
  let inspected = 0;
  let foundHeading = false;

  while (current && inspected < 12 && !foundHeading) {
    let sibling = current.previousElementSibling;

    while (sibling && inspected < 12 && !foundHeading) {
      const candidates = getTutorialTextCandidates(sibling);

      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        const text = candidate.textContent?.replace(/\s+/g, ' ').trim();

        if (!text) {
          continue;
        }

        fragments.unshift(text);

        if (/^H[2-4]$/.test(candidate.tagName)) {
          foundHeading = true;
          break;
        }
      }

      sibling = sibling.previousElementSibling;
      inspected += 1;
    }

    if (foundHeading) {
      break;
    }

    const parent = current.parentElement;

    if (!parent || parent.matches('article, main, body')) {
      break;
    }

    current = parent;
  }

  return fragments.join('\n').slice(0, 1200);
}

/**
 * Build the shared context sent to every AI assistant capability.
 *
 * Article-level context is derived from the rendered tutorial instead of
 * being duplicated across every code block. Block-specific context still
 * comes from the current code example.
 *
 * @param {Object} context Block context from the Interactivity API.
 * @param {Object} extras Additional capability-specific context.
 * @return {Object} Normalized AI context.
 */
export function buildAIContext(context, extras = {}) {
  const code = context.activeCodeText || context.rawCodeText || '';
  const currentBlock = getCurrentCodeBlock(code);
  const renderedCodeTitle =
    currentBlock?.querySelector('.code-title')?.textContent?.trim() || '';

  return {
    code,
    language: context.codeLanguage || 'code',
    filename: context.codeFilename || '',
    title: context.codeTitle || renderedCodeTitle,
    tutorialTitle: context.tutorialTitle || getTutorialTitle(),
    tutorialContext:
      context.tutorialContext || getFocusedTutorialContext(currentBlock),
    question: context.question || context.codeQuestion || '',
    ...extras,
  };
}

/**
 * Send a reader-facing AI request through the plugin's public REST boundary.
 *
 * Public visitors deliberately do not call the WordPress Abilities REST
 * transport directly. The plugin endpoint is anonymous, validates and rate
 * limits the request, then invokes the same server-side AI capability using
 * the site's configured provider/connector credentials.
 *
 * @param {string} capability Capability slug, e.g. "explain-code".
 * @param {Object} payload Normalized AI context.
 * @return {Promise<Object|null>} Capability response or normalized error.
 */
export async function requestAICapability(capability, payload) {
  // Demo-only frontend AI responses. This branch intentionally avoids the
  // external connector while making the purpose of each reader feature clear.
  await new Promise((resolve) => window.setTimeout(resolve, 700));

  const filename = payload?.filename || payload?.title || 'this code example';
  const language = payload?.language || 'code';
  const tutorialTitle = payload?.tutorialTitle || 'the current article';

  if (capability === 'explain-code') {
    return {
      explanation:
        `Understand the whole example — Code Assistant gives the reader a concise overview of what unfamiliar code is doing without making them leave the article.\n\nFollow the important parts — This ${language} example is explained as a set of responsibilities, helping the reader connect the structure and logic rather than reading each line in isolation.\n\nKeep the explanation in context — Because the assistant knows this is ${filename} within ${tutorialTitle}, the explanation can relate the code to what the reader is currently learning.`,
    };
  }

  if (capability === 'explain-line') {
    const line = payload?.selectedLine || 'the selected line';
    const lineNumber = payload?.selectedLineNumber
      ? `Line ${payload.selectedLineNumber}`
      : 'The selected line';

    return {
      explanation:
        `${lineNumber} — "${line}" — is explained on its own while still considering the surrounding code. This feature is useful when a reader understands most of an example but gets stuck on one particular statement, property or expression. Instead of explaining the entire snippet again, Code Assistant focuses the help exactly where it is needed.`,
    };
  }

  if (capability === 'ask-code') {
    const question = payload?.question || 'your question';

    return {
      answer:
        `You asked: "${question}"\n\nAsk about this code lets a reader ask their own follow-up instead of being limited to a predefined explanation. The assistant uses the current ${filename} example and the surrounding article as context, so the response stays focused on what the reader is looking at.\n\nFor the demo, this response shows the concept: contextual questions can turn a static code example into an interactive learning experience.`,
    };
  }

  if (capability === 'check-understanding') {
    return {
      question: `Why does Code Assistant offer a "Check understanding" feature after reading ${filename}?`,
      options: [
        'To help the reader actively test whether they understood the concept',
        'To automatically rewrite the code in the article',
        'To replace the explanation with a generic programming quiz',
      ],
      correctAnswer: 0,
      explanation:
        'Correct. The knowledge check turns passive reading into active learning. It uses the code the reader is already studying, so the question reinforces the same concept rather than taking them away from the article.',
    };
  }

  return {
    error: true,
    code: 'demo_capability_not_found',
    message: 'This demo capability is not available.',
    status: 404,
  };
}

/**
 * Normalize a text response into safe plain-text items.
 *
 * @param {string} text AI response text.
 * @return {string[]} Plain-text response items.
 */
export function formatAIItems(text) {
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
