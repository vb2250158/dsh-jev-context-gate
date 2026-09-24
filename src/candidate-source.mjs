import { Worker } from 'node:worker_threads';

/** Resolve a configured candidate list for one rule invocation. */
export async function resolveCandidates(rule, input, signal) {
  signal?.throwIfAborted();
  let value;
  if (rule.candidateSource === 'custom-list' || rule.candidateSource === 'input-split') {
    const content = rule.candidateSource === 'input-split' ? input : rule.candidateText;
    const parts = rule.candidateSource === 'input-split' && rule.splitMode === 'space' ? content.split(/ +/)
      : rule.candidateSource === 'input-split' && rule.splitMode === 'literal' ? content.split(rule.splitText)
        : content.split(/\r?\n/);
    value = parts.map(text => text.trim()).filter(Boolean);
  }
  else if (rule.candidateSource === 'script') {
    const worker = new Worker(new URL('./candidate-worker.mjs', import.meta.url), {
      workerData: { script: rule.candidateScript, event: rule.phase, input },
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    });
    try {
      value = await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('候选项脚本超过 5 秒。')); }, 5000);
        const aborted = () => { cleanup(); reject(signal?.reason ?? new Error('候选项脚本已取消。')); };
        signal?.addEventListener('abort', aborted, { once: true });
        worker.once('message', message => { cleanup(); message.ok ? resolve(message.value) : reject(new Error(message.error)); });
        worker.once('error', error => { cleanup(); reject(error); });
        worker.once('exit', code => { if (code !== 0) { cleanup(); reject(new Error('候选项脚本工作线程已退出。')); } });
      });
    } finally { await worker.terminate(); }
  } else throw new TypeError('Unsupported candidate source');
  if (!Array.isArray(value) || value.length < 2) throw new TypeError('候选项至少需要 2 条。');
  const ids = new Set();
  const entries = value.map((item, index) => {
    const id = typeof item === 'string' ? `item-${index + 1}` : item?.id;
    const content = typeof item === 'string' ? item : item?.text;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id) || ids.has(id)
      || typeof content !== 'string' || !content.trim() || content.length > 2000) throw new TypeError('候选项 ID 或内容无效。');
    ids.add(id);
    return { name: id, description: content.trim() };
  });
  if (entries.reduce((total, entry) => total + entry.description.length, 0) > 64000) throw new TypeError('候选项总内容超过 64000 字。');
  return entries;
}
