import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import pako from "pako";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import type { PreviewPlugin, PreviewSource } from "../types";
import { archivePlugin } from "./archive";
import { assetPlugin } from "./asset";
import { audioPlugin } from "./audio";
import { cadPlugin } from "./cad";
import { drawingPlugin } from "./drawing";
import { emailPlugin } from "./email";
import { epubPlugin } from "./epub";
import { fallbackPlugin } from "./fallback";
import { gisPlugin } from "./gis";
import { imagePlugin } from "./image";
import { model3dPlugin } from "./model3d";
import { officePlugin } from "./office";
import { ofdPlugin } from "./ofd";
import { pdfPlugin } from "./pdf";
import { textPlugin } from "./text";
import { __setMpegtsLoaderForTests, videoPlugin } from "./video";
import { xpsPlugin } from "./xps";

const nativeFetch = globalThis.fetch;
const originalDocumentFontsDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "fonts");

const renderDocxAsync = vi.hoisted(() =>
  vi.fn(async (_data: unknown, bodyContainer: HTMLElement) => {
    const wrapper = document.createElement("div");
    wrapper.className = "ofv-docx-wrapper";
    const page = document.createElement("section");
    page.className = "ofv-docx";
    page.textContent = "DOCX smoke paragraph with an extremely-long-token-that-must-not-widen-the-preview-host";
    wrapper.append(page);
    bodyContainer.append(wrapper);
  })
);
const openPptx = vi.hoisted(() =>
  vi.fn(async (_data: unknown, container: HTMLElement) => {
    const slide = document.createElement("div");
    slide.dataset.slideIndex = "0";
    slide.textContent = "PPTX smoke slide with a very-long-title-that-must-wrap-inside-the-preview";
    container.append(slide);
  })
);
const pdfJsDistMock = vi.hoisted(() => {
  const page = {
    getViewport({ scale, rotation = 0 }: { scale: number; rotation?: number }) {
      const sideways = Math.abs(rotation) % 180 === 90;
      const width = sideways ? 180 : 320;
      const height = sideways ? 320 : 180;
      return {
        width: width * scale,
        height: height * scale,
        transform: [scale, 0, 0, scale, 0, 0]
      };
    },
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn()
    })),
    getTextContent() {
      return Promise.resolve({ items: [] });
    }
  };
  return {
    version: "4.0.0-test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(() => Promise.resolve(page)),
        destroy: vi.fn()
      }),
      destroy: vi.fn()
    }))
  };
});
const utifMock = vi.hoisted(() => ({
  decode: vi.fn(() => [{ width: 2, height: 1 }]),
  decodeImage: vi.fn(),
  toRGBA8: vi.fn(() => new Uint8Array([255, 0, 0, 255, 0, 128, 255, 255]))
}));
const hyparquetMock = vi.hoisted(() => ({
  parquetMetadataAsync: vi.fn(async () => ({
    num_rows: 1n,
    row_groups: [{}],
    created_by: "smoke"
  })),
  parquetReadObjects: vi.fn(async () => [{ id: 1n, name: "Launch" }]),
  parquetSchema: vi.fn(() => ({
    children: [
      { element: { name: "id", type: "INT64", repetition_type: "REQUIRED" }, path: ["id"], children: [] },
      { element: { name: "name", type: "BYTE_ARRAY", logical_type: { type: "STRING" } }, path: ["name"], children: [] }
    ]
  }))
}));
const readPsdMock = vi.hoisted(() =>
  vi.fn(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    return {
      width: 120,
      height: 80,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3,
      canvas
    };
  })
);
const msgReaderDataMock = vi.hoisted(() =>
  vi.fn(() => ({
    senderName: "Alice",
    senderEmail: "alice@example.com",
    recipients: [{ recipType: "to", name: "Bob", email: "bob@example.com" }],
    subject: "MSG smoke",
    body: "MSG smoke body",
    attachments: []
  }))
);
const msgReaderAttachmentMock = vi.hoisted(() => vi.fn());

vi.mock("docx-preview", () => ({
  renderAsync: renderDocxAsync
}));

vi.mock("@aiden0z/pptx-renderer", () => ({
  PptxViewer: {
    open: openPptx
  }
}));

vi.mock("pdfjs-dist", () => pdfJsDistMock);

vi.mock("utif", () => utifMock);

vi.mock("hyparquet", () => hyparquetMock);

vi.mock("ag-psd", () => ({
  readPsd: readPsdMock
}));

vi.mock("@kenjiuno/msgreader", () => ({
  default: class {
    getFileData = msgReaderDataMock;
    getAttachment = msgReaderAttachmentMock;
  }
}));

vi.mock("hls.js", () => ({
  default: class {
    static isSupported() {
      return true;
    }
    static Events = { ERROR: "error" };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
  }
}));

type SmokeCase = {
  name: string;
  file: PreviewSource | (() => Promise<PreviewSource> | PreviewSource);
  fileName: string;
  mimeType?: string;
  plugins: PreviewPlugin[];
  selector: string;
  text?: string;
  covers?: string[];
  beforeCommands?: (container: HTMLElement) => Promise<void> | void;
  afterCommands?: (container: HTMLElement) => void;
};

type ToolbarSupportCase = SmokeCase & {
  enabled: string[];
  disabled: string[];
};

type CleanPreviewCase = SmokeCase & {
  hiddenText: string[];
  hiddenSelectors?: string[];
  allowFallback?: boolean;
};

type RotateLeftCase = SmokeCase & {
  assertBeforeLeft?: (container: HTMLElement) => void;
  assertAfterLeft: (container: HTMLElement) => void;
  assertAfterRepeatedRight?: (container: HTMLElement) => void;
  assertAfterRepeatedReset?: (container: HTMLElement) => void;
};

vi.mock("leaflet", () => ({
  default: {
    icon: vi.fn((options) => options),
    Marker: { prototype: { options: {} } },
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      getZoom: vi.fn(() => 2),
      remove: vi.fn()
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    circleMarker: vi.fn(() => ({})),
    geoJSON: vi.fn(() => ({
      addTo: vi.fn().mockReturnThis(),
      getBounds: vi.fn(() => ({ isValid: () => false }))
    }))
  }
}));

vi.mock("topojson-client", () => ({
  default: {
    feature: vi.fn((_topology, object) => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: object?.name || "Topo Place" },
          geometry: { type: "Point", coordinates: [118, 32] }
        }
      ]
    }))
  }
}));

vi.mock("@mapbox/togeojson", () => ({
  default: {
    kml: vi.fn(() => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "KML Place" },
          geometry: { type: "Point", coordinates: [121.5, 31.2] }
        }
      ]
    })),
    gpx: vi.fn(() => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "GPX Track" },
          geometry: { type: "Point", coordinates: [120.2, 30.1] }
        }
      ]
    }))
  }
}));

vi.mock("shpjs", () => ({
  default: vi.fn(async () => ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [116.4, 39.9] }
      }
    ]
  }))
}));

vi.mock("three", () => {
  class Vector3 {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(value: Vector3) {
      this.x = value.x;
      this.y = value.y;
      this.z = value.z;
      return this;
    }
    clone() {
      return new Vector3().copy(this);
    }
    sub(value: Vector3) {
      this.x -= value.x;
      this.y -= value.y;
      this.z -= value.z;
      return this;
    }
    multiplyScalar(value: number) {
      this.x *= value;
      this.y *= value;
      this.z *= value;
      return this;
    }
    add(value: Vector3) {
      this.x += value.x;
      this.y += value.y;
      this.z += value.z;
      return this;
    }
    distanceTo(value: Vector3) {
      return Math.hypot(this.x - value.x, this.y - value.y, this.z - value.z);
    }
  }

  class Object3D {
    children: Object3D[] = [];
    geometry?: { dispose: () => void };
    material?: { dispose: () => void };
    add(child: Object3D) {
      this.children.push(child);
    }
    traverse(callback: (child: Object3D) => void) {
      callback(this);
      this.children.forEach((child) => child.traverse(callback));
    }
    rotateY() {}
  }

  return {
    Color: class {
      constructor(public value: number) {}
    },
    Scene: class extends Object3D {
      background: unknown;
    },
    PerspectiveCamera: class {
      position = new Vector3();
      aspect = 1;
      near = 0.1;
      far = 1000;
      updateProjectionMatrix = vi.fn();
    },
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      outputColorSpace = "";
      toneMapping = 0;
      toneMappingExposure = 1;
      setPixelRatio = vi.fn();
      setSize = vi.fn();
      render = vi.fn();
      dispose = vi.fn();
    },
    HemisphereLight: class extends Object3D {},
    DirectionalLight: class extends Object3D {
      position = new Vector3();
    },
    GridHelper: class extends Object3D {},
    Group: class extends Object3D {},
    BoxGeometry: class {
      dispose = vi.fn();
    },
    MeshStandardMaterial: class {
      dispose = vi.fn();
      constructor() {}
    },
    Mesh: class extends Object3D {
      constructor(geometry: { dispose: () => void }, material: { dispose: () => void }) {
        super();
        this.geometry = geometry;
        this.material = material;
      }
    },
    Box3: class {
      setFromObject() {
        return this;
      }
      getSize(target: Vector3) {
        return target.set(1, 1, 1);
      }
      getCenter(target: Vector3) {
        return target.set(0, 0, 0);
      }
    },
    Vector3,
    SRGBColorSpace: "srgb",
    ACESFilmicToneMapping: 4
  };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    enableDamping = false;
    target = {
      x: 0,
      y: 0,
      z: 0,
      copy(value: { x: number; y: number; z: number }) {
        this.x = value.x;
        this.y = value.y;
        this.z = value.z;
        return this;
      },
      clone() {
        return { ...this };
      }
    };
    update = vi.fn();
    dispose = vi.fn();
  }
}));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return { scene: group };
    }
  }
}));

vi.mock("three/examples/jsm/loaders/OBJLoader.js", () => ({
  OBJLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return group;
    }
  }
}));

vi.mock("three/examples/jsm/loaders/STLLoader.js", () => ({
  STLLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      return new THREE.BoxGeometry();
    }
  }
}));

vi.mock("three/examples/jsm/loaders/ColladaLoader.js", () => ({
  ColladaLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return { scene: group };
    }
  }
}));

vi.mock("three/examples/jsm/loaders/PLYLoader.js", () => ({
  PLYLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      return new THREE.BoxGeometry();
    }
  }
}));

vi.mock("three/examples/jsm/loaders/3MFLoader.js", () => ({
  ThreeMFLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return group;
    }
  }
}));

vi.mock("three/examples/jsm/loaders/TDSLoader.js", () => ({
  TDSLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return group;
    }
  }
}));

vi.mock("three/examples/jsm/loaders/USDLoader.js", () => ({
  USDLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return group;
    }
  }
}));

vi.mock("three/examples/jsm/loaders/VRMLLoader.js", () => ({
  VRMLLoader: class {
    async loadAsync() {
      const THREE = await import("three");
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return group;
    }
  }
}));

describe("default plugin render smoke", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCanvasContext() as any);
    vi.stubGlobal(
      "FontFace",
      class {
        constructor(
          public family: string,
          public source: string
        ) {}
        async load() {
          return this;
        }
      }
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        add: vi.fn()
      }
    });
    vi.stubGlobal("fetch", vi.fn(mockRemoteFetch));
    __setMpegtsLoaderForTests(async () => ({
      default: {
        Events: { ERROR: "error" },
        isSupported: vi.fn(() => true),
        createPlayer: vi.fn(() => ({
          attachMediaElement: vi.fn(),
          load: vi.fn(),
          on: vi.fn(),
          unload: vi.fn(),
          destroy: vi.fn()
        }))
      }
    }));
    vi.stubGlobal(
      "ImageData",
      vi.fn(function ImageDataMock(this: ImageData, data: Uint8ClampedArray, width: number, height: number) {
        Object.assign(this, { data, width, height });
      })
    );
  });

  afterEach(() => {
    document.head.querySelector("#ofv-leaflet-css")?.remove();
    document.body.replaceChildren();
    __setMpegtsLoaderForTests(null);
    if (originalDocumentFontsDescriptor) {
      Object.defineProperty(Document.prototype, "fonts", originalDocumentFontsDescriptor);
      Reflect.deleteProperty(document, "fonts");
    } else {
      Reflect.deleteProperty(document, "fonts");
    }
    vi.restoreAllMocks();
  });

  it("keeps a render smoke case for every detected extension", () => {
    const coveredExtensions = collectCoveredExtensions([
      ...smokeCases(),
      ...frequentPreviewCases(),
      ...commandPreviewCases(),
      ...toolbarSupportCases(),
      ...cleanPreviewCases(),
      ...aliasCleanPreviewCases()
    ]);
    const missing = readDetectedExtensions().filter((extension) => !coveredExtensions.has(extension));

    expect(missing).toEqual([]);
  });

  it("keeps shared toolbar smoke coverage for every detected extension", () => {
    const coveredExtensions = collectCoveredExtensions([
      ...allToolbarSmokeCases(),
      ...commandPreviewCases(),
      ...toolbarSupportCases(),
      ...rotateLeftCases()
    ]);
    const missing = readDetectedExtensions().filter((extension) => !coveredExtensions.has(extension));

    expect(missing).toEqual([]);
  });

  it("keeps shared toolbar coverage for each major preview family", () => {
    const names = new Set(toolbarSupportCases().map((testCase) => testCase.name));
    expect([...names].sort()).toEqual(
      [
        "3D model",
        "Avro data",
        "DWG metadata fallback",
        "DXF CAD",
        "EPUB reader",
        "EPS design asset",
        "FODS sheet",
        "GDS layout",
        "GIS map",
        "HTML email",
        "ODP presentation",
        "ODT document",
        "OASIS layout",
        "OFD pages",
        "OXPS pages",
        "PDF",
        "PSD composite",
        "Parquet data",
        "RTF document",
        "SAT CAD",
        "SQLite data",
        "STEP CAD",
        "WASM data",
        "WebArchive data",
        "XPS pages",
        "archive inner text",
        "audio playback",
        "code text",
        "drawing canvas",
        "excel xlsx",
        "font asset",
        "image",
        "plain email",
        "powerpoint pptx",
        "video playback",
        "word docx"
      ].sort()
    );
  });

  it("keeps toolbar command interaction coverage for each interactive preview family", () => {
    const names = new Set(commandPreviewCases().map((testCase) => testCase.name));
    expect([...names].sort()).toEqual(
      [
        "3D OBJ alias",
        "3D model",
        "DXF CAD",
        "EPUB",
        "FODS sheet",
        "FODT document",
        "GDS layout",
        "GIS map",
        "HTML email",
        "IGES CAD",
        "ODP presentation",
        "ODT document",
        "OASIS layout",
        "OFD",
        "OXPS",
        "PDF",
        "PDF-compatible AI",
        "PSB composite",
        "RTF document",
        "SAT CAD",
        "STEP CAD",
        "STP CAD alias",
        "SVG image",
        "TIFF image",
        "XPS",
        "bzip2 archive inner preview",
        "code text",
        "drawing",
        "excel xlsx",
        "image",
        "markdown",
        "plain email",
        "powerpoint pptx",
        "remote DOCX URL",
        "remote DXF URL",
        "remote DWF URL",
        "remote EPUB URL",
        "remote EML URL",
        "remote GLB URL",
        "remote GeoJSON URL",
        "remote GDS URL",
        "remote KMZ URL",
        "remote OFD URL",
        "remote OASIS URL",
        "remote ODP URL",
        "remote ODT URL",
        "remote Avro URL",
        "remote PDF URL",
        "remote PDF-compatible AI URL",
        "remote Parquet URL",
        "remote PPTX URL",
        "remote PSD URL",
        "remote SQLite URL",
        "remote STEP URL",
        "remote WASM URL",
        "remote WebArchive URL",
        "remote XPS URL",
        "remote XLSX URL",
        "remote ZIP URL inner preview",
        "remote audio URL",
        "remote drawio URL",
        "remote font URL",
        "remote image URL",
        "remote markdown URL",
        "remote video URL",
        "tgz archive inner preview",
        "video",
        "word docx",
        "wrapped PDF-compatible AI",
        "xz archive inner preview"
      ].sort()
    );
  });

  it("keeps remote URL command coverage for network preview paths", () => {
    const names = new Set(commandPreviewCases().map((testCase) => testCase.name));
    expect(remoteCommandCoverageNames().filter((name) => !names.has(name))).toEqual([]);
  });

  it("keeps direct toolbar command coverage for zoomable and rotatable preview paths", () => {
    const names = new Set(commandPreviewCases().map((testCase) => testCase.name));
    expect(interactiveCommandCoverageNames().filter((name) => !names.has(name))).toEqual([]);
  });

  it("keeps rotate-left coverage for each rotatable preview family", () => {
    const names = new Set(rotateLeftCases().map((testCase) => testCase.name));
    expect([...names].sort()).toEqual(
      [
        "3D model",
        "OFD",
        "PDF",
        "PDF-compatible AI",
        "PSD composite",
        "wrapped PDF-compatible AI",
        "XPS",
        "drawing",
        "image",
        "video"
      ].sort()
    );
  });

  it("keeps toolbar command policy explicit for every toolbar support case", () => {
    for (const testCase of toolbarSupportCases()) {
      const declaredLabels = new Set([...testCase.enabled, ...testCase.disabled]);
      expect(declaredLabels, `${testCase.name} should declare zoom-in`).toContain("Zoom in");
      expect(declaredLabels, `${testCase.name} should declare zoom-out`).toContain("Zoom out");
      expect(declaredLabels, `${testCase.name} should declare zoom-reset`).toContain("Reset zoom");
      expect(declaredLabels, `${testCase.name} should declare rotate-right`).toContain("Rotate right");

      for (const label of testCase.enabled) {
        expect(testCase.disabled, `${testCase.name} should not both enable and disable ${label}`).not.toContain(label);
      }
    }
  });

  it.each(smokeCases())("renders $name inside a narrow host", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "280px";
    container.style.height = "360px";
    document.body.append(container);

    const onError = vi.fn();
    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "280px",
      height: "360px",
      plugins: testCase.plugins,
      onError
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );

    expect(container.querySelector(".ofv-root")).toBeNull();
    expect(container.classList.contains("ofv-root")).toBe(true);
    expect(container.getBoundingClientRect().width).toBeLessThanOrEqual(280);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    if (testCase.text) {
      expect(container.textContent).toContain(testCase.text);
    }
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
  });

  it.each(frequentPreviewCases())("renders $name with the shared toolbar inside a narrow host", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "240px";
    container.style.height = "300px";
    document.body.append(container);

    const onError = vi.fn();
    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "240px",
      height: "300px",
      toolbar: true,
      plugins: testCase.plugins,
      onError
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(".ofv-toolbar")) &&
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );

    expect(container.classList.contains("ofv-root")).toBe(true);
    expect(container.querySelector(".ofv-toolbar")).not.toBeNull();
    expect(container.getBoundingClientRect().width).toBeLessThanOrEqual(240);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
  });

  it.each(commandPreviewCases())("keeps $name stable across toolbar commands and resize", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "320px";
    container.style.height = "360px";
    document.body.append(container);

    const onError = vi.fn();
    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "320px",
      height: "360px",
      toolbar: true,
      plugins: testCase.plugins,
      onError
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(".ofv-toolbar")) &&
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );

    await testCase.beforeCommands?.(container);

    const zoomIn = toolbarButton(container, "Zoom in");
    const zoomOut = toolbarButton(container, "Zoom out");
    const zoomReset = toolbarButton(container, "Reset zoom");
    const rotateRight = toolbarButton(container, "Rotate right");
    const supportsZoom = Boolean(zoomIn && zoomOut && zoomReset && !zoomIn.disabled && !zoomOut.disabled && !zoomReset.disabled);
    if (supportsZoom) {
      zoomIn?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(zoomReset?.textContent, `${testCase.name} should update toolbar zoom after zoom-in`).not.toBe("100%");
      zoomOut?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      zoomReset?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(zoomReset?.textContent, `${testCase.name} should reset toolbar zoom`).toBe("100%");
    }
    if (rotateRight && !rotateRight.disabled) {
      rotateRight.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    container.style.width = "220px";
    container.style.height = "280px";
    viewer.resize();
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(container.classList.contains("ofv-root")).toBe(true);
    expect(container.querySelector(testCase.selector)).not.toBeNull();
    testCase.afterCommands?.(container);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    expect(container.querySelector(".ofv-error")).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
  });

  it.each(allToolbarSmokeCases())("keeps shared toolbar safe for $name", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "260px";
    container.style.height = "320px";
    document.body.append(container);

    const onError = vi.fn();
    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "260px",
      height: "320px",
      toolbar: true,
      plugins: testCase.plugins,
      onError
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(".ofv-toolbar")) &&
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );
    await testCase.beforeCommands?.(container);

    for (const label of ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]) {
      const button = toolbarButton(container, label);
      expect(button, `${testCase.name} should render ${label}`).not.toBeUndefined();
      if (button && !button.disabled) {
        button.click();
        await nextRenderTick(16);
      }
    }

    container.style.width = "210px";
    container.style.height = "260px";
    viewer.resize();
    await nextRenderTick(120);

    expect(container.classList.contains("ofv-root")).toBe(true);
    expect(container.querySelector(testCase.selector), `${testCase.name} should still render after toolbar commands`).not.toBeNull();
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    expect(container.querySelector(".ofv-error")).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
  });

  it.each(rotateLeftCases())("supports custom rotate-left toolbar actions for $name", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "300px";
    container.style.height = "340px";
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "300px",
      height: "340px",
      toolbar: {
        zoom: true,
        rotate: true,
        download: false,
        fullscreen: false,
        print: false,
        search: false,
        order: ["zoom-out", "zoom-in", "zoom-reset", "rotate-right", "rotate-left-test"],
        actions: [
          {
            id: "rotate-left-test",
            label: "Left",
            title: "Rotate left",
            disabled: (ctx) => !ctx.canCommand("rotate-left"),
            onClick: (ctx) => {
              ctx.command("rotate-left");
            }
          }
        ]
      },
      plugins: testCase.plugins
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(".ofv-toolbar")) &&
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );
    await testCase.beforeCommands?.(container);
    await waitFor(() => toolbarButton(container, "Rotate left")?.disabled === false);

    testCase.assertBeforeLeft?.(container);
    toolbarButton(container, "Rotate left")?.click();
    await new Promise((resolve) => setTimeout(resolve, 160));

    testCase.assertAfterLeft(container);
    expect(container.querySelector(".ofv-error")).toBeNull();

    viewer.destroy();
  });

  it.each(rotateLeftCases())("keeps $name stable through repeated zoom, rotate, and reset commands", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "300px";
    container.style.height = "340px";
    document.body.append(container);

    const onError = vi.fn();
    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "300px",
      height: "340px",
      toolbar: true,
      plugins: testCase.plugins,
      onError
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(".ofv-toolbar")) &&
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );
    await testCase.beforeCommands?.(container);

    const zoomIn = toolbarButton(container, "Zoom in");
    const zoomOut = toolbarButton(container, "Zoom out");
    const zoomReset = toolbarButton(container, "Reset zoom");
    const rotateRight = toolbarButton(container, "Rotate right");

    expect(zoomIn?.disabled, `${testCase.name} should support repeated zoom-in`).toBe(false);
    expect(zoomOut?.disabled, `${testCase.name} should support repeated zoom-out`).toBe(false);
    expect(zoomReset?.disabled, `${testCase.name} should support repeated zoom-reset`).toBe(false);
    expect(rotateRight?.disabled, `${testCase.name} should support repeated rotate-right`).toBe(false);

    for (let index = 0; index < 4; index += 1) {
      zoomIn?.click();
      await nextRenderTick();
    }
    expect(zoomReset?.textContent, `${testCase.name} should report zoom after repeated zoom-in`).not.toBe("100%");

    for (let index = 0; index < 2; index += 1) {
      zoomOut?.click();
      await nextRenderTick();
    }
    for (let index = 0; index < 5; index += 1) {
      rotateRight?.click();
      await nextRenderTick();
    }

    testCase.assertAfterRepeatedRight?.(container);
    expect(container.querySelector(testCase.selector), `${testCase.name} should keep rendering after repeated commands`).not.toBeNull();
    expect(container.querySelector(".ofv-error")).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    zoomReset?.click();
    await nextRenderTick(180);

    expect(zoomReset?.textContent, `${testCase.name} should reset toolbar zoom after repeated commands`).toBe("100%");
    testCase.assertAfterRepeatedReset?.(container);
    expect(container.querySelector(testCase.selector), `${testCase.name} should keep rendering after reset`).not.toBeNull();
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    expect(container.querySelector(".ofv-error")).toBeNull();
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
  });

  it.each(toolbarSupportCases())("exposes the expected shared toolbar commands for $name", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "260px";
    container.style.height = "320px";
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "260px",
      height: "320px",
      toolbar: true,
      plugins: testCase.plugins
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(".ofv-toolbar")) &&
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );
    await testCase.beforeCommands?.(container);
    await waitFor(() => testCase.enabled.every((label) => !toolbarButton(container, label)?.disabled));

    for (const label of testCase.enabled) {
      expect(toolbarButton(container, label)?.disabled, `${testCase.name} should enable ${label}`).toBe(false);
    }
    for (const label of testCase.disabled) {
      expect(toolbarButton(container, label)?.disabled, `${testCase.name} should disable ${label}`).toBe(true);
    }

    viewer.destroy();
  });

  it.each(cleanPreviewCases())("does not expose supplemental metadata after a successful $name render", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "280px";
    container.style.height = "360px";
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "280px",
      height: "360px",
      toolbar: true,
      plugins: testCase.plugins
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );
    await testCase.beforeCommands?.(container);

    const text = visibleText(container);
    for (const hiddenText of testCase.hiddenText) {
      expect(text, `${testCase.name} should hide ${hiddenText}`).not.toContain(hiddenText);
    }
    for (const selector of testCase.hiddenSelectors || []) {
      expectVisibleElements(container, selector, testCase.name);
      expectSupplementalElementsHidden(container, selector, testCase.name);
    }
    expect(container.querySelector(".ofv-error")).toBeNull();

    viewer.destroy();
  });

  it.each(aliasCleanPreviewCases())("keeps alias/edge preview clean for $name", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "260px";
    container.style.height = "320px";
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "260px",
      height: "320px",
      toolbar: true,
      plugins: testCase.plugins
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );
    await testCase.beforeCommands?.(container);

    expect(container.classList.contains("ofv-root")).toBe(true);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    expect(container.querySelector(".ofv-error")).toBeNull();
    if (!testCase.allowFallback) {
      expect(container.querySelector(".ofv-fallback")).toBeNull();
    }
    for (const selector of testCase.hiddenSelectors || []) {
      expectVisibleElements(container, selector, testCase.name);
      expectSupplementalElementsHidden(container, selector, testCase.name);
    }
    for (const hiddenText of testCase.hiddenText) {
      expect(visibleText(container), `${testCase.name} should hide ${hiddenText}`).not.toContain(hiddenText);
    }

    viewer.destroy();
  });
});

