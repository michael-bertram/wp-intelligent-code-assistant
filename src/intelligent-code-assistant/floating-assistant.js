const BLOCK_SELECTOR = '[data-ai-assistant-enabled="true"]';
const LAUNCHER_CLASS = 'wpe-floating-ai-assistant';
const ACTIVE_ATTRIBUTE = 'data-ai-assistant-active';

let activeBlock = null;
let launcher = null;
let hasPlayedLauncherAttention = false;
let launcherReminderTimer = null;
let hasRevealedLauncher = false;
const LAUNCHER_REMINDER_INTERVAL = 9000;

function isBlockExpanded(block) {
	return Boolean(block?.querySelector('.editor-inner-blocks-wrapper.active'));
}

function syncLauncherState() {
	if (!launcher) {
		return;
	}

	const drawer = activeBlock?.querySelector('.ai-assistant-drawer');
	const isOpen = Boolean(drawer && !drawer.hidden);
	const label = launcher.querySelector('.wpe-floating-ai-assistant__label');

	launcher.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

	if (label && !launcher.matches(':hover')) {
		label.textContent = 'Code Assistant';
	}

	launcher.setAttribute(
		'aria-label',
		activeBlock ? 'Ask about this code' : 'Code Assistant'
	);
}

function closeAssistantFor(block) {
	const drawer = block?.querySelector('.ai-assistant-drawer');

	if (!drawer || drawer.hidden) {
		return;
	}

	const closeButton = drawer.querySelector('.ai-assistant-header .explanation-close-btn');
	closeButton?.click();
}

function setActiveBlock(nextBlock) {
	if (activeBlock === nextBlock) {
		syncLauncherState();
		return;
	}

	if (activeBlock) {
		activeBlock.removeAttribute(ACTIVE_ATTRIBUTE);
		activeBlock.classList.remove('is-ai-assistant-focused');
		activeBlock.classList.remove('is-ai-assistant-visible-highlight');
		closeAssistantFor(activeBlock);
	}

	activeBlock = nextBlock || null;

	if (activeBlock) {
		activeBlock.setAttribute(ACTIVE_ATTRIBUTE, 'true');
		if (activeBlock.getBoundingClientRect().bottom > 0 && activeBlock.getBoundingClientRect().top < window.innerHeight) {
			activeBlock.classList.add('is-ai-assistant-visible-highlight');
		}
	}

	if (launcher) {
		if (activeBlock) {
			scheduleLauncherReminder();
		} else {
			window.clearTimeout(launcherReminderTimer);
		}
	}

	syncLauncherState();
}

function getExpandedBlock(blocks) {
	return blocks.find((block) => isBlockExpanded(block)) || null;
}

function scheduleLauncherReminder() {
	window.clearTimeout(launcherReminderTimer);

	if (
		!launcher ||
		launcher.hidden ||
		!activeBlock ||
		launcher.getAttribute('aria-expanded') === 'true'
	) {
		return;
	}

	launcherReminderTimer = window.setTimeout(() => {
		playLauncherAttention(true);
		scheduleLauncherReminder();
	}, LAUNCHER_REMINDER_INTERVAL);
}

function playLauncherAttention(isReminder = false) {
	if (
		!launcher ||
		(!isReminder && hasPlayedLauncherAttention) ||
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
		typeof launcher.animate !== 'function'
	) {
		return;
	}

	if (!isReminder) {
		hasPlayedLauncherAttention = true;
	}

	launcher.animate(
		[
			{ transform: 'translateY(0) scale(1)', offset: 0 },
			{ transform: 'translateY(-8px) scale(1.05)', offset: 0.2 },
			{ transform: 'translateY(0) scale(1)', offset: 0.4 },
			{ transform: 'translateY(-4px) scale(1.025)', offset: 0.56 },
			{ transform: 'translateY(0) scale(1)', offset: 0.72 },
			{ transform: 'translateY(0) scale(1)', offset: 1 },
		],
		{ duration: 1600, easing: 'ease-out' }
	);

	launcher.querySelector('span[aria-hidden="true"]')?.animate(
		[
			{ transform: 'scale(1) rotate(0deg)' },
			{ transform: 'scale(1.45) rotate(16deg)', offset: 0.24 },
			{ transform: 'scale(1) rotate(0deg)', offset: 0.48 },
			{ transform: 'scale(1.18) rotate(-8deg)', offset: 0.62 },
			{ transform: 'scale(1) rotate(0deg)' },
		],
		{ duration: 1600, easing: 'ease-out' }
	);
}

