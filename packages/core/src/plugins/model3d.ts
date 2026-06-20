import type { PreviewContext, PreviewInstance, PreviewPlugin, PreviewSize } from "../types";
import { createObjectUrl, revokeObjectUrl } from "../dom";
import { resolveFormat } from "./utils";

const modelExtensions = new Set([
  "gltf",
  "glb",
  "obj",
  "stl",
  "fbx",
  "dae",
  "ply",
  "3mf",
  "3ds",
  "usd",
  "usda",
  "usdc",
  "usdz",
  "wrl",
  "vrml"
]);
const modelMimeTypes = new Set([
  "model/gltf+json",
  "model/gltf-binary",
  "model/stl",
  "model/obj",
  "model/vnd.collada+xml",
  "model/3mf",
  "model/3ds",
  "model/vnd.usd",
  "model/vnd.usdz+zip",
  "model/vrml",
  "application/sla",
  "application/vnd.ms-pki.stl",
  "application/ply",
  "application/vnd.autodesk.fbx"
]);
const modelMimeFormatMap: Record<string, string> = {
  "model/gltf+json": "gltf",
  "model/gltf-binary": "glb",
  "model/stl": "stl",
  "model/obj": "obj",
  "model/vnd.collada+xml": "dae",
  "model/3mf": "3mf",
  "model/3ds": "3ds",
  "model/vnd.usd": "usd",
  "model/vnd.usdz+zip": "usdz",
  "model/vrml": "wrl",
  "application/sla": "stl",
  "application/vnd.ms-pki.stl": "stl",
  "application/ply": "ply",
  "application/vnd.autodesk.fbx": "fbx"
};
const textLikeExtensions = new Set(["json", "txt", "md", "xml", "yaml", "yml", "csv", "tsv", "js", "ts", "tsx", "jsx", "html", "css"]);

export function model3dPlugin(): PreviewPlugin {
  return {
    name: "model3d",
    match(file) {
      return (
        modelExtensions.has(file.extension) ||
        (modelMimeTypes.has(file.mimeType) && (file.extension === "" || file.extension === "bin" || !textLikeExtensions.has(file.extension)))
      );
    },
    async render(ctx) {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);

      const stage = document.createElement("div");
      stage.className = "ofv-model-stage";
      ctx.viewport.append(stage);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf3f4f6);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
      camera.position.set(2.5, 2, 3.5);

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true });
      } catch {
        stage.remove();
        return renderModelFallback(ctx, url, isExternal, "当前浏览器或设备不支持 WebGL，无法直接渲染 3D 模型。");
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      stage.append(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 2.8));
      const directional = new THREE.DirectionalLight(0xffffff, 2);
      directional.position.set(4, 6, 5);
      scene.add(directional);
      scene.add(new THREE.GridHelper(10, 10, 0xcbd5e1, 0xe5e7eb));

      const extension = resolveFormat(ctx.file, modelMimeFormatMap);
      const modelUrl = resolveModelUrl(extension, url, ctx.file.url);
      const loaded = await loadModel(extension, modelUrl, THREE).catch(() => undefined);
      if (!loaded) {
        controls.dispose();
        renderer.dispose();
        stage.remove();
        return renderModelFallback(ctx, url, isExternal, "无法解析当前 3D 模型内容。");
      }
      if (loaded.message) {
        const message = document.createElement("div");
        message.className = "ofv-model-message";
        message.textContent = loaded.message;
        stage.append(message);
      }
      const object = loaded.object;
      const initialRotation = {
        x: object.rotation?.x ?? 0,
        y: object.rotation?.y ?? 0,
        z: object.rotation?.z ?? 0
      };
      scene.add(object);
      const initialFrame = frameObject(object, camera, controls, THREE);
      const measurement = measureObject(object, THREE);
      stage.append(createMeasurementPanel(measurement));
      stage.append(createMaterialPanel(collectMaterialStats(object)));

      let animationFrame = 0;
      const animate = () => {
        controls.update();
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(animate);
      };
      animate();

      const resize = (size: PreviewSize) => {
        const width = Math.max(1, size.width);
        const height = Math.max(1, size.height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      resize(ctx.size);
      const updateToolbarZoom = () => {
        const currentDistance = vectorDistance(camera.position, controls.target);
        const initialDistance = vectorDistance(initialFrame.cameraPosition, initialFrame.target);
        ctx.toolbar?.setZoom(initialDistance > 0 ? initialDistance / currentDistance : undefined);
      };
      updateToolbarZoom();

      return {
        canCommand(command) {
          return (
            command === "zoom-in" ||
            command === "zoom-out" ||
            command === "zoom-reset" ||
            command === "rotate-right" ||
            command === "rotate-left"
          );
        },
        command(command) {
          if (command === "zoom-in" || command === "zoom-out") {
            const factor = command === "zoom-in" ? 0.82 : 1.18;
            camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
            camera.updateProjectionMatrix();
            controls.update();
            updateToolbarZoom();
            return true;
          }
          if (command === "zoom-reset") {
            camera.position.copy(initialFrame.cameraPosition);
            controls.target.copy(initialFrame.target);
            if (object.rotation) {
              object.rotation.set?.(initialRotation.x, initialRotation.y, initialRotation.z);
              object.rotation.x = initialRotation.x;
              object.rotation.y = initialRotation.y;
              object.rotation.z = initialRotation.z;
            }
            camera.near = initialFrame.near;
            camera.far = initialFrame.far;
            camera.updateProjectionMatrix();
            controls.update();
            updateToolbarZoom();
            return true;
          }
          if (command === "rotate-right" || command === "rotate-left") {
            object.rotateY(command === "rotate-right" ? Math.PI / 8 : -Math.PI / 8);
            return true;
          }
          return false;
        },
        resize,
        destroy() {
          ctx.toolbar?.setZoom(undefined);
          window.cancelAnimationFrame(animationFrame);
          controls.dispose();
          renderer.dispose();
          disposeObject(object, THREE);
          stage.remove();
          revokeObjectUrl(url, isExternal);
        }
      };
    }
  };
}

