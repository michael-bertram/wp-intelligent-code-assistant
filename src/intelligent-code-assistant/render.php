<?php
/**
 * Render Template: Intelligent Code Assistant block.
 *
 * Provides the code presentation UI and inline AI assistance
 * for technical tutorial content.
 */

$persistent_id   = ! empty( $attributes['id'] )
	? $attributes['id']
	: wp_unique_id( 'wpe-code-' );

$show_badge      = $attributes['showLanguageBadge'] ?? true;
$code_lang       = $attributes['codeLanguage'] ?? 'PHP';
$is_dark         = $attributes['isDarkMode'] ?? false;
$is_compact      = $attributes['isCompact'] ?? false;
$font_size       = $attributes['fontSize'] ?? '14px';
$max_height      = $attributes['maxHeight'] ?? 'none';
$show_lines      = $attributes['showLineNumbers'] ?? false;
$highlight_lines = $attributes['highlightLines'] ?? '';
$enable_ai_assistant = $attributes['enableAIAssistant'] ?? false;

$theme_class   = $is_dark ? 'dark-theme' : '';
$compact_class = $is_compact ? 'is-compact' : '';
$lines_class   = $show_lines ? 'has-line-numbers' : '';

$inline_styles = sprintf(
	'style="--editor-code-font-size: %s; --panel-max-height: %s;"',
	esc_attr( $font_size ),
	esc_attr( $max_height )
);

/*
 * Render child blocks so that their content can be used by
 * the front-end code presentation.
 */
$inner_blocks = $block->parsed_block['innerBlocks'] ?? array();

$title_html   = '';
$content_html = '';

foreach ( $inner_blocks as $inner_block ) {

	if (
		isset( $inner_block['blockName'] ) &&
		'wpe/code-header' === $inner_block['blockName']
	) {
		$title_html = render_block( $inner_block );

	} elseif (
		isset( $inner_block['blockName'] ) &&
		'wpe/code-content' === $inner_block['blockName']
	) {
		$content_html = render_block( $inner_block );
	}
}

/*
 * Prepare raw source code and analytics.
 */
$line_gutter_html = '';
$character_count  = 0;
$line_count       = 1;
$raw_code_text    = '';

if ( ! empty( $content_html ) ) {

	$clean_breaks = preg_replace(
		'/<br\s*\/?>/i',
		"\n",
		$content_html
	);

	$clean_breaks = preg_replace(
		'/<\/p><p>/i',
		"\n",
		$clean_breaks
	);

	$clean_breaks = preg_replace(
		'/<\/div><div>/i',
		"\n",
		$clean_breaks
	);

	$raw_code_text = strip_tags(
		$clean_breaks
	);

	$raw_code_text = str_replace(
		"\r",
		'',
		$raw_code_text
	);

	$raw_code_text = trim(
		$raw_code_text
	);

	$character_count = strlen(
		$raw_code_text
	);

	$count_lines = explode(
		"\n",
		$raw_code_text
	);

	/*
	 * Remove trailing empty lines when calculating analytics,
	 * while preserving whitespace/indentation in the actual
	 * source code.
	 */
	while (
		! empty( $count_lines ) &&
		'' === end( $count_lines )
	) {
		array_pop(
			$count_lines
		);
	}

	$line_count = ! empty(
		$count_lines
	)
		? count( $count_lines )
		: 1;

	/*
	 * Existing visual line-number gutter.
	 */
	if ( $show_lines ) {

		$line_gutter_html .=
			'<div class="line-numbers-gutter" aria-hidden="true">';

		for (
			$i = 1;
			$i <= $line_count;
			$i++
		) {
			$line_gutter_html .=
				'<span>' .
				esc_html( $i ) .
				'</span>';
		}

		$line_gutter_html .=
			'</div>';
	}
}

/*
 * These are the actual source lines used for interactive
 * selection. Unlike the analytics version above, indentation
 * is deliberately preserved.
 */
$code_lines = explode(
	"\n",
	$raw_code_text
);

/*
 * Prism language mapping.
 */
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

$selected_lang =
	$prism_lang_map[ $code_lang ]
	?? 'plaintext';

?>

