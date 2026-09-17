<?php
/**
 * Production hardening for public reader-facing AI requests.
 *
 * The reader assistant remains publicly accessible, but requests are bounded,
 * lightly rate limited, and provider failures are normalized at the application
 * boundary so infrastructure details are not exposed to readers.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Determine whether a REST route belongs to a public reader AI capability.
 *
 * @param string $route REST route.
 * @return bool
 */
function intelligent_code_assistant_is_public_ai_route( $route ) {
	$route = is_string( $route ) ? $route : '';

	$direct_routes = array(
		'/intelligent-code-assistant/v1/explain-code',
		'/intelligent-code-assistant/v1/explain-line',
		'/intelligent-code-assistant/v1/ask-code',
		'/intelligent-code-assistant/v1/check-understanding',
	);

	if ( in_array( $route, $direct_routes, true ) ) {
		return true;
	}

	return (bool) preg_match(
		'#^/wp/v2/abilities/intelligent-code-assistant/(explain-code|explain-line|ask-code|check-understanding)/run$#',
		$route
	);
}

/**
 * Return a privacy-preserving fingerprint for a public request.
 *
 * This is intentionally approximate. It is an abuse-control signal, not an
 * identity mechanism and is never stored outside the transient key.
 *
 * @return string
 */
function intelligent_code_assistant_public_ai_request_fingerprint() {
	$remote_addr = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
	$user_agent  = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : 'unknown';

	return hash_hmac( 'sha256', $remote_addr . '|' . $user_agent, wp_salt( 'nonce' ) );
}

/**
 * Apply a small anonymous rate limit.
 *
 * @return true|WP_Error
 */
function intelligent_code_assistant_check_public_ai_rate_limit() {
	$fingerprint = intelligent_code_assistant_public_ai_request_fingerprint();
	$key         = 'ica_ai_rate_' . substr( $fingerprint, 0, 32 );
	$window      = 10 * MINUTE_IN_SECONDS;
	$limit       = 12;
	$count       = (int) get_transient( $key );

	if ( $count >= $limit ) {
		return new WP_Error(
			'ai_rate_limited',
			__( 'AI assistance is temporarily unavailable. Please try again later.', 'intelligent-code-assistant' ),
			array( 'status' => 429 )
		);
	}

	set_transient( $key, $count + 1, $window );
	return true;
}

/**
 * Validate bounded public AI payloads before they reach a provider.
 *
 * @param WP_REST_Request $request Request object.
 * @return true|WP_Error
 */
function intelligent_code_assistant_validate_public_ai_request( WP_REST_Request $request ) {
	$body = (string) $request->get_body();

	if ( strlen( $body ) > 24000 ) {
		return new WP_Error(
			'ai_request_too_large',
			__( 'This AI request is too large.', 'intelligent-code-assistant' ),
			array( 'status' => 413 )
		);
	}

	$fetch_site = isset( $_SERVER['HTTP_SEC_FETCH_SITE'] ) ? sanitize_key( wp_unslash( $_SERVER['HTTP_SEC_FETCH_SITE'] ) ) : '';
	if ( '' !== $fetch_site && ! in_array( $fetch_site, array( 'same-origin', 'same-site', 'none' ), true ) ) {
		return new WP_Error(
			'ai_cross_site_request_blocked',
			__( 'This AI request could not be accepted.', 'intelligent-code-assistant' ),
			array( 'status' => 403 )
		);
	}

	$params = $request->get_json_params();
	if ( ! is_array( $params ) ) {
		return new WP_Error(
			'ai_invalid_request',
			__( 'A valid AI request is required.', 'intelligent-code-assistant' ),
			array( 'status' => 400 )
		);
	}

	$limits = array(
		'code'            => 12000,
		'language'        => 100,
		'filename'        => 255,
		'title'           => 300,
		'tutorialTitle'   => 300,
		'tutorialContext' => 2000,
		'question'        => 1000,
		'selectedLine'    => 1500,
		'surroundingCode' => 5000,
	);

	foreach ( $limits as $field => $max_length ) {
		if ( ! isset( $params[ $field ] ) ) {
			continue;
		}

		if ( ! is_string( $params[ $field ] ) || strlen( $params[ $field ] ) > $max_length ) {
			return new WP_Error(
				'ai_invalid_request',
				__( 'This AI request contains invalid input.', 'intelligent-code-assistant' ),
				array( 'status' => 400 )
			);
		}
	}

	if ( empty( $params['code'] ) || ! is_string( $params['code'] ) ) {
		return new WP_Error(
			'ai_invalid_request',
			__( 'Code is required for this AI request.', 'intelligent-code-assistant' ),
			array( 'status' => 400 )
		);
	}

	$route = $request->get_route();
	if ( false !== strpos( $route, 'ask-code' ) && ( empty( $params['question'] ) || ! is_string( $params['question'] ) ) ) {
		return new WP_Error(
			'ai_invalid_request',
			__( 'A question is required for this AI request.', 'intelligent-code-assistant' ),
			array( 'status' => 400 )
		);
	}

	if ( false !== strpos( $route, 'explain-line' ) ) {
		$line_number = isset( $params['selectedLineNumber'] ) ? absint( $params['selectedLineNumber'] ) : 0;
		if ( $line_number < 1 || empty( $params['selectedLine'] ) || ! is_string( $params['selectedLine'] ) ) {
			return new WP_Error(
				'ai_invalid_request',
				__( 'A valid selected line is required for this AI request.', 'intelligent-code-assistant' ),
				array( 'status' => 400 )
			);
		}
	}

	return true;
}

