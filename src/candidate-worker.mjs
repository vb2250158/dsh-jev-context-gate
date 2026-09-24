import { parentPort, workerData } from 'node:worker_threads';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
try {
  const generate = new AsyncFunction('event', 'input', workerData.script);
  parentPort.postMessage({ ok: true, value: await generate(workerData.event, workerData.input) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
