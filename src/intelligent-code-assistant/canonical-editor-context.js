import { createContext } from '@wordpress/element';

/**
 * Identifies a block being edited inside its canonical Code Snippet entity.
 * The entity ID lets generated assistance be persisted independently of the
 * embedding article's lightweight reference block.
 */
export const CanonicalCodeExampleContext = createContext({
    isCanonical: false,
    entityId: 0,
});
