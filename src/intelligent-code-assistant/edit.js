import { __ } from '@wordpress/i18n';
import { useBlockProps, InnerBlocks, InspectorControls, BlockControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, SelectControl, Button, Spinner, TextControl, TextareaControl, ToolbarButton } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { useContext, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import CodeExampleChooser from './CodeExampleChooser';
import CanonicalCodeExampleEditor from './CanonicalCodeExampleEditor';
import { CanonicalCodeExampleContext } from './canonical-editor-context';
import './editor.scss';

export default function Edit({ attributes, setAttributes, clientId, isCodeExampleProxy = false }) {
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
    } = attributes;

    const isEditingCanonicalEntity = useContext(CanonicalCodeExampleContext);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [isEditingContext, setIsEditingContext] = useState(false);
    const [isChangingCodeExample, setIsChangingCodeExample] = useState(false);

    const { updateBlockAttributes } = useDispatch('core/block-editor');

    const { cleanRawText, hasLocalBlockStructure, headerBlockId, tutorialTitle, derivedTutorialContext, currentPostType, currentPostId } = useSelect((select) => {
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
            tutorialTitle: postTitle,
            derivedTutorialContext: contextResult,
            currentPostType: postType,
            currentPostId: postId,
        };
    }, [clientId, codeExampleId]);

    const isCanonicalCodeExample = currentPostType === 'ica_code_example' || isEditingCanonicalEntity || isCodeExampleProxy;
    const needsCodeExample = !isCanonicalCodeExample && Number(codeExampleId || 0) === 0 && !hasLocalBlockStructure;
    const isLinkedReference = !isCanonicalCodeExample && Number(codeExampleId || 0) > 0;

    if (currentPostType === 'ica_code_example' && currentPostId > 0 && Number(codeExampleId || 0) !== currentPostId) {
        setAttributes({ codeExampleId: currentPostId });
    }

    const characterCount = cleanRawText.replace(/\r/g, '').length;
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
                <PanelBody title={__('AI Features', 'intelligent-code-assistant')} initialOpen={true}>
                    <ToggleControl label={__('Enable AI Features', 'intelligent-code-assistant')} checked={enableAIAssistant} onChange={(value) => setAttributes({ enableAIAssistant: value })} />
                    {enableAIAssistant && (
                        <>
                            <Button variant="secondary" isBusy={isAnalyzing} disabled={isAnalyzing || !cleanRawText.trim()} onClick={handleAutoFill} style={{ width: '100%', justifyContent: 'center', marginBottom: '12px' }}>
                                {isAnalyzing ? <Spinner /> : __('Auto-Fill Code Details', 'intelligent-code-assistant')}
                            </Button>
                            {aiError && <p style={{ color: '#cc1818', fontSize: '12px', marginBottom: '12px' }}>{aiError}</p>}
                            <div style={{ marginTop: '16px' }}>
                                <strong style={{ display: 'block', marginBottom: '6px' }}>{__('Tutorial title', 'intelligent-code-assistant')}</strong>
                                <div style={{ padding: '10px 12px', background: '#f6f7f7', borderRadius: '4px', marginBottom: '14px' }}>{tutorialTitle || __('No tutorial title detected.', 'intelligent-code-assistant')}</div>
                                <strong style={{ display: 'block', marginBottom: '6px' }}>{__('Tutorial context', 'intelligent-code-assistant')}</strong>
                                <div style={{ padding: '10px 12px', background: '#f6f7f7', borderRadius: '4px', whiteSpace: 'pre-wrap', marginBottom: '10px' }}>{effectiveTutorialContext || __('No nearby tutorial context detected.', 'intelligent-code-assistant')}</div>
                                {!isEditingContext && <Button variant="secondary" onClick={() => setIsEditingContext(true)}>{__('Edit context', 'intelligent-code-assistant')}</Button>}
                                {isEditingContext && <><TextareaControl label={__('Edit tutorial context', 'intelligent-code-assistant')} value={tutorialContextOverride || derivedTutorialContext} onChange={(value) => setAttributes({ tutorialContextOverride: value })} /><Button variant="primary" onClick={() => setIsEditingContext(false)}>{__('Done', 'intelligent-code-assistant')}</Button></>}
                            </div>
                        </>
                    )}
                </PanelBody>
                <PanelBody title={__('Code Display Settings', 'intelligent-code-assistant')} initialOpen={false}>
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
