import { useBlockProps } from '@wordpress/block-editor';
import { useDispatch, useSelect } from '@wordpress/data';
import { useContext } from '@wordpress/element';
import Edit from './edit';
import LinkedCodeExampleEditor from './LinkedCodeExampleEditor';
import CodeExampleEditorContext from './CodeExampleEditorContext';

/**
 * Route article references into the canonical Code Example editor.
 *
 * The article reference remains a real selectable Gutenberg block. Its wrapper
 * owns canvas selection, while the nested editor owns the canonical Code
 * Example content. Clicking anywhere inside the rendered Code Example first
 * selects the article reference, so its sidebar controls appear just like a
 * normal core block.
 */
export default function EditRouter(props) {
    const { attributes, clientId } = props;
    const isCanonicalProxy = useContext(CodeExampleEditorContext);
    const blockProps = useBlockProps({
        className: 'ica-code-example-reference',
    });
    const { selectBlock } = useDispatch('core/block-editor');
    const currentPostType = useSelect(
        (select) => select('core/editor')?.getCurrentPostType?.() || '',
        []
    );

    const codeExampleId = Number(attributes.codeExampleId || 0);
    const isArticleReference = !isCanonicalProxy && currentPostType !== 'ica_code_example' && codeExampleId > 0;

    // Inside the entity-backed editor we render the real ICA edit component.
    // Setting codeExampleId to zero here prevents the canonical block from
    // routing back into another reference editor.
    if (isCanonicalProxy) {
        return <Edit {...props} attributes={{ ...attributes, codeExampleId: 0 }} />;
    }

    if (!isArticleReference) {
        return <Edit {...props} />;
    }

    const selectReference = () => {
        selectBlock(clientId);
    };

    return (
        <div
            {...blockProps}
            onMouseDownCapture={selectReference}
            onFocusCapture={selectReference}
        >
            <LinkedCodeExampleEditor codeExampleId={codeExampleId} />
        </div>
    );
}
