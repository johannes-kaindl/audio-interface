// GENERIERT von scripts/build-assets.mjs — nicht von Hand editieren. Größe/SHA-256 der Release-Assets.
// Bewusst OHNE Version: die kommt zur Laufzeit aus manifest.json — sonst aendert jeder Release-Bump
// diese Datei, und check:manifest waere im Release-Lauf immer rot.
import type { AssetFile, VoiceAssets } from "./engine-manifest";

/** Laufzeit — von allen ladbaren Stimmen geteilt (eine Kopie im Cache). */
export const PIPER_SHARED_ASSETS: AssetFile[] = [
  {
    "key": "worker",
    "fileName": "piper-worker.js",
    "bytes": 2833512,
    "sha256": "273eabb5ce9b9a8871eef786fd388a59127795ed0c11b752cb6fd4fc7d33e0ba",
    "license": "AGPL-3.0-or-later (enthält ephone/eSpeak-NG GPL-3.0-or-later, onnxruntime-web MIT)"
  },
  {
    "key": "wasm",
    "fileName": "ort-wasm-simd-threaded.wasm",
    "bytes": 13479978,
    "sha256": "d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6",
    "license": "MIT (onnxruntime-web)"
  }
];

/** Je Stimme: Modell + Config, Abtastrate aus der Config. Schlüssel = Piper-Stimmenname. */
export const PIPER_VOICES: Record<string, VoiceAssets> = {
  "de_DE-thorsten-medium": {
    "sampleRate": 22050,
    "assets": [
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
    ]
  },
  "en_US-ljspeech-medium": {
    "sampleRate": 22050,
    "assets": [
      {
        "key": "model",
        "fileName": "en_US-ljspeech-medium.onnx",
        "bytes": 63531379,
        "sha256": "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22",
        "license": "Piper voice ljspeech (dataset public domain)"
      },
      {
        "key": "modelConfig",
        "fileName": "en_US-ljspeech-medium.onnx.json",
        "bytes": 4972,
        "sha256": "141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860",
        "license": "Piper voice ljspeech (dataset public domain)"
      }
    ]
  }
};
