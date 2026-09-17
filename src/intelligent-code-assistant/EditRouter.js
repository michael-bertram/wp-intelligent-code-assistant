import { __ } from '@wordpress/i18n';
import {
    useBlockProps,
    useInnerBlocksProps,
    Warning,
} from '@wordpress/block-editor';
import { Spinner } from '@wordpress/components';
import { useEntityBlockEditor, useEntityRecord } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect, useRef, useState } from '@wordpress/element';
import Edit from './edit';

/**
 * Give the composite Intelligent Code Assistant the same first-click behaviour
 * as a normal Gutenberg block. Its header/code blocks are implementation
 * details, so the first click anywhere on the surface selects the ICA root and
 * exposes its InspectorControls. Once selected, subsequent clicks can still
 * reach the inner editable blocks.
 */
function SelectionProxy({ clientId, children }) {
    const { selectBlock } = useDispatch('core/block-editor');
    const isSelected = useSelect(
        (select) => select('core/block-editor').isBlockSelected(clientId),
        [clientId]
    );

    const selectRootOnFirstClick = (event) => {
        if (isSelected) {
            return;
        }

        selectBlock(clientId);

        // Do not let the same pointer action immediately replace the root
        // selection with one of the ICA's implementation-detail inner blocks.
        // The next click is allowed through normally for code/header editing.
        event.stopPropagation();
    };

    return (
        <div
            className="ica-selection-proxy"
            style={{ display: 'contents' }}
            onMouseDownCapture={selectRootOnFirstClick}
        >
            {children}
        </div>
    );
}

/**
 * A linked Code Example behaves like Gutenberg's own synced-pattern controller:
 * the article block stays in the article, while its displayed children belong
 * to the Code Example entity. This keeps one block-editor store and therefore
 * one selection model and one InspectorControls surface.
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
        <>
            <div {...innerBlocksProps} />
            {saveError && (
                <span className="screen-reader-text" role="status">
                    {saveError}
                </span>
            )}
        </>
    );
}

/**
 * Route normal/legacy blocks to the standard editor and linked article blocks
 * to the Code Example inner-block controller.
 *
 * The canonical child is detected from Gutenberg's actual block hierarchy,
 * rather than React context. Controlled entity blocks are rendered by the host
 * block-editor store, so React context from the controller is not a reliable
 * way to identify them.
 */
export default function EditRouter(props) {
    const { attributes, clientId } = props;
    const currentPostType = useSelect(
        (select) => select('core/editor')?.getCurrentPostType?.() || '',
        []
    );

    const parentBlock = useSelect((select) => {
        const blockEditor = select('core/block-editor');
        const parentClientId = blockEditor.getBlockRootClientId(clientId);
        return parentClientId ? blockEditor.getBlock(parentClientId) : null;
    }, [clientId]);

    const codeExampleId = Number(attributes.codeExampleId || 0);
    const parentCodeExampleId = Number(parentBlock?.attributes?.codeExampleId || 0);
    const isCanonicalChild =
        parentBlock?.name === 'wpe/intelligent-code-assistant' &&
        parentCodeExampleId > 0 &&
        parentCodeExampleId === codeExampleId;

    const isArticleReference =
        !isCanonicalChild &&
        currentPostType !== 'ica_code_example' &&
        codeExampleId > 0;

    if (isCanonicalChild) {
        return (
            <SelectionProxy clientId={clientId}>
                <Edit {...props} attributes={{ ...attributes, codeExampleId: 0 }} />
            </SelectionProxy>
        );
    }

    if (!isArticleReference) {
        return (
            <SelectionProxy clientId={clientId}>
                <Edit {...props} />
            </SelectionProxy>
        );
    }

    return <CodeExampleController codeExampleId={codeExampleId} />;
}
