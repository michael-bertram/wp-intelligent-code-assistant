import { __ } from '@wordpress/i18n';
import { parse } from '@wordpress/blocks';
import { Button, Dropdown, Modal, Notice, Spinner } from '@wordpress/components';
import { createPortal, useEffect, useMemo, useState } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { registerPlugin } from '@wordpress/plugins';
import apiFetch from '@wordpress/api-fetch';

const BLOCK_NAME = 'wpe/intelligent-code-assistant';

function decodeEntities(value = '') {
    if (typeof document === 'undefined') return String(value);
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    return textarea.value;
}

function normalizeCodeText(value = '') {
    const raw = String(value ?? '').replace(/\u00a0/g, ' ').replace(/\r/g, '');
    // Convert only recognizable legacy RichText wrappers. Leave literal HTML
    // source code untouched when it is already plain text in the editor.
    const isLegacyRichText = /^<p(?:\s[^>]*)?>[\s\S]*<\/p>$/i.test(raw)
        && (/<br\s*\/?\s*>/i.test(raw) || /<\/p>\s*<p(?:\s[^>]*)?>/i.test(raw));
    if (!isLegacyRichText) return decodeEntities(raw);
    const text = raw
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p>\s*<p(?:\s[^>]*)?>/gi, '\n')
        .replace(/^<p(?:\s[^>]*)?>/i, '')
        .replace(/<\/p>$/i, '');
    return decodeEntities(text);
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
        rawCode: String(rawCode ?? '').replace(/\r/g, ''),
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

