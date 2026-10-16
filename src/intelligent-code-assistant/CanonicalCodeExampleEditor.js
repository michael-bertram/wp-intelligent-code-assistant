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
    const [blocks, onInput, onChange] = useEntityBlockEditor(
        'postType',
        'ica_code_example',
        { id: entityId }
    );
    const saveTimer = useRef(null);
    const { saveEditedEntityRecord } = useDispatch('core');

    const {
        record,
        isResolving,
        canEdit,
        isSaving,
        saveError,
    } = useSelect((select) => {
        const core = select('core');
        return {
            record: entityId
                ? core.getEntityRecord('postType', 'ica_code_example', entityId)
                : null,
            isResolving: entityId
                ? core.isResolving('getEntityRecord', ['postType', 'ica_code_example', entityId])
                : false,
            canEdit: entityId
                ? core.canUserEditEntityRecord('postType', 'ica_code_example', entityId)
                : false,
            isSaving: entityId
                ? core.isSavingEntityRecord('postType', 'ica_code_example', entityId)
                : false,
            saveError: entityId
                ? core.getLastEntitySaveError('postType', 'ica_code_example', entityId)
                : null,
        };
    }, [entityId]);

    useEffect(() => () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }
    }, []);

    const persistCanonicalChanges = (nextBlocks) => {
        if (!entityId || canEdit === false) {
            return;
        }

        onChange(nextBlocks);

        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }

        saveTimer.current = setTimeout(async () => {
            saveTimer.current = null;
            await saveEditedEntityRecord('postType', 'ica_code_example', entityId);
        }, 700);
    };

    if (!entityId || isResolving || canEdit === undefined) {
        return <Spinner />;
    }

    if (!record) {
        return (
            <Notice status="warning" isDismissible={false}>
                {__('The selected Code Example could not be loaded. It may have been deleted or you may no longer have access to it.', 'intelligent-code-assistant')}
            </Notice>
        );
    }

    if (canEdit === false) {
        return (
            <Notice status="warning" isDismissible={false}>
                {__('You do not have permission to edit this Code Example.', 'intelligent-code-assistant')}
            </Notice>
        );
    }

    return (
        <CanonicalCodeExampleContext.Provider value={true}>
            {saveError && (
                <Notice status="error" isDismissible={false}>
                    {saveError?.message || __('The Code Example could not be saved. Your article reference has not been changed.', 'intelligent-code-assistant')}
                </Notice>
            )}
            {isSaving && (
                <div className="ica-code-example-save-status" role="status" aria-live="polite">
                    <Spinner />
                    <span>{__('Saving Code Example…', 'intelligent-code-assistant')}</span>
                </div>
            )}
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
