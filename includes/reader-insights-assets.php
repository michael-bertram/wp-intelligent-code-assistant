<?php
/** Admin assets for the Reader Insights editorial workspace. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'admin_enqueue_scripts', function ( $hook_suffix ) {
	$allowed = array(
		'toplevel_page_intelligent-code-assistant-reader-insights',
		'reader-insights_page_intelligent-code-assistant-code-examples',
	);
	if ( ! in_array( $hook_suffix, $allowed, true ) ) { return; }

	$plugin_file = dirname( __DIR__ ) . '/intelligent-code-assistant.php';
	$version = '1.2.3';
	wp_enqueue_style( 'intelligent-code-assistant-reader-insights-admin', plugin_dir_url( $plugin_file ) . 'assets/reader-insights-admin.css', array(), $version );
	wp_enqueue_script( 'intelligent-code-assistant-reader-insights-admin', plugin_dir_url( $plugin_file ) . 'assets/reader-insights-admin.js', array(), $version, true );

	$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
	$is_code_example_screen = 'intelligent-code-assistant-code-examples' === $page;
	$code_example_id = $is_code_example_screen && isset( $_GET['code_example_id'] ) ? absint( wp_unslash( $_GET['code_example_id'] ) ) : 0;
	$post_id = ! $is_code_example_screen && isset( $_GET['post_id'] ) ? absint( wp_unslash( $_GET['post_id'] ) ) : 0;
	$is_code_example = $code_example_id > 0;
	$is_article = $post_id > 0;

	/*
	 * The main Reader Insights stylesheet predates the Code Example submenu and
	 * is scoped to the top-level admin body class. Mirror that visual language on
	 * the concept-level screen without creating a second design system.
	 */
	if ( $is_code_example_screen ) {
		wp_add_inline_style(
			'intelligent-code-assistant-reader-insights-admin',
			'body.reader-insights_page_intelligent-code-assistant-code-examples{background:#f8fafc}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .wrap{max-width:1240px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1e293b}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .wrap>h1{font-size:28px;font-weight:700;letter-spacing:-.02em;color:#0f172a;margin-bottom:6px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .description{color:#64748b!important;font-size:14px;line-height:1.6;max-width:760px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples h2{color:#0f172a;font-size:16px;font-weight:700}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .widefat{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,.04),0 2px 4px -1px rgba(0,0,0,.02);background:#fff}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .widefat thead th{background:#f8fafc;color:#475569;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #e2e8f0}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .widefat td,body.reader-insights_page_intelligent-code-assistant-code-examples .widefat th{padding:12px 14px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .widefat.striped>tbody>:nth-child(odd){background:#fbfdff}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .button{border-radius:6px;font-weight:600;min-height:36px;padding:4px 12px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .button-primary{background:#0f172a;border-color:#0f172a;color:#fff}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .button-primary:hover,body.reader-insights_page_intelligent-code-assistant-code-examples .button-primary:focus{background:#343d4a;border-color:#343d4a}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples a{color:#2563eb}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples a:hover{color:#1d4ed8}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .wrap>div[style*="display:grid"][style*="minmax(160px"]>div{background:#fff!important;border:1px solid #e2e8f0!important;border-radius:8px!important;padding:18px!important;box-shadow:0 4px 6px -1px rgba(0,0,0,.04),0 2px 4px -1px rgba(0,0,0,.02)!important}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .wrap>div[style*="display:grid"][style*="minmax(160px"]>div strong{color:#0f172a;line-height:1.2;margin-bottom:5px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-panel{margin-top:32px!important;padding:22px!important;background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:8px!important;box-shadow:0 4px 6px -1px rgba(0,0,0,.04)!important;max-width:1160px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-panel-header{display:flex;align-items:center;justify-content:space-between;gap:24px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-panel-copy{min-width:0;max-width:780px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-panel h2{display:flex;align-items:center;gap:8px;margin:0 0 6px;color:#2563eb;text-transform:uppercase;letter-spacing:.05em;font-size:12px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-panel h2:before{content:"✦";font-size:14px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-panel-copy p{margin:0;color:#64748b;line-height:1.6}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-generate-insights{flex:0 0 auto;white-space:nowrap}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-results{margin-top:20px;display:grid;gap:16px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-summary,body.reader-insights_page_intelligent-code-assistant-code-examples .ica-insight-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-summary{border-left:4px solid #2563eb;color:#334155;line-height:1.65}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-insight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-insight-card h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#475569}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-insight-card ul{list-style:disc outside;margin:0;padding-left:24px}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-insight-card li{display:list-item;margin:0 0 12px;padding-left:2px;color:#334155;line-height:1.5}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-insight-card li:last-child{margin-bottom:0}' .
			'body.reader-insights_page_intelligent-code-assistant-code-examples .ica-insight-card li::marker{color:#64748b}' .
			'@media(max-width:782px){body.reader-insights_page_intelligent-code-assistant-code-examples .wrap{padding-right:10px}body.reader-insights_page_intelligent-code-assistant-code-examples .widefat{display:block;overflow-x:auto}body.reader-insights_page_intelligent-code-assistant-code-examples .ica-ai-panel-header{align-items:flex-start;flex-direction:column}body.reader-insights_page_intelligent-code-assistant-code-examples .ica-generate-insights{width:100%}}'
		);
	}

	wp_localize_script( 'intelligent-code-assistant-reader-insights-admin', 'ICAReaderInsights', array(
		'mode' => $is_code_example ? 'codeExample' : ( $is_article ? 'article' : 'overview' ),
		'postId' => $post_id,
		'codeExampleId' => $code_example_id,
		'endpoint' => $is_code_example
			? rest_url( 'intelligent-code-assistant/v1/analyze-code-example-insights' )
			: ( $is_article ? rest_url( 'intelligent-code-assistant/v1/analyze-reader-insights' ) : '' ),
		'nonce' => wp_create_nonce( 'wp_rest' ),
		'i18n' => array(
			'generate' => __( 'Generate AI insights', 'intelligent-code-assistant' ),
			'regenerate' => __( 'Regenerate insights', 'intelligent-code-assistant' ),
			'generating' => __( 'Generating insights…', 'intelligent-code-assistant' ),
			'generatedArticle' => __( 'Generated from current article analytics', 'intelligent-code-assistant' ),
			'generatedCodeExample' => __( 'Generated from current Code Example analytics', 'intelligent-code-assistant' ),
			'error' => __( 'AI insights are currently unavailable. Please try again later.', 'intelligent-code-assistant' ),
			'introArticle' => __( 'Interpret the deterministic analytics for this article. Suggestions are evidence-based and remain for the author to review.', 'intelligent-code-assistant' ),
			'introCodeExample' => __( 'Interpret the deterministic analytics for this Code Example across every article where it appears. Suggestions are evidence-based and remain for the author to review.', 'intelligent-code-assistant' ),
			'frictionPoints' => __( 'Potential friction points', 'intelligent-code-assistant' ),
			'recommendations' => __( 'Recommendations', 'intelligent-code-assistant' ),
			'suggestedFaqs' => __( 'Suggested FAQs', 'intelligent-code-assistant' ),
		),
	) );
} );
