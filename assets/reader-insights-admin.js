( function () {
	'use strict';

	const config = window.ICAReaderInsights || {};
	const wrap = document.querySelector( 'body.toplevel_page_intelligent-code-assistant-reader-insights .wrap' );

	if ( ! wrap ) {
		return;
	}

	const escapeHtml = ( value ) => {
		const div = document.createElement( 'div' );
		div.textContent = String( value ?? '' );
		return div.innerHTML;
	};

	wrap.querySelectorAll( 'div[style*="background:#fff"]' ).forEach( ( card ) => {
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

	button.disabled = false;
	button.textContent = config.i18n?.generate || 'Generate AI insights';
	button.classList.add( 'ica-generate-insights' );

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
		results.innerHTML = `
			<div class="ica-ai-summary">${ escapeHtml( data.summary || '' ) }</div>
			${ cards ? `<div class="ica-insight-grid">${ cards }</div>` : '' }
		`;
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
		status.classList.add( 'is-loading' );
		status.textContent = config.i18n?.generating || 'Generating insights…';
		renderLoading();

		try {
			const response = await fetch( config.endpoint, {
				method: 'POST',
				credentials: 'same-origin',
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
			status.textContent = '';
		} finally {
			status.classList.remove( 'is-loading' );
			button.disabled = false;
			button.removeAttribute( 'aria-disabled' );
			results.setAttribute( 'aria-busy', 'false' );
		}
	} );
}() );
