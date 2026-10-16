=== WP Intelligent Code Assistant ===
Contributors:      michael-bertram
Tags:              code, artificial intelligence, interactivity, developer tools, blocks
Stable tag:        1.1.0
License:           GPL-2.0-or-later
License URI:       https://www.gnu.org/licenses/gpl-2.0.html

Interactive Gutenberg code examples with contextual AI assistance and Reader Insights for technical content.

== Description ==

WP Intelligent Code Assistant keeps readers inside technical articles when they need help understanding a code example.

Code Examples can provide contextual reader tools including Explain Code, Explain Line, Ask about this code, and Check Your Understanding. WordPress supplies the surrounding code and tutorial context to the configured AI provider through the WordPress AI Client.

Reader interactions feed into Reader Insights so authors can see where readers request explanations, which lines attract attention, repeated questions, knowledge-check activity, and cross-article Code Example signals.

The plugin uses WordPress-native architecture including Gutenberg, the Interactivity API, the Abilities API, REST endpoints, and the WordPress AI Client.

== Installation ==

1. Upload the plugin to your WordPress plugins directory.
2. Install and configure the required WordPress AI provider/connector for your site.
3. Activate WP Intelligent Code Assistant.
4. Add an Intelligent Code Assistant block or referenced Code Example to an article.
5. Configure the code example and enable the reader assistance features you want to expose.

For development builds, run `npm install` followed by `npm run build`.

== Frequently Asked Questions ==

= Are AI provider credentials exposed to readers? =

No. Reader requests are sent to plugin-owned WordPress REST endpoints. Provider execution happens server-side through the WordPress AI Client.

= Do readers need to log in to use the assistant? =

No. Public reader assistance is designed to work for logged-out visitors. Public endpoints include validation and rate limiting before server-side AI execution.

= What can authors learn from Reader Insights? =

Reader Insights surfaces interaction counts, commonly explained lines, repeated questions, knowledge-check activity, article context, and aggregated Code Example analytics.

== Changelog ==

= 1.1.0 =
* Added contextual frontend AI assistance for code examples.
* Added public reader AI requests with server-side provider execution, validation, and rate limiting.
* Added Reader Insights for articles and reusable Code Examples.
* Added AI-generated editorial interpretation of Reader Insights.
* Added concept-level analytics across articles referencing the same Code Example.
* Added persistent canonical Code Example editing from article references.
* Added floating AI Assistant discoverability and contextual active-block highlighting.
* Refined Reader Insights dashboard, loading states, and frontend interaction feedback.
