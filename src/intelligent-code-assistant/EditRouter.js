import { useBlockProps } from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { useContext } from '@wordpress/element';
import Edit from './edit';
import LinkedCodeExampleEditor from './LinkedCodeExampleEditor';
import CodeExampleEditorContext from './CodeExampleEditorContext';

/**
 * Route article references into the canonical Code Example editor.
 *
 * The article block remains a real Gutenberg block for placement and
 * persistence, while the entity-backed editor owns interaction with the
 * canonical Code Example. Selection is deliberately handled inside that
 * editor so the real Intelligent Code Assistant becomes selected and its
 * InspectorControls are shown.
 */
export default function EditRouter(props) {
    const { attributes } = props;
    const isCanonicalProxy = useContext(CodeExampleEditorContext);
    const blockProps = useBlockProps({
        className: 'ica-code-example-reference',
    });
    const currentPostType = useSelect(
        (select) => select('core/editor')?.getCurrentPostType?.() || '',
        []
    );

    const codeExampleId = Number(attributes.codeExampleId || 0);
    const isArticleReference = !isCanonicalProxy && currentPostType !== 'ica_code_example' && codeExampleId > 0;

    if (isCanonicalProxy) {
        return <Edit {...props} attributes={{ ...attributes, codeExampleId: 0 }} />;
    }

    if (!isArticleReference) {
        return <Edit {...props} />;
    }

    return (
        <div {...blockProps}>
            <LinkedCodeExampleEditor codeExampleId={codeExampleId} />
        </div>
    );
}
