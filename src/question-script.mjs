import { Worker } from 'node:worker_threads';

/** Run a trusted local rule script off the host event loop; only labels may change. */
export async function generateQuestion(rule, input, signal, candidates) {
  signal?.throwIfAborted();
  const questionOptions = candidates?.map(({ name, description }) => ({ id: name, label: description }))
    ?? rule.options.map(({ id, label }) => ({ id, label }));
  if (rule.questionSource !== 'script') return candidates ? { ...rule, candidateOptions: questionOptions } : rule;
  const worker = new Worker(new URL('./question-worker.mjs', import.meta.url), {
    workerData: {
      script: rule.questionScript, event: rule.phase, input,
      options: questionOptions,
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
      || !value.title.trim() || value.title.length > 8000) throw new Error('题目脚本必须返回标题。');
    if (candidates && value.options === undefined) return { ...rule, question: value.title, candidateOptions: questionOptions };
    if (!Array.isArray(value.options)) throw new Error('题目脚本必须返回完整选项。');
    if (candidates && value.options.length === 2
      && value.options.some(option => option?.id === 'selected') && value.options.some(option => option?.id === 'other'))
      return { ...rule, question: value.title, candidateOptions: questionOptions };
    if (value.options.length !== questionOptions.length) throw new Error('题目脚本必须返回完整选项。');
    const labels = new Map(value.options.map(option => [option?.id, option?.label]));
    if (labels.size !== questionOptions.length || questionOptions.some(option => typeof labels.get(option.id) !== 'string'
      || !labels.get(option.id).trim() || labels.get(option.id).length > (candidates ? 2000 : 800))) throw new Error('题目脚本返回了无效选项。');
    const updated = questionOptions.map(option => ({ ...option, label: labels.get(option.id) }));
    return candidates ? { ...rule, question: value.title, candidateOptions: updated }
      : { ...rule, question: value.title, options: rule.options.map(option => ({ ...option, label: labels.get(option.id) })) };
  } finally {
    await worker.terminate();
  }
}
