const BLOCK_SELECTOR = '[data-ai-assistant-enabled="true"]';
const LAUNCHER_CLASS = 'wpe-floating-ai-assistant';
const ACTIVE_ATTRIBUTE = 'data-ai-assistant-active';

const visibleBlocks = new Map();
let activeBlock = null;
let launcher = null;
let rafId = null;
let hasPlayedLauncherAttention = false;
let launcherReminderTimer = null;
const LAUNCHER_REMINDER_INTERVAL = 9000;

function isBlockExpanded(block) {
	return Boolean(block?.querySelector('.editor-inner-blocks-wrapper.active'));
}

function getBlockLabel(block) {
	const title = block?.querySelector('.code-title');
	return title?.textContent?.trim() || 'this code snippet';
}

function syncLauncherState() {
	if (!launcher) {
		return;
	}

	const drawer = activeBlock?.querySelector('.ai-assistant-drawer');
	const isOpen = Boolean(drawer && !drawer.hidden);
	const label = launcher.querySelector('.wpe-floating-ai-assistant__label');

	launcher.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

	// The visible CTA only changes while the reader is hovering the launcher.
	if (label && !launcher.matches(':hover')) {
		label.textContent = 'Code Assistant';
	}

	launcher.setAttribute(
		'aria-label',
		activeBlock
			? `Open Code Assistant for ${getBlockLabel(activeBlock)}`
			: 'Open Code Assistant'
	);
}

function closeAssistantFor(block) {
	const drawer = block?.querySelector('.ai-assistant-drawer');

	if (!drawer || drawer.hidden) {
		return;
	}

	drawer.querySelector('.ai-assistant-header .explanation-close-btn')?.click();
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
		activeBlock.classList.add('is-ai-assistant-visible-highlight');
	}

	if (launcher) {
		const wasHidden = launcher.hidden;
		launcher.hidden = !activeBlock;

		if (wasHidden && activeBlock) {
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
	const viewportHeight =
		window.innerHeight || document.documentElement.clientHeight;
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
	launcher.setAttribute('aria-label', 'Open Code Assistant');
	launcher.innerHTML =
		'<span aria-hidden="true">✦</span><span class="wpe-floating-ai-assistant__label">Code Assistant</span>';

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

		if (!activeBlock || !isMeaningfullyVisible(activeBlock)) {
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

	// Expanding a block is an explicit focus action and immediately makes that
	// block the current context. Normal viewport selection resumes on scroll.
	blocks.forEach((block) => {
		const panel = block.querySelector('.editor-inner-blocks-wrapper');
		if (!panel) {
			return;
		}

		const expansionObserver = new MutationObserver(() => {
			if (isBlockExpanded(block) && isMeaningfullyVisible(block)) {
				setActiveBlock(block);
				block.classList.add('is-ai-assistant-focused');
				block.classList.add('is-ai-assistant-visible-highlight');
			} else {
				scheduleActiveBlockUpdate();
			}
		});

		expansionObserver.observe(panel, {
			attributes: true,
			attributeFilter: ['class'],
		});
	});

	if (!('IntersectionObserver' in window)) {
		blocks.forEach((block) => visibleBlocks.set(block, 1));
		chooseActiveBlock();
		window.addEventListener('scroll', scheduleActiveBlockUpdate, {
			passive: true,
		});
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

			chooseActiveBlock();
		},
		{
			root: null,
			rootMargin: '-12% 0px -12% 0px',
			threshold: [0, 0.15, 0.35, 0.5, 0.75, 1],
		}
	);

	blocks.forEach((block) => observer.observe(block));
	window.addEventListener('scroll', scheduleActiveBlockUpdate, { passive: true });
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
			drawerObserver.observe(drawer, {
				attributes: true,
				attributeFilter: ['hidden'],
			});
		}
	});

	chooseActiveBlock();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', observeBlocks, { once: true });
} else {
	observeBlocks();
}
