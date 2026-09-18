<?php
/**
 * Code Example content type and analytics identity support.
 *
 * @package IntelligentCodeAssistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Register the Code Example custom post type. */
function intelligent_code_assistant_register_code_example_post_type() {
	$labels = array(
		'name'               => __( 'Code Examples', 'intelligent-code-assistant' ),
		'singular_name'      => __( 'Code Example', 'intelligent-code-assistant' ),
		'menu_name'          => __( 'Code Examples', 'intelligent-code-assistant' ),
		'name_admin_bar'     => __( 'Code Example', 'intelligent-code-assistant' ),
		'add_new'            => __( 'Add New', 'intelligent-code-assistant' ),
		'add_new_item'       => __( 'Add New Code Example', 'intelligent-code-assistant' ),
		'new_item'           => __( 'New Code Example', 'intelligent-code-assistant' ),
		'edit_item'          => __( 'Edit Code Example', 'intelligent-code-assistant' ),
		'view_item'          => __( 'View Code Example', 'intelligent-code-assistant' ),
		'all_items'          => __( 'All Code Examples', 'intelligent-code-assistant' ),
		'search_items'       => __( 'Search Code Examples', 'intelligent-code-assistant' ),
		'not_found'          => __( 'No code examples found.', 'intelligent-code-assistant' ),
		'not_found_in_trash' => __( 'No code examples found in Trash.', 'intelligent-code-assistant' ),
		'item_published'     => __( 'Code example published.', 'intelligent-code-assistant' ),
		'item_updated'       => __( 'Code example updated.', 'intelligent-code-assistant' ),
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
			'template'            => array(
				array(
					'wpe/intelligent-code-assistant',
					array(),
					array(
						array( 'wpe/code-header' ),
						array( 'wpe/code-content' ),
					),
				),
			),
			'template_lock'       => 'all',
		)
	);
}
add_action( 'init', 'intelligent_code_assistant_register_code_example_post_type' );

/** Register structured Code Example metadata. */
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

/**
 * Keep the canonical block inside a Code Example aware of its owning post.
 *
 * @param int     $post_id Post ID.
 * @param WP_Post $post    Post object.
 * @param bool    $update  Whether this is an update.
 */
function intelligent_code_assistant_bind_canonical_code_example_block( $post_id, $post, $update ) {
	if ( 'ica_code_example' !== $post->post_type || wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
		return;
	}

	$blocks = parse_blocks( $post->post_content );
	if ( 1 !== count( $blocks ) || 'wpe/intelligent-code-assistant' !== ( $blocks[0]['blockName'] ?? '' ) ) {
		return;
	}

	$current_id = absint( $blocks[0]['attrs']['codeExampleId'] ?? 0 );
	if ( $post_id === $current_id ) {
		return;
	}

	$blocks[0]['attrs']['codeExampleId'] = $post_id;
	$content                             = serialize_blocks( $blocks );

	remove_action( 'save_post_ica_code_example', 'intelligent_code_assistant_bind_canonical_code_example_block', 10 );
	wp_update_post(
		array(
			'ID'           => $post_id,
			'post_content' => $content,
		)
	);
	add_action( 'save_post_ica_code_example', 'intelligent_code_assistant_bind_canonical_code_example_block', 10, 3 );
}
add_action( 'save_post_ica_code_example', 'intelligent_code_assistant_bind_canonical_code_example_block', 10, 3 );

/**
 * Find the canonical Intelligent Code Assistant block for a Code Example.
 *
 * @param int $code_example_id Code Example post ID.
 * @return array|null Parsed canonical block, or null when unavailable.
 */
function intelligent_code_assistant_get_canonical_block( $code_example_id ) {
	$code_example = get_post( $code_example_id );
	if ( ! $code_example || 'ica_code_example' !== $code_example->post_type ) {
		return null;
	}

	foreach ( parse_blocks( $code_example->post_content ) as $candidate ) {
		if ( 'wpe/intelligent-code-assistant' === ( $candidate['blockName'] ?? '' ) ) {
			return $candidate;
		}
	}

	return null;
}

/**
 * Resolve an article reference to the canonical Code Example before rendering.
 *
 * The Code Example owns code/configuration and inner blocks. The embedding
 * article keeps only instance-specific context and its semantic relationship.
 * This means the normal render.php receives the same structure it would receive
 * if the canonical block had been placed directly in the article.
 *
 * @param array $parsed_block Parsed block data.
 * @return array
 */
