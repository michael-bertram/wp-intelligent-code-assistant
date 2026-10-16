import { useBlockProps, RichText } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { useSelect, useDispatch } from '@wordpress/data';
import { useEffect } from '@wordpress/element';

const GENERIC_FILENAMES = /^(?:snippet|script|index|functions?|style|styles|data|query|code|example)\.(?:php|js|css|html|json|sql|sh|bash)$/i;

const slugify = (value) => value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const normalizeCode = (code) => code
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');

const getExtension = (language) => ({
    PHP: 'php',
    JS: 'js',
    JavaScript: 'js',
    CSS: 'css',
    HTML: 'html',
    JSON: 'json',
    SQL: 'sql',
    Bash: 'sh',
}[language] || 'txt');

const deriveFilename = (rawCode, language) => {
    const code = normalizeCode(rawCode || '');
    const extension = getExtension(language);
    let match;

    if (language === 'PHP') {
        match = code.match(/wp_register_ability\s*\(\s*['"]([^'"]+)['"]/i);
        if (match) {
            const abilityName = match[1].split('/').pop();
            return `${slugify(abilityName) || 'ability'}.php`;
        }

        match = code.match(/\bfunction\s+([A-Za-z_]\w*)\s*\(/);
        if (match) return `${slugify(match[1])}.php`;

        match = code.match(/\bclass\s+([A-Za-z_]\w*)/);
        if (match) return `${slugify(match[1])}.php`;

        match = code.match(/\b(?:add_action|add_filter)\s*\(\s*['"]([^'"]+)['"]/);
        if (match) return `${slugify(match[1]) || 'wordpress-hook'}.php`;

        if (/register_block_type(?:_from_metadata)?\s*\(/.test(code)) return 'register-block.php';
    }

    if (language === 'JS' || language === 'JavaScript') {
        match = code.match(/\b(?:export\s+default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (match) return `${slugify(match[1])}.js`;

        match = code.match(/\bclass\s+([A-Za-z_$][\w$]*)/);
        if (match) return `${slugify(match[1])}.js`;

        match = code.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
        if (match) return `${slugify(match[1])}.js`;

        match = code.match(/customElements\.define\s*\(\s*['"]([^'"]+)['"]/);
        if (match) return `${slugify(match[1])}.js`;
    }

    if (language === 'HTML') {
        match = code.match(/\bid\s*=\s*['"]([^'"]+)['"]/i);
        if (match) return `${slugify(match[1])}.html`;

        match = code.match(/\bclass\s*=\s*['"]([^'"]+)['"]/i);
        if (match) {
            const firstClass = match[1].trim().split(/\s+/)[0];
            if (firstClass) return `${slugify(firstClass)}.html`;
        }

        match = code.match(/<\s*(main|nav|form|header|footer|section|article)\b/i);
        if (match) return `${slugify(match[1])}.html`;
    }

    if (language === 'CSS') {
        match = code.match(/(?:^|\n)\s*([.#][A-Za-z][\w-]*)\s*(?:,|\{)/);
        if (match) return `${slugify(match[1].slice(1))}.css`;
    }

    if (language === 'JSON') {
        try {
            const parsed = JSON.parse(code);
            if (parsed && typeof parsed === 'object') {
                if ('apiVersion' in parsed && 'name' in parsed) return 'block.json';
                if ('scripts' in parsed && 'dependencies' in parsed) return 'package.json';
                if (typeof parsed.name === 'string' && parsed.name) {
                    return `${slugify(parsed.name)}.json`;
                }
            }
        } catch (error) {
            // Fall through to a neutral JSON filename.
        }
    }

    if (language === 'SQL') {
        match = code.match(/\b(?:FROM|INTO|UPDATE|TABLE)\s+[`"']?([A-Za-z_][\w-]*)/i);
        if (match) return `${slugify(match[1])}.sql`;
    }

    if (language === 'Bash') {
        match = code.match(/\b(?:npm|npx|wp|composer)\s+([A-Za-z][\w-]*)/);
        if (match) return `${slugify(match[1])}.sh`;
    }

    return `code-example.${extension}`;
};

export default function Edit({ attributes, setAttributes, clientId }) {
    const { updateBlockAttributes } = useDispatch('core/block-editor');

    const { parentId, filename, codeLanguage, code } = useSelect((select) => {
        const { getBlockParents, getBlockAttributes, getBlock } = select('core/block-editor');
        const parents = getBlockParents(clientId);
        const directParentId = parents.length ? parents[parents.length - 1] : null;
        const parentAttributes = directParentId ? getBlockAttributes(directParentId) : null;
        const parentBlock = directParentId ? getBlock(directParentId) : null;
        const codeBlock = parentBlock?.innerBlocks?.find((block) => block.name === 'wpe/code-content');
        const rawCode = codeBlock?.attributes?.code || codeBlock?.attributes?.content || codeBlock?.attributes?.value || '';

        return {
            parentId: directParentId,
            filename: parentAttributes?.filename || '',
            codeLanguage: parentAttributes?.codeLanguage || '',
            code: rawCode,
        };
    }, [clientId]);

    useEffect(() => {
        if (!parentId || !filename || !code) return;

        const expectedExtension = getExtension(codeLanguage);
        const filenameExtension = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
        const hasWrongExtension = expectedExtension !== 'txt' && filenameExtension !== expectedExtension;
        const isGenericFilename = GENERIC_FILENAMES.test(filename);

        if (isGenericFilename || hasWrongExtension) {
            const derivedFilename = deriveFilename(code, codeLanguage);

            if (derivedFilename && derivedFilename !== filename) {
                updateBlockAttributes(parentId, { filename: derivedFilename });
                setAttributes({ content: derivedFilename });
                return;
            }
        }

        if (filename !== attributes.content) {
            setAttributes({ content: filename });
        }
    }, [
        parentId,
        filename,
        codeLanguage,
        code,
        attributes.content,
        setAttributes,
        updateBlockAttributes,
    ]);

    const blockProps = useBlockProps({
        className: 'task-title'
    });

    const handleFilenameChange = (value) => {
        if (parentId) {
            updateBlockAttributes(parentId, { filename: value });
        }

        setAttributes({ content: value });
    };

    return (
        <div {...blockProps}>
            <RichText
                tagName="div"
                value={filename || attributes.content || ''}
                onChange={handleFilenameChange}
                placeholder={__('Add Filename...', 'intelligent-code-assistant')}
                allowedFormats={[]}
                style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1e293b' }}
            />
        </div>
    );
}
