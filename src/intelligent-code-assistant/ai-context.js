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
    code: context.rawCodeText || context.activeCodeText || '',
    language: context.codeLanguage || 'code',
    filename: context.filename || '',
    title: context.title || '',
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
  /* =========================================================
   * DEMO MOCK RESPONSES
   *
   * Temporary demo-only responses for Stage 2.
   * Remove this block to restore the real AI requests below.
   * ========================================================= */

  if (capability === 'explain-code') {
    await new Promise((resolve) => setTimeout(resolve, 700));

    return {
      explanation:
        'This function renders the current task list in the page. It first clears the existing list, then filters the tasks based on the selected filter: pending tasks, completed tasks, or all tasks.\n\nThe filter callback checks each task\'s completed value. If the current filter is "pending", it keeps tasks that are not completed. If it is "completed", it keeps only completed tasks. For the "all" filter, it returns true so every task is included.\n\nAfter filtering, the function checks whether there are any tasks to display. If the filtered list is empty, it adds a "No tasks available." message to the task list and returns early, preventing the rest of the rendering code from running.\n\nOverall, this part of renderTasks() makes sure the interface only displays tasks that match the reader\'s selected filter and handles the empty state clearly.',
    };
  }

  if (capability === 'explain-line') {
    await new Promise((resolve) => setTimeout(resolve, 700));

    const selectedLine =
      payload.selectedLine?.trim() || 'the selected line';

    return {
      explanation:
        `Line ${payload.selectedLineNumber}: ${selectedLine}\n\nThis feature focuses the explanation on the exact line the reader selected. The assistant also receives the surrounding lines, so it can explain what this line is doing in the context of the code around it rather than treating it in isolation.\n\nWhy it matters: this gives the reader targeted help at the point where they need it, without requiring another explanation of the entire code example.`,
    };
  }

  /* END DEMO MOCK RESPONSES */

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
