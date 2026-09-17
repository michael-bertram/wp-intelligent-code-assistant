import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';

export default function Save({ attributes }) {
  // A linked article block persists only its normal outer block markup. The
  // editor may temporarily mirror canonical inner blocks for authoring, but
  // those children are intentionally omitted here so the article does not own
  // a stale second copy of the Code Example. Keeping the wrapper preserves the
  // markup shape expected by existing article blocks and avoids validation
  // errors when upgrading from the previous save implementation.
  if (Number(attributes?.codeExampleId || 0) > 0) {
    return (
      <div {...useBlockProps.save({ className: 'task-block' })} />
    );
  }

  // Legacy/standalone blocks keep their existing saved inner-block structure.
  return (
    <div {...useBlockProps.save({ className: 'task-block' })}>
      <InnerBlocks.Content />
    </div>
  );
}
