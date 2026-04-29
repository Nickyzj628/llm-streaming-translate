import browser from 'webextension-polyfill';
import {
  hide as hideButton,
  isButtonElement,
  onClick,
  show as showButton,
} from './FloatingButton';
import {
  createTranslatePopup,
  type TranslatePopupController,
} from './TranslatePopup';

let isTranslating = false;
let currentPopup: TranslatePopupController | null = null;

function getSelectedText(): string {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}

function handleMouseUp(e: MouseEvent): void {
  if (isButtonElement(e.target as Node)) return;

  setTimeout(() => {
    if (isTranslating) {
      currentPopup?.hide();
      isTranslating = false;
    }

    const selectedText = getSelectedText();
    if (selectedText.length > 0) {
      showButton(e.clientX, e.clientY);
      onClick(() => startTranslate(selectedText));
    } else {
      hideButton();
    }
  }, 50);
}

function handleSelectionChange(): void {
  if (isTranslating) return;
  if (getSelectedText().length === 0) {
    hideButton();
  }
}

function startTranslate(text: string): void {
  if (isTranslating) {
    currentPopup?.hide();
    isTranslating = false;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const targetRect = range.getBoundingClientRect();
  selection.removeAllRanges();

  isTranslating = true;
  hideButton();

  currentPopup = createTranslatePopup();
  currentPopup.show(targetRect);

  let isFinished = false;
  const port = browser.runtime.connect({ name: 'stream-translate' });

  port.onMessage.addListener((message: unknown) => {
    const msg = message as {
      type: string;
      chunk?: string;
      error?: string;
    };

    if (msg.type === 'CHUNK' && msg.chunk) {
      currentPopup?.appendChunk(msg.chunk);
    } else if (msg.type === 'DONE') {
      finish();
    } else if (msg.type === 'ERROR') {
      console.error('[LLM Translate] Translation failed:', msg.error);
      currentPopup?.setError(msg.error || '未知错误');
      finish();
    }
  });

  port.postMessage({ type: 'START', text });

  function finish(): void {
    if (isFinished) return;
    isFinished = true;
    isTranslating = false;
    port.disconnect();
  }
}

document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('selectionchange', handleSelectionChange);
