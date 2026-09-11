( function () {
	'use strict';

	const config = window.ICAReaderInsights || {};
	const wrap = document.querySelector( 'body.toplevel_page_intelligent-code-assistant-reader-insights .wrap' );

	if ( ! wrap ) {
		return;
	}

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
		intro.textContent = 'Use the deterministic reader data above as context for an AI-assisted editorial interpretation. The suggestions remain evidence-based and are for the author to review.';
	}

	const button = panel.querySelector( 'button' );
	if ( ! button || ! config.postId ) {
		return;
	}

	button.disabled = false;
	button.textContent = config.i18n?.generate || 'Generate AI insights';
	button.classList.add( 'ica-generate-insights' );

	const status = document.createElement( 'span' );
	status.className = 'ica-ai-status';
	button.insertAdjacentElement( 'afterend', status );

	const results = document.createElement( 'div' );
	results.className = 'ica-ai-results';
	results.hidden = true;
	panel.appendChild( results );

	const escapeHtml = ( value ) => {
		const div = document.createElement( 'div' );
		div.textContent = String( value || '' );
		return div.innerHTML;
	};

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

	const renderInsights = ( data ) => {
		const cards = [
			renderList( 'Potential friction points', data.frictionPoints ),
			renderList( 'Recommendations', data.recommendations ),
			renderList( 'Suggested FAQs', data.suggestedFaqs ),
		].filter( Boolean ).join( '' );

		results.innerHTML = `
			<div class="ica-ai-summary">${ escapeHtml( data.summary || '' ) }</div>
			${ cards ? `<div class="ica-insight-grid">${ cards }</div>` : '' }
		`;
		results.hidden = false;
	};

	const showError = ( message ) => {
		results.innerHTML = `<div class="ica-ai-error">${ escapeHtml( message ) }</div>`;
		results.hidden = false;
	};

	button.addEventListener( 'click', async () => {
		button.disabled = true;
		status.classList.add( 'is-loading' );
		status.textContent = config.i18n?.generating || 'Generating insights…';
		results.hidden = true;

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
				throw new Error( data?.message || config.i18n?.error || 'Unable to generate AI insights.' );
			}

			renderInsights( data );
			button.textContent = config.i18n?.regenerate || 'Regenerate insights';
			status.textContent = 'Generated from current analytics';
		} catch ( error ) {
			showError( error?.message || config.i18n?.error || 'Unable to generate AI insights. Please try again.' );
			status.textContent = '';
		} finally {
			status.classList.remove( 'is-loading' );
			button.disabled = false;
		}
	} );
}() );
