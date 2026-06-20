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
const shpMock = vi.hoisted(() => vi.fn());
const topojsonFeatureMock = vi.hoisted(() => vi.fn());
const kmlMock = vi.hoisted(() => vi.fn());
const gpxMock = vi.hoisted(() => vi.fn());
const zoomIn = vi.hoisted(() => vi.fn());
const zoomOut = vi.hoisted(() => vi.fn());
const getZoom = vi.hoisted(() => vi.fn(() => 2));

vi.mock("leaflet", () => ({
  default: {
    icon: vi.fn((options) => options),
    Marker: { prototype: { options: {} } },
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      fitBounds,
      invalidateSize,
      zoomIn,
      zoomOut,
      getZoom,
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
  default: { feature: topojsonFeatureMock }
}));

vi.mock("@mapbox/togeojson", () => ({
  default: {
    kml: kmlMock,
    gpx: gpxMock
  }
}));

vi.mock("shpjs", () => ({
  default: shpMock
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

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(true);
    expect(gisSummary?.textContent).toContain("要素3");
    expect(gisSummary?.textContent).toContain("Point 1");
    expect(gisSummary?.textContent).toContain("LineString 1");
    expect(gisSummary?.textContent).toContain("属性字段3");
    expect(gisSummary?.textContent).toContain("name, kind, area");
    expect(gisSummary?.textContent).toContain("119, 29, 121, 31");
    expect(container.querySelector(".ofv-map-legend")).toBeNull();
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

  it("supports shared toolbar zoom commands on maps", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob([JSON.stringify({ type: "FeatureCollection", features: [] })], { type: "application/geo+json" }),
      fileName: "map.geojson",
      toolbar: true,
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(false);
    const zoomInButton = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomOutButton = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');
    const zoomResetButton = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');

    expect(zoomInButton?.disabled).toBe(false);
    expect(zoomOutButton?.disabled).toBe(false);
    expect(zoomResetButton?.textContent).toBe("100%");

    zoomInButton?.click();
    expect(zoomIn).toHaveBeenCalledTimes(1);
    expect(zoomResetButton?.textContent).toBe("125%");

    zoomOutButton?.click();
    expect(zoomOut).toHaveBeenCalledTimes(1);
    expect(zoomResetButton?.textContent).toBe("100%");

    zoomResetButton?.click();
    expect(fitBounds).toHaveBeenCalled();
    expect(invalidateSize).toHaveBeenCalled();
    expect(zoomResetButton?.textContent).toBe("100%");

    viewer.destroy();
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

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(false);
    expect(addTileLayer).toHaveBeenCalled();
    expect(addGeoJsonLayer).toHaveBeenCalled();
    expect(container.querySelector(".ofv-map-empty")?.textContent).toContain("暂无可展示的地图要素");
    await waitFor(() => invalidateSize.mock.calls.length > 0);
  });

  it("routes .geo.json files to the GIS renderer even with plain text MIME", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Plain MIME GeoJSON" },
          geometry: { type: "Point", coordinates: [118, 32] }
        }
      ]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(geojson)], { type: "text/plain" }),
      fileName: "USA.geo.json",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    expect(container.querySelector(".ofv-code-container")).toBeNull();
    expect(addGeoJsonLayer).toHaveBeenCalled();
    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(true);
    expect(gisSummary?.textContent).toContain("要素1");
  });

  it("routes .topo.json files to the TopoJSON renderer", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    topojsonFeatureMock.mockReturnValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "TopoJSON place" },
          geometry: { type: "Point", coordinates: [118, 32] }
        }
      ]
    });
    const topology = {
      type: "Topology",
      objects: {
        place: { type: "GeometryCollection", geometries: [] }
      },
      arcs: []
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(topology)], { type: "text/plain" }),
      fileName: "map.topo.json",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    expect(topojsonFeatureMock).toHaveBeenCalled();
    expect(addGeoJsonLayer).toHaveBeenCalled();
    expect(container.querySelector(".ofv-code-container")).toBeNull();
  });

  it("matches GIS MIME types beyond GeoJSON", async () => {
    expect(await gisPlugin().match(file("application/vnd.google-earth.kml+xml"))).toBe(true);
    expect(await gisPlugin().match(file("application/vnd.google-earth.kmz"))).toBe(true);
    expect(await gisPlugin().match(file("application/gpx+xml"))).toBe(true);
    expect(await gisPlugin().match(file("application/topo+json"))).toBe(true);
  });

  it("converts KML into map features in the browser", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    kmlMock.mockReturnValueOnce(featureCollection("KML Place", [121.5, 31.2]));

    const viewer = createViewer({
      container,
      file: new Blob(["<kml><Placemark><name>KML Place</name></Placemark></kml>"], {
        type: "application/vnd.google-earth.kml+xml"
      }),
      fileName: "place.kml",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(true);
    expect(kmlMock).toHaveBeenCalledWith(expect.any(Document));
    expect(gisSummary?.textContent).toContain("要素1");
    expect(bindTooltip).toHaveBeenCalledWith("KML Place", expect.objectContaining({ className: "ofv-map-tooltip" }));

    viewer.destroy();
  });

  it("converts GPX tracks into map features in the browser", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    gpxMock.mockReturnValueOnce(featureCollection("Morning Ride", [120.2, 30.1]));

    const viewer = createViewer({
      container,
      file: new Blob(["<gpx><trk><name>Morning Ride</name></trk></gpx>"], { type: "application/gpx+xml" }),
      fileName: "ride.gpx",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(true);
    expect(gpxMock).toHaveBeenCalledWith(expect.any(Document));
    expect(gisSummary?.textContent).toContain("Point 1");
    expect(bindTooltip).toHaveBeenCalledWith("Morning Ride", expect.objectContaining({ className: "ofv-map-tooltip" }));

    viewer.destroy();
  });

  it("extracts KML from KMZ archives and renders it as map features", async () => {
    const container = document.createElement("div");
    const zip = new JSZip();
    zip.file("doc.kml", "<kml><Placemark><name>KMZ Place</name></Placemark></kml>");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    document.body.append(container);
    kmlMock.mockReturnValueOnce(featureCollection("KMZ Place", [114.1, 22.3]));

    const viewer = createViewer({
      container,
      file: buffer,
      fileName: "place.kmz",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(true);
    expect(kmlMock).toHaveBeenCalledWith(expect.any(Document));
    expect(gisSummary?.textContent).toContain("要素1");
    expect(bindTooltip).toHaveBeenCalledWith("KMZ Place", expect.objectContaining({ className: "ofv-map-tooltip" }));

    viewer.destroy();
  });

  it("converts every TopoJSON object into a map FeatureCollection", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    topojsonFeatureMock
      .mockReturnValueOnce(featureCollection("Boundary", [118, 32]))
      .mockReturnValueOnce({
        type: "Feature",
        properties: { name: "Center" },
        geometry: { type: "Point", coordinates: [118.2, 32.1] }
      });

    const topology = {
      type: "Topology",
      objects: {
        areas: { type: "GeometryCollection", geometries: [] },
        center: { type: "Point", coordinates: [0, 0] }
      },
      arcs: []
    };

    const viewer = createViewer({
      container,
      file: new Blob([JSON.stringify(topology)], { type: "application/topo+json" }),
      fileName: "map.topojson",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(true);
    expect(topojsonFeatureMock).toHaveBeenCalledTimes(2);
    expect(gisSummary?.textContent).toContain("要素2");
    expect(bindTooltip).toHaveBeenCalledWith("Boundary", expect.objectContaining({ className: "ofv-map-tooltip" }));
    expect(bindTooltip).toHaveBeenCalledWith("Center", expect.objectContaining({ className: "ofv-map-tooltip" }));

    viewer.destroy();
  });

  it("renders raw .shp geometry without requiring DBF/SHX sidecars", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    shpMock.mockResolvedValueOnce({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [116.4, 39.9] }
        }
      ]
    });

    const viewer = createViewer({
      container,
      file: new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/octet-stream" }),
      fileName: "roads.shp",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-map-stage")));

    const gisSummary = container.querySelector<HTMLElement>(".ofv-gis-summary");
    expect(gisSummary?.hidden).toBe(true);
    expect(shpMock).toHaveBeenCalledWith(expect.objectContaining({ shp: expect.any(ArrayBuffer) }));
    expect(gisSummary?.textContent).toContain("要素1");
    expect(gisSummary?.textContent).toContain("Point 1");
    expect(container.querySelector(".ofv-viewport")?.classList.contains("ofv-center")).toBe(false);

    viewer.destroy();
    expect(container.childElementCount).toBe(0);
  });

  it("shows a helpful message when raw .shp geometry parsing fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    shpMock.mockRejectedValueOnce(new Error("bad shape header"));

    const viewer = createViewer({
      container,
      file: new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/octet-stream" }),
      fileName: "roads.shp",
      plugins: [gisPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("GIS 数据解析失败");
    expect(container.textContent).toContain("单个 .shp 几何解析失败：bad shape header");
    expect(container.textContent).toContain("如需属性字段");

    viewer.destroy();
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

function featureCollection(name: string, coordinates: [number, number]) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name },
        geometry: { type: "Point", coordinates }
      }
    ]
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
