import { __ } from '@wordpress/i18n';
import { useBlockProps, InnerBlocks, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, SelectControl, Button, Spinner, TextControl, TextareaControl } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import './editor.scss';

export default function Edit({ attributes, setAttributes, clientId }) {
    const {
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

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [isEditingContext, setIsEditingContext] = useState(false);

    const { updateBlockAttributes } = useDispatch('core/block-editor');

    const {
        cleanRawText,
        lineCount,
        headerBlockId,
        tutorialTitle,
        derivedTutorialContext,
    } = useSelect((select) => {
        const { getBlockOrder, getBlock } = select('core/block-editor');
        const editorStore = select('core/editor');
        const innerBlockIds = getBlockOrder(clientId);

        let contentBlock = null;
        let headerBlock = null;

        for (const id of innerBlockIds) {
            const block = getBlock(id);
            if (!block) continue;
            if (block.name === 'wpe/code-content') contentBlock = block;
            if (block.name === 'wpe/code-header') headerBlock = block;
        }

        const postTitle = editorStore?.getEditedPostAttribute?.('title') || '';
        const topLevelIds = getBlockOrder();
        const currentIndex = topLevelIds.indexOf(clientId);
        const contextFragments = [];

        if (currentIndex > 0) {
            for (let index = currentIndex - 1, inspected = 0; index >= 0 && inspected < 8; index -= 1, inspected += 1) {
                const block = getBlock(topLevelIds[index]);
                if (!block) continue;

                if (block.name === 'core/paragraph' || block.name === 'core/heading') {
                    const rawContent = block.attributes?.content || '';
                    const text = rawContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

                    if (text) {
                        contextFragments.unshift(text);
                    }

                    if (block.name === 'core/heading') {
                        break;
                    }
                }
            }
        }

        const contextResult = contextFragments.join('\n').slice(0, 1200);

        if (!contentBlock) {
            return {
                cleanRawText: '',
                lineCount: 1,
                headerBlockId: headerBlock?.clientId || null,
                tutorialTitle: postTitle,
                derivedTutorialContext: contextResult,
            };
        }

        const rawContent = contentBlock.attributes?.content ||
                             contentBlock.attributes?.code ||
                             contentBlock.attributes?.value ||
                             '';

        const textWithNewlines = rawContent
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p><p>/gi, '\n')
            .replace(/<\/div><div>/gi, '\n');

        const cleanText = textWithNewlines.replace(/<[^>]*>/g, '');
        const linesArray = cleanText.split('\n');
        const calculatedLines = cleanText.trim() ? linesArray.length : 1;

        return {
            cleanRawText: cleanText,
            lineCount: calculatedLines,
            headerBlockId: headerBlock?.clientId || null,
            tutorialTitle: postTitle,
            derivedTutorialContext: contextResult,
        };
    }, [clientId]);

    const characterCount = cleanRawText.replace(/\r/g, '').length;
    const effectiveTutorialContext = tutorialContextOverride || derivedTutorialContext;

    const isLineHighlighted = (lineNumber, highlightExpression) => {
        if (!highlightExpression) return false;
        const ranges = highlightExpression.split(',');
        for (const range of ranges) {
            const parts = range.split('-').map((n) => parseInt(n.trim(), 10));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                if (lineNumber >= parts[0] && lineNumber <= parts[1]) return true;
            } else if (parts.length === 1 && !isNaN(parts[0])) {
                if (lineNumber === parts[0]) return true;
            }
        }
        return false;
    };

    const normalizeCodeForDetection = (code) => code
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&amp;/gi, '&');

    const detectCodeLanguage = (code) => {
        const trimmedCode = normalizeCodeForDetection(code.trim());
        if (!trimmedCode) return '';

        if (
            (trimmedCode.startsWith('{') && trimmedCode.endsWith('}')) ||
            (trimmedCode.startsWith('[') && trimmedCode.endsWith(']'))
        ) {
            try {
                JSON.parse(trimmedCode);
                return 'JSON';
            } catch (error) {
                // Continue with the remaining language checks.
            }
        }

        if (/^\s*(?:<!doctype\s+html|<!--|<\/?[a-z][\w:-]*(?:\s[^<>]*?)?>)/i.test(trimmedCode)) return 'HTML';

        if (
            /<\?php|\bnamespace\s+[A-Za-z_\\]|\$[A-Za-z_]\w*|->|::|\b(add_action|add_filter|wp_register_ability|register_block_type)\s*\(/i.test(trimmedCode)
        ) {
            return 'PHP';
        }

        if (
            /\b(import|export|const|let|var|async|await|function)\b|=>|\bconsole\.|\bdocument\.|\bwindow\.|\bJSON\./.test(trimmedCode)
        ) {
            return 'JS';
        }

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

        const requestData = {
            code: cleanRawText,
        };

        try {
            let response;
            try {
                response = await apiFetch({
                    path: '/wp/v2/abilities/intelligent-code-assistant/auto-fill-metadata/run',
                    method: 'POST',
                    data: requestData,
                });
            } catch (routeErr) {
                if (routeErr.code === 'rest_no_route' || routeErr.status === 404) {
                    response = await apiFetch({
                        path: '/intelligent-code-assistant/v1/auto-fill-metadata',
                        method: 'POST',
                        data: requestData,
                    });
                } else {
                    throw routeErr;
                }
            }

            const detectedLanguage = detectCodeLanguage(cleanRawText);
            const responseLanguage = response.codeLanguage || '';
            const nextLanguage = detectedLanguage || (responseLanguage !== 'PHP' ? responseLanguage : '');

            setAttributes({
                codeLanguage: nextLanguage,
                filename: response.filename || filename,
                highlightLines: response.highlightLines ?? highlightLines,
                showLineNumbers: response.showLineNumbers ?? showLineNumbers,
            });

            if (headerBlockId && response.title) {
                updateBlockAttributes(headerBlockId, {
                    title: response.title,
                });
            }
        } catch (err) {
            const rawMessage = err.message || __('Failed to auto-fill metadata.', 'intelligent-code-assistant');
            const cleanMessage = rawMessage.includes('<p>')
                ? __('Server error occurred during execution. Check WP debug log.', 'intelligent-code-assistant')
                : rawMessage;
            setAiError(cleanMessage);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const blockProps = useBlockProps({
        className: `wp-block-wpe-intelligent-code-assistant-editor ${isDarkMode ? 'dark-theme' : ''} ${isCompact ? 'is-compact' : ''} ${showLineNumbers ? 'has-line-numbers' : ''}`,
        style: {
            '--editor-code-font-size': fontSize,
            '--panel-max-height': maxHeight,
        },
    });

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
                    <ToggleControl
                        label={__('Enable AI Features', 'intelligent-code-assistant')}
                        checked={enableAIAssistant}
                        onChange={(value) => setAttributes({ enableAIAssistant: value })}
                        help={
                            enableAIAssistant
                                ? __('AI-powered authoring tools and reader assistance are enabled for this code block.', 'intelligent-code-assistant')
                                : __('Enable AI features for authoring assistance and the frontend AI Assistant.', 'intelligent-code-assistant')
                        }
                    />

                    {enableAIAssistant && (
                        <>
                            <Button
                                variant="secondary"
                                isBusy={isAnalyzing}
                                disabled={isAnalyzing || !cleanRawText.trim()}
                                onClick={handleAutoFill}
                                style={{ width: '100%', justifyContent: 'center', marginBottom: '12px' }}
                            >
                                {isAnalyzing ? <Spinner /> : __('Auto-Fill Code Details', 'intelligent-code-assistant')}
                            </Button>

                            {aiError && (
                                <p style={{ color: '#cc1818', fontSize: '12px', marginBottom: '12px' }}>
                                    {aiError}
                                </p>
                            )}

                            <div style={{ marginTop: '16px' }}>
                                <strong style={{ display: 'block', marginBottom: '6px' }}>
                                    {__('Tutorial title', 'intelligent-code-assistant')}
                                </strong>
                                <div style={{ padding: '10px 12px', background: '#f6f7f7', borderRadius: '4px', marginBottom: '14px' }}>
                                    {tutorialTitle || __('No tutorial title detected.', 'intelligent-code-assistant')}
                                </div>

                                <strong style={{ display: 'block', marginBottom: '6px' }}>
                                    {__('Tutorial context', 'intelligent-code-assistant')}
                                </strong>
                                <div style={{ padding: '10px 12px', background: '#f6f7f7', borderRadius: '4px', whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
                                    {effectiveTutorialContext || __('No nearby tutorial context detected.', 'intelligent-code-assistant')}
                                </div>

                                {!isEditingContext && (
                                    <Button
                                        variant="secondary"
                                        onClick={() => setIsEditingContext(true)}
                                        style={{ marginBottom: '8px' }}
                                    >
                                        {__('Edit context', 'intelligent-code-assistant')}
                                    </Button>
                                )}

                                {isEditingContext && (
                                    <>
                                        <TextareaControl
                                            label={__('Edit tutorial context', 'intelligent-code-assistant')}
                                            value={tutorialContextOverride || derivedTutorialContext}
                                            onChange={(value) => setAttributes({ tutorialContextOverride: value })}
                                            help={__('This custom context will replace the automatically detected context for this code block.', 'intelligent-code-assistant')}
                                        />
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                            <Button
                                                variant="primary"
                                                onClick={() => setIsEditingContext(false)}
                                            >
                                                {__('Done', 'intelligent-code-assistant')}
                                            </Button>
                                            {tutorialContextOverride && (
                                                <Button
                                                    variant="tertiary"
                                                    onClick={() => {
                                                        setAttributes({ tutorialContextOverride: '' });
                                                        setIsEditingContext(false);
                                                    }}
                                                >
                                                    {__('Use detected context', 'intelligent-code-assistant')}
                                                </Button>
                                            )}
                                        </div>
                                    </>
                                )}

                                <p style={{ marginTop: '6px', color: '#646970', fontSize: '12px' }}>
                                    {tutorialContextOverride
                                        ? __('Using custom context for this code block.', 'intelligent-code-assistant')
                                        : __('Using context detected from the nearest heading and paragraphs.', 'intelligent-code-assistant')}
                                </p>
                            </div>
                        </>
                    )}
                </PanelBody>

                <PanelBody title={__('Code Display Settings', 'intelligent-code-assistant')} initialOpen={false}>
                    <TextControl
                        label={__('Filename / Label', 'intelligent-code-assistant')}
                        value={filename || ''}
                        onChange={(value) => setAttributes({ filename: value })}
                        help={__('Filename shown with the code example. AI can suggest this when AI Features are enabled.', 'intelligent-code-assistant')}
                    />
                    <TextControl
                        label={__('Highlight Lines (e.g., 3, 5-8)', 'intelligent-code-assistant')}
                        value={highlightLines || ''}
                        onChange={(value) => setAttributes({ highlightLines: value })}
                        help={__('Comma-separated line numbers or ranges to highlight.', 'intelligent-code-assistant')}
                    />
                    <ToggleControl
                        label={__('Show Language Badge', 'intelligent-code-assistant')}
                        checked={showLanguageBadge}
                        onChange={(value) => setAttributes({ showLanguageBadge: value })}
                    />
                    {showLanguageBadge && (
                        <SelectControl
                            label={__('Code Language', 'intelligent-code-assistant')}
                            value={codeLanguage || ''}
                            options={[
                                { label: __('Auto / Not set', 'intelligent-code-assistant'), value: '' },
                                { label: 'PHP', value: 'PHP' },
                                { label: 'JavaScript', value: 'JS' },
                                { label: 'CSS', value: 'CSS' },
                                { label: 'HTML', value: 'HTML' },
                                { label: 'JSON', value: 'JSON' },
                                { label: 'SQL', value: 'SQL' },
                                { label: 'Bash', value: 'Bash' },
                            ]}
                            onChange={(value) => setAttributes({ codeLanguage: value })}
                        />
                    )}
                    <ToggleControl
                        label={__('Show Line Numbers', 'intelligent-code-assistant')}
                        checked={showLineNumbers}
                        onChange={(value) => {
                            if (value && isCompact) {
                                setAttributes({ showLineNumbers: value, isCompact: false });
                            } else {
                                setAttributes({ showLineNumbers: value });
                            }
                        }}
                    />
                </PanelBody>

                <PanelBody title={__('Design & Layout', 'intelligent-code-assistant')} initialOpen={false}>
                    <ToggleControl
                        label={__('Use Dark Theme', 'intelligent-code-assistant')}
                        checked={isDarkMode}
                        onChange={(value) => setAttributes({ isDarkMode: value })}
                    />
                    <ToggleControl
                        label={__('Compact Spacing Layout', 'intelligent-code-assistant')}
                        checked={isCompact}
                        disabled={showLineNumbers}
                        onChange={(value) => setAttributes({ isCompact: value })}
                        help={showLineNumbers ? __('Compact mode is disabled when line numbers are enabled.', 'intelligent-code-assistant') : ''}
                    />
                    <SelectControl
                        label={__('Max Panel Height', 'intelligent-code-assistant')}
                        value={maxHeight}
                        options={maxHeightOptions}
                        onChange={(value) => setAttributes({ maxHeight: value })}
                    />
                    <SelectControl
                        label={__('Code Font Size', 'intelligent-code-assistant')}
                        value={fontSize}
                        options={fontSizeOptions}
                        onChange={(value) => setAttributes({ fontSize: value })}
                    />
                </PanelBody>
            </InspectorControls>

            <div {...blockProps}>
                <div className="editor-combined-container">
                    {showLanguageBadge && codeLanguage && (
                        <span className={`code-badge lang-${codeLanguage.toLowerCase()}`}>
                            {codeLanguage}
                        </span>
                    )}

                    <div className="editor-inner-blocks-wrapper">
                        <InnerBlocks
                            allowedBlocks={['wpe/code-header', 'wpe/code-content']}
                            template={[['wpe/code-header', {}], ['wpe/code-content', {}]]}
                            templateLock="all"
                        />

                        {showLineNumbers && (
                            <div className="line-numbers-gutter" aria-hidden="true">
                                {Array.from({ length: lineCount }).map((_, index) => {
                                    const lineNum = index + 1;
                                    const highlighted = isLineHighlighted(lineNum, highlightLines);
                                    return (
                                        <span
                                            key={index}
                                            className={highlighted ? 'is-highlighted' : ''}
                                        >
                                            {lineNum}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="code-footer">
                        <div className="code-analytics-meta">
                            {filename && (
                                <>
                                    <span className="code-filename">{filename}</span>
                                    <span className="meta-divider">•</span>
                                </>
                            )}
                            <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
                            <span className="meta-divider">•</span>
                            <span>{characterCount.toLocaleString()} chars</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
