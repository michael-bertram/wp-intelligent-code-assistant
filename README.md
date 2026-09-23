# WP Intelligent Code Assistant

WP Intelligent Code Assistant is an experimental WordPress plugin that turns technical code examples into contextual, AI-assisted learning experiences and turns reader interactions into useful editorial signals.

The project explores a WordPress-native approach to AI integration: WordPress owns the content, context, capabilities and deterministic data, while the configured AI connection is used for generation and interpretation. Readers can get help without leaving the tutorial or manually recreating its context in an external AI tool.

## What it does

### Reader-facing Code Assistant

Intelligent Code examples can expose four contextual AI tools:

- **Explain Code** — explains the active example in the context of the tutorial.
- **Explain This Line** — explains a selected line together with its surrounding code.
- **Ask about this code** — lets the reader ask their own question about the active example.
- **Check Your Understanding** — creates an in-context knowledge check.

A shared floating Code Assistant follows the reader's active code example rather than attaching a separate AI interface to every block. The active example and nearby tutorial content are supplied as context so the assistance can be grounded in what the reader is currently learning.

### Tutorial-aware context

The assistant does not send code in isolation. Shared context can include the active code, language, filename, example title, tutorial title, nearby teaching content and capability-specific information such as the selected line or reader question.

This keeps context construction in WordPress and allows the same AI abilities to be reused across multiple code examples.

### Reusable canonical Code Snippets

The plugin registers the `ica_code_example` custom post type as **Code Snippets**.

Each Code Snippet owns one canonical Intelligent Code block and its code/configuration. Article blocks can reference that canonical snippet through `codeExampleId` instead of storing stale copies.

This separates:

- **semantic identity** — which Code Snippet the reader is working with;
- **article context** — where and why the snippet is being taught;
- **rendered identity** — which particular block instance received the interaction.

A reference resolves the canonical content at render time while the article continues to provide its own tutorial context.

### Deterministic Reader Insights

WordPress records known reader actions before AI is asked to interpret them. The analytics model currently supports:

- `explain_code`
- `explain_line`
- `ask_question`
- `knowledge_check`
- `mark_complete`
- `copy_code`

Events retain useful context including the article, Code Snippet, rendered block, filename, language and event-specific metadata.

These figures represent **actions/interactions, not unique readers**.

The **Intelligent Code** admin workspace provides:

- **Overview** — entry point for Code Snippets and analytics.
- **Reader Insights** — article-level deterministic interaction data.
- **Code Snippet Insights** — activity for reusable snippets across the articles where they appear.
- **AI Editorial Insights** — AI interpretation of server-authoritative analytics to help authors investigate possible reader friction and opportunities to improve content.

Generated reader-facing AI responses are not the analytics source of truth. WordPress records what happened; deterministic code aggregates it; AI helps interpret what it might mean.

## WordPress-native AI architecture

The plugin is designed around WordPress rather than treating AI as a separate application:

- **Gutenberg** provides the authoring and reusable-content model.
- **Custom Post Types** give Code Snippets stable semantic identities.
- **Interactivity API** powers reader-facing interactions.
- **Abilities API** exposes reusable, structured capabilities.
- **WordPress AI Client / configured AI connection** handles AI generation without coupling the feature to a single provider.
- **Plugin REST endpoints** provide the application boundary for frontend requests.
- **WordPress analytics storage and aggregation** provide deterministic evidence before AI interpretation.

The plugin also registers AI-assisted metadata generation as a WordPress Ability and exposes appropriate abilities through WordPress's AI/Abilities architecture.

The key architectural principle is:

> **Use deterministic software for what can be known; use AI for what needs to be interpreted.**

That allows WordPress and AI to work together natively: WordPress supplies structured content, context and reliable application behaviour, while AI adds generation and interpretation where it is useful.

## Content loop

The project connects the reader and editorial experiences:

```text
Author creates structured WordPress content
                    ↓
             Reader engages
                    ↓
        AI provides contextual help
                    ↓
 WordPress records deterministic signals
                    ↓
        Analytics reveal patterns
                    ↓
         AI helps interpret them
                    ↓
       Author improves the content
                    ↺
```

The reader remains in control of when AI assistance is requested, and the author remains responsible for editorial decisions.

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

Production assets in `build/` are intentionally tracked. Rebuild and commit them whenever source assets change.

## Project status

This repository is an experimental exploration of native WordPress AI integration and intelligent technical content. It demonstrates how WordPress's existing content and application architecture can work hand in hand with AI without requiring the AI layer to own the underlying content model or analytics.

## License

GPL-2.0-or-later.