function getCodeFingerprint(code = '') {
    let hash = 0x811c9dc5;
    for (let index = 0; index < code.length; index += 1) {
        hash ^= code.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
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

function sprintfSafe(template, value) {
    const values = String(value).split('|');
    let index = 0;
    return template.replace(/%\d+\$[ds]/g, () => String(values[index++] ?? values[values.length - 1] ?? ''));
}

async function generateAssistance(block, tutorialTitle, onProgress, preserveExisting = true) {
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
    const expectedLines = code.split('\n')
        .reduce((numbers, line, index) => {
            if (line.trim()) numbers.push(index + 1);
            return numbers;
        }, []);
    const existingLines = attrs.generatedLineExplanations || {};
    const codeMatches = Boolean(attrs.generatedAssistanceCodeHash)
        && attrs.generatedAssistanceCodeHash === getCodeFingerprint(code);
    const keepOverview = preserveExisting && codeMatches
        && Boolean(attrs.generatedExplanation?.trim())
        && Boolean(attrs.generatedKnowledgeCheck?.question);
    const lineExplanations = codeMatches ? { ...existingLines } : {};
    const linesToGenerate = keepOverview
        ? expectedLines.filter((lineNumber) => !lineExplanations[String(lineNumber)]?.trim())
        : expectedLines;

    let overview = null;
    if (!keepOverview) {
        onProgress?.(__('Refreshing explanation and knowledge check…', 'intelligent-code-assistant'));
        overview = await runAbility('generate-reader-overview', payload);
    } else {
        onProgress?.(__('Checking line explanations…', 'intelligent-code-assistant'));
    }

    const batchSize = 40;
    for (let offset = 0; offset < linesToGenerate.length; offset += batchSize) {
        const batch = linesToGenerate.slice(offset, offset + batchSize);
        const first = offset + 1;
        const last = Math.min(offset + batch.length, linesToGenerate.length);
        onProgress?.(
            sprintfSafe(
                __('Generating line explanations %1$s of %2$s…', 'intelligent-code-assistant'),
                `${first}–${last}|${linesToGenerate.length}`
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

    const currentLineKeys = new Set(expectedLines.map(String));
    const currentLineExplanations = Object.fromEntries(
        Object.entries(lineExplanations).filter(([lineNumber]) => currentLineKeys.has(lineNumber))
    );
    return {
        generatedExplanation: overview?.explanation?.trim() || attrs.generatedExplanation || '',
        generatedLineExplanations: currentLineExplanations,
        generatedKnowledgeCheck: overview?.knowledgeCheck || attrs.generatedKnowledgeCheck || {},
        generatedAssistanceCodeHash: getCodeFingerprint(code),
        enableAIAssistant: true,
    };
}

function getAssistanceStatus(block, articleTitle = '') {
    const attrs = block?.attributes || {};
    const codeText = getCode(block);
    const requiredLineNumbers = codeText.replace(/\r/g, '').split('\n')
        .reduce((numbers, line, index) => {
            if (line.trim()) numbers.push(String(index + 1));
            return numbers;
        }, []);
    const storedLineExplanations = attrs.generatedLineExplanations || {};
    const storedLines = requiredLineNumbers.filter(
        (lineNumber) => typeof storedLineExplanations[lineNumber] === 'string' && storedLineExplanations[lineNumber].trim()
    ).length;
    const missingLineNumbers = requiredLineNumbers.filter(
        (lineNumber) => !storedLineExplanations[lineNumber]?.trim()
    );
    const expectedLines = requiredLineNumbers.length;
    const explanationReady = Boolean(attrs.generatedExplanation?.trim());
    const knowledgeReady = Boolean(attrs.generatedKnowledgeCheck?.question);
    const linesReady = expectedLines > 0 && missingLineNumbers.length === 0;
    const contextTitle = String(attrs.assistanceContextTitle || '');
    const contextValidated = !articleTitle || (contextTitle && contextTitle === String(articleTitle));
    const hasAny = explanationReady || storedLines > 0 || knowledgeReady;
    const codeMatches = Boolean(attrs.generatedAssistanceCodeHash)
        && attrs.generatedAssistanceCodeHash === getCodeFingerprint(codeText);
    const codeChanged = hasAny && !codeMatches;
    const assistanceReady = explanationReady && linesReady && knowledgeReady && codeMatches;
    const ready = assistanceReady && contextValidated;

    return {
        expectedLines,
        contextValidated,
        codeMatches,
        codeChanged,
        generatedAssistanceCodeHash: attrs.generatedAssistanceCodeHash || '',
        assistanceReady,
        storedLines,
        explanationReady,
        knowledgeReady,
        linesReady,
        ready,
        state: ready ? 'ready' : (hasAny ? 'incomplete' : 'not-configured'),
    };
}

function Status({ block, contextValidated = true }) {
    const assistance = getAssistanceStatus(block);
    const status = {
        ...assistance,
        contextValidated,
        ready: assistance.ready && contextValidated,
        state: assistance.ready && contextValidated
            ? 'ready'
            : (assistance.explanationReady || assistance.storedLines > 0 || assistance.knowledgeReady
                ? 'incomplete'
                : 'not-configured'),
    };
    return (
        <div className={`ica-ai-workspace__status is-${status.state}`}>
            <span>{status.explanationReady ? '✓' : '—'} {__('Explanation', 'intelligent-code-assistant')}</span>
            <span>
                {status.linesReady ? '✓' : (status.storedLines ? '⚠' : '—')} {__('Explain This Line', 'intelligent-code-assistant')} · {status.storedLines}/{status.expectedLines}
            </span>
            <span>{status.knowledgeReady ? '✓' : '—'} {__('Knowledge check', 'intelligent-code-assistant')}</span>
            <span className={status.codeMatches ? 'is-ready' : 'needs-attention'}>
                {status.codeMatches ? '✓' : '⚠'} {status.codeMatches
                    ? __('Code matches saved assistance', 'intelligent-code-assistant')
                    : __('Code changed — regenerate assistance', 'intelligent-code-assistant')}
            </span>
            {!contextValidated && (
                <span className="ica-ai-workspace__context-status needs-attention">
                    ⚠ {__('Article context not validated', 'intelligent-code-assistant')}
                </span>
            )}
        </div>
    );
}

function SnippetCard({ item, tutorialTitle, tutorialPostId, onChanged }) {
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
    }, [item.codeExampleId, item.block]);

    const saveGenerated = async (generated) => {
        if (!item.codeExampleId) {
            updateBlockAttributes(item.clientId, generated);
            setCanonical((current) => ({ ...current, attributes: { ...(current?.attributes || {}), ...generated } }));
            window.dispatchEvent(new CustomEvent('ica:reader-assistance-saved'));
            return;
        }

        await apiFetch({
            path: '/intelligent-code-assistant/v1/save-reader-assistance',
            method: 'POST',
            data: {
                codeExampleId: item.codeExampleId,
                generatedExplanation: generated.generatedExplanation || '',
                generatedLineExplanations: generated.generatedLineExplanations || {},
                generatedKnowledgeCheck: generated.generatedKnowledgeCheck || {},
                generatedAssistanceCodeHash: generated.generatedAssistanceCodeHash || '',
            },
        });

        // Re-read the saved canonical record instead of treating the optimistic
        // client state as proof that the server persisted every assistance field.
        // This keeps the modal, post summary, and linked block sidebar in agreement.
        const savedRecord = await apiFetch({
            path: `/wp/v2/ica_code_example/${item.codeExampleId}?context=edit`,
        });
        const savedCanonical = flattenBlocks(parse(savedRecord?.content?.raw || ''))[0] || null;
        if (!savedCanonical) {
            throw new Error(__('Assistance was submitted, but the saved Code Snippet could not be reloaded for verification.', 'intelligent-code-assistant'));
        }
        setCanonical(savedCanonical);
        window.dispatchEvent(new CustomEvent('ica:reader-assistance-saved', {
            detail: { codeExampleId: item.codeExampleId },
        }));
    };

    const articleContextValidated = item.codeExampleId > 0
        ? Number(item.block?.attributes?.assistanceContextPostId || 0) === Number(tutorialPostId || 0)
            && Number(tutorialPostId || 0) > 0
        : true;
    const assistanceStatus = canonical ? getAssistanceStatus(canonical) : null;
    const readyForThisArticle = Boolean(assistanceStatus?.ready && articleContextValidated);

    const handleGenerate = async () => {
        if (!canonical || generating) return;
        setGenerating(true);
        setError('');
        setProgress(__('Preparing assistance…', 'intelligent-code-assistant'));
        try {
            const generated = await generateAssistance(canonical, tutorialTitle, setProgress, articleContextValidated);
            await saveGenerated(generated);
            updateBlockAttributes(item.clientId, {
                assistanceContextTitle: String(tutorialTitle || ''),
                assistanceContextPostId: Number(tutorialPostId || 0),
            });
            window.dispatchEvent(new CustomEvent('ica:reader-assistance-saved'));
            onChanged?.();
        } catch (err) {
            setError(err?.message || __('Unable to generate reader assistance.', 'intelligent-code-assistant'));
        } finally {
            setGenerating(false);
            setProgress('');
        }
    };

    useEffect(() => {
        const handleGenerateAll = () => {
            const contextValidated = Number(item.block?.attributes?.assistanceContextPostId || 0) === Number(tutorialPostId || 0)
                && Number(tutorialPostId || 0) > 0;
            if (!loading && canonical && (!getAssistanceStatus(canonical).ready || !contextValidated) && !generating) {
                handleGenerate();
            }
        };
        window.addEventListener('ica:generate-all-assistance', handleGenerateAll);
        return () => window.removeEventListener('ica:generate-all-assistance', handleGenerateAll);
    }, [loading, canonical, generating, handleGenerate, item.block, tutorialTitle, tutorialPostId]);

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
            {loading ? <Spinner /> : canonical && <Status block={canonical} contextValidated={item.codeExampleId > 0 ? articleContextValidated : true} />}
            {item.codeExampleId > 0 && !articleContextValidated && (
                <Notice status="warning" isDismissible={false}>
                    {__('Saved assistance has not been validated for this article context yet.', 'intelligent-code-assistant')}
                </Notice>
            )}
            {error && <Notice status="error" isDismissible={false}>{error}</Notice>}
            {generating && progress && <p className="ica-ai-workspace__progress" role="status" aria-live="polite">{progress}</p>}
            <Button variant="primary" disabled={loading || !canonical || generating} isBusy={generating} onClick={handleGenerate}>
                {generating
                    ? __('Generating…', 'intelligent-code-assistant')
                    : (assistanceStatus && !readyForThisArticle && (assistanceStatus.explanationReady || assistanceStatus.storedLines > 0 || assistanceStatus.knowledgeReady)
                        ? (assistanceStatus.ready && !articleContextValidated
                            ? __('Validate article context', 'intelligent-code-assistant')
                            : __('Complete assistance', 'intelligent-code-assistant'))
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
    const tutorialPostId = useSelect((select) => select('core/editor')?.getCurrentPostId?.() || 0, []);
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
                            <SnippetCard key={item.clientId} item={item} tutorialTitle={tutorialTitle} tutorialPostId={tutorialPostId} />
                        ))}
                    </div>
                </Modal>
            )}
        </>
    );
}

