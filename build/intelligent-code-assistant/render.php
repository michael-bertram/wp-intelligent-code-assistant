<?php
/**
 * Render Template: Intelligent Code Assistant block.
 *
 * Provides the code presentation UI and optional inline AI assistant
 * for technical tutorial content.
 */

$persistent_id = ! empty( $attributes['id'] )
	? $attributes['id']
	: wp_unique_id( 'wpe-code-' );

$show_badge                = $attributes['showLanguageBadge'] ?? true;
$code_lang                 = isset( $attributes['codeLanguage'] ) ? sanitize_text_field( $attributes['codeLanguage'] ) : '';
$filename                  = isset( $attributes['filename'] ) ? sanitize_file_name( $attributes['filename'] ) : '';
$is_dark                   = $attributes['isDarkMode'] ?? false;
$is_compact                = $attributes['isCompact'] ?? false;
$font_size                 = $attributes['fontSize'] ?? '14px';
$max_height                = $attributes['maxHeight'] ?? 'none';
$show_lines                = $attributes['showLineNumbers'] ?? false;
$highlight_lines           = $attributes['highlightLines'] ?? '';
$enable_ai_assistant       = $attributes['enableAIAssistant'] ?? false;
$tutorial_context_override = isset( $attributes['tutorialContextOverride'] )
	? sanitize_textarea_field( $attributes['tutorialContextOverride'] )
	: '';

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

$code_title = trim( wp_strip_all_tags( $title_html ) );
if ( '' === $filename && '' !== $code_title ) {
    $filename = $code_title;
}

$character_count = 0;
$line_count       = 1;
$raw_code_text    = '';

if ( ! empty( $content_html ) ) {
	$clean_breaks = preg_replace( '/<br\s*\/?>/i', "\n", $content_html );
	$clean_breaks = preg_replace( '/<\/p><p>/i', "\n", $clean_breaks );
	$clean_breaks = preg_replace( '/<\/div><div>/i', "\n", $clean_breaks );

	$raw_code_text = trim( str_replace( "\r", '', strip_tags( $clean_breaks ) ) );
	$character_count = strlen( $raw_code_text );

	$count_lines = explode( "\n", $raw_code_text );
	while ( ! empty( $count_lines ) && '' === end( $count_lines ) ) {
		array_pop( $count_lines );
	}
	$line_count = ! empty( $count_lines ) ? count( $count_lines ) : 1;
}

$code_lines = explode( "\n", $raw_code_text );

$prism_lang_map = array(
	'PHP'        => 'php',
	'JavaScript' => 'javascript',
	'JS'         => 'javascript',
	'CSS'        => 'css',
	'HTML'       => 'markup',
	'JSON'       => 'json',
	'SQL'        => 'sql',
	'Bash'       => 'bash',
);

$selected_lang = $prism_lang_map[ $code_lang ] ?? 'plaintext';
?>

