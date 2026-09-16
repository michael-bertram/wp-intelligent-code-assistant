import { __ } from '@wordpress/i18n';
import { BlockControls, useBlockProps } from '@wordpress/block-editor';
import { ToolbarButton } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useContext, useState } from '@wordpress/element';
import Edit from './edit';
import CodeExampleChooser from './CodeExampleChooser';
import LinkedCodeExampleEditor from './LinkedCodeExampleEditor';
import CodeExampleEditorContext from './CodeExampleEditorContext';

/**
 * Route article references into the canonical Code Example editor.
 *
 * A normal article block stores only codeExampleId. When selected, this router
 * mounts a block editor backed by that Code Example entity. The canonical ICA
 * block therefore uses its real edit component, InspectorControls and inner
 * blocks exactly as it does on the Code Example post type screen.
 */
export default function EditRouter(props) {
    const { attributes, setAttributes } = props;
    const [isChangingCodeExample, setIsChangingCodeExample] = useState(false);
    const isCanonicalProxy = useContext(CodeExampleEditorContext);
    const currentPostType = useSelect(
        (select) => select('core/editor')?.getCurrentPostType?.() || '',
        []
    );

    const codeExampleId = Number(attributes.codeExampleId || 0);
    const isArticleReference = !isCanonicalProxy && currentPostType !== 'ica_code_example' && codeExampleId > 0;

    // Inside the nested canonical editor, suppress reference routing while
    // retaining the entity's real attributes in the core-data block editor.
    if (isCanonicalProxy) {
        return <Edit {...props} attributes={{ ...attributes, codeExampleId: 0 }} />;
    }

    if (!isArticleReference) {
        return <Edit {...props} />;
    }

    const blockProps = useBlockProps({ className: 'ica-code-example-reference-editor' });

    if (isChangingCodeExample) {
        return (
            <div {...blockProps}>
                <CodeExampleChooser
                    onSelect={(id) => {
                        setAttributes({ codeExampleId: Number(id) });
                        setIsChangingCodeExample(false);
                    }}
                />
            </div>
        );
    }

    return (
        <>
            <BlockControls>
                <ToolbarButton onClick={() => setIsChangingCodeExample(true)}>
                    {__('Change Code Example', 'intelligent-code-assistant')}
                </ToolbarButton>
            </BlockControls>
            <div {...blockProps}>
                <LinkedCodeExampleEditor codeExampleId={codeExampleId} />
            </div>
        </>
    );
}