function useArticleCodeStatus() {
    const blocks = useSelect((select) => select('core/block-editor').getBlocks(), []);
    const tutorialTitle = useSelect((select) => select('core/editor')?.getEditedPostAttribute?.('title') || '', []);
    const tutorialPostId = useSelect((select) => select('core/editor')?.getCurrentPostId?.() || 0, []);
    const snippets = useMemo(() => flattenBlocks(blocks).map((block) => ({
        block,
        codeExampleId: Number(block.attributes?.codeExampleId || 0),
    })), [blocks]);
    const [linked, setLinked] = useState({});
    const [loading, setLoading] = useState(true);
    const linkedIds = useMemo(() => [...new Set(snippets.map((item) => item.codeExampleId).filter(Boolean))], [snippets]);

    const linkedIdsKey = linkedIds.join(',');
    const localCodeSignature = snippets.map((item) => `${item.clientId}:${getCode(item.block)}`).join('|');
    const [refreshVersion, setRefreshVersion] = useState(0);

    useEffect(() => {
        const refresh = () => setRefreshVersion((version) => version + 1);
        window.addEventListener('ica:reader-assistance-saved', refresh);
        return () => window.removeEventListener('ica:reader-assistance-saved', refresh);
    }, []);

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
    }, [linkedIdsKey, linkedIds, refreshVersion, localCodeSignature]);

    const statuses = snippets.map((item) => {
        const status = item.codeExampleId ? linked[item.codeExampleId]?.status : getAssistanceStatus(item.block);
        const contextValidated = Number(item.block?.attributes?.assistanceContextPostId || 0) === Number(tutorialPostId || 0)
            && Number(tutorialPostId || 0) > 0;
        // Linked references normally contain no code of their own. Only compare
        // an article-local code fingerprint when the block really has local code
        // content; otherwise canonical saved code is the single source of truth.
        const hasArticleLocalCode = (item.block.innerBlocks || []).some(
            (innerBlock) => innerBlock.name === 'wpe/code-content'
        );
        const articleRawCode = hasArticleLocalCode ? extractCanonicalSnippet(item.block).rawCode : '';
        const localCodeChanged = Boolean(
            item.codeExampleId
            && hasArticleLocalCode
            && articleRawCode.trim()
            && status?.generatedAssistanceCodeHash
            && getCodeFingerprint(normalizeCodeText(articleRawCode)) !== status.generatedAssistanceCodeHash
        );
        return status ? {
            ...status,
            codeChanged: status.codeChanged || localCodeChanged,
            assistanceReady: status.assistanceReady && !localCodeChanged,
            contextValidated,
            ready: status.ready && contextValidated && !localCodeChanged,
        } : null;
    });
    const ready = statuses.filter((item) => item?.ready).length;
    const complete = !loading && ready === snippets.length && snippets.length > 0;
    return { snippets, linked, loading, ready, complete, statuses };
}

