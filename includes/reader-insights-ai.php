<?php
/**
 * AI interpretation layer for Reader Insights.
 *
 * Deterministic analytics are prepared elsewhere. This file only interprets
 * those facts for editors and never queries raw analytics events directly.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the editorial insights Ability.
 */
add_action(
	'wp_abilities_api_init',
	function () {
		if ( ! function_exists( 'wp_register_ability' ) ) {
			return;
		}

		wp_register_ability(
			'intelligent-code-assistant/analyze-reader-insights',
			array(
				'category'            => 'intelligent-code-assistant-tools',
				'label'               => __( 'Analyze Reader Insights', 'intelligent-code-assistant' ),
				'description'         => __( 'Interprets deterministic reader analytics and returns editorial recommendations without inventing new analytics facts.', 'intelligent-code-assistant' ),
				'show_in_rest'        => true,
				'show_in_mcp'         => true,
				'permission_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'articleTitle' => array(
							'type'        => 'string',
							'description' => __( 'The article title.', 'intelligent-code-assistant' ),
						),
						'summary' => array(
							'type'                 => 'object',
							'description'          => __( 'Deterministic analytics summary for the article.', 'intelligent-code-assistant' ),
							'additionalProperties' => true,
						),
					),
					'required'             => array( 'articleTitle', 'summary' ),
					'additionalProperties' => false,
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'summary' => array( 'type' => 'string' ),
						'frictionPoints' => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'recommendations' => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'suggestedFaqs' => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
					),
					'required'             => array( 'summary', 'frictionPoints', 'recommendations', 'suggestedFaqs' ),
					'additionalProperties' => false,
				),
				'execute_callback'    => 'intelligent_code_assistant_execute_reader_insights_ability',
			)
		);
	}
);

/**
 * Convert a possible AI Client result into plain text.
 *
 * Different providers and AI Client versions may wrap generated text in
 * slightly different result objects, so this deliberately handles the common
 * shapes instead of assuming generate() always returns a string.
 *
 * @param mixed $value AI Client response/result value.
 * @return string
 */
function intelligent_code_assistant_reader_insights_response_text( $value ) {
	if ( is_string( $value ) ) {
		return trim( $value );
	}

	if ( is_scalar( $value ) ) {
		return (string) $value;
	}

	if ( is_array( $value ) ) {
		if ( isset( $value['summary'] ) ) {
			return wp_json_encode( $value );
		}

		foreach ( array( 'text', 'content', 'output', 'response', 'result', 'message', 'data' ) as $key ) {
			if ( array_key_exists( $key, $value ) ) {
				$text = intelligent_code_assistant_reader_insights_response_text( $value[ $key ] );
				if ( '' !== $text ) {
					return $text;
				}
			}
		}

		return '';
	}

	if ( ! is_object( $value ) ) {
		return '';
	}

	foreach ( array( 'generate', 'get_text', 'get_content', 'get_data', 'to_array' ) as $method ) {
		if ( method_exists( $value, $method ) ) {
			try {
				$result = $value->{$method}();
				$text   = intelligent_code_assistant_reader_insights_response_text( $result );
				if ( '' !== $text ) {
					return $text;
				}
			} catch ( Throwable $error ) {
				// Try the next supported result shape.
			}
		}
	}

	if ( method_exists( $value, '__toString' ) ) {
		try {
			return trim( (string) $value );
		} catch ( Throwable $error ) {
			return '';
		}
	}

	return '';
}

/**
 * Decode structured editorial insight data from an AI Client response.
 *
 * @param mixed $response AI Client response.
 * @return array|null
 */
function intelligent_code_assistant_decode_reader_insights_response( $response ) {
	if ( is_array( $response ) && isset( $response['summary'] ) ) {
		return $response;
	}

	$raw_json = intelligent_code_assistant_reader_insights_response_text( $response );

	if ( '' === $raw_json ) {
		return null;
	}

	$raw_json = trim( $raw_json );
	$raw_json = preg_replace( '/^\s*```(?:json)?\s*/i', '', $raw_json );
	$raw_json = preg_replace( '/\s*```\s*$/', '', $raw_json );
	$raw_json = trim( $raw_json );

	$data = json_decode( $raw_json, true );

	// Some providers prepend/append a short sentence even when JSON is requested.
	// If direct decoding fails, extract the outermost JSON object and try again.
	if ( ! is_array( $data ) ) {
		$first_brace = strpos( $raw_json, '{' );
		$last_brace  = strrpos( $raw_json, '}' );

		if ( false !== $first_brace && false !== $last_brace && $last_brace > $first_brace ) {
			$candidate = substr( $raw_json, $first_brace, $last_brace - $first_brace + 1 );
			$data      = json_decode( $candidate, true );
		}
	}

	if ( ! is_array( $data ) ) {
		return null;
	}

	// Unwrap common provider/result envelopes while preserving our own schema.
	foreach ( array( 'data', 'result', 'output', 'response' ) as $key ) {
		if ( ! isset( $data['summary'] ) && isset( $data[ $key ] ) ) {
			$nested = $data[ $key ];

			if ( is_string( $nested ) ) {
				$nested = json_decode( $nested, true );
			}

			if ( is_array( $nested ) && isset( $nested['summary'] ) ) {
				$data = $nested;
				break;
			}
		}
	}

	return isset( $data['summary'] ) ? $data : null;
}

/**
 * Sanitize a list of AI-generated editorial strings.
 *
 * @param mixed $items Input list.
 * @return array
 */
