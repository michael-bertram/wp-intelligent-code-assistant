import { useBlockProps, RichText } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

export default function Edit({ attributes, setAttributes }) {
    const blockProps = useBlockProps({
        className: 'task-title'
    });

    return (
        <div {...blockProps}>
            <RichText
                tagName="div" // Matches retrieved post body tag
                value={attributes.content}
                onChange={(value) => setAttributes({ content: value })}
                placeholder={__('Add Filename...', 'intelligent-code-assistant')}
                allowedFormats={[]} // Keeps it as clean plain text
                style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1e293b' }}
            />
        </div>
    );
}