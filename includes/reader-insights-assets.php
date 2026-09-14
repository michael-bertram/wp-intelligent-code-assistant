<?php
/**
 * Admin assets for the Reader Insights editorial workspace.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'admin_enqueue_scripts',
	function ( $hook_suffix ) {
		if ( 'toplevel_page_intelligent-code-assistant-reader-insights' !== $hook_suffix ) {
			return;
		}

		$plugin_file = dirname( __DIR__ ) . '/intelligent-code-assistant.php';
		$version     = '1.1.0';
		$diagnostic_token = function_exists( 'intelligent_code_assistant_create_ai_diagnostic_token' )
			? intelligent_code_assistant_create_ai_diagnostic_token()
			: '';

		wp_enqueue_style(
			'intelligent-code-assistant-reader-insights-admin',
			plugin_dir_url( $plugin_file ) . 'assets/reader-insights-admin.css',
			array(),
			$version
		);

		wp_enqueue_script(
			'intelligent-code-assistant-reader-insights-admin',
			plugin_dir_url( $plugin_file ) . 'assets/reader-insights-admin.js',
			array(),
			$version,
			true
		);

		wp_localize_script(
			'intelligent-code-assistant-reader-insights-admin',
			'ICAReaderInsights',
			array(
				'postId'   => isset( $_GET['post_id'] ) ? absint( wp_unslash( $_GET['post_id'] ) ) : 0,
				'endpoint' => rest_url( 'intelligent-code-assistant/v1/analyze-reader-insights' ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'diagnostics' => array(
					'adminEndpoint'     => rest_url( 'intelligent-code-assistant/v1/ai-diagnostics/admin' ),
					'anonymousEndpoint' => rest_url( 'intelligent-code-assistant/v1/ai-diagnostics/anonymous' ),
					'token'             => $diagnostic_token,
				),
				'i18n'     => array(
					'generate'       => __( 'Generate AI insights', 'intelligent-code-assistant' ),
					'regenerate'     => __( 'Regenerate insights', 'intelligent-code-assistant' ),
					'generating'     => __( 'Generating insights…', 'intelligent-code-assistant' ),
					'generated'      => __( 'Generated from current analytics', 'intelligent-code-assistant' ),
					'error'          => __( 'AI insights are currently unavailable. Please try again later.', 'intelligent-code-assistant' ),
					'intro'          => __( 'Use the deterministic reader data above as context for an AI-assisted editorial interpretation. The suggestions remain evidence-based and are for the author to review.', 'intelligent-code-assistant' ),
					'frictionPoints' => __( 'Potential friction points', 'intelligent-code-assistant' ),
					'recommendations'=> __( 'Recommendations', 'intelligent-code-assistant' ),
					'suggestedFaqs'  => __( 'Suggested FAQs', 'intelligent-code-assistant' ),
					'diagnosticsTitle' => __( 'Temporary AI Diagnostics', 'intelligent-code-assistant' ),
					'diagnosticsIntro' => __( 'Compares the authenticated admin request with a deliberately anonymous request. No API keys, tokens, Authorization headers, generated content, or raw provider messages are shown.', 'intelligent-code-assistant' ),
					'runDiagnostics' => __( 'Run diagnostics', 'intelligent-code-assistant' ),
					'runningDiagnostics' => __( 'Running diagnostics…', 'intelligent-code-assistant' ),
					'adminContext' => __( 'Authenticated admin request', 'intelligent-code-assistant' ),
					'anonymousContext' => __( 'Anonymous frontend-style request', 'intelligent-code-assistant' ),
					'diagnosticsFailed' => __( 'Diagnostics could not be completed.', 'intelligent-code-assistant' ),
				),
			)
		);
	}
);