function intelligent_code_assistant_sanitize_insight_list( $items ) {
	if ( ! is_array( $items ) ) {
		return array();
	}

	$items = array_map(
		static function ( $item ) {
			return is_scalar( $item ) ? sanitize_text_field( (string) $item ) : '';
		},
		$items
	);
	$items = array_values( array_filter( $items ) );

	return array_slice( $items, 0, 8 );
}

/**
 * Execute the Reader Insights editorial-analysis Ability.
 *
 * @param array $args Ability arguments.
 * @return array|WP_Error
 */
function intelligent_code_assistant_execute_reader_insights_ability( array $args ) {
	$article_title = isset( $args['articleTitle'] ) ? sanitize_text_field( $args['articleTitle'] ) : '';
	$summary       = isset( $args['summary'] ) && is_array( $args['summary'] ) ? $args['summary'] : array();

	if ( '' === $article_title || empty( $summary ) ) {
		return new WP_Error(
			'invalid_reader_insights',
			__( 'An article title and deterministic analytics summary are required.', 'intelligent-code-assistant' ),
			array( 'status' => 400 )
		);
	}

	if ( empty( $summary['totalInteractions'] ) ) {
		return new WP_Error(
			'no_reader_insights',
			__( 'There is not enough reader interaction data to analyze yet.', 'intelligent-code-assistant' ),
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

	$analytics_json = wp_json_encode( $summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );

	$prompt = <<<PROMPT
You are an editorial assistant helping an author improve a technical tutorial.

Article: {$article_title}

Below is a deterministic analytics summary produced by WordPress. Treat these values as the complete factual evidence available to you. Do not invent readers, sessions, causes, percentages, trends, or events that are not explicitly present in the data.

Important interpretation rules:
- Event counts represent recorded actions, not unique readers.
- Repeated explanations or questions can indicate possible friction, but they do not prove confusion.
- Completion actions do not establish a final completion rate.
- Knowledge-check attempts are interactions, not unique people.
- Distinguish facts from hypotheses using cautious editorial language such as "may", "could", or "suggests".
- Recommend editorial changes for the human author to consider. Do not claim the article should be automatically rewritten.

Analytics:
{$analytics_json}

Return ONLY valid JSON with exactly this shape:
{
  "summary": "A concise editorial interpretation grounded in the supplied analytics.",
  "frictionPoints": ["Potential friction point supported by the analytics"],
  "recommendations": ["Specific editorial action the author could consider"],
  "suggestedFaqs": ["Question that could be addressed in the article or an FAQ"]
}

Keep every item concise and evidence-based. Empty arrays are acceptable when the analytics do not support a useful conclusion.
PROMPT;

	try {
		$response = wp_ai_client_prompt(
			$prompt,
			array(
				'response_format' => array( 'type' => 'json_object' ),
			)
		);
	} catch ( Throwable $error ) {
		return new WP_Error(
			'ai_reader_insights_failed',
			__( 'The AI provider could not generate editorial insights.', 'intelligent-code-assistant' ),
			array( 'status' => 502 )
		);
	}

	if ( is_wp_error( $response ) ) {
		return $response;
	}

	$data = intelligent_code_assistant_decode_reader_insights_response( $response );

	if ( ! is_array( $data ) || ! isset( $data['summary'] ) || ! is_scalar( $data['summary'] ) ) {
		$error_data = array( 'status' => 502 );

		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			$raw_preview = intelligent_code_assistant_reader_insights_response_text( $response );
			$error_data['responsePreview'] = function_exists( 'mb_substr' ) ? mb_substr( $raw_preview, 0, 500 ) : substr( $raw_preview, 0, 500 );
		}

		return new WP_Error(
			'invalid_ai_reader_insights',
			__( 'The AI provider returned an invalid editorial-insights response.', 'intelligent-code-assistant' ),
			$error_data
		);
	}

	return array(
		'summary'         => sanitize_textarea_field( (string) $data['summary'] ),
		'frictionPoints'  => intelligent_code_assistant_sanitize_insight_list( $data['frictionPoints'] ?? array() ),
		'recommendations' => intelligent_code_assistant_sanitize_insight_list( $data['recommendations'] ?? array() ),
		'suggestedFaqs'   => intelligent_code_assistant_sanitize_insight_list( $data['suggestedFaqs'] ?? array() ),
	);
}

/**
 * Protected REST bridge used by the Reader Insights admin UI.
 *
 * The bridge gathers deterministic facts, then passes only that summary into
 * the AI interpretation layer.
 */
add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'intelligent-code-assistant/v1',
			'/analyze-reader-insights',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => function ( WP_REST_Request $request ) {
					$post_id = absint( $request->get_param( 'postId' ) );
					$post    = get_post( $post_id );

					if ( ! $post ) {
						return new WP_Error(
							'invalid_post',
							__( 'A valid post ID is required.', 'intelligent-code-assistant' ),
							array( 'status' => 400 )
						);
					}

					$summary = intelligent_code_assistant_get_analytics_summary( $post_id );
					$title   = get_the_title( $post_id );
					$title   = $title ? $title : sprintf( __( 'Post #%d', 'intelligent-code-assistant' ), $post_id );

					$result = intelligent_code_assistant_execute_reader_insights_ability(
						array(
							'articleTitle' => $title,
							'summary'      => $summary,
						)
					);

					return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
				},
				'permission_callback' => function ( WP_REST_Request $request ) {
					$post_id = absint( $request->get_param( 'postId' ) );
					return $post_id > 0 && current_user_can( 'edit_post', $post_id );
				},
				'args'                => array(
					'postId' => array(
						'required'          => true,
						'type'              => 'integer',
						'minimum'           => 1,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}
);
