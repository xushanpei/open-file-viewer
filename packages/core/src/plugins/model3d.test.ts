import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { model3dPlugin } from "./model3d";

const controlsDispose = vi.hoisted(() => vi.fn());
const controlsUpdate = vi.hoisted(() => vi.fn());
const rendererDispose = vi.hoisted(() => vi.fn());
const rendererSetSize = vi.hoisted(() => vi.fn());
const rotateY = vi.hoisted(() => vi.fn());
const textureDispose = vi.hoisted(() => vi.fn());
const shouldThrowRenderer = vi.hoisted(() => ({ value: false }));
const shouldThrowGltf = vi.hoisted(() => ({ value: false }));

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
    sub() {
      return this;
    }
    multiplyScalar() {
      return this;
    }
    add() {
      return this;
    }
  }

  class Material {
    name = "Preview material";
    map = { dispose: textureDispose };
    normalMap = { dispose: textureDispose };
    dispose = vi.fn();
  }

  class Object3D {
    children: Object3D[] = [];
    geometry?: { dispose: () => void };
    material?: Material | Material[];
    add(child: Object3D) {
      this.children.push(child);
    }
    traverse(callback: (child: Object3D) => void) {
      callback(this);
      this.children.forEach((child) => child.traverse(callback));
    }
    rotateY = rotateY;
  }

  class Mesh extends Object3D {
    constructor(geometry: { dispose: () => void }, material: Material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
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
      constructor() {}
      updateProjectionMatrix = vi.fn();
    },
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      outputColorSpace = "";
      toneMapping = 0;
      toneMappingExposure = 1;
      constructor() {
        if (shouldThrowRenderer.value) {
          throw new Error("WebGL unavailable");
        }
      }
      setPixelRatio = vi.fn();
      setSize = rendererSetSize;
      render = vi.fn();
      dispose = rendererDispose;
    },
    HemisphereLight: class extends Object3D {
      constructor() {
        super();
      }
    },
    DirectionalLight: class extends Object3D {
      position = new Vector3();
      constructor() {
        super();
      }
    },
    GridHelper: class extends Object3D {},
    Group: class extends Object3D {},
    BoxGeometry: class {
      dispose = vi.fn();
      constructor() {}
    },
    SRGBColorSpace: "srgb",
    ACESFilmicToneMapping: 4,
    MeshStandardMaterial: class extends Material {
      constructor() {
        super();
      }
    },
    Mesh,
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
    Material
  };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    enableDamping = false;
    target = {
      copy: vi.fn(),
      clone: vi.fn(() => ({ copy: vi.fn() }))
    };
    update = controlsUpdate;
    dispose = controlsDispose;
    constructor() {}
  }
}));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    async loadAsync() {
      if (shouldThrowGltf.value) {
        throw new Error("Invalid GLB");
      }
      const THREE = await import("three");
      return { scene: new THREE.Group() };
    }
  }
}));

describe("model3dPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    controlsDispose.mockClear();
    controlsUpdate.mockClear();
    rendererDispose.mockClear();
    rendererSetSize.mockClear();
    rotateY.mockClear();
    textureDispose.mockClear();
    shouldThrowRenderer.value = false;
    shouldThrowGltf.value = false;
  });

  it("renders an unsupported 3D placeholder with toolbar commands", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-model";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const viewer = createViewer({
      container,
      file: new Blob(["model"], { type: "application/octet-stream" }),
      fileName: "model.fbx",
      toolbar: true,
      plugins: [model3dPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-model-stage")));

    expect(container.querySelector(".ofv-model-message")?.textContent).toContain(".fbx");
    expect(container.querySelector(".ofv-model-measure")?.textContent).toContain("模型测量");
    expect(container.querySelector(".ofv-model-measure")?.textContent).toContain("宽1");
    expect(container.querySelector(".ofv-model-measure")?.textContent).toContain("高1");
    expect(container.querySelector(".ofv-model-measure")?.textContent).toContain("深1");
    expect(container.querySelector(".ofv-model-measure")?.textContent).toContain("对角线1.732");
    expect(container.querySelector(".ofv-model-measure")?.textContent).toContain("中心0, 0, 0");
    expect(container.querySelector(".ofv-model-materials")?.textContent).toContain("材质贴图");
    expect(container.querySelector(".ofv-model-materials")?.textContent).toContain("网格1");
    expect(container.querySelector(".ofv-model-materials")?.textContent).toContain("材质1");
    expect(container.querySelector(".ofv-model-materials")?.textContent).toContain("贴图2");
    expect(container.querySelector(".ofv-model-materials")?.textContent).toContain("map, normalMap");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(false);

    container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]')?.click();
    expect(rotateY).toHaveBeenCalled();
    expect(rendererSetSize).toHaveBeenCalled();

    viewer.destroy();
    expect(controlsDispose).toHaveBeenCalledTimes(1);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("uses MIME type to route extensionless GLB blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-glb";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const viewer = createViewer({
      container,
      file: new Blob(["glb"], { type: "model/gltf-binary" }),
      toolbar: true,
      plugins: [model3dPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-model-stage")));

    expect(container.querySelector(".ofv-model-message")).toBeNull();

    viewer.destroy();
  });

  it("routes USD and VRML formats to the 3D placeholder renderer", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-usdz";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const viewer = createViewer({
      container,
      file: new Blob(["usd"], { type: "model/vnd.usdz+zip" }),
      fileName: "scene.usdz",
      plugins: [model3dPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-model-stage")));

    expect(container.querySelector(".ofv-model-message")?.textContent).toContain(".usdz");
    expect(container.querySelector(".ofv-model-measure")?.textContent).toContain("模型测量");

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("falls back to a download panel when WebGL is unavailable", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-no-webgl";
    shouldThrowRenderer.value = true;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["model"], { type: "model/gltf-binary" }),
      fileName: "model.glb",
      toolbar: true,
      plugins: [model3dPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("3D 预览不可用");
    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("model.glb");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe(objectUrl);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(true);

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("falls back when a supported 3D file cannot be parsed", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-bad-glb";
    shouldThrowGltf.value = true;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const viewer = createViewer({
      container,
      file: new Blob(["bad"], { type: "model/gltf-binary" }),
      fileName: "broken.glb",
      toolbar: true,
      plugins: [model3dPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.querySelector(".ofv-model-stage")).toBeNull();
    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("无法解析当前 3D 模型内容");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(true);

    viewer.destroy();
    expect(controlsDispose).toHaveBeenCalledTimes(1);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });
});

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