function smokeCases(): SmokeCase[] {
  return [
    {
      name: "plain text",
      file: new Blob(["A very long plain text line that should wrap inside the narrow preview host."], {
        type: "text/plain"
      }),
      fileName: "notes.txt",
      plugins: [textPlugin()],
      selector: ".ofv-code-container.is-wrapped",
      text: "plain text"
    },
    {
      name: "extensionless project file",
      file: new Blob(["install:\n\tpnpm install\nbuild:\n\tpnpm build"], { type: "" }),
      fileName: "Makefile",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      text: "makefile"
    },
    {
      name: "extensionless README",
      file: new Blob(["# Open File Viewer"], { type: "" }),
      fileName: "README",
      plugins: [textPlugin()],
      selector: ".ofv-markdown-body",
      text: "Open File Viewer"
    },
    {
      name: "hidden config file",
      file: new Blob(["node_modules\n.DS_Store"], { type: "" }),
      fileName: ".gitignore",
      plugins: [textPlugin()],
      selector: ".ofv-code-container.is-wrapped",
      text: "node_modules"
    },
    {
      name: "gitignore text alias",
      file: new Blob(["dist\ncoverage"], { type: "text/plain" }),
      fileName: "sample.gitignore",
      plugins: [textPlugin()],
      selector: ".ofv-code-container.is-wrapped",
      text: "coverage"
    },
    {
      name: "notebook JSON",
      file: new Blob([JSON.stringify({ cells: [], metadata: { project: "Open File Viewer" } }, null, 2)], {
        type: "application/x-ipynb+json"
      }),
      fileName: "analysis.ipynb",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      text: "Open File Viewer"
    },
    {
      name: "image fallback",
      file: new Blob(["not an image"], { type: "image/png" }),
      fileName: "broken.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "PNG image",
      file: minimalPng(),
      fileName: "poster-with-long-file-name-that-should-not-overflow.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "TIFF image",
      file: minimalTiff(),
      fileName: "scan.tiff",
      plugins: [imagePlugin()],
      selector: ".ofv-tiff-canvas",
      text: "2 x 1px"
    },
    {
      name: "JPEG image",
      file: minimalJpeg(),
      fileName: "photo.jpg",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "GIF image",
      file: minimalGif(),
      fileName: "animation.gif",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "WebP image",
      file: minimalWebp(),
      fileName: "poster.webp",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "BMP image",
      file: minimalBmp(),
      fileName: "bitmap.bmp",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "CUR image",
      file: minimalCur(),
      fileName: "cursor.cur",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "HEIF image",
      file: minimalHeif(),
      fileName: "photo.heif",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "audio",
      file: new Blob(["audio"], { type: "audio/mpeg" }),
      fileName: "track.mp3",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio",
      text: "track.mp3"
    },
    {
      name: "WAV audio",
      file: minimalWav(),
      fileName: "tone.wav",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio"
    },
    {
      name: "FLAC audio",
      file: minimalFlac(),
      fileName: "song.flac",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio"
    },
    {
      name: "Ogg Opus audio",
      file: minimalOggOpus(),
      fileName: "voice.opus",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio"
    },
    {
      name: "AU audio",
      file: minimalAu(),
      fileName: "voice.au",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio"
    },
    {
      name: "MP4 video",
      file: minimalMp4Detailed(),
      fileName: "clip.mp4",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video"
    },
    {
      name: "AVI video",
      file: minimalAvi(),
      fileName: "capture.avi",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video"
    },
    {
      name: "WebM video",
      file: minimalWebm(),
      fileName: "movie.webm",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video"
    },
    {
      name: "HLS video",
      file: minimalHls(),
      fileName: "playlist.m3u8",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video"
    },
    {
      name: "video DASH fallback",
      file: new Blob(["<MPD />"], { type: "application/dash+xml" }),
      fileName: "stream.mpd",
      plugins: [videoPlugin()],
      selector: ".ofv-fallback",
      text: "下载视频"
    },
    {
      name: "PDF fallback",
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "locked.pdf",
      plugins: [pdfPlugin({ pdfjs: failingPdfJs() as any })],
      selector: ".ofv-fallback",
      text: "PDF 预览失败"
    },
    {
      name: "EPUB",
      file: minimalEpub,
      fileName: "book.epub",
      plugins: [epubPlugin()],
      selector: ".ofv-epub-reader",
      text: "Smoke EPUB"
    },
    {
      name: "XPS",
      file: minimalXps,
      fileName: "report.xps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS"
    },
    {
      name: "OFD",
      file: minimalOfd,
      fileName: "invoice.ofd",
      plugins: [ofdPlugin()],
      selector: ".ofv-ofd-pages",
      text: "OFD 文本"
    },
    {
      name: "workbook",
      file: workbookCsv(),
      fileName: "sheet.csv",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "Alice"
    },
    {
      name: "word docx",
      file: minimalDocx,
      fileName: "contract-with-long-file-name-that-should-not-overflow.docx",
      plugins: [officePlugin()],
      selector: ".ofv-docx-document",
      text: "DOCX smoke paragraph"
    },
    {
      name: "excel xlsx",
      file: minimalXlsx,
      fileName: "financial-model-with-long-name-that-should-not-overflow.xlsx",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion"
    },
    {
      name: "powerpoint pptx",
      file: minimalPptx,
      fileName: "roadmap-with-long-file-name-that-should-not-overflow.pptx",
      plugins: [officePlugin()],
      selector: ".ofv-pptx-viewer",
      text: "PPTX smoke slide"
    },
    {
      name: "archive",
      file: minimalZip,
      fileName: "bundle.zip",
      plugins: [archivePlugin()],
      selector: ".ofv-archive-item",
      text: "readme.txt"
    },
    {
      name: "email",
      file: minimalEmail(),
      fileName: "message.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email"
    },
    {
      name: "mailbox mbox",
      file: minimalMbox(),
      fileName: "archive.mbox",
      plugins: [emailPlugin()],
      selector: ".ofv-email",
      text: "Hello mailbox"
    },
    {
      name: "drawing",
      file: new Blob([JSON.stringify({ elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }] })], {
        type: "application/json"
      }),
      fileName: "board.excalidraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage"
    },
    {
      name: "drawio",
      file: minimalDrawio(),
      fileName: "diagram.drawio",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      text: "Draw.io"
    },
    {
      name: "tldraw",
      file: minimalTldraw(),
      fileName: "whiteboard.tldraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      text: "对象"
    },
    {
      name: "DXF CAD",
      file: minimalDxf(),
      fileName: "floor-plan.dxf",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "DXF"
    },
    {
      name: "IFC BIM",
      file: minimalIfc(),
      fileName: "building.ifc",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "IFC BIM 结构预览"
    },
    {
      name: "STEP CAD",
      file: new Blob([minimalStep()], { type: "model/step" }),
      fileName: "part.step",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "STEP 轻量几何预览"
    },
    {
      name: "IGES CAD",
      file: new Blob([minimalIges()], { type: "application/iges" }),
      fileName: "part.igs",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "IGS 轻量几何预览"
    },
    {
      name: "SAT CAD",
      file: new Blob([minimalSat()], { type: "application/sat" }),
      fileName: "solid.sat",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "SAT ACIS 轻量几何预览"
    },
    {
      name: "Parasolid x_t CAD",
      file: new Blob([minimalParasolidText()], { type: "application/x-parasolid" }),
      fileName: "solid.x_t",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "Parasolid 轻量几何预览"
    },
    {
      name: "DWG metadata",
      file: minimalDwg(),
      fileName: "plan.dwg",
      plugins: [cadPlugin({ libreDwg: false })],
      selector: ".ofv-cad-conversion",
      text: "DWG 文件预览"
    },
    {
      name: "DWF metadata",
      file: new Blob(["DWF\0PAGE\0LAYER A-ANNO\0"], { type: "model/vnd.dwf" }),
      fileName: "sheet.dwf",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-conversion",
      text: "DWF 文件预览"
    },
    {
      name: "GDS layout",
      file: minimalGds(),
      fileName: "layout.gds",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "GDSII"
    },
    {
      name: "OASIS layout",
      file: minimalOasis(),
      fileName: "layout.oas",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "OASIS"
    },
    {
      name: "GIS",
      file: new Blob([JSON.stringify({ type: "FeatureCollection", features: [] })], {
        type: "application/geo+json"
      }),
      fileName: "map.geojson",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage"
    },
    {
      name: "TopoJSON GIS",
      file: new Blob([JSON.stringify({ type: "Topology", objects: { places: { type: "GeometryCollection", name: "Topo Place", geometries: [] } }, arcs: [] })], {
        type: "application/topo+json"
      }),
      fileName: "map.topojson",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      text: "要素1"
    },
    {
      name: "KML GIS",
      file: new Blob(["<kml><Placemark><name>KML Place</name></Placemark></kml>"], {
        type: "application/vnd.google-earth.kml+xml"
      }),
      fileName: "place.kml",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      text: "要素1"
    },
    {
      name: "GPX GIS",
      file: new Blob(["<gpx><trk><name>GPX Track</name></trk></gpx>"], {
        type: "application/gpx+xml"
      }),
      fileName: "track.gpx",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      text: "要素1"
    },
    {
      name: "KMZ GIS",
      file: minimalKmz,
      fileName: "place.kmz",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      text: "要素1"
    },
    {
      name: "raw Shapefile",
      file: new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/octet-stream" }),
      fileName: "roads.shp",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      text: "Point 1"
    },
    {
      name: "3D placeholder",
      file: new Blob(["FBX"], { type: "application/vnd.autodesk.fbx" }),
      fileName: "model.fbx",
      plugins: [model3dPlugin()],
      selector: ".ofv-fallback",
      text: "3D 预览不可用"
    },
    {
      name: "asset",
      file: new Uint8Array([0x00, 0x01, 0x00, 0x00]).buffer,
      fileName: "font.ttf",
      plugins: [assetPlugin()],
      selector: ".ofv-asset",
      text: "字体文件预览"
    },
    {
      name: "SQLite asset",
      file: minimalSqlite(),
      fileName: "data.sqlite",
      plugins: [assetPlugin()],
      selector: ".ofv-sqlite-preview",
      text: "Alice"
    },
    {
      name: "Avro asset",
      file: minimalAvro(),
      fileName: "events.avro",
      plugins: [assetPlugin()],
      selector: ".ofv-data-preview",
      text: "Launch"
    },
    {
      name: "Parquet asset",
      file: minimalParquet(),
      fileName: "events.parquet",
      plugins: [assetPlugin()],
      selector: ".ofv-parquet-records",
      text: "Launch"
    },
    {
      name: "binary WebArchive asset",
      file: minimalBinaryWebArchive(),
      fileName: "page.webarchive",
      plugins: [assetPlugin()],
      selector: ".ofv-webarchive-snippet",
      text: "Hello Binary WebArchive"
    },
    {
      name: "PDF-compatible AI asset",
      file: new Blob(["%PDF-1.7\n%%Title: Smoke AI\n%%Creator: Illustrator\n"]),
      fileName: "poster.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper"
    },
    {
      name: "EPS asset",
      file: new Blob(["%!PS-Adobe-3.0 EPSF-3.0\n%%Title: Smoke EPS\n%%BoundingBox: 0 0 120 80\n%%EOF"]),
      fileName: "mark.eps",
      plugins: [assetPlugin()],
      selector: ".ofv-data-preview",
      text: "PostScript 结构"
    },
    {
      name: "WASM asset",
      file: minimalWasm(),
      fileName: "module.wasm",
      plugins: [assetPlugin()],
      selector: ".ofv-wasm-preview",
      text: "WASM 结构"
    },
    ...formatAliasSmokeCases(),
    ...textAliasSmokeCases(),
    {
      name: "legacy Word binary",
      file: legacyOfficeBlob(["Roadmap 2026", "Budget plan"]),
      fileName: "legacy.doc",
      plugins: [officePlugin()],
      selector: ".ofv-office-conversion",
      text: "Office 转换提示"
    },
    {
      name: "fallback",
      file: new Blob(["unknown"], { type: "application/octet-stream" }),
      fileName: "unknown.bin",
      plugins: [fallbackPlugin()],
      selector: ".ofv-fallback",
      text: "unknown.bin"
    }
  ];
}

