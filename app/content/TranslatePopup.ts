const POPUP_ID = 'llm-translate-popup';
const POPUP_WIDTH = 320;
const POPUP_MIN_HEIGHT = 80;
const POPUP_MAX_HEIGHT = 400;
const GAP = 8;

interface PopoverHTMLElement extends HTMLElement {
  popover: 'auto' | 'manual';
  showPopover(): void;
  hidePopover(): void;
}

function isPopoverSupported(): boolean {
  return 'popover' in HTMLElement.prototype;
}

function createPopupElement(): PopoverHTMLElement {
  const el = document.createElement('div') as PopoverHTMLElement;
  el.id = POPUP_ID;
  el.setAttribute('popover', 'manual');

  el.style.cssText = `
    position: fixed;
    width: ${POPUP_WIDTH}px;
    min-height: ${POPUP_MIN_HEIGHT}px;
    max-height: ${POPUP_MAX_HEIGHT}px;
    background: #ffffff;
    border: none;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    padding: 16px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111827;
    line-height: 1.6;
    font-size: 14px;
    box-sizing: border-box;
    margin: 0;
    opacity: 0;
    transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1);
    will-change: opacity;
    display: flex;
    flex-direction: column;
  `;

  if (!isPopoverSupported()) {
    el.style.zIndex = '2147483647';
  }

  const reasoning = document.createElement('div');
  reasoning.id = 'llm-translate-popup-reasoning';
  reasoning.style.cssText = `
    color: #9ca3af;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    margin-bottom: 8px;
    display: none;
    flex-shrink: 0;
  `;

  const content = document.createElement('div');
  content.id = 'llm-translate-popup-content';
  content.style.cssText = `
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: auto;
    scrollbar-gutter: stable;
    text-wrap: pretty;
    opacity: 1;
    flex: 1;
    min-height: 0;
  `;

  const usage = document.createElement('div');
  usage.id = 'llm-translate-popup-usage';
  usage.style.cssText = `
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    color: #6b7280;
    font-size: 12px;
    display: none;
    justify-content: space-between;
    flex-shrink: 0;
  `;

  el.appendChild(reasoning);
  el.appendChild(content);
  el.appendChild(usage);
  return el;
}

