import { __ } from '@wordpress/i18n';
import { parse, serialize } from '@wordpress/blocks';
import { Button, Modal, Notice, Spinner } from '@wordpress/components';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect, useMemo, useState } from '@wordpress/element';
import { registerPlugin } from '@wordpress/plugins';
import apiFetch from '@wordpress/api-fetch';

const BLOCK_NAME = 'wpe/intelligent-code-assistant';

function decodeEntities(value = '') {
    if (typeof document === 'undefined') return String(value);
    const textarea = document.createElement('textarea');
    let decoded = String(value);
    for (let pass = 0; pass < 2; pass += 1) {
        textarea.innerHTML = decoded;
        const next = textarea.value;
        if (next === decoded) break;
        decoded = next;
    }
    return decoded;
}

function normalizeCodeText(value = '') {
    const raw = String(value)
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n');
    return decodeEntities(raw)
        .replace(/<[^>]+>/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '');
}

function getInnerBlock(block, name) {
    return (block?.innerBlocks || []).find((item) => item.name === name) || null;
}

function extractCanonicalSnippet(block) {
    const attrs = block?.attributes || {};
    const content = getInnerBlock(block, 'wpe/code-content');
    const header = getInnerBlock(block, 'wpe/code-header');
    const rawCode = content?.attributes?.code
        ?? content?.attributes?.content
        ?? attrs.code
        ?? attrs.content
        ?? '';

    return {
        block,
        code: normalizeCodeText(rawCode),
        title: decodeEntities(header?.attributes?.title || attrs.title || attrs.filename || __('Code snippet', 'intelligent-code-assistant')),
        language: attrs.codeLanguage || content?.attributes?.codeLanguage || '',
        filename: attrs.filename || '',
    };
}

function flattenBlocks(blocks, result = []) {
    (blocks || []).forEach((block) => {
        if (block.name === BLOCK_NAME) result.push(block);
        flattenBlocks(block.innerBlocks, result);
    });
    return result;
}

function getCode(block) {
    return extractCanonicalSnippet(block).code;
}

