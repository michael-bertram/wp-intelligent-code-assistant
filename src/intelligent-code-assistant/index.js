/**
 * Registers the Intelligent Code Assistant block.
 */
import { registerBlockType } from '@wordpress/blocks';

import './style.scss';
import './assistant/style.scss';
import './editor.scss';
import './article-ai-workspace';

import EditRouter from './EditRouter';
import Save from './save';
import metadata from './block.json';

registerBlockType(metadata.name, {
  edit: EditRouter,
  save: Save,
});