function positionPopup(popup: HTMLElement, targetRect: DOMRect): void {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = targetRect.left + targetRect.width / 2 - POPUP_WIDTH / 2;
  left = Math.max(GAP, Math.min(left, viewportWidth - POPUP_WIDTH - GAP));

  const popupHeight = popup.getBoundingClientRect().height;

  const spaceAbove = targetRect.top - GAP;
  const spaceBelow = viewportHeight - targetRect.bottom - GAP;

  let top: number;
  let maxHeight: number;

  if (spaceAbove >= popupHeight && spaceAbove >= spaceBelow) {
    top = targetRect.top - popupHeight - GAP;
    maxHeight = Math.min(POPUP_MAX_HEIGHT, spaceAbove);
  } else if (spaceBelow >= popupHeight) {
    top = targetRect.bottom + GAP;
    maxHeight = Math.min(POPUP_MAX_HEIGHT, spaceBelow);
  } else if (spaceAbove > spaceBelow) {
    top = targetRect.top - popupHeight - GAP;
    maxHeight = Math.max(POPUP_MIN_HEIGHT, spaceAbove);
  } else {
    top = targetRect.bottom + GAP;
    maxHeight = Math.max(POPUP_MIN_HEIGHT, spaceBelow);
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.maxHeight = `${maxHeight}px`;
}

export interface TranslatePopupController {
  show: (targetRect: DOMRect) => void;
  hide: () => void;
  appendChunk: (chunk: string) => void;
  appendReasoning: (chunk: string) => void;
  setUsage: (usage: { promptTokens: number; completionTokens: number }) => void;
  setError: (error: string) => void;
}

export function createTranslatePopup(): TranslatePopupController {
  let popup: PopoverHTMLElement | null = null;
  let contentEl: HTMLElement | null = null;
  let reasoningEl: HTMLElement | null = null;
  let usageEl: HTMLElement | null = null;
  let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  let outsideClickTimeout: ReturnType<typeof setTimeout> | null = null;
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  let lastTargetRect: DOMRect | null = null;
  let hasReceivedContent = false;

  function ensureElements(): void {
    const existing = document.getElementById(
      POPUP_ID,
    ) as PopoverHTMLElement | null;
    if (existing) {
      popup = existing;
      contentEl = document.getElementById('llm-translate-popup-content');
      reasoningEl = document.getElementById('llm-translate-popup-reasoning');
      usageEl = document.getElementById('llm-translate-popup-usage');
      return;
    }

    popup = createPopupElement();
    contentEl = popup.querySelector(
      '#llm-translate-popup-content',
    ) as HTMLElement;
    reasoningEl = popup.querySelector(
      '#llm-translate-popup-reasoning',
    ) as HTMLElement;
    usageEl = popup.querySelector(
      '#llm-translate-popup-usage',
    ) as HTMLElement;
    document.body.appendChild(popup);
  }

  function attachOutsideClickListener(): void {
    if (outsideClickHandler || outsideClickTimeout) return;

    outsideClickHandler = (e: MouseEvent) => {
      if (!popup) return;
      const target = e.target as Node;
      if (!popup.contains(target)) {
        hide();
      }
    };

    const handler = outsideClickHandler;
    outsideClickTimeout = setTimeout(() => {
      outsideClickTimeout = null;
      document.addEventListener('click', handler);
    }, 0);
  }

  function detachOutsideClickListener(): void {
    if (outsideClickTimeout) {
      clearTimeout(outsideClickTimeout);
      outsideClickTimeout = null;
    }
    if (outsideClickHandler) {
      document.removeEventListener('click', outsideClickHandler);
      outsideClickHandler = null;
    }
  }

  function attachKeydownListener(): void {
    if (keydownHandler) return;

    keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hide();
      }
    };

    document.addEventListener('keydown', keydownHandler);
  }

  function detachKeydownListener(): void {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
  }

  function show(targetRect: DOMRect): void {
    hide(false);
    lastTargetRect = targetRect;
    hasReceivedContent = false;
    ensureElements();
    if (!popup || !contentEl || !reasoningEl || !usageEl) return;

    contentEl.textContent = '';
    reasoningEl.textContent = '';
    reasoningEl.style.display = 'none';
    usageEl.innerHTML = '';
    usageEl.style.display = 'none';
    contentEl.style.color = '#111827';
    positionPopup(popup, targetRect);

    if (isPopoverSupported()) {
      popup.showPopover();
    }

    // Force reflow to ensure opacity:0 is rendered before transitioning to 1
    void popup.offsetHeight;
    popup.style.opacity = '1';

    attachOutsideClickListener();
    attachKeydownListener();
  }

  function hide(animate = true): void {
    detachOutsideClickListener();
    detachKeydownListener();
    lastTargetRect = null;

    const existing = document.getElementById(
      POPUP_ID,
    ) as PopoverHTMLElement | null;
    if (existing) {
      if (animate) {
        existing.style.opacity = '0';
        setTimeout(() => {
          if (isPopoverSupported()) {
            existing.hidePopover();
          }
          if (existing.parentNode) {
            existing.remove();
          }
        }, 150);
      } else {
        if (isPopoverSupported()) {
          existing.hidePopover();
        }
        existing.remove();
      }
    }

    popup = null;
    contentEl = null;
  }

  function appendChunk(chunk: string): void {
    if (!contentEl || !popup) return;
    hasReceivedContent = true;
    if (reasoningEl && reasoningEl.style.display !== 'none') {
      reasoningEl.textContent = '';
      reasoningEl.style.display = 'none';
    }
    contentEl.textContent += chunk;
    if (lastTargetRect) {
      positionPopup(popup, lastTargetRect);
    }
  }

  function appendReasoning(chunk: string): void {
    if (!reasoningEl || !popup || hasReceivedContent) return;
    if (reasoningEl.style.display === 'none') {
      reasoningEl.style.display = 'block';
    }
    reasoningEl.textContent += chunk;
    if (lastTargetRect) {
      positionPopup(popup, lastTargetRect);
    }
  }

  function setUsage(usage: { promptTokens: number; completionTokens: number }): void {
    if (!usageEl) return;
    usageEl.innerHTML = `<span>输入: ${usage.promptTokens}token</span><span>输出: ${usage.completionTokens}token</span>`;
    usageEl.style.display = 'flex';
  }

  function setError(error: string): void {
    if (!contentEl) return;
    contentEl.textContent = `翻译失败: ${error}`;
    contentEl.style.color = '#dc2626';
  }

  return { show, hide, appendChunk, appendReasoning, setUsage, setError };
}