<div
	data-wp-interactive="wpe"
	data-wp-init="callbacks.initTask"
	data-wp-class--complete="context.isComplete"
	data-ai-assistant-enabled="<?php echo $enable_ai_assistant ? 'true' : 'false'; ?>"

	<?php echo $inline_styles; ?>

	<?php
	echo get_block_wrapper_attributes(
		array(
			'class' => esc_attr(
				trim(
					"wp-block-wpe-intelligent-code-assistant-editor
					$theme_class
					$compact_class
					$lines_class"
				)
			),
		)
	);
	?>

	<?php
	echo wp_interactivity_data_wp_context(
		array(
			'id'                     => $persistent_id,

			'isOpen'                 => false,
			'openText'               => '+',
			'closeText'              => '-',
			'toggleText'             => '+',

			'isComplete'             => false,
			'isCopied'               => false,
			'aiAssistantEnabled' => $enable_ai_assistant,

			/*
			 * Entire-code explanation.
			 */
			'isExplaining'           => false,
			'isAnalyzingExplanation' => false,
			'explanationText'        => '',
			'explanationItems'       => array(),
			'explanationError'       => '',

			/*
			 * Selected-line explanation.
			 */
			'selectedLineNumber'     => 0,
			'selectedLineText'       => '',
			'isExplainingLine'       => false,
			'isAnalyzingLine'        => false,
			'lineExplanation'        => '',
			'lineExplanationError'   => '',

			/*
			 * Code context.
			 */
			'activeCodeText'         => $raw_code_text,
			'rawCodeText'            => $raw_code_text,
			'codeLanguage'           => $code_lang,
			'highlightLines'         => $highlight_lines,

			'completeText'           => esc_html__(
				'Done',
				'intelligent-code-assistant'
			),
			'isAskingCode'          => false,
			'isSubmittingQuestion'  => false,
			'codeQuestion'          => '',
			'codeAnswer'            => '',
			'codeQuestionError'     => '',

			'isCheckingUnderstanding' => false,
			'isGeneratingCheck'       => false,

			'checkQuestion'           => '',
			'checkOptions'            => array(),
			'checkOption0'            => '',
			'checkOption1'            => '',
			'checkOption2'            => '',
			'checkCorrectAnswer'      => null,
			'checkExplanation'        => '',

			'selectedCheckAnswer'     => null,
			'hasAnsweredCheck'        => false,
			'isCheckCorrect'          => false,

			'checkError'              => ''
		)
	);
	?>
>
	<div class="editor-combined-container">

		<!-- ==============================================================
		     HEADER
		     ============================================================== -->

		<div class="code-header">

			<div class="code-title-container">

				<div class="code-title">
					<?php
					echo ! empty(
						trim(
							strip_tags(
								$title_html
							)
						)
					)
						? wp_kses_post(
							$title_html
						)
						: '<h3>' .
							esc_html__(
								'Untitled Snippet',
								'intelligent-code-assistant'
							) .
							'</h3>';
					?>
				</div>

				<?php if ( true === $show_badge ) : ?>

					<span
						class="code-badge lang-<?php
							echo esc_attr(
								strtolower(
									$code_lang
								)
							);
						?>"
					>
						<?php
						echo esc_html(
							$code_lang
						);
						?>
					</span>

				<?php endif; ?>

			</div>

			<div class="code-actions">

				<button
					class="copy-button"
					type="button"
					data-wp-on--click="actions.copyToClipboard"
					data-wp-class--copied="context.isCopied"
					aria-label="<?php
						esc_attr_e(
							'Copy code to clipboard',
							'intelligent-code-assistant'
						);
					?>"
				>
					<svg
						class="icon-copy"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect
							x="9"
							y="9"
							width="13"
							height="13"
							rx="2"
							ry="2"
						></rect>

						<path
							d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
						></path>
					</svg>

					<svg
						class="icon-check"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<polyline
							points="20 6 9 17 4 12"
						></polyline>
					</svg>

				</button>

				<button
					class="toggle-button"
					type="button"
					data-wp-on--click="actions.toggleOpen"
					aria-label="<?php
						esc_attr_e(
							'Toggle code visibility',
							'intelligent-code-assistant'
						);
					?>"
				>
					<span
						data-wp-text="context.toggleText"
					></span>
				</button>

			</div>

		</div>

		<!-- ==============================================================
		     CODE PANEL
		     ============================================================== -->

		<div
			class="editor-inner-blocks-wrapper"
			data-wp-class--active="context.isOpen"
		>

			<div class="panel-scroll-container">

				<div class="panel-content-flex-wrapper">

					<?php
					echo $line_gutter_html;
					// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					?>

					<div class="panel-content">

						<pre class="code-lines"><?php
						foreach (
							$code_lines as $index => $line
						) :

							$line_number =
								$index + 1;

							/*
							 * Each source line is its own <code>
							 * element.
							 *
							 * Prism can still syntax-highlight the
							 * contents of the element without
							 * removing our .code-line wrapper.
							 */
							?><code
								class="code-line language-<?php
									echo esc_attr(
										$selected_lang
									);
								?>"
								data-line-number="<?php
									echo esc_attr(
										$line_number
									);
								?>"
								tabindex="0"
							><?php
								echo esc_html(
									$line
								);
							?></code><?php

						endforeach;
						?></pre>

