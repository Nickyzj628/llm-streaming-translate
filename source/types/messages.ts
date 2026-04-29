/**
 * Extension Message Types
 *
 * Defines all messages used for communication between
 * the content script and background script.
 *
 * Communication Architecture:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                                                                         │
 * │   ┌──────────────┐                                                      │
 * │   │   Content    │  ──START (via port) ──►  ┌──────────────────┐       │
 * │   │   Script     │                          │    Background    │       │
 * │   │              │  ◄──CHUNK / DONE / ERROR─┤    Script        │       │
 * │   └──────────────┘                          └──────────────────┘       │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Streaming translation uses a long-lived port connection
 * (browser.runtime.connect) to receive real-time chunks.
 */

// ── Streaming Translation (via browser.runtime.connect Port) ──

export interface StreamTranslateStart {
  type: 'START';
  text: string;
}

export interface StreamTranslateChunk {
  type: 'CHUNK';
  chunk: string;
}

export interface StreamTranslateDone {
  type: 'DONE';
}

export interface StreamTranslateError {
  type: 'ERROR';
  error: string;
}

export type StreamTranslatePortMessage =
  | StreamTranslateStart
  | StreamTranslateChunk
  | StreamTranslateDone
  | StreamTranslateError;
