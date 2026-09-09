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

/* ==========================================================================
   ABILITY - EXPLAIN THIS LINE
   ========================================================================== */

add_action( 'wp_abilities_api_init', function() {
	if ( ! function_exists( 'wp_register_ability' ) ) {
		return;
	}

	wp_register_ability(
		'intelligent-code-assistant/explain-line',
		array(
			'category'            => 'intelligent-code-assistant-tools',
			'label'               => __( 'Explain This Line', 'intelligent-code-assistant' ),
			'description'         => __( 'Explains a selected line of code using the surrounding snippet as context.', 'intelligent-code-assistant' ),
			'show_in_rest'        => true,
			'show_in_mcp'         => true,
			'permission_callback' => '__return_true',

			'input_schema'        => array(
				'type'       => 'object',
'properties' => array(

	'code' => array(
		'type'        => 'string',
		'description' => __( 'The complete code snippet containing the selected line.', 'intelligent-code-assistant' ),
		'minLength'   => 1,
	),

	'language' => array(
		'type'        => 'string',
		'description' => __( 'Programming language context.', 'intelligent-code-assistant' ),
	),

	'filename' => array(
		'type'        => 'string',
		'description' => __( 'Optional filename associated with the code snippet.', 'intelligent-code-assistant' ),
	),

	'title' => array(
		'type'        => 'string',
		'description' => __( 'Optional title associated with the code snippet.', 'intelligent-code-assistant' ),
	),

	'selectedLineNumber' => array(
		'type'        => 'integer',
		'description' => __( 'The one-based line number selected by the reader.', 'intelligent-code-assistant' ),
		'minimum'     => 1,
	),

	'selectedLine' => array(
		'type'        => 'string',
		'description' => __( 'The exact selected line of code.', 'intelligent-code-assistant' ),
	),

	'surroundingCode' => array(
		'type'        => 'string',
		'description' => __( 'Nearby lines included to give the AI local context.', 'intelligent-code-assistant' ),
	),
),

				'required' => array(
					'code',
					'selectedLineNumber',
					'selectedLine',
				),

				'additionalProperties' => false,
			),

			'output_schema' => array(
				'type'       => 'object',

				'properties' => array(
					'explanation' => array(
						'type'        => 'string',
						'description' => __( 'A concise explanation of the selected line.', 'intelligent-code-assistant' ),
					),
				),

				'required' => array(
					'explanation',
				),

				'additionalProperties' => false,
			),

			'execute_callback' =>
				'intelligent_code_assistant_execute_explain_line_ability',
		)
	);
} );

/**
 * Generate an explanation for one selected line of code.
 *
 * @param array $args Ability input matching the input schema.
 * @return array|WP_Error
 */
