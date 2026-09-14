<?php
/**
 * Shared presentation assets for semantic AI response formatting.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue semantic AI response formatting on the public site.
 */
add_action(
	'wp_enqueue_scripts',
	function () {
		$plugin_file = dirname( __DIR__ ) . '/intelligent-code-assistant.php';
		$version     = '1.1.0';

		wp_enqueue_style(
			'intelligent-code-assistant-ai-response-formatting',
			plugin_dir_url( $plugin_file ) . 'assets/ai-response-formatting.css',
			array(),
			$version
		);

		wp_enqueue_script(
			'intelligent-code-assistant-ai-response-formatting',
			plugin_dir_url( $plugin_file ) . 'assets/ai-response-formatting.js',
			array(),
			$version,
			true
		);
	}
);

/**
 * Reuse the same formatter inside the Reader Insights editorial screen.
 */
add_action(
	'admin_enqueue_scripts',
	function ( $hook_suffix ) {
		if ( 'toplevel_page_intelligent-code-assistant-reader-insights' !== $hook_suffix ) {
			return;
		}

		$plugin_file = dirname( __DIR__ ) . '/intelligent-code-assistant.php';
		$version     = '1.1.0';

		wp_enqueue_style(
			'intelligent-code-assistant-ai-response-formatting',
			plugin_dir_url( $plugin_file ) . 'assets/ai-response-formatting.css',
			array(),
			$version
		);

		wp_enqueue_script(
			'intelligent-code-assistant-ai-response-formatting',
			plugin_dir_url( $plugin_file ) . 'assets/ai-response-formatting.js',
			array(),
			$version,
			true
		);
	}
);
