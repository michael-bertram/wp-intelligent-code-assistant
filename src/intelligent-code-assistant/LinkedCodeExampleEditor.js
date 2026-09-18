import { __ } from '@wordpress/i18n';
import { BlockEditorProvider, BlockList } from '@wordpress/block-editor';
import { Button, Notice, Spinner } from '@wordpress/components';
import { useDispatch } from '@wordpress/data';
import { useEntityBlockEditor } from '@wordpress/core-data';
import { useEffect, useRef, useState } from '@wordpress/element';
import CodeExampleEditorContext from './CodeExampleEditorContext';

/**
 * Runs inside the entity-backed BlockEditorProvider, so block-editor dispatches
 * target the canonical Code Example editor rather than the embedding article.
 * Clicking anywhere in the Code Example selects its root Intelligent Code
 * Assistant block after Gutenberg has processed the click. This makes the
 * canonical block's InspectorControls reliably appear from the whole surface.
 */
function CanonicalSelectionSurface({ rootClientId, children }) {
    const { selectBlock } = useDispatch('core/block-editor');

    const selectCanonicalBlock = () => {
        if (!rootClientId) return;

        window.requestAnimationFrame(() => {
            selectBlock(rootClientId);
        });
    };

    return (
        <div
            className="ica-canonical-selection-surface"
            onMouseDownCapture={selectCanonicalBlock}
            onFocusCapture={selectCanonicalBlock}
        >
            {children}
        </div>
    );
}

/**
 * Edit a canonical Code Example entity from inside an article.
 *
 * The article stores only the Code Example relationship. The nested editor is
 * backed directly by the Code Example post's content entity property, so the
 * code, attributes and InspectorControls all belong to the canonical block.
 */
export default function LinkedCodeExampleEditor({ codeExampleId }) {
    const [blocks, onInput, onChange] = useEntityBlockEditor(
        'postType',
        'ica_code_example',
        { id: codeExampleId }
    );
    const { saveEditedEntityRecord } = useDispatch('core');
    const [saveError, setSaveError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const saveTimer = useRef(null);

    useEffect(() => () => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
    }, []);

    const persistCodeExample = async () => {
        if (!codeExampleId) return;

        setIsSaving(true);
        setSaveError('');

        try {
            await saveEditedEntityRecord('postType', 'ica_code_example', codeExampleId);
        } catch (error) {
            setSaveError(error?.message || __('The Code Example could not be saved.', 'intelligent-code-assistant'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (nextBlocks) => {
        onChange(nextBlocks);

        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(persistCodeExample, 800);
    };

    if (!blocks) return <Spinner />;

    const canonicalBlock = blocks.find((block) => block.name === 'wpe/intelligent-code-assistant') || blocks[0];
    const rootClientId = canonicalBlock?.clientId || '';

    return (
        <>
            {saveError && (
                <Notice status="error" isDismissible={false}>
                    {saveError}
                </Notice>
            )}

            <CodeExampleEditorContext.Provider value={true}>
                <BlockEditorProvider value={blocks} onInput={onInput} onChange={handleChange}>
                    <CanonicalSelectionSurface rootClientId={rootClientId}>
                        <BlockList />
                    </CanonicalSelectionSurface>
                </BlockEditorProvider>
            </CodeExampleEditorContext.Provider>

            {isSaving && (
                <span className="ica-code-example-saving screen-reader-text" aria-live="polite">
                    {__('Saving Code Example…', 'intelligent-code-assistant')}
                </span>
            )}

            {saveError && (
                <Button variant="secondary" onClick={persistCodeExample}>
                    {__('Try saving again', 'intelligent-code-assistant')}
                </Button>
            )}
        </>
    );
}
