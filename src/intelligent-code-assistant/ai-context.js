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
export function buildAIContext(context, extras = {}) {
  return {
  code: context.activeCodeText || context.rawCodeText || '',
  language: context.codeLanguage || 'PHP',
  filename: context.codeFilename || '',
  title: context.codeTitle || '',
  question: context.question || context.codeQuestion || '',
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
