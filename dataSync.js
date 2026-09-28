// dataSync.js — Portal Ecosystem Data Sync (v1)
// Host once in the Portal PWA repo. Every app loads it via:
// <script src="https://sazzadcheju49.github.io/portal-app/dataSync.js?v=1"></script>

(function (window) {
  const GIST_ID = '4d3b4d72f9dc240520ba7bdcc7732078';
  const API_BASE = 'https://api.github.com/gists/' + GIST_ID;

  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  async function pushToGist(appKey, data, token) {
    const filename = appKey + '.json';
    const payload = { ...data, lastModified: Date.now() };
    const res = await fetch(API_BASE, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(payload) } } }),
    });
    if (!res.ok) {
      const err = new Error('Gist push failed: ' + res.status);
      err.status = res.status;
      throw err;
    }
    return payload;
  }

  async function pullFromGist(appKey, token) {
    const res = await fetch(API_BASE, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!res.ok) {
      const err = new Error('Gist pull failed: ' + res.status);
      err.status = res.status;
      throw err;
    }
    const gist = await res.json();
    const file = gist.files[appKey + '.json'];
    if (!file) return null;
    try {
      return JSON.parse(file.content);
    } catch {
      return null;
    }
  }

  function exportJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); }
        catch { reject(new Error('Invalid JSON file')); }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  // Compares local vs remote by lastModified, pulls or pushes whichever is newer.
  async function syncNow(appKey, getLocalData, applyRemoteData, token) {
    const local = getLocalData();
    let remote = null;
    try {
      remote = await pullFromGist(appKey, token);
    } catch (err) {
      await pushToGist(appKey, local, token);
      return { direction: 'push-only', reason: err.message };
    }
    if (!remote || !remote.lastModified) {
      await pushToGist(appKey, local, token);
      return { direction: 'push' };
    }
    if (!local.lastModified || remote.lastModified > local.lastModified) {
      applyRemoteData(remote);
      return { direction: 'pull' };
    }
    if (local.lastModified > remote.lastModified) {
      await pushToGist(appKey, local, token);
      return { direction: 'push' };
    }
    return { direction: 'none' };
  }

  window.DataSync = { pushToGist, pullFromGist, exportJSON, importJSON, syncNow, getUrlParam };

  // Entry point for Portal's hidden-iframe "Sync All" orchestrator.
  // Each app must define window.onAutoSync(token) BEFORE this script runs.
  window.addEventListener('DOMContentLoaded', () => {
    const token = getUrlParam('syncToken');
    const autosync = getUrlParam('autosync');
    if (token && autosync === '1' && typeof window.onAutoSync === 'function') {
      Promise.resolve(window.onAutoSync(token))
        .then((result) => window.parent.postMessage({ type: 'dataSyncComplete', status: 'ok', result }, '*'))
        .catch((err) => window.parent.postMessage({ type: 'dataSyncComplete', status: 'error', message: err.message }, '*'));
    }
  });
})(window);
