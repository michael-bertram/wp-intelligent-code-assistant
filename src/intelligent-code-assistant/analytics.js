const ANALYTICS_ENDPOINT = '/wp-json/intelligent-code-assistant/v1/analytics-event';

export const ANALYTICS_EVENTS = Object.freeze({
  EXPLAIN_CODE: 'explain_code',
  EXPLAIN_LINE: 'explain_line',
  ASK_QUESTION: 'ask_question',
  KNOWLEDGE_CHECK: 'knowledge_check',
  MARK_COMPLETE: 'mark_complete',
  COPY_CODE: 'copy_code',
});

/**
 * Build a small deterministic analytics payload.
 *
 * AI responses are deliberately excluded. Analytics should record facts about
 * reader interactions; AI can interpret those facts later in the editor.
 *
 * @param {string} event Event name from ANALYTICS_EVENTS.
 * @param {Object} context Current block Interactivity API context.
 * @param {Object} metadata Event-specific deterministic metadata.
 * @return {Object|null} Normalized payload or null when invalid.
 */
export function buildAnalyticsEvent(event, context = {}, metadata = {}) {
  if (!Object.values(ANALYTICS_EVENTS).includes(event)) {
    return null;
  }

  return {
    event,
    blockId: context.id || '',
    postId: Number(context.postId || 0),
    filename: context.codeFilename || '',
    language: context.codeLanguage || '',
    metadata,
  };
}

/**
 * Record one reader interaction without blocking the reader experience.
 *
 * sendBeacon is preferred for fire-and-forget analytics. fetch with keepalive
 * is used as a fallback. Failures are intentionally silent because analytics
 * must never break the code-reading experience.
 *
 * @param {string} event Event name from ANALYTICS_EVENTS.
 * @param {Object} context Current block Interactivity API context.
 * @param {Object} metadata Event-specific deterministic metadata.
 * @return {boolean} Whether a request was queued.
 */
export function recordAnalyticsEvent(event, context = {}, metadata = {}) {
  if (typeof window === 'undefined') {
    return false;
  }

  const payload = buildAnalyticsEvent(event, context, metadata);

  if (!payload) {
    return false;
  }

  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      return navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
    }

    fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => null);

    return true;
  } catch (error) {
    return false;
  }
}
