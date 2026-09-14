( function () {
	'use strict';

	const BULLET_PATTERN = /^\s*(?:[•●◦▪*-]|\d+[.)])\s+(.+)$/;

	function splitStructuredText( text ) {
		const paragraphs = [];
		const items = [];
		let paragraph = [];

		String( text || '' ).split( /\r?\n/ ).forEach( ( rawLine ) => {
			const line = rawLine.trim();

			if ( ! line ) {
				if ( paragraph.length ) {
					paragraphs.push( paragraph.join( ' ' ) );
					paragraph = [];
				}
				return;
			}

			const bulletMatch = line.match( BULLET_PATTERN );
			if ( bulletMatch ) {
				if ( paragraph.length ) {
					paragraphs.push( paragraph.join( ' ' ) );
					paragraph = [];
				}
				items.push( bulletMatch[1].trim() );
				return;
			}

			paragraph.push( line );
		} );

		if ( paragraph.length ) {
			paragraphs.push( paragraph.join( ' ' ) );
		}

		return { paragraphs, items };
	}

	function createList( items ) {
		const list = document.createElement( 'ul' );
		list.className = 'ica-ai-semantic-list';
		list.dataset.icaGeneratedList = 'true';

		items.forEach( ( item ) => {
			const listItem = document.createElement( 'li' );
			listItem.textContent = item;
			list.appendChild( listItem );
		} );

		return list;
	}

	function removeGeneratedSiblingList( element ) {
		const sibling = element.nextElementSibling;
		if ( sibling?.dataset?.icaGeneratedList === 'true' ) {
			sibling.remove();
		}
	}

	function formatTextElement( element ) {
		if ( ! element || element.closest( '.ica-ai-semantic-list' ) ) {
			return;
		}

		const source = element.textContent || '';
		if ( ! source.trim() ) {
			removeGeneratedSiblingList( element );
			delete element.dataset.icaRenderedText;
			return;
		}

		if ( element.dataset.icaRenderedText === source ) {
			return;
		}

		removeGeneratedSiblingList( element );

		const { paragraphs, items } = splitStructuredText( source );
		if ( ! items.length ) {
			element.dataset.icaRenderedText = source;
			return;
		}

		const paragraphText = paragraphs.join( ' ' );
		element.textContent = paragraphText;
		element.dataset.icaRenderedText = paragraphText;
		element.insertAdjacentElement( 'afterend', createList( items ) );
	}

	function formatExplainCodeList( container ) {
		if ( ! container ) {
			return;
		}

		const existingItems = Array.from( container.querySelectorAll( '.explanation-bullet-item .bullet-text' ) )
			.map( ( node ) => ( node.textContent || '' ).trim() )
			.filter( Boolean );

		if ( ! existingItems.length ) {
			return;
		}

		const signature = existingItems.join( '\n' );
		if ( container.dataset.icaFormattedSource === signature && container.querySelector( '.ica-ai-semantic-list' ) ) {
			return;
		}

		container.replaceChildren( createList( existingItems ) );
		container.dataset.icaFormattedSource = signature;
	}

	function formatResponses( root = document ) {
		root.querySelectorAll( '.explanation-formatted-list' ).forEach( formatExplainCodeList );

		root.querySelectorAll(
			'.line-explanation-content > p, .ask-code-response > p, .understanding-check-explanation, .ica-ai-summary'
		).forEach( formatTextElement );
	}

	let scheduled = false;
	function scheduleFormatting() {
		if ( scheduled ) {
			return;
		}

		scheduled = true;
		window.requestAnimationFrame( () => {
			scheduled = false;
			formatResponses();
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', scheduleFormatting, { once: true } );
	} else {
		scheduleFormatting();
	}

	const observer = new MutationObserver( scheduleFormatting );
	observer.observe( document.documentElement, {
		childList: true,
		subtree: true,
		characterData: true,
	} );
}() );
