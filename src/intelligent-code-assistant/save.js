import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';

export default function Save({ attributes }) {
  // A linked article block is a semantic reference only. Its editable mirror is
  // populated from the Code Example entity in the editor and must not become a
  // second persisted copy of the canonical code. render_block_data resolves the
  // reference back to the canonical block on the front end.
  if (Number(attributes?.codeExampleId || 0) > 0) {
    return null;
  }

  // Legacy/standalone blocks keep their existing saved inner-block structure.
  return (
    <div {...useBlockProps.save({ className: 'task-block' })}>
      <InnerBlocks.Content />
    </div>
  );
}
