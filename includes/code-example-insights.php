<?php
/**
 * Concept-level analytics and editorial insights for canonical Code Snippets.
 *
 * @package IntelligentCodeAssistant
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Keep canonical Code Snippet blocks self-unlinked. */
function intelligent_code_assistant_normalize_canonical_code_example_block( $post_id, $post ) {
	if ( 'ica_code_example' !== $post->post_type || wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
		return;
	}
	$blocks = parse_blocks( $post->post_content );
	if ( 1 !== count( $blocks ) || 'wpe/intelligent-code-assistant' !== ( $blocks[0]['blockName'] ?? '' ) || 0 === absint( $blocks[0]['attrs']['codeExampleId'] ?? 0 ) ) {
		return;
	}
	$blocks[0]['attrs']['codeExampleId'] = 0;
	remove_action( 'save_post_ica_code_example', 'intelligent_code_assistant_normalize_canonical_code_example_block', 20 );
	wp_update_post( array( 'ID' => $post_id, 'post_content' => serialize_blocks( $blocks ) ) );
	add_action( 'save_post_ica_code_example', 'intelligent_code_assistant_normalize_canonical_code_example_block', 20, 2 );
}

remove_action( 'save_post_ica_code_example', 'intelligent_code_assistant_bind_canonical_code_example_block', 10 );
add_action( 'save_post_ica_code_example', 'intelligent_code_assistant_normalize_canonical_code_example_block', 20, 2 );

/** Build deterministic analytics for one semantic Code Snippet. */
function intelligent_code_assistant_get_code_example_analytics_summary( $code_example_id ) {
	global $wpdb;
	$code_example_id = absint( $code_example_id );
	$table_name      = $wpdb->prefix . 'ica_analytics';
	$events          = array_fill_keys( array( 'copy_code', 'explain_code', 'explain_line', 'ask_question', 'knowledge_check', 'mark_complete' ), 0 );
	$summary         = array(
		'codeExampleId' => $code_example_id,
		'totalInteractions' => 0,
		'events' => $events,
		'articles' => array(),
		'explainedLines' => array(),
		'questions' => array(),
		'knowledgeChecks' => array( 'attempts' => 0, 'correct' => 0, 'incorrect' => 0, 'correctRate' => 0 ),
	);
	if ( ! $code_example_id || 'ica_code_example' !== get_post_type( $code_example_id ) ) {
		return $summary;
	}
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT post_id, block_id, event_type, metadata FROM {$table_name} WHERE code_example_id = %d ORDER BY id ASC", $code_example_id ), ARRAY_A );
	$articles = array();
	$lines = array();
	$questions = array();
	foreach ( $rows as $row ) {
		$event = sanitize_key( $row['event_type'] ?? '' );
		if ( ! isset( $events[ $event ] ) ) { continue; }
		$summary['totalInteractions']++;
		$summary['events'][ $event ]++;
		$post_id = absint( $row['post_id'] ?? 0 );
		if ( $post_id ) {
			if ( ! isset( $articles[ $post_id ] ) ) {
				$articles[ $post_id ] = array( 'postId' => $post_id, 'title' => get_the_title( $post_id ) ?: sprintf( __( 'Post #%d', 'intelligent-code-assistant' ), $post_id ), 'interactions' => 0, 'events' => $events );
			}
			$articles[ $post_id ]['interactions']++;
			$articles[ $post_id ]['events'][ $event ]++;
		}
		$metadata = json_decode( (string) ( $row['metadata'] ?? '' ), true );
		$metadata = is_array( $metadata ) ? $metadata : array();
		if ( 'explain_line' === $event && ! empty( $metadata['lineNumber'] ) ) {
			$line = absint( $metadata['lineNumber'] );
			if ( $line ) {
				if ( ! isset( $lines[ $line ] ) ) { $lines[ $line ] = array( 'lineNumber' => $line, 'count' => 0 ); }
				$lines[ $line ]['count']++;
			}
		}
		if ( 'ask_question' === $event && ! empty( $metadata['question'] ) ) {
			$question = trim( sanitize_textarea_field( $metadata['question'] ) );
			$key = strtolower( $question );
			if ( $question ) {
				if ( ! isset( $questions[ $key ] ) ) { $questions[ $key ] = array( 'question' => $question, 'count' => 0 ); }
				$questions[ $key ]['count']++;
			}
		}
		if ( 'knowledge_check' === $event ) {
			$summary['knowledgeChecks']['attempts']++;
			if ( ! empty( $metadata['correct'] ) ) { $summary['knowledgeChecks']['correct']++; } else { $summary['knowledgeChecks']['incorrect']++; }
		}
	}
	if ( $summary['knowledgeChecks']['attempts'] ) {
		$summary['knowledgeChecks']['correctRate'] = (int) round( ( $summary['knowledgeChecks']['correct'] / $summary['knowledgeChecks']['attempts'] ) * 100 );
	}
	$summary['articles'] = array_values( $articles );
	$summary['explainedLines'] = array_values( $lines );
	$summary['questions'] = array_values( $questions );
	usort( $summary['articles'], static fn( $a, $b ) => $b['interactions'] <=> $a['interactions'] );
	usort( $summary['explainedLines'], static fn( $a, $b ) => $b['count'] <=> $a['count'] );
	usort( $summary['questions'], static fn( $a, $b ) => $b['count'] <=> $a['count'] );
	return $summary;
}

