<?php
/**
 * AI interpretation layer for Reader Insights.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

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
						'articleTitle' => array( 'type' => 'string' ),
						'summary'      => array(
							'type'                 => 'object',
							'additionalProperties' => true,
						),
					),
					'required'             => array( 'articleTitle', 'summary' ),
					'additionalProperties' => false,
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'summary'         => array( 'type' => 'string' ),
						'frictionPoints'  => array( 'type' => 'array', 'items' => array( 'type' => 'string' ) ),
						'recommendations' => array( 'type' => 'array', 'items' => array( 'type' => 'string' ) ),
						'suggestedFaqs'   => array( 'type' => 'array', 'items' => array( 'type' => 'string' ) ),
					),
					'required'             => array( 'summary', 'frictionPoints', 'recommendations', 'suggestedFaqs' ),
					'additionalProperties' => false,
				),
				'execute_callback'    => 'intelligent_code_assistant_execute_reader_insights_ability',
			)
		);
	}
);

function intelligent_code_assistant_decode_reader_insights_response( $text ) {
	if ( ! is_string( $text ) || '' === trim( $text ) ) {
		return null;
	}

	$text = trim( $text );
	$text = preg_replace( '/^\s*```(?:json)?\s*/i', '', $text );
	$text = preg_replace( '/\s*```\s*$/', '', $text );
	$text = trim( $text );

	$data = json_decode( $text, true );

	if ( ! is_array( $data ) ) {
		$first_brace = strpos( $text, '{' );
		$last_brace  = strrpos( $text, '}' );

		if ( false !== $first_brace && false !== $last_brace && $last_brace > $first_brace ) {
			$data = json_decode( substr( $text, $first_brace, $last_brace - $first_brace + 1 ), true );
		}
	}

	return is_array( $data ) && isset( $data['summary'] ) ? $data : null;
}

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

	return array_slice( array_values( array_filter( $items ) ), 0, 8 );
}

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

The analytics below were deterministically calculated by WordPress. Treat them as the complete factual evidence available. Do not invent readers, sessions, causes, trends, percentages, or events that are not present.

Interpretation rules:
- Event counts are recorded actions, not unique readers.
- Repeated line explanations or questions may signal friction, but do not prove confusion.
- Completion actions are not a completion rate.
- Knowledge-check attempts are interactions, not unique people.
- Separate facts from hypotheses and use cautious language such as "may", "could", and "suggests".
- Recommend editorial changes for a human author to consider; do not automatically rewrite content.

Analytics:
{$analytics_json}

Return ONLY valid JSON. Do not use markdown fences or introductory text. Use exactly this shape:
{
  "summary": "Concise editorial interpretation grounded in the analytics.",
  "frictionPoints": ["Potential friction point supported by evidence"],
  "recommendations": ["Specific editorial action the author could consider"],
  "suggestedFaqs": ["Potential question to address in the article or FAQ"]
}
PROMPT;

	try {
		$response = wp_ai_client_prompt( $prompt )->generate_text();
	} catch ( Throwable $error ) {
		return new WP_Error(
			'ai_reader_insights_failed',
			__( 'The AI provider could not generate editorial insights.', 'intelligent-code-assistant' ),
			array(
				'status' => 502,
				'detail' => $error->getMessage(),
			)
		);
	}

	if ( is_wp_error( $response ) ) {
		return $response;
	}

	$data = intelligent_code_assistant_decode_reader_insights_response( $response );

	if ( ! is_array( $data ) || ! is_scalar( $data['summary'] ) ) {
		$error_data = array( 'status' => 502 );

		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			$preview = is_string( $response ) ? $response : wp_json_encode( $response );
			$error_data['responsePreview'] = function_exists( 'mb_substr' ) ? mb_substr( (string) $preview, 0, 500 ) : substr( (string) $preview, 0, 500 );
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
