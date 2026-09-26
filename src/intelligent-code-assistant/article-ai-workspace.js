import { __ } from '@wordpress/i18n';
import { parse, serialize } from '@wordpress/blocks';
import { Button, Modal, Notice, Spinner } from '@wordpress/components';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { useDispatch, useSelect } from '@wordpress/data';
import { useMemo, useState } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';
import apiFetch from '@wordpress/api-fetch';

const BLOCK_NAME = 'wpe/intelligent-code-assistant';

function flattenBlocks(blocks, result = []) {
    (blocks || []).forEach((block) => {
        if (block.name === BLOCK_NAME) result.push(block);
        flattenBlocks(block.innerBlocks, result);
    });
    return result;
}

function getCode(block) {
    const content = (block?.innerBlocks || []).find((item) => item.name === 'wpe/code-content');
    return content?.attributes?.code ?? content?.attributes?.content ?? '';
}

function getTitle(block) {
    const header = (block?.innerBlocks || []).find((item) => item.name === 'wpe/code-header');
    return header?.attributes?.title || block?.attributes?.filename || __('Code snippet', 'intelligent-code-assistant');
}

async function runAbility(slug, data) {
    try {
        return await apiFetch({
            path: `/wp/v2/abilities/intelligent-code-assistant/${slug}/run`,
            method: 'POST',
            data,
        });
    } catch (error) {
        if (error?.code !== 'rest_no_route' && error?.status !== 404) throw error;
        return apiFetch({
            path: `/intelligent-code-assistant/v1/${slug}`,
            method: 'POST',
            data,
        });
    }
}

async function generateAssistance(block, tutorialTitle) {
    const code = getCode(block);
    if (!code.trim()) throw new Error(__('This snippet has no code to analyse.', 'intelligent-code-assistant'));

    const attrs = block.attributes || {};
    const payload = {
        code,
        language: attrs.codeLanguage || 'code',
        filename: attrs.filename || '',
        title: getTitle(block),
        tutorialTitle,
        tutorialContext: attrs.tutorialContextOverride || '',
    };

    const assistance = await runAbility('generate-reader-assistance', payload);
    const expectedLines = code.replace(/\r/g, '').split('\n')
        .reduce((numbers, line, index) => {
            if (line.trim()) numbers.push(String(index + 1));
            return numbers;
        }, []);
    const lineExplanations = assistance?.lineExplanations || {};
    const missingLines = expectedLines.filter((lineNumber) => !lineExplanations[lineNumber]?.trim());

    if (missingLines.length) {
        throw new Error(
            sprintfSafe(
                __('Generation was incomplete. Missing explanations for lines: %s', 'intelligent-code-assistant'),
                missingLines.join(', ')
            )
        );
    }

    return {
        generatedExplanation: assistance?.explanation?.trim() || '',
        generatedLineExplanations: lineExplanations,
        generatedKnowledgeCheck: assistance?.knowledgeCheck || {},
        enableAIAssistant: true,
    };
}

function getAssistanceStatus(block) {
    const attrs = block?.attributes || {};
    const codeText = getCode(block);
    const expectedLines = codeText.replace(/\r/g, '').split('\n').filter((line) => line.trim()).length;
    const storedLines = Object.keys(attrs.generatedLineExplanations || {}).filter(
        (key) => attrs.generatedLineExplanations?.[key]?.trim()
    ).length;
    const explanationReady = Boolean(attrs.generatedExplanation?.trim());
    const knowledgeReady = Boolean(attrs.generatedKnowledgeCheck?.question);
    const linesReady = expectedLines > 0 && storedLines >= expectedLines;
    const ready = explanationReady && linesReady && knowledgeReady;
    const hasAny = explanationReady || storedLines > 0 || knowledgeReady;

    return {
        expectedLines,
        storedLines,
        explanationReady,
        knowledgeReady,
        linesReady,
        ready,
        state: ready ? 'ready' : (hasAny ? 'incomplete' : 'not-configured'),
    };
}