/** Register concept-level Reader Insights. */
function intelligent_code_assistant_register_code_example_insights_page() {
	add_submenu_page( 'intelligent-code-assistant', __( 'Code Snippet Insights', 'intelligent-code-assistant' ), __( 'Code Snippet Insights', 'intelligent-code-assistant' ), 'edit_posts', 'intelligent-code-assistant-code-examples', 'intelligent_code_assistant_render_code_example_insights_page' );
}
add_action( 'admin_menu', 'intelligent_code_assistant_register_code_example_insights_page', 20 );

/** Render the Code Snippet Insights overview. */
function intelligent_code_assistant_render_code_example_insights_page() {
	if ( ! current_user_can( 'edit_posts' ) ) { wp_die( esc_html__( 'You are not allowed to view reader insights.', 'intelligent-code-assistant' ) ); }
	$id = isset( $_GET['code_example_id'] ) ? absint( wp_unslash( $_GET['code_example_id'] ) ) : 0;
	if ( $id ) { intelligent_code_assistant_render_code_example_insights_detail( $id ); return; }
	global $wpdb;
	$table = $wpdb->prefix . 'ica_analytics';
	$rows = $wpdb->get_results( "SELECT code_example_id, COUNT(*) interactions, COUNT(DISTINCT post_id) articles, SUM(event_type='ask_question') questions, SUM(event_type='explain_line') line_explains, MAX(created_at) last_activity FROM {$table} WHERE code_example_id > 0 GROUP BY code_example_id ORDER BY interactions DESC", ARRAY_A );
	?>
	<div class="wrap ica-insights-workspace ica-code-example-insights">
		<header class="ica-page-header">
			<h1><?php esc_html_e( 'Code Snippet Insights', 'intelligent-code-assistant' ); ?></h1>
			<p class="description"><?php esc_html_e( 'Concept-level interaction data aggregated across every article that references the same canonical Code Snippet. Counts are actions, not unique readers.', 'intelligent-code-assistant' ); ?></p>
		</header>
		<?php if ( $rows ) : ?>
			<section class="ica-insights-section" aria-labelledby="ica-code-example-activity-heading">
				<h2 id="ica-code-example-activity-heading" class="screen-reader-text"><?php esc_html_e( 'Code Snippet activity', 'intelligent-code-assistant' ); ?></h2>
				<div class="ica-table-wrap"><table class="widefat striped ica-insights-table"><thead><tr><th><?php esc_html_e( 'Code Snippet', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Interactions', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Articles', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Questions', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Line explains', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Last activity', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Actions', 'intelligent-code-assistant' ); ?></th></tr></thead><tbody>
				<?php foreach ( $rows as $row ) : $eid = absint( $row['code_example_id'] ); if ( 'ica_code_example' !== get_post_type( $eid ) || ! current_user_can( 'edit_post', $eid ) ) { continue; } $url = add_query_arg( array( 'page' => 'intelligent-code-assistant-code-examples', 'code_example_id' => $eid ), admin_url( 'admin.php' ) ); ?>
					<tr><td><strong><?php echo esc_html( get_the_title( $eid ) ?: sprintf( __( 'Code Snippet #%d', 'intelligent-code-assistant' ), $eid ) ); ?></strong></td><td><?php echo esc_html( (int) $row['interactions'] ); ?></td><td><?php echo esc_html( (int) $row['articles'] ); ?></td><td><?php echo esc_html( (int) $row['questions'] ); ?></td><td><?php echo esc_html( (int) $row['line_explains'] ); ?></td><td><?php echo esc_html( $row['last_activity'] ? mysql2date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $row['last_activity'] ) : '—' ); ?></td><td><a class="ica-action-link" href="<?php echo esc_url( $url ); ?>"><?php esc_html_e( 'View insights', 'intelligent-code-assistant' ); ?></a></td></tr>
				<?php endforeach; ?></tbody></table></div>
			</section>
		<?php else : ?>
			<div class="ica-empty-state"><h2><?php esc_html_e( 'No Code Snippet activity yet', 'intelligent-code-assistant' ); ?></h2><p><?php esc_html_e( 'Interactions will appear here once readers use canonical Code Snippets in published articles.', 'intelligent-code-assistant' ); ?></p></div>
		<?php endif; ?>
	</div>
	<?php
}

