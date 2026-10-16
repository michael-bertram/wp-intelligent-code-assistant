<?php
/**
 * GitHub-based plugin update integration.
 *
 * WordPress uses the Update URI header to route update checks for this
 * plugin to the github.com-specific filter below.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! function_exists( 'intelligent_code_assistant_github_update' ) ) {
	/**
	 * Return the latest published GitHub release when it is newer than the
	 * installed plugin version.
	 *
	 * @param array|false $update      Existing update response.
	 * @param array       $plugin_data Installed plugin headers.
	 * @param string      $plugin_file Plugin basename.
	 * @param string[]    $locales      Installed locales.
	 * @return array|false
	 */
	function intelligent_code_assistant_github_update( $update, $plugin_data, $plugin_file, $locales ) {
		unset( $locales );

		$expected_plugin = plugin_basename( dirname( __DIR__ ) . '/intelligent-code-assistant.php' );

		if ( $expected_plugin !== $plugin_file ) {
			return $update;
		}

		$cache_key = 'intelligent_code_assistant_github_release';
		$release   = get_site_transient( $cache_key );

		if ( false === $release ) {
			$response = wp_remote_get(
				'https://api.github.com/repos/michael-bertram/wp-intelligent-code-assistant/releases/latest',
				array(
					'timeout' => 10,
					'headers' => array(
						'Accept'     => 'application/vnd.github+json',
						'User-Agent' => 'WP Intelligent Code Assistant/' . $plugin_data['Version'],
					),
				)
			);

			if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
				set_site_transient( $cache_key, array( 'error' => true ), 6 * HOUR_IN_SECONDS );
				return $update;
			}

			$release = json_decode( wp_remote_retrieve_body( $response ), true );

			if (
				! is_array( $release ) ||
				empty( $release['tag_name'] ) ||
				! empty( $release['draft'] ) ||
				! empty( $release['prerelease'] )
			) {
				set_site_transient( $cache_key, array( 'error' => true ), 6 * HOUR_IN_SECONDS );
				return $update;
			}

			set_site_transient( $cache_key, $release, 6 * HOUR_IN_SECONDS );
		}

		if ( ! is_array( $release ) || ! empty( $release['error'] ) ) {
			return $update;
		}

		$version = ltrim( (string) $release['tag_name'], 'v' );

		if ( '' === $version || ! preg_match( '/^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/', $version ) ) {
			return $update;
		}

		if ( version_compare( $version, $plugin_data['Version'], '<=' ) ) {
			return $update;
		}

		$package = '';

		foreach ( (array) ( $release['assets'] ?? array() ) as $asset ) {
			if (
				isset( $asset['name'], $asset['browser_download_url'] ) &&
				'wp-intelligent-code-assistant.zip' === $asset['name']
			) {
				$package = $asset['browser_download_url'];
				break;
			}
		}

		if ( '' === $package ) {
			return $update;
		}

		return array(
			'id'          => 'https://github.com/michael-bertram/wp-intelligent-code-assistant',
			'slug'        => 'wp-intelligent-code-assistant',
			'plugin'      => $plugin_file,
			'version'     => $version,
			'new_version' => $version,
			'url'         => $release['html_url'] ?? 'https://github.com/michael-bertram/wp-intelligent-code-assistant/releases',
			'package'     => $package,
			'autoupdate'  => false,
		);
	}
}

add_filter(
	'update_plugins_github.com',
	'intelligent_code_assistant_github_update',
	10,
	4
);
