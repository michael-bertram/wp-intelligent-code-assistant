import { __ } from '@wordpress/i18n';
import { Warning } from '@wordpress/block-editor';
import { Spinner } from '@wordpress/components';
import { createBlock } from '@wordpress/blocks';
import { useEntityBlockEditor, useEntityRecord } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import Edit from './edit';

const cloneBlockTree = (block) => createBlock(
    block.name,
    { ...(block.attributes || {}) },
    (block.innerBlocks || []).map(cloneBlockTree)
);

const getCanonicalAssistant = (blocks) => (blocks || []).find(
    (block) => block?.name === 'wpe/intelligent-code-assistant'
) || null;

const getSharedAttributes = (attributes = {}) => {
    const {
        id,
        tutorialContextOverride,
        codeExampleId,
        ...sharedAttributes
    } = attributes;

    return sharedAttributes;
};

const getSyncSignature = (block) => {
    if (!block) {
        return '';
    }

    const simplify = (candidate) => ({
        name: candidate.name,
        attributes: candidate.attributes || {},
        innerBlocks: (candidate.innerBlocks || []).map(simplify),
    });

    return JSON.stringify(simplify(block));
};

/**
 * Edit a linked Code Example through the article block itself.
 *
 * The article ICA remains the only Gutenberg selection surface. Canonical Code
 * Example content is projected into that block for editing, then deterministic
 * changes are written back to the Code Example entity. This avoids controlled
 * child selection entirely: one article block, one InspectorControls owner and
 * normal Gutenberg first-click behaviour.
 */
function CodeExampleProxy({ codeExampleId, editProps }) {
    const entityId = Number(codeExampleId || 0);
    const { clientId, attributes } = editProps;
    const { record, hasResolved } = useEntityRecord(
        'postType',
        'ica_code_example',
        entityId
    );
    const [entityBlocks, onEntityInput, onEntityChange] = useEntityBlockEditor(
        'postType',
        'ica_code_example',
        { id: entityId }
    );
    const { saveEditedEntityRecord } = useDispatch('core');
    const { updateBlockAttributes, replaceInnerBlocks } = useDispatch('core/block-editor');
    const [isHydrated, setIsHydrated] = useState(false);
    const [saveError, setSaveError] = useState('');
    const hydratedEntityId = useRef(0);
    const saveTimer = useRef(null);
    const lastSyncedSignature = useRef('');

    const canonicalAssistant = useMemo(
        () => getCanonicalAssistant(entityBlocks),
        [entityBlocks]
    );

    const localBlock = useSelect(
        (select) => select('core/block-editor').getBlock(clientId),
        [clientId]
    );
    const localSignature = getSyncSignature(localBlock);

    useEffect(() => () => {
        if (saveTimer.current) {
            window.clearTimeout(saveTimer.current);
        }
    }, []);

    useEffect(() => {
        if (!canonicalAssistant || hydratedEntityId.current === entityId) {
            return;
        }

        const canonicalAttributes = canonicalAssistant.attributes || {};
        const instanceAttributes = attributes || {};

        updateBlockAttributes(clientId, {
            ...getSharedAttributes(canonicalAttributes),
            codeExampleId: entityId,
            ...(instanceAttributes.id ? { id: instanceAttributes.id } : {}),
            ...(Object.prototype.hasOwnProperty.call(instanceAttributes, 'tutorialContextOverride')
                ? { tutorialContextOverride: instanceAttributes.tutorialContextOverride }
                : {}),
        });

        replaceInnerBlocks(
            clientId,
            (canonicalAssistant.innerBlocks || []).map(cloneBlockTree),
            false
        );

        hydratedEntityId.current = entityId;
        lastSyncedSignature.current = '';
        setIsHydrated(true);
    }, [
        canonicalAssistant,
        entityId,
        clientId,
        attributes,
        updateBlockAttributes,
        replaceInnerBlocks,
    ]);

    useEffect(() => {
        if (!isHydrated || !localBlock || !canonicalAssistant || !localSignature) {
            return;
        }

        if (lastSyncedSignature.current === localSignature) {
            return;
        }

        const localAttributes = localBlock.attributes || {};
        const canonicalAttributes = canonicalAssistant.attributes || {};
        const nextCanonicalAttributes = {
            ...canonicalAttributes,
            ...getSharedAttributes(localAttributes),
            codeExampleId: entityId,
        };

        // Article-only context must never leak back into the reusable entity.
        if (Object.prototype.hasOwnProperty.call(canonicalAttributes, 'id')) {
            nextCanonicalAttributes.id = canonicalAttributes.id;
        } else {
            delete nextCanonicalAttributes.id;
        }
        if (Object.prototype.hasOwnProperty.call(canonicalAttributes, 'tutorialContextOverride')) {
            nextCanonicalAttributes.tutorialContextOverride = canonicalAttributes.tutorialContextOverride;
        } else {
            delete nextCanonicalAttributes.tutorialContextOverride;
        }

        const nextCanonicalBlock = createBlock(
            'wpe/intelligent-code-assistant',
            nextCanonicalAttributes,
            (localBlock.innerBlocks || []).map(cloneBlockTree)
        );
        const nextEntityBlocks = (entityBlocks || []).map((block) =>
            block?.name === 'wpe/intelligent-code-assistant'
                ? nextCanonicalBlock
                : block
        );

        lastSyncedSignature.current = localSignature;
        setSaveError('');
        onEntityInput(nextEntityBlocks);
        onEntityChange(nextEntityBlocks);

        if (saveTimer.current) {
            window.clearTimeout(saveTimer.current);
        }

        saveTimer.current = window.setTimeout(async () => {
            try {
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
    }, [
        isHydrated,
        localBlock,
        localSignature,
        canonicalAssistant,
        entityBlocks,
        entityId,
        onEntityInput,
        onEntityChange,
        saveEditedEntityRecord,
    ]);

    if (!hasResolved || !canonicalAssistant || !isHydrated) {
        return <Spinner />;
    }

    if (!record) {
        return (
            <Warning>
                {__('The selected Code Example could not be loaded.', 'intelligent-code-assistant')}
            </Warning>
        );
    }

    return (
        <>
            <Edit
                {...editProps}
                attributes={{
                    ...editProps.attributes,
                    codeExampleId: 0,
                }}
            />
            {saveError && (
                <span className="screen-reader-text" role="status">
                    {saveError}
                </span>
            )}
        </>
    );
}

/**
 * Keep legacy/standalone blocks unchanged. A linked article block is still the
 * normal Gutenberg block selected by the author; CodeExampleProxy only changes
 * where its editable content is loaded from and persisted to.
 */
export default function EditRouter(props) {
    const { attributes } = props;
    const currentPostType = useSelect(
        (select) => select('core/editor')?.getCurrentPostType?.() || '',
        []
    );

    const codeExampleId = Number(attributes.codeExampleId || 0);
    const isArticleReference =
        currentPostType !== 'ica_code_example' &&
        codeExampleId > 0;

    if (!isArticleReference) {
        return <Edit {...props} />;
    }

    return (
        <CodeExampleProxy
            codeExampleId={codeExampleId}
            editProps={props}
        />
    );
}
