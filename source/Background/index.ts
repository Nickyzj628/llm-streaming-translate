/**
 * Background Script (Service Worker in Chrome MV3)
 *
 * Handles streaming translation via long-lived port connections
 * from the content script.
 */

import browser from 'webextension-polyfill';
import type { StreamTranslatePortMessage } from '../types/messages';
import { streamTranslateOverPort } from './StreamTranslator';

browser.runtime.onInstalled.addListener((): void => {
  console.log('Extension installed');
});

// Click extension icon to open options page
browser.action.onClicked.addListener((): void => {
  void browser.runtime.openOptionsPage();
});

// Handle streaming translation via long-lived port connection
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'stream-translate') return;

  port.onMessage.addListener((message: unknown) => {
    const msg = message as StreamTranslatePortMessage;
    if (msg.type === 'START') {
      streamTranslateOverPort(msg.text, port);
    }
  });
});
