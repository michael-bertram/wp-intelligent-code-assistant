import { useBlockProps, RichText } from '@wordpress/block-editor';

export default function Save({ attributes }) {
    // blockProps automatically assigns the <pre> tag because we pass it to useBlockProps.save()
    const blockProps = useBlockProps.save();

    return (
        <div { ...blockProps }>
            <RichText.Content value={ attributes.code } />
        </div>
    );
}