function textAliasSmokeCases(): SmokeCase[] {
  const cases: Array<{ extension: string; content: string; selector?: string; text?: string; fileName?: string; mimeType?: string }> = [
    { extension: "log", content: "2026-06-19 INFO Open File Viewer", text: "Open File Viewer" },
    { extension: "env", content: "OFV_MODE=preview", text: "OFV_MODE" },
    { extension: "dockerignore", content: "node_modules\n.DS_Store", fileName: ".dockerignore", text: "node_modules" },
    { extension: "npmrc", content: "registry=https://registry.npmjs.org", fileName: ".npmrc", text: "registry" },
    { extension: "yarnrc", content: "enableTelemetry 0", fileName: ".yarnrc", text: "enableTelemetry" },
    { extension: "pnpmrc", content: "strict-peer-dependencies=false", fileName: ".pnpmrc", text: "strict-peer-dependencies" },
    { extension: "editorconfig", content: "root = true\n[*]\nindent_style = space", fileName: ".editorconfig", text: "indent_style" },
    { extension: "browserslistrc", content: "last 2 Chrome versions", fileName: ".browserslistrc", text: "Chrome" },
    { extension: "prettierrc", content: "{\"printWidth\":100}", fileName: ".prettierrc", text: "printWidth" },
    { extension: "eslintrc", content: "{\"extends\":[\"eslint:recommended\"]}", fileName: ".eslintrc", text: "eslint" },
    { extension: "stylelintrc", content: "{\"extends\":\"stylelint-config-standard\"}", fileName: ".stylelintrc", text: "stylelint" },
    { extension: "conf", content: "server_name open-file-viewer.local;", text: "server_name" },
    { extension: "config", content: "preview.enabled=true", text: "preview.enabled" },
    { extension: "properties", content: "preview.mode=contain", text: "preview.mode" },
    { extension: "lock", content: "open-file-viewer@0.1.7", text: "open-file-viewer" },
    { extension: "json", content: "{\"name\":\"open-file-viewer\"}", text: "open-file-viewer" },
    { extension: "jsonc", content: "{// comment\n\"name\":\"open-file-viewer\"}", text: "comment" },
    { extension: "json5", content: "{name:'open-file-viewer'}", text: "open-file-viewer" },
    { extension: "jsonl", content: "{\"event\":\"preview\"}\n{\"event\":\"zoom\"}", text: "preview" },
    { extension: "ndjson", content: "{\"row\":1}\n{\"row\":2}", text: "row" },
    { extension: "xml", content: "<root><title>Open File Viewer</title></root>", text: "Open File Viewer" },
    { extension: "yaml", content: "name: open-file-viewer", text: "open-file-viewer" },
    { extension: "yml", content: "preview:\n  fit: contain", text: "preview" },
    { extension: "markdown", content: "# Open File Viewer", selector: ".ofv-markdown-body", text: "Open File Viewer" },
    { extension: "toml", content: "name = \"open-file-viewer\"", text: "open-file-viewer" },
    { extension: "ini", content: "[preview]\nfit=contain", text: "preview" },
    { extension: "proto", content: "message Preview { string name = 1; }", text: "Preview" },
    { extension: "tf", content: "resource \"local_file\" \"preview\" {}", text: "resource" },
    { extension: "tfvars", content: "preview_mode = \"contain\"", text: "preview_mode" },
    { extension: "hcl", content: "preview { mode = \"contain\" }", text: "preview" },
    { extension: "tex", content: "\\section{Open File Viewer}", text: "Open File Viewer" },
    { extension: "latex", content: "\\documentclass{article}", text: "documentclass" },
    { extension: "bib", content: "@article{ofv,title={Open File Viewer}}", text: "Open File Viewer" },
    { extension: "gv", content: "digraph G { preview -> viewer }", text: "digraph" },
    { extension: "http", content: "GET https://example.com/preview HTTP/1.1", text: "GET" },
    { extension: "css", content: ".viewer { display: grid; }", text: "display" },
    { extension: "scss", content: "$gap: 8px; .viewer { gap: $gap; }", text: "$gap" },
    { extension: "less", content: "@gap: 8px; .viewer { gap: @gap; }", text: "@gap" },
    { extension: "mjs", content: "export const preview = true;", text: "preview" },
    { extension: "cjs", content: "module.exports = { preview: true };", text: "module.exports" },
    { extension: "ts", content: "const preview: boolean = true;", text: "boolean" },
    { extension: "tsx", content: "export const App = () => <div>Preview</div>;", text: "Preview" },
    { extension: "jsx", content: "export const App = () => <div>Preview</div>;", text: "Preview" },
    { extension: "html", content: "<main>Open File Viewer</main>", text: "Open File Viewer" },
    { extension: "htm", content: "<main>Preview</main>", text: "Preview" },
    { extension: "vue", content: "<template><div>Vue Preview</div></template>", text: "Vue Preview" },
    { extension: "py", content: "print('Open File Viewer')", text: "Open File Viewer" },
    { extension: "java", content: "class Preview {}", text: "Preview" },
    { extension: "go", content: "package main\nfunc main() {}", text: "package main" },
    { extension: "rs", content: "fn main() { println!(\"preview\"); }", text: "preview" },
    { extension: "rb", content: "puts 'preview'", text: "preview" },
    { extension: "swift", content: "print(\"preview\")", text: "preview" },
    { extension: "kt", content: "fun main() = println(\"preview\")", text: "preview" },
    { extension: "kts", content: "println(\"preview\")", text: "preview" },
    { extension: "scala", content: "object Preview extends App", text: "Preview" },
    { extension: "lua", content: "print('preview')", text: "preview" },
    { extension: "r", content: "print('preview')", text: "preview" },
    { extension: "dart", content: "void main() => print('preview');", text: "preview" },
    { extension: "svelte", content: "<script>let name='preview';</script>{name}", text: "preview" },
    { extension: "astro", content: "---\nconst title = 'preview';\n---\n<h1>{title}</h1>", text: "preview" },
    { extension: "elm", content: "module Main exposing (main)", text: "module Main" },
    { extension: "ex", content: "IO.puts(\"preview\")", text: "preview" },
    { extension: "exs", content: "IO.puts(\"preview\")", text: "preview" },
    { extension: "clj", content: "(println \"preview\")", text: "preview" },
    { extension: "cljs", content: "(println \"preview\")", text: "preview" },
    { extension: "erl", content: "-module(preview).", text: "preview" },
    { extension: "hrl", content: "-define(PREVIEW, true).", text: "PREVIEW" },
    { extension: "fs", content: "printfn \"preview\"", text: "preview" },
    { extension: "fsx", content: "printfn \"preview\"", text: "preview" },
    { extension: "hs", content: "main = putStrLn \"preview\"", text: "preview" },
    { extension: "lhs", content: "> main = putStrLn \"preview\"", text: "preview" },
    { extension: "php", content: "<?php echo 'preview';", text: "preview" },
    { extension: "c", content: "int main(void) { return 0; }", text: "main" },
    { extension: "cpp", content: "int main() { return 0; }", text: "main" },
    { extension: "h", content: "#define PREVIEW 1", text: "PREVIEW" },
    { extension: "hpp", content: "#pragma once\nstruct Preview {};", text: "Preview" },
    { extension: "cs", content: "class Preview {}", text: "Preview" },
    { extension: "sql", content: "select * from preview;", text: "preview" },
    { extension: "sh", content: "echo preview", text: "preview" },
    { extension: "bash", content: "echo preview", text: "preview" },
    { extension: "zsh", content: "echo preview", text: "preview" },
    { extension: "fish", content: "echo preview", text: "preview" },
    { extension: "ps1", content: "Write-Output preview", text: "preview" },
    { extension: "bat", content: "echo preview", text: "preview" },
    { extension: "cmd", content: "echo preview", text: "preview" },
    { extension: "dockerfile", content: "FROM node:20\nCOPY . /app", fileName: "Dockerfile", text: "FROM" },
    { extension: "nginxconf", content: "server { listen 80; }", text: "server" },
    { extension: "gradle", content: "plugins { id 'java' }", text: "plugins" },
    { extension: "graphql", content: "query Preview { viewer { id } }", text: "Preview" },
    { extension: "gql", content: "fragment Preview on Viewer { id }", text: "Preview" },
    { extension: "pem", content: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----", text: "CERTIFICATE" },
    { extension: "crt", content: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----", text: "CERTIFICATE" },
    { extension: "cer", content: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----", text: "CERTIFICATE" },
    { extension: "ics", content: "BEGIN:VCALENDAR\nSUMMARY:Preview\nEND:VCALENDAR", text: "VCALENDAR" },
    { extension: "vcf", content: "BEGIN:VCARD\nFN:Open File Viewer\nEND:VCARD", text: "VCARD" },
    { extension: "diff", content: "--- a/a.txt\n+++ b/a.txt\n@@\n-preview\n+viewer", text: "viewer" },
    { extension: "patch", content: "diff --git a/a.txt b/a.txt\n+preview", text: "preview" }
  ];

  return cases.map((item) => ({
    name: `text alias .${item.extension}`,
    file: new Blob([item.content], { type: item.mimeType || "text/plain" }),
    fileName: item.fileName || `sample.${item.extension}`,
    plugins: [textPlugin()],
    selector: item.selector || ".ofv-code-container",
    text: item.text || item.content,
    covers: [item.extension]
  }));
}

function formatAliasSmokeCases(): SmokeCase[] {
  return [
    ...["jpeg", "jfif", "pjpeg", "pjpe"].map((extension) => ({
      name: `JPEG alias .${extension}`,
      file: minimalJpeg(),
      fileName: `photo.${extension}`,
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    })),
    {
      name: "APNG alias",
      file: minimalPng({ fileType: "image/apng" }),
      fileName: "animation.apng",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "AVIF image",
      file: minimalAvif(),
      fileName: "frame.avif",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "JXL image metadata fallback",
      file: minimalJxl(),
      fileName: "frame.jxl",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "SVG image",
      file: minimalSvg(),
      fileName: "vector.svg",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "HEIC image alias",
      file: minimalHeif(),
      fileName: "photo.heic",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "ICO image",
      file: minimalCur(),
      fileName: "icon.ico",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "TIF image alias",
      file: minimalTiff(),
      fileName: "scan.tif",
      plugins: [imagePlugin()],
      selector: ".ofv-tiff-canvas"
    },
    ...["ogg", "aac", "m4a", "oga", "weba", "amr", "aif", "aiff", "aifc", "caf", "mid", "midi", "snd", "wma"].map((extension) => ({
      name: `audio alias .${extension}`,
      file: new Blob(["audio"], { type: audioAliasMime(extension) }),
      fileName: `track.${extension}`,
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio"
    })),
    ...["mov", "m4v", "mkv", "3gp", "3g2", "mpg", "mpeg", "mpe", "mpv", "ogv", "wmv"].map((extension) => ({
      name: `video alias .${extension}`,
      file: minimalMp4Detailed(),
      fileName: `clip.${extension}`,
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video"
    })),
    {
      name: "FLV video via mpegts fallback",
      file: new Blob(["FLV"], { type: "video/x-flv" }),
      fileName: "stream.flv",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video"
    },
    {
      name: "M2TS video via mpegts fallback",
      file: new Blob(["ts"], { type: "video/mp2t" }),
      fileName: "stream.m2ts",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video"
    },
    ...["docm", "dotx", "dotm"].map((extension) => ({
      name: `Word package alias .${extension}`,
      file: minimalDocx,
      fileName: `contract.${extension}`,
      plugins: [officePlugin()],
      selector: ".ofv-docx-document",
      text: "DOCX smoke paragraph"
    })),
    {
      name: "OXPS package alias",
      file: minimalXps,
      fileName: "layout.oxps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS"
    },
    {
      name: "Outlook MSG email",
      file: new Blob(["raw msg"], { type: "application/vnd.ms-outlook" }),
      fileName: "message.msg",
      plugins: [emailPlugin()],
      selector: ".ofv-email",
      text: "MSG smoke body"
    },
    {
      name: "ODT document",
      file: minimalOdt,
      fileName: "notes.odt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "ODT smoke paragraph"
    },
    {
      name: "RTF document",
      file: new Blob(["{\\rtf1\\ansi RTF smoke paragraph}"], { type: "application/rtf" }),
      fileName: "notes.rtf",
      plugins: [officePlugin()],
      selector: ".ofv-text-block",
      text: "RTF smoke paragraph"
    },
    {
      name: "FODT document",
      file: new Blob([minimalFlatOdtXml("FODT smoke paragraph")], { type: "application/vnd.oasis.opendocument.text-flat-xml" }),
      fileName: "notes.fodt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "FODT smoke paragraph"
    },
    ...["xlsm", "xlsb", "xltx", "xltm", "ods"].map((extension) => ({
      name: `sheet package alias .${extension}`,
      file: minimalXlsx,
      fileName: `model.${extension}`,
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion"
    })),
    ...["xls", "xlt", "et"].map((extension) => ({
      name: `legacy spreadsheet alias .${extension}`,
      file: legacyOfficeBlob(["Legacy sheet text"]),
      fileName: `legacy.${extension}`,
      plugins: [officePlugin()],
      selector: ".ofv-office-conversion",
      text: "Office 转换提示"
    })),
    {
      name: "FODS sheet",
      file: new Blob([minimalFlatOdsXml("FODS smoke cell")], { type: "application/vnd.oasis.opendocument.spreadsheet-flat-xml" }),
      fileName: "budget.fods",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "FODS smoke cell"
    },
    {
      name: "Numbers package guidance",
      file: minimalNumbers,
      fileName: "budget.numbers",
      plugins: [officePlugin()],
      selector: ".ofv-office-package-list",
      text: "index/document.iwa"
    },
    {
      name: "TSV sheet",
      file: new Blob(["name\tscore\nAlice\t100"], { type: "text/tab-separated-values" }),
      fileName: "sheet.tsv",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "Alice"
    },
    ...["pptm", "ppsx", "ppsm", "potx", "potm"].map((extension) => ({
      name: `PowerPoint package alias .${extension}`,
      file: minimalPptx,
      fileName: `deck.${extension}`,
      plugins: [officePlugin()],
      selector: ".ofv-pptx-viewer",
      text: "PPTX smoke slide"
    })),
    {
      name: "ODP presentation",
      file: minimalOdp,
      fileName: "deck.odp",
      plugins: [officePlugin()],
      selector: ".ofv-slide",
      text: "ODP smoke slide"
    },
    {
      name: "FODP presentation",
      file: new Blob([minimalFlatOdpXml("FODP smoke slide")], { type: "application/vnd.oasis.opendocument.presentation-flat-xml" }),
      fileName: "deck.fodp",
      plugins: [officePlugin()],
      selector: ".ofv-slide",
      text: "FODP smoke slide"
    },
    ...["dot", "wps", "ppt", "pps", "key", "dps"].map((extension) => ({
      name: `legacy office alias .${extension}`,
      file: legacyOfficeBlob(["Legacy smoke text"]),
      fileName: `legacy.${extension}`,
      plugins: [officePlugin()],
      selector: ".ofv-office-conversion",
      text: "Office 转换提示"
    })),
    ...["tar", "gz", "tgz"].map((extension) => ({
      name: `archive alias .${extension}`,
      file: extension === "tar" ? minimalTar() : minimalGzipText(extension === "tgz"),
      fileName: extension === "tgz" ? "bundle.tgz" : `readme.${extension}`,
      plugins: [archivePlugin()],
      selector: ".ofv-archive-item",
      text: extension === "tgz" ? "readme.txt" : "readme"
    })),
    ...["rar", "7z"].map((extension) => ({
      name: `archive metadata .${extension}`,
      file: new Blob([extension === "rar" ? "Rar!\u001a\u0007\u0000" : "7z\u00bc\u00af'\u001c"], { type: "application/octet-stream" }),
      fileName: `bundle.${extension}`,
      plugins: [archivePlugin()],
      selector: ".ofv-archive-probe-meta",
      text: extension.toUpperCase()
    })),
    {
      name: "drawing alias .dio",
      file: minimalDrawio(),
      fileName: "diagram.dio",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      text: "Draw.io"
    },
    ...["stp", "iges", "sab", "x_b"].map((extension) => ({
      name: `CAD alias .${extension}`,
      file:
        extension === "stp"
          ? new Blob([minimalStep()], { type: "model/step" })
          : extension === "iges"
          ? new Blob([minimalIges()], { type: "application/iges" })
          : extension === "sab"
          ? new Blob([minimalSat()], { type: "application/sab" })
          : new Blob([minimalParasolidText()], { type: "application/x-parasolid" }),
      fileName: `part.${extension}`,
      plugins: [cadPlugin()],
      selector: extension === "iges" || extension === "stp" ? ".ofv-cad-geometry-stage" : ".ofv-cad-conversion",
      text: extension === "iges" ? "IGES 轻量几何预览" : extension === "stp" ? "STP 轻量几何预览" : "CAD 增强接入提示"
    })),
    ...["3dm", "skp", "sldprt", "sldasm"].map((extension) => ({
      name: `unsupported CAD guidance .${extension}`,
      file: new Blob(["cad"], { type: "application/octet-stream" }),
      fileName: `model.${extension}`,
      plugins: [cadPlugin()],
      selector: ".ofv-cad-conversion",
      text: "CAD 增强接入提示"
    })),
    {
      name: "OASIS extension alias",
      file: minimalOasis(),
      fileName: "layout.oasis",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "OASIS"
    },
    ...["sqlite3", "db"].map((extension) => ({
      name: `SQLite alias .${extension}`,
      file: minimalSqlite(),
      fileName: `data.${extension}`,
      plugins: [assetPlugin()],
      selector: ".ofv-sqlite-preview",
      text: "Alice"
    })),
    {
      name: "PostScript asset",
      file: new Blob(["%!PS-Adobe-3.0\n%%Title: Smoke PS\n%%Pages: 1\n%%EOF"]),
      fileName: "poster.ps",
      plugins: [assetPlugin()],
      selector: ".ofv-data-preview",
      text: "PostScript 结构"
    },
    {
      name: "OpenType font alias",
      file: new Uint8Array([0x4f, 0x54, 0x54, 0x4f]).buffer,
      fileName: "font.otf",
      plugins: [assetPlugin()],
      selector: ".ofv-font-preview",
      text: "字体样张"
    },
    ...["woff", "woff2", "eot"].map((extension) => ({
      name: `font alias .${extension}`,
      file: extension === "woff" ? minimalWoff() : extension === "woff2" ? minimalWoff2() : minimalEot(),
      fileName: `font.${extension}`,
      plugins: [assetPlugin()],
      selector: ".ofv-font-preview",
      text: "字体样张"
    })),
    {
      name: "PSB Photoshop alias",
      file: minimalPsdHeader({ version: 2, width: 1024, height: 768, channels: 4, depth: 8, colorMode: 3 }),
      fileName: "large.psb",
      plugins: [assetPlugin()],
      selector: ".ofv-psd-canvas"
    },
    ...["gltf", "obj", "stl", "dae", "ply", "3mf", "3ds", "usd", "usda", "usdc", "usdz", "wrl", "vrml"].map((extension) => ({
      name: `3D model alias .${extension}`,
      file: new Blob([extension === "gltf" ? "{\"asset\":{\"version\":\"2.0\"}}" : "model"], { type: modelAliasMime(extension) }),
      fileName: `scene.${extension}`,
      plugins: [model3dPlugin()],
      selector: ".ofv-model-stage canvas"
    }))
  ];
}

function frequentPreviewCases(): SmokeCase[] {
  return [
    {
      name: "image",
      file: minimalPng(),
      fileName: "toolbar-poster-with-long-file-name-that-should-not-overflow.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "word docx",
      file: minimalDocx,
      fileName: "toolbar-contract-with-long-file-name-that-should-not-overflow.docx",
      plugins: [officePlugin()],
      selector: ".ofv-docx-document",
      text: "DOCX smoke paragraph"
    },
    {
      name: "excel xlsx",
      file: minimalXlsx,
      fileName: "toolbar-financial-model-with-long-name-that-should-not-overflow.xlsx",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion"
    },
    {
      name: "powerpoint pptx",
      file: minimalPptx,
      fileName: "toolbar-roadmap-with-long-file-name-that-should-not-overflow.pptx",
      plugins: [officePlugin()],
      selector: ".ofv-pptx-viewer",
      text: "PPTX smoke slide"
    }
  ];
}

function allToolbarSmokeCases(): SmokeCase[] {
  return [
    ...smokeCases().map((testCase) => ({ ...testCase, name: `smoke ${testCase.name}` })),
    ...formatAliasSmokeCases().map((testCase) => ({ ...testCase, name: `alias ${testCase.name}` }))
  ];
}

function remoteCommandCoverageNames(): string[] {
  return [
    "remote markdown URL",
    "remote image URL",
    "remote audio URL",
    "remote video URL",
    "remote PDF URL",
    "remote DOCX URL",
    "remote XLSX URL",
    "remote PPTX URL",
    "remote ODT URL",
    "remote ODP URL",
    "remote EPUB URL",
    "remote XPS URL",
    "remote OFD URL",
    "remote DXF URL",
    "remote DWF URL",
    "remote STEP URL",
    "remote GDS URL",
    "remote OASIS URL",
    "remote GeoJSON URL",
    "remote KMZ URL",
    "remote GLB URL",
    "remote PDF-compatible AI URL",
    "remote PSD URL",
    "remote SQLite URL",
    "remote Parquet URL",
    "remote Avro URL",
    "remote WebArchive URL",
    "remote WASM URL",
    "remote font URL",
    "remote EML URL",
    "remote drawio URL",
    "remote ZIP URL inner preview"
  ];
}

function interactiveCommandCoverageNames(): string[] {
  return [
    "code text",
    "markdown",
    "image",
    "SVG image",
    "TIFF image",
    "video",
    "PDF",
    "PDF-compatible AI",
    "wrapped PDF-compatible AI",
    "XPS",
    "OXPS",
    "EPUB",
    "OFD",
    "DXF CAD",
    "STEP CAD",
    "STP CAD alias",
    "IGES CAD",
    "SAT CAD",
    "OASIS layout",
    "GDS layout",
    "GIS map",
    "3D model",
    "3D OBJ alias",
    "drawing",
    "plain email",
    "HTML email",
    "word docx",
    "ODT document",
    "RTF document",
    "excel xlsx",
    "powerpoint pptx",
    "FODS sheet",
    "FODT document",
    "ODP presentation",
    "PSB composite",
    "bzip2 archive inner preview",
    "tgz archive inner preview",
    "xz archive inner preview"
  ];
}

function commandPreviewCases(): SmokeCase[] {
  return [
    {
      name: "code text",
      file: new Blob(["const value = 1;\nconsole.log(value);"], { type: "text/javascript" }),
      fileName: "commands.js",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      text: "const value",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-code-container")?.style.getPropertyValue("--ofv-text-zoom")).toBe("1");
      }
    },
    {
      name: "markdown",
      file: new Blob(["# Command Markdown\n\n```js\nconst value = 1\n```"], { type: "text/markdown" }),
      fileName: "commands.md",
      plugins: [textPlugin()],
      selector: ".ofv-markdown-body",
      text: "Command Markdown",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-markdown-body")?.style.getPropertyValue("--ofv-markdown-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "remote markdown URL",
      file: "https://example.com/fixtures/remote.md?download=1",
      fileName: "remote.md",
      plugins: [textPlugin()],
      selector: ".ofv-markdown-body",
      text: "Remote Markdown",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-markdown-body")?.style.getPropertyValue("--ofv-markdown-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "image",
      file: minimalPng(),
      fileName: "commands-poster.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      afterCommands(container) {
        expect(container.querySelector<HTMLImageElement>(".ofv-image-content")?.style.transform).toContain("rotate(90deg)");
      }
    },
    {
      name: "SVG image",
      file: minimalSvg(),
      fileName: "commands.svg",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      afterCommands(container) {
        expect(container.querySelector<HTMLImageElement>(".ofv-image-content")?.style.transform).toContain("rotate(90deg)");
      }
    },
    {
      name: "TIFF image",
      file: minimalTiff(),
      fileName: "commands.tiff",
      plugins: [imagePlugin()],
      selector: ".ofv-tiff-canvas",
      afterCommands(container) {
        expect(container.querySelector<HTMLCanvasElement>(".ofv-tiff-canvas")?.style.transform).toContain("rotate(90deg)");
      }
    },
    {
      name: "remote image URL",
      file: "https://example.com/fixtures/photo.png?cache=1",
      fileName: "photo.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      afterCommands(container) {
        expect(container.querySelector<HTMLImageElement>(".ofv-image-content")?.style.transform).toContain("rotate(90deg)");
      }
    },
    {
      name: "remote audio URL",
      file: "https://example.com/fixtures/tone.wav?download=1",
      fileName: "tone.wav",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio",
      text: "tone.wav",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
        expect(toolbarButton(container, "Rotate right")?.disabled).toBe(true);
      }
    },
    {
      name: "remote video URL",
      file: "https://example.com/fixtures/movie.mp4?download=1",
      fileName: "movie.mp4",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video",
      afterCommands(container) {
        expect(container.querySelector<HTMLVideoElement>(".ofv-video-stage video")?.style.transform).toBe(
          "scale(1) rotate(90deg)"
        );
      }
    },
    {
      name: "remote PDF URL",
      file: "https://example.com/fixtures/document.pdf?download=1",
      fileName: "document.pdf",
      plugins: [pdfPlugin({ pdfjs: successPdfJs() as any })],
      selector: ".ofv-pdf-page-wrapper",
      afterCommands(container) {
        expectPdfPageRotated(container, ".ofv-pdf-page-wrapper", "remote PDF URL");
      }
    },
    {
      name: "remote DOCX URL",
      file: "https://example.com/fixtures/report.docx?download=1",
      fileName: "report.docx",
      plugins: [officePlugin()],
      selector: ".ofv-docx-document",
      text: "DOCX smoke paragraph",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "remote XLSX URL",
      file: "https://example.com/fixtures/sheet.xlsx?download=1",
      fileName: "sheet.xlsx",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "remote PPTX URL",
      file: "https://example.com/fixtures/slides.pptx?download=1",
      fileName: "slides.pptx",
      plugins: [officePlugin()],
      selector: ".ofv-pptx-viewer",
      text: "PPTX smoke slide",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "remote ODT URL",
      file: "https://example.com/fixtures/document.odt?download=1",
      fileName: "document.odt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "ODT smoke paragraph",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "remote ODP URL",
      file: "https://example.com/fixtures/deck.odp?download=1",
      fileName: "deck.odp",
      plugins: [officePlugin()],
      selector: ".ofv-slide",
      text: "ODP smoke slide",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "remote EPUB URL",
      file: "https://example.com/fixtures/book.epub?download=1",
      fileName: "book.epub",
      plugins: [epubPlugin()],
      selector: ".ofv-epub-reader",
      text: "Smoke EPUB",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-epub-reader")?.style.getPropertyValue("--ofv-epub-zoom")).toBe("1");
      }
    },
    {
      name: "remote XPS URL",
      file: "https://example.com/fixtures/pages.xps?download=1",
      fileName: "pages.xps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS",
      afterCommands(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-xps-canvas")?.style.transform).toBe("rotate(90deg)");
      }
    },
    {
      name: "remote OFD URL",
      file: "https://example.com/fixtures/invoice.ofd?download=1",
      fileName: "invoice.ofd",
      plugins: [ofdPlugin()],
      selector: ".ofv-ofd-pages",
      text: "OFD 文本",
      afterCommands(container) {
        expect(container.querySelector(".ofv-ofd")?.classList.contains("is-ofd-rotated-sideways")).toBe(true);
      }
    },
    {
      name: "remote DXF URL",
      file: "https://example.com/fixtures/floor-plan.dxf?download=1",
      fileName: "floor-plan.dxf",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "DXF",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-svg-stage", "remote DXF URL");
      }
    },
    {
      name: "remote DWF URL",
      file: "https://example.com/fixtures/sheet.dwf?download=1",
      fileName: "sheet.dwf",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-conversion",
      text: "DWF 文件预览",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
        expect(toolbarButton(container, "Rotate right")?.disabled).toBe(true);
      }
    },
    {
      name: "remote STEP URL",
      file: "https://example.com/fixtures/part.step?download=1",
      fileName: "part.step",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "STEP 轻量几何预览",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-cad-geometry-stage", "remote STEP URL");
      }
    },
    {
      name: "remote GDS URL",
      file: "https://example.com/fixtures/chip.gds?download=1",
      fileName: "chip.gds",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "GDSII",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-layout-stage", "remote GDS URL");
      }
    },
    {
      name: "remote OASIS URL",
      file: "https://example.com/fixtures/chip.oas?download=1",
      fileName: "chip.oas",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "OASIS",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-layout-stage", "remote OASIS URL");
      }
    },
    {
      name: "remote GeoJSON URL",
      file: "https://example.com/fixtures/map.geojson?download=1",
      fileName: "map.geojson",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      afterCommands(container) {
        expect(toolbarButton(container, "Reset zoom")?.textContent).toBe("100%");
      }
    },
    {
      name: "remote KMZ URL",
      file: "https://example.com/fixtures/place.kmz?download=1",
      fileName: "place.kmz",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      text: "要素1",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Reset zoom")?.textContent).toBe("100%");
      }
    },
    {
      name: "remote GLB URL",
      file: "https://example.com/fixtures/scene.glb?download=1",
      fileName: "scene.glb",
      plugins: [model3dPlugin()],
      selector: ".ofv-model-stage canvas",
      afterCommands(container) {
        expect(container.querySelector(".ofv-model-stage canvas")).not.toBeNull();
      }
    },
    {
      name: "remote PDF-compatible AI URL",
      file: "https://example.com/fixtures/vector.ai?download=1",
      fileName: "vector.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper",
      afterCommands(container) {
        expectPdfPageRotated(container, ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper", "remote PDF-compatible AI URL");
        expect(visibleText(container)).not.toContain("设计文件预览");
        expect(visibleText(container)).not.toContain("PostScript 结构");
        expect(visibleText(container)).not.toContain("签名");
        expect(visibleText(container)).not.toContain("下载文件");
      }
    },
    {
      name: "remote PSD URL",
      file: "https://example.com/fixtures/poster.psd?download=1",
      fileName: "poster.psd",
      plugins: [assetPlugin()],
      selector: ".ofv-psd-canvas",
      afterCommands(container) {
        expect(container.querySelector<HTMLCanvasElement>(".ofv-psd-canvas")?.style.transform).toBe(
          "scale(1) rotate(90deg)"
        );
      }
    },
    {
      name: "remote SQLite URL",
      file: "https://example.com/fixtures/data.sqlite?download=1",
      fileName: "data.sqlite",
      plugins: [assetPlugin()],
      selector: ".ofv-sqlite-data",
      text: "Alice",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
      }
    },
    {
      name: "remote Parquet URL",
      file: "https://example.com/fixtures/events.parquet?download=1",
      fileName: "events.parquet",
      plugins: [assetPlugin()],
      selector: ".ofv-parquet-records",
      text: "Launch",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
      }
    },
    {
      name: "remote Avro URL",
      file: "https://example.com/fixtures/events.avro?download=1",
      fileName: "events.avro",
      plugins: [assetPlugin()],
      selector: ".ofv-avro-records",
      text: "Launch",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
      }
    },
    {
      name: "remote WebArchive URL",
      file: "https://example.com/fixtures/page.webarchive?download=1",
      fileName: "page.webarchive",
      plugins: [assetPlugin()],
      selector: ".ofv-webarchive-snippet",
      text: "Hello Binary WebArchive",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
      }
    },
    {
      name: "remote WASM URL",
      file: "https://example.com/fixtures/module.wasm?download=1",
      fileName: "module.wasm",
      plugins: [assetPlugin()],
      selector: ".ofv-wasm-preview",
      text: "WASM 结构",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
      }
    },
    {
      name: "remote font URL",
      file: "https://example.com/fixtures/brand.woff2?download=1",
      fileName: "brand.woff2",
      plugins: [assetPlugin()],
      selector: ".ofv-font-preview",
      text: "字体样张",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(toolbarButton(container, "Zoom in")?.disabled).toBe(true);
      }
    },
    {
      name: "remote EML URL",
      file: "https://example.com/fixtures/message.eml?download=1",
      fileName: "message.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email",
      text: "Hello email body",
      afterCommands(container) {
        expect(container.querySelector(".ofv-fallback")).toBeNull();
        expect(container.querySelector<HTMLElement>(".ofv-email")?.style.getPropertyValue("--ofv-email-zoom")).toBe("1");
      }
    },
    {
      name: "remote drawio URL",
      file: "https://example.com/fixtures/diagram.drawio?download=1",
      fileName: "diagram.drawio",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      text: "Draw.io",
      afterCommands(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-svg-stage")?.style.transform).toBe("rotate(90deg)");
      }
    },
    {
      name: "remote ZIP URL inner preview",
      file: "https://example.com/fixtures/bundle.zip?download=1",
      fileName: "bundle.zip",
      plugins: [archivePlugin(), textPlugin()],
      selector: ".ofv-archive-item",
      text: "commands.js",
      async beforeCommands(container) {
        container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
        await waitFor(
          () =>
            container.textContent?.includes("const value = 1") === true &&
            toolbarButton(container, "Zoom in")?.disabled === false,
          1500,
          () => visibleText(container)
        );
      },
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-code-container")?.style.getPropertyValue("--ofv-text-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "video",
      file: minimalMp4(),
      fileName: "commands-video.mp4",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video",
      afterCommands(container) {
        expect(container.querySelector<HTMLVideoElement>(".ofv-video-stage video")?.style.transform).toBe(
          "scale(1) rotate(90deg)"
        );
      }
    },
    {
      name: "PDF",
      file: new Blob(["%PDF-1.7\n"], { type: "application/pdf" }),
      fileName: "commands.pdf",
      plugins: [pdfPlugin({ pdfjs: successPdfJs() as any })],
      selector: ".ofv-pdf-page-wrapper",
      afterCommands(container) {
        expectPdfPageRotated(container, ".ofv-pdf-page-wrapper", "PDF");
      }
    },
    {
      name: "PDF-compatible AI",
      file: new Blob(["%PDF-1.7\n%%Title: Vector Poster\n%%Creator: Illustrator\n"]),
      fileName: "commands.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper",
      afterCommands(container) {
        expectPdfPageRotated(container, ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper", "PDF-compatible AI");
      }
    },
    {
      name: "wrapped PDF-compatible AI",
      file: new Blob(["%!PS-Adobe-3.0\n%%Title: Wrapped AI\n%%Creator: Illustrator\n%%AI8_CreatorVersion: 28\n", "%PDF-1.7\n%%Title: Wrapped Vector Poster\n"]),
      fileName: "wrapped-commands.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper",
      afterCommands(container) {
        expectPdfPageRotated(container, ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper", "wrapped PDF-compatible AI");
        expect(visibleText(container)).not.toContain("设计文件预览");
        expect(visibleText(container)).not.toContain("PostScript 结构");
        expect(visibleText(container)).not.toContain("签名");
        expect(visibleText(container)).not.toContain("下载文件");
      }
    },
    {
      name: "XPS",
      file: minimalXps,
      fileName: "commands.xps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS",
      afterCommands(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-xps-canvas")?.style.transform).toBe("rotate(90deg)");
      }
    },
    {
      name: "OXPS",
      file: minimalXps,
      fileName: "commands.oxps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS",
      afterCommands(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-xps-canvas")?.style.transform).toBe("rotate(90deg)");
      }
    },
    {
      name: "EPUB",
      file: minimalEpub,
      fileName: "commands.epub",
      plugins: [epubPlugin()],
      selector: ".ofv-epub-reader",
      text: "Smoke EPUB",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-epub-reader")?.style.getPropertyValue("--ofv-epub-zoom")).toBe("1");
      }
    },
    {
      name: "OFD",
      file: minimalOfd,
      fileName: "commands.ofd",
      plugins: [ofdPlugin()],
      selector: ".ofv-ofd-pages",
      text: "OFD 文本",
      afterCommands(container) {
        expect(container.querySelector(".ofv-ofd")?.classList.contains("is-ofd-rotated-sideways")).toBe(true);
      }
    },
    {
      name: "DXF CAD",
      file: minimalDxf(),
      fileName: "commands.dxf",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "DXF",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-svg-stage", "DXF CAD");
      }
    },
    {
      name: "STEP CAD",
      file: new Blob([minimalStep()], { type: "model/step" }),
      fileName: "commands.step",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "STEP 轻量几何预览",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-cad-geometry-stage", "STEP CAD");
      }
    },
    {
      name: "STP CAD alias",
      file: new Blob([minimalStep()], { type: "model/step" }),
      fileName: "commands.stp",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "STP 轻量几何预览",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-cad-geometry-stage", "STP CAD alias");
      }
    },
    {
      name: "IGES CAD",
      file: new Blob([minimalIges()], { type: "application/iges" }),
      fileName: "commands.iges",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "IGES 轻量几何预览",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-cad-geometry-stage", "IGES CAD");
      }
    },
    {
      name: "SAT CAD",
      file: new Blob([minimalSat()], { type: "application/sat" }),
      fileName: "commands.sat",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "SAT 轻量几何预览",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-cad-geometry-stage", "SAT CAD");
      }
    },
    {
      name: "OASIS layout",
      file: minimalOasis(),
      fileName: "commands.oasis",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "OASIS",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-layout-stage", "OASIS layout");
      }
    },
    {
      name: "GDS layout",
      file: minimalGds(),
      fileName: "commands.gds",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "GDSII",
      afterCommands(container) {
        expectSvgViewBoxReset(container, ".ofv-layout-stage", "GDS layout");
      }
    },
    {
      name: "GIS map",
      file: new Blob([JSON.stringify({ type: "FeatureCollection", features: [] })], {
        type: "application/geo+json"
      }),
      fileName: "commands.geojson",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      afterCommands(container) {
        expect(toolbarButton(container, "Reset zoom")?.textContent).toBe("100%");
      }
    },
    {
      name: "3D model",
      file: new Blob(["glb"], { type: "model/gltf-binary" }),
      fileName: "commands.glb",
      plugins: [model3dPlugin()],
      selector: ".ofv-model-stage canvas",
      afterCommands(container) {
        expect(container.querySelector(".ofv-model-measure")).not.toBeNull();
      }
    },
    {
      name: "3D OBJ alias",
      file: new Blob(["model"], { type: "model/obj" }),
      fileName: "commands.obj",
      plugins: [model3dPlugin()],
      selector: ".ofv-model-stage canvas",
      afterCommands(container) {
        expect(container.querySelector(".ofv-model-materials")).not.toBeNull();
      }
    },
    {
      name: "drawing",
      file: new Blob([JSON.stringify({ elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }] })], {
        type: "application/json"
      }),
      fileName: "commands.excalidraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      afterCommands(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-svg-stage")?.style.transform).toBe("rotate(90deg)");
      }
    },
    {
      name: "plain email",
      file: minimalEmail(),
      fileName: "commands.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email",
      text: "Hello email body",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-email")?.style.getPropertyValue("--ofv-email-zoom")).toBe("1");
      }
    },
    {
      name: "HTML email",
      file: minimalHtmlEmail(),
      fileName: "commands-html.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email-body-iframe",
      text: "HTML email",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-email")?.style.getPropertyValue("--ofv-email-zoom")).toBe("1");
      }
    },
    {
      name: "bzip2 archive inner preview",
      file: sampleBzip2Text(),
      fileName: "commands.txt.bz2",
      plugins: [archivePlugin(), textPlugin()],
      selector: ".ofv-archive-item",
      text: "commands.txt",
      async beforeCommands(container) {
        container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
        await waitFor(
          () =>
            container.textContent?.includes("hello from bz2") === true && !container.querySelector(".ofv-fallback"),
          1500,
          () => visibleText(container)
        );
      },
      afterCommands(container) {
        expect(container.textContent).toContain("hello from bz2");
        expect(container.querySelector(".ofv-fallback")).toBeNull();
      }
    },
    {
      name: "tgz archive inner preview",
      file: minimalGzipText(true),
      fileName: "commands.tgz",
      plugins: [archivePlugin(), textPlugin()],
      selector: ".ofv-archive-item",
      text: "readme.txt",
      async beforeCommands(container) {
        container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
        await waitFor(
          () => container.textContent?.includes("Hello tar archive") === true && !container.querySelector(".ofv-fallback"),
          1500,
          () => visibleText(container)
        );
      },
      afterCommands(container) {
        expect(container.textContent).toContain("Hello tar archive");
        expect(container.querySelector(".ofv-fallback")).toBeNull();
      }
    },
    {
      name: "xz archive inner preview",
      file: sampleXzText(),
      fileName: "commands.txt.xz",
      plugins: [archivePlugin(), textPlugin()],
      selector: ".ofv-archive-item",
      text: "commands.txt",
      async beforeCommands(container) {
        container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
        await waitFor(() => container.textContent?.includes("hello from xz") === true, 1500, () => visibleText(container));
      },
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-code-container")?.style.getPropertyValue("--ofv-text-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "word docx",
      file: minimalDocx,
      fileName: "commands.docx",
      plugins: [officePlugin()],
      selector: ".ofv-docx-document",
      text: "DOCX smoke paragraph",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "ODT document",
      file: minimalOdt,
      fileName: "commands.odt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "ODT smoke paragraph",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "RTF document",
      file: new Blob(["{\\rtf1\\ansi RTF command paragraph}"], { type: "application/rtf" }),
      fileName: "commands.rtf",
      plugins: [officePlugin()],
      selector: ".ofv-text-block",
      text: "RTF command paragraph",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "excel xlsx",
      file: minimalXlsx,
      fileName: "commands.xlsx",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "powerpoint pptx",
      file: minimalPptx,
      fileName: "commands.pptx",
      plugins: [officePlugin()],
      selector: ".ofv-pptx-viewer",
      text: "PPTX smoke slide",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "FODS sheet",
      file: new Blob([minimalFlatOdsXml("FODS command cell")], { type: "application/vnd.oasis.opendocument.spreadsheet-flat-xml" }),
      fileName: "commands.fods",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "FODS command cell",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "FODT document",
      file: new Blob([minimalFlatOdtXml("FODT command paragraph")], { type: "application/vnd.oasis.opendocument.text-flat-xml" }),
      fileName: "commands.fodt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "FODT command paragraph",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "ODP presentation",
      file: minimalOdp,
      fileName: "commands.odp",
      plugins: [officePlugin()],
      selector: ".ofv-slide",
      text: "ODP smoke slide",
      afterCommands(container) {
        expect(container.querySelector<HTMLElement>(".ofv-office")?.style.getPropertyValue("--ofv-office-zoom")).toBe(
          "1"
        );
      }
    },
    {
      name: "PSB composite",
      file: minimalPsdHeader({ version: 2, width: 120, height: 80, channels: 4, depth: 8, colorMode: 3 }),
      fileName: "commands.psb",
      plugins: [assetPlugin()],
      selector: ".ofv-psd-canvas",
      afterCommands(container) {
        expect(container.querySelector<HTMLCanvasElement>(".ofv-psd-canvas")?.style.transform).toBe(
          "scale(1) rotate(90deg)"
        );
      }
    }
  ];
}