function vectorDistance(
  a: { x: number; y: number; z: number; distanceTo?: (value: { x: number; y: number; z: number }) => number },
  b: { x: number; y: number; z: number }
): number {
  if (typeof a.distanceTo === "function") {
    return a.distanceTo(b);
  }
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function renderModelFallback(
  ctx: PreviewContext,
  url: string,
  isExternal: boolean,
  message: string
): PreviewInstance {
  const panel = document.createElement("div");
  panel.className = "ofv-fallback";

  const title = document.createElement("strong");
  title.textContent = "3D 预览不可用";

  const detail = document.createElement("span");
  detail.textContent = `${message} ${ctx.file.name}`;

  const download = document.createElement("a");
  download.href = url;
  download.download = ctx.file.name;
  download.textContent = "下载文件";

  panel.append(title, detail, download);
  ctx.viewport.classList.add("ofv-center");
  ctx.viewport.append(panel);

  return {
    canCommand() {
      return false;
    },
    destroy() {
      ctx.viewport.classList.remove("ofv-center");
      panel.remove();
      revokeObjectUrl(url, isExternal);
    }
  };
}

function resolveModelUrl(extension: string, objectUrl: string, sourceUrl?: string): string {
  if (extension === "gltf" && sourceUrl) {
    return sourceUrl;
  }
  return objectUrl;
}

async function loadModel(
  extension: string,
  url: string,
  THREE: typeof import("three")
): Promise<{ object: import("three").Object3D; message?: string }> {
  if (extension === "gltf" || extension === "glb") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(url);
    return { object: gltf.scene };
  }
  if (extension === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    return { object: await new OBJLoader().loadAsync(url) };
  }
  if (extension === "fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    return { object: await new FBXLoader().loadAsync(url) };
  }
  if (extension === "dae") {
    const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
    const collada = await new ColladaLoader().loadAsync(url);
    if (!collada) {
      throw new Error("Collada loader returned no scene.");
    }
    return { object: collada.scene };
  }
  if (extension === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const geometry = await new STLLoader().loadAsync(url);
    const material = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.55 });
    return { object: new THREE.Mesh(geometry, material) };
  }
  if (extension === "ply") {
    const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
    const geometry = await new PLYLoader().loadAsync(url);
    const material = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.55 });
    return { object: new THREE.Mesh(geometry, material) };
  }
  if (extension === "3mf") {
    const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
    return { object: await new ThreeMFLoader().loadAsync(url) };
  }
  if (extension === "3ds") {
    const { TDSLoader } = await import("three/examples/jsm/loaders/TDSLoader.js");
    return { object: await new TDSLoader().loadAsync(url) };
  }
  if (extension === "usd" || extension === "usda" || extension === "usdc" || extension === "usdz") {
    const { USDLoader } = await import("three/examples/jsm/loaders/USDLoader.js");
    return { object: await new USDLoader().loadAsync(url) };
  }
  if (extension === "wrl" || extension === "vrml") {
    const { VRMLLoader } = await import("three/examples/jsm/loaders/VRMLLoader.js");
    return { object: await new VRMLLoader().loadAsync(url) };
  }
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x64748b });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  return {
    object: group,
    message: `.${extension} 已识别为 3D 格式，当前内置渲染优先支持 gltf/glb/obj/stl/fbx/dae/ply/3mf/3ds/usd/usdz/vrml。`
  };
}

