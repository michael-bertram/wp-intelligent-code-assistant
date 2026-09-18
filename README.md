# WP Intelligent Code Assistant

WP Intelligent Code Assistant is a WordPress plugin for interactive technical code examples with contextual AI assistance and reader-behaviour insights.

Instead of requiring a reader to leave an article, copy code into an external AI tool, explain the surrounding context, and then return, the plugin brings assistance directly to the code example. The reader asks the question; WordPress supplies the context.

## Reader experience

Code Examples can expose four contextual tools:

- **Explain Code** — explains the example in its article/tutorial context.
- **Explain Line** — focuses assistance on selected code.
- **Ask about this code** — answers a reader's own question about the example.
- **Check Your Understanding** — provides an in-context knowledge check.

A floating AI Assistant follows the relevant Code Example as the reader moves through an article. The active example is subtly highlighted while its assistant is open, making the current AI context clear when several examples are close together.

## Reader Insights

Reader interactions become useful editorial signals rather than disappearing after the AI response. Reader Insights helps authors inspect article-level and reusable Code Example activity, including frequently explained lines, repeated questions, knowledge-check activity, interaction volume, and the articles in which a Code Example appears.

AI Editorial Insights can interpret those deterministic analytics to help authors identify areas that may benefit from clearer explanations or improved examples.

## WordPress-native AI architecture

The plugin is built around WordPress rather than treating AI as a separate application:

- Gutenberg provides the authoring experience and reusable Code Examples.
- The Interactivity API powers frontend interactions.
- The Abilities API exposes structured editor-side AI capabilities.
- The WordPress AI Client handles configured provider execution.
- Plugin-owned REST endpoints provide the hardened boundary for logged-out reader requests.

Public readers do not receive provider credentials. Anonymous requests are validated and rate-limited before server-side AI execution.

## Development

Install dependencies and compile the production assets:

```bash
npm install
npm run build
```

During development:

```bash
npm start
```

Production assets in `build/` are intentionally tracked and should be rebuilt and committed whenever source assets change.

## License

GPL-2.0-or-later.