function rotateLeftCases(): RotateLeftCase[] {
  return [
    {
      name: "image",
      file: minimalPng(),
      fileName: "rotate-left.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      assertAfterLeft(container) {
        expect(container.querySelector<HTMLImageElement>(".ofv-image-content")?.style.transform).toContain("rotate(-90deg)");
      },
      assertAfterRepeatedRight(container) {
        expect(container.querySelector<HTMLImageElement>(".ofv-image-content")?.style.transform).toContain("rotate(450deg)");
      },
      assertAfterRepeatedReset(container) {
        expect(container.querySelector<HTMLImageElement>(".ofv-image-content")?.style.transform).toContain("rotate(0deg)");
      }
    },
    {
      name: "video",
      file: minimalMp4(),
      fileName: "rotate-left.mp4",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video",
      assertAfterLeft(container) {
        expect(container.querySelector<HTMLVideoElement>(".ofv-video-stage video")?.style.transform).toBe(
          "scale(1) rotate(-90deg)"
        );
      },
      assertAfterRepeatedRight(container) {
        expect(container.querySelector<HTMLVideoElement>(".ofv-video-stage video")?.style.transform).toBe(
          "scale(1.5) rotate(450deg)"
        );
      },
      assertAfterRepeatedReset(container) {
        expect(container.querySelector<HTMLVideoElement>(".ofv-video-stage video")?.style.transform).toBe(
          "scale(1) rotate(0deg)"
        );
      }
    },
    {
      name: "PDF",
      file: new Blob(["%PDF-1.7\n"], { type: "application/pdf" }),
      fileName: "rotate-left.pdf",
      plugins: [pdfPlugin({ pdfjs: successPdfJs() as any })],
      selector: ".ofv-pdf-page-wrapper",
      assertAfterLeft(container) {
        expectPdfPageRotated(container, ".ofv-pdf-page-wrapper", "rotate-left PDF");
      },
      assertAfterRepeatedRight(container) {
        expectPdfPageRotated(container, ".ofv-pdf-page-wrapper", "repeated rotate PDF", { expectResetZoom: false });
      }
    },
    {
      name: "PDF-compatible AI",
      file: new Blob(["%PDF-1.7\n%%Title: Vector Poster\n%%Creator: Illustrator\n"]),
      fileName: "rotate-left.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper",
      assertAfterLeft(container) {
        expectPdfPageRotated(container, ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper", "rotate-left PDF-compatible AI");
      }
    },
    {
      name: "wrapped PDF-compatible AI",
      file: new Blob(["%!PS-Adobe-3.0\n%%Title: Wrapped Rotate AI\n%%Creator: Illustrator\n%%AI8_CreatorVersion: 28\n", "%PDF-1.7\n%%Title: Wrapped Rotate Poster\n"]),
      fileName: "rotate-left-wrapped.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper",
      assertAfterLeft(container) {
        expectPdfPageRotated(container, ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper", "rotate-left wrapped PDF-compatible AI");
        expect(visibleText(container)).not.toContain("设计文件预览");
        expect(visibleText(container)).not.toContain("PostScript 结构");
        expect(visibleText(container)).not.toContain("签名");
        expect(visibleText(container)).not.toContain("下载文件");
      }
    },
    {
      name: "XPS",
      file: minimalXps,
      fileName: "rotate-left.xps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS",
      assertAfterLeft(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-xps-canvas")?.style.transform).toBe("rotate(-90deg)");
      },
      assertAfterRepeatedRight(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-xps-canvas")?.style.transform).toBe("rotate(450deg)");
      },
      assertAfterRepeatedReset(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-xps-canvas")?.style.transform).toBe("");
      }
    },
    {
      name: "OFD",
      file: minimalOfd,
      fileName: "rotate-left.ofd",
      plugins: [ofdPlugin()],
      selector: ".ofv-ofd-pages",
      text: "OFD 文本",
      assertAfterLeft(container) {
        expect(container.querySelector(".ofv-ofd")?.classList.contains("is-ofd-rotated-sideways")).toBe(true);
        expect(container.querySelector<HTMLElement>(".ofv-ofd")?.style.getPropertyValue("--ofv-ofd-rotation")).toBe("270deg");
      },
      assertAfterRepeatedRight(container) {
        expect(container.querySelector<HTMLElement>(".ofv-ofd")?.style.getPropertyValue("--ofv-ofd-rotation")).toBe("90deg");
      },
      assertAfterRepeatedReset(container) {
        expect(container.querySelector<HTMLElement>(".ofv-ofd")?.style.getPropertyValue("--ofv-ofd-rotation")).toBe("0deg");
      }
    },
    {
      name: "drawing",
      file: new Blob([JSON.stringify({ elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }] })], {
        type: "application/json"
      }),
      fileName: "rotate-left.excalidraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      assertAfterLeft(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-svg-stage")?.style.transform).toBe("rotate(-90deg)");
      },
      assertAfterRepeatedRight(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-svg-stage")?.style.transform).toBe("rotate(450deg)");
      },
      assertAfterRepeatedReset(container) {
        expect(container.querySelector<SVGSVGElement>(".ofv-svg-stage")?.style.transform).toBe("");
      }
    },
    {
      name: "PSD composite",
      file: minimalPsdHeader({ width: 120, height: 80, channels: 4, depth: 8, colorMode: 3 }),
      fileName: "rotate-left.psd",
      plugins: [assetPlugin()],
      selector: ".ofv-psd-canvas",
      assertAfterLeft(container) {
        expect(container.querySelector<HTMLCanvasElement>(".ofv-psd-canvas")?.style.transform).toBe(
          "scale(1) rotate(-90deg)"
        );
      },
      assertAfterRepeatedRight(container) {
        expect(container.querySelector<HTMLCanvasElement>(".ofv-psd-canvas")?.style.transform).toBe(
          "scale(1.5) rotate(450deg)"
        );
      },
      assertAfterRepeatedReset(container) {
        expect(container.querySelector<HTMLCanvasElement>(".ofv-psd-canvas")?.style.transform).toBe(
          "scale(1) rotate(0deg)"
        );
      }
    },
    {
      name: "3D model",
      file: new Blob(["glb"], { type: "model/gltf-binary" }),
      fileName: "rotate-left.glb",
      plugins: [model3dPlugin()],
      selector: ".ofv-model-stage canvas",
      assertAfterLeft(container) {
        expect(container.querySelector(".ofv-model-stage canvas")).not.toBeNull();
      }
    }
  ];
}

