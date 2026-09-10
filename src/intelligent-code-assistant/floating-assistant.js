const BLOCK_SELECTOR = '[data-ai-assistant-enabled="true"]';
const LAUNCHER_CLASS = 'wpe-floating-ai-assistant';
const ACTIVE_ATTRIBUTE = 'data-ai-assistant-active';

const visibleBlocks = new Map();
let activeBlock = null;
let launcher = null;
let rafId = null;

function getBlockLabel(block) {
	const title = block?.querySelector('.code-title');
	const text = title?.textContent?.trim();

	return text || 'this code example';
}

function syncLauncherState() {
	if (!launcher) {
		return;
	}

	const drawer = activeBlock?.querySelector('.ai-assistant-drawer');
	const isOpen = Boolean(drawer && !drawer.hidden);

	launcher.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
	launcher.setAttribute(
		'aria-label',
		activeBlock
			? `Open AI Assistant for ${getBlockLabel(activeBlock)}`
			: 'Open AI Assistant'
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
		closeAssistantFor(activeBlock);
	}

	activeBlock = nextBlock || null;

	if (activeBlock) {
		activeBlock.setAttribute(ACTIVE_ATTRIBUTE, 'true');
	}

	if (launcher) {
		launcher.hidden = !activeBlock;
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

function scheduleActiveBlockUpdate() {
	if (rafId !== null) {
		return;
	}

	rafId = window.requestAnimationFrame(() => {
		rafId = null;
		chooseActiveBlock();
	});
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
	launcher.innerHTML = '<span aria-hidden="true">✦</span><span>AI Assistant</span>';

	launcher.addEventListener('click', () => {
		if (!activeBlock || !isMeaningfullyVisible(activeBlock)) {
			setActiveBlock(null);
			return;
		}

		const blockLauncher = activeBlock.querySelector('.ai-assistant-button');
		blockLauncher?.click();

		window.setTimeout(syncLauncherState, 0);
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
		window.addEventListener('scroll', scheduleActiveBlockUpdate, { passive: true });
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
