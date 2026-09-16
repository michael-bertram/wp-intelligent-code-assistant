<?php
/**
 * Code Example content type.
 *
 * Gives reusable code examples a stable semantic identity that can later be
 * linked to Intelligent Code Assistant blocks and analytics events.
 *
 * @package IntelligentCodeAssistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the Code Example custom post type.
 */
function intelligent_code_assistant_register_code_example_post_type() {
	$labels = array(
		'name'                  => __( 'Code Examples', 'intelligent-code-assistant' ),
		'singular_name'         => __( 'Code Example', 'intelligent-code-assistant' ),
		'menu_name'             => __( 'Code Examples', 'intelligent-code-assistant' ),
		'name_admin_bar'        => __( 'Code Example', 'intelligent-code-assistant' ),
		'add_new'               => __( 'Add New', 'intelligent-code-assistant' ),
		'add_new_item'          => __( 'Add New Code Example', 'intelligent-code-assistant' ),
		'new_item'              => __( 'New Code Example', 'intelligent-code-assistant' ),
		'edit_item'             => __( 'Edit Code Example', 'intelligent-code-assistant' ),
		'view_item'             => __( 'View Code Example', 'intelligent-code-assistant' ),
		'all_items'             => __( 'All Code Examples', 'intelligent-code-assistant' ),
		'search_items'          => __( 'Search Code Examples', 'intelligent-code-assistant' ),
		'not_found'             => __( 'No code examples found.', 'intelligent-code-assistant' ),
		'not_found_in_trash'    => __( 'No code examples found in Trash.', 'intelligent-code-assistant' ),
		'item_published'        => __( 'Code example published.', 'intelligent-code-assistant' ),
		'item_updated'          => __( 'Code example updated.', 'intelligent-code-assistant' ),
	);

	register_post_type(
		'ica_code_example',
		array(
			'labels'              => $labels,
			'public'              => false,
			'publicly_queryable'  => false,
			'show_ui'             => true,
			'show_in_menu'        => true,
			'show_in_admin_bar'   => true,
			'show_in_rest'        => true,
			'exclude_from_search' => true,
			'has_archive'         => false,
			'rewrite'             => false,
			'menu_icon'           => 'dashicons-editor-code',
			'supports'            => array( 'title', 'editor', 'revisions' ),
			'capability_type'     => 'post',
			'map_meta_cap'        => true,
		)
	);
}
add_action( 'init', 'intelligent_code_assistant_register_code_example_post_type' );

/**
 * Register structured metadata used by code examples and future analytics.
 */
function intelligent_code_assistant_register_code_example_meta() {
	$auth_callback = static function() {
		return current_user_can( 'edit_posts' );
	};

	register_post_meta(
		'ica_code_example',
		'_ica_code_language',
		array(
			'type'              => 'string',
			'single'            => true,
			'show_in_rest'      => true,
			'sanitize_callback' => 'sanitize_text_field',
			'auth_callback'     => $auth_callback,
			'default'           => '',
		)
	);

	register_post_meta(
		'ica_code_example',
		'_ica_code_filename',
		array(
			'type'              => 'string',
			'single'            => true,
			'show_in_rest'      => true,
			'sanitize_callback' => 'sanitize_file_name',
			'auth_callback'     => $auth_callback,
			'default'           => '',
		)
	);
}
add_action( 'init', 'intelligent_code_assistant_register_code_example_meta' );
