/// <reference path="../shims-gis.d.ts" />
import type { PreviewPlugin, PreviewFile } from "../types";
import { readArrayBuffer, resolveFormat } from "./utils";

const gisExtensions = new Set(["geojson", "topojson", "kml", "kmz", "gpx", "shp"]);
const gisMimeFormatMap: Record<string, string> = {
  "application/geo+json": "geojson",
  "application/vnd.geo+json": "geojson",
  "application/topo+json": "topojson",
  "application/vnd.google-earth.kml+xml": "kml",
  "application/vnd.google-earth.kmz": "kmz",
  "application/gpx+xml": "gpx"
};

function loadLeafletCss(): Promise<void> {
  const id = "ofv-leaflet-css";
  if (document.getElementById(id)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const link = document.createElement("link");
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
    link.onload = done;
    link.onerror = done;
    document.head.appendChild(link);
    window.setTimeout(done, 0);
  });
}

export function gisPlugin(): PreviewPlugin {
  return {
    name: "gis",
    match(file) {
      return gisExtensions.has(resolveGisFormat(file)) || Boolean(gisMimeFormatMap[file.mimeType]);
    },
    async render(ctx) {
      // 1. Load Leaflet CSS and dynamic imports
      await loadLeafletCss();

      const [L, topojson, toGeoJSON, shpjs, JSZip] = await Promise.all([
        import("leaflet"),
        import("topojson-client"),
        import("@mapbox/togeojson"),
        import("shpjs"),
        import("jszip")
      ]);

      const Leaflet = L.default || L;
      const topojsonClient = topojson.default || topojson;
      const togeojsonLib = toGeoJSON.default || toGeoJSON;
      const shpLib = shpjs.default || shpjs;
      const JSZipLib = JSZip.default || JSZip;

      // Fix default marker icon paths using inline SVG to avoid asset 404 errors
      const DefaultIcon = Leaflet.icon({
        iconUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <path fill="#3b82f6" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        `),
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <ellipse cx="12" cy="20" rx="6" ry="2" fill="#000000" opacity="0.2"/>
          </svg>
        `),
        shadowSize: [41, 41],
        shadowAnchor: [12, 41]
      });
      Leaflet.Marker.prototype.options.icon = DefaultIcon;

      // 2. Read file as ArrayBuffer and Parse to GeoJSON
      const buffer = await readArrayBuffer(ctx.file);
      const geojson = await parseToGeoJson(
        ctx.file,
        buffer,
        togeojsonLib,
        topojsonClient,
        shpLib,
        JSZipLib
      ).catch((error: unknown) => {
        const fallback = createGisFallback("GIS 数据解析失败", normalizeGisError(error, ctx.file.name));
        ctx.viewport.classList.add("ofv-center");
        ctx.viewport.append(fallback);
        return { fallback };
      });

      if (isGisFallback(geojson)) {
        return {
          destroy() {
            ctx.viewport.classList.remove("ofv-center");
            geojson.fallback.remove();
          }
        };
      }

      // 3. Render Leaflet Map
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-gis-viewer";
      const summary = summarizeGeoJson(geojson);
      wrapper.append(createGisSummary(summary));
      ctx.viewport.appendChild(wrapper);

      const mapContainer = document.createElement("div");
      mapContainer.className = "ofv-map-stage";
      wrapper.appendChild(mapContainer);
      if (summary.features === 0) {
        mapContainer.append(createEmptyMapState());
      }

      const map = Leaflet.map(mapContainer).setView([0, 0], 2);
      let toolbarZoom = 1;
      const updateToolbarZoom = () => {
        ctx.toolbar?.setZoom(toolbarZoom);
      };
      updateToolbarZoom();

      Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Render GeoJSON elements with premium blue color styles
      const geojsonLayer = Leaflet.geoJSON(geojson, {
        style: () => ({
          className: "ofv-map-feature",
          color: "#e11d48",
          weight: 2,
          opacity: 0.92,
          fillColor: "#fb923c",
          fillOpacity: 0.3,
          lineCap: "round",
          lineJoin: "round"
        }),
        pointToLayer: (feature: any, latlng: any) => {
          return Leaflet.circleMarker(latlng, {
            className: "ofv-map-feature ofv-map-point",
            radius: 7,
            fillColor: "#e11d48",
            color: "#ffffff",
            weight: 2.5,
            opacity: 1,
            fillOpacity: 0.9
          });
        },
        onEachFeature: (feature: any, layer: any) => {
          const label = feature.properties?.name || feature.properties?.title || feature.properties?.label;
          if (label) {
            layer.bindTooltip?.(String(label), {
              className: "ofv-map-tooltip",
              direction: "top",
              sticky: true
            });
          }
          layer.on?.({
            mouseover(event: any) {
              event.target?.setStyle?.({
                weight: 4,
                opacity: 1,
                fillOpacity: 0.4
              });
              event.target?.bringToFront?.();
            },
            mouseout(event: any) {
              geojsonLayer.resetStyle?.(event.target);
            }
          });
          if (feature.properties) {
            const props = feature.properties;
            const keys = Object.keys(props);
            if (keys.length > 0) {
              const popupContent = document.createElement("div");
              popupContent.className = "ofv-map-popup";

              const popupTitle = document.createElement("h4");
              popupTitle.textContent = "属性信息";
              popupContent.appendChild(popupTitle);

              const table = document.createElement("table");
              table.className = "ofv-map-popup-table";

              for (const key of keys) {
                const val = props[key];
                if (val === null || val === undefined) continue;

                const row = document.createElement("tr");
                const cellKey = document.createElement("td");
                cellKey.className = "ofv-map-popup-key";
                cellKey.textContent = key;

                const cellVal = document.createElement("td");
                cellVal.className = "ofv-map-popup-val";
                cellVal.textContent = typeof val === "object" ? JSON.stringify(val) : String(val);

                row.append(cellKey, cellVal);
                table.appendChild(row);
              }

              popupContent.appendChild(table);
              layer.bindPopup(popupContent);
            }
          }
        }
      }).addTo(map);

      // Zoom map to dataset bounds
      try {
        const bounds = geojsonLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] });
          map.invalidateSize();
        }
      } catch (e) {
        console.warn("Could not fit bounds for GeoJSON data:", e);
      }

      const resizeTimers = [0, 80, 240].map((delay) => window.setTimeout(() => {
        map.invalidateSize();
        updateToolbarZoom();
      }, delay));

      return {
        canCommand(command) {
          return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
        },
        command(command) {
          if (command === "zoom-in") {
            map.zoomIn?.();
            toolbarZoom = Math.min(3, Number((toolbarZoom + 0.25).toFixed(2)));
            updateToolbarZoom();
            return true;
          }
          if (command === "zoom-out") {
            map.zoomOut?.();
            toolbarZoom = Math.max(0.25, Number((toolbarZoom - 0.25).toFixed(2)));
            updateToolbarZoom();
            return true;
          }
          if (command === "zoom-reset") {
            toolbarZoom = 1;
            map.setView([0, 0], 2);
            try {
              const bounds = geojsonLayer.getBounds();
              if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [20, 20] });
              }
            } catch {
              // Keep the neutral world view when bounds are unavailable.
            }
            map.invalidateSize();
            updateToolbarZoom();
            return true;
          }
          return false;
        },
        resize() {
          map.invalidateSize();
          updateToolbarZoom();
        },
        destroy() {
          resizeTimers.forEach((timer) => window.clearTimeout(timer));
          ctx.toolbar?.setZoom(undefined);
          map.remove();
          wrapper.remove();
        }
      };
    }
  };
}

