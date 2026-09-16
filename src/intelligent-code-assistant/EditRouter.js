import { useSelect } from '@wordpress/data';
import { useContext } from '@wordpress/element';
import Edit from './edit';
import LinkedCodeExampleEditor from './LinkedCodeExampleEditor';
import CodeExampleEditorContext from './CodeExampleEditorContext';

/**
 * Route article references into the canonical Code Example editor.
 *
 * A normal article block stores only codeExampleId. When selected, this router
 * mounts a block editor backed by that Code Example entity. The reference
 * itself is intentionally visually transparent: the author should experience
 * the canonical Intelligent Code Assistant, not a wrapper around it.
 */
export default function EditRouter(props) {
    const { attributes } = props;
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

    return <LinkedCodeExampleEditor codeExampleId={codeExampleId} />;
}
