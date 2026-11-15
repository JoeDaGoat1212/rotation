// Runs the AI background-removal model off the main thread so the page stays smooth.
// The library and model are fetched once (about 45 MB) and then cached by the browser.
// Photos never leave the device: the model runs right here.

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL = 'briaai/RMBG-1.4';

let ready = null;

function load() {
  if (!ready) {
    ready = (async () => {
      const T = await import(LIBRARY);
      T.env.allowLocalModels = false;
      const sizes = new Map();
      const model = await T.AutoModel.from_pretrained(MODEL, {
        // The model repo does not describe itself in a way the library knows; treat it as a plain model.
        config: { model_type: 'custom' },
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (!p || p.status !== 'progress' || !p.file) return;
          sizes.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
          let loaded = 0;
          let total = 0;
          for (const s of sizes.values()) {
            loaded += s.loaded;
            total += s.total;
          }
          if (total > 0) self.postMessage({ type: 'progress', percent: Math.min(100, Math.round((loaded / total) * 100)) });
        },
      });
      return { T, model };
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

// One cutout at a time: the model cannot run two photos at once.
let chain = Promise.resolve();

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'warm') {
    load().catch(() => {});
    return;
  }
  if (msg.type !== 'run') return;
  chain = chain.then(() => run(msg));
};

async function run(msg) {
  const { id, size } = msg;
  try {
    const { T, model } = await load();
    self.postMessage({ type: 'stage', id, stage: 'run' });

    const px = new Uint8ClampedArray(msg.buffer);
    const n = size * size;
    const input = new Float32Array(n * 3);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      input[i] = px[p] / 255 - 0.5;
      input[n + i] = px[p + 1] / 255 - 0.5;
      input[2 * n + i] = px[p + 2] / 255 - 0.5;
    }
    const tensor = new T.Tensor('float32', input, [1, 3, size, size]);
    const outputs = await model({ input: tensor });
    const out = outputs.output || Object.values(outputs)[0];
    const data = out && out.data;
    if (!data || data.length < n) throw new Error('The model returned an unexpected result.');

    const mask = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) mask[i] = data[i] * 255;
    self.postMessage({ type: 'result', id, size, mask: mask.buffer }, [mask.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String((err && err.message) || err) });
  }
}
