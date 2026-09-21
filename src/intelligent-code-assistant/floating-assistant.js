const BLOCK_SELECTOR = '[data-ai-assistant-enabled="true"]';
const LAUNCHER_CLASS = 'wpe-floating-ai-assistant';
const ACTIVE_ATTRIBUTE = 'data-ai-assistant-active';

let activeBlock = null;
let launcher = null;
let hasPlayedLauncherAttention = false;
let launcherReminderTimer = null;
const LAUNCHER_REMINDER_INTERVAL = 18000;

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

	if (label) {
		label.textContent = activeBlock ? 'Ask about this code' : 'Code Assistant';
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
		closeAssistantFor(activeBlock);
	}

	activeBlock = nextBlock || null;

	if (activeBlock) {
		activeBlock.setAttribute(ACTIVE_ATTRIBUTE, 'true');
		if (launcher?.hidden) {
			launcher.hidden = false;
		}
	}

	if (launcher) {
		const hadActiveContext = launcher.classList.contains('has-active-context');
		launcher.classList.toggle('has-active-context', Boolean(activeBlock));

		if (!hadActiveContext && activeBlock) {
			window.requestAnimationFrame(() => {
				playLauncherAttention();
				scheduleLauncherReminder();
			});
		} else if (!activeBlock) {
			window.clearTimeout(launcherReminderTimer);
		}
	}

	syncLauncherState();
}

function syncExpandedBlock(blocks, preferredBlock = null) {
	if (preferredBlock && isBlockExpanded(preferredBlock)) {
		setActiveBlock(preferredBlock);
		return;
	}

	if (activeBlock && isBlockExpanded(activeBlock)) {
		return;
	}

	const expandedBlock = blocks.find((block) => isBlockExpanded(block)) || null;
	setActiveBlock(expandedBlock);
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

	launcher.addEventListener('click', () => {
		window.clearTimeout(launcherReminderTimer);

		if (!activeBlock || !isBlockExpanded(activeBlock)) {
			setActiveBlock(null);
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

	blocks.forEach((block) => {
		const panel = block.querySelector('.editor-inner-blocks-wrapper');

		if (!panel) {
			return;
		}

		const observer = new MutationObserver(() => {
			if (isBlockExpanded(block)) {
				syncExpandedBlock(blocks, block);
			} else if (activeBlock === block) {
				setActiveBlock(null);
			}
		});

		observer.observe(panel, {
			attributes: true,
			attributeFilter: ['class'],
		});
	});

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

	syncExpandedBlock(blocks);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', observeBlocks, { once: true });
} else {
	observeBlocks();
}
