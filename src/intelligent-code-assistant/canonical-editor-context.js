import { createContext } from '@wordpress/element';

/**
 * Marks an Intelligent Code Assistant block as being edited through the
 * canonical Code Example entity rather than as an article reference.
 */
export const CanonicalCodeExampleContext = createContext(false);
