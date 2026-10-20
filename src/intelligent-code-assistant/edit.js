import { __ } from '@wordpress/i18n';
import { useBlockProps, InnerBlocks, InspectorControls, BlockControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, SelectControl, Button, Spinner, TextControl, TextareaControl, ToolbarButton } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { serialize } from '@wordpress/blocks';
import { useContext, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import CodeExampleChooser from './CodeExampleChooser';
import CanonicalCodeExampleEditor from './CanonicalCodeExampleEditor';
import { CanonicalCodeExampleContext } from './canonical-editor-context';
import './editor.scss';

export default function Edit({ attributes, setAttributes, clientId, isCodeExampleProxy = false, canonicalEntityId: canonicalEntityIdProp = 0 }) {
    const {
        codeExampleId,
        showLanguageBadge,
        codeLanguage,
        filename,
        highlightLines,
        isDarkMode,
        isCompact,
        maxHeight,
        showLineNumbers,
        fontSize,
        enableAIAssistant,
        tutorialContextOverride,
        generatedExplanation,
        generatedLineExplanations,
        generatedKnowledgeCheck,
    } = attributes;

    const canonicalEditorContext = useContext(CanonicalCodeExampleContext);
    const isEditingCanonicalEntity = Boolean(canonicalEditorContext?.isCanonical);
    const canonicalEntityId = Number(canonicalEditorContext?.entityId || canonicalEntityIdProp || 0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [isEditingContext, setIsEditingContext] = useState(false);
    const [isChangingCodeExample, setIsChangingCodeExample] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [conversionError, setConversionError] = useState('');
    const [isGeneratingAssistance, setIsGeneratingAssistance] = useState(false);
    const [assistanceError, setAssistanceError] = useState('');

    const { updateBlockAttributes } = useDispatch('core/block-editor');
    const { saveEntityRecord } = useDispatch('core');

    const { cleanRawText, hasLocalBlockStructure, headerBlockId, headerTitle, tutorialTitle, derivedTutorialContext, currentPostType, currentPostId, blockForConversion } = useSelect((select) => {
        const block = select('core/block-editor').getBlock(clientId);
        const headerBlock = block?.innerBlocks?.find((innerBlock) => innerBlock.name === 'wpe/code-header');
        const contentBlock = block?.innerBlocks?.find((innerBlock) => innerBlock.name === 'wpe/code-content');
        const rawText = contentBlock?.attributes?.code ?? contentBlock?.attributes?.content ?? '';
        const postTitle = select('core/editor')?.getEditedPostAttribute?.('title') || '';
        const postType = select('core/editor')?.getCurrentPostType?.() || '';
        const postId = Number(select('core/editor')?.getCurrentPostId?.() || 0);

        const rootBlocks = select('core/block-editor').getBlocks();
        let contextResult = '';
        const targetIndex = rootBlocks.findIndex((rootBlock) => rootBlock.clientId === clientId);
        if (targetIndex > -1) {
            const nearby = rootBlocks.slice(Math.max(0, targetIndex - 3), targetIndex);
            contextResult = nearby
                .map((candidate) => {
                    const attrs = candidate.attributes || {};
                    return attrs.content || attrs.text || attrs.value || '';
                })
                .filter(Boolean)
                .join('\n\n');
        }

        return {
            cleanRawText: rawText,
            hasLocalBlockStructure: Boolean(headerBlock || contentBlock || block?.innerBlocks?.length),
            headerBlockId: headerBlock?.clientId || null,
            headerTitle: headerBlock?.attributes?.title || '',
            tutorialTitle: postTitle,
            derivedTutorialContext: contextResult,
            currentPostType: postType,
            currentPostId: postId,
            blockForConversion: block || null,
        };
    }, [clientId]);

    const isCanonicalCodeExample = currentPostType === 'ica_code_example' || isEditingCanonicalEntity || isCodeExampleProxy;
    const needsCodeExample = !isCanonicalCodeExample && Number(codeExampleId || 0) === 0 && !hasLocalBlockStructure;
    const isLinkedReference = !isCanonicalCodeExample && Number(codeExampleId || 0) > 0;
    const isLegacyStandalone = !isCanonicalCodeExample && Number(codeExampleId || 0) === 0 && hasLocalBlockStructure;

    // The canonical Code Example post owns the full ICA block and its children.
    // It must remain unlinked internally (codeExampleId = 0), otherwise save.js
    // treats it like an article reference and intentionally omits InnerBlocks.
    // Older canonical posts may still contain their own post ID from the earlier
    // implementation, so normalize those records as soon as they are edited.
    if (currentPostType === 'ica_code_example' && Number(codeExampleId || 0) !== 0) {
        setAttributes({ codeExampleId: 0 });
    }

    const characterCount = cleanRawText.replace(/\r/g, '').length;
    const getCodeFingerprint = (code = '') => {
        let hash = 0x811c9dc5;
        for (let index = 0; index < code.length; index += 1) {
            hash ^= code.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const effectiveTutorialContext = tutorialContextOverride || derivedTutorialContext;

    const isLineHighlighted = (lineNumber, highlightExpression) => {
        if (!highlightExpression) return false;
        const ranges = highlightExpression.split(',');
        for (const range of ranges) {
            const parts = range.split('-').map((n) => parseInt(n.trim(), 10));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                if (lineNumber >= parts[0] && lineNumber <= parts[1]) return true;
            } else if (parts.length === 1 && !isNaN(parts[0]) && lineNumber === parts[0]) return true;
        }
        return false;
    };

    const normalizeCodeForDetection = (code) => code
        .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
        .replace(/&#0*39;|&apos;/gi, "'").replace(/&amp;/gi, '&');

    const detectCodeLanguage = (code) => {
        const trimmedCode = normalizeCodeForDetection(code.trim());
        if (!trimmedCode) return '';
        if ((trimmedCode.startsWith('{') && trimmedCode.endsWith('}')) || (trimmedCode.startsWith('[') && trimmedCode.endsWith(']'))) {
            try { JSON.parse(trimmedCode); return 'JSON'; } catch (error) {}
        }
        if (/^\s*(?:<!doctype\s+html|<!--|<\/?[a-z][\w:-]*(?:\s[^<>]*?)?>)/i.test(trimmedCode)) return 'HTML';
        if (/<\?php|\bnamespace\s+[A-Za-z_\\]|\$[A-Za-z_]\w*|->|::|\b(add_action|add_filter|wp_register_ability|register_block_type)\s*\(/i.test(trimmedCode)) return 'PHP';
        if (/\b(import|export|const|let|var|async|await|function)\b|=>|\bconsole\.|\bdocument\.|\bwindow\.|\bJSON\./.test(trimmedCode)) return 'JS';
        if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/im.test(trimmedCode)) return 'SQL';
        if (/^\s*#!.*\b(bash|sh)\b/m.test(trimmedCode) || /^\s*(echo|cd|pwd|mkdir|chmod|curl|grep)\s+/m.test(trimmedCode)) return 'Bash';
        if (/([.#]?[A-Za-z][\w-]*|\*)\s*(?:,[^{]+)?\{[^}]*:[^}]*;?\s*\}/s.test(trimmedCode)) return 'CSS';
        return '';
    };

    const handleAutoFill = async () => {
        if (!cleanRawText || !cleanRawText.trim()) {
            setAiError(__('Please enter some code into the block first.', 'intelligent-code-assistant'));
            return;
        }
        setIsAnalyzing(true);
        setAiError(null);
        try {
            let response;
            try {
                response = await apiFetch({ path: '/wp/v2/abilities/intelligent-code-assistant/auto-fill-metadata/run', method: 'POST', data: { code: cleanRawText } });
            } catch (routeErr) {
                if (routeErr.code === 'rest_no_route' || routeErr.status === 404) {
                    response = await apiFetch({ path: '/intelligent-code-assistant/v1/auto-fill-metadata', method: 'POST', data: { code: cleanRawText } });
                } else throw routeErr;
            }
            const detectedLanguage = detectCodeLanguage(cleanRawText);
            const responseLanguage = response.codeLanguage || '';
            setAttributes({
                codeLanguage: detectedLanguage || (responseLanguage !== 'PHP' ? responseLanguage : ''),
                filename: response.filename || filename,
                highlightLines: response.highlightLines ?? highlightLines,
                showLineNumbers: response.showLineNumbers ?? showLineNumbers,
            });
            if (headerBlockId && response.title) updateBlockAttributes(headerBlockId, { title: response.title });
        } catch (err) {
            const rawMessage = err.message || __('Failed to auto-fill metadata.', 'intelligent-code-assistant');
            setAiError(rawMessage.includes('<p>') ? __('Server error occurred during execution. Check WP debug log.', 'intelligent-code-assistant') : rawMessage);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerateReaderAssistance = async () => {
        if (!cleanRawText || !cleanRawText.trim() || isGeneratingAssistance) return;

        setIsGeneratingAssistance(true);
        setAssistanceError('');

        const base = {
            code: cleanRawText,
            language: codeLanguage || 'code',
            filename: filename || '',
            title: headerTitle || '',
            tutorialTitle,
            tutorialContext: effectiveTutorialContext,
        };

        const runRoute = async (ability, route, data) => {
            try {
                return await apiFetch({
                    path: `/wp/v2/abilities/intelligent-code-assistant/${ability}/run`,
                    method: 'POST',
                    data,
                });
            } catch (routeErr) {
                if (routeErr.code !== 'rest_no_route' && routeErr.status !== 404) throw routeErr;
                return apiFetch({ path: `/intelligent-code-assistant/v1/${route}`, method: 'POST', data });
            }
        };

        try {
            // Keep overview generation separate from bounded line batches so
            // larger snippets do not exceed the AI provider's request limits.
            const overview = await runRoute('generate-reader-overview', 'generate-reader-overview', base);
            const lines = cleanRawText.replace(/\r/g, '').split('\n');
            const requiredLines = lines
                .map((line, index) => line.trim() ? index + 1 : null)
                .filter(Boolean);
            const lineExplanations = {};

            for (let offset = 0; offset < requiredLines.length; offset += 30) {
                const lineNumbers = requiredLines.slice(offset, offset + 30);
                const batch = await runRoute('generate-line-explanations-batch', 'generate-line-explanations-batch', {
                    ...base,
                    lineNumbers,
                });
                Object.assign(lineExplanations, batch?.lineExplanations || {});
            }

            const nextAttributes = {
                generatedExplanation: overview?.explanation?.trim() || '',
                generatedLineExplanations: lineExplanations,
                generatedKnowledgeCheck: overview?.knowledgeCheck || {},
                generatedAssistanceCodeHash: getCodeFingerprint(cleanRawText.replace(/\r/g, '')),
                enableAIAssistant: true,
            };

            if (
                !nextAttributes.generatedExplanation ||
                !requiredLines.every((line) => typeof lineExplanations[String(line)] === 'string' && lineExplanations[String(line)].trim()) ||
                !nextAttributes.generatedKnowledgeCheck?.question
            ) {
                throw new Error(__('The AI response was incomplete. No generated assistance was saved.', 'intelligent-code-assistant'));
            }

            setAttributes(nextAttributes);

            if (canonicalEntityId > 0) {
                await apiFetch({
                    path: '/intelligent-code-assistant/v1/save-reader-assistance',
                    method: 'POST',
                    data: {
                        codeExampleId: canonicalEntityId,
                        ...nextAttributes,
                    },
                });
                window.dispatchEvent(new CustomEvent('ica:reader-assistance-saved', { detail: { codeExampleId: canonicalEntityId } }));
            }
        } catch (err) {
            setAssistanceError(err?.message || __('Unable to generate and save reader assistance.', 'intelligent-code-assistant'));
        } finally {
            setIsGeneratingAssistance(false);
        }
    };

    const handleConvertToCodeExample = async () => {
        if (!blockForConversion || !isLegacyStandalone || isConverting) return;

        setIsConverting(true);
        setConversionError('');

        try {
            const {
                id: instanceId,
                tutorialContextOverride: articleContext,
                codeExampleId: previousCodeExampleId,
                ...canonicalAttributes
            } = blockForConversion.attributes || {};

            canonicalAttributes.codeExampleId = 0;

            const canonicalContent = serialize([{
                ...blockForConversion,
                attributes: canonicalAttributes,
            }]);

            const title = String(headerTitle || filename || __('Code Example', 'intelligent-code-assistant')).trim();
            const record = await saveEntityRecord('postType', 'ica_code_example', {
                title,
                status: 'draft',
                content: canonicalContent,
                meta: {
                    _ica_code_language: codeLanguage || '',
                    _ica_code_filename: filename || '',
                },
            });

            if (!record?.id) {
                throw new Error(__('The Code Example could not be created.', 'intelligent-code-assistant'));
            }

            // Keep article-specific context on the article instance. The next save
            // serializes this block as a lightweight reference and omits InnerBlocks.
            setAttributes({
                codeExampleId: Number(record.id),
                ...(articleContext ? { tutorialContextOverride: articleContext } : {}),
                ...(instanceId ? { id: instanceId } : {}),
            });
        } catch (err) {
            setConversionError(err?.message || __('The block could not be converted to a Code Example.', 'intelligent-code-assistant'));
        } finally {
            setIsConverting(false);
        }
    };

    const blockProps = useBlockProps({
        className: `wp-block-wpe-intelligent-code-assistant-editor ${isDarkMode ? 'dark-theme' : ''} ${isCompact ? 'is-compact' : ''} ${showLineNumbers ? 'has-line-numbers' : ''}`,
        style: { '--editor-code-font-size': fontSize, '--panel-max-height': maxHeight },
    });

    if (needsCodeExample || (isLinkedReference && isChangingCodeExample)) {
        return (
            <div {...blockProps}>
                <CodeExampleChooser onSelect={(id) => {
                    setAttributes({ codeExampleId: Number(id) });
                    setIsChangingCodeExample(false);
                }} />
            </div>
        );
    }

    if (isLinkedReference) {
        return (
            <>
                <BlockControls>
                    <ToolbarButton onClick={() => setIsChangingCodeExample(true)}>
                        {__('Change Code Example', 'intelligent-code-assistant')}
                    </ToolbarButton>
                </BlockControls>
                <div {...blockProps}>
                    <CanonicalCodeExampleEditor codeExampleId={codeExampleId} />
                </div>
            </>
        );
    }

    const maxHeightOptions = [
        { label: __('No Limit (Scroll disabled)', 'intelligent-code-assistant'), value: 'none' },
        { label: __('Short (250px)', 'intelligent-code-assistant'), value: '250px' },
        { label: __('Medium (400px)', 'intelligent-code-assistant'), value: '400px' },
        { label: __('Tall (600px)', 'intelligent-code-assistant'), value: '600px' },
    ];
    const fontSizeOptions = [
        { label: __('Small (12px)', 'intelligent-code-assistant'), value: '12px' },
        { label: __('Normal (14px)', 'intelligent-code-assistant'), value: '14px' },
        { label: __('Medium (16px)', 'intelligent-code-assistant'), value: '16px' },
        { label: __('Large (18px)', 'intelligent-code-assistant'), value: '18px' },
    ];

    return (
        <>
            <InspectorControls>
                {isLegacyStandalone && (
                    <PanelBody title={__('Code Example', 'intelligent-code-assistant')} initialOpen={true}>
                        <p>{__('This is a legacy standalone block. Convert it to reusable canonical content without losing its existing code or settings.', 'intelligent-code-assistant')}</p>
                        <Button
                            variant="primary"
                            onClick={handleConvertToCodeExample}
                            disabled={isConverting}
                            isBusy={isConverting}
                        >
                            {isConverting ? <Spinner /> : __('Convert to Code Example', 'intelligent-code-assistant')}
                        </Button>
                        {conversionError && <p style={{ color: '#cc1818', fontSize: '12px', marginTop: '10px' }} role="alert">{conversionError}</p>}
                    </PanelBody>
                )}
                <PanelBody title={__('✦ Code Assistant', 'intelligent-code-assistant')} initialOpen={true}>
                    {(() => {
                        // Linked article references intentionally do not contain the
                        // canonical code or its generated assistance. Do not mark them
                        // stale based on an empty local code string.
                        if (isLinkedReference && !cleanRawText.trim()) {
                            const contextValidated = Number(attributes.assistanceContextPostId || 0) === Number(currentPostId || 0)
                                && Number(currentPostId || 0) > 0;
                            return (
                                <div className={`ica-block-ai-card ${contextValidated ? 'is-incomplete' : 'is-incomplete'}`}>
                                    <div className="ica-block-ai-card__headline">
                                        <span className="ica-block-ai-card__mark">✦</span>
                                        <div>
                                            <strong>{contextValidated ? __('Assistance managed by reusable Code Snippet', 'intelligent-code-assistant') : __('Context validation required', 'intelligent-code-assistant')}</strong>
                                            <p>{contextValidated
                                                ? __('The reusable Code Snippet owns the saved assistance. Its readiness is confirmed by the article Code Assistant summary.', 'intelligent-code-assistant')
                                                : __('The saved assistance has not been validated for this article context. Use the article Code Assistant to validate it.', 'intelligent-code-assistant')}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        const requiredLineNumbers = cleanRawText.replace(/\r/g, '').split('\n')
                            .reduce((numbers, line, index) => {
                                if (line.trim()) numbers.push(String(index + 1));
                                return numbers;
                            }, []);
                        const expectedLines = requiredLineNumbers.length;
                        const storedLines = requiredLineNumbers.filter(
                            (lineNumber) => typeof generatedLineExplanations?.[lineNumber] === 'string'
                                && generatedLineExplanations[lineNumber].trim()
                        ).length;
                        const explanationReady = Boolean(generatedExplanation?.trim());
                        const knowledgeReady = Boolean(generatedKnowledgeCheck?.question);
                        const linesReady = expectedLines > 0 && storedLines === expectedLines;
                        const hasAny = explanationReady || storedLines > 0 || knowledgeReady;
                        const codeMatches = Boolean(attributes.generatedAssistanceCodeHash)
                            && attributes.generatedAssistanceCodeHash === getCodeFingerprint(cleanRawText.replace(/\r/g, ''));
                        const codeChanged = hasAny && !codeMatches;
                        const assistanceReady = explanationReady && linesReady && knowledgeReady && codeMatches;
                        const contextValidated = !isLinkedReference || (
                            Number(attributes.assistanceContextPostId || 0) === Number(currentPostId || 0)
                            && Number(currentPostId || 0) > 0
                        );
                        const ready = assistanceReady && contextValidated;
                        return (
                            <div className={`ica-block-ai-card ${ready ? 'is-ready' : (hasAny ? 'is-incomplete' : 'is-unconfigured')}`}>
                                <div className="ica-block-ai-card__headline">
                                    <span className="ica-block-ai-card__mark">✦</span>
                                    <div>
                                        <strong>{ready ? __('Ready for readers', 'intelligent-code-assistant') : (!contextValidated ? __('Context validation required', 'intelligent-code-assistant') : (codeChanged ? __('Code changed — regenerate assistance', 'intelligent-code-assistant') : (hasAny ? __('Assistance incomplete', 'intelligent-code-assistant') : __('Not configured', 'intelligent-code-assistant'))))}</strong>
                                        <p>{!contextValidated
                                            ? __('Saved assistance must be validated for this article before it is ready for readers.', 'intelligent-code-assistant')
                                            : __('Manage generated reader assistance from the article Code Assistant.', 'intelligent-code-assistant')}</p>
                                    </div>
                                </div>
                                <div className="ica-block-ai-card__checks">
                                    <span>{explanationReady ? '✓' : '—'} {__('Explain Code', 'intelligent-code-assistant')}</span>
                                    <span>{linesReady ? '✓' : (storedLines ? '⚠' : '—')} {__('Explain This Line', 'intelligent-code-assistant')} · {storedLines}/{expectedLines}</span>
                                    <span>{knowledgeReady ? '✓' : '—'} {__('Knowledge Check', 'intelligent-code-assistant')}</span>
                                </div>
                                <p className="ica-block-ai-card__hint">
                                    {__('Use the Code Assistant icon in the editor toolbar or the Post sidebar to configure this snippet.', 'intelligent-code-assistant')}
                                </p>
                            </div>
                        );
                    })()}
                </PanelBody>
                <PanelBody title={__('Code Display Settings', 'intelligent-code-assistant')} initialOpen={false}>
                    <Button
                        variant="secondary"
                        onClick={handleAutoFill}
                        disabled={isAnalyzing || !cleanRawText?.trim()}
                        isBusy={isAnalyzing}
                        style={{ marginBottom: '12px' }}
                    >
                        {isAnalyzing ? __('Detecting metadata…', 'intelligent-code-assistant') : __('Auto-fill Metadata', 'intelligent-code-assistant')}
                    </Button>
                    {aiError && <p role="alert" style={{ color: '#cc1818' }}>{aiError}</p>}

                    <TextControl label={__('Filename / Label', 'intelligent-code-assistant')} value={filename || ''} onChange={(value) => setAttributes({ filename: value })} />
                    <TextControl label={__('Highlight Lines (e.g., 3, 5-8)', 'intelligent-code-assistant')} value={highlightLines || ''} onChange={(value) => setAttributes({ highlightLines: value })} />
                    <ToggleControl label={__('Show Language Badge', 'intelligent-code-assistant')} checked={showLanguageBadge} onChange={(value) => setAttributes({ showLanguageBadge: value })} />
                    {showLanguageBadge && <SelectControl label={__('Code Language', 'intelligent-code-assistant')} value={codeLanguage || ''} options={[{ label: __('Auto / Not set', 'intelligent-code-assistant'), value: '' }, { label: 'PHP', value: 'PHP' }, { label: 'JavaScript', value: 'JS' }, { label: 'CSS', value: 'CSS' }, { label: 'HTML', value: 'HTML' }, { label: 'JSON', value: 'JSON' }, { label: 'SQL', value: 'SQL' }, { label: 'Bash', value: 'Bash' }]} onChange={(value) => setAttributes({ codeLanguage: value })} />}
                    <ToggleControl label={__('Show Line Numbers', 'intelligent-code-assistant')} checked={showLineNumbers} onChange={(value) => setAttributes({ showLineNumbers: value, ...(value && isCompact ? { isCompact: false } : {}) })} />
                </PanelBody>
                <PanelBody title={__('Design & Layout', 'intelligent-code-assistant')} initialOpen={false}>
                    <ToggleControl label={__('Use Dark Theme', 'intelligent-code-assistant')} checked={isDarkMode} onChange={(value) => setAttributes({ isDarkMode: value })} />
                    <ToggleControl label={__('Compact Spacing Layout', 'intelligent-code-assistant')} checked={isCompact} disabled={showLineNumbers} onChange={(value) => setAttributes({ isCompact: value })} />
                    <SelectControl label={__('Max Panel Height', 'intelligent-code-assistant')} value={maxHeight} options={maxHeightOptions} onChange={(value) => setAttributes({ maxHeight: value })} />
                    <SelectControl label={__('Code Font Size', 'intelligent-code-assistant')} value={fontSize} options={fontSizeOptions} onChange={(value) => setAttributes({ fontSize: value })} />
                </PanelBody>
            </InspectorControls>

            <div {...blockProps}>
                <div className="editor-combined-container">
                    {showLanguageBadge && codeLanguage && <span className={`code-badge lang-${codeLanguage.toLowerCase()}`}>{codeLanguage}</span>}
                    <div className="panel-scroll-container">
                        <div className="panel-content-flex-wrapper">
                            {showLineNumbers && (
                                <div className="line-numbers-gutter" aria-hidden="true">
                                    {cleanRawText.split('\n').map((_, index) => <span key={index} className={isLineHighlighted(index + 1, highlightLines) ? 'is-highlighted' : ''}>{index + 1}</span>)}
                                </div>
                            )}
                            <div className="editor-inner-blocks-wrapper">
                                <InnerBlocks
                                    allowedBlocks={['wpe/code-header', 'wpe/code-content']}
                                    template={[
                                        ['wpe/code-header', {}],
                                        ['wpe/code-content', {}],
                                    ]}
                                    templateLock="all"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="code-footer">
                        <span className="code-analytics-meta">
                            {characterCount} {characterCount === 1 ? __('character', 'intelligent-code-assistant') : __('characters', 'intelligent-code-assistant')}
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}
