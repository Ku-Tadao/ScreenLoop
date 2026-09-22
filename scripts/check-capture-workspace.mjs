// Run with node scripts/check-capture-workspace.mjs. No backend or recording needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../Frontend/node_modules/typescript/lib/typescript.js';

const state = { content: [], hasLoadedObs: true, systemAudioLevel: 0.7 };
const connection = { isConnected: true };
const messages = [];
const sandbox = {
  exports: {},
  require(name) {
    if (name === 'react/jsx-runtime') {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx };
    }
    if (name === 'react') return { useEffect() {}, useMemo: (fn) => fn(), useState: (v) => [v, () => {}] };
    if (name === 'lucide-react') return {};
    if (name.endsWith('AppStateContext')) return { useAppState: () => state };
    if (name.endsWith('SettingsContext')) return { useSettings: () => ({ resolution: '1080p', frameRate: 60, replayBufferDuration: 90 }) };
    if (name.endsWith('SelectedMenuContext')) return { useSelectedMenu: () => ({ setSelectedMenu() {} }) };
    if (name.endsWith('SelectedVideoContext')) return { useSelectedVideo: () => ({ setSelectedVideo() {} }) };
    if (name.endsWith('WebSocketContext')) return { useWebSocketContext: () => connection };
    if (name.endsWith('MessageUtils')) return { sendMessageToBackend: (...args) => messages.push(args) };
    throw new Error(`Unexpected import: ${name}`);
  },
};
const source = readFileSync(new URL('../Frontend/src/Pages/replay-buffer.tsx', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, sandbox);

function render() {
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(sandbox.exports.default());
  return {
    save: nodes.find((n) => n.type === 'button' && n.props.children?.includes('Save Replay')),
    meter: nodes.find((n) => n.type === 'meter'),
  };
}

assert.equal(render().save.props.disabled, true, 'Idle capture cannot save a replay');
assert.equal(render().meter.props.value, 0, 'Idle audio must not display a stale level');
state.recording = {};
let view = render();
assert.equal(view.save.props.disabled, false);
assert.equal(view.meter.props.value, 0.7);
view.save.props.onClick();
assert.deepEqual(messages, [['SaveReplayBuffer']]);
connection.isConnected = false;
assert.equal(render().save.props.disabled, true, 'Disconnected capture cannot save');
assert.equal(render().meter.props.value, 0, 'Disconnected audio must not look live');
connection.isConnected = true;
state.hasLoadedObs = false;
assert.equal(render().save.props.disabled, true, 'Capture engine must be ready');
console.log('Capture workspace checks passed (idle, live, disconnected, and engine loading).');
