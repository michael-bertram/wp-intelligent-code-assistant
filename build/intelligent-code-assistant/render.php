<?php
/**
 * Render Template: Intelligent Code Assistant block.
 *
 * Provides the code presentation UI and the inline AI explanation experience.
 */

$persistent_id   = ! empty( $attributes['id'] ) ? $attributes['id'] : wp_unique_id( 'wpe-code-' );
$show_badge      = $attributes['showLanguageBadge'] ?? true;
$code_lang       = $attributes['codeLanguage'] ?? 'PHP';
$is_dark         = $attributes['isDarkMode'] ?? false;
$is_compact      = $attributes['isCompact'] ?? false;
$font_size       = $attributes['fontSize'] ?? '14px';
$max_height      = $attributes['maxHeight'] ?? 'none';
$show_lines      = $attributes['showLineNumbers'] ?? false;
$highlight_lines = $attributes['highlightLines'] ?? '';

$theme_class   = $is_dark ? 'dark-theme' : '';
$compact_class = $is_compact ? 'is-compact' : '';
$lines_class   = $show_lines ? 'has-line-numbers' : '';

$inline_styles = sprintf(
	'style="--editor-code-font-size: %s; --panel-max-height: %s;"',
	esc_attr( $font_size ),
	esc_attr( $max_height )
);

$inner_blocks = $block->parsed_block['innerBlocks'] ?? array();
$title_html   = '';
$content_html = '';

foreach ( $inner_blocks as $inner_block ) {
	if ( isset( $inner_block['blockName'] ) && 'wpe/code-header' === $inner_block['blockName'] ) {
		$title_html = render_block( $inner_block );
	} elseif ( isset( $inner_block['blockName'] ) && 'wpe/code-content' === $inner_block['blockName'] ) {
		$content_html = render_block( $inner_block );
	}
}

$line_gutter_html = '';
$character_count  = 0;
$line_count       = 1;
$raw_code_text    = '';

if ( ! empty( $content_html ) ) {
	$clean_breaks  = preg_replace( '/<br\s*\/?>/i', "\n", $content_html );
	$clean_breaks  = preg_replace( '/<\/p><p>/i', "\n", $clean_breaks );
	$clean_breaks  = preg_replace( '/<\/div><div>/i', "\n", $clean_breaks );
	$raw_code_text = trim( str_replace( "\r", '', strip_tags( $clean_breaks ) ) );
	$character_count = strlen( $raw_code_text );

	$lines = array_map(
		function( $line ) {
			return trim( $line, " \t\n\r\0\x0B\xC2\xA0" );
		},
		explode( "\n", $raw_code_text )
	);

	while ( ! empty( $lines ) && end( $lines ) === '' ) {
		array_pop( $lines );
	}

	$line_count = ! empty( $lines ) ? count( $lines ) : 1;

	if ( $show_lines ) {
		$line_gutter_html .= '<div class="line-numbers-gutter" aria-hidden="true">';
		for ( $i = 1; $i <= $line_count; $i++ ) {
			$line_gutter_html .= '<span>' . $i . '</span>';
		}
		$line_gutter_html .= '</div>';
	}
}

$prism_lang_map = array(
	'PHP'        => 'php',
	'JavaScript' => 'javascript',
	'JS'         => 'javascript',
	'CSS'        => 'css',
	'HTML'       => 'markup',
	'JSON'       => 'json',
);
$selected_lang = $prism_lang_map[ $code_lang ] ?? 'plaintext';
?>

<div
	data-wp-interactive="wpe"
	data-wp-init="callbacks.initTask"
	data-wp-class--complete="context.isComplete"
	<?php echo $inline_styles; ?>
	<?php echo get_block_wrapper_attributes( array(
		'class' => esc_attr( trim( "wp-block-wpe-intelligent-code-assistant-editor $theme_class $compact_class $lines_class" ) ),
	) ); ?>
	<?php echo wp_interactivity_data_wp_context( array(
		'id'                     => $persistent_id,
		'isOpen'                 => false,
		'openText'               => '+',
		'closeText'              => '-',
		'toggleText'             => '+',
		'isComplete'             => false,
		'isCopied'               => false,
		'isExplaining'           => false,
		'isAnalyzingExplanation' => false,
		'explanationText'        => '',
		'explanationItems'       => array(),
		'explanationError'       => '',
		'activeCodeText'         => $raw_code_text,
		'codeLanguage'           => $code_lang,
		'highlightLines'         => $highlight_lines,
		'rawCodeText'            => $raw_code_text,
		'completeText'            => esc_html__( 'Done', 'intelligent-code-assistant' ),
	) ); ?>
