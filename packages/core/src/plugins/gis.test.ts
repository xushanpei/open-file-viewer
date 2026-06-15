import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createViewer } from "../viewer";
import { gisPlugin } from "./gis";

const invalidateSize = vi.hoisted(() => vi.fn());
const removeMap = vi.hoisted(() => vi.fn());
const fitBounds = vi.hoisted(() => vi.fn());
const addTileLayer = vi.hoisted(() => vi.fn());
const addGeoJsonLayer = vi.hoisted(() => vi.fn());
const bindTooltip = vi.hoisted(() => vi.fn());
const bindPopup = vi.hoisted(() => vi.fn());
const layerOn = vi.hoisted(() => vi.fn());
const pointToLayer = vi.hoisted(() => vi.fn());
const geoJsonStyle = vi.hoisted(() => vi.fn());

vi.mock("leaflet", () => ({
  default: {
    icon: vi.fn((options) => options),
    Marker: { prototype: { options: {} } },
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      fitBounds,
      invalidateSize,
      remove: removeMap
    })),
    tileLayer: vi.fn(() => ({ addTo: addTileLayer })),
    circleMarker: vi.fn((_latlng, options) => {
      pointToLayer(options);
      return {
        bindPopup,
        bindTooltip,
        on: layerOn
      };
    }),
    geoJSON: vi.fn((geojson, options) => {
      geoJsonStyle(options.style?.());
      for (const feature of geojson.features || []) {
        options.pointToLayer?.(feature, [feature.geometry?.coordinates?.[1], feature.geometry?.coordinates?.[0]]);
        options.onEachFeature?.(feature, {
          bindPopup,
          bindTooltip,
          on: layerOn
        });
      }
      const layer = {
        addTo: vi.fn((map: unknown) => {
          addGeoJsonLayer(map);
          return layer;
        }),
        getBounds: vi.fn(() => ({
          isValid: () => true
        })),
        resetStyle: vi.fn()
      };
      return layer;
    })
  }
}));

vi.mock("topojson-client", () => ({
  default: { feature: vi.fn() }
}));

vi.mock("@mapbox/togeojson", () => ({
  default: {
    kml: vi.fn(),
    gpx: vi.fn()
  }
}));

vi.mock("shpjs", () => ({
  default: vi.fn()
}));

describe("gisPlugin", () => {
  afterEach(() => {
    document.head.querySelector("#ofv-leaflet-css")?.remove();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it("renders GeoJSON on a Leaflet map and cleans up", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Point", kind: "poi" },
          geometry: { type: "Point", coordinates: [120, 30] }
        },
        {
          type: "Feature",
          properties: { name: "Road" },
          geometry: { type: "LineString", coordinates: [[120, 30], [121, 31]] }
        },
        {
          type: "Feature",
          properties: { area: "Block" },
          geometry: {
            type: "Polygon",
            coordinates: [[[119, 29], [119, 30], [120, 30], [119, 29]]]
          }
        }
      ]
    };

    const viewer = createViewer({
      container,
      file: new Blob([JSON.stringify(geojson)], { type: "application/geo+json" }),
      fileName: "map.geojson",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    expect(container.querySelector(".ofv-gis-summary")?.textContent).toContain("要素3");
    expect(container.querySelector(".ofv-gis-summary")?.textContent).toContain("Point 1");
    expect(container.querySelector(".ofv-gis-summary")?.textContent).toContain("LineString 1");
    expect(container.querySelector(".ofv-gis-summary")?.textContent).toContain("属性字段3");
    expect(container.querySelector(".ofv-gis-summary")?.textContent).toContain("name, kind, area");
    expect(container.querySelector(".ofv-gis-summary")?.textContent).toContain("119, 29, 121, 31");
    expect(container.querySelector(".ofv-map-legend")?.textContent).toContain("3 个要素");
    expect(geoJsonStyle).toHaveBeenCalledWith(expect.objectContaining({ className: "ofv-map-feature", weight: 2 }));
    expect(pointToLayer).toHaveBeenCalledWith(expect.objectContaining({ className: "ofv-map-feature ofv-map-point" }));
    expect(bindTooltip).toHaveBeenCalledWith("Point", expect.objectContaining({ className: "ofv-map-tooltip" }));
    expect(document.getElementById("ofv-leaflet-css")).not.toBeNull();
    expect(addTileLayer).toHaveBeenCalledTimes(1);
    expect(addGeoJsonLayer).toHaveBeenCalledTimes(1);
    expect(fitBounds).toHaveBeenCalledTimes(1);

    viewer.resize();
    expect(invalidateSize).toHaveBeenCalled();

    viewer.destroy();
    expect(removeMap).toHaveBeenCalledTimes(1);
  });

  it("uses MIME type to parse extensionless GeoJSON blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const geojson = {
      type: "FeatureCollection",
      features: []
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(geojson)], { type: "application/geo+json" }),
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    expect(addTileLayer).toHaveBeenCalled();
    expect(addGeoJsonLayer).toHaveBeenCalled();
    expect(container.querySelector(".ofv-map-empty")?.textContent).toContain("暂无可展示的地图要素");
    await waitFor(() => invalidateSize.mock.calls.length > 0);
  });

  it("matches GIS MIME types beyond GeoJSON", async () => {
    expect(await gisPlugin().match(file("application/vnd.google-earth.kml+xml"))).toBe(true);
    expect(await gisPlugin().match(file("application/vnd.google-earth.kmz"))).toBe(true);
    expect(await gisPlugin().match(file("application/gpx+xml"))).toBe(true);
    expect(await gisPlugin().match(file("application/topo+json"))).toBe(true);
  });

  it("shows a helpful message for a raw .shp file", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/octet-stream" }),
      fileName: "roads.shp",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("无法直接预览单个 .shp 文件");
    expect(container.querySelector(".ofv-viewport")?.classList.contains("ofv-center")).toBe(true);

    viewer.destroy();
    expect(container.childElementCount).toBe(0);
  });

  it("shows a local fallback when GeoJSON parsing fails", async () => {
    const container = document.createElement("div");
    const onError = vi.fn();
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["{not-json"], { type: "application/geo+json" }),
      fileName: "broken.geojson",
      plugins: [gisPlugin()],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("GIS 数据解析失败");
    expect(container.textContent).toContain("broken.geojson");
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
    expect(container.childElementCount).toBe(0);
  });

  it("shows a local fallback when a KMZ archive has no KML file", async () => {
    const container = document.createElement("div");
    const onError = vi.fn();
    const zip = new JSZip();
    zip.file("readme.txt", "no kml here");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: buffer,
      fileName: "empty.kmz",
      plugins: [gisPlugin()],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("GIS 数据解析失败");
    expect(container.textContent).toContain("No KML file found");
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
  });
});

function file(mimeType: string) {
  return {
    source: new Blob(["x"], { type: mimeType }),
    name: "blob",
    extension: "",
    mimeType,
    size: 1,
    blob: new Blob(["x"], { type: mimeType })
  };
}

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