if ( ! function_exists( 'intelligent_code_assistant_execute_explain_line_ability' ) ) {

	function intelligent_code_assistant_execute_explain_line_ability( array $args ) {

		$raw_code = isset( $args['code'] ) && is_string( $args['code'] )
			? $args['code']
			: '';

		$code = wp_unslash(
			trim(
				html_entity_decode(
					$raw_code,
					ENT_QUOTES | ENT_HTML5,
					'UTF-8'
				)
			)
		);

		$language = isset( $args['language'] )
			? sanitize_text_field( $args['language'] )
			: 'code';

		$selected_line_number = isset( $args['selectedLineNumber'] )
			? absint( $args['selectedLineNumber'] )
			: 0;

		$selected_line = isset( $args['selectedLine'] ) && is_string( $args['selectedLine'] )
			? wp_unslash(
				html_entity_decode(
					$args['selectedLine'],
					ENT_QUOTES | ENT_HTML5,
					'UTF-8'
				)
			)
			: '';

		$surrounding_code = isset( $args['surroundingCode'] ) && is_string( $args['surroundingCode'] )
			? wp_unslash(
				html_entity_decode(
					$args['surroundingCode'],
					ENT_QUOTES | ENT_HTML5,
					'UTF-8'
				)
			)
			: '';

		if (
			'' === $code ||
			! $selected_line_number
		) {
			return new WP_Error(
				'invalid_line_context',
				__( 'A valid code snippet and selected line are required.', 'intelligent-code-assistant' ),
				array(
					'status' => 400,
				)
			);
		}

		if ( ! function_exists( 'wp_ai_client_prompt' ) ) {
			return new WP_Error(
				'ai_client_unavailable',
				__( 'The WordPress AI Client is not available.', 'intelligent-code-assistant' ),
				array(
					'status' => 503,
				)
			);
		}

		$prompt = <<<PROMPT
You are an expert technical instructor helping a reader understand code inside a tutorial.

Explain the selected line from the following {$language} code.

Selected line number:
{$selected_line_number}

Selected line:
{$selected_line}

Nearby code:
{$surrounding_code}

Full code snippet:
{$code}

Requirements:
- Explain only the selected line.
- Use the surrounding and full snippet only to understand its context.
- Explain the important functions, variables, operators or language features used on this line.
- Explain how this line contributes to the surrounding code.
- Do not invent behaviour that is not present.
- Keep the explanation concise and suitable for a reader following a technical tutorial.
- Maximum 80 words.
- Do not include markdown code fences.
- Return only the explanation.
PROMPT;

		try {

			$result = wp_ai_client_prompt(
				$prompt
			)->generate_text();

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			$explanation = is_string( $result )
				? trim( $result )
				: '';

			if ( '' === $explanation ) {
				return new WP_Error(
					'ai_empty_response',
					__( 'The AI provider returned an empty response.', 'intelligent-code-assistant' ),
					array(
						'status' => 502,
					)
				);
			}

			return array(
				'explanation' =>
					sanitize_textarea_field(
						$explanation
					),
			);

		} catch ( Throwable $e ) {

			return new WP_Error(
				'ai_generation_exception',
				__( 'An unexpected error occurred while generating the line explanation.', 'intelligent-code-assistant' ),
				array(
					'status' => 500,
				)
			);
		}
	}
}

/* Direct REST fallback for selected-line explanations. */
add_action( 'rest_api_init', function() {

	register_rest_route(
		'intelligent-code-assistant/v1',
		'/explain-line',
		array(
			'methods' => 'POST',

			'callback' => function( WP_REST_Request $request ) {

				$params =
					$request->get_json_params();

				return intelligent_code_assistant_execute_explain_line_ability(
					array(
						'code' => isset( $params['code'] )
							? (string) $params['code']
							: '',

						'language' => isset( $params['language'] )
							? (string) $params['language']
							: 'code',

						'selectedLineNumber' => isset( $params['selectedLineNumber'] )
							? (int) $params['selectedLineNumber']
							: 0,

						'selectedLine' => isset( $params['selectedLine'] )
							? (string) $params['selectedLine']
							: '',

						'surroundingCode' => isset( $params['surroundingCode'] )
							? (string) $params['surroundingCode']
							: '',
					)
				);
			},

			'permission_callback' =>
				'__return_true',

			'args' => array(
				'code' => array(
					'required'  => true,
					'type'      => 'string',
					'minLength' => 1,
				),

				'language' => array(
					'required' => false,
					'type'     => 'string',
				),

				'selectedLineNumber' => array(
					'required' => true,
					'type'     => 'integer',
					'minimum'  => 1,
				),

				'selectedLine' => array(
					'required' => true,
					'type'     => 'string',
				),

				'surroundingCode' => array(
					'required' => false,
					'type'     => 'string',
				),
			),
		)
	);
} );

/* ==========================================================================
   ABILITY - ASK ABOUT THIS CODE
   ========================================================================== */

