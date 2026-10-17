import { __ } from '@wordpress/i18n';
import { Button, SelectControl, Spinner, TextControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useState } from '@wordpress/element';

const EMPTY_CODE_EXAMPLE_CONTENT = `<!-- wp:wpe/intelligent-code-assistant -->
<div class="wp-block-wpe-intelligent-code-assistant task-block"><!-- wp:wpe/code-header -->
<div class="wp-block-wpe-code-header task-title"></div>
<!-- /wp:wpe/code-header -->

<!-- wp:wpe/code-content -->
<div class="wp-block-wpe-code-content"></div>
<!-- /wp:wpe/code-content --></div>
<!-- /wp:wpe/intelligent-code-assistant -->`;

export default function CodeExampleChooser({ onSelect }) {
    const [selectedId, setSelectedId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');

    const codeExamples = useSelect(
        (select) => select('core').getEntityRecords('postType', 'ica_code_example', {
            per_page: 100,
            orderby: 'title',
            order: 'asc',
            status: ['publish', 'draft', 'pending', 'private'],
        }) || [],
        []
    );

    const { saveEntityRecord } = useDispatch('core');

    const options = [
        { label: __('Choose a Code Example…', 'intelligent-code-assistant'), value: '' },
        ...codeExamples.map((example) => ({
            label: example.title?.rendered || `${__('Code Example', 'intelligent-code-assistant')} #${example.id}`,
            value: String(example.id),
        })),
    ];

    const createCodeExample = async () => {
        const title = newTitle.trim();
        if (!title) {
            setError(__('Enter a name for the new Code Example.', 'intelligent-code-assistant'));
            return;
        }

        setIsCreating(true);
        setError('');

        try {
            const record = await saveEntityRecord('postType', 'ica_code_example', {
                title,
                status: 'draft',
                content: EMPTY_CODE_EXAMPLE_CONTENT,
            });

            if (!record?.id) {
                throw new Error(__('The Code Example could not be created.', 'intelligent-code-assistant'));
            }

            onSelect(record.id);
        } catch (err) {
            setError(err?.message || __('The Code Example could not be created.', 'intelligent-code-assistant'));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="ica-code-example-chooser" style={{ border: '1px solid #dcdcde', padding: '24px', borderRadius: '4px' }}>
            <h3 style={{ marginTop: 0 }}>{__('Add a Code Example', 'intelligent-code-assistant')}</h3>
            <p>{__('Create a reusable Code Example or select one that already exists.', 'intelligent-code-assistant')}</p>

            <div style={{ marginTop: '20px' }}>
                <TextControl
                    label={__('New Code Example name', 'intelligent-code-assistant')}
                    value={newTitle}
                    onChange={setNewTitle}
                    placeholder={__('e.g. Register a REST Route', 'intelligent-code-assistant')}
                />
                <Button
                    variant="primary"
                    onClick={createCodeExample}
                    disabled={isCreating || !newTitle.trim()}
                    isBusy={isCreating}
                >
                    {isCreating ? <Spinner /> : __('Create New Code Example', 'intelligent-code-assistant')}
                </Button>
            </div>

            <div style={{ margin: '24px 0 12px', borderTop: '1px solid #dcdcde', paddingTop: '20px' }}>
                <SelectControl
                    label={__('Or select an existing Code Example', 'intelligent-code-assistant')}
                    value={selectedId}
                    options={options}
                    onChange={setSelectedId}
                />
                <Button
                    variant="secondary"
                    onClick={() => onSelect(Number(selectedId))}
                    disabled={!selectedId}
                >
                    {__('Use Selected Code Example', 'intelligent-code-assistant')}
                </Button>
            </div>

            {error && <p role="alert" style={{ color: '#cc1818' }}>{error}</p>}
        </div>
    );
}
