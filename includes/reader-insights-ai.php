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
 * Convert an AI Client response into plain text.
 *
 * @param mixed $response AI Client response.
 * @return string
 */
function intelligent_code_assistant_reader_insights_response_text( $response ) {
	if ( is_string( $response ) ) {
		return $response;
	}

	if ( ! is_object( $response ) ) {
		return '';
	}

	if ( method_exists( $response, 'generate' ) ) {
		$generated = $response->generate();
		return is_string( $generated ) ? $generated : (string) $generated;
	}

	if ( method_exists( $response, 'get_text' ) ) {
		return (string) $response->get_text();
	}

	if ( method_exists( $response, '__toString' ) ) {
		return (string) $response;
	}

	return '';
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

	$items = array_map( 'sanitize_text_field', $items );
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

	$raw_json = intelligent_code_assistant_reader_insights_response_text( $response );
	$raw_json = trim( preg_replace( '/^```(?:json)?|```$/m', '', trim( $raw_json ) ) );
	$data     = json_decode( $raw_json, true );

	if ( ! is_array( $data ) || ! isset( $data['summary'] ) ) {
		return new WP_Error(
			'invalid_ai_reader_insights',
			__( 'The AI provider returned an invalid editorial-insights response.', 'intelligent-code-assistant' ),
			array( 'status' => 502 )
		);
	}

	return array(
		'summary'         => sanitize_textarea_field( $data['summary'] ),
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
