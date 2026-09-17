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
  const response = await fetch(
    `/wp-json/intelligent-code-assistant/v1/${capability}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  ).catch(() => null);

  if (!response) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (response.ok) {
    return data;
  }

  if (data?.code) {
    return {
      error: true,
      code: data.code,
      message: data.message || 'The AI request failed.',
      status: data.data?.status || response.status,
    };
  }

  return {
    error: true,
    code: 'ai_request_failed',
    message: 'The AI request failed.',
    status: response.status,
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
