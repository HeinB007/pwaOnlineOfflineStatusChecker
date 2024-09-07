// This file contains the main logic for checking online/offline status

// Set this to true to enable console logs, false to disable them
const DEBUG_ENABLED = true;

// Custom console log function that only logs when DEBUG_ENABLED is true
function debugLog(...args) {
  if (DEBUG_ENABLED) {
    console.log("Online/Offline Status Worker:", ...args);
  }
}

// Constants for our script
const WORKER_URL = "/online_offline_status_worker.js"; // Updated worker filename
const CHECK_URL = "/api/ping";
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const TIMEOUT = 3000; // 3 seconds timeout
const FETCH_TIMEOUT = 2000; // Timeout for fetch requests (in milliseconds) - 2 seconds
const MAX_CONSECUTIVE_ERRORS = 3;

// Variables to store important information
let serviceWorker; // Will hold our service worker once it's registered
const subscribers = new Set(); // A list of functions to call when online status changes
let checkIntervalId; // Will store the ID of our interval timer
let lastKnownStatus = null; // Stores the last known online status
let consecutiveErrors = 0; // Tracks consecutive errors

// This function sets up our service worker
async function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(WORKER_URL, {
        updateViaCache: "none",
        scope: "/", // Ensure the service worker has the broadest scope
      });

      await registration.update();

      serviceWorker =
        registration.active || registration.installing || registration.waiting;
      await new Promise((resolve) => {
        if (serviceWorker.state === "activated") {
          resolve();
        } else {
          serviceWorker.addEventListener("statechange", () => {
            if (serviceWorker.state === "activated") {
              resolve();
            }
          });
        }
      });
      startPeriodicCheck();
    } catch (error) {
      debugLog("Service Worker registration failed:", error);
      throw error;
    }
  } else {
    throw new Error("Service Workers are not supported in this browser.");
  }
}

// This function checks if we're online
export async function checkOnlineStatus() {
  return new Promise((resolve) => {
    const online = navigator.onLine;
    debugLog(`Navigator.onLine status: ${online}`);

    if (!online) {
      resolve(false);
      return;
    }

    const overallTimeout = setTimeout(() => {
      debugLog("Overall check timed out, returning 'online'");
      resolve("online");
    }, TIMEOUT);

    checkImageLoad()
      .then((result) => {
        clearTimeout(overallTimeout);
        if (result) {
          consecutiveErrors = 0;
        } else {
          consecutiveErrors++;
        }
        resolve(result);
      })
      .catch(() => {
        clearTimeout(overallTimeout);
        consecutiveErrors++;
        resolve(false);
      });
  });
}

async function checkFetch() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(CHECK_URL, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    debugLog("Fetch check failed:", error);
    return false;
  }
}

function checkImageLoad() {
  return new Promise((resolve) => {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      img.src = "";
      resolve(false);
    }, FETCH_TIMEOUT);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      resolve(false);
    };
    img.src = `${CHECK_URL}?nocache=${Date.now()}`;
  });
}

function notifySubscribers(status) {
  if (status !== lastKnownStatus) {
    debugLog(`Status changed: ${status}`);
    lastKnownStatus = status;
    subscribers.forEach((callback) => callback(status));
  }
}

export function subscribeToOnlineStatus(callback) {
  subscribers.add(callback);
  checkOnlineStatus().then(callback).catch(debugLog);
}

export function unsubscribeFromOnlineStatus(callback) {
  subscribers.delete(callback);
}

function startPeriodicCheck() {
  checkIntervalId = setInterval(async () => {
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      debugLog("Max consecutive errors reached. Pausing checks.");
      stopPeriodicCheck();
      setTimeout(startPeriodicCheck, CHECK_INTERVAL * 5); // Retry after a longer interval
      return;
    }

    try {
      const status = await checkOnlineStatus();
      debugLog("Periodic check result:", status);
      notifySubscribers(status);
    } catch (error) {
      debugLog("Error during periodic check:", error);
    }
  }, CHECK_INTERVAL);

  window.addEventListener("online", () => notifySubscribers(true));
  window.addEventListener("offline", () => notifySubscribers(false));
}

function stopPeriodicCheck() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }
}

export function cleanup() {
  stopPeriodicCheck();
  unsubscribeFromOnlineStatus();
}

initServiceWorker().catch(debugLog);

async function updateServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration(
    WORKER_URL
  );
  if (registration) {
    await registration.update();
    debugLog("Online/Offline Status Service Worker updated");
  }
}

setInterval(updateServiceWorker, 60000);