function createGisFallback(titleText: string, detailText: string): HTMLElement {
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const detail = document.createElement("span");
  detail.textContent = detailText;
  fallback.append(title, detail);
  return fallback;
}

function normalizeGisError(error: unknown, fileName: string): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message ? `${fileName}: ${message}` : `${fileName}: 文件内容无法转换为地图数据。`;
}

function isGisFallback(value: unknown): value is { fallback: HTMLElement } {
  return typeof value === "object" && value !== null && "fallback" in value;
}

type GisSummary = {
  features: number;
  geometryCounts: Map<string, number>;
  propertyKeys: Set<string>;
  bounds?: [number, number, number, number];
};

function createGisSummary(summary: GisSummary): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "ofv-gis-summary";
  bar.hidden = summary.features > 0;
  if (summary.features > 0) {
    bar.setAttribute("aria-hidden", "true");
    bar.style.display = "none";
  }
  appendSummaryItem(bar, "要素", String(summary.features));
  appendSummaryItem(bar, "几何", formatGeometryCounts(summary.geometryCounts));
  appendSummaryItem(bar, "属性字段", String(summary.propertyKeys.size));
  if (summary.propertyKeys.size > 0) {
    appendSummaryItem(bar, "字段预览", [...summary.propertyKeys].slice(0, 8).join(", "));
  }
  if (summary.bounds) {
    appendSummaryItem(bar, "范围", formatBounds(summary.bounds));
  }
  return bar;
}

function createEmptyMapState(): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "ofv-map-empty";
  const title = document.createElement("strong");
  title.textContent = "暂无可展示的地图要素";
  const detail = document.createElement("span");
  detail.textContent = "GeoJSON 已识别，但 features 为空。";
  empty.append(title, detail);
  return empty;
}

function appendSummaryItem(parent: HTMLElement, label: string, value: string): void {
  const item = document.createElement("span");
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  item.append(key, content);
  parent.append(item);
}

function summarizeGeoJson(geojson: any): GisSummary {
  const summary: GisSummary = {
    features: 0,
    geometryCounts: new Map(),
    propertyKeys: new Set()
  };
  for (const feature of collectFeatures(geojson)) {
    summary.features++;
    if (feature.properties && typeof feature.properties === "object") {
      Object.keys(feature.properties).forEach((key) => summary.propertyKeys.add(key));
    }
    summarizeGeometry(feature.geometry, summary);
  }
  return summary;
}