<?php if ( $enable_ai_assistant ) : ?>

							<!-- ==================================================
						     SELECTED LINE ACTION
						     ================================================== -->

						<div
							class="line-ai-actions"
							data-wp-bind--hidden="!context.selectedLineNumber"
						>

							<span class="selected-line-label">

								<?php
								esc_html_e(
									'Selected:',
									'intelligent-code-assistant'
								);
								?>

								<strong>
									<?php
									esc_html_e(
										'Line',
										'intelligent-code-assistant'
									);
									?>

									<span
										data-wp-text="context.selectedLineNumber"
									></span>
								</strong>

							</span>

							<button
								type="button"
								class="explain-line-button"
								data-wp-on--click="actions.explainLine"
								data-wp-bind--disabled="context.isAnalyzingLine"
							>

								<span
									data-wp-bind--hidden="context.isAnalyzingLine"
								>
									<?php
									esc_html_e(
										'Explain this line',
										'intelligent-code-assistant'
									);
									?>
								</span>

								<span
									data-wp-bind--hidden="!context.isAnalyzingLine"
								>
									<?php
									esc_html_e(
										'Explaining...',
										'intelligent-code-assistant'
									);
									?>
								</span>

							</button>

						</div>
						<div
	class="line-explanation-panel"
	data-wp-bind--hidden="!context.isExplainingLine"
>

	<div class="line-explanation-header">

		<div class="line-explanation-title">
			<?php esc_html_e(
				'Line',
				'intelligent-code-assistant'
			); ?>

			<span
				class="line-explanation-number"
				data-wp-text="context.selectedLineNumber"
			></span>
			<?php esc_html_e(
				'explanation',
				'intelligent-code-assistant'
			); ?>
		</div>

	</div>

	<div
		class="line-explanation-loading"
		data-wp-bind--hidden="!context.isAnalyzingLine"
	>
		<span
			class="spinner-icon"
			aria-hidden="true"
		></span>

		<span>
			<?php esc_html_e(
				'Explaining selected line...',
				'intelligent-code-assistant'
			); ?>
		</span>
	</div>

	<div
		class="line-explanation-content"
		data-wp-bind--hidden="context.isAnalyzingLine || !context.lineExplanation"
	>
		<p data-wp-text="context.lineExplanation"></p>
	</div>

	<div
		class="line-explanation-error"
		data-wp-bind--hidden="!context.lineExplanationError"
		role="alert"
	>
		<span aria-hidden="true">⚠</span>

		<span
			data-wp-text="context.lineExplanationError"
		></span>
	</div>

</div>

					</div>

				</div>

			</div>

		</div>

<?php endif; ?>

		<!-- ==============================================================
		     WHOLE-CODE AI EXPLANATION DRAWER
		     ============================================================== -->

		<div
			class="code-explanation-drawer"
			data-wp-bind--hidden="!context.isExplaining"
		>

			<div class="explanation-inner">

				<div class="explanation-header">

					<div class="explanation-title">

						<svg
							class="ai-sparkle-icon"
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
							/>
						</svg>

						<span>
							<?php
							esc_html_e(
								'Code Explanation',
								'intelligent-code-assistant'
							);
							?>
						</span>

					</div>

					<button
						type="button"
						class="explanation-close-btn"
						data-wp-on--click="actions.closeExplanation"
						aria-label="<?php
							esc_attr_e(
								'Close explanation',
								'intelligent-code-assistant'
							);
						?>"
					>
						&times;
					</button>

				</div>

				<!-- Loading -->

				<div
					class="explanation-loading-container"
					data-wp-bind--hidden="!context.isAnalyzingExplanation"
					data-wp-class--is-hidden="!context.isAnalyzingExplanation"
					aria-live="polite"
				>

					<div class="spinner-status-bar">

						<span
							class="spinner-icon"
							aria-hidden="true"
						></span>

						<span class="spinner-text">
							<?php
							esc_html_e(
								'Analyzing code logic with AI...',
								'intelligent-code-assistant'
							);
							?>
						</span>

					</div>

					<div
						class="explanation-skeleton"
						aria-hidden="true"
					>
						<div
							class="skeleton-line shimmer"
						></div>

						<div
							class="skeleton-line shimmer short"
						></div>

						<div
							class="skeleton-line shimmer medium"
						></div>
					</div>

				</div>

				<!-- Explanation -->

				<div
					class="explanation-content"
					data-wp-bind--hidden="context.isAnalyzingExplanation || !context.explanationItems.length"
				>

					<div class="explanation-formatted-list">

						<template
							data-wp-each="context.explanationItems"
						>

							<div
								class="explanation-bullet-item"
							>

								<span
									class="bullet-badge"
									aria-hidden="true"
								></span>

								<div
									class="bullet-text"
									data-wp-text="context.item"
								></div>

							</div>

						</template>

					</div>

				</div>

				<!-- Error -->

				<div
					class="explanation-error-card"
					data-wp-bind--hidden="!context.explanationError"
					role="alert"
				>

					<span
						class="error-icon"
						aria-hidden="true"
					>
						&#9888;
					</span>

					<span
						data-wp-text="context.explanationError"
					></span>

				</div>

			</div>

		</div>
		<div
	class="ask-code-panel"
	data-wp-bind--hidden="!context.isAskingCode"
