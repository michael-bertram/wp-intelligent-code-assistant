# WordPress Code Dropdown Block

A lightweight, performant WordPress block built using the **WordPress Interactivity API**. It allows you to display code snippets inside a collapsible accordion interface featuring an absolute line-number gutter, horizontal overflow scrolling, real-time metrics tracking, and automatic language syntax formatting


## Key Features

* **Interactive Collapsible Panel:** Leverages the native WordPress Interactivity API for high-performance frontend toggle animations.
* **Synchronized Line Numbers:** Absolute positioned left gutter track keeps line indices perfectly aligned 1-to-1 with code contents.
* **Horizontal Scroll Lock:** Employs explicit `white-space: pre` overflow formatting to stop code lines from wrapping incorrectly.
* **Telemetry Analytics Display:** Dynamically calculates total line heights and precise character counts on both backend and frontend environments.
* **Integrated Settings Protection:** Built-in attribute dependencies ensure layout configurations remain structured and collision-free.


## File Structure

<pre><code>
├── block.json          # Block configuration metadata and registration attributes
├── edit.js             # React component managing the backend administrative interface
├── render.php          # Server template outputting frontend Interactivity API markup
├── editor.scss         # Administration-specific styles (Forces workspace open for editing)
└── style.scss          # Global shared styles (Manages frontend accordion mechanics)
</code></pre>

## Asset Dependencies

To facilitate syntax highlighting on your public pages, ensure that **Prism.js** is enqueued via your main plugin file. You can add the following PHP function:

<pre><code>
function wpe_enqueue_code_block_assets() {
    if ( ! is_admin() ) {
        wp_enqueue_script( 'prism-js', '[https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js](https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js)', array(), '1.29.0', true );
        wp_enqueue_script( 'prism-autoloader', '[https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js](https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js)', array('prism-js'), '1.29.0', true );
        wp_enqueue_style( 'prism-theme', '[https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css](https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css)', array(), '1.29.0' );
    }
}
add_action( 'wp_enqueue_scripts', 'wpe_enqueue_code_block_assets' );
</code></pre>

## Configuration Attributes

| Attribute Name | Control Type | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `showLanguageBadge` | Toggle Switch | `Boolean` | `true` | Show or hide the active language pill. |
| `codeLanguage` | Select Menu | `String` | `'PHP'` | Maps active code language parameters (PHP, JS, CSS, HTML). |
| `isDarkMode` | Toggle Switch | `Boolean` | `false` | Switches between high-contrast light and dark workspace themes. |
| `isCompact` | Toggle Switch | `Boolean` | `false` | Minimizes structural row padding (overridden if line numbers are enabled). |
| `showLineNumbers` | Toggle Switch | `Boolean` | `false` | Displays sequential line-number rows on the left sidebar. |
| `maxHeight` | Select Menu | `String` | `'none'` | Bounds the code viewport (`none`, `250px`, `400px`, `600px`). |
| `fontSize` | Select Menu | `String` | `'14px'` | Scales block typography metrics proportionally. |


## Installation & Build

1. Clone or copy this directory into your custom WordPress plugins path (`/wp-content/plugins/wpe-intelligent-code-assistant`).
2. Install block compilation dependencies: `npm install`
3. Compile production-optimized style assets and block scripts: `npm run build`
4. Activate the plugin within your WordPress Admin Panel.