function intelligent_code_assistant_resolve_code_example_reference( $parsed_block ) {
	if ( 'wpe/intelligent-code-assistant' !== ( $parsed_block['blockName'] ?? '' ) ) {
		return $parsed_block;
	}

	$code_example_id = absint( $parsed_block['attrs']['codeExampleId'] ?? 0 );
	if ( ! $code_example_id ) {
		return $parsed_block;
	}

	$current_post_id = get_the_ID();
	if ( $current_post_id === $code_example_id && 'ica_code_example' === get_post_type( $current_post_id ) ) {
		return $parsed_block;
	}

	$canonical = intelligent_code_assistant_get_canonical_block( $code_example_id );
	if ( ! $canonical ) {
		return $parsed_block;
	}

	$instance_attributes = $parsed_block['attrs'] ?? array();
	$canonical_attrs      = $canonical['attrs'] ?? array();

	// These values belong to the article instance rather than the canonical code.
	foreach ( array( 'id', 'tutorialContextOverride' ) as $instance_key ) {
		if ( array_key_exists( $instance_key, $instance_attributes ) ) {
			$canonical_attrs[ $instance_key ] = $instance_attributes[ $instance_key ];
		}
	}

	$canonical_attrs['codeExampleId'] = $code_example_id;

	$parsed_block['attrs']        = $canonical_attrs;
	$parsed_block['innerBlocks']  = $canonical['innerBlocks'] ?? array();
	$parsed_block['innerHTML']    = $canonical['innerHTML'] ?? '';
	$parsed_block['innerContent'] = $canonical['innerContent'] ?? array();

	return $parsed_block;
}
add_filter( 'render_block_data', 'intelligent_code_assistant_resolve_code_example_reference', 10, 1 );

/**
 * Upgrade the analytics table with a stable Code Example relationship.
 *
 * dbDelta keeps this safe for existing installations as well as fresh ones.
 */
function intelligent_code_assistant_upgrade_code_example_analytics_schema() {
	global $wpdb;

	$schema_version = '1.1';
	if ( get_option( 'ica_analytics_schema_version' ) === $schema_version ) {
		return;
	}

	$table_name      = $wpdb->prefix . 'ica_analytics';
	$charset_collate = $wpdb->get_charset_collate();

	$sql = "CREATE TABLE {$table_name} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		post_id bigint(20) unsigned NOT NULL DEFAULT 0,
		code_example_id bigint(20) unsigned NOT NULL DEFAULT 0,
		block_id varchar(191) NOT NULL DEFAULT '',
		event_type varchar(50) NOT NULL DEFAULT '',
		filename varchar(191) NOT NULL DEFAULT '',
		language varchar(50) NOT NULL DEFAULT '',
		metadata longtext NULL,
		created_at datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY post_id (post_id),
		KEY code_example_id (code_example_id),
		KEY block_id (block_id),
		KEY event_type (event_type),
		KEY created_at (created_at)
	) {$charset_collate};";

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta( $sql );
	update_option( 'ica_analytics_schema_version', $schema_version, false );
}
add_action( 'init', 'intelligent_code_assistant_upgrade_code_example_analytics_schema', 20 );

/**
 * Record an analytics event including its optional Code Example identity.
 *
 * @param WP_REST_Request $request Request object.
 * @return WP_REST_Response|WP_Error
 */
function intelligent_code_assistant_record_code_example_analytics_event( WP_REST_Request $request ) {
	global $wpdb;

	$table_name      = $wpdb->prefix . 'ica_analytics';
	$event_type      = sanitize_key( $request->get_param( 'event' ) );
	$block_id        = sanitize_text_field( $request->get_param( 'blockId' ) );
	$post_id         = absint( $request->get_param( 'postId' ) );
	$code_example_id = absint( $request->get_param( 'codeExampleId' ) );
	$filename        = sanitize_file_name( $request->get_param( 'filename' ) );
	$language        = sanitize_text_field( $request->get_param( 'language' ) );
	$metadata        = $request->get_param( 'metadata' );

	$allowed_events = array(
		'explain_code',
		'explain_line',
		'ask_question',
		'knowledge_check',
		'mark_complete',
		'copy_code',
	);

	if ( ! in_array( $event_type, $allowed_events, true ) ) {
		return new WP_Error( 'invalid_analytics_event', __( 'Invalid analytics event.', 'intelligent-code-assistant' ), array( 'status' => 400 ) );
	}

	if ( $code_example_id > 0 && 'ica_code_example' !== get_post_type( $code_example_id ) ) {
		return new WP_Error( 'invalid_code_example', __( 'Invalid code example.', 'intelligent-code-assistant' ), array( 'status' => 400 ) );
	}

	$inserted = $wpdb->insert(
		$table_name,
		array(
			'post_id'         => $post_id,
			'code_example_id' => $code_example_id,
			'block_id'        => $block_id,
			'event_type'      => $event_type,
			'filename'        => $filename,
			'language'        => $language,
			'metadata'        => wp_json_encode( is_array( $metadata ) ? $metadata : array() ),
			'created_at'      => current_time( 'mysql' ),
		),
		array( '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s' )
	);

	if ( false === $inserted ) {
		return new WP_Error( 'analytics_insert_failed', __( 'Unable to record analytics event.', 'intelligent-code-assistant' ), array( 'status' => 500 ) );
	}

	return rest_ensure_response( array( 'success' => true ) );
}

/**
 * Replace the original analytics endpoint with the Code Example-aware version.
 *
 * The route URL remains unchanged, so existing front-end clients remain
 * backwards compatible. codeExampleId is optional and defaults to zero.
 */
add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'intelligent-code-assistant/v1',
			'/analytics-event',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'intelligent_code_assistant_record_code_example_analytics_event',
				'permission_callback' => '__return_true',
			),
			true
		);
	},
	20
);
