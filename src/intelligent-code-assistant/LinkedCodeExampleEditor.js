import { __ } from '@wordpress/i18n';
import { BlockEditorProvider, BlockList } from '@wordpress/block-editor';
import { Button, Notice, Spinner } from '@wordpress/components';
import { useDispatch } from '@wordpress/data';
import { useEntityBlockEditor } from '@wordpress/core-data';
import { useEffect, useRef, useState } from '@wordpress/element';
import CodeExampleEditorContext from './CodeExampleEditorContext';

/**
 * Edit a canonical Code Example entity from inside an article.
 *
 * The article block remains a lightweight reference. This nested block editor
 * is backed directly by the Code Example post's content entity property, so it
 * uses the real Intelligent Code Assistant block editor and controls.
 *
 * Deliberately avoid BlockTools here. A second BlockTools scope creates a
 * second editor toolbar/selection surface inside the post editor, which makes
 * the reference feel like a block inside a block and prevents reliable canvas
 * reselection. The host post editor already supplies the editing tools.
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

    return (
        <>
            {saveError && (
                <Notice status="error" isDismissible={false}>
                    {saveError}
                </Notice>
            )}

            <CodeExampleEditorContext.Provider value={true}>
                <BlockEditorProvider value={blocks} onInput={onInput} onChange={handleChange}>
                    <BlockList />
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
