import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browserPath =
  process.env.BENCH_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.BENCH_URL || 'http://127.0.0.1:5173';
const outputPath = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const screenshotPath = process.argv.find((arg) => arg.startsWith('--screenshot='))?.slice(13);
const rounds = Number(process.argv.find((arg) => arg.startsWith('--rounds='))?.slice(9) ?? 5);
const counts = [100, 500, 1000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
};

async function waitFor(check, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      /* Browser is still starting. */
    }
    await sleep(100);
  }
  throw new Error('Timed out waiting for browser');
}

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
}

const userDataDir = await mkdtemp(join(tmpdir(), 'interior-render-bench-'));
const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--window-size=800,600',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    `${baseUrl}/benchmarks/render.html?count=100`,
  ],
  { stdio: 'ignore', windowsHide: true },
);

let socket;
try {
  const portInfo = await waitFor(async () =>
    readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8'),
  );
  const port = Number(portInfo.split(/\r?\n/)[0]);
  const tab = await waitFor(async () => {
    const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
      response.json(),
    );
    return tabs.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
  });
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const devtools = new DevTools(socket);
  await devtools.send('Page.enable');
  await devtools.send('Runtime.enable');
  await devtools.send('Performance.enable');
  const browserVersion = await devtools.send('Browser.getVersion');

  const results = {};
  for (const count of counts) {
    const samples = [];
    for (let round = 0; round < rounds + 1; round++) {
      await devtools.send('Page.navigate', {
        url: `${baseUrl}/benchmarks/render.html?count=${count}&round=${round}`,
      });
      await waitFor(
        async () => devtools.evaluate(`window.renderBenchmark?.objectCount() === ${count}`),
        30000,
      );
      if (screenshotPath && count === 1000 && round === 1) {
        const capture = await devtools.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(screenshotPath, Buffer.from(capture.data, 'base64'));
      }
      // The first pass warms Vite and the browser's module cache.
      if (round === 0) continue;
      const initial = await devtools.evaluate('window.renderBenchmark.records[0].durationMs');
      const pan = [];
      const pointer = [];
      for (let index = 0; index < 5; index++) {
        const objectX =
          index === 0
            ? await devtools.evaluate(
                'document.querySelector(\'g[data-type="desk"]\').getBoundingClientRect().x',
              )
            : null;
        pan.push(await devtools.evaluate('window.renderBenchmark.moveViewport()'));
        if (objectX !== null) {
          const nextX = await devtools.evaluate(
            'document.querySelector(\'g[data-type="desk"]\').getBoundingClientRect().x',
          );
          if (Math.abs(nextX - objectX + 20) > 0.5)
            throw new Error('Viewport movement did not move the object layer by 20px');
        }
        pointer.push(
          await devtools.evaluate(
            `window.renderBenchmark.movePointer(${120 + index * 13}, ${160 + index * 11})`,
          ),
        );
      }
      const metrics = await devtools.send('Performance.getMetrics');
      samples.push({
        initialCommitMs: initial,
        panCommitMs: median(pan.map((item) => item.commitMs)),
        panFrameMs: median(pan.map((item) => item.durationMs)),
        pointerCommitMs: median(pointer.map((item) => item.commitMs)),
        pointerFrameMs: median(pointer.map((item) => item.durationMs)),
        heapMiB:
          (metrics.metrics.find((item) => item.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576,
      });
    }
    results[count] = {
      samples,
      median: Object.fromEntries(
        Object.keys(samples[0]).map((key) => [key, median(samples.map((sample) => sample[key]))]),
      ),
    };
    console.log(`${count} objects: ${JSON.stringify(results[count].median)}`);
  }
  if (outputPath)
    await writeFile(
      outputPath,
      JSON.stringify({ browser: browserVersion.product, rounds, results }, null, 2) + '\n',
    );
} finally {
  socket?.close();
  browser.kill();
  await sleep(500);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
