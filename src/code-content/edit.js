import { useBlockProps, RichText } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

export default function Edit({ attributes, setAttributes }) {
    const blockProps = useBlockProps({ 
        className: 'code-content-editor plain-code-editor' 
    });

    return (
        <div {...blockProps}>
            <RichText
                tagName="pre" // Must match the block.json selector
                value={attributes.code} 
                onChange={(value) => setAttributes({ code: value })}
                placeholder={__('Add code here...', 'intelligent-code-assistant')}
                allowedFormats={[]} 
            />
        </div>
    );
}