import { parentPort, workerData } from 'node:worker_threads';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
try {
  const generate = new AsyncFunction('event', 'input', 'options', workerData.script);
  const value = await generate(workerData.event, workerData.input, workerData.options);
  parentPort.postMessage({ ok: true, value });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