/**
 * Guard anonymous public AI requests before execution.
 */
add_filter(
	'rest_pre_dispatch',
	function ( $result, $server, $request ) {
		if ( ! $request instanceof WP_REST_Request || ! intelligent_code_assistant_is_public_ai_route( $request->get_route() ) ) {
			return $result;
		}

		if ( 'POST' !== $request->get_method() || is_user_logged_in() ) {
			return $result;
		}

		$validated = intelligent_code_assistant_validate_public_ai_request( $request );
		if ( is_wp_error( $validated ) ) {
			return $validated;
		}

		$rate_limit = intelligent_code_assistant_check_public_ai_rate_limit();
		if ( is_wp_error( $rate_limit ) ) {
			return $rate_limit;
		}

		return $result;
	},
	10,
	3
);

/**
 * Normalize provider failures and remember whether anonymous generation is
 * recently unavailable so editors can see a short-lived warning in Reader Insights.
 */
add_filter(
	'rest_post_dispatch',
	function ( $response, $server, $request ) {
		if ( ! $request instanceof WP_REST_Request || ! intelligent_code_assistant_is_public_ai_route( $request->get_route() ) || is_user_logged_in() ) {
			return $response;
		}

		$response   = rest_ensure_response( $response );
		$status     = (int) $response->get_status();
		$data       = $response->get_data();
		$error_code = is_array( $data ) && isset( $data['code'] ) ? sanitize_key( $data['code'] ) : '';

		if ( $status >= 200 && $status < 300 ) {
			delete_transient( 'ica_public_ai_capability_status' );
			return $response;
		}

		$local_errors = array(
			'ai_cross_site_request_blocked',
			'ai_invalid_request',
			'ai_request_too_large',
			'ai_rate_limited',
		);

		if ( in_array( $error_code, $local_errors, true ) ) {
			return $response;
		}

		if ( 401 === $status || 403 === $status || 'prompt_client_error' === $error_code ) {
			set_transient( 'ica_public_ai_capability_status', 'auth_rejected', 15 * MINUTE_IN_SECONDS );

			return new WP_REST_Response(
				array(
					'code'    => 'ai_assistance_unavailable',
					'message' => __( 'AI assistance is temporarily unavailable. Please try again later.', 'intelligent-code-assistant' ),
					'data'    => array( 'status' => 503 ),
				),
				503
			);
		}

		if ( 429 === $status ) {
			return new WP_REST_Response(
				array(
					'code'    => 'ai_rate_limited',
					'message' => __( 'AI assistance is temporarily unavailable. Please try again later.', 'intelligent-code-assistant' ),
					'data'    => array( 'status' => 429 ),
				),
				429
			);
		}

		if ( $status >= 500 ) {
			return new WP_REST_Response(
				array(
					'code'    => 'ai_assistance_unavailable',
					'message' => __( 'AI assistance is temporarily unavailable. Please try again later.', 'intelligent-code-assistant' ),
					'data'    => array( 'status' => 503 ),
				),
				503
			);
		}

		return $response;
	},
	10,
	3
);

/**
 * Surface a concise editorial warning when the latest anonymous generation
 * attempt was rejected by the configured provider. The warning expires quickly
 * and a subsequent successful public request clears it immediately.
 */
add_action(
	'admin_notices',
	function () {
		if ( ! current_user_can( 'edit_posts' ) || 'auth_rejected' !== get_transient( 'ica_public_ai_capability_status' ) ) {
			return;
		}

		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'toplevel_page_intelligent-code-assistant-reader-insights' !== $screen->id ) {
			return;
		}

		?>
		<div class="notice notice-warning">
			<p>
				<strong><?php esc_html_e( 'Reader-facing AI is currently unavailable for anonymous visitors.', 'intelligent-code-assistant' ); ?></strong>
				<?php esc_html_e( ' The configured AI provider rejected the most recent public generation request. Editorial AI for logged-in users may still continue to work.', 'intelligent-code-assistant' ); ?>
			</p>
		</div>
		<?php
	}
);