function Status({ block }) {
    const status = getAssistanceStatus(block);
    return (
        <div className={`ica-ai-workspace__status is-${status.state}`}>
            <span>{status.explanationReady ? '✓' : '—'} {__('Explanation', 'intelligent-code-assistant')}</span>
            <span>
                {status.linesReady ? '✓' : (status.storedLines ? '⚠' : '—')} {__('Explain This Line', 'intelligent-code-assistant')} · {status.storedLines}/{status.expectedLines}
            </span>
            <span>{status.knowledgeReady ? '✓' : '—'} {__('Knowledge check', 'intelligent-code-assistant')}</span>
        </div>
    );
}

function sprintfSafe(template, value) {
    return template.replace(/%[ds]/, String(value));
}

function SnippetCard({ item, tutorialTitle, onChanged }) {
    const [canonical, setCanonical] = useState(null);
    const [loading, setLoading] = useState(Boolean(item.codeExampleId));
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const { updateBlockAttributes, selectBlock } = useDispatch('core/block-editor');

    useEffect(() => {
        let active = true;
        if (!item.codeExampleId) {
            setCanonical(item.block);
            setLoading(false);
            return () => { active = false; };
        }

        setLoading(true);
        apiFetch({ path: `/wp/v2/ica_code_example/${item.codeExampleId}?context=edit` })
            .then((record) => {
                if (!active) return;
                const blocks = parse(record?.content?.raw || '');
                setCanonical(flattenBlocks(blocks)[0] || null);
            })
            .catch((err) => active && setError(err?.message || __('Unable to load Code Snippet.', 'intelligent-code-assistant')))
            .finally(() => active && setLoading(false));

        return () => { active = false; };
    }, [item.codeExampleId]);

    const saveGenerated = async (generated) => {
        if (!item.codeExampleId) {
            updateBlockAttributes(item.clientId, generated);
            setCanonical((current) => ({ ...current, attributes: { ...(current?.attributes || {}), ...generated } }));
            return;
        }

        const record = await apiFetch({ path: `/wp/v2/ica_code_example/${item.codeExampleId}?context=edit` });
        const blocks = parse(record?.content?.raw || '');
        const canonicalBlock = flattenBlocks(blocks)[0];
        if (!canonicalBlock) throw new Error(__('The canonical Code Snippet block could not be found.', 'intelligent-code-assistant'));

        canonicalBlock.attributes = { ...(canonicalBlock.attributes || {}), ...generated };
        await apiFetch({
            path: `/wp/v2/ica_code_example/${item.codeExampleId}`,
            method: 'POST',
            data: { content: serialize(blocks) },
        });
        setCanonical(canonicalBlock);
    };

    const handleGenerate = async () => {
        if (!canonical || generating) return;
        setGenerating(true);
        setError('');
        try {
            const generated = await generateAssistance(canonical, tutorialTitle);
            await saveGenerated(generated);
            onChanged?.();
        } catch (err) {
            setError(err?.message || __('Unable to generate reader assistance.', 'intelligent-code-assistant'));
        } finally {
            setGenerating(false);
        }
    };

    return (
        <section className="ica-ai-workspace__card">
            <div className="ica-ai-workspace__card-heading">
                <div>
                    <h3>{canonical ? getTitle(canonical) : __('Code snippet', 'intelligent-code-assistant')}</h3>
                    <p>{canonical?.attributes?.codeLanguage || __('Language not set', 'intelligent-code-assistant')}</p>
                </div>
                <Button variant="tertiary" onClick={() => selectBlock(item.clientId)}>
                    {__('Show in article', 'intelligent-code-assistant')}
                </Button>
            </div>
            {loading ? <Spinner /> : canonical && <Status block={canonical} />}
            {error && <Notice status="error" isDismissible={false}>{error}</Notice>}
            <Button variant="primary" disabled={loading || !canonical || generating} isBusy={generating} onClick={handleGenerate}>
                {generating ? __('Generating…', 'intelligent-code-assistant') : (canonical?.attributes?.generatedExplanation ? __('Regenerate assistance', 'intelligent-code-assistant') : __('Generate assistance', 'intelligent-code-assistant'))}
            </Button>
        </section>
    );
}

