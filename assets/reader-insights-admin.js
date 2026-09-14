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

	const diagnosticConfig = config.diagnostics || {};
	if ( diagnosticConfig.adminEndpoint && diagnosticConfig.anonymousEndpoint && diagnosticConfig.token ) {
		const diagnosticPanel = document.createElement( 'section' );
		diagnosticPanel.className = 'ica-ai-panel ica-diagnostics-panel';
		diagnosticPanel.style.marginTop = '24px';
		diagnosticPanel.innerHTML = `
			<div class="ica-ai-panel-header">
				<div class="ica-ai-panel-copy">
					<h2>${ escapeHtml( config.i18n?.diagnosticsTitle || 'Temporary AI Diagnostics' ) }</h2>
					<p>${ escapeHtml( config.i18n?.diagnosticsIntro || 'Compares the authenticated admin request with a deliberately anonymous request. No API keys, tokens, Authorization headers, generated content, or raw provider messages are shown.' ) }</p>
				</div>
				<button type="button" class="button button-secondary ica-run-diagnostics">${ escapeHtml( config.i18n?.runDiagnostics || 'Run diagnostics' ) }</button>
			</div>
			<div class="ica-diagnostics-status" role="status" aria-live="polite"></div>
			<div class="ica-diagnostics-results" aria-live="polite"></div>
		`;
		wrap.appendChild( diagnosticPanel );

		const diagnosticButton = diagnosticPanel.querySelector( '.ica-run-diagnostics' );
		const diagnosticStatus = diagnosticPanel.querySelector( '.ica-diagnostics-status' );
		const diagnosticResults = diagnosticPanel.querySelector( '.ica-diagnostics-results' );

		const renderDiagnosticContext = ( title, data ) => {
			const connectors = Array.isArray( data?.connectors ) ? data.connectors : [];
			const generation = data?.generationTest || {};

			const connectorRows = connectors.length
				? connectors.map( ( connector ) => `
					<tr>
						<td>${ escapeHtml( connector.name || connector.id ) }</td>
						<td><code>${ escapeHtml( connector.id ) }</code></td>
						<td>${ escapeHtml( connector.authMethod || '—' ) }</td>
						<td>${ escapeHtml( connector.credentialSource || 'none' ) }</td>
						<td>${ connector.hasCredential ? 'Yes' : 'No' }</td>
					</tr>
				` ).join( '' )
				: '<tr><td colspan="5">No connectors reported.</td></tr>';

			const generationResult = generation.ran
				? generation.success
					? 'Success'
					: `Failed${ generation.errorCode ? ` — ${ escapeHtml( generation.errorCode ) }` : '' }${ generation.status ? ` (${ escapeHtml( generation.status ) })` : '' }`
				: 'Not run';

			const providerLabel = generation.providerName || generation.providerId || '';
			const modelLabel = generation.modelName || generation.modelId || '';

			return `
				<section class="ica-insight-card" style="margin-top:16px;">
					<h3>${ escapeHtml( title ) }</h3>
					<p>
						<strong>Logged in:</strong> ${ data?.loggedIn ? 'Yes' : 'No' }
						&nbsp; · &nbsp;<strong>AI Client:</strong> ${ data?.aiClientAvailable ? 'Available' : 'Unavailable' }
						&nbsp; · &nbsp;<strong>Generation test:</strong> ${ generationResult }
					</p>
					${ providerLabel || modelLabel ? `
						<p>
							${ providerLabel ? `<strong>Resolved provider:</strong> ${ escapeHtml( providerLabel ) }${ generation.providerId && generation.providerName ? ` (<code>${ escapeHtml( generation.providerId ) }</code>)` : '' }` : '' }
							${ providerLabel && modelLabel ? '&nbsp; · &nbsp;' : '' }
							${ modelLabel ? `<strong>Resolved model:</strong> ${ escapeHtml( modelLabel ) }${ generation.modelId && generation.modelName ? ` (<code>${ escapeHtml( generation.modelId ) }</code>)` : '' }` : '' }
						</p>
					` : '<p><strong>Resolved provider/model:</strong> unavailable because generation did not return a result.</p>' }
					${ generation.exceptionClass ? `<p><strong>Exception class:</strong> <code>${ escapeHtml( generation.exceptionClass ) }</code></p>` : '' }
					<div style="overflow-x:auto;">
						<table class="widefat striped">
							<thead>
								<tr>
									<th>Connector</th>
									<th>ID</th>
									<th>Auth</th>
									<th>Credential source</th>
									<th>Credential available</th>
								</tr>
							</thead>
							<tbody>${ connectorRows }</tbody>
						</table>
					</div>
				</section>
			`;
		};

		diagnosticButton.addEventListener( 'click', async () => {
			diagnosticButton.disabled = true;
			diagnosticButton.setAttribute( 'aria-disabled', 'true' );
			diagnosticStatus.textContent = config.i18n?.runningDiagnostics || 'Running diagnostics…';
			diagnosticResults.innerHTML = '';

			try {
				const anonymousUrl = new URL( diagnosticConfig.anonymousEndpoint, window.location.origin );
				anonymousUrl.searchParams.set( 'token', diagnosticConfig.token );

				const [ adminResponse, anonymousResponse ] = await Promise.all( [
					fetch( diagnosticConfig.adminEndpoint, {
						method: 'GET',
						credentials: 'same-origin',
						headers: {
							'X-WP-Nonce': config.nonce,
						},
					} ),
					fetch( anonymousUrl.toString(), {
						method: 'GET',
						credentials: 'omit',
						cache: 'no-store',
					} ),
				] );

				if ( ! adminResponse.ok || ! anonymousResponse.ok ) {
					throw new Error( 'diagnostics_failed' );
				}

				const [ adminData, anonymousData ] = await Promise.all( [
					adminResponse.json(),
					anonymousResponse.json(),
				] );

				diagnosticResults.innerHTML = `
					<div class="ica-insight-grid">
						${ renderDiagnosticContext( config.i18n?.adminContext || 'Authenticated admin request', adminData ) }
						${ renderDiagnosticContext( config.i18n?.anonymousContext || 'Anonymous frontend-style request', anonymousData ) }
					</div>
				`;
				diagnosticStatus.textContent = '';
			} catch ( error ) {
				diagnosticResults.innerHTML = `<div class="ica-ai-error" role="alert">${ escapeHtml( config.i18n?.diagnosticsFailed || 'Diagnostics could not be completed.' ) }</div>`;
				diagnosticStatus.textContent = '';
			} finally {
				diagnosticButton.disabled = false;
				diagnosticButton.removeAttribute( 'aria-disabled' );
			}
		} );
	}

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