<div
	data-wp-interactive="wpe"
	data-wp-init="callbacks.initTask"
	data-wp-class--complete="context.isComplete"
	data-ai-assistant-enabled="<?php echo $enable_ai_assistant ? 'true' : 'false'; ?>"
	<?php echo $inline_styles; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
	<?php
	echo get_block_wrapper_attributes(
		array(
			'class' => esc_attr(
				trim(
					"wp-block-wpe-intelligent-code-assistant-editor $theme_class $compact_class $lines_class"
				)
			),
		)
	);
	?>
	<?php
	echo wp_interactivity_data_wp_context(
		array(
			'id'                       => $persistent_id,
			'isOpen'                   => false,
			'openText'                 => '+',
			'closeText'                => '-',
			'toggleText'               => '+',
			'isComplete'               => false,
			'isCopied'                 => false,
			'aiAssistantEnabled'       => $enable_ai_assistant,
			'aiAssistantOpen'          => false,
			'aiAssistantView'          => 'menu',
			'isExplaining'             => false,
			'isAnalyzingExplanation'   => false,
			'explanationText'          => '',
			'explanationItems'         => array(),
			'explanationError'         => '',
			'selectedLineNumber'       => 0,
			'selectedLineText'         => '',
			'isExplainingLine'         => false,
			'isAnalyzingLine'          => false,
			'lineExplanation'          => '',
			'lineExplanationError'     => '',
			'activeCodeText'           => $raw_code_text,
			'rawCodeText'              => $raw_code_text,
    		'postId'          			=> get_the_ID(),
			'codeLanguage'             => $code_lang,
			'codeFilename'             => $filename,
			'codeTitle'                => $code_title,
			'tutorialContext'          => $tutorial_context_override,
			'highlightLines'           => $highlight_lines,
			'completeText'             => esc_html__( 'Done', 'intelligent-code-assistant' ),
			'isAskingCode'             => false,
			'isSubmittingQuestion'     => false,
			'codeQuestion'             => '',
			'codeAnswer'               => '',
			'codeQuestionError'        => '',
			'isCheckingUnderstanding'  => false,
			'isGeneratingCheck'        => false,
			'checkQuestion'            => '',
			'checkOptions'             => array(),
			'checkOption0'             => '',
			'checkOption1'             => '',
			'checkOption2'             => '',
			'checkCorrectAnswer'       => null,
			'checkExplanation'         => '',
			'selectedCheckAnswer'      => null,
			'hasAnsweredCheck'         => false,
			'isCheckCorrect'           => false,
			'checkError'               => '',
		)
	);
	?>
