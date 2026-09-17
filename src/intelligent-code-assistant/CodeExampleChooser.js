import { __ } from '@wordpress/i18n';
import { Button, Spinner, TextControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useMemo, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import './code-example-browser.scss';

const EMPTY_CODE_EXAMPLE_CONTENT = `<!-- wp:wpe/intelligent-code-assistant -->
<div class="wp-block-wpe-intelligent-code-assistant task-block"><!-- wp:wpe/code-header -->
<div class="wp-block-wpe-code-header task-title"></div>
<!-- /wp:wpe/code-header -->

<!-- wp:wpe/code-content -->
<div class="wp-block-wpe-code-content"></div>
<!-- /wp:wpe/code-content --></div>
<!-- /wp:wpe/intelligent-code-assistant -->`;

const decodeTitle = (value = '') => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
};

export default function CodeExampleChooser({ onSelect }) {
    const [mode, setMode] = useState('create');
    const [searchTerm, setSearchTerm] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [selectingId, setSelectingId] = useState(0);
    const [error, setError] = useState('');

    const { codeExamples, isLoadingExamples } = useSelect((select) => {
        const core = select('core');
        const query = {
            per_page: 100,
            orderby: 'title',
            order: 'asc',
            status: ['publish', 'draft', 'pending', 'private'],
        };

        return {
            codeExamples: core.getEntityRecords('postType', 'ica_code_example', query) || [],
            isLoadingExamples: core.isResolving('getEntityRecords', ['postType', 'ica_code_example', query]),
        };
    }, []);

    const { saveEntityRecord } = useDispatch('core');

    const filteredExamples = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        if (!search) {
            return codeExamples;
        }

        return codeExamples.filter((example) => {
            const title = decodeTitle(example.title?.rendered || '').toLowerCase();
            const language = String(example.meta?._ica_code_language || '').toLowerCase();
            const filename = String(example.meta?._ica_code_filename || '').toLowerCase();
            return title.includes(search) || language.includes(search) || filename.includes(search);
        });
    }, [codeExamples, searchTerm]);

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

    const useExistingCodeExample = async (id) => {
        const exampleId = Number(id || 0);
        if (!exampleId || selectingId) {
            return;
        }

        setSelectingId(exampleId);
        setError('');

        try {
            const record = await resolveCodeExample(exampleId);
            onSelect(exampleId, record);
        } catch (err) {
            setError(err?.message || __('The Code Example could not be loaded.', 'intelligent-code-assistant'));
        } finally {
            setSelectingId(0);
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
                    <span className="ica-code-example-chooser__mode-description">{__('Search your library', 'intelligent-code-assistant')}</span>
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
                    <div className="ica-code-example-browser">
                        <TextControl
                            label={__('Search Code Examples', 'intelligent-code-assistant')}
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder={__('Search by name, filename or language…', 'intelligent-code-assistant')}
                        />

                        <div className="ica-code-example-browser__results" role="list" aria-label={__('Available Code Examples', 'intelligent-code-assistant')}>
                            {isLoadingExamples && !codeExamples.length ? (
                                <div className="ica-code-example-browser__empty"><Spinner /></div>
                            ) : filteredExamples.length ? (
                                filteredExamples.map((example) => {
                                    const title = decodeTitle(example.title?.rendered || '') || `${__('Code Example', 'intelligent-code-assistant')} #${example.id}`;
                                    const language = example.meta?._ica_code_language || '';
                                    const filename = example.meta?._ica_code_filename || '';
                                    const isSelecting = selectingId === Number(example.id);

                                    return (
                                        <Button
                                            key={example.id}
                                            className="ica-code-example-browser__item"
                                            onClick={() => useExistingCodeExample(example.id)}
                                            disabled={Boolean(selectingId)}
                                            role="listitem"
                                        >
                                            <span className="ica-code-example-browser__item-copy">
                                                <span className="ica-code-example-browser__title">{title}</span>
                                                <span className="ica-code-example-browser__meta">
                                                    {[language, filename].filter(Boolean).join(' · ') || __('Code Example', 'intelligent-code-assistant')}
                                                </span>
                                            </span>
                                            <span className="ica-code-example-browser__action" aria-hidden="true">
                                                {isSelecting ? <Spinner /> : __('Use', 'intelligent-code-assistant')}
                                            </span>
                                        </Button>
                                    );
                                })
                            ) : (
                                <p className="ica-code-example-browser__empty">
                                    {searchTerm.trim()
                                        ? __('No Code Examples match your search.', 'intelligent-code-assistant')
                                        : __('No Code Examples are available yet.', 'intelligent-code-assistant')}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {error && <p className="ica-code-example-chooser__error" role="alert">{error}</p>}
        </div>
    );
}
