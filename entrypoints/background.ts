import browser from 'webextension-polyfill';
import { streamTranslateOverPort } from '@/Background/StreamTranslator';
import type { StreamTranslatePortMessage } from '@/types/messages';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((): void => {
    console.log('Extension installed');
  });

  // Firefox MV2 uses browser.browserAction, Chrome MV3 uses browser.action
  // @ts-expect-error Firefox MV2 uses browserAction instead of action
  const actionApi = browser.action || browser.browserAction;

  actionApi?.onClicked?.addListener((): void => {
    void browser.runtime.openOptionsPage();
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'stream-translate') return;

    port.onMessage.addListener((message: unknown) => {
      const msg = message as StreamTranslatePortMessage;
      if (msg.type === 'START') {
        streamTranslateOverPort(msg.text, port);
      }
    });
  });
});
