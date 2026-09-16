import { __ } from '@wordpress/i18n';
import {
    useBlockProps,
    useInnerBlocksProps,
    Warning,
} from '@wordpress/block-editor';
import { Spinner } from '@wordpress/components';
import { useEntityBlockEditor, useEntityRecord } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { useContext, useEffect, useRef, useState } from '@wordpress/element';
import Edit from './edit';
import CodeExampleEditorContext from './CodeExampleEditorContext';

/**
 * A linked Code Example behaves like Gutenberg's own synced-pattern controller:
 * the article block stays in the article, while its displayed children belong
 * to the Code Example entity. This keeps one block-editor store and therefore
 * one selection model, one InspectorControls surface and normal canvas clicks.
 */
function CodeExampleController({ codeExampleId }) {
    const entityId = Number(codeExampleId || 0);
    const { record, hasResolved } = useEntityRecord(
        'postType',
        'ica_code_example',
        entityId
    );
    const [blocks, onInput, onChange] = useEntityBlockEditor(
        'postType',
        'ica_code_example',
        { id: entityId }
    );
    const { saveEditedEntityRecord } = useDispatch('core');
    const saveTimer = useRef(null);
    const [saveError, setSaveError] = useState('');

    useEffect(() => () => {
        if (saveTimer.current) {
            window.clearTimeout(saveTimer.current);
        }
    }, []);

    const scheduleSave = () => {
        if (saveTimer.current) {
            window.clearTimeout(saveTimer.current);
        }

        saveTimer.current = window.setTimeout(async () => {
            try {
                setSaveError('');
                await saveEditedEntityRecord(
                    'postType',
                    'ica_code_example',
                    entityId
                );
            } catch (error) {
                setSaveError(
                    error?.message ||
                    __('The Code Example could not be saved.', 'intelligent-code-assistant')
                );
            }
        }, 700);
    };

    const handleInput = (nextBlocks) => {
        onInput(nextBlocks);
        scheduleSave();
    };

    const handleChange = (nextBlocks) => {
        onChange(nextBlocks);
        scheduleSave();
    };

    const blockProps = useBlockProps({
        className: 'ica-code-example-reference',
    });
    const innerBlocksProps = useInnerBlocksProps(blockProps, {
        value: blocks || [],
        onInput: handleInput,
        onChange: handleChange,
        renderAppender: false,
        templateLock: 'all',
    });

    if (!hasResolved || !blocks) {
        return (
            <div {...blockProps}>
                <Spinner />
            </div>
        );
    }

    if (!record) {
        return (
            <div {...blockProps}>
                <Warning>
                    {__('The selected Code Example could not be loaded.', 'intelligent-code-assistant')}
                </Warning>
            </div>
        );
    }

    return (
        <CodeExampleEditorContext.Provider value={true}>
            <div {...innerBlocksProps}>
                {saveError && (
                    <span className="screen-reader-text" role="status">
                        {saveError}
                    </span>
                )}
            </div>
        </CodeExampleEditorContext.Provider>
    );
}

/**
 * Route normal/legacy blocks to the standard editor and linked article blocks
 * to the Code Example inner-block controller.
 */
export default function EditRouter(props) {
    const { attributes } = props;
    const isCanonicalChild = useContext(CodeExampleEditorContext);
    const currentPostType = useSelect(
        (select) => select('core/editor')?.getCurrentPostType?.() || '',
        []
    );

    const codeExampleId = Number(attributes.codeExampleId || 0);
    const isArticleReference =
        !isCanonicalChild &&
        currentPostType !== 'ica_code_example' &&
        codeExampleId > 0;

    // A canonical ICA rendered as the controlled child of an article reference
    // must use its normal edit UI rather than routing back into itself.
    if (isCanonicalChild) {
        return <Edit {...props} attributes={{ ...attributes, codeExampleId: 0 }} />;
    }

    if (!isArticleReference) {
        return <Edit {...props} />;
    }

    return <CodeExampleController codeExampleId={codeExampleId} />;
}
