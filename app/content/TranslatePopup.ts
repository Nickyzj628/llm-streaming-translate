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
  `;

  if (!isPopoverSupported()) {
    el.style.zIndex = '2147483647';
  }

  const content = document.createElement('div');
  content.id = 'llm-translate-popup-content';
  content.style.cssText = `
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: auto;
    scrollbar-gutter: stable;
    text-wrap: pretty;
    opacity: 1;
  `;

  el.appendChild(content);
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

  const content = popup.querySelector<HTMLElement>(
    '#llm-translate-popup-content',
  );
  if (content) {
    content.style.maxHeight = `${maxHeight - 32}px`;
  }
}

export interface TranslatePopupController {
  show: (targetRect: DOMRect) => void;
  hide: () => void;
  appendChunk: (chunk: string) => void;
  setError: (error: string) => void;
}

export function createTranslatePopup(): TranslatePopupController {
  let popup: PopoverHTMLElement | null = null;
  let contentEl: HTMLElement | null = null;
  let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  let outsideClickTimeout: ReturnType<typeof setTimeout> | null = null;
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  let lastTargetRect: DOMRect | null = null;

  function ensureElements(): void {
    const existing = document.getElementById(
      POPUP_ID,
    ) as PopoverHTMLElement | null;
    if (existing) {
      popup = existing;
      contentEl = document.getElementById('llm-translate-popup-content');
      return;
    }

    popup = createPopupElement();
    contentEl = popup.querySelector(
      '#llm-translate-popup-content',
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
    ensureElements();
    if (!popup || !contentEl) return;

    contentEl.textContent = '';
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
    contentEl.textContent += chunk;
    if (lastTargetRect) {
      positionPopup(popup, lastTargetRect);
    }
  }

  function setError(error: string): void {
    if (!contentEl) return;
    contentEl.textContent = `翻译失败: ${error}`;
    contentEl.style.color = '#dc2626';
  }

  return { show, hide, appendChunk, setError };
}