add_action( 'wp_abilities_api_init', function() {

	if ( ! function_exists( 'wp_register_ability' ) ) {
		return;
	}

	wp_register_ability(
		'intelligent-code-assistant/ask-code',
		array(
			'category'            => 'intelligent-code-assistant-tools',
			'label'               => __( 'Ask About This Code', 'intelligent-code-assistant' ),
			'description'         => __( 'Answers a reader question using the current code example as context.', 'intelligent-code-assistant' ),
			'show_in_rest'        => true,
			'show_in_mcp'         => true,
			'permission_callback' => '__return_true',

			'input_schema' => array(
				'type'       => 'object',

				'properties' => array(
					'code' => array(
						'type'        => 'string',
						'description' => __( 'The complete code snippet the reader is asking about.', 'intelligent-code-assistant' ),
						'minLength'   => 1,
					),

					'language' => array(
						'type'        => 'string',
						'description' => __( 'Programming language context.', 'intelligent-code-assistant' ),
					),

					'filename' => array(
						'type'        => 'string',
						'description' => __( 'Optional filename associated with the code snippet.', 'intelligent-code-assistant' ),
					),

					'title' => array(
						'type'        => 'string',
						'description' => __( 'Optional title associated with the code snippet.', 'intelligent-code-assistant' ),
					),

					'question' => array(
						'type'        => 'string',
						'description' => __( 'The reader question about the code.', 'intelligent-code-assistant' ),
						'minLength'   => 1,
					),
				),

				'required' => array(
					'code',
					'question',
				),

				'additionalProperties' => false,
			),

			'output_schema' => array(
				'type'       => 'object',

				'properties' => array(
					'answer' => array(
						'type'        => 'string',
						'description' => __( 'An answer grounded in the supplied code example.', 'intelligent-code-assistant' ),
					),
				),

				'required' => array(
					'answer',
				),

				'additionalProperties' => false,
			),

			'execute_callback' =>
				'intelligent_code_assistant_execute_ask_code_ability',
		)
	);
} );

/**
 * Answer a reader question about the current code example.
 *
 * @param array $args Ability input matching the input schema.
 * @return array|WP_Error
 */
if ( ! function_exists( 'intelligent_code_assistant_execute_ask_code_ability' ) ) {

	function intelligent_code_assistant_execute_ask_code_ability( array $args ) {

		$raw_code = isset( $args['code'] ) && is_string( $args['code'] )
			? $args['code']
			: '';

		$code = wp_unslash(
			trim(
				html_entity_decode(
					$raw_code,
					ENT_QUOTES | ENT_HTML5,
					'UTF-8'
				)
			)
		);

		$language = isset( $args['language'] )
			? sanitize_text_field( $args['language'] )
			: 'code';

		$filename = isset( $args['filename'] )
			? sanitize_text_field( $args['filename'] )
			: '';

		$title = isset( $args['title'] )
			? sanitize_text_field( $args['title'] )
			: '';

		$question = isset( $args['question'] ) && is_string( $args['question'] )
			? sanitize_textarea_field( $args['question'] )
			: '';

		if ( '' === $code ) {
			return new WP_Error(
				'empty_code',
				__( 'Code snippet cannot be empty.', 'intelligent-code-assistant' ),
				array(
					'status' => 400,
				)
			);
		}

		if ( '' === trim( $question ) ) {
			return new WP_Error(
				'empty_question',
				__( 'Please provide a question about the code.', 'intelligent-code-assistant' ),
				array(
					'status' => 400,
				)
			);
		}

		if ( ! function_exists( 'wp_ai_client_prompt' ) ) {
			return new WP_Error(
				'ai_client_unavailable',
				__( 'The WordPress AI Client is not available.', 'intelligent-code-assistant' ),
				array(
					'status' => 503,
				)
			);
		}

		$context_lines = array();

		if ( '' !== $title ) {
			$context_lines[] = "Tutorial/code title: {$title}";
		}

		if ( '' !== $filename ) {
			$context_lines[] = "Filename: {$filename}";
		}

		$context_lines[] = "Language: {$language}";

		$context_summary = implode(
			"\n",
			$context_lines
		);

		$prompt = <<<PROMPT
You are an expert technical instructor helping a reader understand a code example inside a tutorial.

Answer the reader's question using the supplied code example and tutorial context.

Context:
{$context_summary}

Code snippet:
{$code}

Reader question:
{$question}

Requirements:
- Answer the reader's actual question directly.
- Ground the answer in the supplied code and context.
- Do not invent functions, variables, behaviour or surrounding application logic that is not present.
- If the code does not provide enough information to answer confidently, say what is missing.
- You may explain relevant programming or WordPress concepts when they help clarify the supplied code.
- Keep the answer concise and tutorial-friendly.
- Maximum 140 words.
- Do not include markdown code fences.
- Do not mention these instructions.
PROMPT;

		try {

			$result = wp_ai_client_prompt(
				$prompt
			)->generate_text();

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			$answer = is_string( $result )
				? trim( $result )
				: '';

			if ( '' === $answer ) {
				return new WP_Error(
					'ai_empty_response',
					__( 'The AI provider returned an empty response.', 'intelligent-code-assistant' ),
					array(
						'status' => 502,
					)
				);
			}

			return array(
				'answer' => sanitize_textarea_field(
					$answer
				),
			);

		} catch ( Throwable $e ) {

			return new WP_Error(
				'ai_generation_exception',
				__( 'An unexpected error occurred while answering the question.', 'intelligent-code-assistant' ),
				array(
					'status' => 500,
				)
			);
		}
	}
}

