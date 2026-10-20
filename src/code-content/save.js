import { useBlockProps } from '@wordpress/block-editor';

export default function Save({ attributes }) {
    const blockProps = useBlockProps.save();
    const codeValue = attributes.code ?? attributes.content ?? '';

    // Code is plain text, not rich text. Rendering it as a text child preserves
    // literal HTML and line breaks without RichText.Content rewriting lines
    // into paragraph/line-break markup.
    return <div {...blockProps}>{codeValue}</div>;
}
