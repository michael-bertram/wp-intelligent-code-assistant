import { __ } from '@wordpress/i18n';
import { Button, SelectControl, Spinner, TextControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

const EMPTY_CODE_EXAMPLE_CONTENT = `<!-- wp:wpe/intelligent-code-assistant -->
<div class="wp-block-wpe-intelligent-code-assistant task-block"><!-- wp:wpe/code-header -->
<div class="wp-block-wpe-code-header task-title"></div>
<!-- /wp:wpe/code-header -->

<!-- wp:wpe/code-content -->
<div class="wp-block-wpe-code-content"></div>
<!-- /wp:wpe/code-content --></div>
<!-- /wp:wpe/intelligent-code-assistant -->`;

export default function CodeExampleChooser({ onSelect }) {
    const [mode, setMode] = useState('create');
    const [selectedId, setSelectedId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
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

    const switchMode = (nextMode) => {
        setMode(nextMode);
        setError('');
    };

    const resolveCodeExample = async (id) => apiFetch({
        path: `/wp/v2/ica_code_example/${Number(id)}?context=edit`,
    });

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

            const resolvedRecord = await resolveCodeExample(record.id);
            onSelect(record.id, resolvedRecord);
        } catch (err) {
            setError(err?.message || __('The Code Example could not be created.', 'intelligent-code-assistant'));
        } finally {
            setIsCreating(false);
        }
    };

    const useExistingCodeExample = async () => {
        const id = Number(selectedId || 0);
        if (!id) {
            return;
        }

        setIsSelecting(true);
        setError('');

        try {
            const record = await resolveCodeExample(id);
            onSelect(id, record);
        } catch (err) {
            setError(err?.message || __('The Code Example could not be loaded.', 'intelligent-code-assistant'));
        } finally {
            setIsSelecting(false);
        }
    };

    return (
        <div className="ica-code-example-chooser">
            <div className="ica-code-example-chooser__intro">
                <h3>{__('Add a Code Example', 'intelligent-code-assistant')}</h3>
                <p>{__('Create a new example or reuse one you’ve already made.', 'intelligent-code-assistant')}</p>
            </div>

            <div className="ica-code-example-chooser__modes" role="group" aria-label={__('Choose how to add a Code Example', 'intelligent-code-assistant')}>
                <Button
                    className={`ica-code-example-chooser__mode ${mode === 'create' ? 'is-active' : ''}`}
                    variant={mode === 'create' ? 'primary' : 'secondary'}
                    onClick={() => switchMode('create')}
                    aria-pressed={mode === 'create'}
                >
                    <span className="ica-code-example-chooser__mode-title">{__('Create new', 'intelligent-code-assistant')}</span>
                    <span className="ica-code-example-chooser__mode-description">{__('Start from scratch', 'intelligent-code-assistant')}</span>
                </Button>
                <Button
                    className={`ica-code-example-chooser__mode ${mode === 'existing' ? 'is-active' : ''}`}
                    variant={mode === 'existing' ? 'primary' : 'secondary'}
                    onClick={() => switchMode('existing')}
                    aria-pressed={mode === 'existing'}
                >
                    <span className="ica-code-example-chooser__mode-title">{__('Use existing', 'intelligent-code-assistant')}</span>
                    <span className="ica-code-example-chooser__mode-description">{__('Reuse an example', 'intelligent-code-assistant')}</span>
                </Button>
            </div>

            <div className="ica-code-example-chooser__form">
                {mode === 'create' ? (
                    <>
                        <TextControl
                            label={__('Name', 'intelligent-code-assistant')}
                            value={newTitle}
                            onChange={setNewTitle}
                            placeholder={__('e.g. Register a REST Route', 'intelligent-code-assistant')}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && newTitle.trim() && !isCreating) {
                                    event.preventDefault();
                                    createCodeExample();
                                }
                            }}
                        />
                        <Button
                            variant="primary"
                            onClick={createCodeExample}
                            disabled={isCreating || !newTitle.trim()}
                            isBusy={isCreating}
                        >
                            {isCreating ? <Spinner /> : __('Create Code Example', 'intelligent-code-assistant')}
                        </Button>
                    </>
                ) : (
                    <>
                        <SelectControl
                            label={__('Code Example', 'intelligent-code-assistant')}
                            value={selectedId}
                            options={options}
                            onChange={setSelectedId}
                        />
                        <Button
                            variant="primary"
                            onClick={useExistingCodeExample}
                            disabled={!selectedId || isSelecting}
                            isBusy={isSelecting}
                        >
                            {isSelecting ? <Spinner /> : __('Use Code Example', 'intelligent-code-assistant')}
                        </Button>
                    </>
                )}
            </div>

            {error && <p className="ica-code-example-chooser__error" role="alert">{error}</p>}
        </div>
    );
}