function toolbarSupportCases(): ToolbarSupportCase[] {
  return [
    {
      name: "audio playback",
      file: new Blob(["audio"], { type: "audio/mpeg" }),
      fileName: "toolbar.mp3",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "video playback",
      file: minimalMp4(),
      fileName: "toolbar.mp4",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "code text",
      file: new Blob(["const value = 1;"], { type: "text/javascript" }),
      fileName: "toolbar.js",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "image",
      file: minimalPng(),
      fileName: "toolbar.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "PDF",
      file: new Blob(["%PDF-1.7\n"], { type: "application/pdf" }),
      fileName: "toolbar.pdf",
      plugins: [pdfPlugin({ pdfjs: successPdfJs() as any })],
      selector: ".ofv-pdf-page-wrapper",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "XPS pages",
      file: minimalXps,
      fileName: "toolbar.xps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "OXPS pages",
      file: minimalXps,
      fileName: "toolbar.oxps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "OFD pages",
      file: minimalOfd,
      fileName: "toolbar.ofd",
      plugins: [ofdPlugin()],
      selector: ".ofv-ofd-pages",
      text: "OFD 文本",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "EPUB reader",
      file: minimalEpub,
      fileName: "toolbar.epub",
      plugins: [epubPlugin()],
      selector: ".ofv-epub-reader",
      text: "Smoke EPUB",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "GIS map",
      file: new Blob([JSON.stringify({ type: "FeatureCollection", features: [] })], { type: "application/geo+json" }),
      fileName: "toolbar.geojson",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "DXF CAD",
      file: minimalDxf(),
      fileName: "toolbar.dxf",
      plugins: [cadPlugin()],
      selector: ".ofv-svg-stage",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "DWG metadata fallback",
      file: minimalDwg(),
      fileName: "toolbar.dwg",
      plugins: [cadPlugin({ libreDwg: false })],
      selector: ".ofv-cad-conversion",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "GDS layout",
      file: minimalGds(),
      fileName: "toolbar.gds",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "GDSII",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "OASIS layout",
      file: minimalOasis(),
      fileName: "toolbar.oas",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "OASIS",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "STEP CAD",
      file: new Blob([minimalStep()], { type: "model/step" }),
      fileName: "toolbar.step",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "STEP 轻量几何预览",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "SAT CAD",
      file: new Blob([minimalSat()], { type: "application/sat" }),
      fileName: "toolbar.sat",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      text: "SAT 轻量几何预览",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "3D model",
      file: new Blob(["glb"], { type: "model/gltf-binary" }),
      fileName: "toolbar.glb",
      plugins: [model3dPlugin()],
      selector: ".ofv-model-stage canvas",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "drawing canvas",
      file: new Blob([JSON.stringify({ elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }] })], {
        type: "application/json"
      }),
      fileName: "toolbar.excalidraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "plain email",
      file: minimalEmail(),
      fileName: "toolbar.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email",
      text: "Hello email body",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "HTML email",
      file: minimalHtmlEmail(),
      fileName: "toolbar-html.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email-body-iframe",
      text: "HTML email",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "word docx",
      file: minimalDocx,
      fileName: "toolbar.docx",
      plugins: [officePlugin()],
      selector: ".ofv-docx-document",
      text: "DOCX smoke paragraph",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "excel xlsx",
      file: minimalXlsx,
      fileName: "toolbar.xlsx",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "powerpoint pptx",
      file: minimalPptx,
      fileName: "toolbar.pptx",
      plugins: [officePlugin()],
      selector: ".ofv-pptx-viewer",
      text: "PPTX smoke slide",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "ODT document",
      file: minimalOdt,
      fileName: "toolbar.odt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "ODT smoke paragraph",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "RTF document",
      file: new Blob(["{\\rtf1\\ansi RTF toolbar paragraph}"], { type: "application/rtf" }),
      fileName: "toolbar.rtf",
      plugins: [officePlugin()],
      selector: ".ofv-text-block",
      text: "RTF toolbar paragraph",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "FODS sheet",
      file: new Blob([minimalFlatOdsXml("FODS toolbar cell")], { type: "application/vnd.oasis.opendocument.spreadsheet-flat-xml" }),
      fileName: "toolbar.fods",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "FODS toolbar cell",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "ODP presentation",
      file: minimalOdp,
      fileName: "toolbar.odp",
      plugins: [officePlugin()],
      selector: ".ofv-slide",
      text: "ODP smoke slide",
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    },
    {
      name: "PSD composite",
      file: minimalPsdHeader({ width: 120, height: 80, channels: 4, depth: 8, colorMode: 3 }),
      fileName: "toolbar.psd",
      plugins: [assetPlugin()],
      selector: ".ofv-psd-canvas",
      enabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"],
      disabled: []
    },
    {
      name: "SQLite data",
      file: minimalSqlite(),
      fileName: "toolbar.sqlite",
      plugins: [assetPlugin()],
      selector: ".ofv-sqlite-preview",
      text: "Alice",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "Avro data",
      file: minimalAvro(),
      fileName: "toolbar.avro",
      plugins: [assetPlugin()],
      selector: ".ofv-data-preview",
      text: "Launch",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "Parquet data",
      file: minimalParquet(),
      fileName: "toolbar.parquet",
      plugins: [assetPlugin()],
      selector: ".ofv-parquet-records",
      text: "Launch",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "WebArchive data",
      file: minimalBinaryWebArchive(),
      fileName: "toolbar.webarchive",
      plugins: [assetPlugin()],
      selector: ".ofv-webarchive-snippet",
      text: "Hello Binary WebArchive",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "WASM data",
      file: minimalWasm(),
      fileName: "toolbar.wasm",
      plugins: [assetPlugin()],
      selector: ".ofv-wasm-preview",
      text: "WASM 结构",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "font asset",
      file: minimalWoff2(),
      fileName: "toolbar.woff2",
      plugins: [assetPlugin()],
      selector: ".ofv-font-preview",
      text: "字体样张",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "EPS design asset",
      file: new Blob(["%!PS-Adobe-3.0 EPSF-3.0\n%%Title: Toolbar EPS\n%%BoundingBox: 0 0 120 80\n%%EOF"]),
      fileName: "toolbar.eps",
      plugins: [assetPlugin()],
      selector: ".ofv-data-preview",
      text: "PostScript 结构",
      enabled: [],
      disabled: ["Zoom in", "Zoom out", "Reset zoom", "Rotate right"]
    },
    {
      name: "archive inner text",
      file: minimalCommandZip,
      fileName: "toolbar.zip",
      plugins: [archivePlugin(), textPlugin()],
      selector: ".ofv-archive-item",
      text: "commands.js",
      async beforeCommands(container) {
        container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
        await waitFor(
          () =>
            Boolean(container.querySelector(".ofv-code-container")) &&
            toolbarButton(container, "Zoom in")?.disabled === false
        );
      },
      enabled: ["Zoom in", "Zoom out", "Reset zoom"],
      disabled: ["Rotate right"]
    }
  ];
}

