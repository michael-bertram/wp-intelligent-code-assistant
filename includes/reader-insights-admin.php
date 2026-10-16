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

	$post_id = isset( $_GET['post_id'] ) ? absint( wp_unslash( $_GET['post_id'] ) ) : 0;

	if ( $post_id ) {
		intelligent_code_assistant_render_reader_insights_article( $post_id );
		return;
	}

	intelligent_code_assistant_render_reader_insights_overview();
}

/**
 * Render the all-articles overview.
 */
function intelligent_code_assistant_render_reader_insights_overview() {
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

/**
 * Render detailed analytics for one article.
 *
 * @param int $post_id Post ID.
 */
function intelligent_code_assistant_render_reader_insights_article( $post_id ) {
	$post = get_post( $post_id );

	if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( esc_html__( 'You are not allowed to view insights for this article.', 'intelligent-code-assistant' ) );
	}

	$summary  = intelligent_code_assistant_get_analytics_summary( $post_id );
	$title    = get_the_title( $post_id ) ?: sprintf( __( 'Post #%d', 'intelligent-code-assistant' ), $post_id );
	$back_url = add_query_arg( 'page', 'intelligent-code-assistant-reader-insights', admin_url( 'admin.php' ) );
	$edit_url = get_edit_post_link( $post_id );
	?>
	<div class="wrap">
		<p style="margin:12px 0 8px;"><a href="<?php echo esc_url( $back_url ); ?>">&larr; <?php esc_html_e( 'Back to Reader Insights', 'intelligent-code-assistant' ); ?></a></p>
		<h1><?php echo esc_html( $title ); ?></h1>
		<p class="description" style="max-width:760px;">
			<?php esc_html_e( 'Detailed reader interaction data for this article. These are recorded actions, not unique-reader metrics.', 'intelligent-code-assistant' ); ?>
		</p>

		<?php if ( $edit_url ) : ?>
			<p><a class="button" href="<?php echo esc_url( $edit_url ); ?>"><?php esc_html_e( 'Edit article', 'intelligent-code-assistant' ); ?></a></p>
		<?php endif; ?>

		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;max-width:1100px;margin:24px 0;">
			<?php
			$cards = array(
				__( 'Total interactions', 'intelligent-code-assistant' ) => (int) $summary['totalInteractions'],
				__( 'Reader questions', 'intelligent-code-assistant' ) => (int) $summary['events']['ask_question'],
				__( 'Line explanations', 'intelligent-code-assistant' ) => (int) $summary['events']['explain_line'],
				__( 'Knowledge checks', 'intelligent-code-assistant' ) => (int) $summary['knowledgeChecks']['attempts'],
				__( 'Correct rate', 'intelligent-code-assistant' ) => (int) $summary['knowledgeChecks']['correctRate'] . '%',
			);
			foreach ( $cards as $label => $value ) :
				?>
				<div style="background:#fff;border:1px solid #dcdcde;border-radius:4px;padding:18px;box-shadow:0 1px 1px rgba(0,0,0,.04);">
					<strong style="display:block;font-size:28px;line-height:1.2;margin-bottom:5px;"><?php echo esc_html( $value ); ?></strong>
					<span><?php echo esc_html( $label ); ?></span>
				</div>
			<?php endforeach; ?>
		</div>

		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:24px;max-width:1200px;align-items:start;">
			<div>
				<h2><?php esc_html_e( 'Interaction breakdown', 'intelligent-code-assistant' ); ?></h2>
				<table class="widefat striped">
					<tbody>
						<tr><td><?php esc_html_e( 'Code copies', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['events']['copy_code'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Code explanations', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['events']['explain_code'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Line explanations', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['events']['explain_line'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Reader questions', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['events']['ask_question'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Knowledge checks', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['events']['knowledge_check'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Completion actions', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['events']['mark_complete'] ); ?></strong></td></tr>
					</tbody>
				</table>
			</div>

			<div>
				<h2><?php esc_html_e( 'Knowledge check performance', 'intelligent-code-assistant' ); ?></h2>
				<table class="widefat striped">
					<tbody>
						<tr><td><?php esc_html_e( 'Attempts', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['knowledgeChecks']['attempts'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Correct', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['knowledgeChecks']['correct'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Incorrect', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['knowledgeChecks']['incorrect'] ); ?></strong></td></tr>
						<tr><td><?php esc_html_e( 'Correct rate', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['knowledgeChecks']['correctRate'] ); ?>%</strong></td></tr>
					</tbody>
				</table>
			</div>
		</div>

		<h2 style="margin-top:28px;"><?php esc_html_e( 'Most active code blocks', 'intelligent-code-assistant' ); ?></h2>
		<?php if ( ! empty( $summary['blocks'] ) ) : ?>
			<table class="widefat striped" style="max-width:1200px;">
				<thead><tr>
					<th><?php esc_html_e( 'Code block', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Language', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Interactions', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Questions', 'intelligent-code-assistant' ); ?></th>
					<th><?php esc_html_e( 'Line explains', 'intelligent-code-assistant' ); ?></th>
				</tr></thead>
				<tbody>
				<?php foreach ( array_slice( $summary['blocks'], 0, 10 ) as $block ) : ?>
					<tr>
						<td><strong><?php echo esc_html( $block['filename'] ?: $block['blockId'] ); ?></strong><br><span style="color:#646970;font-size:12px;"><?php echo esc_html( $block['blockId'] ); ?></span></td>
						<td><?php echo esc_html( $block['language'] ?: '—' ); ?></td>
						<td><?php echo esc_html( (int) $block['interactions'] ); ?></td>
						<td><?php echo esc_html( (int) $block['events']['ask_question'] ); ?></td>
						<td><?php echo esc_html( (int) $block['events']['explain_line'] ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php else : ?>
			<p><?php esc_html_e( 'No code block interactions have been recorded for this article.', 'intelligent-code-assistant' ); ?></p>
		<?php endif; ?>

		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:24px;max-width:1200px;margin-top:28px;align-items:start;">
			<div>
				<h2><?php esc_html_e( 'Most explained lines', 'intelligent-code-assistant' ); ?></h2>
				<?php if ( ! empty( $summary['explainedLines'] ) ) : ?>
					<table class="widefat striped">
						<thead><tr><th><?php esc_html_e( 'Block / line', 'intelligent-code-assistant' ); ?></th><th style="text-align:right;"><?php esc_html_e( 'Explains', 'intelligent-code-assistant' ); ?></th></tr></thead>
						<tbody>
						<?php foreach ( array_slice( $summary['explainedLines'], 0, 10 ) as $line ) : ?>
							<tr><td><?php echo esc_html( $line['blockId'] ); ?> · <?php printf( esc_html__( 'Line %d', 'intelligent-code-assistant' ), (int) $line['lineNumber'] ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $line['count'] ); ?></strong></td></tr>
						<?php endforeach; ?>
						</tbody>
					</table>
				<?php else : ?>
					<p><?php esc_html_e( 'No line explanation activity has been recorded.', 'intelligent-code-assistant' ); ?></p>
				<?php endif; ?>
			</div>

			<div>
				<h2><?php esc_html_e( 'Common reader questions', 'intelligent-code-assistant' ); ?></h2>
				<?php if ( ! empty( $summary['questions'] ) ) : ?>
					<table class="widefat striped">
						<thead><tr><th><?php esc_html_e( 'Question', 'intelligent-code-assistant' ); ?></th><th style="text-align:right;"><?php esc_html_e( 'Times asked', 'intelligent-code-assistant' ); ?></th></tr></thead>
						<tbody>
						<?php foreach ( array_slice( $summary['questions'], 0, 10 ) as $question ) : ?>
							<tr><td><?php echo esc_html( $question['question'] ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $question['count'] ); ?></strong></td></tr>
						<?php endforeach; ?>
						</tbody>
					</table>
				<?php else : ?>
					<p><?php esc_html_e( 'No reader questions have been recorded.', 'intelligent-code-assistant' ); ?></p>
				<?php endif; ?>
			</div>
		</div>

		<h2 style="margin-top:28px;"><?php esc_html_e( 'Completion actions', 'intelligent-code-assistant' ); ?></h2>
		<table class="widefat striped" style="max-width:600px;">
			<tbody>
				<tr><td><?php esc_html_e( 'Marked complete', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['completionActions']['markedComplete'] ); ?></strong></td></tr>
				<tr><td><?php esc_html_e( 'Marked incomplete', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $summary['completionActions']['markedIncomplete'] ); ?></strong></td></tr>
			</tbody>
		</table>

		<div style="margin-top:32px;padding:20px;background:#fff;border:1px solid #dcdcde;border-radius:4px;max-width:1160px;">
			<h2 style="margin-top:0;"><?php esc_html_e( 'AI editorial insights', 'intelligent-code-assistant' ); ?></h2>
			<p><?php esc_html_e( 'This section will use the deterministic facts above as context for editorial analysis. AI interpretation will be added next.', 'intelligent-code-assistant' ); ?></p>
			<button class="button button-primary" type="button" disabled><?php esc_html_e( 'Generate AI insights', 'intelligent-code-assistant' ); ?></button>
		</div>
	</div>
	<?php
}
