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
 * A linked Code Example behaves like Gutenberg's own synced-pattern controller:
 * the article block stays in the article, while its displayed children belong
 * to the Code Example entity. This keeps one block-editor store, one selection
 * model and one InspectorControls surface.
 *
 * Every pointer interaction on the linked surface keeps the canonical
 * Intelligent Code Assistant selected. The controller is an ownership detail,
 * not an author-facing selection target, so it must never steal selection from
 * the canonical ICA on a later click.
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
    const { selectBlock } = useDispatch('core/block-editor');
    const saveTimer = useRef(null);
    const [saveError, setSaveError] = useState('');

    const canonicalAssistantClientId = useSelect((select) => {
        const blockEditor = select('core/block-editor');
        const candidateIds = (blocks || [])
            .map((block) => block?.clientId)
            .filter(Boolean);

        for (const candidateId of candidateIds) {
            const candidate = blockEditor.getBlock(candidateId);
            if (candidate?.name === 'wpe/intelligent-code-assistant') {
                return candidateId;
            }
        }

        const fallback = (blocks || []).find(
            (block) => block?.name === 'wpe/intelligent-code-assistant'
        );

        return fallback?.clientId || null;
    }, [blocks]);

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

    const keepCanonicalAssistantSelected = (event) => {
        if (!canonicalAssistantClientId) {
            return;
        }

        // Reassert the author-facing ICA on every pointer interaction. Gutenberg
        // may otherwise clear/select the controlled reference on the second
        // click. We intentionally do not preventDefault(), so RichText fields
        // can still receive focus/caret placement and sidebar controls remain
        // normally interactive.
        selectBlock(canonicalAssistantClientId);
        event.stopPropagation();
    };

    const blockProps = useBlockProps({
        className: 'ica-code-example-reference',
        onMouseDownCapture: keepCanonicalAssistantSelected,
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
 * Controlled Code Example children are identified from Gutenberg's actual
 * hierarchy. Selection itself is owned by the author-facing ICA root.
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
        return <Edit {...props} attributes={{ ...attributes, codeExampleId: 0 }} />;
    }

    if (!isArticleReference) {
        return <Edit {...props} />;
    }

    return <CodeExampleController codeExampleId={codeExampleId} />;
}
