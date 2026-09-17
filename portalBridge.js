// portalBridge.js — Portal Shell Bridge Client (canonical, v1)
// Host this ONE file in the Portal PWA repo. Every other PWA loads it via
// <script src=".../portalBridge.js?v=1"></script> — do not copy/paste this
// file into other repos.

(function (window) {
  const CLIENT_PROTOCOL_VERSION = 1;
  const DEFAULT_TIMEOUT_MS = 10000;
  const INTERACTIVE_TIMEOUT_MS = 120000;

  const pendingRequests = new Map();
  let bridgeReady = false;
  let shellProtocolVersion = null;
  let capabilitiesCache = null;

  function isInsideShell() {
    return Boolean(window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function');
  }

  function markReady(detail) {
    bridgeReady = true;
    shellProtocolVersion = detail?.protocolVersion ?? null;
  }

  if (isInsideShell()) {
    // Handles both orderings: ready event fired before or after this script attaches.
    if (window.__portalShellBridgeReady) {
      markReady({ protocolVersion: window.__portalShellProtocolVersion });
    }
    window.addEventListener('PortalShellBridgeReady', (event) => markReady(event.detail || {}));
  }

  function waitForReady(timeoutMs = 5000) {
    if (!isInsideShell()) return Promise.reject(Object.assign(new Error('NOT_IN_SHELL'), { code: 'NOT_IN_SHELL' }));
    if (bridgeReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('PortalShellBridgeReady', onReady);
        reject(Object.assign(new Error('Bridge did not become ready in time'), { code: 'BRIDGE_NOT_READY_TIMEOUT' }));
      }, timeoutMs);
      function onReady(event) {
        clearTimeout(timer);
        window.removeEventListener('PortalShellBridgeReady', onReady);
        markReady(event.detail || {});
        resolve();
      }
      window.addEventListener('PortalShellBridgeReady', onReady);
    });
  }

  window.addEventListener('PortalShellBridgeResponse', (event) => {
    const { requestId, success, data, error } = event.detail || {};
    const pending = pendingRequests.get(requestId);
    if (!pending) return; // already timed out or unknown — ignore silently
    pendingRequests.delete(requestId);
    clearTimeout(pending.timer);
    if (success) {
      pending.resolve(data);
    } else {
      reject_with_code(pending, error);
    }
  });

  function reject_with_code(pending, error) {
    const err = new Error(error?.message || 'Native bridge error');
    err.code = error?.code || 'NATIVE_ERROR';
    pending.reject(err);
  }

  function defaultTimeoutFor(type) {
    if (capabilitiesCache?.recommendedTimeouts?.[type]) return capabilitiesCache.recommendedTimeouts[type];
    if (type === 'file.pick' || type === 'biometric.authenticate') return INTERACTIVE_TIMEOUT_MS;
    return DEFAULT_TIMEOUT_MS;
  }

  async function send(type, payload = {}, timeoutOverrideMs) {
    if (!isInsideShell()) {
      throw Object.assign(new Error('NOT_IN_SHELL'), { code: 'NOT_IN_SHELL' });
    }
    await waitForReady();

    const timeoutMs = timeoutOverrideMs ?? defaultTimeoutFor(type);
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(Object.assign(new Error(`Bridge timeout for command: ${type}`), { code: 'TIMEOUT' }));
      }, timeoutMs);

      pendingRequests.set(requestId, { resolve, reject, timer });

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type,
        requestId,
        protocolVersion: CLIENT_PROTOCOL_VERSION,
        payload,
      }));
    });
  }

  async function getCapabilities(forceRefresh = false) {
    if (capabilitiesCache && !forceRefresh) return capabilitiesCache;
    capabilitiesCache = await send('bridge.getCapabilities', {});
    return capabilitiesCache;
  }

  function hasCapability(name) {
    return Boolean(capabilitiesCache?.capabilities?.includes(name));
  }

  window.PortalBridge = {
    isInsideShell,
    waitForReady,
    getCapabilities,
    hasCapability,
    send,
    haptics: {
      light: () => (isInsideShell() ? send('haptic.light') : (navigator.vibrate?.(15), Promise.resolve())),
      medium: () => (isInsideShell() ? send('haptic.medium') : (navigator.vibrate?.(30), Promise.resolve())),
      heavy: () => (isInsideShell() ? send('haptic.heavy') : (navigator.vibrate?.(50), Promise.resolve())),
      selection: () => (isInsideShell() ? send('haptic.selection') : (navigator.vibrate?.(10), Promise.resolve())),
      success: () => (isInsideShell() ? send('haptic.success') : (navigator.vibrate?.([30, 50, 30]), Promise.resolve())),
      warning: () => (isInsideShell() ? send('haptic.warning') : (navigator.vibrate?.([50, 50, 50]), Promise.resolve())),
      error: () => (isInsideShell() ? send('haptic.error') : (navigator.vibrate?.([80, 50, 80]), Promise.resolve())),
    },
    notifications: {
      requestPermission: () => send('notification.requestPermission'),
      schedule: (opts) => send('notification.schedule', opts),
      cancel: (notificationId) => send('notification.cancel', { notificationId }),
      cancelAll: () => send('notification.cancelAll'),
    },
    alarms: {
      schedule: (opts) => send('alarm.schedule', opts),
      cancel: (alarmId) => send('alarm.cancel', { alarmId }),
      cancelAll: () => send('alarm.cancelAll'),
    },
    biometrics: {
      isAvailable: () => send('biometric.isAvailable'),
      authenticate: (promptMessage = 'Verify your identity') => send('biometric.authenticate', { promptMessage }),
    },
    files: {
      pick: (type = '*/*') => send('file.pick', { type }),
      read: (uri, encoding = 'utf8') => send('file.read', { uri, encoding }),
      save: (filename, content, mimeType = 'text/plain') => send('file.save', { filename, content, mimeType }),
      share: (uri, dialogTitle = 'Share File') => send('file.share', { uri, dialogTitle }),
    },
  };
})(window);
