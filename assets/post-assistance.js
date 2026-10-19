(function (wp) {
    if (!wp || !wp.plugins || !wp.element || !wp.data || !wp.apiFetch || !wp.blocks) return;

    const el = wp.element.createElement;
    const Fragment = wp.element.Fragment;
    const useEffect = wp.element.useEffect;
    const useMemo = wp.element.useMemo;
    const useCallback = wp.element.useCallback;
    const useState = wp.element.useState;
    const registerPlugin = wp.plugins.registerPlugin;
    const PluginSidebar = wp.editPost && wp.editPost.PluginSidebar;
    const PluginSidebarMoreMenuItem = wp.editPost && wp.editPost.PluginSidebarMoreMenuItem;
    const PluginPostStatusInfo = wp.editor && wp.editor.PluginPostStatusInfo;
    const PanelBody = wp.components.PanelBody;
    const Button = wp.components.Button;
    const Notice = wp.components.Notice;
    const Spinner = wp.components.Spinner;
    const __ = wp.i18n.__;

    if (!PluginSidebar || !PluginSidebarMoreMenuItem || !PanelBody || !Button) return;

    function getAssistantBlock(blocks) {
        for (const block of (blocks || [])) {
            if (block.name === 'wpe/intelligent-code-assistant') return block;
            const nested = getAssistantBlock(block.innerBlocks || []);
            if (nested) return nested;
        }
        return null;
    }

    function getCode(blocks) {
        const assistant = getAssistantBlock(blocks);
        if (!assistant) return null;
        const header = (assistant.innerBlocks || []).find((block) => block.name === 'wpe/code-header');
        const content = (assistant.innerBlocks || []).find((block) => block.name === 'wpe/code-content');
        return {
            assistant,
            code: String(content?.attributes?.code ?? content?.attributes?.content ?? ''),
            title: String(header?.attributes?.title ?? ''),
            attributes: assistant.attributes || {},
        };
    }

    function syncLegacyToolbarDot(items) {
        const dot = document.querySelector('.ica-header-toolbar__status');
        if (!dot) return;
        const complete = items.length > 0 && items.every((item) => item.complete);
        dot.classList.toggle('is-ready', complete);
        dot.classList.toggle('needs-attention', !complete);
        dot.classList.remove('is-checking');
    }

    function isComplete(data, code) {
        const attrs = data || {};
        const lines = String(code || '').replace(/\r/g, '').split('\n');
        const required = lines.map((line, index) => line.trim() ? String(index + 1) : null).filter(Boolean);
        const stored = attrs.generatedLineExplanations || {};
        return Boolean(
            attrs.generatedExplanation?.trim() &&
            attrs.generatedKnowledgeCheck?.question &&
            required.length > 0 &&
            required.every((line) => typeof stored[line] === 'string' && stored[line].trim())
        );
    }

    function AssistanceWorkspace() {
        const { postId, postTitle, blocks } = wp.data.useSelect((select) => ({
            postId: select('core/editor')?.getCurrentPostId?.() || 0,
            postTitle: select('core/editor')?.getEditedPostAttribute?.('title') || '',
            blocks: select('core/block-editor')?.getBlocks?.() || [],
        }), []);

        const ids = useMemo(() => {
            const found = new Set();
            const visit = (items) => (items || []).forEach((block) => {
                if (block.name === 'wpe/intelligent-code-assistant' && Number(block.attributes?.codeExampleId || 0) > 0) {
                    found.add(Number(block.attributes.codeExampleId));
                }
                visit(block.innerBlocks || []);
            });
            visit(blocks);
            return Array.from(found);
        }, [blocks]);

        const idsKey = ids.join(',');
        const [items, setItems] = useState([]);
        const [loading, setLoading] = useState(false);
        const [generating, setGenerating] = useState(false);
        const [progress, setProgress] = useState({ done: 0, total: 0 });
        const [error, setError] = useState('');

        const refresh = useCallback(async () => {
            const currentIds = idsKey ? idsKey.split(',').map(Number) : [];
            if (!currentIds.length) {
                setItems([]);
                return;
            }
            setLoading(true);
            try {
                const next = await Promise.all(currentIds.map(async (id) => {
                    const record = await wp.apiFetch({ path: '/wp/v2/ica_code_example/' + id + '?context=edit' });
                    const parsed = wp.blocks.parse(record?.content?.raw || '');
                    const details = getCode(parsed);
                    return {
                        id,
                        title: record?.title?.rendered || __('Code Snippet', 'intelligent-code-assistant') + ' #' + id,
                        code: details?.code || '',
                        attributes: details?.attributes || {},
                        complete: Boolean(details && isComplete(details.attributes, details.code)),
                    };
                }));
                setItems(next);
                syncLegacyToolbarDot(next);
                setError('');
            } catch (err) {
                syncLegacyToolbarDot([]);
                setError(err?.message || __('Could not check saved assistance for every Code Snippet.', 'intelligent-code-assistant'));
            } finally {
                setLoading(false);
            }
        }, [idsKey]);

        useEffect(() => { refresh(); }, [refresh]);

        // The original toolbar status lives in the Article AI Workspace bundle.
        // Recheck canonical records when its per-snippet status changes so the
        // header dot updates immediately after generating assistance there too.
        useEffect(() => {
            const observer = new MutationObserver((mutations) => {
                if (mutations.some((mutation) =>
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'class' &&
                    mutation.target?.classList?.contains('ica-ai-workspace__status')
                )) {
                    refresh();
                }
            });
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class'],
                subtree: true,
            });
            const handleSaved = () => refresh();
            window.addEventListener('ica:reader-assistance-saved', handleSaved);
            return () => {
                observer.disconnect();
                window.removeEventListener('ica:reader-assistance-saved', handleSaved);
            };
        }, [refresh]);

        const generateAll = async () => {
            if (generating) return;
            setGenerating(true);
            setError('');
            const pending = items.filter((item) => !item.complete);
            setProgress({ done: 0, total: pending.length });
            let done = 0;
            try {
                for (const item of pending) {
                    const record = await wp.apiFetch({ path: '/wp/v2/ica_code_example/' + item.id + '?context=edit' });
                    const parsed = wp.blocks.parse(record?.content?.raw || '');
                    const details = getCode(parsed);
                    if (!details?.code?.trim()) {
                        throw new Error(__('Could not read the code for', 'intelligent-code-assistant') + ' ' + item.title);
                    }

                    const payload = {
                        code: details.code,
                        language: details.attributes.codeLanguage || 'code',
                        filename: details.attributes.filename || '',
                        title: details.title || item.title,
                        tutorialTitle: postTitle,
                        tutorialContext: details.attributes.tutorialContextOverride || '',
                    };
                    const runRoute = async (ability, route, data) => {
                        try {
                            return await wp.apiFetch({
                                path: '/wp/v2/abilities/intelligent-code-assistant/' + ability + '/run',
                                method: 'POST',
                                data,
                            });
                        } catch (routeError) {
                            if (routeError.code !== 'rest_no_route' && routeError.status !== 404) throw routeError;
                            return wp.apiFetch({
                                path: '/intelligent-code-assistant/v1/' + route,
                                method: 'POST',
                                data,
                            });
                        }
                    };

                    const overview = await runRoute('generate-reader-overview', 'generate-reader-overview', payload);
                    const sourceLines = details.code.replace(/\r/g, '').split('\n');
                    const requiredLines = sourceLines
                        .map((line, index) => line.trim() ? index + 1 : null)
                        .filter(Boolean);
                    const lineExplanations = {};
                    for (let offset = 0; offset < requiredLines.length; offset += 30) {
                        const lineNumbers = requiredLines.slice(offset, offset + 30);
                        const batch = await runRoute('generate-line-explanations-batch', 'generate-line-explanations-batch', {
                            ...payload,
                            lineNumbers,
                        });
                        Object.assign(lineExplanations, batch?.lineExplanations || {});
                    }

                    if (
                        !overview?.explanation ||
                        !overview?.knowledgeCheck?.question ||
                        !requiredLines.every((line) => typeof lineExplanations[String(line)] === 'string' && lineExplanations[String(line)].trim())
                    ) {
                        throw new Error(__('Incomplete AI response for', 'intelligent-code-assistant') + ' ' + item.title);
                    }

                    await wp.apiFetch({
                        path: '/intelligent-code-assistant/v1/save-reader-assistance',
                        method: 'POST',
                        data: {
                            codeExampleId: item.id,
                            generatedExplanation: overview.explanation,
                            generatedLineExplanations: lineExplanations,
                            generatedKnowledgeCheck: overview.knowledgeCheck,
                        },
                    });
                    window.dispatchEvent(new CustomEvent('ica:reader-assistance-saved', { detail: { codeExampleId: item.id } }));
                    done += 1;
                    setProgress({ done, total: pending.length });
                }
                await refresh();
            } catch (err) {
                setError((err?.message || __('Generation failed.', 'intelligent-code-assistant')) + ' ' + __('Completed snippets were saved; run Generate all again to retry anything still incomplete.', 'intelligent-code-assistant'));
                await refresh();
            } finally {
                setGenerating(false);
            }
        };

        const completeCount = items.filter((item) => item.complete).length;
        const allComplete = items.length > 0 && completeCount === items.length;
        const dotColor = allComplete ? '#16a34a' : (items.length ? '#d97706' : '#94a3b8');

        return el(Fragment, null,
            PluginPostStatusInfo ? el(PluginPostStatusInfo, null,
                el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
                    el('span', { 'aria-hidden': 'true', style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dotColor } }),
                    allComplete
                        ? __('Code assistance complete', 'intelligent-code-assistant')
                        : (items.length ? completeCount + '/' + items.length + ' ' + __('Code Snippets ready', 'intelligent-code-assistant') : __('No reusable Code Snippets found', 'intelligent-code-assistant'))
                )
            ) : null,
            el(PluginSidebarMoreMenuItem, { target: 'ica-post-assistance' }, __('Code Assistance', 'intelligent-code-assistant')),
            el(PluginSidebar, { name: 'ica-post-assistance', title: __('Code Assistance', 'intelligent-code-assistant'), icon: 'editor-code' },
                el(PanelBody, { title: __('Reader assistance for this post', 'intelligent-code-assistant'), initialOpen: true },
                    el('p', null, __('Generate and save the explanation, every non-empty line explanation, and a knowledge check for each reusable Code Snippet referenced by this post.', 'intelligent-code-assistant')),
                    loading ? el('p', null, el(Spinner), ' ', __('Checking saved assistance…', 'intelligent-code-assistant')) : null,
                    el('p', null, items.length
                        ? completeCount + ' / ' + items.length + ' ' + __('Code Snippets are complete.', 'intelligent-code-assistant')
                        : __('This post does not contain reusable Code Snippet references.', 'intelligent-code-assistant')),
                    items.length ? el('ul', { style: { marginLeft: '18px', listStyle: 'disc' } },
                        items.map((item) => el('li', { key: item.id }, (item.complete ? '✓ ' : '○ ') + item.title))
                    ) : null,
                    error ? el(Notice, { status: 'error', isDismissible: true, onRemove: () => setError('') }, error) : null,
                    generating ? el('p', { role: 'status' }, el(Spinner), ' ', __('Generating…', 'intelligent-code-assistant'), ' ', progress.done, '/', progress.total) : null,
                    el(Button, {
                        variant: 'primary',
                        disabled: loading || generating || !items.length || allComplete,
                        isBusy: generating,
                        onClick: generateAll,
                        style: { width: '100%', justifyContent: 'center' },
                    }, generating ? __('Generating assistance…', 'intelligent-code-assistant') : __('Generate all', 'intelligent-code-assistant')),
                    el(Button, {
                        variant: 'secondary',
                        disabled: loading || generating,
                        onClick: refresh,
                        style: { marginTop: '8px', width: '100%', justifyContent: 'center' },
                    }, __('Refresh status', 'intelligent-code-assistant'))
                )
            )
        );
    }

    registerPlugin('ica-post-assistance', { render: AssistanceWorkspace });
})(window.wp);
