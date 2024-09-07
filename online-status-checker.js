// This file contains the main logic for checking online/offline status

/*
How this project works:
This project creates a system to check if the user's device is online or offline.
It does this by:
1. Setting up a service worker (a script that runs in the background).
2. Periodically checking the internet connection by trying to load a small image.
3. Notifying parts of the app that care about online/offline status when it changes.

You can adjust this for different needs by:
- Changing the CHECK_INTERVAL to check more or less frequently.
- Modifying the CHECK_URL to ping a different server or resource.
- Adjusting TIMEOUT and FETCH_TIMEOUT to be more or less patient with slow connections.
- Changing MAX_CONSECUTIVE_ERRORS to be more or less tolerant of connection issues.
*/

// Set this to true to enable console logs, false to disable them
const DEBUG_ENABLED = true;

// Custom console log function that only logs when DEBUG_ENABLED is true
function debugLog(...args) {
  if (DEBUG_ENABLED) {
    console.log("Online/Offline Status Worker:", ...args);
  }
}

// Constants for our script
const WORKER_URL = "/online_offline_status_worker.js"; // Location of our service worker file
const CHECK_URL = "/api/ping"; // URL we'll use to check internet connection
const CHECK_INTERVAL = 5000; // How often we check (in milliseconds) - every 5 seconds
const TIMEOUT = 3000; // How long we wait for a response before giving up (in milliseconds) - 3 seconds
const FETCH_TIMEOUT = 2000; // Timeout for fetch requests (in milliseconds) - 2 seconds
const MAX_CONSECUTIVE_ERRORS = 3; // How many errors in a row before we pause checking

// Variables to store important information
let serviceWorker; // Will hold our service worker once it's registered
const subscribers = new Set(); // A list of functions to call when online status changes
let checkIntervalId; // Will store the ID of our interval timer
let lastKnownStatus = null; // Stores the last known online status
let consecutiveErrors = 0; // Tracks consecutive errors

// This function sets up our service worker
async function initServiceWorker() {
  // Check if the browser supports service workers
  if ("serviceWorker" in navigator) {
    try {
      // Try to register the service worker
      const registration = await navigator.serviceWorker.register(WORKER_URL, {
        updateViaCache: "none",
        scope: "/", // Ensure the service worker has the broadest scope
      });

      // Force an update of the service worker
      await registration.update();

      // Get the active service worker, or the one that's installing or waiting
      serviceWorker =
        registration.active || registration.installing || registration.waiting;

      // Wait for the service worker to be fully activated
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

      // Start checking online status periodically
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
    // First, check the browser's built-in online status
    const online = navigator.onLine;
    debugLog(`Navigator.onLine status: ${online}`);

    // If the browser says we're offline, trust it and return false
    if (!online) {
      resolve(false);
      return;
    }

    // Set up a timeout in case the image load takes too long
    const overallTimeout = setTimeout(() => {
      debugLog("Overall check timed out, returning 'online'");
      resolve("online");
    }, TIMEOUT);

    // Try to load a small image to check connectivity
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

// This function tries to fetch a resource to check connectivity
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

// This function tries to load an image to check connectivity
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

// This function notifies all subscribers about the current online status
function notifySubscribers(status) {
  if (status !== lastKnownStatus) {
    debugLog(`Status changed: ${status}`);
    lastKnownStatus = status;
    subscribers.forEach((callback) => callback(status));
  }
}

// This function allows other parts of the app to subscribe to online status changes
export function subscribeToOnlineStatus(callback) {
  subscribers.add(callback);
  checkOnlineStatus().then(callback).catch(debugLog);
}

// This function allows subscribers to unsubscribe from online status changes
export function unsubscribeFromOnlineStatus(callback) {
  subscribers.delete(callback);
}

// This function starts checking the online status periodically
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

  // Add event listeners for online and offline events
  window.addEventListener("online", () => notifySubscribers(true));
  window.addEventListener("offline", () => notifySubscribers(false));
}

// This function stops the periodic checking
function stopPeriodicCheck() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }
}

// This function cleans up our checker (stops checking and removes all subscribers)
export function cleanup() {
  stopPeriodicCheck();
  unsubscribeFromOnlineStatus();
}

// Initialize the checker when this module is imported
initServiceWorker().catch(debugLog);

// This function forces an update of the service worker
async function updateServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration(
    WORKER_URL
  );
  if (registration) {
    await registration.update();
    debugLog("Online/Offline Status Service Worker updated");
  }
}

// Update the service worker every minute
setInterval(updateServiceWorker, 60000);