function collectFeatures(value: any): any[] {
  if (!value) {
    return [];
  }
  if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
    return value.features;
  }
  if (value.type === "Feature") {
    return [value];
  }
  if (value.type && value.coordinates) {
    return [{ type: "Feature", properties: {}, geometry: value }];
  }
  return [];
}

function summarizeGeometry(geometry: any, summary: GisSummary): void {
  if (!geometry) {
    summary.geometryCounts.set("None", (summary.geometryCounts.get("None") || 0) + 1);
    return;
  }
  const type = String(geometry.type || "Unknown");
  summary.geometryCounts.set(type, (summary.geometryCounts.get(type) || 0) + 1);
  if (type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    for (const child of geometry.geometries) {
      summarizeGeometry(child, summary);
    }
    return;
  }
  updateBounds(summary, geometry.coordinates);
}

function updateBounds(summary: GisSummary, coordinates: unknown): void {
  if (!Array.isArray(coordinates)) {
    return;
  }
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    const lon = coordinates[0];
    const lat = coordinates[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return;
    }
    const bounds = summary.bounds || [lon, lat, lon, lat];
    bounds[0] = Math.min(bounds[0], lon);
    bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lon);
    bounds[3] = Math.max(bounds[3], lat);
    summary.bounds = bounds;
    return;
  }
  for (const item of coordinates) {
    updateBounds(summary, item);
  }
}

function formatGeometryCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ") || "无";
}

function formatBounds(bounds: [number, number, number, number]): string {
  return bounds.map((value) => Number(value.toFixed(5))).join(", ");
}

async function parseToGeoJson(
  file: PreviewFile,
  buffer: ArrayBuffer,
  togeojsonLib: any,
  topojsonClient: any,
  shpLib: any,
  JSZipLib: any
): Promise<any> {
  const ext = resolveGisFormat(file);

  if (ext === "geojson") {
    const text = new TextDecoder().decode(buffer);
    return JSON.parse(text);
  }

  if (ext === "topojson") {
    const text = new TextDecoder().decode(buffer);
    const topology = JSON.parse(text);
    const geojsonFeatures: any[] = [];
    for (const key of Object.keys(topology.objects)) {
      const feature = topojsonClient.feature(topology, topology.objects[key]);
      if (feature.type === "FeatureCollection") {
        geojsonFeatures.push(...feature.features);
      } else {
        geojsonFeatures.push(feature);
      }
    }
    return {
      type: "FeatureCollection",
      features: geojsonFeatures
    };
  }

  if (ext === "kml") {
    const text = new TextDecoder().decode(buffer);
    const dom = new DOMParser().parseFromString(text, "text/xml");
    return togeojsonLib.kml(dom);
  }

  if (ext === "gpx") {
    const text = new TextDecoder().decode(buffer);
    const dom = new DOMParser().parseFromString(text, "text/xml");
    return togeojsonLib.gpx(dom);
  }

  if (ext === "kmz") {
    const zip = await JSZipLib.loadAsync(buffer);
    const kmlFile: any = Object.values(zip.files).find((f: any) => f.name.toLowerCase().endsWith(".kml"));
    if (!kmlFile) {
      throw new Error("No KML file found inside KMZ archive.");
    }
    const kmlText = await kmlFile.async("text");
    const dom = new DOMParser().parseFromString(kmlText, "text/xml");
    return togeojsonLib.kml(dom);
  }

  if (ext === "shp") {
    const u8 = new Uint8Array(buffer);
    const isZip = u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
    const parsed = await shpLib(isZip ? buffer : { shp: buffer }).catch((error: unknown) => {
      if (!isZip) {
        throw new Error(
          `单个 .shp 几何解析失败：${error instanceof Error ? error.message : "文件内容异常"}。如需属性字段，请同时提供 .dbf/.shx 或上传 zip。`
        );
      }
      throw error;
    });
    if (Array.isArray(parsed)) {
      const features: any[] = [];
      for (const item of parsed) {
        if (item.type === "FeatureCollection") {
          features.push(...item.features);
        } else if (item.type === "Feature") {
          features.push(item);
        }
      }
      return {
        type: "FeatureCollection",
        features
      };
    }
    return parsed;
  }

  // Mime type match fallback
  try {
    const text = new TextDecoder().decode(buffer);
    return JSON.parse(text);
  } catch {
    throw new Error(`Unsupported GIS format: ${ext}`);
  }
}

function resolveGisFormat(file: PreviewFile): string {
  const name = file.name.toLowerCase().split("?")[0]?.split("#")[0] || "";
  if (name.endsWith(".geo.json")) {
    return "geojson";
  }
  if (name.endsWith(".topo.json")) {
    return "topojson";
  }
  return resolveFormat(file, gisMimeFormatMap).toLowerCase();
}
