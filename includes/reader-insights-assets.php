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
	$version = '1.2.5';
	wp_enqueue_style( 'intelligent-code-assistant-reader-insights-admin', plugin_dir_url( $plugin_file ) . 'assets/reader-insights-admin.css', array(), $version );
	wp_enqueue_style( 'intelligent-code-assistant-reader-insights-workspace', plugin_dir_url( $plugin_file ) . 'assets/reader-insights-workspace.css', array( 'intelligent-code-assistant-reader-insights-admin' ), $version );
	wp_enqueue_script( 'intelligent-code-assistant-reader-insights-admin', plugin_dir_url( $plugin_file ) . 'assets/reader-insights-admin.js', array(), $version, true );

	$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
	$is_code_example_screen = 'intelligent-code-assistant-code-examples' === $page;
	$code_example_id = $is_code_example_screen && isset( $_GET['code_example_id'] ) ? absint( wp_unslash( $_GET['code_example_id'] ) ) : 0;
	$post_id = ! $is_code_example_screen && isset( $_GET['post_id'] ) ? absint( wp_unslash( $_GET['post_id'] ) ) : 0;
	$is_code_example = $code_example_id > 0;
	$is_article = $post_id > 0;

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
