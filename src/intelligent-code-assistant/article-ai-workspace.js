import { __ } from '@wordpress/i18n';
import { parse, serialize } from '@wordpress/blocks';
import { Button, Modal, Notice, Spinner } from '@wordpress/components';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect, useMemo, useState } from '@wordpress/element';
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
    const base = {
        code,
        language: attrs.codeLanguage || 'code',
        filename: attrs.filename || '',
        title: getTitle(block),
        tutorialTitle,
        tutorialContext: attrs.tutorialContextOverride || '',
    };

    const explanation = await runAbility('explain-code', base);
    const lines = code.replace(/\r/g, '').split('\n');
    const lineExplanations = {};

    for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].trim()) continue;
        const lineNumber = index + 1;
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length, index + 3);
        const surroundingCode = lines.slice(start, end).map((line, offset) => {
            const number = start + offset + 1;
            return `${number === lineNumber ? '>>>' : '   '} ${number}: ${line}`;
        }).join('\n');

        const response = await runAbility('explain-line', {
            ...base,
            selectedLineNumber: lineNumber,
            selectedLine: lines[index],
            surroundingCode,
        });

        if (response?.explanation?.trim()) {
            lineExplanations[String(lineNumber)] = response.explanation.trim();
        }
    }

    const knowledgeCheck = await runAbility('check-understanding', base);

    return {
        generatedExplanation: explanation?.explanation?.trim() || '',
        generatedLineExplanations: lineExplanations,
        generatedKnowledgeCheck: knowledgeCheck || {},
        enableAIAssistant: true,
    };
}

function Status({ block }) {
    const attrs = block?.attributes || {};
    const lineCount = Object.keys(attrs.generatedLineExplanations || {}).length;
    return (
        <div className="ica-ai-workspace__status">
            <span>{attrs.generatedExplanation ? '✓' : '—'} {__('Explanation', 'intelligent-code-assistant')}</span>
            <span>{lineCount ? '✓' : '—'} {sprintfSafe(__('%d line explanations', 'intelligent-code-assistant'), lineCount)}</span>
            <span>{attrs.generatedKnowledgeCheck?.question ? '✓' : '—'} {__('Knowledge check', 'intelligent-code-assistant')}</span>
        </div>
    );
}

function sprintfSafe(template, value) {
    return template.replace('%d', String(value));
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

    return (
        <>
            <PluginDocumentSettingPanel name="ica-article-ai" title={__('Code Assistant', 'intelligent-code-assistant')} initialOpen={true}>
                <p>{sprintfSafe(__('%d code snippets found in this article.', 'intelligent-code-assistant'), snippets.length)}</p>
                <Button variant="primary" onClick={() => setOpen(true)}>
                    {__('Configure Code Assistant', 'intelligent-code-assistant')}
                </Button>
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
