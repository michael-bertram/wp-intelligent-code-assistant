import { useBlockProps, RichText } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { useDispatch, useSelect } from '@wordpress/data';

export default function Edit({ attributes, setAttributes, clientId }) {
    const { selectBlock } = useDispatch('core/block-editor');
    const { parentId, isParentSelected } = useSelect((select) => {
        const blockEditor = select('core/block-editor');
        const parents = blockEditor.getBlockParents(clientId);
        const directParentId = parents.length ? parents[parents.length - 1] : null;

        return {
            parentId: directParentId,
            isParentSelected: directParentId
                ? blockEditor.isBlockSelected(directParentId)
                : false,
        };
    }, [clientId]);

    const selectAssistantFirst = (event) => {
        if (!parentId || isParentSelected) {
            return;
        }

        selectBlock(parentId);
        event.preventDefault();
        event.stopPropagation();
    };

    // `content` was the attribute consumed by the parent ICA editor, while the
    // Code Content block later moved to `code`. Read either representation and
    // keep both in sync so historical blocks and canonical Code Examples use
    // the same text immediately after parsing/hydration.
    const codeValue = attributes.code ?? attributes.content ?? '';

    const blockProps = useBlockProps({
        className: 'code-content-editor plain-code-editor',
        onMouseDownCapture: selectAssistantFirst,
    });

    return (
        <div {...blockProps}>
            <RichText
                tagName="pre"
                value={codeValue}
                onChange={(value) => setAttributes({ code: value, content: value })}
                placeholder={__('Add code here...', 'intelligent-code-assistant')}
                allowedFormats={[]}
            />
        </div>
    );
}
