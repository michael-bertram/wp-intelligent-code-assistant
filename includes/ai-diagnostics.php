<?php
/**
 * Temporary AI connector diagnostics for Stage 7 debugging.
 *
 * This file intentionally reports only connector metadata, credential source,
 * and generation success/error codes. It never exposes API keys, tokens,
 * Authorization headers, generated text, or raw provider error messages.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Determine whether a connector has a credential available and where it comes from.
 *
 * Mirrors the public Connectors API credential priority without reading or returning
 * the actual credential value.
 *
 * @param string $connector_id Connector identifier.
 * @param array  $connector    Connector metadata.
 * @return string One of env, constant, database, none, or not_required.
 */
function intelligent_code_assistant_get_connector_key_source( $connector_id, array $connector ) {
	$authentication = isset( $connector['authentication'] ) && is_array( $connector['authentication'] )
		? $connector['authentication']
		: array();

	$method = isset( $authentication['method'] ) ? sanitize_key( $authentication['method'] ) : '';
	if ( 'api_key' !== $method ) {
		return 'none' === $method ? 'not_required' : 'none';
	}

	$provider_key  = strtoupper( str_replace( '-', '_', sanitize_key( $connector_id ) ) ) . '_API_KEY';
	$env_var_name  = ! empty( $authentication['env_var_name'] ) ? (string) $authentication['env_var_name'] : $provider_key;
	$constant_name = ! empty( $authentication['constant_name'] ) ? (string) $authentication['constant_name'] : $provider_key;
	$setting_name  = ! empty( $authentication['setting_name'] ) ? (string) $authentication['setting_name'] : '';

	if ( '' !== $env_var_name ) {
		$env_value = getenv( $env_var_name );
		if ( false !== $env_value && '' !== $env_value ) {
			return 'env';
		}
	}

	if ( '' !== $constant_name && defined( $constant_name ) ) {
		$constant_value = constant( $constant_name );
		if ( is_string( $constant_value ) && '' !== $constant_value ) {
			return 'constant';
		}
	}

	if ( '' !== $setting_name ) {
		$database_value = get_option( $setting_name, '' );
		if ( is_string( $database_value ) && '' !== $database_value ) {
			return 'database';
		}
	}

	return 'none';
}

/**
 * Build a safe diagnostic snapshot for the current request context.
 *
 * @param bool $run_generation_test Whether to execute a minimal text-generation request.
 * @return array Safe diagnostic information.
 */
function intelligent_code_assistant_get_ai_diagnostics( $run_generation_test = true ) {
	$diagnostics = array(
		'loggedIn'          => is_user_logged_in(),
		'isAdminRequest'    => is_admin(),
		'aiClientAvailable' => function_exists( 'wp_ai_client_prompt' ),
		'connectorsApi'     => function_exists( 'wp_get_connectors' ),
		'connectors'        => array(),
		'generationTest'    => array(
			'ran'     => false,
			'success' => false,
		),
	);

	if ( function_exists( 'wp_get_connectors' ) ) {
		$connectors = wp_get_connectors();

		foreach ( $connectors as $connector_id => $connector ) {
			if ( ! is_array( $connector ) ) {
				continue;
			}

			$authentication = isset( $connector['authentication'] ) && is_array( $connector['authentication'] )
				? $connector['authentication']
				: array();
			$key_source     = intelligent_code_assistant_get_connector_key_source( $connector_id, $connector );

			$diagnostics['connectors'][] = array(
				'id'             => sanitize_key( $connector_id ),
				'name'           => isset( $connector['name'] ) ? sanitize_text_field( $connector['name'] ) : sanitize_key( $connector_id ),
				'type'           => isset( $connector['type'] ) ? sanitize_key( $connector['type'] ) : '',
				'authMethod'     => isset( $authentication['method'] ) ? sanitize_key( $authentication['method'] ) : '',
				'credentialSource' => $key_source,
				'hasCredential'  => in_array( $key_source, array( 'env', 'constant', 'database', 'not_required' ), true ),
			);
		}
	}

	if ( ! $run_generation_test || ! $diagnostics['aiClientAvailable'] ) {
		return $diagnostics;
	}

	$diagnostics['generationTest']['ran'] = true;

	try {
		$result = wp_ai_client_prompt( 'Reply with exactly: OK' )->generate_text();

		if ( is_wp_error( $result ) ) {
			$error_data = $result->get_error_data();
			$diagnostics['generationTest']['errorCode'] = sanitize_key( $result->get_error_code() );
			$diagnostics['generationTest']['status']    = is_array( $error_data ) && isset( $error_data['status'] ) ? absint( $error_data['status'] ) : 0;
			$diagnostics['generationTest']['exceptionClass'] = is_array( $error_data ) && isset( $error_data['exception_class'] )
				? sanitize_text_field( $error_data['exception_class'] )
				: '';
			return $diagnostics;
		}

		$diagnostics['generationTest']['success'] = is_string( $result ) && '' !== trim( $result );
	} catch ( Throwable $error ) {
		$diagnostics['generationTest']['errorCode']      = 'diagnostic_exception';
		$diagnostics['generationTest']['status']         = 500;
		$diagnostics['generationTest']['exceptionClass'] = sanitize_text_field( get_class( $error ) );
	}

	return $diagnostics;
}

/**
 * Generate a short-lived token that lets the admin screen make a deliberately
 * anonymous diagnostic request without exposing a permanent public endpoint.
 *
 * @return string Token.
 */
function intelligent_code_assistant_create_ai_diagnostic_token() {
	$token = wp_generate_password( 40, false, false );
	set_transient( 'ica_ai_diag_' . hash( 'sha256', $token ), 1, 10 * MINUTE_IN_SECONDS );
	return $token;
}

/**
 * Validate a short-lived anonymous diagnostic token.
 *
 * @param string $token Token supplied by the admin screen.
 * @return bool Whether the token is valid.
 */
function intelligent_code_assistant_verify_ai_diagnostic_token( $token ) {
	if ( ! is_string( $token ) || strlen( $token ) < 20 ) {
		return false;
	}

	return (bool) get_transient( 'ica_ai_diag_' . hash( 'sha256', $token ) );
}

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'intelligent-code-assistant/v1',
			'/ai-diagnostics/admin',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => function () {
					return rest_ensure_response( intelligent_code_assistant_get_ai_diagnostics( true ) );
				},
				'permission_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);

		register_rest_route(
			'intelligent-code-assistant/v1',
			'/ai-diagnostics/anonymous',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => function () {
					return rest_ensure_response( intelligent_code_assistant_get_ai_diagnostics( true ) );
				},
				'permission_callback' => function ( WP_REST_Request $request ) {
					return intelligent_code_assistant_verify_ai_diagnostic_token( (string) $request->get_param( 'token' ) );
				},
				'args'                => array(
					'token' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);
	}
);