function cleanPreviewCases(): CleanPreviewCase[] {
  return [
    {
      name: "PDF-compatible AI asset",
      file: new Blob(["%PDF-1.7\n%%Title: Smoke AI\n%%Creator: Illustrator\n"]),
      fileName: "clean.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper",
      hiddenText: ["设计文件预览", "PostScript 结构", "签名", "下载文件", "PDF-compatible Illustrator"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-data-preview", ".ofv-asset-download", ".ofv-asset-hex"]
    },
    {
      name: "wrapped PDF-compatible AI asset",
      file: new Blob(["%!PS-Adobe-3.0\n%%Title: Wrapped Clean AI\n%%Creator: Illustrator\n%%AI8_CreatorVersion: 28\n", "%PDF-1.7\n%%Title: Wrapped Clean Poster\n"]),
      fileName: "clean-wrapped.ai",
      plugins: [assetPlugin()],
      selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper",
      hiddenText: ["设计文件预览", "PostScript 结构", "签名", "下载文件", "PDF-compatible Illustrator", "页数 1", "缩放 100%"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-data-preview", ".ofv-asset-download", ".ofv-asset-hex", ".ofv-pdf-summary"]
    },
    {
      name: "image",
      file: minimalPng(),
      fileName: "clean.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式PNG", "尺寸320 x 180px", "位深"],
      hiddenSelectors: [".ofv-image-info"]
    },
    {
      name: "video",
      file: minimalMp4Detailed(),
      fileName: "clean.mp4",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video",
      hiddenText: ["格式MP4", "尺寸1920 x 1080px", "时长"],
      hiddenSelectors: [".ofv-media-info"]
    },
    {
      name: "audio",
      file: minimalWav(),
      fileName: "clean.wav",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio",
      hiddenText: ["格式WAV", "采样率44100 Hz", "声道2"],
      hiddenSelectors: [".ofv-media-info"]
    },
    {
      name: "PDF",
      file: new Blob(["%PDF-1.7\n"], { type: "application/pdf" }),
      fileName: "clean.pdf",
      plugins: [pdfPlugin({ pdfjs: successPdfJs() as any })],
      selector: ".ofv-pdf-page-wrapper",
      hiddenText: ["页数 1", "页面尺寸 320 x 180", "缩放 100%"],
      hiddenSelectors: [".ofv-pdf-summary"]
    },
    {
      name: "XPS",
      file: minimalXps,
      fileName: "clean.xps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS",
      hiddenText: ["FixedDocSeq", "Glyphs", "页面尺寸"],
      hiddenSelectors: [".ofv-xps-summary"]
    },
    {
      name: "EPUB",
      file: minimalEpub,
      fileName: "clean.epub",
      plugins: [epubPlugin()],
      selector: ".ofv-epub-reader",
      text: "Smoke EPUB",
      hiddenText: ["EPUB 图书信息", "EPUB 正文预览", "Manifest", "Spine", "标题Smoke EPUB"],
      hiddenSelectors: [".ofv-epub-meta"]
    },
    {
      name: "drawing",
      file: new Blob([JSON.stringify({ elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }] })], {
        type: "application/json"
      }),
      fileName: "clean.excalidraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      hiddenText: ["对象1", "类型rectangle", "连线0"],
      hiddenSelectors: [".ofv-drawing-summary"]
    },
    {
      name: "Draw.io",
      file: minimalDrawio(),
      fileName: "clean.drawio",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      text: "Draw.io",
      hiddenText: ["原始 XML 摘要", "Draw.io 原始内容"],
      hiddenSelectors: [".ofv-drawing-summary", ".ofv-details"]
    },
    {
      name: "JSON code",
      file: new Blob([JSON.stringify({ project: "Open File Viewer", plugins: ["pdf", "office"] }, null, 2)], {
        type: "application/json"
      }),
      fileName: "clean.json",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      text: "Open File Viewer",
      hiddenText: ["结构Object", "键2"],
      hiddenSelectors: [".ofv-text-structure"]
    },
    {
      name: "GIS",
      file: new Blob([JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "A" }, geometry: { type: "Point", coordinates: [0, 0] } }] })], {
        type: "application/geo+json"
      }),
      fileName: "clean.geojson",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      hiddenText: ["要素1", "属性字段1", "字段预览", "GeoJSON"],
      hiddenSelectors: [".ofv-gis-summary", ".ofv-map-legend"]
    },
    {
      name: "DXF drawing",
      file: minimalDxf(),
      fileName: "clean.dxf",
      plugins: [cadPlugin()],
      selector: ".ofv-svg-stage",
      hiddenText: ["DXF 基础预览", "已提取 LINE", "图层 1"],
      hiddenSelectors: [".ofv-cad-layers"]
    },
    {
      name: "workbook",
      file: minimalXlsx,
      fileName: "clean.xlsx",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion",
      hiddenText: ["行 x", "公式单元格", "工作表"],
      hiddenSelectors: [".ofv-sheet-summary", ".ofv-formula-list", ".ofv-chart-data"]
    },
    {
      name: "word docx",
      file: minimalDocx,
      fileName: "clean.docx",
      plugins: [officePlugin()],
      selector: ".ofv-docx-document",
      text: "DOCX smoke paragraph",
      hiddenText: ["高保真 DOCX 渲染失败", "解析提示", "DOCX 内容解析失败"],
      hiddenSelectors: [".ofv-docx-fallback-note", ".ofv-details"]
    },
    {
      name: "ODT document",
      file: minimalOdt,
      fileName: "clean.odt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "ODT smoke paragraph",
      hiddenText: ["ODT 文档"],
      hiddenSelectors: []
    },
    {
      name: "FODT document",
      file: new Blob([minimalFlatOdtXml("FODT clean paragraph")], { type: "application/vnd.oasis.opendocument.text-flat-xml" }),
      fileName: "clean.fodt",
      plugins: [officePlugin()],
      selector: ".ofv-document",
      text: "FODT clean paragraph",
      hiddenText: ["FODT 文档"],
      hiddenSelectors: []
    },
    {
      name: "RTF document",
      file: new Blob(["{\\rtf1\\ansi RTF clean paragraph}"], { type: "application/rtf" }),
      fileName: "clean.rtf",
      plugins: [officePlugin()],
      selector: ".ofv-text-block",
      text: "RTF clean paragraph",
      hiddenText: ["RTF 文档"],
      hiddenSelectors: []
    },
    {
      name: "presentation",
      file: minimalPptx,
      fileName: "clean.pptx",
      plugins: [officePlugin()],
      selector: ".ofv-pptx-viewer",
      text: "PPTX smoke slide",
      hiddenText: ["PPTX 演示文稿结构", "页幻灯片", "张图片"],
      hiddenSelectors: [".ofv-presentation-summary"]
    },
    {
      name: "ODP presentation",
      file: minimalOdp,
      fileName: "clean.odp",
      plugins: [officePlugin()],
      selector: ".ofv-slide",
      text: "ODP smoke slide",
      hiddenText: ["ODP 演示文稿 1", "ODP 演示文稿结构"],
      hiddenSelectors: [".ofv-presentation-summary"]
    },
    {
      name: "FODP presentation",
      file: new Blob([minimalFlatOdpXml("FODP clean slide")], { type: "application/vnd.oasis.opendocument.presentation-flat-xml" }),
      fileName: "clean.fodp",
      plugins: [officePlugin()],
      selector: ".ofv-slide",
      text: "FODP clean slide",
      hiddenText: ["FODP 演示文稿 1", "FODP 演示文稿结构"],
      hiddenSelectors: [".ofv-presentation-summary"]
    },
    {
      name: "PSD composite",
      file: minimalPsdHeader({ width: 120, height: 80, channels: 4, depth: 8, colorMode: 3 }),
      fileName: "clean.psd",
      plugins: [assetPlugin()],
      selector: ".ofv-psd-canvas",
      hiddenText: ["PSD 合成图解析失败", "PSD/PSB 已识别", "画布", "通道", "位深", "颜色模式"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download", ".ofv-asset-hex"]
    },
    {
      name: "font preview",
      file: minimalWoff2(),
      fileName: "clean.woff2",
      plugins: [assetPlugin()],
      selector: ".ofv-font-preview",
      text: "字体样张",
      hiddenText: ["字体文件预览", "字体结构", "容器WOFF2", "FlavorTrueType", "签名", "下载文件"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download", ".ofv-font-status", ".ofv-font-info"]
    },
    {
      name: "WASM structure",
      file: minimalWasm(),
      fileName: "clean.wasm",
      plugins: [assetPlugin()],
      selector: ".ofv-wasm-preview",
      text: "WASM 结构",
      hiddenText: ["WebAssembly 文件预览", "签名", "下载文件"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download"]
    },
    {
      name: "SQLite data",
      file: minimalSqlite(),
      fileName: "clean.sqlite",
      plugins: [assetPlugin()],
      selector: ".ofv-sqlite-data",
      text: "Alice",
      hiddenText: ["数据文件预览", "SQLite 结构", "页大小", "页数", "User version", "签名", "下载文件"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download", ".ofv-sqlite-summary", ".ofv-asset-hex"]
    },
    {
      name: "Parquet records",
      file: minimalParquet(),
      fileName: "clean.parquet",
      plugins: [assetPlugin()],
      selector: ".ofv-parquet-records",
      text: "Launch",
      hiddenText: ["数据文件预览", "MagicPAR1", "Footer", "Footer offset", "Row groups", "Created by", "签名", "下载文件"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download", ".ofv-data-note", ".ofv-asset-hex"]
    },
    {
      name: "Avro records",
      file: minimalAvro(),
      fileName: "clean.avro",
      plugins: [assetPlugin()],
      selector: ".ofv-avro-records",
      text: "Launch",
      hiddenText: ["数据文件预览", "MagicObj\\x01", "Sync marker", "Metadata", "avro.schema", "签名", "下载文件"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download", ".ofv-data-summary", ".ofv-asset-hex"]
    },
    {
      name: "WebArchive main resource",
      file: minimalBinaryWebArchive(),
      fileName: "clean.webarchive",
      plugins: [assetPlugin()],
      selector: ".ofv-webarchive-snippet",
      text: "Hello Binary WebArchive",
      hiddenText: ["网页归档预览", "Binary plist", "主资源", "子资源", "签名", "下载文件"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download", ".ofv-data-summary", ".ofv-data-note", ".ofv-asset-hex"]
    },
    {
      name: "OFD pages",
      file: minimalOfd,
      fileName: "clean.ofd",
      plugins: [ofdPlugin()],
      selector: ".ofv-ofd-pages",
      text: "OFD 文本",
      hiddenText: ["OFD 预览", "文件结构", "Content.xml"],
      hiddenSelectors: [".ofv-ofd-summary", ".ofv-ofd-details"]
    },
    {
      name: "STEP lightweight CAD",
      file: new Blob([minimalStep()], { type: "model/step" }),
      fileName: "clean.step",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      hiddenText: ["STEP 轻量几何预览", "结构预览", "类型统计", "实体", "点 2", "线 1"],
      hiddenSelectors: [".ofv-cad-summary", ".ofv-cad-types"]
    },
    {
      name: "IGES lightweight CAD",
      file: new Blob([minimalIges()], { type: "application/iges" }),
      fileName: "clean.iges",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      hiddenText: ["IGES 轻量几何预览", "结构预览", "类型号统计", "实体", "点 2", "线 1"],
      hiddenSelectors: [".ofv-cad-summary", ".ofv-cad-types"]
    },
    {
      name: "SAT lightweight CAD",
      file: new Blob([minimalSat()], { type: "application/sat" }),
      fileName: "clean.sat",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      hiddenText: ["SAT 轻量几何预览", "结构预览", "类型统计", "实体", "点 2", "线 1"],
      hiddenSelectors: [".ofv-cad-summary", ".ofv-cad-types"]
    },
    {
      name: "Parasolid lightweight CAD",
      file: new Blob([minimalParasolidText()], { type: "application/x-parasolid" }),
      fileName: "clean.x_t",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-geometry-stage",
      hiddenText: ["Parasolid 轻量几何预览", "Parasolid 文本预览", "类型统计", "实体", "点 2", "线 1"],
      hiddenSelectors: [".ofv-cad-summary", ".ofv-cad-types"]
    },
    {
      name: "GDS layout",
      file: minimalGds(),
      fileName: "clean.gds",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "GDSII",
      hiddenText: ["Cell", "几何", "引用", "文字"],
      hiddenSelectors: [".ofv-layout-summary", ".ofv-layout-note", ".ofv-layout-cells", ".ofv-layout-layers"]
    },
    {
      name: "OASIS layout",
      file: minimalOasis(),
      fileName: "clean.oas",
      plugins: [cadPlugin()],
      selector: ".ofv-layout-stage",
      text: "OASIS",
      hiddenText: ["Cell", "几何", "引用", "文字"],
      hiddenSelectors: [".ofv-layout-summary", ".ofv-layout-note", ".ofv-layout-cells", ".ofv-layout-layers"]
    },
    {
      name: "3D model",
      file: new Blob(["glb"], { type: "model/gltf-binary" }),
      fileName: "clean.glb",
      plugins: [model3dPlugin()],
      selector: ".ofv-model-stage canvas",
      hiddenText: ["模型测量", "材质贴图", "对角线", "槽位"],
      hiddenSelectors: [".ofv-model-measure", ".ofv-model-materials"]
    },
    {
      name: "plain email",
      file: minimalEmail(),
      fileName: "clean.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email",
      text: "Hello email body",
      hiddenText: ["邮件信息", "Subject", "From", "To", "Date"],
      hiddenSelectors: [".ofv-email-header", ".ofv-email-attachments", ".ofv-email-mbox-summary"]
    },
    {
      name: "archive inner text",
      file: minimalCommandZip,
      fileName: "clean.zip",
      plugins: [archivePlugin(), textPlugin()],
      selector: ".ofv-archive-item",
      text: "commands.js",
      async beforeCommands(container) {
        container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
        await waitFor(
          () => container.textContent?.includes("const value = 1") === true && !container.querySelector(".ofv-fallback"),
          1500,
          () => visibleText(container)
        );
      },
      hiddenText: ["格式类型", "包含文件数", "包含目录数", "操作提示", "总解压大小", "类型分布"],
      hiddenSelectors: [".ofv-archive-summary", ".ofv-archive-info", ".ofv-archive-probe-meta"]
    },
    {
      name: "archive tgz inner text",
      file: minimalGzipText(true),
      fileName: "clean.tgz",
      plugins: [archivePlugin(), textPlugin()],
      selector: ".ofv-archive-item",
      text: "readme.txt",
      async beforeCommands(container) {
        container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
        await waitFor(
          () => container.textContent?.includes("Hello tar archive") === true && !container.querySelector(".ofv-fallback"),
          1500,
          () => visibleText(container)
        );
      },
      hiddenText: ["格式类型", "包含文件数", "包含目录数", "操作提示", "总解压大小", "类型分布"],
      hiddenSelectors: [".ofv-archive-summary", ".ofv-archive-info", ".ofv-archive-probe-meta"]
    }
  ];
}

function aliasCleanPreviewCases(): CleanPreviewCase[] {
  return [
    {
      name: "JPEG alias",
      file: minimalJpeg(),
      fileName: "clean-alias.jpg",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式JPEG", "尺寸"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["jpg", "jpeg", "jfif", "pjpeg", "pjpe"]
    },
    {
      name: "SVG vector image",
      file: minimalSvg(),
      fileName: "clean-alias.svg",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式SVG", "尺寸120 x 80px", "viewBox"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["svg"]
    },
    {
      name: "TIFF raster image",
      file: minimalTiff(),
      fileName: "clean-alias.tiff",
      plugins: [imagePlugin()],
      selector: ".ofv-tiff-canvas",
      hiddenText: ["格式TIFF", "尺寸2 x 1px", "位深8 bit"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["tiff", "tif"]
    },
    {
      name: "GIF animation alias",
      file: minimalGif(),
      fileName: "clean-alias.gif",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式GIF89a", "尺寸64 x 32px", "帧1"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["gif"]
    },
    {
      name: "APNG animation alias",
      file: minimalPng({ fileType: "image/apng", frames: 2 }),
      fileName: "clean-alias.apng",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式APNG", "尺寸320 x 180px", "帧2"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["apng"]
    },
    {
      name: "AVIF image alias",
      file: minimalAvif(),
      fileName: "clean-alias.avif",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式AVIF", "尺寸640 x 360px", "brand avif"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["avif"]
    },
    {
      name: "WebP alias",
      file: minimalWebp(),
      fileName: "clean-alias.webp",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式WEBP", "尺寸"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["webp"]
    },
    {
      name: "BMP raster alias",
      file: minimalBmp(),
      fileName: "clean-alias.bmp",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式BMP", "尺寸"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["bmp"]
    },
    {
      name: "ICO/CUR raster aliases",
      file: minimalCur(),
      fileName: "clean-alias.cur",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式CUR", "尺寸24 x 24px", "图像1"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["cur", "ico"]
    },
    {
      name: "HEIF/HEIC alias",
      file: minimalHeif(),
      fileName: "clean-alias.heif",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content",
      hiddenText: ["格式HEIF", "说明"],
      hiddenSelectors: [".ofv-image-info"],
      covers: ["heif", "heic"]
    },
    {
      name: "FLAC/Ogg/Opus audio aliases",
      file: minimalFlac(),
      fileName: "clean-alias.flac",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio",
      hiddenText: ["格式FLAC", "采样率", "声道"],
      hiddenSelectors: [".ofv-media-info"],
      covers: ["flac", "opus", "ogg", "oga", "weba", "au", "snd"]
    },
    {
      name: "AVI/WebM/HLS video aliases",
      file: minimalWebm(),
      fileName: "clean-alias.webm",
      plugins: [videoPlugin()],
      selector: ".ofv-video-stage video",
      hiddenText: ["格式WebM", "轨道"],
      hiddenSelectors: [".ofv-media-info"],
      covers: ["webm", "avi", "m3u8"]
    },
    {
      name: "CSV/TXT/IPYNB text aliases",
      file: new Blob([JSON.stringify({ cells: [], metadata: { project: "Open File Viewer" } }, null, 2)], {
        type: "application/x-ipynb+json"
      }),
      fileName: "clean-alias.ipynb",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      text: "Open File Viewer",
      hiddenText: ["结构Object", "键2"],
      hiddenSelectors: [".ofv-text-structure"],
      covers: ["txt", "gitignore", "ipynb", "csv"]
    },
    {
      name: "GIS aliases",
      file: minimalKmz,
      fileName: "clean-alias.kmz",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage",
      text: "要素1",
      hiddenText: ["属性字段", "字段预览"],
      hiddenSelectors: [".ofv-gis-summary"],
      covers: ["topojson", "kml", "gpx", "kmz", "shp"]
    },
    {
      name: "mailbox alias",
      file: minimalMbox(),
      fileName: "clean-alias.mbox",
      plugins: [emailPlugin()],
      selector: ".ofv-email",
      text: "Hello mailbox",
      hiddenText: ["邮箱归档", "邮件数量"],
      hiddenSelectors: [".ofv-email-header", ".ofv-email-attachments", ".ofv-email-mbox-summary"],
      covers: ["mbox"]
    },
    {
      name: "IFC/IGS CAD aliases",
      file: minimalIfc(),
      fileName: "clean-alias.ifc",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "IFC BIM",
      hiddenText: [],
      hiddenSelectors: [],
      covers: ["ifc", "igs"]
    },
    {
      name: "DWF fallback metadata",
      file: new Blob(["DWF\0PAGE\0LAYER A-ANNO\0"], { type: "model/vnd.dwf" }),
      fileName: "clean-alias.dwf",
      plugins: [cadPlugin()],
      selector: ".ofv-cad-conversion",
      text: "DWF 文件预览",
      hiddenText: [],
      hiddenSelectors: [],
      covers: ["dwf"]
    },
    {
      name: "legacy DOC conversion",
      file: legacyOfficeBlob(["Roadmap 2026", "Budget plan"]),
      fileName: "clean-alias.doc",
      plugins: [officePlugin()],
      selector: ".ofv-office-conversion",
      text: "Office 转换提示",
      hiddenText: [],
      hiddenSelectors: [],
      covers: ["doc"]
    },
    {
      name: "TLDRAW drawing alias",
      file: minimalTldraw(),
      fileName: "clean-alias.tldraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage",
      text: "对象",
      hiddenText: [],
      hiddenSelectors: [".ofv-drawing-summary"],
      covers: ["tldraw"]
    },
    {
      name: "TTF font alias",
      file: new Uint8Array([0x00, 0x01, 0x00, 0x00]).buffer,
      fileName: "clean-alias.ttf",
      plugins: [assetPlugin()],
      selector: ".ofv-font-preview",
      text: "字体样张",
      hiddenText: ["字体文件预览", "签名", "下载文件"],
      hiddenSelectors: [".ofv-asset-summary", ".ofv-asset-download"],
      covers: ["ttf"]
    },
    {
      name: "FBX model fallback",
      file: new Blob(["FBX"], { type: "application/vnd.autodesk.fbx" }),
      fileName: "clean-alias.fbx",
      plugins: [model3dPlugin()],
      selector: ".ofv-fallback",
      text: "3D 预览不可用",
      hiddenText: [],
      hiddenSelectors: [],
      allowFallback: true,
      covers: ["fbx"]
    }
  ];
}

function expectVisibleElements(root: HTMLElement, selector: string, caseName: string): void {
  const visible = [...root.querySelectorAll<HTMLElement>(selector)].filter((element) => !isElementHidden(element));
  expect(
    visible.map((element) => (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)),
    `${caseName} should not expose visible ${selector}`
  ).toHaveLength(0);
}

function expectSupplementalElementsHidden(root: HTMLElement, selector: string, caseName: string): void {
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    expect(element.hidden, `${caseName} should mark ${selector} as hidden`).toBe(true);
    expect(element.getAttribute("aria-hidden"), `${caseName} should remove ${selector} from accessibility tree`).toBe("true");
    expect(element.style.display, `${caseName} should hide ${selector} without depending on external CSS`).toBe("none");
  }
}

function isElementHidden(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      current.style.display === "none" ||
      current.style.visibility === "hidden"
    ) {
      return true;
    }
  }
  return false;
}

function toolbarButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>(".ofv-toolbar button")].find(
    (item) => item.getAttribute("aria-label") === label
  );
}

function nextRenderTick(timeout = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function expectSvgViewBoxReset(container: HTMLElement, selector: string, caseName: string): void {
  const svg = container.querySelector<SVGSVGElement>(selector);
  expect(svg, `${caseName} should render ${selector}`).not.toBeNull();
  const viewBox = svg?.getAttribute("viewBox") || "";
  expect(viewBox, `${caseName} should keep a numeric viewBox`).toMatch(/^-?\d/);
  expect(toolbarButton(container, "Reset zoom")?.textContent, `${caseName} should reset toolbar zoom`).toBe("100%");
}

function expectPdfPageRotated(
  container: HTMLElement,
  selector: string,
  caseName: string,
  options: { expectResetZoom?: boolean } = {}
): void {
  const wrapper = container.querySelector<HTMLElement>(selector);
  expect(wrapper, `${caseName} should render ${selector}`).not.toBeNull();
  const width = parseFloat(wrapper?.style.width || "0");
  const height = parseFloat(wrapper?.style.height || "0");
  expect(width, `${caseName} should keep rotated page width`).toBeGreaterThan(0);
  expect(height, `${caseName} should keep rotated page height`).toBeGreaterThan(0);
  expect(height, `${caseName} should rotate a landscape page into portrait layout`).toBeGreaterThan(width);
  if (options.expectResetZoom !== false) {
    expect(toolbarButton(container, "Reset zoom")?.textContent, `${caseName} should reset toolbar zoom`).toBe("100%");
  }
}

function visibleText(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node, hidden: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!hidden) {
        parts.push(node.textContent || "");
      }
      return;
    }
    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach((child) => walk(child, hidden));
      return;
    }
    const isHidden =
      hidden ||
      node.hidden ||
      node.getAttribute("aria-hidden") === "true" ||
      node.style.display === "none" ||
      node.style.visibility === "hidden";
    node.childNodes.forEach((child) => walk(child, isHidden));
  };
  walk(root, false);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extensionFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.startsWith(".") && lower.indexOf(".", 1) === -1) {
    return lower.slice(1);
  }
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index + 1) : "";
}

function collectCoveredExtensions(cases: SmokeCase[]): Set<string> {
  const covered = new Set<string>();
  for (const testCase of cases) {
    const extension = extensionFromFileName(testCase.fileName);
    if (extension) {
      covered.add(extension);
    }
    for (const explicit of testCase.covers || []) {
      covered.add(explicit.toLowerCase());
    }
  }
  return covered;
}

function readDetectedExtensions(): string[] {
  const source = readFileSync(resolve(process.cwd(), "packages/core/src/detect.ts"), "utf8");
  const mapBody = source.match(/const extensionMimeMap: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1];
  if (!mapBody) {
    throw new Error("Unable to find extensionMimeMap in detect.ts.");
  }
  return [...mapBody.matchAll(/^\s*(?:"([^"]+)"|([a-zA-Z0-9_]+)):\s*"/gm)]
    .map((match) => match[1] || match[2])
    .sort();
}

async function resolveSource(source: SmokeCase["file"]): Promise<PreviewSource> {
  return typeof source === "function" ? source() : source;
}

function mockRemoteFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.includes("/fixtures/remote.md")) {
    return Promise.resolve(
      new Response(new TextEncoder().encode("# Remote Markdown\n\nLoaded from a mocked public URL.").buffer, {
        status: 200,
        headers: { "content-type": "text/markdown" }
      })
    );
  }
  if (url.includes("/fixtures/photo.png")) {
    return Promise.resolve(new Response(minimalPng(), { status: 200, headers: { "content-type": "image/png" } }));
  }
  if (url.includes("/fixtures/tone.wav")) {
    return responseFromSource(minimalWav(), "audio/wav");
  }
  if (url.includes("/fixtures/movie.mp4")) {
    return responseFromSource(minimalMp4(), "video/mp4");
  }
  if (url.includes("/fixtures/document.pdf")) {
    return responseFromSource(new Blob(["%PDF-1.7\n"], { type: "application/pdf" }), "application/pdf");
  }
  if (url.includes("/fixtures/report.docx")) {
    return responseFromSource(minimalDocx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }
  if (url.includes("/fixtures/sheet.xlsx")) {
    return responseFromSource(minimalXlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  if (url.includes("/fixtures/sheet.dwf")) {
    return responseFromSource(new Blob(["DWF\0PAGE\0LAYER A-ANNO\0"], { type: "model/vnd.dwf" }), "model/vnd.dwf");
  }
  if (url.includes("/fixtures/slides.pptx")) {
    return responseFromSource(minimalPptx(), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  }
  if (url.includes("/fixtures/document.odt")) {
    return responseFromSource(minimalOdt(), "application/vnd.oasis.opendocument.text");
  }
  if (url.includes("/fixtures/deck.odp")) {
    return responseFromSource(minimalOdp(), "application/vnd.oasis.opendocument.presentation");
  }
  if (url.includes("/fixtures/book.epub")) {
    return responseFromSource(minimalEpub(), "application/epub+zip");
  }
  if (url.includes("/fixtures/pages.xps")) {
    return responseFromSource(minimalXps(), "application/vnd.ms-xpsdocument");
  }
  if (url.includes("/fixtures/invoice.ofd")) {
    return responseFromSource(minimalOfd(), "application/ofd");
  }
  if (url.includes("/fixtures/floor-plan.dxf")) {
    return responseFromSource(minimalDxf(), "image/vnd.dxf");
  }
  if (url.includes("/fixtures/part.step")) {
    return responseFromSource(new Blob([minimalStep()], { type: "model/step" }), "model/step");
  }
  if (url.includes("/fixtures/chip.gds")) {
    return responseFromSource(minimalGds(), "application/gdsii");
  }
  if (url.includes("/fixtures/chip.oas")) {
    return responseFromSource(minimalOasis(), "application/vnd.oasis-open");
  }
  if (url.includes("/fixtures/map.geojson")) {
    return responseFromSource(
      new Blob([JSON.stringify({ type: "FeatureCollection", features: [] })], { type: "application/geo+json" }),
      "application/geo+json"
    );
  }
  if (url.includes("/fixtures/place.kmz")) {
    return responseFromSource(minimalKmz(), "application/vnd.google-earth.kmz");
  }
  if (url.includes("/fixtures/scene.glb")) {
    return responseFromSource(new Blob(["glb"], { type: "model/gltf-binary" }), "model/gltf-binary");
  }
  if (url.includes("/fixtures/vector.ai")) {
    return responseFromSource(
      new Blob(["%!PS-Adobe-3.0\n%%Title: Remote Wrapped AI\n%%Creator: Illustrator\n%%AI8_CreatorVersion: 28\n", "%PDF-1.7\n%%Title: Remote AI\n"], {
        type: "application/postscript"
      }),
      "application/postscript"
    );
  }
  if (url.includes("/fixtures/poster.psd")) {
    return responseFromSource(
      minimalPsdHeader({ width: 120, height: 80, channels: 4, depth: 8, colorMode: 3 }),
      "image/vnd.adobe.photoshop"
    );
  }
  if (url.includes("/fixtures/data.sqlite")) {
    return responseFromSource(minimalSqlite(), "application/vnd.sqlite3");
  }
  if (url.includes("/fixtures/events.parquet")) {
    return responseFromSource(minimalParquet(), "application/vnd.apache.parquet");
  }
  if (url.includes("/fixtures/events.avro")) {
    return responseFromSource(minimalAvro(), "application/avro");
  }
  if (url.includes("/fixtures/page.webarchive")) {
    return responseFromSource(minimalBinaryWebArchive(), "application/x-webarchive");
  }
  if (url.includes("/fixtures/module.wasm")) {
    return responseFromSource(minimalWasm(), "application/wasm");
  }
  if (url.includes("/fixtures/brand.woff2")) {
    return responseFromSource(minimalWoff2(), "font/woff2");
  }
  if (url.includes("/fixtures/message.eml")) {
    return responseFromSource(minimalEmail(), "message/rfc822");
  }
  if (url.includes("/fixtures/diagram.drawio")) {
    return responseFromSource(minimalDrawio(), "application/vnd.jgraph.mxfile");
  }
  if (url.includes("/fixtures/bundle.zip")) {
    return responseFromSource(minimalCommandZip(), "application/zip");
  }
  return nativeFetch(input);
}

async function responseFromSource(source: Blob | ArrayBuffer | Promise<Blob | ArrayBuffer>, contentType: string): Promise<Response> {
  const resolved = await source;
  const body = resolved instanceof Blob ? await resolved.arrayBuffer() : resolved;
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType }
  });
}

function workbookCsv(): Blob {
  return new Blob(["name,score\nAlice,100"], { type: "text/csv" });
}

function audioAliasMime(extension: string): string {
  const map: Record<string, string> = {
    aac: "audio/aac",
    m4a: "audio/mp4",
    oga: "audio/ogg",
    weba: "audio/webm",
    amr: "audio/amr",
    aif: "audio/aiff",
    aiff: "audio/aiff",
    aifc: "audio/aiff",
    caf: "audio/x-caf",
    mid: "audio/midi",
    midi: "audio/midi",
    snd: "audio/basic",
    wma: "audio/x-ms-wma"
  };
  return map[extension] || "audio/mpeg";
}

function modelAliasMime(extension: string): string {
  const map: Record<string, string> = {
    gltf: "model/gltf+json",
    obj: "model/obj",
    stl: "model/stl",
    dae: "model/vnd.collada+xml",
    ply: "application/ply",
    "3mf": "model/3mf",
    "3ds": "model/3ds",
    usd: "model/vnd.usd",
    usda: "model/vnd.usd",
    usdc: "model/vnd.usd",
    usdz: "model/vnd.usdz+zip",
    wrl: "model/vrml",
    vrml: "model/vrml"
  };
  return map[extension] || "application/octet-stream";
}

function minimalPng(options: { fileType?: string; frames?: number } = {}): Blob {
  const ihdr = [
    ...uint32Be(13),
    ...ascii("IHDR"),
    ...uint32Be(320),
    ...uint32Be(180),
    8,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  ];
  const animationChunk = options.frames
    ? [...uint32Be(8), ...ascii("acTL"), ...uint32Be(options.frames), ...uint32Be(0), 0, 0, 0, 0]
    : [];
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...animationChunk])], {
    type: options.fileType || "image/png"
  });
}

function minimalMp4(): Blob {
  const ftyp = mp4Atom("ftyp", [...ascii("isom"), 0, 0, 0, 1, ...ascii("isom")]);
  const mvhd = mp4Atom("mvhd", [
    0,
    0,
    0,
    0,
    ...uint32Be(0),
    ...uint32Be(0),
    ...uint32Be(1000),
    ...uint32Be(1000),
    ...new Array(80).fill(0)
  ]);
  const moov = mp4Atom("moov", mvhd);
  return new Blob([new Uint8Array([...ftyp, ...moov])], { type: "video/mp4" });
}

function minimalWav(): Blob {
  const sampleRate = 44100;
  const channels = 2;
  const bitDepth = 16;
  const dataSize = sampleRate * channels * (bitDepth / 8);
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("RIFF"), 0);
  view.setUint32(4, 36 + dataSize, true);
  bytes.set(ascii("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
  view.setUint16(32, channels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  bytes.set(ascii("data"), 36);
  view.setUint32(40, dataSize, true);
  return new Blob([bytes], { type: "audio/wav" });
}

function minimalFlac(): Blob {
  const bytes = new Uint8Array(4 + 4 + 34);
  bytes.set(ascii("fLaC"), 0);
  bytes[4] = 0x80;
  bytes[7] = 0x22;
  const streamInfo = bytes.subarray(8);
  const sampleRate = 48000;
  const totalSamples = 48000n;
  streamInfo[10] = (sampleRate >>> 12) & 0xff;
  streamInfo[11] = (sampleRate >>> 4) & 0xff;
  streamInfo[12] = ((sampleRate & 0x0f) << 4) | (1 << 1) | 1;
  streamInfo[13] = (7 << 4) | Number((totalSamples >> 32n) & 0x0fn);
  streamInfo[14] = Number((totalSamples >> 24n) & 0xffn);
  streamInfo[15] = Number((totalSamples >> 16n) & 0xffn);
  streamInfo[16] = Number((totalSamples >> 8n) & 0xffn);
  streamInfo[17] = Number(totalSamples & 0xffn);
  return new Blob([bytes], { type: "audio/flac" });
}

function minimalOggOpus(): Blob {
  const opusHead = [
    ...ascii("OpusHead"),
    1,
    2,
    ...uint16Le(312),
    ...uint32Le(48000),
    ...uint16Le(0),
    0
  ];
  return new Blob(
    [new Uint8Array([...oggPage({ granule: 0n, sequence: 0, packets: [opusHead] }), ...oggPage({ granule: 96312n, sequence: 1, packets: [[0xf8, 0xff, 0xfe]] })])],
    { type: "audio/ogg" }
  );
}

function minimalAu(): Blob {
  const sampleRate = 8000;
  const dataSize = sampleRate;
  const bytes = new Uint8Array(24 + dataSize);
  bytes.set(ascii(".snd"), 0);
  bytes.set(uint32Be(24), 4);
  bytes.set(uint32Be(dataSize), 8);
  bytes.set(uint32Be(1), 12);
  bytes.set(uint32Be(sampleRate), 16);
  bytes.set(uint32Be(1), 20);
  bytes.fill(0xff, 24);
  return new Blob([bytes], { type: "audio/basic" });
}

function minimalMp4Detailed(): Blob {
  const ftyp = mp4Atom("ftyp", [...ascii("isom"), 0, 0, 0, 1, ...ascii("isom")]);
  const mvhd = mp4Atom("mvhd", [0, 0, 0, 0, ...uint32Be(0), ...uint32Be(0), ...uint32Be(1000), ...uint32Be(12000), ...new Array(80).fill(0)]);
  const tkhdPayload = new Array(84).fill(0);
  tkhdPayload.splice(72, 4, ...uint32Be(1920 * 65536));
  tkhdPayload.splice(76, 4, ...uint32Be(1080 * 65536));
  const moov = mp4Atom("moov", [...mvhd, ...mp4Atom("trak", mp4Atom("tkhd", tkhdPayload))]);
  return new Blob([new Uint8Array([...ftyp, ...moov])], { type: "video/mp4" });
}

function minimalAvi(): Blob {
  const bytes = new Uint8Array(12 + 8 + 56);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(ascii("AVI "), 8);
  bytes.set(ascii("avih"), 12);
  view.setUint32(16, 56, true);
  view.setUint32(20, 33333, true);
  view.setUint32(28, 800000, true);
  view.setUint32(36, 300, true);
  view.setUint32(44, 2, true);
  view.setUint32(52, 640, true);
  view.setUint32(56, 360, true);
  return new Blob([bytes], { type: "video/x-msvideo" });
}

function minimalWebm(): Blob {
  const header = ebmlElement(0x1a45dfa3, [
    ...ebmlElement(0x4286, [1]),
    ...ebmlElement(0x42f7, [1]),
    ...ebmlElement(0x4282, ascii("webm")),
    ...ebmlElement(0x4287, [4]),
    ...ebmlElement(0x4285, [2])
  ]);
  const info = ebmlElement(0x1549a966, [
    ...ebmlElement(0x2ad7b1, [0x0f, 0x42, 0x40]),
    ...ebmlElement(0x4489, float64Be(12250))
  ]);
  const videoTrack = ebmlElement(0xae, [
    ...ebmlElement(0xd7, [1]),
    ...ebmlElement(0x83, [1]),
    ...ebmlElement(0x86, ascii("V_VP9")),
    ...ebmlElement(0xe0, [...ebmlElement(0xb0, [0x05, 0x00]), ...ebmlElement(0xba, [0x02, 0xd0])])
  ]);
  const audioTrack = ebmlElement(0xae, [...ebmlElement(0xd7, [2]), ...ebmlElement(0x83, [2]), ...ebmlElement(0x86, ascii("A_OPUS"))]);
  return new Blob([new Uint8Array([...header, ...ebmlElement(0x18538067, [...info, ...ebmlElement(0x1654ae6b, [...videoTrack, ...audioTrack])])])], {
    type: "video/webm"
  });
}

function minimalHls(): Blob {
  return new Blob([["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=2500000", "hi/prog.m3u8", "#EXTINF:4.0,", "seg1.ts", "#EXTINF:5.5,", "seg2.ts"].join("\n")], {
    type: "application/vnd.apple.mpegurl"
  });
}

function mp4Atom(type: string, payload: number[]): number[] {
  return [...uint32Be(payload.length + 8), ...ascii(type), ...payload];
}

function minimalTiff(): Blob {
  const bytes = new Uint8Array(8 + 2 + 3 * 12 + 4);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 0x2a, 0x00]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 3, true);
  writeTiffEntry(view, 10, 256, 2);
  writeTiffEntry(view, 22, 257, 1);
  writeTiffEntry(view, 34, 258, 8);
  view.setUint32(46, 0, true);
  return new Blob([bytes], { type: "image/tiff" });
}

function minimalJpeg(): Blob {
  return new Blob(
    [
      new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xc0,
        0x00,
        0x11,
        0x08,
        0x00,
        0x78,
        0x00,
        0xa0,
        0x03,
        0x01,
        0x11,
        0x00,
        0x02,
        0x11,
        0x00,
        0x03,
        0x11,
        0x00,
        0xff,
        0xd9
      ])
    ],
    { type: "image/jpeg" }
  );
}

function minimalGif(): Blob {
  return new Blob(
    [
      new Uint8Array([
        ...ascii("GIF89a"),
        0x40,
        0x00,
        0x20,
        0x00,
        0x80,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0xff,
        0xff,
        0xff,
        0x2c,
        0,
        0,
        0,
        0,
        1,
        0,
        1,
        0,
        0,
        0x02,
        0x02,
        0x44,
        0x01,
        0,
        0x3b
      ])
    ],
    { type: "image/gif" }
  );
}

function minimalWebp(): Blob {
  const payload = [
    ...ascii("VP8X"),
    ...uint32Le(10),
    0x10,
    0,
    0,
    0,
    ...uint24Le(319),
    ...uint24Le(179)
  ];
  return new Blob([new Uint8Array([...ascii("RIFF"), ...uint32Le(payload.length + 4), ...ascii("WEBP"), ...payload])], {
    type: "image/webp"
  });
}

function minimalBmp(): Blob {
  const bytes = new Uint8Array(54);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("BM"), 0);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, 48, true);
  view.setInt32(22, 24, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  return new Blob([bytes], { type: "image/bmp" });
}

function minimalCur(): Blob {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 2, true);
  view.setUint16(4, 1, true);
  bytes[6] = 24;
  bytes[7] = 24;
  view.setUint16(10, 4, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, 4, true);
  view.setUint32(18, bytes.length, true);
  return new Blob([bytes], { type: "image/x-icon" });
}

function minimalSvg(): Blob {
  return new Blob(
    ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><text x="8" y="24">SVG smoke</text></svg>'],
    { type: "image/svg+xml" }
  );
}

function minimalJxl(): Blob {
  return new Blob([new Uint8Array([0xff, 0x0a, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])], {
    type: "image/jxl"
  });
}

function minimalHeif(): Blob {
  const ftyp = bmffBox("ftyp", [
    ...ascii("heic"),
    ...uint32Be(0),
    ...ascii("mif1"),
    ...ascii("heic")
  ]);
  const ispe = bmffBox("ispe", [
    0,
    0,
    0,
    0,
    ...uint32Be(800),
    ...uint32Be(600)
  ]);
  const meta = bmffBox("meta", [0, 0, 0, 0, ...bmffBox("iprp", bmffBox("ipco", ispe))]);
  return new Blob([new Uint8Array([...ftyp, ...meta])], { type: "image/heif" });
}

function minimalAvif(): Blob {
  const ftyp = bmffBox("ftyp", [
    ...ascii("avif"),
    ...uint32Be(0),
    ...ascii("mif1"),
    ...ascii("avif")
  ]);
  const ispe = bmffBox("ispe", [
    0,
    0,
    0,
    0,
    ...uint32Be(640),
    ...uint32Be(360)
  ]);
  const meta = bmffBox("meta", [0, 0, 0, 0, ...bmffBox("iprp", bmffBox("ipco", ispe))]);
  return new Blob([new Uint8Array([...ftyp, ...meta])], { type: "image/avif" });
}

function writeTiffEntry(view: DataView, offset: number, tag: number, value: number): void {
  view.setUint16(offset, tag, true);
  view.setUint16(offset + 2, 3, true);
  view.setUint32(offset + 4, 1, true);
  view.setUint16(offset + 8, value, true);
}

async function minimalDocx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>DOCX smoke paragraph</w:t></w:r></w:p></w:body>
    </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function minimalOdt(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("content.xml", minimalFlatOdtXml("ODT smoke paragraph"));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.oasis.opendocument.text"
  });
}

async function minimalXlsx(): Promise<ArrayBuffer> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([
    ["Name", "Score", "Notes"],
    ["AliceWithVeryLongUnbrokenNameThatShouldStayInsideTheTableScrollRegion", 100, "ok"]
  ]);
  xlsx.utils.book_append_sheet(workbook, sheet, "VeryLongSheetNameForNarrowUI");
  return xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function minimalFlatOdsXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
      xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
      <office:body><office:spreadsheet>
        <table:table table:name="Budget">
          <table:table-row><table:table-cell><text:p>${text}</text:p></table:table-cell></table:table-row>
        </table:table>
      </office:spreadsheet></office:body>
    </office:document>`;
}

async function minimalNumbers(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("index/document.iwa", "numbers smoke");
  zip.file(
    "Metadata/properties.plist",
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Title</key><string>Numbers smoke</string></dict></plist>`
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

async function minimalPptx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>PPTX smoke slide</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree></p:cSld>
      </p:sld>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });
}

async function minimalOdp(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("content.xml", minimalFlatOdpXml("ODP smoke slide"));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.oasis.opendocument.presentation"
  });
}

function minimalFlatOdtXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
      <office:body><office:text><text:p>${text}</text:p></office:text></office:body>
    </office:document>`;
}

function minimalFlatOdpXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
      xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
      <office:body><office:presentation>
        <presentation:page presentation:name="Slide 1"><text:p>${text}</text:p></presentation:page>
      </office:presentation></office:body>
    </office:document>`;
}

async function minimalZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("readme.txt", "Hello archive");
  return zip.generateAsync({ type: "arraybuffer" });
}

async function minimalCommandZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("commands.js", "const value = 1;\nconsole.log(value);");
  return zip.generateAsync({ type: "arraybuffer" });
}

