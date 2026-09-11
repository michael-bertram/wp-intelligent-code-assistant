<?php
/**
 * WordPress dashboard view for deterministic reader analytics.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the reader insights dashboard widget for editors.
 */
function intelligent_code_assistant_register_analytics_dashboard_widget() {
	if ( ! current_user_can( 'edit_posts' ) ) {
		return;
	}

	wp_add_dashboard_widget(
		'intelligent-code-assistant-reader-insights',
		__( 'Intelligent Code Assistant — Reader Insights', 'intelligent-code-assistant' ),
		'intelligent_code_assistant_render_analytics_dashboard_widget'
	);
}
add_action( 'wp_dashboard_setup', 'intelligent_code_assistant_register_analytics_dashboard_widget' );

/**
 * Render a compact, deterministic analytics overview in wp-admin Dashboard.
 */
function intelligent_code_assistant_render_analytics_dashboard_widget() {
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
		"SELECT
			post_id,
			COUNT(*) AS interactions,
			SUM(event_type = 'ask_question') AS questions,
			SUM(event_type = 'explain_line') AS explained_lines,
			SUM(event_type = 'knowledge_check') AS knowledge_checks
		FROM {$table_name}
		WHERE post_id > 0
		GROUP BY post_id
		ORDER BY interactions DESC
		LIMIT 5",
		ARRAY_A
	);

	$total_interactions     = isset( $totals['total_interactions'] ) ? (int) $totals['total_interactions'] : 0;
	$articles_with_activity = isset( $totals['articles_with_activity'] ) ? (int) $totals['articles_with_activity'] : 0;

	?>
	<p style="margin-top:0;color:#646970;">
		<?php esc_html_e( 'Deterministic reader interaction data. These figures represent actions, not unique readers.', 'intelligent-code-assistant' ); ?>
	</p>

	<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0;">
		<div style="padding:14px;background:#f6f7f7;border-radius:4px;">
			<strong style="display:block;font-size:24px;line-height:1.2;"><?php echo esc_html( number_format_i18n( $total_interactions ) ); ?></strong>
			<span><?php esc_html_e( 'Total interactions', 'intelligent-code-assistant' ); ?></span>
		</div>
		<div style="padding:14px;background:#f6f7f7;border-radius:4px;">
			<strong style="display:block;font-size:24px;line-height:1.2;"><?php echo esc_html( number_format_i18n( $articles_with_activity ) ); ?></strong>
			<span><?php esc_html_e( 'Articles with activity', 'intelligent-code-assistant' ); ?></span>
		</div>
	</div>

	<?php if ( $total_interactions > 0 ) : ?>
		<table class="widefat striped" style="margin-bottom:16px;">
			<tbody>
				<tr><td><?php esc_html_e( 'Code copies', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $totals['copy_code'] ); ?></strong></td></tr>
				<tr><td><?php esc_html_e( 'Code explanations', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $totals['explain_code'] ); ?></strong></td></tr>
				<tr><td><?php esc_html_e( 'Line explanations', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $totals['explain_line'] ); ?></strong></td></tr>
				<tr><td><?php esc_html_e( 'Reader questions', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $totals['ask_question'] ); ?></strong></td></tr>
				<tr><td><?php esc_html_e( 'Knowledge checks', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $totals['knowledge_check'] ); ?></strong></td></tr>
				<tr><td><?php esc_html_e( 'Completion actions', 'intelligent-code-assistant' ); ?></td><td style="text-align:right;"><strong><?php echo esc_html( (int) $totals['mark_complete'] ); ?></strong></td></tr>
			</tbody>
		</table>
	<?php endif; ?>

	<?php if ( ! empty( $articles ) ) : ?>
		<h3 style="margin-bottom:8px;"><?php esc_html_e( 'Most active articles', 'intelligent-code-assistant' ); ?></h3>
		<table class="widefat striped">
			<thead>
				<tr>
					<th><?php esc_html_e( 'Article', 'intelligent-code-assistant' ); ?></th>
					<th style="text-align:right;"><?php esc_html_e( 'Interactions', 'intelligent-code-assistant' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( $articles as $article ) : ?>
					<?php
					$post_id = absint( $article['post_id'] );
					$title   = get_the_title( $post_id );
					$title   = $title ? $title : sprintf( __( 'Post #%d', 'intelligent-code-assistant' ), $post_id );
					?>
					<tr>
						<td>
							<?php if ( current_user_can( 'edit_post', $post_id ) ) : ?>
								<a href="<?php echo esc_url( get_edit_post_link( $post_id ) ); ?>"><?php echo esc_html( $title ); ?></a>
							<?php else : ?>
								<?php echo esc_html( $title ); ?>
							<?php endif; ?>
							<div style="color:#646970;font-size:12px;margin-top:3px;">
								<?php
								echo esc_html(
									sprintf(
										/* translators: 1: questions, 2: line explanations, 3: knowledge checks. */
										__( '%1$d questions · %2$d line explanations · %3$d checks', 'intelligent-code-assistant' ),
										(int) $article['questions'],
										(int) $article['explained_lines'],
										(int) $article['knowledge_checks']
									)
								);
								?>
							</div>
						</td>
						<td style="text-align:right;"><strong><?php echo esc_html( (int) $article['interactions'] ); ?></strong></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	<?php else : ?>
		<p><?php esc_html_e( 'No reader interactions have been recorded yet.', 'intelligent-code-assistant' ); ?></p>
	<?php endif; ?>
	<?php
}