function frameObject(
  object: import("three").Object3D,
  camera: import("three").PerspectiveCamera,
  controls: { target: import("three").Vector3; update: () => void },
  THREE: typeof import("three")
): {
  cameraPosition: import("three").Vector3;
  target: import("three").Vector3;
  near: number;
  far: number;
} {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 2.4;
  camera.position.set(center.x + distance, center.y + distance * 0.7, center.z + distance);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = distance * 1000;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
  return {
    cameraPosition: camera.position.clone(),
    target: controls.target.clone(),
    near: camera.near,
    far: camera.far
  };
}

type ModelMeasurement = {
  width: number;
  height: number;
  depth: number;
  diagonal: number;
  center: { x: number; y: number; z: number };
};

type MaterialStats = {
  meshes: number;
  materials: number;
  textures: number;
  slots: string[];
  names: string[];
};

function measureObject(object: import("three").Object3D, THREE: typeof import("three")): ModelMeasurement {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return {
    width: size.x,
    height: size.y,
    depth: size.z,
    diagonal: Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2),
    center: { x: center.x, y: center.y, z: center.z }
  };
}

function createMeasurementPanel(measurement: ModelMeasurement): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "ofv-model-measure";
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  panel.style.display = "none";
  const title = document.createElement("strong");
  title.textContent = "模型测量";
  const list = document.createElement("dl");
  appendMeasure(list, "宽", measurement.width);
  appendMeasure(list, "高", measurement.height);
  appendMeasure(list, "深", measurement.depth);
  appendMeasure(list, "对角线", measurement.diagonal);
  appendMeasure(
    list,
    "中心",
    `${formatMeasure(measurement.center.x)}, ${formatMeasure(measurement.center.y)}, ${formatMeasure(measurement.center.z)}`
  );
  panel.append(title, list);
  return panel;
}

function appendMeasure(list: HTMLDListElement, label: string, value: number | string): void {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = typeof value === "number" ? formatMeasure(value) : value;
  list.append(term, detail);
}

function formatMeasure(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
  return rounded.replace(/\.?0+$/, "");
}

function collectMaterialStats(object: import("three").Object3D): MaterialStats {
  const materials = new Set<import("three").Material>();
  const textures = new Set<unknown>();
  const slots = new Set<string>();
  const names = new Set<string>();
  let meshes = 0;

  object.traverse((child) => {
    const mesh = child as import("three").Mesh;
    if (!mesh.geometry || !mesh.material) {
      return;
    }
    meshes += 1;
    for (const material of normalizeMaterials(mesh.material)) {
      materials.add(material);
      if (material.name) {
        names.add(material.name);
      }
      for (const slot of textureSlots) {
        const texture = (material as unknown as Record<string, unknown>)[slot];
        if (texture) {
          textures.add(texture);
          slots.add(slot);
        }
      }
    }
  });

  return {
    meshes,
    materials: materials.size,
    textures: textures.size,
    slots: [...slots],
    names: [...names].slice(0, 6)
  };
}

function createMaterialPanel(stats: MaterialStats): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "ofv-model-materials";
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  panel.style.display = "none";
  const title = document.createElement("strong");
  title.textContent = "材质贴图";

  const list = document.createElement("dl");
  appendMaterialStat(list, "网格", stats.meshes);
  appendMaterialStat(list, "材质", stats.materials);
  appendMaterialStat(list, "贴图", stats.textures);
  appendMaterialStat(list, "槽位", stats.slots.length > 0 ? stats.slots.join(", ") : "-");
  if (stats.names.length > 0) {
    appendMaterialStat(list, "名称", stats.names.join(", "));
  }

  panel.append(title, list);
  return panel;
}

function appendMaterialStat(list: HTMLDListElement, label: string, value: number | string): void {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = String(value);
  list.append(term, detail);
}

function disposeObject(object: import("three").Object3D, THREE: typeof import("three")): void {
  object.traverse((child) => {
    const mesh = child as import("three").Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    for (const item of normalizeMaterials(material)) {
      disposeMaterialTextures(item);
      item.dispose();
    }
  });
}

const textureSlots = [
  "map",
  "aoMap",
  "alphaMap",
  "bumpMap",
  "displacementMap",
  "emissiveMap",
  "envMap",
  "lightMap",
  "metalnessMap",
  "normalMap",
  "roughnessMap"
];

function normalizeMaterials(
  material: import("three").Material | import("three").Material[] | undefined
): import("three").Material[] {
  if (!material) {
    return [];
  }
  return Array.isArray(material) ? material : [material];
}

function disposeMaterialTextures(material: import("three").Material): void {
  for (const slot of textureSlots) {
    const texture = (material as unknown as Record<string, { dispose?: () => void } | undefined>)[slot];
    texture?.dispose?.();
  }
}
