import { Worker } from 'node:worker_threads';

/** Run a trusted local rule script off the host event loop; only labels may change. */
export async function generateQuestion(rule, input, signal) {
  signal?.throwIfAborted();
  if (rule.questionSource !== 'script') return rule;
  const worker = new Worker(new URL('./question-worker.mjs', import.meta.url), {
    workerData: {
      script: rule.questionScript, event: rule.phase, input,
      options: rule.options.map(({ id, label }) => ({ id, label })),
    },
    resourceLimits: { maxOldGenerationSizeMb: 64 },
  });
  try {
    const value = await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('题目脚本超过 5 秒。')); }, 5000);
      const aborted = () => { cleanup(); reject(signal?.reason ?? new Error('题目脚本已取消。')); };
      signal?.addEventListener('abort', aborted, { once: true });
      worker.once('message', message => {
        cleanup();
        if (message.ok) resolve(message.value);
        else reject(new Error(message.error));
      });
      worker.once('error', error => {
        cleanup(); reject(error);
      });
      worker.once('exit', code => {
        if (code !== 0) { cleanup(); reject(new Error('题目脚本工作线程已退出。')); }
      });
    });
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.title !== 'string'
      || !value.title.trim() || value.title.length > 8000 || !Array.isArray(value.options)
      || value.options.length !== rule.options.length) throw new Error('题目脚本必须返回标题和完整选项。');
    const labels = new Map(value.options.map(option => [option?.id, option?.label]));
    if (labels.size !== rule.options.length || rule.options.some(option => typeof labels.get(option.id) !== 'string'
      || !labels.get(option.id).trim() || labels.get(option.id).length > 800)) throw new Error('题目脚本返回了无效选项。');
    return { ...rule, question: value.title, options: rule.options.map(option => ({ ...option, label: labels.get(option.id) })) };
  } finally {
    await worker.terminate();
  }
}
