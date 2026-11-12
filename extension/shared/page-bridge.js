(() => {
  if (window.erp) return;

  const pending = new Map();

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== 'lcerp-erp-result') return;
    const waiter = pending.get(data.id);
    if (!waiter) return;
    pending.delete(data.id);
    if (data.error) waiter.reject(new Error(data.error));
    else waiter.resolve(data.records || []);
  });

  window.erp = {
    getCurrentUrl: () => window.location.href,
    findRecordsByUrl: (url) => new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      pending.set(id, { resolve, reject });
      window.postMessage({
        type: 'lcerp-erp-request',
        id,
        url: url || window.location.href,
      }, '*');
    }),
    onUrlChange: (callback) => {
      if (typeof callback !== 'function') return () => undefined;
      let last = window.location.href;
      const timer = window.setInterval(() => {
        if (window.location.href === last) return;
        last = window.location.href;
        callback(last);
      }, 500);
      return () => window.clearInterval(timer);
    },
  };
})();
