import browser from 'webextension-polyfill';
import {
  hide as hideButton,
  isButtonElement,
  onClick,
  show as showButton,
} from './FloatingButton';

let isTranslating = false;

function getSelectedText(): string {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}

function handleMouseUp(e: MouseEvent): void {
  if (isButtonElement(e.target as Node)) return;

  setTimeout(() => {
    if (isTranslating) return;

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
  if (isTranslating) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  // 删除选区原文，插入空占位 span 用于接收流式译文
  range.deleteContents();
  const placeholder = document.createElement('span');
  placeholder.textContent = '';
  range.insertNode(placeholder);
  selection.removeAllRanges();

  isTranslating = true;
  hideButton();

  let isFinished = false;
  const port = browser.runtime.connect({ name: 'stream-translate' });

  port.onMessage.addListener((message: unknown) => {
    const msg = message as {
      type: string;
      chunk?: string;
      error?: string;
    };

    if (msg.type === 'CHUNK' && msg.chunk) {
      placeholder.textContent += msg.chunk;
    } else if (msg.type === 'DONE') {
      unwrapPlaceholder(placeholder);
      finish();
    } else if (msg.type === 'ERROR') {
      console.error('[LLM Translate] Translation failed:', msg.error);
      placeholder.textContent = text; // 出错时恢复原文
      unwrapPlaceholder(placeholder);
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

function unwrapPlaceholder(placeholder: HTMLSpanElement): void {
  const parent = placeholder.parentNode;
  if (!parent) return;
  const textNode = document.createTextNode(placeholder.textContent || '');
  parent.replaceChild(textNode, placeholder);
}

document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('selectionchange', handleSelectionChange);
