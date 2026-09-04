import { useBlockProps, RichText } from '@wordpress/block-editor';

export default function Save({ attributes }) {
    const blockProps = useBlockProps.save({ 
        className: 'task-title' 
    });

    return (
        <div { ...blockProps }>
            <RichText.Content value={ attributes.content } />
        </div>
    );
}