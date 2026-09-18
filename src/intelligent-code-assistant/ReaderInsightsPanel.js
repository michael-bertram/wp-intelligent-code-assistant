import { __ } from '@wordpress/i18n';
import { Button, PanelBody, Spinner } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

const eventLabels = {
    copy_code: __('Code copies', 'intelligent-code-assistant'),
    explain_code: __('Code explanations', 'intelligent-code-assistant'),
    explain_line: __('Line explanations', 'intelligent-code-assistant'),
    ask_question: __('Reader questions', 'intelligent-code-assistant'),
    knowledge_check: __('Knowledge checks', 'intelligent-code-assistant'),
    mark_complete: __('Completion actions', 'intelligent-code-assistant'),
};

export default function ReaderInsightsPanel() {
    const postId = useSelect(
        (select) => select('core/editor')?.getCurrentPostId?.() || 0,
        []
    );

    const [summary, setSummary] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadSummary = async () => {
        if (!postId) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await apiFetch({
                path: `/intelligent-code-assistant/v1/analytics-summary?postId=${postId}`,
            });
            setSummary(response);
        } catch (requestError) {
            setError(
                requestError?.message ||
                __('Could not load reader analytics.', 'intelligent-code-assistant')
            );
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSummary();
    }, [postId]);

    return (
        <PanelBody
            title={__('Reader Insights', 'intelligent-code-assistant')}
            initialOpen={false}
        >
            <p style={{ marginTop: 0, color: '#646970' }}>
                {__(
                    'Deterministic interaction data for this article. These figures represent actions, not unique readers.',
                    'intelligent-code-assistant'
                )}
            </p>

            {isLoading && <Spinner />}

            {error && (
                <p style={{ color: '#cc1818' }}>{error}</p>
            )}

            {!isLoading && !error && summary && (
                <>
                    <div
                        style={{
                            padding: '12px',
                            marginBottom: '16px',
                            background: '#f6f7f7',
                            borderRadius: '4px',
                        }}
                    >
                        <strong style={{ display: 'block', fontSize: '20px' }}>
                            {summary.totalInteractions || 0}
                        </strong>
                        <span>{__('Total interactions', 'intelligent-code-assistant')}</span>
                    </div>

                    <strong style={{ display: 'block', marginBottom: '8px' }}>
                        {__('Interactions', 'intelligent-code-assistant')}
                    </strong>
                    {Object.entries(eventLabels).map(([event, label]) => (
                        <div
                            key={event}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '12px',
                                marginBottom: '6px',
                            }}
                        >
                            <span>{label}</span>
                            <strong>{summary.events?.[event] || 0}</strong>
                        </div>
                    ))}

                    <div style={{ marginTop: '18px' }}>
                        <strong style={{ display: 'block', marginBottom: '6px' }}>
                            {__('Knowledge checks', 'intelligent-code-assistant')}
                        </strong>
                        <p style={{ margin: 0 }}>
                            {summary.knowledgeChecks?.attempts || 0}{' '}
                            {__('attempts', 'intelligent-code-assistant')}
                            {' · '}
                            {summary.knowledgeChecks?.correctRate || 0}%{' '}
                            {__('correct', 'intelligent-code-assistant')}
                        </p>
                    </div>

                    {summary.explainedLines?.length > 0 && (
                        <div style={{ marginTop: '18px' }}>
                            <strong style={{ display: 'block', marginBottom: '6px' }}>
                                {__('Most explained lines', 'intelligent-code-assistant')}
                            </strong>
                            {summary.explainedLines.slice(0, 5).map((item) => (
                                <p
                                    key={`${item.blockId}:${item.lineNumber}`}
                                    style={{ margin: '0 0 6px' }}
                                >
                                    {item.blockId} · {__('Line', 'intelligent-code-assistant')} {item.lineNumber}
                                    {' · '}{item.count}
                                </p>
                            ))}
                        </div>
                    )}

                    {summary.questions?.length > 0 && (
                        <div style={{ marginTop: '18px' }}>
                            <strong style={{ display: 'block', marginBottom: '6px' }}>
                                {__('Common reader questions', 'intelligent-code-assistant')}
                            </strong>
                            {summary.questions.slice(0, 5).map((item) => (
                                <p key={item.question} style={{ margin: '0 0 8px' }}>
                                    “{item.question}”
                                    {item.count > 1 && ` × ${item.count}`}
                                </p>
                            ))}
                        </div>
                    )}
                </>
            )}

            <Button
                variant="secondary"
                onClick={loadSummary}
                disabled={isLoading || !postId}
                style={{ marginTop: '16px' }}
            >
                {__('Refresh insights', 'intelligent-code-assistant')}
            </Button>
        </PanelBody>
    );
}