/** Render one Code Snippet's concept-level analytics. */
function intelligent_code_assistant_render_code_example_insights_detail( $id ) {
	$post = get_post( $id );
	if ( ! $post || 'ica_code_example' !== $post->post_type || ! current_user_can( 'edit_post', $id ) ) { wp_die( esc_html__( 'You are not allowed to view insights for this Code Snippet.', 'intelligent-code-assistant' ) ); }
	$s = intelligent_code_assistant_get_code_example_analytics_summary( $id );
	$back = add_query_arg( 'page', 'intelligent-code-assistant-code-examples', admin_url( 'admin.php' ) );
	$stats = array( __( 'Interactions', 'intelligent-code-assistant' ) => $s['totalInteractions'], __( 'Articles', 'intelligent-code-assistant' ) => count( $s['articles'] ), __( 'Questions', 'intelligent-code-assistant' ) => $s['events']['ask_question'], __( 'Line explains', 'intelligent-code-assistant' ) => $s['events']['explain_line'], __( 'Correct rate', 'intelligent-code-assistant' ) => $s['knowledgeChecks']['correctRate'] . '%' );
	?>
	<div class="wrap ica-insights-workspace ica-code-example-insights ica-insights-detail">
		<nav class="ica-back-nav"><a href="<?php echo esc_url( $back ); ?>">&larr; <?php esc_html_e( 'Back to Code Snippet Insights', 'intelligent-code-assistant' ); ?></a></nav>
		<header class="ica-page-header"><h1><?php echo esc_html( get_the_title( $id ) ?: sprintf( __( 'Code Snippet #%d', 'intelligent-code-assistant' ), $id ) ); ?></h1><p class="description"><?php printf( esc_html__( '%1$d recorded interactions across %2$d article(s). These are actions, not unique readers.', 'intelligent-code-assistant' ), (int) $s['totalInteractions'], count( $s['articles'] ) ); ?></p></header>
		<div class="ica-stat-grid">
			<?php foreach ( $stats as $label => $value ) : ?><div class="ica-stat-card"><strong><?php echo esc_html( $value ); ?></strong><span><?php echo esc_html( $label ); ?></span></div><?php endforeach; ?>
		</div>
		<section class="ica-insights-section"><div class="ica-section-heading"><h2><?php esc_html_e( 'Articles using this snippet', 'intelligent-code-assistant' ); ?></h2><span class="ica-section-count"><?php echo esc_html( count( $s['articles'] ) ); ?></span></div>
			<?php if ( $s['articles'] ) : ?><div class="ica-table-wrap"><table class="widefat striped ica-insights-table"><thead><tr><th><?php esc_html_e( 'Article', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Interactions', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Questions', 'intelligent-code-assistant' ); ?></th><th><?php esc_html_e( 'Line explains', 'intelligent-code-assistant' ); ?></th></tr></thead><tbody><?php foreach ( $s['articles'] as $a ) : ?><tr><td><strong><?php echo esc_html( $a['title'] ); ?></strong></td><td><?php echo esc_html( (int) $a['interactions'] ); ?></td><td><?php echo esc_html( (int) $a['events']['ask_question'] ); ?></td><td><?php echo esc_html( (int) $a['events']['explain_line'] ); ?></td></tr><?php endforeach; ?></tbody></table></div><?php else : ?><div class="ica-empty-state ica-empty-state--compact"><p><?php esc_html_e( 'No article interactions have been recorded for this snippet yet.', 'intelligent-code-assistant' ); ?></p></div><?php endif; ?>
		</section>
		<div class="ica-insights-grid">
			<section class="ica-insights-section"><h2><?php esc_html_e( 'Most explained lines', 'intelligent-code-assistant' ); ?></h2><?php if ( $s['explainedLines'] ) : ?><div class="ica-table-wrap"><table class="widefat striped ica-insights-table ica-insights-table--compact"><tbody><?php foreach ( array_slice( $s['explainedLines'], 0, 10 ) as $line ) : ?><tr><td><?php printf( esc_html__( 'Line %d', 'intelligent-code-assistant' ), (int) $line['lineNumber'] ); ?></td><td class="ica-count-cell"><strong><?php echo esc_html( (int) $line['count'] ); ?></strong></td></tr><?php endforeach; ?></tbody></table></div><?php else : ?><div class="ica-empty-state ica-empty-state--compact"><p><?php esc_html_e( 'No line explanations recorded.', 'intelligent-code-assistant' ); ?></p></div><?php endif; ?></section>
			<section class="ica-insights-section"><h2><?php esc_html_e( 'Common questions', 'intelligent-code-assistant' ); ?></h2><?php if ( $s['questions'] ) : ?><div class="ica-table-wrap"><table class="widefat striped ica-insights-table ica-insights-table--compact"><tbody><?php foreach ( array_slice( $s['questions'], 0, 10 ) as $q ) : ?><tr><td><?php echo esc_html( $q['question'] ); ?></td><td class="ica-count-cell"><strong><?php echo esc_html( (int) $q['count'] ); ?></strong></td></tr><?php endforeach; ?></tbody></table></div><?php else : ?><div class="ica-empty-state ica-empty-state--compact"><p><?php esc_html_e( 'No questions recorded.', 'intelligent-code-assistant' ); ?></p></div><?php endif; ?></section>
		</div>
		<footer class="ica-page-actions"><a class="button" href="<?php echo esc_url( get_edit_post_link( $id ) ); ?>"><?php esc_html_e( 'Edit Code Snippet', 'intelligent-code-assistant' ); ?></a></footer>
	</div>
	<?php
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'intelligent-code-assistant/v1', '/code-example-analytics-summary', array(
		'methods' => WP_REST_Server::READABLE,
		'callback' => function( WP_REST_Request $request ) { return rest_ensure_response( intelligent_code_assistant_get_code_example_analytics_summary( absint( $request->get_param( 'codeExampleId' ) ) ) ); },
		'permission_callback' => function( WP_REST_Request $request ) { $id = absint( $request->get_param( 'codeExampleId' ) ); return $id && current_user_can( 'edit_post', $id ); },
		'args' => array( 'codeExampleId' => array( 'required' => true, 'type' => 'integer', 'minimum' => 1, 'sanitize_callback' => 'absint' ) ),
	) );
} );
