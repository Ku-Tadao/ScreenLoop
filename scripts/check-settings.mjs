// Exercise the real clip-settings event handlers without a browser or backend.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "../Frontend/node_modules/typescript/lib/typescript.js";

const source = readFileSync(
  new URL(
    "../Frontend/src/Components/Settings/ClipSettingsSection.tsx",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const state = { gpuVendor: "Nvidia", hasLoadedObs: true, codecs: [] };
const sandbox = {
  exports: {},
  require(name) {
    if (name === "react/jsx-runtime")
      return {
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props }),
      };
    if (name === "framer-motion")
      return { motion: { div: "div" }, AnimatePresence: "div" };
    if (name.endsWith("DropdownSelect"))
      return { __esModule: true, default: "Dropdown" };
    if (name.endsWith("Models/types"))
      return {
        GpuVendor: {
          Nvidia: "Nvidia",
          AMD: "AMD",
          Intel: "Intel",
          Unknown: "Unknown",
        },
      };
    if (name.endsWith("AppStateContext")) return { useAppState: () => state };
    if (name.endsWith("MessageUtils")) return { sendMessageToBackend() {} };
    throw new Error(name);
  },
};
vm.runInNewContext(compiled, sandbox);
function render(overrides = {}) {
  let updates;
  const settings = {
    clipQualityPreset: "custom",
    clipEncoder: "cpu",
    clipCodec: "h264",
    clipPreset: "veryfast",
    clipQualityCpu: 23,
    clipQualityGpu: 23,
    clipVideoBitrate: 0,
    ...overrides,
  };
  const tree = sandbox.exports.default({
    settings,
    updateSettings: (value) => {
      updates = value;
    },
  });
  const controls = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "Dropdown")
      controls.set(node.props.ariaLabel, node.props);
    visit(node.props?.children);
  };
  visit(tree);
  return {
    controls,
    get updates() {
      return updates;
    },
  };
}
let view = render();
view.controls.get("Clip codec").onChange("av1");
assert.equal(
  view.updates.clipPreset,
  "svt-6",
  "NVIDIA hardware must not override CPU AV1 preset",
);
assert.equal(view.controls.get("Clip CPU quality").items.length, 52);
state.hasLoadedObs = false;
view = render({
  clipCodec: "av1",
  clipPreset: "svt-6",
  clipQualityCpu: 63,
  clipVideoBitrate: 400,
});
assert.equal(
  view.controls.get("Clip codec").disabled,
  false,
  "CPU codecs do not depend on OBS",
);
assert.equal(view.controls.get("Clip CPU quality").items.length, 64);
assert.equal(
  view.controls.get("Clip CPU quality").disabled,
  true,
  "bitrate mode overrides CRF",
);
view.controls.get("Clip encoder").onChange("gpu");
assert.equal(
  view.updates.clipCodec,
  "h264",
  "unsupported GPU AV1 must not remain selected",
);
assert.equal(view.updates.clipQualityCpu, 51);
state.codecs = [
  { internalEncoderId: "obs_nvenc_av1_tex", isHardwareEncoder: true },
];
view = render({ clipCodec: "av1", clipPreset: "svt-6" });
view.controls.get("Clip encoder").onChange("gpu");
assert.equal(view.updates.clipCodec, "av1");
assert.equal(view.updates.clipPreset, "p4");
view = render({ clipEncoder: "gpu", clipCodec: "av1", clipPreset: "p4" });
view.controls.get("Clip encoder").onChange("cpu");
assert.equal(view.updates.clipPreset, "svt-6");
state.codecs = [{ internalEncoderId: "svt_av1", isHardwareEncoder: false }];
view = render({ clipEncoder: "gpu" });
assert.ok(
  !view.controls.get("Clip codec").items.some((item) => item.value === "av1"),
  "software AV1 is not evidence of GPU support",
);
console.log(
  "Settings regressions passed (CPU/GPU transitions, hardware availability, CRF ranges, and bitrate mode).",
);
