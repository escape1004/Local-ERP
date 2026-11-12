const api = typeof browser !== 'undefined' ? browser : chrome;

const urlChangeListeners = new Set();
let lastScriptUrl = '';
let injectedScriptIds = new Set();

window.erp = {
  getCurrentUrl: () => window.location.href,
  findRecordsByUrl: (url) => api.runtime.sendMessage({
    type: 'findRecordsByUrl',
    url: url || window.location.href,
  }).then((result) => {
    if (result?.error) throw new Error(result.error);
    return result?.records || [];
  }),
  onUrlChange: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    urlChangeListeners.add(callback);
    return () => urlChangeListeners.delete(callback);
  },
};

function wrapUserscript(source, runAt) {
  const wrapped = `(function(){try{${String(source || '')}\n}catch(error){console.error('[ERP userscript]', error);}})();`;
  if (runAt !== 'document-idle') return wrapped;
  return `(function(){var run=function(){${wrapped}};if(typeof requestIdleCallback==='function'){requestIdleCallback(run,{timeout:50});}else{setTimeout(run,0);}})();`;
}

function notifyUrlChange(url) {
  urlChangeListeners.forEach((listener) => {
    try {
      listener(url);
    } catch (error) {
      console.error('[ERP userscript] onUrlChange failed:', error);
    }
  });
}

async function runMatchingScripts(url, force) {
  if (!/^https?:/i.test(url || '')) return;
  if (/^https:\/\/accounts\.(google\.com|youtube\.com|google\.co\.kr)\//i.test(url)) return;
  if (!force && url === lastScriptUrl) return;
  lastScriptUrl = url;
  injectedScriptIds = new Set();
  const result = await api.runtime.sendMessage({ type: 'scriptsForUrl', url });
  const scripts = Array.isArray(result?.scripts) ? result.scripts : [];
  for (const script of scripts) {
    if (!script?.id || injectedScriptIds.has(script.id)) continue;
    injectedScriptIds.add(script.id);
    try {
      const run = new Function(wrapUserscript(script.source, script.runAt));
      run();
    } catch (error) {
      console.error('[ERP userscript]', script.name || script.id, error);
    }
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== 'lcerp-erp-request') return;
  api.runtime.sendMessage({
    type: 'findRecordsByUrl',
    url: data.url,
  }).then((result) => {
    window.postMessage({
      type: 'lcerp-erp-result',
      id: data.id,
      records: result?.records || [],
      error: result?.error || '',
    }, '*');
  }).catch((error) => {
    window.postMessage({
      type: 'lcerp-erp-result',
      id: data.id,
      records: [],
      error: error?.message || 'bridge-failed',
    }, '*');
  });
});

void runMatchingScripts(window.location.href, true);

let lastSeenUrl = window.location.href;
window.setInterval(() => {
  if (window.location.href === lastSeenUrl) return;
  lastSeenUrl = window.location.href;
  notifyUrlChange(lastSeenUrl);
  void runMatchingScripts(lastSeenUrl, true);
}, 500);
window.addEventListener('popstate', () => {
  if (window.location.href === lastSeenUrl) return;
  lastSeenUrl = window.location.href;
  notifyUrlChange(lastSeenUrl);
  void runMatchingScripts(lastSeenUrl, true);
});