>
	<div class="ask-code-header">
		<div class="ask-code-title">
			<?php esc_html_e(
				'Ask about this code',
				'intelligent-code-assistant'
			); ?>
		</div>
	</div>

	<div class="ask-code-form">
		<label
			for="<?php echo esc_attr( $persistent_id . '-question' ); ?>"
			class="ask-code-label"
		>
			<?php esc_html_e(
				'What would you like to know?',
				'intelligent-code-assistant'
			); ?>
		</label>

		<textarea
			id="<?php echo esc_attr( $persistent_id . '-question' ); ?>"
			class="ask-code-input"
			rows="3"
			data-wp-on--input="actions.handleCodeQuestionInput"
			data-wp-bind--value="context.codeQuestion"
			placeholder="<?php esc_attr_e(
				'For example: Why is wp_unslash() needed here?',
				'intelligent-code-assistant'
			); ?>"
		></textarea>

		<div class="ask-code-actions">
			<button
	type="button"
	class="ask-code-submit"
	data-wp-on--click="actions.submitCodeQuestion"
	data-wp-bind--disabled="context.isSubmittingQuestion"
>
	<span data-wp-bind--hidden="context.isSubmittingQuestion">
		<?php esc_html_e(
			'Ask AI',
			'intelligent-code-assistant'
		); ?>
	</span>

	<span data-wp-bind--hidden="!context.isSubmittingQuestion">
		<?php esc_html_e(
			'Thinking…',
			'intelligent-code-assistant'
		); ?>
	</span>
</button>
		</div>
		<div
	class="ask-code-response"
	data-wp-bind--hidden="!context.codeAnswer"
>
	<div class="ask-code-response-title">
		<?php esc_html_e(
			'Answer',
			'intelligent-code-assistant'
		); ?>
	</div>

	<p data-wp-text="context.codeAnswer"></p>
</div>
<div
	class="ask-code-error"
	role="alert"
	data-wp-bind--hidden="!context.codeQuestionError"
>
	<p data-wp-text="context.codeQuestionError"></p>
</div>
	</div>
</div>



<div
	class="understanding-check"
	data-wp-bind--hidden="!context.isCheckingUnderstanding"