function getTitle(block) {
    return extractCanonicalSnippet(block).title;
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

async function generateAssistance(block, tutorialTitle, onProgress) {
    const code = getCode(block);
    if (!code.trim()) throw new Error(__('This snippet has no code to analyse.', 'intelligent-code-assistant'));

    const attrs = block.attributes || {};
    const snippet = extractCanonicalSnippet(block);
    const payload = {
        code,
        language: snippet.language || 'code',
        filename: snippet.filename,
        title: snippet.title,
        tutorialTitle,
        tutorialContext: attrs.tutorialContextOverride || '',
    };
    const expectedLines = code.replace(/\r/g, '').split('\n')
        .reduce((numbers, line, index) => {
            if (line.trim()) numbers.push(index + 1);
            return numbers;
        }, []);

    onProgress?.(__('Generating explanation and knowledge check…', 'intelligent-code-assistant'));
    const overview = await runAbility('generate-reader-overview', payload);

    const lineExplanations = {};
    const batchSize = 40;
    for (let offset = 0; offset < expectedLines.length; offset += batchSize) {
        const batch = expectedLines.slice(offset, offset + batchSize);
        const first = offset + 1;
        const last = Math.min(offset + batch.length, expectedLines.length);
        onProgress?.(
            sprintfSafe(
                __('Generating line explanations %s of %s…', 'intelligent-code-assistant'),
                `${first}–${last}|${expectedLines.length}`
            )
        );
        const result = await runAbility('generate-line-explanations-batch', {
            ...payload,
            lineNumbers: batch,
        });
        Object.assign(lineExplanations, result?.lineExplanations || {});
    }

    const missingLines = expectedLines
        .map(String)
        .filter((lineNumber) => !lineExplanations[lineNumber]?.trim());
    if (missingLines.length) {
        throw new Error(
            __('Generation was incomplete. Some line explanations are missing.', 'intelligent-code-assistant')
        );
    }

    return {
        generatedExplanation: overview?.explanation?.trim() || '',
        generatedLineExplanations: lineExplanations,
        generatedKnowledgeCheck: overview?.knowledgeCheck || {},
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
    const values = String(value).split('|');
    let index = 0;
    return template.replace(/%[ds]/g, () => String(values[index++] ?? values[values.length - 1] ?? ''));
}

function SnippetCard({ item, tutorialTitle, onChanged }) {
    const [canonical, setCanonical] = useState(null);
    const [loading, setLoading] = useState(Boolean(item.codeExampleId));
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState('');
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

    const assistanceStatus = canonical ? getAssistanceStatus(canonical) : null;

    const handleGenerate = async () => {
        if (!canonical || generating) return;
        setGenerating(true);
        setError('');
        setProgress(__('Preparing assistance…', 'intelligent-code-assistant'));
        try {
            const generated = await generateAssistance(canonical, tutorialTitle, setProgress);
            await saveGenerated(generated);
            onChanged?.();
        } catch (err) {
            setError(err?.message || __('Unable to generate reader assistance.', 'intelligent-code-assistant'));
        } finally {
            setGenerating(false);
            setProgress('');
        }
    };

    return (
        <section className="ica-ai-workspace__card">
            <div className="ica-ai-workspace__card-heading">
                <div>
                    <h3>{canonical ? extractCanonicalSnippet(canonical).title : __('Code snippet', 'intelligent-code-assistant')}</h3>
                    <p>{canonical ? (extractCanonicalSnippet(canonical).language || __('Language not set', 'intelligent-code-assistant')) : __('Language not set', 'intelligent-code-assistant')}</p>
                </div>
                <Button variant="tertiary" onClick={() => selectBlock(item.clientId)}>
                    {__('Show in article', 'intelligent-code-assistant')}
                </Button>
            </div>
            {loading ? <Spinner /> : canonical && <Status block={canonical} />}
            {error && <Notice status="error" isDismissible={false}>{error}</Notice>}
            {generating && progress && <p className="ica-ai-workspace__progress" role="status" aria-live="polite">{progress}</p>}
            <Button variant="primary" disabled={loading || !canonical || generating} isBusy={generating} onClick={handleGenerate}>
                {generating
                    ? __('Generating…', 'intelligent-code-assistant')
                    : (assistanceStatus && !assistanceStatus.ready && (assistanceStatus.explanationReady || assistanceStatus.storedLines > 0 || assistanceStatus.knowledgeReady)
                        ? __('Complete assistance', 'intelligent-code-assistant')
                        : (canonical?.attributes?.generatedExplanation
                            ? __('Regenerate assistance', 'intelligent-code-assistant')
                            : __('Generate assistance', 'intelligent-code-assistant')))}
            </Button>
        </section>
    );
}

function ArticleAIWorkspace() {
    const [open, setOpen] = useState(false);
    const [linkedStatuses, setLinkedStatuses] = useState({});
    const [overviewOpen, setOverviewOpen] = useState(false);
    const blocks = useSelect((select) => select('core/block-editor').getBlocks(), []);
    const tutorialTitle = useSelect((select) => select('core/editor')?.getEditedPostAttribute?.('title') || '', []);
    const snippets = useMemo(() => flattenBlocks(blocks).map((block) => ({
        block,
        clientId: block.clientId,
        codeExampleId: Number(block.attributes?.codeExampleId || 0),
    })), [blocks]);

    useEffect(() => {
        const handleOpenWorkspace = () => setOpen(true);
        window.addEventListener('ica:open-code-assistant', handleOpenWorkspace);
        return () => window.removeEventListener('ica:open-code-assistant', handleOpenWorkspace);
    }, []);

    useEffect(() => {
        let active = true;
        const linked = snippets.filter((item) => item.codeExampleId);
        if (!linked.length) {
            setLinkedStatuses({});
            return () => { active = false; };
        }
        Promise.all(linked.map(async (item) => {
            try {
                const record = await apiFetch({ path: `/wp/v2/ica_code_example/${item.codeExampleId}?context=edit` });
                const canonical = flattenBlocks(parse(record?.content?.raw || ''))[0];
                return [item.codeExampleId, canonical ? getAssistanceStatus(canonical) : null];
            } catch {
                return [item.codeExampleId, null];
            }
        })).then((entries) => active && setLinkedStatuses(Object.fromEntries(entries)));
        return () => { active = false; };
    }, [snippets]);

    const localStatuses = snippets.map((item) => item.codeExampleId ? null : getAssistanceStatus(item.block));
    const readyCount = localStatuses.filter((status) => status?.ready).length;
    const incompleteCount = localStatuses.filter((status) => status?.state === 'incomplete').length;
    const unconfiguredCount = localStatuses.filter((status) => status?.state === 'not-configured').length;
    const linkedCount = snippets.filter((item) => item.codeExampleId).length;
    const allStatuses = snippets.map((item) => item.codeExampleId ? linkedStatuses[item.codeExampleId] : getAssistanceStatus(item.block)).filter(Boolean);
    const totalReadyCount = allStatuses.filter((status) => status.ready).length;
    const totalIncompleteCount = allStatuses.filter((status) => status.state === 'incomplete').length;
    const totalUnconfiguredCount = allStatuses.filter((status) => status.state === 'not-configured').length;
    const statusesLoaded = allStatuses.length === snippets.length;
    const allReady = statusesLoaded && snippets.length > 0 && totalReadyCount === snippets.length;

    const openWorkspace = () => setOpen(true);

    useEffect(() => {
        const openFromChrome = () => setOverviewOpen((current) => !current);
        const openWorkspaceFromChrome = () => {
            setOverviewOpen(false);
            window.dispatchEvent(new CustomEvent('ica:open-code-assistant'));
        };

        const mountEditorChrome = () => {
            const summary = document.querySelector('.editor-post-summary');
            if (summary && !summary.querySelector('.ica-editor-summary-row')) {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'ica-editor-summary-row';
                row.setAttribute('aria-label', __('Open Code Assistant', 'intelligent-code-assistant'));
                row.innerHTML = `<span class="ica-editor-summary-row__label">${__('Code Assistant', 'intelligent-code-assistant')}</span><span class="ica-editor-summary-row__value">↗ ${linkedCount || snippets.length} ${linkedCount ? __('linked', 'intelligent-code-assistant') : __('snippets', 'intelligent-code-assistant')}</span>`;
                row.addEventListener('click', openWorkspaceFromChrome);
                const stacks = summary.querySelectorAll(':scope > div, :scope > div > div');
                (stacks.length ? stacks[stacks.length - 1] : summary).appendChild(row);
            }

            const settings = document.querySelector('.editor-header__settings, .edit-post-header__settings');
            if (settings && !settings.querySelector('.ica-editor-toolbar-wrap')) {
                const wrap = document.createElement('div');
                wrap.className = 'ica-editor-toolbar-wrap';
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'components-button has-icon ica-editor-toolbar-button';
                button.setAttribute('aria-label', __('Code Assistant overview', 'intelligent-code-assistant'));
                button.setAttribute('title', __('Code Assistant', 'intelligent-code-assistant'));
                button.innerHTML = `<span aria-hidden="true" class="ica-editor-toolbar-button__mark">✦</span><span aria-hidden="true" class="ica-editor-toolbar-button__status ${allReady ? 'is-ready' : 'needs-attention'}"></span>`;
                button.addEventListener('click', openFromChrome);
                wrap.appendChild(button);
                const settingsToggle = settings.querySelector('button[aria-label*="Settings"], button[aria-label*="settings"]');
                if (settingsToggle) settings.insertBefore(wrap, settingsToggle);
                else settings.insertBefore(wrap, settings.firstChild);
            }
        };

        mountEditorChrome();
        const observer = new MutationObserver(mountEditorChrome);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            document.querySelector('.ica-editor-summary-row')?.remove();
            document.querySelector('.ica-editor-toolbar-wrap')?.remove();
        };
    }, [linkedCount, snippets.length, allReady]);

    if (!snippets.length) return null;

    return (
        <>
            {overviewOpen && (
                <div className="ica-toolbar-overview" role="dialog" aria-label={__('Code Assistant overview', 'intelligent-code-assistant')}>
                    <div className="ica-toolbar-overview__header">
                        <span className="ica-ai-sidebar-summary__mark">✦</span>
                        <div>
                            <strong>{__('Code Assistant', 'intelligent-code-assistant')}</strong>
                            <p>{decodeEntities(tutorialTitle) || __('Untitled article', 'intelligent-code-assistant')}</p>
                        </div>
                    </div>
                    <div className="ica-toolbar-overview__status">
                        <strong>{__('Article status', 'intelligent-code-assistant')}</strong>
                        <span>↗ {linkedCount} {__('linked snippets', 'intelligent-code-assistant')}</span>
                        {statusesLoaded ? (
                            <>
                                <span className={allReady ? 'is-ready' : ''}>✓ {totalReadyCount}/{snippets.length} {__('reader assistance complete', 'intelligent-code-assistant')}</span>
                                {totalIncompleteCount > 0 && <span className="needs-attention">⚠ {totalIncompleteCount} {__('need completing', 'intelligent-code-assistant')}</span>}
                                {totalUnconfiguredCount > 0 && <span className="needs-attention">○ {totalUnconfiguredCount} {__('not configured', 'intelligent-code-assistant')}</span>}
                            </>
                        ) : <span>{__('Checking assistance…', 'intelligent-code-assistant')}</span>}
                    </div>
                    <Button variant="primary" onClick={() => { setOverviewOpen(false); openWorkspace(); }}>
                        {__('Open Code Assistant', 'intelligent-code-assistant')}
                    </Button>
                </div>
            )}
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
                        <h2>{decodeEntities(tutorialTitle) || __('Untitled article', 'intelligent-code-assistant')}</h2>
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