>
	<div class="editor-combined-container">

		<div class="code-header">
			<div class="code-title-container">
				<div class="code-title">
					<?php
					echo ! empty( trim( strip_tags( $title_html ) ) )
						? wp_kses_post( $title_html )
						: '<h3>' . esc_html__( 'Untitled Snippet', 'intelligent-code-assistant' ) . '</h3>';
					?>
				</div>

				<?php if ( true === $show_badge && '' !== $code_lang ) : ?>
					<span class="code-badge lang-<?php echo esc_attr( strtolower( $code_lang ) ); ?>">
						<?php echo esc_html( $code_lang ); ?>
					</span>
				<?php endif; ?>
			</div>

			<div class="code-actions">
				<button
					class="copy-button"
					type="button"
					data-wp-on--click="actions.copyToClipboard"
					data-wp-class--copied="context.isCopied"
					aria-label="<?php esc_attr_e( 'Copy code to clipboard', 'intelligent-code-assistant' ); ?>"
				>
					<svg class="icon-copy" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
					<svg class="icon-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
				</button>

				<button
					class="toggle-button"
					type="button"
					data-wp-on--click="actions.toggleOpen"
					aria-label="<?php esc_attr_e( 'Toggle code visibility', 'intelligent-code-assistant' ); ?>"
				>
					<span data-wp-text="context.toggleText"></span>
				</button>
			</div>
		</div>

		<div class="editor-inner-blocks-wrapper" data-wp-class--active="context.isOpen">
			<div class="panel-scroll-container">
				<div class="panel-content-flex-wrapper">

					<?php if ( $show_lines ) : ?>
						<div class="line-numbers-gutter" aria-hidden="true">
							<?php for ( $i = 1; $i <= $line_count; $i++ ) : ?>
								<span><?php echo esc_html( $i ); ?></span>
							<?php endfor; ?>
						</div>
					<?php endif; ?>

					<div class="panel-content">
						<pre class="code-lines"><?php foreach ( $code_lines as $index => $line ) : ?><code
							class="code-line language-<?php echo esc_attr( $selected_lang ); ?>"
							data-line-number="<?php echo esc_attr( $index + 1 ); ?>"
							tabindex="0"
						><?php echo esc_html( $line ); ?></code><?php endforeach; ?></pre>

						<?php if ( $enable_ai_assistant ) : ?>
							<div class="line-ai-actions" data-wp-bind--hidden="!context.selectedLineNumber">
								<span class="selected-line-label">
									<?php esc_html_e( 'Selected:', 'intelligent-code-assistant' ); ?>
									<strong>
										<?php esc_html_e( 'Line', 'intelligent-code-assistant' ); ?>
										<span data-wp-text="context.selectedLineNumber"></span>
									</strong>
								</span>

								<button
									type="button"
									class="explain-line-button"
									data-wp-on--click="actions.explainLine"
									data-wp-bind--disabled="context.isAnalyzingLine"
								>
									<span data-wp-bind--hidden="context.isAnalyzingLine">
										<?php esc_html_e( 'Ask AI about this line', 'intelligent-code-assistant' ); ?>
									</span>
									<span data-wp-bind--hidden="!context.isAnalyzingLine">
										<?php esc_html_e( 'Explaining…', 'intelligent-code-assistant' ); ?>
									</span>
								</button>
							</div>
						<?php endif; ?>
					</div>
				</div>
			</div>
		</div>

		<?php if ( $enable_ai_assistant ) : ?>
			<div
				class="code-explanation-drawer ai-assistant-drawer"
				data-wp-bind--hidden="!context.aiAssistantOpen"
			>
				<div class="explanation-inner ai-assistant-inner">
					<div class="explanation-header ai-assistant-header">
						<div class="explanation-title">
							<span class="ai-sparkle-icon" aria-hidden="true">✦</span>
							<span><?php esc_html_e( 'Code Assistant', 'intelligent-code-assistant' ); ?></span>
						</div>

						<button
							type="button"
							class="explanation-close-btn"
							data-wp-on--click="actions.closeAssistant"
							aria-label="<?php esc_attr_e( 'Close AI Assistant', 'intelligent-code-assistant' ); ?>"
						>&times;</button>
					</div>

					<div class="ai-assistant-view" data-wp-bind--hidden="!state.isAssistantMenu">
						<p><?php esc_html_e( 'What would you like help with?', 'intelligent-code-assistant' ); ?></p>
						<div class="code-footer-actions">
							<button type="button" class="explain-button" data-wp-on--click="actions.explainCode">
								<?php esc_html_e( 'Explain this code', 'intelligent-code-assistant' ); ?>
							</button>
							<button type="button" class="ask-code-button" data-wp-on--click="actions.showAskCode">
								<?php esc_html_e( 'Ask about this code', 'intelligent-code-assistant' ); ?>
							</button>
							<button type="button" class="check-understanding-button" data-wp-on--click="actions.generateUnderstandingCheck">
								<?php esc_html_e( 'Check understanding', 'intelligent-code-assistant' ); ?>
							</button>
							<button
								type="button"
								class="explain-line-button"
								data-wp-on--click="actions.explainLine"
								data-wp-bind--hidden="!context.selectedLineNumber"
							>
								<?php esc_html_e( 'Explain selected line', 'intelligent-code-assistant' ); ?>
							</button>
						</div>
					</div>

					<div class="ai-assistant-view" data-wp-bind--hidden="!state.isAssistantExplain">
						<button type="button" class="explanation-close-btn" data-wp-on--click="actions.showAssistantMenu">
							← <?php esc_html_e( 'Back', 'intelligent-code-assistant' ); ?>
						</button>
						<h3><?php esc_html_e( 'Explain this code', 'intelligent-code-assistant' ); ?></h3>

						<div
							class="explanation-loading-container"
							data-wp-bind--hidden="!context.isAnalyzingExplanation"
							data-wp-class--is-hidden="!context.isAnalyzingExplanation"
							aria-live="polite"
						>
							<div class="spinner-status-bar">
								<span class="spinner-icon" aria-hidden="true"></span>
								<span class="spinner-text"><?php esc_html_e( 'Analyzing code logic with AI…', 'intelligent-code-assistant' ); ?></span>
							</div>
						</div>

						<div
							class="explanation-content"
							data-wp-bind--hidden="context.isAnalyzingExplanation || !context.explanationItems.length"
						>
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
							<span data-wp-text="context.explanationError"></span>
						</div>
					</div>

					<div class="ai-assistant-view" data-wp-bind--hidden="!state.isAssistantExplainLine">
						<button type="button" class="explanation-close-btn" data-wp-on--click="actions.showAssistantMenu">
							← <?php esc_html_e( 'Back', 'intelligent-code-assistant' ); ?>
						</button>
						<h3>
							<?php esc_html_e( 'Explain line', 'intelligent-code-assistant' ); ?>
							<span data-wp-text="context.selectedLineNumber"></span>
						</h3>

						<div class="line-explanation-loading" data-wp-bind--hidden="!context.isAnalyzingLine">
							<span class="spinner-icon" aria-hidden="true"></span>
							<?php esc_html_e( 'Explaining selected line…', 'intelligent-code-assistant' ); ?>
						</div>

						<div class="line-explanation-content" data-wp-bind--hidden="context.isAnalyzingLine || !context.lineExplanation">
							<p data-wp-text="context.lineExplanation"></p>
						</div>

						<div class="line-explanation-error" data-wp-bind--hidden="!context.lineExplanationError" role="alert">
							<p data-wp-text="context.lineExplanationError"></p>
						</div>
					</div>

					<div class="ai-assistant-view" data-wp-bind--hidden="!state.isAssistantAsk">
						<button type="button" class="explanation-close-btn" data-wp-on--click="actions.showAssistantMenu">
							← <?php esc_html_e( 'Back', 'intelligent-code-assistant' ); ?>
						</button>
						<h3><?php esc_html_e( 'Ask about this code', 'intelligent-code-assistant' ); ?></h3>

						<label for="<?php echo esc_attr( $persistent_id . '-question' ); ?>" class="ask-code-label">
							<?php esc_html_e( 'What would you like to know?', 'intelligent-code-assistant' ); ?>
						</label>

						<textarea
							id="<?php echo esc_attr( $persistent_id . '-question' ); ?>"
							class="ask-code-input"
							rows="3"
							data-wp-on--input="actions.handleCodeQuestionInput"
							data-wp-bind--value="context.codeQuestion"
							placeholder="<?php esc_attr_e( 'For example: Why is wp_unslash() needed here?', 'intelligent-code-assistant' ); ?>"
						></textarea>

						<div class="ask-code-actions">
							<button
								type="button"
								class="ask-code-submit"
								data-wp-on--click="actions.submitCodeQuestion"
								data-wp-bind--disabled="context.isSubmittingQuestion"
							>
								<span data-wp-bind--hidden="context.isSubmittingQuestion"><?php esc_html_e( 'Ask AI', 'intelligent-code-assistant' ); ?></span>
								<span data-wp-bind--hidden="!context.isSubmittingQuestion"><?php esc_html_e( 'Thinking…', 'intelligent-code-assistant' ); ?></span>
							</button>
						</div>

						<div class="ask-code-response" data-wp-bind--hidden="!context.codeAnswer">
							<div class="ask-code-response-title"><?php esc_html_e( 'Answer', 'intelligent-code-assistant' ); ?></div>
							<p data-wp-text="context.codeAnswer"></p>
						</div>

						<div class="ask-code-error" role="alert" data-wp-bind--hidden="!context.codeQuestionError">
							<p data-wp-text="context.codeQuestionError"></p>
						</div>
					</div>

					<div class="ai-assistant-view" data-wp-bind--hidden="!state.isAssistantCheck">
						<button type="button" class="explanation-close-btn" data-wp-on--click="actions.showAssistantMenu">
							← <?php esc_html_e( 'Back', 'intelligent-code-assistant' ); ?>
						</button>
						<h3><?php esc_html_e( 'Check your understanding', 'intelligent-code-assistant' ); ?></h3>

						<div class="understanding-check-loading" data-wp-bind--hidden="!context.isGeneratingCheck">
							<?php esc_html_e( 'Creating a question from this code…', 'intelligent-code-assistant' ); ?>
						</div>

						<div class="understanding-check-content" data-wp-bind--hidden="!context.checkQuestion">
							<p class="understanding-check-question" data-wp-text="context.checkQuestion"></p>

							<div class="understanding-check-options" role="group" aria-label="<?php esc_attr_e( 'Choose an answer', 'intelligent-code-assistant' ); ?>">
								<button type="button" class="understanding-check-option" data-answer-index="0" data-wp-on--click="actions.selectCheckAnswer" data-wp-bind--disabled="context.hasAnsweredCheck" data-wp-class--is-correct="state.isCheckOption0Correct" data-wp-class--is-incorrect="state.isCheckOption0Incorrect">
									<span data-wp-text="context.checkOption0"></span>
								</button>
								<button type="button" class="understanding-check-option" data-answer-index="1" data-wp-on--click="actions.selectCheckAnswer" data-wp-bind--disabled="context.hasAnsweredCheck" data-wp-class--is-correct="state.isCheckOption1Correct" data-wp-class--is-incorrect="state.isCheckOption1Incorrect">
									<span data-wp-text="context.checkOption1"></span>
								</button>
								<button type="button" class="understanding-check-option" data-answer-index="2" data-wp-on--click="actions.selectCheckAnswer" data-wp-bind--disabled="context.hasAnsweredCheck" data-wp-class--is-correct="state.isCheckOption2Correct" data-wp-class--is-incorrect="state.isCheckOption2Incorrect">
									<span data-wp-text="context.checkOption2"></span>
								</button>
							</div>

							<div class="understanding-check-feedback" data-wp-bind--hidden="!context.hasAnsweredCheck" aria-live="polite">
								<div class="understanding-check-correct" data-wp-bind--hidden="!context.isCheckCorrect"><strong><?php esc_html_e( 'Correct!', 'intelligent-code-assistant' ); ?></strong></div>
								<div class="understanding-check-incorrect" data-wp-bind--hidden="context.isCheckCorrect"><strong><?php esc_html_e( 'Not quite.', 'intelligent-code-assistant' ); ?></strong></div>
								<p class="understanding-check-explanation" data-wp-text="context.checkExplanation"></p>
							</div>
						</div>

						<div class="understanding-check-error" role="alert" data-wp-bind--hidden="!context.checkError">
							<p data-wp-text="context.checkError"></p>
						</div>
					</div>
				</div>
			</div>
		<?php endif; ?>

		<div class="code-footer">
			<div class="code-analytics-meta">
				<span>
					<?php
					echo esc_html(
						sprintf(
							_n( '%d line', '%d lines', $line_count, 'intelligent-code-assistant' ),
							$line_count
						)
					);
					?>
				</span>
				<span class="meta-divider">•</span>
				<span>
					<?php
					echo esc_html(
						sprintf(
							__( '%s chars', 'intelligent-code-assistant' ),
							number_format( $character_count )
						)
					);
					?>
				</span>
			</div>

			<div class="code-footer-actions">
				<?php if ( $enable_ai_assistant ) : ?>
					<button
						type="button"
						class="explain-button ai-assistant-button"
						data-wp-on--click="actions.openAssistant"
						data-wp-class--active="context.aiAssistantOpen"
					>
						<span aria-hidden="true">✦</span>
						<span><?php esc_html_e( 'AI Assistant', 'intelligent-code-assistant' ); ?></span>
					</button>
				<?php endif; ?>

				<button
					type="button"
					class="complete-toggle-btn"
					data-wp-on--click="actions.toggleComplete"
					data-wp-class--is-completed="context.isComplete"
				>
					<span data-wp-text="context.completeText"></span>
				</button>
			</div>
		</div>
	</div>
</div>
