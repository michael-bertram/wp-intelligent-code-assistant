import { useBlockProps, RichText } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { useSelect, useDispatch } from '@wordpress/data';
import { useEffect } from '@wordpress/element';

export default function Edit({ attributes, setAttributes, clientId }) {
    const { updateBlockAttributes } = useDispatch('core/block-editor');

    const { parentId, filename } = useSelect((select) => {
        const { getBlockParents, getBlockAttributes } = select('core/block-editor');
        const parents = getBlockParents(clientId);
        const directParentId = parents.length ? parents[parents.length - 1] : null;
        const parentAttributes = directParentId ? getBlockAttributes(directParentId) : null;

        return {
            parentId: directParentId,
            filename: parentAttributes?.filename || '',
        };
    }, [clientId]);

    useEffect(() => {
        if (filename && filename !== attributes.content) {
            setAttributes({ content: filename });
        }
    }, [filename, attributes.content, setAttributes]);

    const blockProps = useBlockProps({
        className: 'task-title'
    });

    const handleFilenameChange = (value) => {
        if (parentId) {
            updateBlockAttributes(parentId, { filename: value });
        }

        setAttributes({ content: value });
    };

    return (
        <div {...blockProps}>
            <RichText
                tagName="div"
                value={filename || attributes.content || ''}
                onChange={handleFilenameChange}
                placeholder={__('Add Filename...', 'intelligent-code-assistant')}
                allowedFormats={[]}
                style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1e293b' }}
            />
        </div>
    );
}