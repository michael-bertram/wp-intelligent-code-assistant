( function () {
	'use strict';

	const config = window.ICAReaderInsights || {};
	const wrap = document.querySelector( '.wrap' );
	if ( ! wrap ) return;

	const escapeHtml = ( value ) => {
		const div = document.createElement( 'div' );
		div.textContent = String( value ?? '' );
		return div.innerHTML;
	};

	wrap.querySelectorAll( 'div[style*="background:#fff"]' ).forEach( ( card ) => {
		if ( card.querySelector( 'strong' ) ) card.classList.add( 'ica-stat-card' );
	} );

	const isArticle = config.mode === 'article' && Number( config.postId ) > 0;
	const isCodeExample = config.mode === 'codeExample' && Number( config.codeExampleId ) > 0;
	if ( ( ! isArticle && ! isCodeExample ) || ! config.endpoint ) return;

	const requestPayload = isCodeExample
		? { codeExampleId: Number( config.codeExampleId ) }
		: { postId: Number( config.postId ) };

	// Demo-only fallback for presentations when the external AI connector is unavailable.
	// This branch is intentionally isolated from production/release code.
	const demoMode = true;
	const mockInsights = isCodeExample
		? {
			summary: 'Readers are engaging with this reusable snippet, but the interaction pattern suggests that a few implementation details could benefit from clearer supporting explanation.',
			frictionPoints: [
				'Repeated interaction with the snippet suggests readers may need more context around how the code fits into the wider example.',
				'Line-level explanations indicate that some implementation details are less immediately clear than the overall snippet.',
			],
			recommendations: [
				'Add a short explanation immediately before the snippet describing its role and expected outcome.',
				'Annotate the most frequently explored lines with concise supporting guidance.',
				'Keep the canonical snippet explanation consistent wherever this Code Snippet is reused.',
			],
			suggestedFaqs: [
				'What does this Code Snippet do?',
				'Which parts of this snippet should I change for my own project?',
				'Why is this approach used instead of an alternative implementation?',
			],
		}
		: {
			summary: 'Reader behaviour shows strong engagement with the code in this article. Explanations and questions suggest readers understand the overall goal but are seeking clarification around specific implementation details.',
			frictionPoints: [
				'Line explanations are concentrated around implementation details rather than the overall concept.',
				'Reader questions suggest that the relationship between the code example and the surrounding tutorial could be made more explicit.',
				'Knowledge-check activity indicates an opportunity to reinforce the key concept before readers move on.',
			],
			recommendations: [
				'Add a concise explanation before the most active code block describing what readers should notice.',
				'Expand the explanation around the lines receiving the most requests for clarification.',
				'Use a short recap after the example to reinforce the concept tested by the knowledge check.',
			],
			suggestedFaqs: [
				'Why is this implementation structured this way?',
				'What should I expect to happen when this code runs?',
				'What are the most common changes I might make to this example?',
			],
		};

	let aiHeading = Array.from( wrap.querySelectorAll( 'h2' ) ).find(
		( heading ) => heading.textContent.trim().toLowerCase() === 'ai editorial insights'
	);
	let panel = aiHeading ? aiHeading.parentElement : null;

	if ( ! panel ) {
		panel = document.createElement( 'div' );
		panel.className = 'ica-ai-panel';
		panel.innerHTML = '<h2>AI editorial insights</h2><p></p><button class="button button-primary" type="button"></button>';
		wrap.appendChild( panel );
		aiHeading = panel.querySelector( 'h2' );
	}

	panel.classList.add( 'ica-ai-panel' );
	const intro = panel.querySelector( 'p' );
	if ( intro ) {
		intro.textContent = isCodeExample
			? ( config.i18n?.introCodeExample || 'Interpret deterministic Code Example analytics with AI.' )
			: ( config.i18n?.introArticle || 'Interpret deterministic article analytics with AI.' );
	}

	const button = panel.querySelector( 'button' );
	if ( ! button ) return;
	button.disabled = false;
	button.textContent = config.i18n?.generate || 'Generate AI insights';
	button.classList.add( 'ica-generate-insights' );

	const existingHeader = panel.querySelector( '.ica-ai-panel-header' );
	let header = existingHeader;
	if ( ! header ) {
		header = document.createElement( 'div' );
		header.className = 'ica-ai-panel-header';
		const copy = document.createElement( 'div' );
		copy.className = 'ica-ai-panel-copy';
		aiHeading.insertAdjacentElement( 'beforebegin', header );
		copy.appendChild( aiHeading );
		if ( intro ) copy.appendChild( intro );
		header.appendChild( copy );
		header.appendChild( button );
	}

	let status = panel.querySelector( '.ica-ai-status' );
	if ( ! status ) {
		status = document.createElement( 'span' );
		status.className = 'ica-ai-status';
		status.setAttribute( 'aria-live', 'polite' );
		status.setAttribute( 'role', 'status' );
		header.insertAdjacentElement( 'afterend', status );
	}

	let results = panel.querySelector( '.ica-ai-results' );
	if ( ! results ) {
		results = document.createElement( 'div' );
		results.className = 'ica-ai-results';
		results.hidden = true;
		results.setAttribute( 'aria-live', 'polite' );
		results.setAttribute( 'aria-busy', 'false' );
		panel.appendChild( results );
	}

	const renderList = ( title, items ) => ! Array.isArray( items ) || ! items.length ? '' :
		`<section class="ica-insight-card"><h3>${ escapeHtml( title ) }</h3><ul>${ items.map( ( item ) => `<li>${ escapeHtml( item ) }</li>` ).join( '' ) }</ul></section>`;

	const renderLoading = () => {
		results.innerHTML = '<div class="ica-ai-shimmer" aria-hidden="true"><div class="ica-shimmer-line ica-shimmer-line--wide"></div><div class="ica-shimmer-line"></div><div class="ica-shimmer-line ica-shimmer-line--short"></div><div class="ica-shimmer-grid"><div class="ica-shimmer-card"></div><div class="ica-shimmer-card"></div><div class="ica-shimmer-card"></div></div></div>';
		results.hidden = false;
		results.classList.add( 'is-loading' );
		results.setAttribute( 'aria-busy', 'true' );
	};

	const renderInsights = ( data ) => {
		const cards = [
			renderList( config.i18n?.frictionPoints || 'Potential friction points', data.frictionPoints ),
			renderList( config.i18n?.recommendations || 'Recommendations', data.recommendations ),
			renderList( config.i18n?.suggestedFaqs || 'Suggested FAQs', data.suggestedFaqs ),
		].filter( Boolean ).join( '' );
		results.classList.remove( 'is-loading' );
		results.setAttribute( 'aria-busy', 'false' );
		results.innerHTML = `<div class="ica-ai-summary">${ escapeHtml( data.summary || '' ) }</div>${ cards ? `<div class="ica-insight-grid">${ cards }</div>` : '' }`;
		results.hidden = false;
	};

	const showError = ( message ) => {
		results.classList.remove( 'is-loading' );
		results.setAttribute( 'aria-busy', 'false' );
		results.innerHTML = `<div class="ica-ai-error" role="alert">${ escapeHtml( message ) }</div>`;
		results.hidden = false;
	};

	button.addEventListener( 'click', async () => {
		button.disabled = true;
		button.setAttribute( 'aria-disabled', 'true' );
		button.classList.add( 'is-generating' );
		button.dataset.idleLabel = button.textContent;
		button.textContent = config.i18n?.generating || 'Generating insights…';
		status.classList.add( 'is-loading' );
		status.textContent = config.i18n?.generating || 'Generating insights…';
		renderLoading();

		try {
			if ( demoMode ) {
				await new Promise( ( resolve ) => window.setTimeout( resolve, 900 ) );
				renderInsights( mockInsights );
				button.textContent = config.i18n?.regenerate || 'Regenerate insights';
				button.dataset.idleLabel = button.textContent;
				status.textContent = 'Demo insights generated from mock data';
				return;
			}

			const response = await fetch( config.endpoint, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce },
				body: JSON.stringify( requestPayload ),
			} );
			const data = await response.json();
			if ( ! response.ok ) throw new Error( data?.message || config.i18n?.error );
			renderInsights( data );
			button.textContent = config.i18n?.regenerate || 'Regenerate insights';
			button.dataset.idleLabel = button.textContent;
			status.textContent = isCodeExample
				? ( config.i18n?.generatedCodeExample || 'Generated from current Code Example analytics' )
				: ( config.i18n?.generatedArticle || 'Generated from current article analytics' );
		} catch ( error ) {
			showError( error?.message || config.i18n?.error || 'AI insights are currently unavailable.' );
			status.textContent = '';
		} finally {
			status.classList.remove( 'is-loading' );
			button.disabled = false;
			button.removeAttribute( 'aria-disabled' );
			button.classList.remove( 'is-generating' );
			if ( ! results.querySelector( '.ica-ai-summary' ) ) {
				button.textContent = button.dataset.idleLabel || config.i18n?.generate || 'Generate AI insights';
			}
			results.setAttribute( 'aria-busy', 'false' );
		}
	} );
}() );
