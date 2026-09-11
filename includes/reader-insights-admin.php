<?php
/**
 * Dedicated Reader Insights admin screen.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register Reader Insights as a top-level wp-admin screen.
 */
function intelligent_code_assistant_register_reader_insights_admin_page() {
	add_menu_page(
		__( 'Reader Insights', 'intelligent-code-assistant' ),
		__( 'Reader Insights', 'intelligent-code-assistant' ),
		'edit_posts',
		'intelligent-code-assistant-reader-insights',
		'intelligent_code_assistant_render_reader_insights_admin_page',
		'dashicons-chart-area',
		58
	);
}
add_action( 'admin_menu', 'intelligent_code_assistant_register_reader_insights_admin_page' );

/**
 * Render the dedicated analytics workspace.
 */
function intelligent_code_assistant_render_reader_insights_admin_page() {
	if ( ! current_user_can( 'edit_posts' ) ) {
		wp_die( esc_html__( 'You are not allowed to view reader insights.', 'intelligent-code-assistant' ) );
	}

	global $wpdb;
	$table_name = $wpdb->prefix . 'ica_analytics';

	$totals = $wpdb->get_row(
		"SELECT
			COUNT(*) AS total_interactions,
			COUNT(DISTINCT post_id) AS articles_with_activity,
			SUM(event_type = 'copy_code') AS copy_code,
			SUM(event_type = 'explain_code') AS explain_code,
			SUM(event_type = 'explain_line') AS explain_line,
			SUM(event_type = 'ask_question') AS ask_question,
			SUM(event_type = 'knowledge_check') AS knowledge_check,
			SUM(event_type = 'mark_complete') AS mark_complete
		FROM {$table_name}
		WHERE post_id > 0",
		ARRAY_A
	);

	$articles = $wpdb->get_results(
		"SELECT post_id, COUNT(*) AS interactions,
			SUM(event_type = 'copy_code') AS copies,
			SUM(event_type = 'explain_code') AS explanations,
			SUM(event_type = 'explain_line') AS explained_lines,
			SUM(event_type = 'ask_question') AS questions,
			SUM(event_type = 'knowledge_check') AS knowledge_checks,
			SUM(event_type = 'mark_complete') AS completion_actions,
			MAX(created_at) AS last_activity
		FROM {$table_name}
		WHERE post_id > 0
		GROUP BY post_id
		ORDER BY interactions DESC",
		ARRAY_A
	);

	$total_interactions = (int) ( $totals['total_interactions'] ?? 0 );
	$active_articles    = (int) ( $totals['articles_with_activity'] ?? 0 );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Reader Insights', 'intelligent-code-assistant' ); ?></h1>
		<p class="description" style="max-width:760px;">
			<?php esc_html_e( 'Explore deterministic reader interaction data across your intelligent code articles. These figures represent actions, not unique readers.', 'intelligent-code-assistant' ); ?>
		</p>

		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;max-width:1000px;margin:24px 0;">
			<?php
			$cards = array(
				__( 'Total interactions', 'intelligent-code-assistant' ) => $total_interactions,
				__( 'Active articles', 'intelligent-code-assistant' ) => $active_articles,
				__( 'Reader questions', 'intelligent-code-assistant' ) => (int) ( $totals['ask_question'] ?? 0 ),
				__( 'Line explanations', 'intelligent-code-assistant' ) => (int) ( $totals['explain_line'] ?? 0 ),
				__( 'Knowledge checks', 'intelligent-code-assistant' ) => (int) ( $totals['knowledge_check'] ?? 0 ),
			);
			foreach ( $cards as $label => $value ) :
				?>
				<div style="background:#fff;border:1px solid #dcdcde;border-radius:4px;padding:18px;box-shadow:0 1px 1px rgba(0,0,0,.04);">
					<strong style="display:block;font-size:28px;line-height:1.2;margin-bottom:5px;"><?php echo esc_html( number_format_i18n( $value ) ); ?></strong>
					<span><?php echo esc_html( $label ); ?></span>
				</div>
			<?php endforeach; ?>
		</div>

		<h2><?php esc_html_e( 'Interaction breakdown', 'intelligent-code-assistant' ); ?></h2>
		<table class="widefat striped" style="max-width:1000px;margin-bottom:28px;">
			<thead><tr><th><?php esc_html_e( 'Interaction', 'intelligent-code-assistant' ); ?></th><th style="text-align:right;"><?php esc_html_e( 'Actions', 'intelligent-code-assistant' ); ?></th></tr></thead>
			<tbody>
				<tr><td><?php esc_html_e( 'Code copies', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><?php echo esc_html( (int) ( $totals['copy_code'] ?? 0 ) ); ?></td></tr>
				<tr><td><?php esc_html_e( 'Code explanations', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><?php echo esc_html( (int) ( $totals['explain_code'] ?? 0 ) ); ?></td></tr>
				<tr><td><?php esc_html_e( 'Line explanations', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><?php echo esc_html( (int) ( $totals['explain_line'] ?? 0 ) ); ?></td></tr>
				<tr><td><?php esc_html_e( 'Reader questions', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><?php echo esc_html( (int) ( $totals['ask_question'] ?? 0 ) ); ?></td></tr>
				<tr><td><?php esc_html_e( 'Knowledge checks', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><?php echo esc_html( (int) ( $totals['knowledge_check'] ?? 0 ) ); ?></td></tr>
				<tr><td><?php esc_html_e( 'Completion actions', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><?php echo esc_html( (int) ( $totals['mark_complete'] ?? 0 ) ); ?></td></tr>
			</tbody>
		</table>

		<h2><?php esc_html_e( 'Articles', 'intelligent-code-assistant' ); ?></h2>
		<?php if ( $articles ) : ?>
			<table class="widefat striped" style="max-width:1200px;">
				<thead><tr>
					<th><?php esc_html_e( 'Article', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Interactions', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Questions', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Line explains', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Checks', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Last activity', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Actions', 'intelligent-code-assistant' ); ?></th>
				</tr></thead>
				<tbody>
				<?php foreach ( $articles as $article ) :
					$post_id = absint( $article['post_id'] );
					if ( ! current_user_can( 'edit_post', $post_id ) ) { continue; }
					$title = get_the_title( $post_id ) ?: sprintf( __( 'Post #%d', 'intelligent-code-assistant' ), $post_id );
					$detail_url = add_query_arg( array( 'page' => 'intelligent-code-assistant-reader-insights', 'post_id' => $post_id ), admin_url( 'admin.php' ) );
					?>
					<tr>
						<td><strong><?php echo esc_html( $title ); ?></strong></td>
						<td><?php echo esc_html( (int) $article['interactions'] ); ?></td>
						<td><?php echo esc_html( (int) $article['questions'] ); ?></td>
						<td><?php echo esc_html( (int) $article['explained_lines'] ); ?></td>
						<td><?php echo esc_html( (int) $article['knowledge_checks'] ); ?></td>
						<td><?php echo esc_html( $article['last_activity'] ? mysql2date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $article['last_activity'] ) : '—' ); ?></td>
						<td><a href="<?php echo esc_url( $detail_url ); ?>"><?php esc_html_e( 'View insights', 'intelligent-code-assistant' ); ?></a></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php else : ?>
			<p><?php esc_html_e( 'No reader interactions have been recorded yet.', 'intelligent-code-assistant' ); ?></p>
		<?php endif; ?>
	</div>
	<?php
}
