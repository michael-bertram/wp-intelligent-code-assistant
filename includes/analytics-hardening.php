<?php
/**
 * Abuse controls for the anonymous reader analytics endpoint.
 *
 * @package IntelligentCodeAssistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Validate and rate-limit public analytics events before they reach storage.
 */
add_filter(
	'rest_pre_dispatch',
	function ( $result, $server, $request ) {
		if ( ! $request instanceof WP_REST_Request || '/intelligent-code-assistant/v1/analytics-event' !== $request->get_route() ) {
			return $result;
		}

		if ( 'POST' !== $request->get_method() ) {
			return $result;
		}

		if ( strlen( (string) $request->get_body() ) > 8192 ) {
			return new WP_Error(
				'analytics_request_too_large',
				__( 'The analytics event is too large.', 'intelligent-code-assistant' ),
				array( 'status' => 413 )
			);
		}

		$fetch_site = isset( $_SERVER['HTTP_SEC_FETCH_SITE'] ) ? sanitize_key( wp_unslash( $_SERVER['HTTP_SEC_FETCH_SITE'] ) ) : '';
		if ( '' !== $fetch_site && ! in_array( $fetch_site, array( 'same-origin', 'same-site', 'none' ), true ) ) {
			return new WP_Error(
				'analytics_cross_site_request_blocked',
				__( 'The analytics event could not be accepted.', 'intelligent-code-assistant' ),
				array( 'status' => 403 )
			);
		}

		$params  = $request->get_json_params();
		$post_id = is_array( $params ) ? absint( $params['postId'] ?? 0 ) : 0;
		$post    = $post_id ? get_post( $post_id ) : null;

		if ( ! $post || 'publish' !== $post->post_status ) {
			return new WP_Error(
				'invalid_analytics_post',
				__( 'A published post is required for this analytics event.', 'intelligent-code-assistant' ),
				array( 'status' => 400 )
			);
		}

		$block_id = is_array( $params ) && isset( $params['blockId'] ) ? (string) $params['blockId'] : '';
		if ( strlen( $block_id ) > 191 ) {
			return new WP_Error(
				'invalid_analytics_event',
				__( 'The analytics event contains invalid input.', 'intelligent-code-assistant' ),
				array( 'status' => 400 )
			);
		}

		// Logged-in editors are already authenticated and should not consume the
		// anonymous reader allowance while previewing content.
		if ( is_user_logged_in() ) {
			return $result;
		}

		$remote_addr = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
		$user_agent  = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : 'unknown';
		$fingerprint = hash_hmac( 'sha256', $remote_addr . '|' . $user_agent, wp_salt( 'nonce' ) );
		$key         = 'ica_analytics_rate_' . substr( $fingerprint, 0, 32 );
		$count       = (int) get_transient( $key );

		if ( $count >= 120 ) {
			return new WP_Error(
				'analytics_rate_limited',
				__( 'Too many analytics events were received. Please try again later.', 'intelligent-code-assistant' ),
				array( 'status' => 429 )
			);
		}

		set_transient( $key, $count + 1, 10 * MINUTE_IN_SECONDS );
		return $result;
	},
	9,
	3
);
