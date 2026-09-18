import { useBlockProps, RichText } from '@wordpress/block-editor';

export default function Save({ attributes }) {
    const blockProps = useBlockProps.save();
    const codeValue = attributes.code ?? attributes.content ?? '';

    return (
        <div {...blockProps}>
            <RichText.Content value={codeValue} />
        </div>
    );
}
