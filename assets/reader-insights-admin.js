( function () {
	'use strict';

	const config = window.ICAReaderInsights || {};
<<<<<<< HEAD
	const wrap = document.querySelector( 'body.toplevel_page_intelligent-code-assistant-reader-insights .wrap' );

	if ( ! wrap ) {
		return;
	}
=======
	const wrap = document.querySelector( '.wrap' );
	if ( ! wrap ) return;
>>>>>>> main

	const escapeHtml = ( value ) => {
		const div = document.createElement( 'div' );
		div.textContent = String( value ?? '' );
		return div.innerHTML;
	};

	wrap.querySelectorAll( 'div[style*="background:#fff"]' ).forEach( ( card ) => {
<<<<<<< HEAD
		if ( card.querySelector( 'strong' ) && card.querySelector( 'span' ) ) {
			card.classList.add( 'ica-stat-card' );
		}
	} );

	const aiHeading = Array.from( wrap.querySelectorAll( 'h2' ) ).find(
		( heading ) => heading.textContent.trim().toLowerCase() === 'ai editorial insights'
	);

	if ( ! aiHeading ) {
		return;
	}

	const panel = aiHeading.parentElement;
	panel.classList.add( 'ica-ai-panel' );

	const intro = panel.querySelector( 'p' );
	if ( intro ) {
		intro.textContent = config.i18n?.intro || 'Use the deterministic reader data above as context for an AI-assisted editorial interpretation. The suggestions remain evidence-based and are for the author to review.';
	}

	const button = panel.querySelector( 'button' );
	if ( ! button || ! config.postId ) {
		return;
	}

=======
		if ( card.querySelector( 'strong' ) ) card.classList.add( 'ica-stat-card' );
	} );

	const isArticle = config.mode === 'article' && Number( config.postId ) > 0;
	const isCodeExample = config.mode === 'codeExample' && Number( config.codeExampleId ) > 0;
	if ( ( ! isArticle && ! isCodeExample ) || ! config.endpoint ) return;

	const requestPayload = isCodeExample
		? { codeExampleId: Number( config.codeExampleId ) }
		: { postId: Number( config.postId ) };

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
>>>>>>> main
	button.disabled = false;
	button.textContent = config.i18n?.generate || 'Generate AI insights';
	button.classList.add( 'ica-generate-insights' );

<<<<<<< HEAD
	const header = document.createElement( 'div' );
	header.className = 'ica-ai-panel-header';

	const headingCopy = document.createElement( 'div' );
	headingCopy.className = 'ica-ai-panel-copy';

	aiHeading.insertAdjacentElement( 'beforebegin', header );
	headingCopy.appendChild( aiHeading );
	if ( intro ) {
		headingCopy.appendChild( intro );
	}
	header.appendChild( headingCopy );
	header.appendChild( button );

	const status = document.createElement( 'span' );
	status.className = 'ica-ai-status';
	status.setAttribute( 'aria-live', 'polite' );
	status.setAttribute( 'role', 'status' );
	header.insertAdjacentElement( 'afterend', status );

	const results = document.createElement( 'div' );
	results.className = 'ica-ai-results';
	results.hidden = true;
	results.setAttribute( 'aria-live', 'polite' );
	results.setAttribute( 'aria-busy', 'false' );
	panel.appendChild( results );

	const renderList = ( title, items ) => {
		if ( ! Array.isArray( items ) || items.length === 0 ) {
			return '';
		}

		return `
			<section class="ica-insight-card">
				<h3>${ escapeHtml( title ) }</h3>
				<ul>${ items.map( ( item ) => `<li>${ escapeHtml( item ) }</li>` ).join( '' ) }</ul>
			</section>
		`;
	};

	const renderLoading = () => {
		results.innerHTML = `
			<div class="ica-ai-shimmer" aria-hidden="true">
				<div class="ica-shimmer-line ica-shimmer-line--wide"></div>
				<div class="ica-shimmer-line"></div>
				<div class="ica-shimmer-line ica-shimmer-line--short"></div>
				<div class="ica-shimmer-grid">
					<div class="ica-shimmer-card"></div>
					<div class="ica-shimmer-card"></div>
					<div class="ica-shimmer-card"></div>
				</div>
			</div>
		`;
=======
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
>>>>>>> main
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
<<<<<<< HEAD

		results.classList.remove( 'is-loading' );
		results.setAttribute( 'aria-busy', 'false' );
		results.innerHTML = `
			<div class="ica-ai-summary">${ escapeHtml( data.summary || '' ) }</div>
			${ cards ? `<div class="ica-insight-grid">${ cards }</div>` : '' }
		`;
=======
		results.classList.remove( 'is-loading' );
		results.setAttribute( 'aria-busy', 'false' );
		results.innerHTML = `<div class="ica-ai-summary">${ escapeHtml( data.summary || '' ) }</div>${ cards ? `<div class="ica-insight-grid">${ cards }</div>` : '' }`;
>>>>>>> main
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
<<<<<<< HEAD
=======
		button.classList.add( 'is-generating' );
		button.dataset.idleLabel = button.textContent;
		button.textContent = config.i18n?.generating || 'Generating insights…';
>>>>>>> main
		status.classList.add( 'is-loading' );
		status.textContent = config.i18n?.generating || 'Generating insights…';
		renderLoading();

		try {
			const response = await fetch( config.endpoint, {
				method: 'POST',
				credentials: 'same-origin',
<<<<<<< HEAD
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': config.nonce,
				},
				body: JSON.stringify( { postId: Number( config.postId ) } ),
			} );

			const data = await response.json();

			if ( ! response.ok ) {
				throw new Error( config.i18n?.error || 'AI insights are currently unavailable. Please try again later.' );
			}

			renderInsights( data );
			button.textContent = config.i18n?.regenerate || 'Regenerate insights';
			status.textContent = config.i18n?.generated || 'Generated from current analytics';
		} catch ( error ) {
			showError( config.i18n?.error || 'AI insights are currently unavailable. Please try again later.' );
=======
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
>>>>>>> main
			status.textContent = '';
		} finally {
			status.classList.remove( 'is-loading' );
			button.disabled = false;
			button.removeAttribute( 'aria-disabled' );
<<<<<<< HEAD
=======
			button.classList.remove( 'is-generating' );
			if ( ! results.querySelector( '.ica-ai-summary' ) ) {
				button.textContent = button.dataset.idleLabel || config.i18n?.generate || 'Generate AI insights';
			}
>>>>>>> main
			results.setAttribute( 'aria-busy', 'false' );
		}
	} );
}() );
