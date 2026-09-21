const BLOCK_SELECTOR = '[data-ai-assistant-enabled="true"]';
const LAUNCHER_CLASS = 'wpe-floating-ai-assistant';
const ACTIVE_ATTRIBUTE = 'data-ai-assistant-active';

const visibleBlocks = new Map();
let activeBlock = null;
let launcher = null;
let rafId = null;
let hasPlayedLauncherAttention = false;
let launcherReminderTimer = null;
let scrollSettleTimer = null;
let isScrolling = false;
let hasRevealedLauncher = false;
const LAUNCHER_REMINDER_INTERVAL = 18000;
const SCROLL_SETTLE_DELAY = 225;


function syncLauncherState() {
	if (!launcher) {
		return;
	}

	const drawer = activeBlock?.querySelector('.ai-assistant-drawer');
	const isOpen = Boolean(drawer && !drawer.hidden);

	launcher.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
	const label = launcher.querySelector('.wpe-floating-ai-assistant__label');
	if (label) {
		label.textContent = activeBlock ? 'Ask about this code' : 'Code Assistant';
	}
	launcher.setAttribute(
		'aria-label',
		activeBlock
			? 'Ask about this code'
			: 'Code Assistant — scroll to an AI-enabled code block'
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
		if (launcher && !hasRevealedLauncher) {
			hasRevealedLauncher = true;
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

function isMeaningfullyVisible(block) {
	if (!block?.isConnected) {
		return false;
	}

	const rect = block.getBoundingClientRect();
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
	const activationTop = viewportHeight * 0.12;
	const activationBottom = viewportHeight * 0.88;

	return rect.bottom > activationTop && rect.top < activationBottom;
}

function chooseActiveBlock() {
	const viewportCenter = window.innerHeight / 2;
	let bestBlock = null;
	let bestScore = Number.POSITIVE_INFINITY;

	visibleBlocks.forEach((intersectionRatio, block) => {
		if (intersectionRatio <= 0 || !isMeaningfullyVisible(block)) {
			return;
		}

		const rect = block.getBoundingClientRect();
		const blockCenter = rect.top + rect.height / 2;
		const distanceFromCenter = Math.abs(blockCenter - viewportCenter);
		const score = distanceFromCenter - intersectionRatio * 100;

		if (score < bestScore) {
			bestScore = score;
			bestBlock = block;
		}
	});

	setActiveBlock(bestBlock);
}

function handleScroll() {
	if (!isScrolling) {
		isScrolling = true;
		setActiveBlock(null);
	}

	window.clearTimeout(scrollSettleTimer);
	scrollSettleTimer = window.setTimeout(() => {
		isScrolling = false;
		chooseActiveBlock();
	}, SCROLL_SETTLE_DELAY);
}

function scheduleActiveBlockUpdate() {
	if (rafId !== null) {
		return;
	}

	rafId = window.requestAnimationFrame(() => {
		rafId = null;
		chooseActiveBlock();
	});
}

function scheduleLauncherReminder() {
	window.clearTimeout(launcherReminderTimer);

	if (!launcher || launcher.hidden || launcher.getAttribute('aria-expanded') === 'true') {
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
		if (!activeBlock || !isMeaningfullyVisible(activeBlock)) {
			setActiveBlock(null);
			return;
		}

		activeBlock.classList.add('is-ai-assistant-focused');

		const blockLauncher = activeBlock.querySelector('.ai-assistant-button');
		blockLauncher?.click();

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

	if (!('IntersectionObserver' in window)) {
		blocks.forEach((block) => visibleBlocks.set(block, 1));
		chooseActiveBlock();
		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', scheduleActiveBlockUpdate);
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					visibleBlocks.set(entry.target, entry.intersectionRatio);
				} else {
					visibleBlocks.delete(entry.target);
				}
			});

			if (!isScrolling) {
				chooseActiveBlock();
			}
		},
		{
			root: null,
			rootMargin: '-12% 0px -12% 0px',
			threshold: [0, 0.15, 0.35, 0.5, 0.75, 1],
		}
	);

	blocks.forEach((block) => observer.observe(block));
	window.addEventListener('scroll', handleScroll, { passive: true });
	window.addEventListener('resize', scheduleActiveBlockUpdate);

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
			drawerObserver.observe(drawer, { attributes: true, attributeFilter: ['hidden'] });
		}
	});

	chooseActiveBlock();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', observeBlocks, { once: true });
} else {
	observeBlocks();
}