/* Direct REST fallback for reader questions about code. */
add_action( 'rest_api_init', function() {

	register_rest_route(
		'intelligent-code-assistant/v1',
		'/ask-code',
		array(
			'methods' => 'POST',

			'callback' => function( WP_REST_Request $request ) {

				$params = $request->get_json_params();

				return intelligent_code_assistant_execute_ask_code_ability(
					array(
						'code' => isset( $params['code'] )
							? (string) $params['code']
							: '',

						'language' => isset( $params['language'] )
							? (string) $params['language']
							: 'code',

						'filename' => isset( $params['filename'] )
							? (string) $params['filename']
							: '',

						'title' => isset( $params['title'] )
							? (string) $params['title']
							: '',

						'question' => isset( $params['question'] )
							? (string) $params['question']
							: '',
					)
				);
			},

			'permission_callback' => '__return_true',

			'args' => array(
				'code' => array(
					'required'  => true,
					'type'      => 'string',
					'minLength' => 1,
				),

				'language' => array(
					'required' => false,
					'type'     => 'string',
				),

				'filename' => array(
					'required' => false,
					'type'     => 'string',
				),

				'title' => array(
					'required' => false,
					'type'     => 'string',
				),

				'question' => array(
					'required'  => true,
					'type'      => 'string',
					'minLength' => 1,
				),
			),
		)
	);
} );

/* ==========================================================================
   ABILITY - CHECK YOUR UNDERSTANDING
   ========================================================================== */

add_action( 'wp_abilities_api_init', function() {

	if ( ! function_exists( 'wp_register_ability' ) ) {
		return;
	}

	wp_register_ability(
		'intelligent-code-assistant/check-understanding',
		array(
			'category'            => 'intelligent-code-assistant-tools',
			'label'               => __( 'Check Your Understanding', 'intelligent-code-assistant' ),
			'description'         => __( 'Generates a short multiple-choice question based on the current code example.', 'intelligent-code-assistant' ),
			'show_in_rest'        => true,
			'show_in_mcp'         => true,
			'permission_callback' => '__return_true',

			'input_schema' => array(
				'type'       => 'object',

				'properties' => array(
					'code' => array(
						'type'        => 'string',
						'description' => __( 'The code snippet the question should be based on.', 'intelligent-code-assistant' ),
						'minLength'   => 1,
					),

					'language' => array(
						'type'        => 'string',
						'description' => __( 'Programming language used by the code snippet.', 'intelligent-code-assistant' ),
					),

					'filename' => array(
						'type'        => 'string',
						'description' => __( 'Optional filename associated with the code.', 'intelligent-code-assistant' ),
					),

					'title' => array(
						'type'        => 'string',
						'description' => __( 'Optional title associated with the code example.', 'intelligent-code-assistant' ),
					),
				),

				'required' => array(
					'code',
				),

				'additionalProperties' => false,
			),

			'output_schema' => array(
				'type'       => 'object',

				'properties' => array(
					'question' => array(
						'type' => 'string',
					),

					'options' => array(
						'type'     => 'array',
						'minItems' => 3,
						'maxItems' => 3,

						'items' => array(
							'type' => 'string',
						),
					),

					'correctAnswer' => array(
						'type'    => 'integer',
						'minimum' => 0,
						'maximum' => 2,
					),

					'explanation' => array(
						'type' => 'string',
					),
				),

				'required' => array(
					'question',
					'options',
					'correctAnswer',
					'explanation',
				),

				'additionalProperties' => false,
			),

			'execute_callback' =>
				'intelligent_code_assistant_execute_check_understanding_ability',
		)
	);
} );

/**
 * Generate a multiple-choice question from the supplied code.
 *
 * @param array $args Ability input matching the input schema.
 * @return array|WP_Error
 */
