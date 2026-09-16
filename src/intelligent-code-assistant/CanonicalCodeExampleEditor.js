import { __ } from '@wordpress/i18n';
import {
    BlockEditorProvider,
    BlockList,
} from '@wordpress/block-editor';
import { Notice, Spinner } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEntityBlockEditor } from '@wordpress/core-data';
import { useEffect, useRef } from '@wordpress/element';
import { CanonicalCodeExampleContext } from './canonical-editor-context';

/**
 * Edit a Code Example's canonical block content without copying it into the
 * embedding article. The entity block editor owns the blocks; the article
 * continues to own only its codeExampleId reference.
 */
export default function CanonicalCodeExampleEditor({ codeExampleId }) {
    const entityId = Number(codeExampleId || 0);

    // Keep every hook at the top level and execute the same hook sequence on
    // every render. The entity can move from resolving to resolved without
    // changing React's hook order.
    const [blocks, onInput, onChange] = useEntityBlockEditor(
        'postType',
        'ica_code_example',
        { id: entityId }
    );
    const saveTimer = useRef(null);
    const { saveEditedEntityRecord } = useDispatch('core');

    const { record, isResolving } = useSelect((select) => {
        const core = select('core');
        return {
            record: entityId
                ? core.getEntityRecord('postType', 'ica_code_example', entityId)
                : null,
            isResolving: entityId
                ? core.isResolving('getEntityRecord', ['postType', 'ica_code_example', entityId])
                : false,
        };
    }, [entityId]);

    useEffect(() => () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }
    }, []);

    const persistCanonicalChanges = (nextBlocks) => {
        onChange(nextBlocks);

        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }

        saveTimer.current = setTimeout(() => {
            saveEditedEntityRecord('postType', 'ica_code_example', entityId);
        }, 700);
    };

    if (!entityId || isResolving) {
        return <Spinner />;
    }

    if (!record) {
        return (
            <Notice status="warning" isDismissible={false}>
                {__('The selected Code Example could not be loaded.', 'intelligent-code-assistant')}
            </Notice>
        );
    }

    return (
        <CanonicalCodeExampleContext.Provider value={true}>
            <BlockEditorProvider
                value={blocks || []}
                onInput={onInput}
                onChange={persistCanonicalChanges}
                settings={{
                    templateLock: 'all',
                    allowedBlockTypes: [
                        'wpe/intelligent-code-assistant',
                        'wpe/code-header',
                        'wpe/code-content',
                    ],
                }}
            >
                <BlockList />
            </BlockEditorProvider>
        </CanonicalCodeExampleContext.Provider>
    );
}