>
	<div
		class="understanding-check-loading"
		data-wp-bind--hidden="!context.isGeneratingCheck"
	>
		<?php
		esc_html_e(
			'Creating a question from this code…',
			'intelligent-code-assistant'
		);
		?>
	</div>

	<div
		class="understanding-check-content"
		data-wp-bind--hidden="!context.checkQuestion"
	>
		<div class="understanding-check-title">
			<?php
			esc_html_e(
				'Check your understanding',
				'intelligent-code-assistant'
			);
			?>
		</div>

		<p
			class="understanding-check-question"
			data-wp-text="context.checkQuestion"
		></p>

		<div
			class="understanding-check-options"
			role="group"
			aria-label="<?php
				esc_attr_e(
					'Choose an answer',
					'intelligent-code-assistant'
				);
			?>"
		>
			<button
				type="button"
				class="understanding-check-option"
				data-answer-index="0"
				data-wp-on--click="actions.selectCheckAnswer"
				data-wp-bind--disabled="context.hasAnsweredCheck"
				data-wp-class--is-correct="state.isCheckOption0Correct"
				data-wp-class--is-incorrect="state.isCheckOption0Incorrect"
			>
				<span data-wp-text="context.checkOption0"></span>
			</button>

			<button
				type="button"
				class="understanding-check-option"
				data-answer-index="1"
				data-wp-on--click="actions.selectCheckAnswer"
				data-wp-bind--disabled="context.hasAnsweredCheck"
				data-wp-class--is-correct="state.isCheckOption1Correct"
				data-wp-class--is-incorrect="state.isCheckOption1Incorrect"
			>
				<span
					data-wp-text="context.checkOption1"
				></span>
			</button>

			<button
				type="button"
				class="understanding-check-option"
				data-answer-index="2"
				data-wp-on--click="actions.selectCheckAnswer"
				data-wp-bind--disabled="context.hasAnsweredCheck"
				data-wp-class--is-correct="state.isCheckOption2Correct"
				data-wp-class--is-incorrect="state.isCheckOption2Incorrect"
			>
				<span
					data-wp-text="context.checkOption2"
				></span>
			</button>
			<div
	class="understanding-check-feedback"
	data-wp-bind--hidden="!context.hasAnsweredCheck"
	aria-live="polite"
>
	<div
		class="understanding-check-correct"
		data-wp-bind--hidden="!context.isCheckCorrect"
	>
		<strong>
			<?php
			esc_html_e(
				'Correct!',
				'intelligent-code-assistant'
			);
			?>
		</strong>
	</div>

	<div
		class="understanding-check-incorrect"
		data-wp-bind--hidden="context.isCheckCorrect"
	>
		<strong>
			<?php
			esc_html_e(
				'Not quite.',
				'intelligent-code-assistant'
			);
			?>
		</strong>
	</div>

	<p
		class="understanding-check-explanation"
		data-wp-text="context.checkExplanation"
	></p>
</div>
		</div>
	</div>

	<div
		class="understanding-check-error"
		role="alert"
		data-wp-bind--hidden="!context.checkError"
	>
		<p
			data-wp-text="context.checkError"
		></p>
	</div>
</div>

		<!-- ==============================================================
		     FOOTER
		     ============================================================== -->

		<div class="code-footer">

			<div class="code-analytics-meta">

				<span>
					<?php
					echo esc_html(
						sprintf(
							_n(
								'%d line',
								'%d lines',
								$line_count,
								'intelligent-code-assistant'
							),
							$line_count
						)
					);
					?>
				</span>

				<span class="meta-divider">
					•
				</span>

				<span>
					<?php
					echo esc_html(
						sprintf(
							__(
								'%s chars',
								'intelligent-code-assistant'
							),
							number_format(
								$character_count
							)
						)
					);
					?>
				</span>

			</div>

			<div class="code-footer-actions">
				<button
	type="button"
	class="check-understanding-button"
	data-wp-on--click="actions.generateUnderstandingCheck"
	data-wp-bind--disabled="context.isGeneratingCheck"
>
	<span data-wp-bind--hidden="context.isGeneratingCheck">
		<?php esc_html_e(
			'Check understanding',
			'intelligent-code-assistant'
		); ?>
	</span>

	<span data-wp-bind--hidden="!context.isGeneratingCheck">
		<?php esc_html_e(
			'Creating question…',
			'intelligent-code-assistant'
		); ?>
	</span>
</button>
				<button
	type="button"
	class="ask-code-button"
	data-wp-on--click="actions.toggleAskCode"
	data-wp-class--active="context.isAskingCode"
>
	<span>
		<?php esc_html_e(
			'Ask',
			'intelligent-code-assistant'
		); ?>
	</span>
</button>

				<button
					type="button"
					class="explain-button"
					data-wp-on--click="actions.explainCode"
					data-wp-class--active="context.isExplaining"
					aria-label="<?php
						esc_attr_e(
							'Explain this code using AI',
							'intelligent-code-assistant'
						);
					?>"
				>
					<span>
						<?php
						esc_html_e(
							'Explain',
							'intelligent-code-assistant'
						);
						?>
					</span>
				</button>

				<button
					type="button"
					class="complete-toggle-btn"
					data-wp-on--click="actions.toggleComplete"
					data-wp-class--is-completed="context.isComplete"
				>
					<span
						data-wp-text="context.completeText"
					></span>
				</button>

			</div>

		</div>

	</div>
</div>