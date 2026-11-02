export function wrapUserscript(source: string) {
  return `(function(){try{${String(source || '')}\n}catch(error){console.error('[ERP userscript]', error);}})();`;
}

export function wrapUserscriptForRunAt(source: string, runAt?: string) {
  const wrapped = wrapUserscript(source);
  if (runAt !== 'document-idle') return wrapped;
  return `(function(){var run=function(){${wrapped}};if(typeof requestIdleCallback==='function'){requestIdleCallback(run,{timeout:50});}else{setTimeout(run,0);}})();`;
}