function minimalTar(): ArrayBuffer {
  const content = new TextEncoder().encode("Hello tar archive");
  const header = new Uint8Array(512);
  const name = ascii("readme.txt");
  header.set(name, 0);
  header.set(ascii("0000644\0"), 100);
  header.set(ascii("0000000\0"), 108);
  header.set(ascii("0000000\0"), 116);
  header.set(ascii(content.length.toString(8).padStart(11, "0") + "\0"), 124);
  header.set(ascii("00000000000\0"), 136);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.set(ascii("ustar\0"), 257);
  header.set(ascii("00"), 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.set(ascii(checksum.toString(8).padStart(6, "0") + "\0 "), 148);
  const paddedSize = Math.ceil(content.length / 512) * 512;
  const fileBlock = new Uint8Array(paddedSize);
  fileBlock.set(content);
  return new Uint8Array([...header, ...fileBlock, ...new Uint8Array(1024)]).buffer;
}

function minimalGzipText(asTar = false): ArrayBuffer {
  const payload = asTar ? new Uint8Array(minimalTar()) : new TextEncoder().encode("Hello gzip archive");
  return toExactArrayBuffer(pako.gzip(payload));
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function minimalKmz(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("doc.kml", "<kml><Placemark><name>KML Place</name></Placemark></kml>");
  return zip.generateAsync({ type: "arraybuffer" });
}

async function minimalEpub(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml" />
      </rootfiles>
    </container>`
  );
  zip.file(
    "OPS/package.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Smoke EPUB</dc:title>
      </metadata>
      <manifest>
        <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml" />
      </manifest>
      <spine>
        <itemref idref="c1" />
      </spine>
    </package>`
  );
  zip.file("OPS/chapter.xhtml", "<html><body><h1>Smoke EPUB</h1></body></html>");
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

async function minimalXps(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "Documents/1/Pages/1.fpage",
    `<FixedPage xmlns="http://schemas.microsoft.com/xps/2005/06" Width="800" Height="600">
      <Glyphs UnicodeString="Hello XPS" />
    </FixedPage>`
  );
  zip.file("FixedDocSeq.fdseq", "<FixedDocumentSequence />");
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.ms-xpsdocument" });
}

async function minimalOfd(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "Doc_0/Pages/Page_0/Content.xml",
    `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
      <ofd:Content>
        <ofd:Layer>
          <ofd:TextObject Boundary="20 30 120 16" Size="12">
            <ofd:TextCode X="0" Y="0">OFD 文本</ofd:TextCode>
          </ofd:TextObject>
        </ofd:Layer>
      </ofd:Content>
    </ofd:Page>`
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

function minimalEmail(): Blob {
  return new Blob(
    [
      [
        "From: sender@example.com",
        "To: viewer@example.com",
        "Subject: Hello email",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Hello email body"
      ].join("\r\n")
    ],
    { type: "message/rfc822" }
  );
}

function minimalHtmlEmail(): Blob {
  return new Blob(
    [
      [
        "From: sender@example.com",
        "To: viewer@example.com",
        "Subject: HTML email",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<p>HTML email body</p>"
      ].join("\r\n")
    ],
    { type: "message/rfc822" }
  );
}

function minimalMbox(): Blob {
  return new Blob(
    [
      [
        "From sender@example.com Fri Jun 19 19:00:00 2026",
        "From: sender@example.com",
        "To: viewer@example.com",
        "Subject: Hello mailbox",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Hello mailbox body"
      ].join("\n")
    ],
    { type: "application/mbox" }
  );
}

function sampleBzip2Text(): ArrayBuffer {
  return new Uint8Array([
    0x42, 0x5a, 0x68, 0x39, 0x31, 0x41, 0x59, 0x26, 0x53, 0x59, 0x91, 0x38,
    0x45, 0x8f, 0x00, 0x00, 0x03, 0xd9, 0x80, 0x00, 0x10, 0x40, 0x00, 0x10,
    0x00, 0x13, 0x46, 0x90, 0x10, 0x20, 0x00, 0x22, 0x1a, 0x00, 0x68, 0x40,
    0xd0, 0x34, 0x1b, 0x34, 0xce, 0x8a, 0xce, 0xa0, 0x49, 0xf1, 0x77, 0x24,
    0x53, 0x85, 0x09, 0x09, 0x13, 0x84, 0x58, 0xf0
  ]).buffer;
}

function sampleXzText(): ArrayBuffer {
  return new Uint8Array([
    253, 55, 122, 88, 90, 0, 0, 4, 230, 214, 180, 70, 2, 0, 33, 1, 22, 0,
    0, 0, 116, 47, 229, 163, 1, 0, 13, 104, 101, 108, 108, 111, 32, 102, 114,
    111, 109, 32, 120, 122, 10, 0, 0, 0, 91, 249, 134, 221, 230, 39, 122,
    230, 0, 1, 38, 14, 8, 27, 224, 4, 31, 182, 243, 125, 1, 0, 0, 0, 0, 4,
    89, 90
  ]).buffer;
}

function minimalDrawio(): Blob {
  return new Blob(
    [
      `<mxfile><diagram name="Draw.io">
        <mxGraphModel><root>
          <mxCell id="0" />
          <mxCell id="1" parent="0" />
          <mxCell id="2" value="Draw.io" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
            <mxGeometry x="20" y="20" width="120" height="60" as="geometry" />
          </mxCell>
        </root></mxGraphModel>
      </diagram></mxfile>`
    ],
    { type: "application/vnd.jgraph.mxfile" }
  );
}

function minimalTldraw(): Blob {
  return new Blob(
    [
      JSON.stringify({
        records: [
          { id: "page:page", typeName: "page", name: "Page 1" },
          {
            id: "shape:box",
            typeName: "shape",
            type: "geo",
            parentId: "page:page",
            x: 10,
            y: 20,
            props: { w: 120, h: 64, geo: "rectangle", color: "blue", fill: "solid", text: "tldraw" }
          }
        ]
      })
    ],
    { type: "application/json" }
  );
}

function minimalDxf(): Blob {
  return new Blob(
    [
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "LINE",
        "8",
        "Walls",
        "10",
        "0",
        "20",
        "0",
        "11",
        "100",
        "21",
        "100",
        "0",
        "ENDSEC",
        "0",
        "EOF"
      ].join("\n")
    ],
    { type: "image/vnd.dxf" }
  );
}

function minimalIfc(): Blob {
  return new Blob(
    [
      [
        "ISO-10303-21;",
        "DATA;",
        "#1 = IFCPROJECT('0PROJECT',$,'Smoke Project',$,$,$,$,$);",
        "#2 = IFCBUILDING('0BLDG',$,'Smoke Building',$,$,$,$,$,$,$,$,$);",
        "#3 = IFCBUILDINGSTOREY('0STOREY',$,'Ground Floor',$,$,$,$,$,$);",
        "#4 = IFCWALL('0WALL',$,'Smoke Wall',$,$,$,$,$);",
        "ENDSEC;",
        "END-ISO-10303-21;"
      ].join("\n")
    ],
    { type: "application/x-step" }
  );
}

function minimalStep(): string {
  return [
    "ISO-10303-21;",
    "DATA;",
    "#1 = CARTESIAN_POINT('P1',(1.,2.,3.));",
    "#2 = DIRECTION('D1',(0.,0.,1.));",
    "#3 = LINE('L1',#1,#2);",
    "ENDSEC;",
    "END-ISO-10303-21;"
  ].join("\n");
}

function minimalIges(): string {
  return [
    "                                                                        S      1",
    "116,1.0,2.0,3.0;                                                        P      1",
    "110,0.0,0.0,0.0,10.0,0.0,0.0;                                           P      2"
  ].join("\n");
}

function minimalSat(): string {
  return [
    "700 0 1 0",
    "0 vertex $-1 0 0 0 #",
    "1 vertex $-1 100 0 0 #",
    "2 straight-curve $-1 0 0 0 1 0 0 #",
    "End-of-ACIS-data"
  ].join("\n");
}

function minimalParasolidText(): string {
  return [
    "BEGIN HEADER;",
    "#1=point(0,0,0);",
    "#2=point(120,0,0);",
    "#3=line(0,0,0,120,0,0);",
    "END;"
  ].join("\n");
}

function minimalDwg(): ArrayBuffer {
  return new Uint8Array(
    [..."AC1027\0\0DWGDATA\0LINE\0LAYER A-WALL\0BLOCK Door\0XREF site.dwg\0"].map((char) => char.charCodeAt(0))
  ).buffer;
}

function minimalGds(): ArrayBuffer {
  const records: number[] = [
    ...gdsRecord(0x0002, [0x00, 0x07]),
    ...gdsRecord(0x0102, new Array(24).fill(0)),
    ...gdsRecord(0x0206, [...ascii("SMOKE"), 0]),
    ...gdsRecord(0x0305, new Array(16).fill(0)),
    ...gdsRecord(0x0502, []),
    ...gdsRecord(0x0606, [...ascii("TOP"), 0]),
    ...gdsRecord(0x0800, []),
    ...gdsRecord(0x0d02, [0x00, 0x01]),
    ...gdsRecord(0x0e02, [0x00, 0x00]),
    ...gdsRecord(0x1003, [
      ...int32Be(0),
      ...int32Be(0),
      ...int32Be(1000),
      ...int32Be(0),
      ...int32Be(1000),
      ...int32Be(1000),
      ...int32Be(0),
      ...int32Be(1000),
      ...int32Be(0),
      ...int32Be(0)
    ]),
    ...gdsRecord(0x1100, []),
    ...gdsRecord(0x0700, []),
    ...gdsRecord(0x0400, [])
  ];
  return new Uint8Array(records).buffer;
}

function minimalOasis(): ArrayBuffer {
  const compressed = new Uint8Array([
    0x63, 0x66, 0x0e, 0xf1, 0x0f, 0x60, 0xe6, 0x70, 0xf1, 0x74, 0x8d, 0x0f,
    0xf6, 0x8c, 0x72, 0x05, 0x00
  ]);
  const prefix = [..."%SEMI-OASIS\r\n"].map((char) => char.charCodeAt(0));
  return new Uint8Array([...prefix, 0x01, 0x03, 0x31, 0x2e, 0x30, 0x00, 0x21, ...compressed, 0x02]).buffer;
}

function gdsRecord(type: number, payload: number[]): number[] {
  return [...uint16Be(payload.length + 4), (type >>> 8) & 0xff, type & 0xff, ...payload];
}

function minimalWoff(): ArrayBuffer {
  const bytes = new Uint8Array(44 + 20);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("wOFF"), 0);
  bytes.set(ascii("\0\x01\0\0"), 4);
  view.setUint32(8, bytes.length, false);
  view.setUint16(12, 1, false);
  view.setUint32(16, 12, false);
  bytes.set(ascii("name"), 44);
  view.setUint32(48, 64, false);
  view.setUint32(52, 0, false);
  view.setUint32(56, 0, false);
  view.setUint32(60, 0, false);
  return bytes.buffer;
}

function minimalWoff2(): ArrayBuffer {
  const bytes = new Uint8Array(50);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("wOF2"), 0);
  bytes.set(ascii("\0\x01\0\0"), 4);
  view.setUint32(8, bytes.length, false);
  view.setUint16(12, 1, false);
  view.setUint32(16, 12, false);
  view.setUint32(20, 0, false);
  bytes[48] = 0x06;
  bytes[49] = 0x01;
  return bytes.buffer;
}

function minimalEot(): ArrayBuffer {
  const bytes = new Uint8Array(82);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length, true);
  view.setUint32(4, 0, true);
  view.setUint32(8, 0x00020001, true);
  view.setUint32(28, 400, true);
  return bytes.buffer;
}

function minimalSqlite(): ArrayBuffer {
  const pageSize = 512;
  const bytes = new Uint8Array(pageSize * 2);
  bytes.set(ascii("SQLite format 3\0"), 0);
  bytes[16] = 0x02;
  bytes[17] = 0x00;
  bytes[18] = 0x01;
  bytes[19] = 0x01;
  bytes[20] = 0x00;
  bytes[21] = 0x40;
  bytes[22] = 0x20;
  bytes[23] = 0x20;
  setUint32Be(bytes, 28, 2);
  setUint32Be(bytes, 40, 1);
  setUint32Be(bytes, 56, 1);

  const createSql = "CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT)";
  const schemaRecord = sqliteRecord([
    { type: 23, value: "table" },
    { type: 23, value: "users" },
    { type: 23, value: "users" },
    { type: 1, value: 2 },
    { type: 13 + 2 * createSql.length, value: createSql }
  ]);
  const schemaCell = [...sqliteVarUint(schemaRecord.length), ...sqliteVarUint(1), ...schemaRecord];
  const schemaCellOffset = pageSize - schemaCell.length;
  bytes[100] = 0x0d;
  setUint16Be(bytes, 103, 1);
  setUint16Be(bytes, 105, schemaCellOffset);
  setUint16Be(bytes, 108, schemaCellOffset);
  bytes.set(schemaCell, schemaCellOffset);

  const rowRecord = sqliteRecord([
    { type: 0, value: 0 },
    { type: 23, value: "Alice" }
  ]);
  const rowCell = [...sqliteVarUint(rowRecord.length), ...sqliteVarUint(1), ...rowRecord];
  const rowPageStart = pageSize;
  const rowCellOffset = pageSize - rowCell.length;
  bytes[rowPageStart] = 0x0d;
  setUint16Be(bytes, rowPageStart + 3, 1);
  setUint16Be(bytes, rowPageStart + 5, rowCellOffset);
  setUint16Be(bytes, rowPageStart + 8, rowCellOffset);
  bytes.set(rowCell, rowPageStart + rowCellOffset);
  return bytes.buffer;
}

function minimalPsdHeader({
  version = 1,
  width,
  height,
  channels,
  depth,
  colorMode
}: {
  version?: number;
  width: number;
  height: number;
  channels: number;
  depth: number;
  colorMode: number;
}): ArrayBuffer {
  const bytes = new Uint8Array(26);
  bytes.set(ascii("8BPS"), 0);
  setUint16Be(bytes, 4, version);
  setUint16Be(bytes, 12, channels);
  setUint32Be(bytes, 14, height);
  setUint32Be(bytes, 18, width);
  setUint16Be(bytes, 22, depth);
  setUint16Be(bytes, 24, colorMode);
  return bytes.buffer;
}

function minimalAvro(): ArrayBuffer {
  const schema = JSON.stringify({
    type: "record",
    name: "Event",
    fields: [
      { name: "id", type: "long" },
      { name: "name", type: "string" }
    ]
  });
  const metadata = [
    { key: "avro.schema", value: schema },
    { key: "avro.codec", value: "null" }
  ];
  const sync = Array.from({ length: 16 }, (_, index) => index);
  const body = [...avroLong(1), ...avroBytes("Launch")];
  return new Uint8Array([
    0x4f,
    0x62,
    0x6a,
    0x01,
    ...avroLong(metadata.length),
    ...metadata.flatMap((item) => [...avroBytes(item.key), ...avroBytes(item.value)]),
    ...avroLong(0),
    ...sync,
    ...avroLong(1),
    ...avroLong(body.length),
    ...body,
    ...sync
  ]).buffer;
}

function minimalParquet(): ArrayBuffer {
  return new Uint8Array([
    ...ascii("PAR1"),
    0x01,
    0x02,
    0x03,
    0x04,
    0x04,
    0x00,
    0x00,
    0x00,
    ...ascii("PAR1")
  ]).buffer;
}

function minimalBinaryWebArchive(): ArrayBuffer {
  const mainHtml = "<html><body><h1>Hello Binary WebArchive</h1></body></html>";
  return encodeBinaryWebArchive({
    WebMainResource: {
      WebResourceURL: "https://example.com/binary",
      WebResourceMIMEType: "text/html",
      WebResourceTextEncodingName: "UTF-8",
      WebResourceData: new TextEncoder().encode(mainHtml)
    }
  });
}

function minimalWasm(): ArrayBuffer {
  const bytes = [
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...wasmSection(1, [
      0x01,
      0x60,
      0x00,
      0x00
    ]),
    ...wasmSection(2, [
      0x01,
      ...wasmName("env"),
      ...wasmName("log"),
      0x00,
      0x00
    ]),
    ...wasmSection(3, [
      0x01,
      0x00
    ]),
    ...wasmSection(7, [
      0x01,
      ...wasmName("run"),
      0x00,
      0x01
    ]),
    ...wasmSection(10, [
      0x01,
      0x02,
      0x00,
      0x0b
    ]),
    ...wasmSection(0, [
      ...wasmName("name")
    ])
  ];
  return new Uint8Array(bytes).buffer;
}

function wasmSection(id: number, payload: number[]): number[] {
  return [id, ...wasmVarUint(payload.length), ...payload];
}

function wasmName(value: string): number[] {
  const encoded = new TextEncoder().encode(value);
  return [...wasmVarUint(encoded.length), ...encoded];
}

function wasmVarUint(value: number): number[] {
  const bytes: number[] = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}

function legacyOfficeBlob(fragments: string[]): Blob {
  const signature = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const chunks: BlobPart[] = [toBlobPart(signature), "\0\0"];
  for (const fragment of fragments) {
    chunks.push(`\0${fragment}\0`);
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

type BinaryPlistInput = string | Uint8Array | BinaryPlistInput[] | { [key: string]: BinaryPlistInput };

function encodeBinaryWebArchive(value: BinaryPlistInput): ArrayBuffer {
  const objects: number[][] = [];
  const encodeObject = (item: BinaryPlistInput): number => {
    const index = objects.length;
    objects.push([]);
    if (typeof item === "string") {
      const data = ascii(item);
      objects[index] = [...binaryPlistMarker(0x5, data.length), ...data];
      return index;
    }
    if (ArrayBuffer.isView(item)) {
      const data = new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
      objects[index] = [...binaryPlistMarker(0x4, data.byteLength), ...data];
      return index;
    }
    if (Array.isArray(item)) {
      const refs = item.map(encodeObject);
      objects[index] = [...binaryPlistMarker(0xa, refs.length), ...refs];
      return index;
    }
    const entries = Object.entries(item);
    const keyRefs = entries.map(([key]) => encodeObject(key));
    const valueRefs = entries.map(([, entryValue]) => encodeObject(entryValue));
    objects[index] = [...binaryPlistMarker(0xd, entries.length), ...keyRefs, ...valueRefs];
    return index;
  };
  const rootRef = encodeObject(value);
  const header = ascii("bplist00");
  const objectBytes = objects.flat();
  const offsets: number[] = [];
  let offset = header.length;
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }
  return new Uint8Array([
    ...header,
    ...objectBytes,
    ...offsets,
    0, 0, 0, 0, 0, 0,
    1,
    1,
    ...uint64Be(objects.length),
    ...uint64Be(rootRef),
    ...uint64Be(offset)
  ]).buffer;
}

function binaryPlistMarker(type: number, length: number): number[] {
  if (length < 15) {
    return [(type << 4) | length];
  }
  return [(type << 4) | 0x0f, 0x10, length];
}

function uint64Be(value: number): number[] {
  const high = Math.floor(value / 2 ** 32);
  const low = value >>> 0;
  return [
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff
  ];
}

function ascii(value: string): number[] {
  return [...new TextEncoder().encode(value)];
}

function int32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16Be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function uint32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint24Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

function uint32Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function uint16Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint64Le(value: bigint): number[] {
  return [
    Number(value & 0xffn),
    Number((value >> 8n) & 0xffn),
    Number((value >> 16n) & 0xffn),
    Number((value >> 24n) & 0xffn),
    Number((value >> 32n) & 0xffn),
    Number((value >> 40n) & 0xffn),
    Number((value >> 48n) & 0xffn),
    Number((value >> 56n) & 0xffn)
  ];
}

function bmffBox(type: string, payload: number[]): number[] {
  return [...uint32Be(payload.length + 8), ...ascii(type), ...payload];
}

function oggPage({ granule, sequence, packets }: { granule: bigint; sequence: number; packets: number[][] }): number[] {
  const payload = packets.flat();
  return [
    ...ascii("OggS"),
    0,
    sequence === 0 ? 2 : 0,
    ...uint64Le(granule),
    ...uint32Le(1),
    ...uint32Le(sequence),
    0,
    0,
    0,
    0,
    packets.length,
    ...packets.map((packet) => packet.length),
    ...payload
  ];
}

function ebmlElement(id: number, payload: number[]): number[] {
  return [...ebmlId(id), ...ebmlSize(payload.length), ...payload];
}

function ebmlId(id: number): number[] {
  if (id <= 0xff) {
    return [id];
  }
  if (id <= 0xffff) {
    return [(id >>> 8) & 0xff, id & 0xff];
  }
  if (id <= 0xffffff) {
    return [(id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
  }
  return [(id >>> 24) & 0xff, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
}

function ebmlSize(size: number): number[] {
  if (size < 0x7f) {
    return [0x80 | size];
  }
  if (size < 0x3fff) {
    return [0x40 | ((size >>> 8) & 0x3f), size & 0xff];
  }
  return [0x20 | ((size >>> 16) & 0x1f), (size >>> 8) & 0xff, size & 0xff];
}

function float64Be(value: number): number[] {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return [...bytes];
}

function setUint16Be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function setUint32Be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function sqliteRecord(values: Array<{ type: number; value: string | number }>): number[] {
  const serialTypes = values.flatMap((item) => sqliteVarUint(item.type));
  const headerSize = sqliteVarUint(1 + serialTypes.length);
  const body = values.flatMap((item) => sqliteRecordValue(item));
  return [...headerSize, ...serialTypes, ...body];
}

function sqliteRecordValue(item: { type: number; value: string | number }): number[] {
  if (item.type === 0 || item.type === 8 || item.type === 9) {
    return [];
  }
  if (typeof item.value === "number") {
    return [item.value & 0xff];
  }
  return ascii(item.value);
}

function sqliteVarUint(value: number): number[] {
  if (value <= 0x7f) {
    return [value];
  }
  const bytes: number[] = [];
  const stack: number[] = [value & 0x7f];
  value >>>= 7;
  while (value > 0) {
    stack.push(0x80 | (value & 0x7f));
    value >>>= 7;
  }
  while (stack.length > 0) {
    bytes.push(stack.pop() as number);
  }
  return bytes;
}

function avroBytes(value: string): number[] {
  const encoded = ascii(value);
  return [...avroLong(encoded.length), ...encoded];
}

function avroLong(value: number): number[] {
  let next = (value << 1) ^ (value >> 31);
  const bytes: number[] = [];
  while ((next & ~0x7f) !== 0) {
    bytes.push((next & 0x7f) | 0x80);
    next >>>= 7;
  }
  bytes.push(next);
  return bytes;
}

function failingPdfJs() {
  return {
    version: "4.0.0-test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(() => ({
      promise: Promise.reject(new Error("broken pdf")),
      destroy: vi.fn()
    }))
  };
}

function successPdfJs() {
  return pdfJsDistMock;
}

function mockCanvasContext(): Partial<CanvasRenderingContext2D> {
  return {
    canvas: document.createElement("canvas"),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 }) as TextMetrics),
    createImageData: vi.fn(() => new ImageData(1, 1)),
    getImageData: vi.fn(() => new ImageData(1, 1)),
    putImageData: vi.fn()
  };
}

async function waitFor(predicate: () => boolean, timeout = 1500, describe?: () => string): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timed out waiting for condition.${describe ? ` › ${describe()}` : ""}`);
    }
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[id^="ofv-prism-css"]')) {
      link.dispatchEvent(new Event("error"));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
