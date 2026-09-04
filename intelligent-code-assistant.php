<?php
/**
 * Plugin Name:       WP Intelligent Code Assistant
 * Description:       An interactive code block with inline AI assistance for technical articles, powered by the WordPress AI Client, Abilities API and Interactivity API.
 * Version:           1.1.0
 * Text Domain:       intelligent-code-assistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Register custom block types from the build directory metadata. */
function intelligent_code_assistant_register_blocks() {
	register_block_type_from_metadata( __DIR__ . '/build/intelligent-code-assistant' );
	register_block_type_from_metadata( __DIR__ . '/build/code-header' );
	register_block_type_from_metadata( __DIR__ . '/build/code-content' );
}
add_action( 'init', 'intelligent_code_assistant_register_blocks' );

/** Enqueue front-end utility scripts. */
add_action( 'wp_enqueue_scripts', function() {
	wp_enqueue_script( 'canvas-confetti', 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js', array(), null, true );
} );

/** Enqueue Prism.js assets on the front-end for syntax highlighting. */
function wpe_enqueue_syntax_highlighter_assets() {
	if ( ! is_admin() ) {
		wp_enqueue_script( 'prism-js', 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js', array(), '1.29.0', true );
		wp_enqueue_script( 'prism-autoloader', 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js', array( 'prism-js' ), '1.29.0', true );
		wp_enqueue_style( 'prism-theme', 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css', array(), '1.29.0' );
	}
}
add_action( 'wp_enqueue_scripts', 'wpe_enqueue_syntax_highlighter_assets' );

/* ========================================================================== 
   WORDPRESS ABILITIES API & AI INTEGRATION
   ========================================================================== */

/** Register the assistant's Ability category. */
add_action( 'wp_abilities_api_categories_init', function() {
	if ( function_exists( 'wp_register_ability_category' ) ) {
		wp_register_ability_category(
			'intelligent-code-assistant-tools',
			array(
				'label'       => __( 'Intelligent Code Assistant', 'intelligent-code-assistant' ),
				'description' => __( 'Abilities for code analysis and AI-powered assistance inside technical articles.', 'intelligent-code-assistant' ),
			)
		);
	}
} );

/** Register Ability: Auto-Fill Block Metadata & Syntax Formatting. */
add_action( 'wp_abilities_api_init', function() {
	if ( ! function_exists( 'wp_register_ability' ) ) {
		return;
	}

	wp_register_ability(
		'intelligent-code-assistant/auto-fill-metadata',
		array(
			'category'            => 'intelligent-code-assistant-tools',
			'label'               => __( 'Auto-Fill Code Metadata & Syntax', 'intelligent-code-assistant' ),
			'description'         => __( 'Analyzes code to detect language badge, idiomatic filename, summary title, and syntax line highlighting.', 'intelligent-code-assistant' ),
			'show_in_rest'        => true,
			'show_in_mcp'         => true,
			'permission_callback' => function() { return current_user_can( 'edit_posts' ); },
			'input_schema'        => array(
				'type'       => 'object',
				'properties' => array(
					'code' => array( 'type' => 'string', 'description' => __( 'The raw code snippet content to analyze.', 'intelligent-code-assistant' ), 'minLength' => 1 ),
				),
				'required'             => array( 'code' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'       => 'object',
				'properties' => array(
					'codeLanguage'    => array( 'type' => 'string' ),
					'filename'        => array( 'type' => 'string' ),
					'title'           => array( 'type' => 'string' ),
					'highlightLines'  => array( 'type' => 'string' ),
					'showLineNumbers' => array( 'type' => 'boolean' ),
				),
				'required'             => array( 'codeLanguage', 'filename', 'title', 'highlightLines', 'showLineNumbers' ),
				'additionalProperties' => false,
			),
			'execute_callback'    => 'intelligent_code_assistant_execute_autofill_ability',
		)
	);
} );

/**
 * Execution callback for metadata auto-fill.
 *
 * @param array $args Input parameters.
 * @return array|WP_Error Output payload matching output_schema or WP_Error.
 */
if ( ! function_exists( 'intelligent_code_assistant_execute_autofill_ability' ) ) {
	function intelligent_code_assistant_execute_autofill_ability( array $args ) {
		$raw_code = isset( $args['code'] ) && is_string( $args['code'] ) ? $args['code'] : '';
		$code     = sanitize_textarea_field( $raw_code );

		if ( '' === trim( $code ) ) {
			return new WP_Error( 'empty_code', __( 'Code snippet cannot be empty.', 'intelligent-code-assistant' ), array( 'status' => 400 ) );
		}

		$prompt = "You are a software engineer and code analyzer. Analyze the snippet below and return ONLY a raw JSON object (no markdown, no backticks) with these exact keys:\n- 'codeLanguage': The exact matching token from ['PHP', 'JS', 'CSS', 'HTML', 'JSON', 'SQL', 'Bash'].\n- 'filename': An idiomatic filename.\n- 'title': A concise 3-6 word summary title.\n- 'highlightLines': Important line numbers to highlight or empty string.\n- 'showLineNumbers': true if the snippet has more than 3 lines or structural logic, false otherwise.\n\nSnippet:\n{$code}";

	if ( function_exists( 'wp_ai_client_prompt' ) ) {
		try {
			$ai_response = wp_ai_client_prompt( $prompt, array( 'response_format' => array( 'type' => 'json_object' ) ) );
			if ( ! is_wp_error( $ai_response ) ) {
				$raw_json = '';
				if ( is_string( $ai_response ) ) {
					$raw_json = $ai_response;
				} elseif ( is_object( $ai_response ) ) {
					if ( method_exists( $ai_response, 'generate' ) ) {
						$generated = $ai_response->generate();
						$raw_json  = is_string( $generated ) ? $generated : (string) $generated;
					} elseif ( method_exists( $ai_response, 'get_text' ) ) {
						$raw_json = (string) $ai_response->get_text();
					} elseif ( method_exists( $ai_response, '__toString' ) ) {
						$raw_json = (string) $ai_response;
					}
				}
				$data = json_decode( trim( preg_replace( '/^```(json)?|```$/m', '', trim( $raw_json ) ) ), true );
				if ( is_array( $data ) && isset( $data['codeLanguage'], $data['filename'], $data['title'] ) ) {
					return array(
						'codeLanguage'    => sanitize_text_field( $data['codeLanguage'] ),
						'filename'        => sanitize_file_name( $data['filename'] ),
						'title'           => sanitize_text_field( $data['title'] ),
						'highlightLines'  => isset( $data['highlightLines'] ) ? sanitize_text_field( $data['highlightLines'] ) : '',
						'showLineNumbers' => isset( $data['showLineNumbers'] ) ? (bool) $data['showLineNumbers'] : true,
					);
				}
			}
		} catch ( Throwable $e ) {
			// Fall through to the deterministic fallback engine.
		}
	}

		$trimmed_code = trim( $code );
		$lines_count  = count( explode( "\n", $trimmed_code ) );
		if ( ( str_starts_with( $trimmed_code, '{' ) && str_ends_with( $trimmed_code, '}' ) ) || ( str_starts_with( $trimmed_code, '[' ) && str_ends_with( $trimmed_code, ']' ) ) ) {
			$json_test = json_decode( $trimmed_code, true );
			return array( 'codeLanguage' => 'JSON', 'filename' => ( is_array( $json_test ) && isset( $json_test['name'] ) ) ? 'block.json' : 'data.json', 'title' => __( 'JSON Structure', 'intelligent-code-assistant' ), 'highlightLines' => '1', 'showLineNumbers' => $lines_count > 3 );
		}
		if ( preg_match( '/^<[!a-zA-Z]/', $trimmed_code ) ) {
			return array( 'codeLanguage' => 'HTML', 'filename' => 'index.html', 'title' => __( 'HTML Markup', 'intelligent-code-assistant' ), 'highlightLines' => '', 'showLineNumbers' => $lines_count > 3 );
		}
		if ( str_contains( $trimmed_code, '<?php' ) || str_contains( $trimmed_code, 'namespace ' ) ) {
			return array( 'codeLanguage' => 'PHP', 'filename' => 'functions.php', 'title' => __( 'PHP Script', 'intelligent-code-assistant' ), 'highlightLines' => '', 'showLineNumbers' => true );
		}
		if ( preg_match( '/(const|let|var|import|export|function)\s/', $trimmed_code ) ) {
			return array( 'codeLanguage' => 'JS', 'filename' => 'script.js', 'title' => __( 'JavaScript Code', 'intelligent-code-assistant' ), 'highlightLines' => '', 'showLineNumbers' => $lines_count > 3 );
		}
		return array( 'codeLanguage' => 'PHP', 'filename' => 'snippet.php', 'title' => __( 'Code Snippet', 'intelligent-code-assistant' ), 'highlightLines' => '', 'showLineNumbers' => $lines_count > 3 );
	}
}

/* Direct REST fallback for editor-only metadata generation. */
add_action( 'rest_api_init', function() {
	register_rest_route( 'intelligent-code-assistant/v1', '/auto-fill-metadata', array(
		'methods'             => 'POST',
		'callback'            => function( WP_REST_Request $request ) {
			$params = $request->get_json_params();
			$raw_code = is_array( $params ) && isset( $params['code'] ) ? $params['code'] : $request->get_param( 'code' );
			return intelligent_code_assistant_execute_autofill_ability( array( 'code' => (string) $raw_code ) );
		},
		'permission_callback' => function() { return current_user_can( 'edit_posts' ); },
	) );
} );

/* ========================================================================== 
   USER PERSISTENCE
   ========================================================================== */

add_action( 'init', function() {
	register_meta( 'user', '_wpe_completed_blocks', array(
		'type'         => 'object',
		'description'  => 'Track completed code block IDs per user.',
		'single'       => true,
		'show_in_rest' => array( 'schema' => array( 'type' => 'object', 'additionalProperties' => array( 'type' => 'boolean' ) ) ),
		'auth_callback' => function() { return current_user_can( 'read' ); },
	) );
} );

add_action( 'rest_api_init', function() {
	register_rest_route( 'intelligent-code-assistant/v1', '/toggle-complete', array(
		'methods'             => 'POST',
		'callback'            => function( WP_REST_Request $request ) {
			$user_id = get_current_user_id();
			$block_id = sanitize_text_field( $request->get_param( 'block_id' ) );
			$status = (bool) $request->get_param( 'status' );
			if ( ! $user_id ) return new WP_Error( 'unauthorized', __( 'User not logged in.', 'intelligent-code-assistant' ), array( 'status' => 401 ) );
			if ( empty( $block_id ) ) return new WP_Error( 'invalid_id', __( 'Block ID is required.', 'intelligent-code-assistant' ), array( 'status' => 400 ) );
			$saved_tasks = get_user_meta( $user_id, '_wpe_completed_blocks', true );
			if ( ! is_array( $saved_tasks ) ) $saved_tasks = array();
			$saved_tasks[ $block_id ] = $status;
			update_user_meta( $user_id, '_wpe_completed_blocks', $saved_tasks );
			return array( 'success' => true, 'tasks' => $saved_tasks );
		},
		'permission_callback' => function() { return is_user_logged_in(); },
		'args'                => array(
			'block_id' => array( 'required' => true, 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ),
			'status'   => array( 'required' => true, 'type' => 'boolean' ),
		),
	) );
} );

/* ========================================================================== 
   ABILITY - EXPLAIN THIS CODE
   ========================================================================== */

add_action( 'wp_abilities_api_init', function() {
	if ( ! function_exists( 'wp_register_ability' ) ) return;
	wp_register_ability( 'intelligent-code-assistant/explain-code', array(
		'category'            => 'intelligent-code-assistant-tools',
		'label'               => __( 'Explain This Code', 'intelligent-code-assistant' ),
		'description'         => __( 'Generates a concise explanation of a code snippet for a technical article reader.', 'intelligent-code-assistant' ),
		'show_in_rest'        => true,
		'show_in_mcp'         => true,
		'permission_callback' => '__return_true',
		'input_schema'        => array(
			'type'       => 'object',
			'properties' => array(
				'code' => array( 'type' => 'string', 'description' => __( 'The raw code snippet to explain.', 'intelligent-code-assistant' ), 'minLength' => 1 ),
				'language' => array( 'type' => 'string', 'description' => __( 'Programming language context.', 'intelligent-code-assistant' ) ),
			),
			'required' => array( 'code' ),
			'additionalProperties' => false,
		),
		'output_schema' => array(
			'type'       => 'object',
			'properties' => array( 'explanation' => array( 'type' => 'string', 'description' => __( 'A concise three-point explanation.', 'intelligent-code-assistant' ) ) ),
			'required' => array( 'explanation' ),
			'additionalProperties' => false,
		),
		'execute_callback' => 'intelligent_code_assistant_execute_explain_ability',
	) );
} );

/** Generate an explanation through the WordPress AI Client. */
if ( ! function_exists( 'intelligent_code_assistant_execute_explain_ability' ) ) {
	function intelligent_code_assistant_execute_explain_ability( array $args ) {
		$raw_input = isset( $args['code'] ) && is_string( $args['code'] ) ? $args['code'] : '';
		$code      = wp_unslash( trim( html_entity_decode( $raw_input, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
		$language  = isset( $args['language'] ) ? sanitize_text_field( $args['language'] ) : 'code';
		if ( '' === $code ) return new WP_Error( 'empty_code', __( 'Code snippet cannot be empty.', 'intelligent-code-assistant' ), array( 'status' => 400 ) );
		if ( ! function_exists( 'wp_ai_client_prompt' ) ) return new WP_Error( 'ai_client_unavailable', __( 'The WordPress AI Client is not available.', 'intelligent-code-assistant' ), array( 'status' => 503 ) );

		$prompt = "You are an expert technical instructor.\n\nAnalyze the following {$language} code snippet and explain what it does in exactly 3 clear, concise bullet points.\n\nRequirements:\n* Maximum 25 words per bullet.\n* Focus on the actual functions, variables, conditions and logic present.\n* Do not invent functionality that is not present.\n* Do not include a preamble.\n* Do not use markdown code fences.\n* Return only the 3 bullet points.\n\nCode Snippet:\n{$code}";
		try {
			$result = wp_ai_client_prompt( $prompt )->generate_text();
			if ( is_wp_error( $result ) ) return $result;
			$explanation = is_string( $result ) ? trim( $result ) : '';
			if ( '' === $explanation ) return new WP_Error( 'ai_empty_response', __( 'The AI provider returned an empty response.', 'intelligent-code-assistant' ), array( 'status' => 502 ) );
			return array( 'explanation' => sanitize_textarea_field( $explanation ) );
		} catch ( Throwable $e ) {
			return new WP_Error( 'ai_generation_exception', __( 'An unexpected error occurred while generating the explanation.', 'intelligent-code-assistant' ), array( 'status' => 500 ) );
		}
	}
}

/* Direct REST fallback for front-end tutorial visitors. */
add_action( 'rest_api_init', function() {
	register_rest_route( 'intelligent-code-assistant/v1', '/explain-code', array(
		'methods'             => 'POST',
		'callback'            => function( WP_REST_Request $request ) {
			$params = $request->get_json_params();
			$raw_code = is_array( $params ) && isset( $params['code'] ) ? $params['code'] : $request->get_param( 'code' );
			$language = is_array( $params ) && isset( $params['language'] ) ? $params['language'] : $request->get_param( 'language' );
			return intelligent_code_assistant_execute_explain_ability( array( 'code' => (string) $raw_code, 'language' => (string) $language ) );
		},
		'permission_callback' => '__return_true',
		'args' => array(
			'code' => array( 'required' => true, 'type' => 'string', 'minLength' => 1 ),
			'language' => array( 'required' => false, 'type' => 'string' ),
		),
	) );
} );
