// GENERIERT von scripts/build-assets.mjs — nicht von Hand editieren. Größe/SHA-256 der Release-Assets.
import type { AssetFile } from "./engine-manifest";
export const ASSET_VERSION = "0.1.0";
export const PIPER_DE_SAMPLE_RATE = 22050;
export const PIPER_DE_ASSETS: AssetFile[] = [
  {
    "key": "worker",
    "fileName": "piper-worker.js",
    "bytes": 2194986,
    "sha256": "330d5e4d891ef5d343f98893917350c82f3e80aacb5018c479119ab93be087fd",
    "license": "AGPL-3.0-or-later (enthält ephone/eSpeak-NG GPL-3.0-or-later, onnxruntime-web MIT)"
  },
  {
    "key": "wasm",
    "fileName": "ort-wasm-simd-threaded.wasm",
    "bytes": 13479978,
    "sha256": "d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6",
    "license": "MIT (onnxruntime-web)"
  },
  {
    "key": "model",
    "fileName": "de_DE-thorsten-medium.onnx",
    "bytes": 63201294,
    "sha256": "7e64762d8e5118bb578f2eea6207e1a35a8e0c30595010b666f983fc87bb7819",
    "license": "Piper voice thorsten (dataset CC0)"
  },
  {
    "key": "modelConfig",
    "fileName": "de_DE-thorsten-medium.onnx.json",
    "bytes": 4819,
    "sha256": "974adee790533adb273a1ac88f49027d2a1b8f0f2cf4905954a4791e79264e85",
    "license": "Piper voice thorsten (dataset CC0)"
  }
];
