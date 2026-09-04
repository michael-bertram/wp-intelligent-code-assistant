import { registerBlockType } from '@wordpress/blocks';
import Edit from './edit';
import Save from './save';

registerBlockType('wpe/code-header', {
  edit: Edit,
  save: Save,
});
