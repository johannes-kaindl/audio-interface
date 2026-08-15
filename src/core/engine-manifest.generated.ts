// GENERIERT von scripts/build-assets.mjs — nicht von Hand editieren. Größe/SHA-256 der Release-Assets.
// Erst-Stand (Task 6) mit den Spike-Größen und leeren Prüfsummen; Task 8 füllt sie über den Build.
import type { AssetFile } from "./engine-manifest";
export const ASSET_VERSION = "0.1.0";
export const PIPER_DE_SAMPLE_RATE = 22050;
export const PIPER_DE_ASSETS: AssetFile[] = [
  { key: "worker", fileName: "piper-worker.js", bytes: 1000000, sha256: "", license: "AGPL-3.0-or-later (enthält ephone/eSpeak-NG GPL-3.0-or-later, onnxruntime-web MIT)" },
  { key: "wasm", fileName: "ort-wasm-simd-threaded.wasm", bytes: 13479978, sha256: "", license: "MIT (onnxruntime-web)" },
  { key: "model", fileName: "de_DE-thorsten-medium.onnx", bytes: 63201294, sha256: "", license: "Piper voice thorsten (dataset CC0)" },
  { key: "modelConfig", fileName: "de_DE-thorsten-medium.onnx.json", bytes: 4819, sha256: "", license: "Piper voice thorsten (dataset CC0)" },
];
