/**
 * background.js — the service worker. Its only job is to make the toolbar
 * icon (and the Alt+Shift+S command, which triggers the action) open the
 * side panel.
 */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => console.error(error));