function ArticleAIWorkspace() {
    const [open, setOpen] = useState(false);
    const blocks = useSelect((select) => select('core/block-editor').getBlocks(), []);
    const tutorialTitle = useSelect((select) => select('core/editor')?.getEditedPostAttribute?.('title') || '', []);
    const snippets = useMemo(() => flattenBlocks(blocks).map((block) => ({
        block,
        clientId: block.clientId,
        codeExampleId: Number(block.attributes?.codeExampleId || 0),
    })), [blocks]);

    if (!snippets.length) return null;

    const localStatuses = snippets.map((item) => item.codeExampleId ? null : getAssistanceStatus(item.block));
    const readyCount = localStatuses.filter((status) => status?.ready).length;
    const incompleteCount = localStatuses.filter((status) => status?.state === 'incomplete').length;
    const unconfiguredCount = localStatuses.filter((status) => status?.state === 'not-configured').length;
    const linkedCount = snippets.filter((item) => item.codeExampleId).length;

    const openWorkspace = () => setOpen(true);

    return (
        <>
            <PluginDocumentSettingPanel
                name="ica-article-ai"
                title={sprintfSafe(__('✦ Code Assistant · %d snippets', 'intelligent-code-assistant'), snippets.length)}
                initialOpen={true}
            >
                <div className="ica-ai-sidebar-summary">
                    <div className="ica-ai-sidebar-summary__heading">
                        <span className="ica-ai-sidebar-summary__mark">✦</span>
                        <div>
                            <strong>{__('Code Assistant is active', 'intelligent-code-assistant')}</strong>
                            <p>{sprintfSafe(__('%d code snippets in this article', 'intelligent-code-assistant'), snippets.length)}</p>
                        </div>
                    </div>
                    <div className="ica-ai-sidebar-summary__counts">
                        {readyCount > 0 && <span className="is-ready">● {readyCount} {__('ready', 'intelligent-code-assistant')}</span>}
                        {incompleteCount > 0 && <span className="is-incomplete">⚠ {incompleteCount} {__('incomplete', 'intelligent-code-assistant')}</span>}
                        {unconfiguredCount > 0 && <span>○ {unconfiguredCount} {__('not configured', 'intelligent-code-assistant')}</span>}
                        {linkedCount > 0 && <span>↗ {linkedCount} {__('linked', 'intelligent-code-assistant')}</span>}
                    </div>
                    <Button variant="primary" onClick={openWorkspace}>
                        {__('Open Code Assistant', 'intelligent-code-assistant')}
                    </Button>
                </div>
            </PluginDocumentSettingPanel>
            {open && (
                <Modal
                    title={__('Code Assistant', 'intelligent-code-assistant')}
                    className="ica-ai-workspace"
                    onRequestClose={() => setOpen(false)}
                    size="large"
                >
                    <header className="ica-ai-workspace__intro">
                        <p className="ica-ai-workspace__eyebrow">{__('ARTICLE AI WORKSPACE', 'intelligent-code-assistant')}</p>
                        <h2>{tutorialTitle || __('Untitled article', 'intelligent-code-assistant')}</h2>
                        <p>{__('Generate and review reader assistance for every Code Snippet in this article from one place.', 'intelligent-code-assistant')}</p>
                    </header>
                    <div className="ica-ai-workspace__grid">
                        {snippets.map((item) => (
                            <SnippetCard key={item.clientId} item={item} tutorialTitle={tutorialTitle} />
                        ))}
                    </div>
                </Modal>
            )}
        </>
    );
}

registerPlugin('ica-article-ai-workspace', {
    render: ArticleAIWorkspace,
});
