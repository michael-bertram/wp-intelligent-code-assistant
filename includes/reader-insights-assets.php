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
				'i18n'     => array(
					'generate'   => __( 'Generate AI insights', 'intelligent-code-assistant' ),
					'regenerate' => __( 'Regenerate insights', 'intelligent-code-assistant' ),
					'generating' => __( 'Generating insights…', 'intelligent-code-assistant' ),
					'error'      => __( 'Unable to generate AI insights. Please try again.', 'intelligent-code-assistant' ),
				),
			)
		);
	}
);
