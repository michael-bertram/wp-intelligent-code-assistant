import { __ } from '@wordpress/i18n';
import { parse, serialize } from '@wordpress/blocks';
import { Button, Dropdown, Modal, Notice, Spinner } from '@wordpress/components';
import { createPortal } from '@wordpress/element';
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

    if (!snippets.length) return null;

    return (
        <>
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


/**
 * Resolve linked Code Examples once for both the Post summary and toolbar.
 * A linked reference is not necessarily complete: inspect its canonical record.
 */
function useArticleCodeStatus() {
    const blocks = useSelect((select) => select('core/block-editor').getBlocks(), []);
    const snippets = useMemo(() => flattenBlocks(blocks).map((block) => ({
        block,
        codeExampleId: Number(block.attributes?.codeExampleId || 0),
    })), [blocks]);
    const [linked, setLinked] = useState({});
    const [loading, setLoading] = useState(true);
    const linkedIds = useMemo(() => [...new Set(snippets.map((item) => item.codeExampleId).filter(Boolean))], [snippets]);

    useEffect(() => {
        let active = true;
        if (!linkedIds.length) {
            setLinked({});
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);
        Promise.all(linkedIds.map(async (id) => {
            try {
                const record = await apiFetch({ path: `/wp/v2/ica_code_example/${id}?context=edit` });
                const canonical = flattenBlocks(parse(record?.content?.raw || ''))[0];
                return [id, {
                    title: decodeEntities(record?.title?.raw || record?.title?.rendered || ''),
                    status: canonical ? getAssistanceStatus(canonical) : null,
                    url: record?.link || '',
                }];
            } catch {
                return [id, { title: '', status: null, url: '' }];
            }
        })).then((entries) => {
            if (!active) return;
            setLinked(Object.fromEntries(entries));
            setLoading(false);
        });
        return () => { active = false; };
    }, [linkedIds.join(',')]);

    const statuses = snippets.map((item) => item.codeExampleId ? linked[item.codeExampleId]?.status : getAssistanceStatus(item.block));
    const ready = statuses.filter((item) => item?.ready).length;
    const complete = !loading && ready === snippets.length && snippets.length > 0;
    return { snippets, linked, loading, ready, complete, statuses };
}

/**
 * Add the assistant overview inside the native Post summary where available.
 * Only our own portal host is managed by React. If WordPress changes the
 * summary markup, the toolbar remains available without a duplicate panel.
 */
function ArticlePostSummary() {
    const { snippets, linked, loading, ready } = useArticleCodeStatus();
    const [host, setHost] = useState(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let mountedHost = null;
        const ensureHost = () => {
            const summary = document.querySelector(
                '.editor-post-summary__panel, .editor-post-summary, .edit-post-post-status, .editor-post-status'
            );
            if (!summary) {
                if (mountedHost && !mountedHost.isConnected) {
                    mountedHost = null;
                    setHost(null);
                }
                return;
            }
            if (mountedHost?.parentElement === summary) return;
            mountedHost?.remove();
            mountedHost = document.createElement('div');
            mountedHost.className = 'ica-post-summary-host';
            summary.appendChild(mountedHost);
            setHost(mountedHost);
        };
        ensureHost();
        const observer = new MutationObserver(ensureHost);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            mountedHost?.remove();
        };
    }, []);

    if (!host || !snippets.length) return null;

    const linkedItems = [...new Set(snippets.map((item) => item.codeExampleId).filter(Boolean))];
    const editUrl = (id) => {
        // WordPress exposes the correct admin directory via ajaxurl, including
        // subdirectory installations. Fall back to the current editor directory.
        const adminBase = typeof window.ajaxurl === 'string' && window.ajaxurl
            ? window.ajaxurl
            : window.location.href;
        const url = new URL('post.php', adminBase);
        url.searchParams.set('post', String(id));
        url.searchParams.set('action', 'edit');
        return url.href;
    };

    return createPortal(
        <section className="ica-post-summary" aria-label={__('Code Assistant article summary', 'intelligent-code-assistant')}>
            <button
                type="button"
                className="ica-post-summary__toggle"
                aria-expanded={expanded}
                onClick={() => setExpanded((previous) => !previous)}
            >
                <span className="ica-post-summary__heading">
                    <span aria-hidden="true">✦</span>
                    <strong>{__('Code Assistant', 'intelligent-code-assistant')}</strong>
                </span>
                <span className="ica-post-summary__toggle-right">
                    <span>{linkedItems.length} {__('linked', 'intelligent-code-assistant')}</span>
                    <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
                </span>
            </button>
            {expanded && (
                <div className="ica-post-summary__body">
                    <div className="ica-post-summary__stat">
                        <span>{__('Code snippets', 'intelligent-code-assistant')}</span>
                        <strong>{snippets.length}</strong>
                    </div>
                    <div className="ica-post-summary__stat">
                        <span>{__('Linked Code Examples', 'intelligent-code-assistant')}</span>
                        <strong>{linkedItems.length}</strong>
                    </div>
                    <div className="ica-post-summary__stat">
                        <span>{__('Reader assistance', 'intelligent-code-assistant')}</span>
                        <strong className={!loading && ready === snippets.length ? 'is-ready' : ''}>
                            {loading ? '…' : `${ready}/${snippets.length} ${__('complete', 'intelligent-code-assistant')}`}
                        </strong>
                    </div>
                    {linkedItems.length > 0 && (
                        <div className="ica-post-summary__links">
                            <strong>{__('LINKED CODE EXAMPLES', 'intelligent-code-assistant')}</strong>
                            <ul>
                                {linkedItems.map((id) => {
                                    const status = linked[id]?.status;
                                    const stateLabel = loading
                                        ? __('Checking…', 'intelligent-code-assistant')
                                        : status?.ready
                                            ? __('Complete', 'intelligent-code-assistant')
                                            : status
                                                ? __('Needs assistance', 'intelligent-code-assistant')
                                                : __('Status unavailable', 'intelligent-code-assistant');
                                    return (
                                        <li key={id}>
                                            <span className={`ica-post-summary__state ${status?.ready ? 'is-ready' : 'needs-attention'}`} aria-hidden="true">
                                                {loading ? '○' : status?.ready ? '✓' : '⚠'}
                                            </span>
                                            <a href={editUrl(id)} title={__('Edit linked Code Example', 'intelligent-code-assistant')}>
                                                {linked[id]?.title || `#${id}`}
                                                <span className="ica-post-summary__external" aria-hidden="true">↗</span>
                                            </a>
                                            <span className="ica-post-summary__state-label">{stateLabel}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </section>,
        host
    );
}

/** The header icon is a status overview; only its explicit action opens the workspace. */
function CodeAssistantToolbar() {
    const { snippets, loading, ready, complete, statuses } = useArticleCodeStatus();
    const [toolbarHost, setToolbarHost] = useState(null);

    useEffect(() => {
        let mountedHost = null;
        const ensureHost = () => {
            const toolbar = document.querySelector('.editor-header__settings, .edit-post-header__settings');
            if (!toolbar) {
                if (mountedHost && !mountedHost.isConnected) {
                    mountedHost = null;
                    setToolbarHost(null);
                }
                return;
            }
            if (mountedHost?.parentElement === toolbar) return;
            mountedHost?.remove();
            mountedHost = document.createElement('div');
            mountedHost.className = 'ica-header-toolbar-host';
            toolbar.appendChild(mountedHost);
            setToolbarHost(mountedHost);
        };
        ensureHost();
        const observer = new MutationObserver(ensureHost);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            mountedHost?.remove();
        };
    }, []);

    if (!snippets.length || !toolbarHost) return null;

    const lineCount = statuses.reduce((total, status) => total + (status?.expectedLines || 0), 0);
    const storedLines = statuses.reduce((total, status) => total + (status?.storedLines || 0), 0);
    const missingExplanations = statuses.filter((status) => status && !status.explanationReady).length;
    const missingLines = statuses.filter((status) => status && !status.linesReady).length;
    const missingChecks = statuses.filter((status) => status && !status.knowledgeReady).length;
    const unavailable = statuses.filter((status) => !status).length;

    return createPortal(
        <Dropdown
            className="ica-header-toolbar"
            contentClassName="ica-header-toolbar__popover"
            position="bottom right"
            renderToggle={({ isOpen, onToggle }) => (
                <Button
                    className="ica-header-toolbar__button"
                    aria-label={__('Code Assistant article status', 'intelligent-code-assistant')}
                    aria-expanded={isOpen}
                    aria-haspopup="dialog"
                    title={__('Code Assistant article status', 'intelligent-code-assistant')}
                    onClick={onToggle}
                >
                    <span className="ica-header-toolbar__icon" aria-hidden="true">✦</span>
                    <span className={`ica-header-toolbar__status ${loading ? 'is-checking' : complete ? 'is-ready' : 'needs-attention'}`} aria-hidden="true" />
                </Button>
            )}
            renderContent={({ onClose }) => (
                <section className="ica-header-toolbar__content" aria-label={__('Code Assistant article status', 'intelligent-code-assistant')}>
                    <div className="ica-header-toolbar__heading">
                        <span className="ica-header-toolbar__icon" aria-hidden="true">✦</span>
                        <strong>{__('Code Assistant', 'intelligent-code-assistant')}</strong>
                    </div>
                    <div className="ica-header-toolbar__details">
                        <strong>{__('ARTICLE STATUS', 'intelligent-code-assistant')}</strong>
                        <p>{snippets.length} {__('code snippets', 'intelligent-code-assistant')}</p>
                        {loading ? (
                            <p role="status">{__('Checking reader assistance…', 'intelligent-code-assistant')}</p>
                        ) : (
                            <>
                                <p className={complete ? 'is-ready' : 'needs-attention'}>
                                    {complete ? '✓ ' : '⚠ '}{ready}/{snippets.length} {__('snippets complete', 'intelligent-code-assistant')}
                                </p>
                                <p className={storedLines >= lineCount && lineCount > 0 ? 'is-ready' : 'needs-attention'}>
                                    {storedLines}/{lineCount} {__('line explanations', 'intelligent-code-assistant')}
                                </p>
                                {!complete && (
                                    <div className="ica-header-toolbar__missing">
                                        <strong>{__('Needs attention', 'intelligent-code-assistant')}</strong>
                                        {missingExplanations > 0 && <p>⚠ {missingExplanations} {__('missing explanations', 'intelligent-code-assistant')}</p>}
                                        {missingLines > 0 && <p>⚠ {missingLines} {__('snippets need line explanations', 'intelligent-code-assistant')}</p>}
                                        {missingChecks > 0 && <p>⚠ {missingChecks} {__('missing knowledge checks', 'intelligent-code-assistant')}</p>}
                                        {unavailable > 0 && <p>⚠ {unavailable} {__('linked Code Examples could not be checked', 'intelligent-code-assistant')}</p>}
                                    </div>
                                )}
                                {complete && <p className="is-ready">{__('Reader assistance complete', 'intelligent-code-assistant')}</p>}
                            </>
                        )}
                    </div>
                    <Button variant="primary" onClick={() => {
                        onClose();
                        window.dispatchEvent(new CustomEvent('ica:open-code-assistant'));
                    }}>
                        {__('Open Code Assistant', 'intelligent-code-assistant')}
                    </Button>
                </section>
            )}
        />,
        toolbarHost
    );
}

registerPlugin('ica-article-ai-workspace', {
    render: ArticleAIWorkspace,
});

registerPlugin('ica-code-assistant-toolbar', { render: CodeAssistantToolbar });

registerPlugin('ica-code-assistant-post-summary', { render: ArticlePostSummary });
