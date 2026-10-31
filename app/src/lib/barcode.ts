// Reads product barcodes from the camera. Uses the browser's own BarcodeDetector where it exists (Android Chrome);
// iPhone Safari doesn't have one, so the barcode-detector ponyfill (ZXing compiled to WebAssembly) is loaded instead,
// only when the scanner opens. The .wasm file is served from this app (not a CDN) and cached after first use.

export const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

export type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

type NativeDetectorClass = {
  new (o: { formats: string[] }): Detector
  getSupportedFormats: () => Promise<string[]>
}

export async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] })
    } catch { /* fall through to the ponyfill */ }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    fireImmediately: true,
  })
  return new BarcodeDetector({ formats: [...FORMATS] })
}
