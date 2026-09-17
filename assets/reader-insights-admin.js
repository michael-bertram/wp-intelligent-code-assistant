( function () {
	'use strict';
	const config = window.ICAReaderInsights || {};
	const wrap = document.querySelector( '.wrap' );
	if ( ! wrap ) return;
	const escapeHtml = ( value ) => { const div=document.createElement('div'); div.textContent=String(value??''); return div.innerHTML; };
	wrap.querySelectorAll('div[style*="background:#fff"]').forEach((card)=>{if(card.querySelector('strong'))card.classList.add('ica-stat-card');});

	let aiHeading = Array.from(wrap.querySelectorAll('h2')).find((heading)=>heading.textContent.trim().toLowerCase()==='ai editorial insights');
	let panel = aiHeading ? aiHeading.parentElement : null;
	if ( ! panel && config.codeExampleId ) {
		panel=document.createElement('div'); panel.className='ica-ai-panel';
		panel.innerHTML='<h2>AI editorial insights</h2><p></p><button class="button button-primary" type="button"></button>';
		wrap.appendChild(panel); aiHeading=panel.querySelector('h2');
	}
	if ( ! aiHeading || ! panel ) return;
	panel.classList.add('ica-ai-panel');
	const intro=panel.querySelector('p'); if(intro)intro.textContent=config.i18n?.intro||'Use deterministic reader data as context for AI-assisted editorial interpretation.';
	const button=panel.querySelector('button'); const identity=config.codeExampleId||config.postId; if(!button||!identity)return;
	button.disabled=false;button.textContent=config.i18n?.generate||'Generate AI insights';button.classList.add('ica-generate-insights');
	const header=document.createElement('div');header.className='ica-ai-panel-header';const copy=document.createElement('div');copy.className='ica-ai-panel-copy';aiHeading.insertAdjacentElement('beforebegin',header);copy.appendChild(aiHeading);if(intro)copy.appendChild(intro);header.appendChild(copy);header.appendChild(button);
	const status=document.createElement('span');status.className='ica-ai-status';status.setAttribute('aria-live','polite');status.setAttribute('role','status');header.insertAdjacentElement('afterend',status);
	const results=document.createElement('div');results.className='ica-ai-results';results.hidden=true;results.setAttribute('aria-live','polite');results.setAttribute('aria-busy','false');panel.appendChild(results);
	const renderList=(title,items)=>!Array.isArray(items)||!items.length?'':`<section class="ica-insight-card"><h3>${escapeHtml(title)}</h3><ul>${items.map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
	const renderLoading=()=>{results.innerHTML='<div class="ica-ai-shimmer" aria-hidden="true"><div class="ica-shimmer-line ica-shimmer-line--wide"></div><div class="ica-shimmer-line"></div><div class="ica-shimmer-line ica-shimmer-line--short"></div><div class="ica-shimmer-grid"><div class="ica-shimmer-card"></div><div class="ica-shimmer-card"></div><div class="ica-shimmer-card"></div></div></div>';results.hidden=false;results.classList.add('is-loading');results.setAttribute('aria-busy','true');};
	const renderInsights=(data)=>{const cards=[renderList(config.i18n?.frictionPoints||'Potential friction points',data.frictionPoints),renderList(config.i18n?.recommendations||'Recommendations',data.recommendations),renderList(config.i18n?.suggestedFaqs||'Suggested FAQs',data.suggestedFaqs)].filter(Boolean).join('');results.classList.remove('is-loading');results.setAttribute('aria-busy','false');results.innerHTML=`<div class="ica-ai-summary">${escapeHtml(data.summary||'')}</div>${cards?`<div class="ica-insight-grid">${cards}</div>`:''}`;results.hidden=false;};
	const showError=(message)=>{results.classList.remove('is-loading');results.setAttribute('aria-busy','false');results.innerHTML=`<div class="ica-ai-error" role="alert">${escapeHtml(message)}</div>`;results.hidden=false;};
	button.addEventListener('click',async()=>{button.disabled=true;button.setAttribute('aria-disabled','true');status.classList.add('is-loading');status.textContent=config.i18n?.generating||'Generating insights…';renderLoading();try{const payload=config.codeExampleId?{codeExampleId:Number(config.codeExampleId)}:{postId:Number(config.postId)};const response=await fetch(config.endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-WP-Nonce':config.nonce},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data?.message||config.i18n?.error);renderInsights(data);button.textContent=config.i18n?.regenerate||'Regenerate insights';status.textContent=config.i18n?.generated||'Generated from current analytics';}catch(error){showError(error?.message||config.i18n?.error||'AI insights are currently unavailable.');status.textContent='';}finally{status.classList.remove('is-loading');button.disabled=false;button.removeAttribute('aria-disabled');results.setAttribute('aria-busy','false');}});
}() );
