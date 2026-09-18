// Run with: node scripts/check-playback.mjs (uses the frontend's installed TypeScript).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "../Frontend/node_modules/typescript/lib/typescript.js";

const source = readFileSync(
  new URL("../Frontend/src/Hooks/useAudioTracks.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function mount({ delayedSupport = false } = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let supportCalls = 0;
  let pendingFetch = null;
  const support = deferred();
  const resume = deferred();
  const sources = [];
  const decoders = [];
  const contexts = [];
  const react = {
    useRef(value) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState(value) {
      const i = cursor++;
      slots[i] ??= { value };
      return [
        slots[i].value,
        (next) => {
          slots[i].value =
            typeof next === "function" ? next(slots[i].value) : next;
          dirty = true;
        },
      ];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, j) => dep !== slots[i].deps[j]))
        slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (
        !slots[i] ||
        !deps ||
        deps.some((dep, j) => dep !== slots[i].deps?.[j])
      ) {
        effects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  class FakeContext {
    currentTime = 0;
    state = "running";
    constructor() {
      contexts.push(this);
    }
    createGain() {
      return {
        gain: { value: 1, setTargetAtTime() {} },
        connect() {},
        disconnect() {},
      };
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(1024) };
    }
    createBufferSource() {
      const source = {
        playbackRate: {},
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    }
    resume() {
      return resume.promise.then(() => {
        this.state = "running";
      });
    }
    async close() {
      this.state = "closed";
    }
  }
  class FakeDecoder {
    static async isConfigSupported() {
      supportCalls++;
      if (delayedSupport && supportCalls === 2) await support.promise;
      return { supported: true };
    }
    constructor({ output }) {
      this.output = output;
      decoders.push(this);
    }
    configure() {}
    reset() {}
    close() {
      this.closed = true;
    }
    decode(chunk) {
      this.output({
        timestamp: chunk.timestamp,
        numberOfFrames: 1024,
        numberOfChannels: 2,
        sampleRate: 48000,
        copyTo() {},
        close() {},
      });
    }
  }
  const video = Object.assign(new EventTarget(), {
    paused: true,
    ended: false,
    seeking: false,
    readyState: 4,
    currentTime: 0,
    playbackRate: 1,
  });
  const sandbox = {
    exports: {},
    console,
    AbortController,
    document: { hidden: false },
    localStorage: { getItem: () => null },
    HTMLMediaElement: { HAVE_FUTURE_DATA: 3 },
    AudioContext: FakeContext,
    AudioDecoder: FakeDecoder,
    EncodedAudioChunk: class {
      constructor(value) {
        Object.assign(this, value);
      }
    },
    async fetch(url, options) {
      if (pendingFetch && options.headers.Range !== "bytes=0-1")
        await pendingFetch.promise;
      return {
        ok: true,
        status: 206,
        headers: { get: () => "bytes 0-1/200" },
        arrayBuffer: async () => new ArrayBuffer(200),
      };
    },
    require(name) {
      if (name === "react") return react;
      if (name === "mp4box")
        return {
          MP4BoxBuffer: { fromArrayBuffer: (value) => value },
          createFile: () => ({
            appendBuffer() {
              this.onReady({
                audioTracks: [1, 2].map((id) => ({
                  id,
                  codec: "mp4a.40.2",
                  timescale: 48000,
                })),
              });
            },
            getTrackById() {
              return {
                samples: [0, 1024, 2048].map((cts, i) => ({
                  cts,
                  offset: i * 2,
                  size: 2,
                })),
              };
            },
          }),
        };
      throw new Error(name);
    },
  };
  vm.runInNewContext(compiled, sandbox);
  const ref = { current: video };
  const content = {
    filePath: "test.mp4",
    audioTrackNames: ["Mix", "Microphone"],
  };
  const render = () => {
    cursor = 0;
    dirty = false;
    sandbox.exports.useAudioTracks(ref, content);
    const pending = effects;
    effects = [];
    pending.forEach((run) => run());
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await tick();
      if (dirty) render();
    }
  };
  render();
  await settle();
  return {
    video,
    sources,
    decoders,
    contexts,
    resume,
    support,
    settle,
    sandbox,
    emit(name) {
      video.dispatchEvent(new Event(name));
    },
    holdFetch() {
      pendingFetch = deferred();
      return pendingFetch;
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
      ref.current = null;
    },
  };
}

const player = await mount();
assert.equal(
  player.sources.length,
  0,
  "paused initialization must not schedule audio",
);
player.video.paused = false;
player.emit("playing");
await player.settle();
assert.ok(player.sources.length > 0, "playing schedules audio");
for (const event of ["pause", "waiting", "seeking", "ended", "emptied"]) {
  player.emit(event);
  assert.ok(
    player.sources.every((source) => source.stopped),
    `${event} stops all sources`,
  );
  const count = player.sources.length;
  player.decoders[0].decode({ timestamp: 0 });
  player.emit("timeupdate");
  await player.settle();
  assert.equal(
    player.sources.length,
    count,
    `${event} blocks late decoder output`,
  );
  player.emit("playing");
  await player.settle();
}
player.video.paused = true;
player.emit("pause");
const pending = player.holdFetch();
player.video.paused = false;
player.emit("playing");
player.video.paused = true;
player.emit("pause");
const beforeFetch = player.sources.length;
pending.resolve();
await player.settle();
assert.equal(
  player.sources.length,
  beforeFetch,
  "a fetch completed after pause must not schedule audio",
);
player.contexts[0].state = "suspended";
player.video.paused = false;
player.emit("playing");
player.unmount();
player.resume.resolve();
await tick();
assert.equal(
  player.sources.length,
  beforeFetch,
  "a resume completed after unmount must not restart audio",
);
assert.ok(player.decoders.every((decoder) => decoder.closed));

const loading = await mount({ delayedSupport: true });
loading.unmount();
loading.support.resolve();
await tick();
assert.equal(
  loading.decoders.length,
  0,
  "a support probe completed after unmount must not create decoders",
);
console.log(
  "Playback regressions passed (pause, buffering, seek, end, late fetch, late resume, and late initialization).",
);
