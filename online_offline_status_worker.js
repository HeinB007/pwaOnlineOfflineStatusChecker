// This is the service worker file. It runs in the background and can intercept network requests.

// Set this to true to enable console logs, false to disable them
const DEBUG_ENABLED = true;

// Custom console log function that only logs when DEBUG_ENABLED is true
function debugLog(...args) {
  if (DEBUG_ENABLED) {
    console.log(...args);
  }
}

// This event listener runs when the service worker is being installed
self.addEventListener("install", (event) => {
  debugLog("Service Worker installing.");
  // Skip the waiting phase and immediately activate the service worker
  self.skipWaiting();
});

// This event listener runs when the service worker is being activated
self.addEventListener("activate", (event) => {
  debugLog("Service Worker activating.");
  // Take control of all pages under this service worker's scope immediately
  event.waitUntil(self.clients.claim());
});

// This event listener would normally handle network requests
// In this simple example, we're not intercepting any requests
self.addEventListener("fetch", (event) => {
  // We're not intercepting any fetches in this simple example
});