>
	<div class="editor-combined-container">
		<div class="code-header">
			<div class="code-title-container">
				<div class="code-title">
					<?php echo ! empty( trim( strip_tags( $title_html ) ) ) ? wp_kses_post( $title_html ) : '<h3>' . esc_html__( 'Untitled Snippet', 'intelligent-code-assistant' ) . '</h3>'; ?>
				</div>
				<?php if ( true === $show_badge ) : ?>
					<span class="code-badge lang-<?php echo esc_attr( strtolower( $code_lang ) ); ?>">
						<?php echo esc_html( $code_lang ); ?>
					</span>
				<?php endif; ?>
			</div>

			<div class="code-actions">
				<button class="copy-button" type="button" data-wp-on--click="actions.copyToClipboard" data-wp-class--copied="context.isCopied" aria-label="<?php esc_attr_e( 'Copy code to clipboard', 'intelligent-code-assistant' ); ?>">
					<svg class="icon-copy" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
					<svg class="icon-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
				</button>

				<button class="toggle-button" type="button" data-wp-on--click="actions.toggleOpen">
					<span data-wp-text="context.toggleText"></span>
				</button>
			</div>
		</div>

		<div class="editor-inner-blocks-wrapper" data-wp-class--active="context.isOpen">
			<div class="panel-scroll-container">
				<div class="panel-content-flex-wrapper">
					<?php echo $line_gutter_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
					<div class="panel-content">
						<pre><code class="language-<?php echo esc_attr( $selected_lang ); ?>" data-wp-text="context.activeCodeText"><?php echo esc_html( $raw_code_text ); ?></code></pre>
					</div>
				</div>
			</div>
		</div>

		<div class="code-explanation-drawer" data-wp-bind--hidden="!context.isExplaining">
			<div class="explanation-inner">
				<div class="explanation-header">
					<div class="explanation-title">
						<svg class="ai-sparkle-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
						</svg>
						<span><?php esc_html_e( 'Code Explanation', 'intelligent-code-assistant' ); ?></span>
					</div>
					<button type="button" class="explanation-close-btn" data-wp-on--click="actions.closeExplanation" aria-label="<?php esc_attr_e( 'Close explanation', 'intelligent-code-assistant' ); ?>">&times;</button>
				</div>

				<div class="explanation-loading-container" data-wp-bind--hidden="!context.isAnalyzingExplanation" data-wp-class--is-hidden="!context.isAnalyzingExplanation" aria-live="polite">
					<div class="spinner-status-bar">
						<span class="spinner-icon" aria-hidden="true"></span>
						<span class="spinner-text"><?php esc_html_e( 'Analyzing code logic with AI...', 'intelligent-code-assistant' ); ?></span>
					</div>
					<div class="explanation-skeleton" aria-hidden="true">
						<div class="skeleton-line shimmer"></div>
						<div class="skeleton-line shimmer short"></div>
						<div class="skeleton-line shimmer medium"></div>
					</div>
				</div>

				<div class="explanation-content" data-wp-bind--hidden="context.isAnalyzingExplanation || !context.explanationItems.length">
					<div class="explanation-formatted-list">
						<template data-wp-each="context.explanationItems">
							<div class="explanation-bullet-item">
								<span class="bullet-badge" aria-hidden="true"></span>
								<div class="bullet-text" data-wp-text="context.item"></div>
							</div>
						</template>
					</div>
				</div>

				<div class="explanation-error-card" data-wp-bind--hidden="!context.explanationError" role="alert">
					<span class="error-icon" aria-hidden="true">&#9888;</span>
					<span data-wp-text="context.explanationError"></span>
				</div>
			</div>
		</div>

		<div class="code-footer">
			<div class="code-analytics-meta">
				<span><?php echo esc_html( sprintf( _n( '%d line', '%d lines', $line_count, 'intelligent-code-assistant' ), $line_count ) ); ?></span>
				<span class="meta-divider">•</span>
				<span><?php echo esc_html( sprintf( __( '%s chars', 'intelligent-code-assistant' ), number_format( $character_count ) ) ); ?></span>
			</div>

			<div class="code-footer-actions">
				<button type="button" class="explain-button" data-wp-on--click="actions.explainCode" data-wp-class--active="context.isExplaining" aria-label="<?php esc_attr_e( 'Explain this code using AI', 'intelligent-code-assistant' ); ?>">
					<span><?php esc_html_e( 'Explain', 'intelligent-code-assistant' ); ?></span>
				</button>

				<button type="button" class="complete-toggle-btn" data-wp-on--click="actions.toggleComplete" data-wp-class--is-completed="context.isComplete">
					<span data-wp-text="context.completeText"></span>
				</button>
			</div>
		</div>
	</div>
</div>
