<?php
/**
 * Deterministic analytics aggregation for editorial insights.
 *
 * WordPress records and aggregates reader interactions here. AI interpretation
 * is deliberately kept out of this layer so the resulting facts remain
 * deterministic and independently testable.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Build an analytics summary for one post.
 *
 * @param int $post_id Post ID to summarize.
 * @return array Deterministic analytics facts.
 */
function intelligent_code_assistant_get_analytics_summary( $post_id ) {
	global $wpdb;

	$post_id    = absint( $post_id );
	$table_name = $wpdb->prefix . 'ica_analytics';

	$event_types = array(
		'copy_code',
		'explain_code',
		'explain_line',
		'ask_question',
		'knowledge_check',
		'mark_complete',
	);

	$events = array_fill_keys( $event_types, 0 );

	$summary = array(
		'postId'            => $post_id,
		'totalInteractions' => 0,
		'events'            => $events,
		'blocks'            => array(),
		'explainedLines'    => array(),
		'knowledgeChecks'   => array(
			'attempts'    => 0,
			'correct'     => 0,
			'incorrect'   => 0,
			'correctRate' => 0,
		),
		'questions'         => array(),
		'completionActions' => array(
			'markedComplete' => 0,
			'markedIncomplete' => 0,
		),
	);

	if ( ! $post_id ) {
		return $summary;
	}

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT block_id, event_type, filename, language, metadata
			FROM {$table_name}
			WHERE post_id = %d
			ORDER BY id ASC",
			$post_id
		),
		ARRAY_A
	);

	if ( empty( $rows ) ) {
		return $summary;
	}

	$blocks          = array();
	$explained_lines = array();
	$questions       = array();

	foreach ( $rows as $row ) {
		$event_type = isset( $row['event_type'] ) ? sanitize_key( $row['event_type'] ) : '';

		if ( ! isset( $events[ $event_type ] ) ) {
			continue;
		}

		$summary['totalInteractions']++;
		$summary['events'][ $event_type ]++;

		$block_id = isset( $row['block_id'] ) ? sanitize_text_field( $row['block_id'] ) : '';

		if ( '' !== $block_id ) {
			if ( ! isset( $blocks[ $block_id ] ) ) {
				$blocks[ $block_id ] = array(
					'blockId'      => $block_id,
					'filename'     => isset( $row['filename'] ) ? sanitize_file_name( $row['filename'] ) : '',
					'language'     => isset( $row['language'] ) ? sanitize_text_field( $row['language'] ) : '',
					'interactions' => 0,
					'events'       => $events,
				);
			}

			$blocks[ $block_id ]['interactions']++;
			$blocks[ $block_id ]['events'][ $event_type ]++;
		}

		$metadata = json_decode( (string) $row['metadata'], true );
		$metadata = is_array( $metadata ) ? $metadata : array();

		if ( 'explain_line' === $event_type && isset( $metadata['lineNumber'] ) ) {
			$line_number = absint( $metadata['lineNumber'] );

			if ( $line_number > 0 ) {
				$key = $block_id . ':' . $line_number;

				if ( ! isset( $explained_lines[ $key ] ) ) {
					$explained_lines[ $key ] = array(
						'blockId'    => $block_id,
						'lineNumber' => $line_number,
						'count'      => 0,
					);
				}

				$explained_lines[ $key ]['count']++;
			}
		}

		if ( 'knowledge_check' === $event_type ) {
			$summary['knowledgeChecks']['attempts']++;

			if ( ! empty( $metadata['correct'] ) ) {
				$summary['knowledgeChecks']['correct']++;
			} else {
				$summary['knowledgeChecks']['incorrect']++;
			}
		}

		if ( 'ask_question' === $event_type && ! empty( $metadata['question'] ) ) {
			$question = trim( sanitize_textarea_field( $metadata['question'] ) );

			if ( '' !== $question ) {
				$key = strtolower( $question );

				if ( ! isset( $questions[ $key ] ) ) {
					$questions[ $key ] = array(
						'question' => $question,
						'count'    => 0,
					);
				}

				$questions[ $key ]['count']++;
			}
		}

		if ( 'mark_complete' === $event_type && array_key_exists( 'status', $metadata ) ) {
			if ( (bool) $metadata['status'] ) {
				$summary['completionActions']['markedComplete']++;
			} else {
				$summary['completionActions']['markedIncomplete']++;
			}
		}
	}

	$attempts = $summary['knowledgeChecks']['attempts'];
	if ( $attempts > 0 ) {
		$summary['knowledgeChecks']['correctRate'] = (int) round(
			( $summary['knowledgeChecks']['correct'] / $attempts ) * 100
		);
	}

	$summary['blocks']         = array_values( $blocks );
	$summary['explainedLines'] = array_values( $explained_lines );
	$summary['questions']      = array_values( $questions );

	usort(
		$summary['blocks'],
		static function ( $a, $b ) {
			return $b['interactions'] <=> $a['interactions'];
		}
	);

	usort(
		$summary['explainedLines'],
		static function ( $a, $b ) {
			return $b['count'] <=> $a['count'];
		}
	);

	usort(
		$summary['questions'],
		static function ( $a, $b ) {
			return $b['count'] <=> $a['count'];
		}
	);

	return $summary;
}
