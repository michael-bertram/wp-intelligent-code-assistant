/**
 * Registers the Intelligent Code Assistant block.
 */
import { registerBlockType } from '@wordpress/blocks';

/**
 * Lets webpack process CSS, SASS or SCSS files referenced in JavaScript files.
 * Files imported from style.scss are bundled into the block's frontend stylesheet.
 *
 * @see https://www.npmjs.com/package/@wordpress/scripts#using-css
 */
import './style.scss';
import './assistant/style.scss';
import './editor.scss';
import './article-ai-workspace';

import EditRouter from './EditRouter';
import Save from './save';
import metadata from './block.json';

import { InnerBlocks } from '@wordpress/block-editor';

/**
 * Every block starts by registering a block type definition.
 *
 * @see ./edit.js
 */
registerBlockType(metadata.name, {
  edit: EditRouter,
  save: Save,
});