function ArticlePostSummary() {
    const { snippets, linked, loading, ready, statuses } = useArticleCodeStatus();
    const [host, setHost] = useState(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let mountedHost = null;
        const ensureHost = () => {
            // Locate the trash button / container at the bottom of the status panel
            const trashControl = document.querySelector(
                '.editor-post-trash, .editor-post-trash-button, .edit-post-post-trash'
            );
            const trashRow = trashControl?.closest('.editor-post-trash, .editor-post-trash-button, .edit-post-post-trash')
                || trashControl;
            const container = trashRow?.parentElement;

            if (!trashRow || !container) {
                if (mountedHost && !mountedHost.isConnected) {
                    mountedHost = null;
                    setHost(null);
                }
                return;
            }

            // Hide any legacy standalone readiness text nodes right above the trash button
            Array.from(container.children).forEach((node) => {
                if (node.classList.contains('ica-post-summary-host')) return;
                const text = (node.textContent || '').trim();
                if (/^\d+\/\d+ Code Snippets ready$/i.test(text)) {
                    node.style.display = 'none';
                }
            });

            const existingHosts = Array.from(document.querySelectorAll('.ica-post-summary-host'));
            if (mountedHost?.parentElement === container && mountedHost.nextElementSibling === trashRow) {
                existingHosts.forEach((candidate) => {
                    if (candidate !== mountedHost) candidate.remove();
                });
                return;
            }

            const reusableHost = existingHosts.find((candidate) => candidate.parentElement === container) || null;
            existingHosts.forEach((candidate) => {
                if (candidate !== reusableHost) candidate.remove();
            });

            mountedHost?.remove();
            mountedHost = reusableHost || document.createElement('div');
            mountedHost.className = 'ica-post-summary-host';

            // Insert directly above the trash row
            container.insertBefore(mountedHost, trashRow);
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

    const articleItems = snippets.map((item, index) => ({
        ...item,
        status: statuses[index],
        title: item.codeExampleId
            ? (linked[item.codeExampleId]?.title || `#${item.codeExampleId}`)
            : getTitle(item.block),
    }));

    const editUrl = (id) => {
        const adminBase = typeof window.ajaxurl === 'string' && window.ajaxurl
            ? window.ajaxurl
            : window.location.href;
        const absoluteAdminBase = new URL(adminBase, window.location.href);
        const url = new URL('post.php', absoluteAdminBase);
        url.searchParams.set('post', String(id));
        url.searchParams.set('action', 'edit');
        return url.href;
    };

    return createPortal(
        <section className="ica-post-summary" aria-label={__('Code Assistant article summary', 'intelligent-code-assistant')}>
    <div className="ica-post-summary-row">
        {/* Left Column: Label */}
        <span className="ica-post-summary__label">{__('Readiness', 'intelligent-code-assistant')}</span>

        {/* Right Column: Toggle Control */}
        <div className="ica-post-summary-row__right">
            <button
    type="button"
    className="ica-post-summary__toggle"
    aria-expanded={expanded}
    onClick={() => setExpanded((previous) => !previous)}
>
    <span className={`ica-post-summary__count ${!loading && ready === snippets.length ? 'is-ready' : 'needs-attention'}`}>
        {loading ? __('Checking…', 'intelligent-code-assistant') : `${ready}/${snippets.length} ${__('ready', 'intelligent-code-assistant')}`}
    </span>
    <svg 
        className={`ica-post-summary__chevron ${expanded ? 'is-expanded' : ''}`}
        width="12" 
        height="12" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
</button>

        </div>
        
    </div>

    {expanded && (
        <div className="ica-post-summary__body">
            {articleItems.length > 0 && (
                <div className="ica-post-summary__links">
                    <strong>{__('CODE SNIPPETS IN THIS ARTICLE', 'intelligent-code-assistant')}</strong>
                    <ul>
                        {articleItems.map((item, index) => {
                            const status = item.status;
                            const stateLabel = loading
                                ? __('Checking…', 'intelligent-code-assistant')
                                : status?.ready
                                    ? __('Complete for this article', 'intelligent-code-assistant')
                                    : status
                                        ? (status.codeChanged
                                            ? __('Explanations need updating', 'intelligent-code-assistant')
                                            : status.assistanceReady
                                                ? __('Needs article-context validation', 'intelligent-code-assistant')
                                                : __('Needs explanations', 'intelligent-code-assistant'))
                                        : __('Status unavailable', 'intelligent-code-assistant');
                            const href = item.codeExampleId
                                ? editUrl(item.codeExampleId)
                                : '';
                            return (
                                <li key={`${item.clientId}-${index}`}>
                                    <span className={`ica-post-summary__state ${status?.ready ? 'is-ready' : 'needs-attention'}`} aria-hidden="true">
                                        {loading ? '○' : status?.ready ? '✓' : '⚠'}
                                    </span>
                                    {href ? (
                                        <a href={href} title={__('Edit linked Code Example', 'intelligent-code-assistant')}>
                                            {item.title}
                                            <span className="ica-post-summary__external" aria-hidden="true">↗</span>
                                        </a>
                                    ) : <span>{item.title}</span>}
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
    const staleAssistance = statuses.filter((status) => status?.codeChanged).length;
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
                                        {staleAssistance > 0 && <p>⚠ {staleAssistance} {__('snippets have code changes and need assistance regenerated', 'intelligent-code-assistant')}</p>}
                                        {unavailable > 0 && <p>⚠ {unavailable} {__('linked Code Examples could not be checked', 'intelligent-code-assistant')}</p>}
                                    </div>
                                )}
                                {complete && <p className="is-ready">{__('Reader assistance complete', 'intelligent-code-assistant')}</p>}
                            </>
                        )}
                    </div>
                    <div className="ica-header-toolbar__actions">
                        <Button variant="primary" disabled={loading || complete || unavailable > 0} onClick={() => {
                            onClose();
                            window.dispatchEvent(new CustomEvent('ica:open-code-assistant'));
                            window.setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('ica:generate-all-assistance'));
                            }, 500);
                        }}>
                            {__('Generate all', 'intelligent-code-assistant')}
                        </Button>
                        <Button variant="secondary" onClick={() => {
                            onClose();
                            window.dispatchEvent(new CustomEvent('ica:open-code-assistant'));
                        }}>
                            {__('Open Code Assistant', 'intelligent-code-assistant')}
                        </Button>
                    </div>
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