function createLauncher() {
	if (launcher) {
		return launcher;
	}

	launcher = document.createElement('button');
	launcher.type = 'button';
	launcher.className = LAUNCHER_CLASS;
	launcher.hidden = true;
	launcher.setAttribute('aria-expanded', 'false');
	launcher.setAttribute('aria-label', 'Code Assistant');
	launcher.innerHTML = '<span aria-hidden="true">✦</span><span class="wpe-floating-ai-assistant__label">Code Assistant</span>';

	launcher.addEventListener('mouseenter', () => {
		if (!activeBlock) {
			return;
		}

		launcher.classList.add('has-active-context');
		const label = launcher.querySelector('.wpe-floating-ai-assistant__label');
		if (label) {
			label.textContent = 'Ask about this code';
		}
	});

	launcher.addEventListener('mouseleave', () => {
		launcher.classList.remove('has-active-context');
		const label = launcher.querySelector('.wpe-floating-ai-assistant__label');
		if (label) {
			label.textContent = 'Code Assistant';
		}
	});

	launcher.addEventListener('click', () => {
		window.clearTimeout(launcherReminderTimer);

		if (!activeBlock) {
			return;
		}

		activeBlock.classList.add('is-ai-assistant-focused');
		activeBlock.querySelector('.ai-assistant-button')?.click();

		window.setTimeout(() => {
			syncLauncherState();
			if (launcher?.getAttribute('aria-expanded') !== 'true') {
				scheduleLauncherReminder();
			}
		}, 0);
	});

	document.body.appendChild(launcher);
	return launcher;
}

function observeBlocks() {
	const blocks = Array.from(document.querySelectorAll(BLOCK_SELECTOR));

	if (!blocks.length) {
		return;
	}

	createLauncher();

	// Reveal the neutral Code Assistant when the reader reaches the first
	// AI-enabled code block. Visibility alone never selects a block.
	if ('IntersectionObserver' in window) {
		const revealObserver = new IntersectionObserver(
			(entries) => {
				if (
					!hasRevealedLauncher &&
					entries.some((entry) => entry.isIntersecting)
				) {
					hasRevealedLauncher = true;
					launcher.hidden = false;
					window.requestAnimationFrame(() => {
						playLauncherAttention();
						scheduleLauncherReminder();
					});
					revealObserver.disconnect();
				}
			},
			{ threshold: 0.1 }
		);

		blocks.forEach((block) => revealObserver.observe(block));
	} else {
		hasRevealedLauncher = true;
		launcher.hidden = false;
	}

	blocks.forEach((block) => {
		const panel = block.querySelector('.editor-inner-blocks-wrapper');
		if (!panel) {
			return;
		}

		const observer = new MutationObserver(() => {
			if (isBlockExpanded(block)) {
				setActiveBlock(block);
				block.classList.add('is-ai-assistant-focused');
				block.classList.add('is-ai-assistant-visible-highlight');
			} else if (activeBlock === block && !block.matches(':hover')) {
				setActiveBlock(getExpandedBlock(blocks));
			}
		});

		observer.observe(panel, {
			attributes: true,
			attributeFilter: ['class'],
		});
	});

	// Keep expansion as the explicit context, but remove the visual block
	// highlight once that active block has scrolled out of view.
	if ('IntersectionObserver' in window) {
		const activeHighlightObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.target !== activeBlock) {
						return;
					}

					entry.target.classList.toggle(
						'is-ai-assistant-visible-highlight',
						entry.isIntersecting
					);

					if (!entry.isIntersecting) {
						entry.target.classList.remove('is-ai-assistant-focused');
					}
				});
			},
			{ threshold: 0.05 }
		);

		blocks.forEach((block) => activeHighlightObserver.observe(block));
	}

	const drawerObserver = new MutationObserver((mutations) => {
		if (
			mutations.some(
				(mutation) =>
					mutation.type === 'attributes' &&
					mutation.attributeName === 'hidden' &&
					mutation.target.classList?.contains('ai-assistant-drawer')
			)
		) {
			syncLauncherState();
		}
	});

	blocks.forEach((block) => {
		const drawer = block.querySelector('.ai-assistant-drawer');
		if (drawer) {
			drawerObserver.observe(drawer, {
				attributes: true,
				attributeFilter: ['hidden'],
			});
		}
	});

	const initiallyExpanded = getExpandedBlock(blocks);
	if (initiallyExpanded) {
		setActiveBlock(initiallyExpanded);
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', observeBlocks, { once: true });
} else {
	observeBlocks();
}
