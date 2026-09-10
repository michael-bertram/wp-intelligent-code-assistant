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
 * Collect a deliberately small amount of nearby article content.
 *
 * We walk backwards from the current code block and stop once the nearest
 * section heading is found. This keeps the prompt focused rather than sending
 * the entire article to the model.
 *
 * @param {Element|null} block Current code block element.
 * @return {string} Focused section context.
 */
function getFocusedTutorialContext(block) {
  if (!block) {
    return '';
  }

  const fragments = [];
  let sibling = block.previousElementSibling;
  let inspected = 0;
  let foundHeading = false;

  while (sibling && inspected < 8 && !foundHeading) {
    const candidates = sibling.matches('h2, h3, h4, p')
      ? [sibling]
      : Array.from(sibling.querySelectorAll('h2, h3, h4, p'));

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
export async function requestAICapability(capability, payload) {
  const directResponse = await fetch(
    `/wp-json/intelligent-code-assistant/v1/${capability}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  ).catch(() => null);

  if (directResponse) {
    const directData = await directResponse
      .json()
      .catch(() => null);

    if (directResponse.ok) {
      return directData;
    }

    // The endpoint exists and WordPress returned a meaningful error.
    // Preserve it instead of masking it with a fallback request.
    if (directData?.code) {
      return {
        error: true,
        code: directData.code,
        message:
          directData.message ||
          'The AI request failed.',
        status:
          directData.data?.status ||
          directResponse.status,
      };
    }
  }

  const abilityResponse = await fetch(
    `/wp-json/wp/v2/abilities/intelligent-code-assistant/${capability}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  ).catch(() => null);

  if (!abilityResponse) {
    return null;
  }

  const abilityData = await abilityResponse
    .json()
    .catch(() => null);

  if (abilityResponse.ok) {
    return abilityData;
  }

  if (abilityData?.code) {
    return {
      error: true,
      code: abilityData.code,
      message:
        abilityData.message ||
        'The AI request failed.',
      status:
        abilityData.data?.status ||
        abilityResponse.status,
    };
  }

  return null;
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