if ( ! function_exists( 'intelligent_code_assistant_execute_check_understanding_ability' ) ) {

	function intelligent_code_assistant_execute_check_understanding_ability( array $args ) {

		$raw_code = isset( $args['code'] ) && is_string( $args['code'] )
			? $args['code']
			: '';

		$code = wp_unslash(
			trim(
				html_entity_decode(
					$raw_code,
					ENT_QUOTES | ENT_HTML5,
					'UTF-8'
				)
			)
		);

		$language = isset( $args['language'] )
			? sanitize_text_field( $args['language'] )
			: 'code';

		$filename = isset( $args['filename'] )
			? sanitize_text_field( $args['filename'] )
			: '';

		$title = isset( $args['title'] )
			? sanitize_text_field( $args['title'] )
			: '';

		if ( '' === $code ) {
			return new WP_Error(
				'empty_code',
				__( 'Code snippet cannot be empty.', 'intelligent-code-assistant' ),
				array( 'status' => 400 )
			);
		}

		if ( ! function_exists( 'wp_ai_client_prompt' ) ) {
			return new WP_Error(
				'ai_client_unavailable',
				__( 'The WordPress AI Client is not available.', 'intelligent-code-assistant' ),
				array( 'status' => 503 )
			);
		}

		$schema = array(
			'type'       => 'object',
			'properties' => array(
				'question' => array(
					'type' => 'string',
				),
				'options' => array(
					'type'     => 'array',
					'minItems' => 3,
					'maxItems' => 3,
					'items'    => array(
						'type' => 'string',
					),
				),
				'correctAnswer' => array(
					'type'    => 'integer',
					'minimum' => 0,
					'maximum' => 2,
				),
				'explanation' => array(
					'type' => 'string',
				),
			),
			'required' => array(
				'question',
				'options',
				'correctAnswer',
				'explanation',
			),
			'additionalProperties' => false,
		);

		$context = "Language: {$language}";

		if ( '' !== $title ) {
			$context .= "\nTitle: {$title}";
		}

		if ( '' !== $filename ) {
			$context .= "\nFilename: {$filename}";
		}

		$prompt = <<<PROMPT
You are creating a short knowledge-check question for a reader following a technical tutorial.

Use only the supplied code and context to create one multiple-choice question that tests whether the reader understands an important concept demonstrated by the example.

Context:
{$context}

Code:
{$code}

Requirements:
- Create exactly three possible answers.
- Only one answer must be correct.
- correctAnswer must be the zero-based array index of the correct option: 0, 1, or 2.
- Make the incorrect answers plausible, but clearly incorrect when the code is understood.
- Test understanding rather than trivial syntax recognition.
- Keep the question concise.
- Keep each option concise.
- Provide a short explanation of why the correct answer is correct.
- Do not rely on information that cannot be inferred from the supplied code or context.
PROMPT;

		try {

			$result = wp_ai_client_prompt( $prompt )
				->as_json_response( $schema )
				->generate_text();

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( ! is_string( $result ) || '' === trim( $result ) ) {
				return new WP_Error(
					'ai_empty_response',
					__( 'The AI provider returned an empty response.', 'intelligent-code-assistant' ),
					array( 'status' => 502 )
				);
			}

			$data = json_decode( $result, true );

			if (
				! is_array( $data ) ||
				! isset(
					$data['question'],
					$data['options'],
					$data['correctAnswer'],
					$data['explanation']
				)
			) {
				return new WP_Error(
					'ai_invalid_response',
					__( 'The AI provider returned an invalid structured response.', 'intelligent-code-assistant' ),
					array( 'status' => 502 )
				);
			}

			return array(
				'question'      => sanitize_text_field( $data['question'] ),
				'options'       => array_map(
					'sanitize_text_field',
					$data['options']
				),
				'correctAnswer' => (int) $data['correctAnswer'],
				'explanation'   => sanitize_textarea_field( $data['explanation'] ),
			);

		} catch ( Throwable $e ) {

			return new WP_Error(
				'ai_generation_exception',
				__( 'Unable to generate a knowledge check right now.', 'intelligent-code-assistant' ),
				array( 'status' => 500 )
			);
		}
	}
}