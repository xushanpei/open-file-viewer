import {
  archivePlugin,
  assetPlugin,
  audioPlugin,
  cadPlugin,
  createViewer,
  drawingPlugin,
  emailPlugin,
  epubPlugin,
  gisPlugin,
  imagePlugin,
  model3dPlugin,
  officePlugin,
  ofdPlugin,
  pdfPlugin,
  textPlugin,
  videoPlugin,
  type FileViewer,
  xpsPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./style.css";

type RemoteHarnessCase = {
  name: string;
  file: string | File;
  fileName: string;
  selector: string;
};

const remoteCases: RemoteHarnessCase[] = [
  {
    name: "remote-md",
    file: "https://raw.githubusercontent.com/markedjs/marked/master/README.md",
    fileName: "README.md",
    selector: ".ofv-markdown-body"
  },
  {
    name: "remote-json",
    file: "https://raw.githubusercontent.com/vega/vega/main/docs/data/cars.json",
    fileName: "cars.json",
    selector: ".ofv-code-container"
  },
  {
    name: "remote-csv",
    file: "https://raw.githubusercontent.com/plotly/datasets/master/2014_apple_stock.csv",
    fileName: "apple-stock.csv",
    selector: ".ofv-table-scroll, .ofv-code-container"
  },
  {
    name: "remote-pdf",
    file: "https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/basicapi.pdf",
    fileName: "basicapi.pdf",
    selector: ".ofv-pdf-page-wrapper"
  },
  {
    name: "remote-docx",
    file: "https://raw.githubusercontent.com/rounakdatta/CorrectLy/master/sample.docx",
    fileName: "sample.docx",
    selector: ".ofv-docx-document"
  },
  {
    name: "remote-xlsx",
    file: "https://raw.githubusercontent.com/LEARNEREA/Excel_Files/master/Products.xlsx",
    fileName: "Products.xlsx",
    selector: ".ofv-table-scroll"
  },
  {
    name: "remote-svg",
    file: "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/github.svg",
    fileName: "github.svg",
    selector: ".ofv-image-stage, .ofv-svg-stage, .ofv-image-content"
  },
  {
    name: "remote-jpg",
    file: "https://raw.githubusercontent.com/mdn/learning-area/master/html/multimedia-and-embedding/images-in-html/dinosaur_small.jpg",
    fileName: "dinosaur_small.jpg",
    selector: ".ofv-image-stage, .ofv-image-content"
  },
  {
    name: "remote-geojson",
    file: "https://raw.githubusercontent.com/johan/world.geo.json/master/countries/USA.geo.json",
    fileName: "USA.geojson",
    selector: ".ofv-map-stage"
  },
  {
    name: "remote-obj",
    file: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/obj/tree.obj",
    fileName: "tree.obj",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "remote-mp3",
    file: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
    fileName: "t-rex-roar.mp3",
    selector: ".ofv-audio audio"
  },
  {
    name: "remote-mp4",
    file: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    fileName: "flower.mp4",
    selector: ".ofv-video-stage video"
  }
];

const localCases: RemoteHarnessCase[] = [
  {
    name: "local-docx",
    file: docxFile(),
    fileName: "harness.docx",
    selector: ".ofv-docx-document"
  },
  {
    name: "local-docx-textbox",
    file: textboxDocxFile(),
    fileName: "textbox-harness.docx",
    selector: ".ofv-docx-document .ofv-document"
  },
  {
    name: "local-docm",
    file: docxFile({
      name: "harness.docm",
      type: "application/vnd.ms-word.document.macroenabled.12",
      label: "DOCM"
    }),
    fileName: "harness.docm",
    selector: ".ofv-docx-document"
  },
  {
    name: "local-dotx",
    file: docxFile({
      name: "harness.dotx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
      label: "DOTX"
    }),
    fileName: "harness.dotx",
    selector: ".ofv-docx-document"
  },
  {
    name: "local-dotm",
    file: docxFile({
      name: "harness.dotm",
      type: "application/vnd.ms-word.template.macroenabled.12",
      label: "DOTM"
    }),
    fileName: "harness.dotm",
    selector: ".ofv-docx-document"
  },
  {
    name: "local-doc-binary",
    file: new File([minimalOle("WordDocument")], "harness.doc", { type: "application/msword" }),
    fileName: "harness.doc",
    selector: ".ofv-office-conversion"
  },
  {
    name: "local-xlsx",
    file: xlsxFile(),
    fileName: "harness.xlsx",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-xlsm",
    file: xlsxFile({
      name: "harness.xlsm",
      type: "application/vnd.ms-excel.sheet.macroenabled.12",
      label: "XLSM"
    }),
    fileName: "harness.xlsm",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-xltx",
    file: xlsxFile({
      name: "harness.xltx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
      label: "XLTX"
    }),
    fileName: "harness.xltx",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-xltm",
    file: xlsxFile({
      name: "harness.xltm",
      type: "application/vnd.ms-excel.template.macroenabled.12",
      label: "XLTM"
    }),
    fileName: "harness.xltm",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-xlsb",
    file: new File([minimalOle("Workbook")], "harness.xlsb", { type: "application/vnd.ms-excel.sheet.binary.macroenabled.12" }),
    fileName: "harness.xlsb",
    selector: ".ofv-office-conversion"
  },
  {
    name: "local-xls-binary",
    file: new File([minimalOle("Workbook")], "harness.xls", { type: "application/vnd.ms-excel" }),
    fileName: "harness.xls",
    selector: ".ofv-office-conversion"
  },
  {
    name: "local-xlt",
    file: xlsxFile({
      name: "harness.xlt",
      type: "application/vnd.ms-excel",
      label: "XLT"
    }),
    fileName: "harness.xlt",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-geojson",
    file: new File([minimalGeoJson()], "harness.geojson", { type: "application/geo+json" }),
    fileName: "harness.geojson",
    selector: ".ofv-map-stage"
  },
  {
    name: "local-rtf",
    file: new File(["{\\rtf1\\ansi RTF harness paragraph}"], "harness.rtf", { type: "application/rtf" }),
    fileName: "harness.rtf",
    selector: ".ofv-text-block"
  },
  {
    name: "local-fodt",
    file: new File([flatOdtXml("FODT harness paragraph")], "harness.fodt", {
      type: "application/vnd.oasis.opendocument.text-flat-xml"
    }),
    fileName: "harness.fodt",
    selector: ".ofv-document"
  },
  {
    name: "local-fods",
    file: new File([flatOdsXml("FODS harness cell")], "harness.fods", {
      type: "application/vnd.oasis.opendocument.spreadsheet-flat-xml"
    }),
    fileName: "harness.fods",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-ods",
    file: odsFile(),
    fileName: "harness.ods",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-csv",
    file: new File(["name,score,notes\nAda,99,CSV harness cell\nGrace,98,wide table regression"], "harness.csv", {
      type: "text/csv"
    }),
    fileName: "harness.csv",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-tsv",
    file: new File(["name\tscore\tnotes\nAda\t99\tTSV harness cell\nGrace\t98\twide table regression"], "harness.tsv", {
      type: "text/tab-separated-values"
    }),
    fileName: "harness.tsv",
    selector: ".ofv-table-scroll"
  },
  {
    name: "local-fodp",
    file: new File([flatOdpXml("FODP harness slide")], "harness.fodp", {
      type: "application/vnd.oasis.opendocument.presentation-flat-xml"
    }),
    fileName: "harness.fodp",
    selector: ".ofv-slide"
  },
  {
    name: "local-odp",
    file: odpFile(),
    fileName: "harness.odp",
    selector: ".ofv-slide"
  },
  {
    name: "local-pptx",
    file: pptxFile(),
    fileName: "harness.pptx",
    selector: ".ofv-pptx-viewer, .ofv-slide"
  },
  {
    name: "local-ppsx",
    file: pptxFile({
      name: "harness.ppsx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
      label: "PPSX"
    }),
    fileName: "harness.ppsx",
    selector: ".ofv-pptx-viewer, .ofv-slide"
  },
  {
    name: "local-pptm",
    file: pptxFile({
      name: "harness.pptm",
      type: "application/vnd.ms-powerpoint.presentation.macroenabled.12",
      label: "PPTM"
    }),
    fileName: "harness.pptm",
    selector: ".ofv-pptx-viewer, .ofv-slide"
  },
  {
    name: "local-potx",
    file: pptxFile({
      name: "harness.potx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.template",
      label: "POTX"
    }),
    fileName: "harness.potx",
    selector: ".ofv-pptx-viewer, .ofv-slide"
  },
  {
    name: "local-ppt-binary",
    file: new File([minimalOle("PowerPoint Document")], "harness.ppt", { type: "application/vnd.ms-powerpoint" }),
    fileName: "harness.ppt",
    selector: ".ofv-office-conversion"
  },
  {
    name: "local-zip",
    file: zipFile("harness.zip", "application/zip", [
      { path: "readme.txt", content: "Archive harness file" },
      { path: "data/config.json", content: JSON.stringify({ harness: true, viewer: "open-file-viewer" }) }
    ]),
    fileName: "harness.zip",
    selector: ".ofv-archive-item"
  },
  {
    name: "local-rar",
    file: new File([minimalRar4()], "harness.rar", { type: "application/vnd.rar" }),
    fileName: "harness.rar",
    selector: ".ofv-archive-probe-table"
  },
  {
    name: "local-7z",
    file: new File([minimal7z()], "harness.7z", { type: "application/x-7z-compressed" }),
    fileName: "harness.7z",
    selector: ".ofv-archive-probe-meta"
  },
  {
    name: "local-tar",
    file: new File([minimalTar("readme.txt", "Hello tar archive")], "harness.tar", { type: "application/x-tar" }),
    fileName: "harness.tar",
    selector: ".ofv-archive-item"
  },
  {
    name: "local-gz",
    file: new File([gzipText("Hello gzip archive")], "readme.txt.gz", { type: "application/gzip" }),
    fileName: "readme.txt.gz",
    selector: ".ofv-archive-item, .ofv-code-container"
  },
  {
    name: "local-tgz",
    file: new File([gzipBytes(new Uint8Array(minimalTar("readme.txt", "Hello tgz archive")))], "harness.tgz", {
      type: "application/gzip"
    }),
    fileName: "harness.tgz",
    selector: ".ofv-archive-item, .ofv-code-container, .ofv-fallback"
  },
  {
    name: "local-bz2",
    file: new File([sampleBzip2Text()], "readme.txt.bz2", { type: "application/x-bzip2" }),
    fileName: "readme.txt.bz2",
    selector: ".ofv-archive-item, .ofv-code-container"
  },
  {
    name: "local-xz",
    file: new File([sampleXzText()], "readme.txt.xz", { type: "application/x-xz" }),
    fileName: "readme.txt.xz",
    selector: ".ofv-archive-item, .ofv-code-container"
  },
  {
    name: "local-eml",
    file: new File([plainEmail("Email harness body")], "harness.eml", { type: "message/rfc822" }),
    fileName: "harness.eml",
    selector: ".ofv-email"
  },
  {
    name: "local-html-eml",
    file: new File([htmlEmail("<p>HTML email harness body</p>")], "harness-html.eml", { type: "message/rfc822" }),
    fileName: "harness-html.eml",
    selector: ".ofv-email-body-iframe"
  },
  {
    name: "local-msg",
    file: new File(["MSG harness fallback body"], "harness.msg", { type: "application/vnd.ms-outlook" }),
    fileName: "harness.msg",
    selector: ".ofv-email"
  },
  {
    name: "local-mbox",
    file: new File([mboxEmail()], "harness.mbox", { type: "application/mbox" }),
    fileName: "harness.mbox",
    selector: ".ofv-email"
  },
  {
    name: "local-epub",
    file: epubFile(),
    fileName: "harness.epub",
    selector: ".ofv-epub-reader"
  },
  {
    name: "local-xps",
    file: xpsFile(),
    fileName: "harness.xps",
    selector: ".ofv-xps-pages"
  },
  {
    name: "local-ofd",
    file: ofdFile(),
    fileName: "harness.ofd",
    selector: ".ofv-ofd-pages"
  },
  {
    name: "local-dxf",
    file: new File([minimalDxf()], "harness.dxf", { type: "image/vnd.dxf" }),
    fileName: "harness.dxf",
    selector: ".ofv-svg-stage"
  },
  {
    name: "local-drawio",
    file: new File([minimalDrawio()], "harness.drawio", { type: "application/vnd.jgraph.mxfile" }),
    fileName: "harness.drawio",
    selector: ".ofv-svg-stage"
  },
  {
    name: "local-excalidraw",
    file: new File([minimalExcalidraw()], "harness.excalidraw", { type: "application/vnd.excalidraw+json" }),
    fileName: "harness.excalidraw",
    selector: ".ofv-svg-stage"
  },
  {
    name: "local-dio",
    file: new File([minimalDrawio()], "harness.dio", { type: "application/vnd.jgraph.mxfile" }),
    fileName: "harness.dio",
    selector: ".ofv-svg-stage"
  },
  {
    name: "local-tldraw",
    file: new File([minimalTldraw()], "harness.tldraw", { type: "application/json" }),
    fileName: "harness.tldraw",
    selector: ".ofv-svg-stage"
  },
  {
    name: "local-step",
    file: new File([minimalStep()], "harness.step", { type: "model/step" }),
    fileName: "harness.step",
    selector: ".ofv-cad-geometry-stage"
  },
  {
    name: "local-gds",
    file: new File([minimalGds()], "harness.gds", { type: "application/vnd.gds" }),
    fileName: "harness.gds",
    selector: ".ofv-layout-stage"
  },
  {
    name: "local-oas",
    file: new File([minimalOasis()], "harness.oas", { type: "application/vnd.oasis.layout" }),
    fileName: "harness.oas",
    selector: ".ofv-layout-stage"
  },
  {
    name: "local-dwg",
    file: new File([minimalDwg()], "harness.dwg", { type: "application/acad" }),
    fileName: "harness.dwg",
    selector: ".ofv-cad-conversion"
  },
  {
    name: "local-pdf",
    file: new File([minimalPdf()], "harness.pdf", { type: "application/pdf" }),
    fileName: "harness.pdf",
    selector: ".ofv-pdf-page-wrapper"
  },
  {
    name: "local-ai-pdf",
    file: new File([minimalPdfCompatibleAi()], "harness.ai", { type: "application/postscript" }),
    fileName: "harness.ai",
    selector: ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper"
  },
  {
    name: "local-tiff",
    file: new File([minimalTiff()], "harness.tiff", { type: "image/tiff" }),
    fileName: "harness.tiff",
    selector: ".ofv-tiff-canvas"
  },
  {
    name: "local-png",
    file: new File([minimalPng()], "harness.png", { type: "image/png" }),
    fileName: "harness.png",
    selector: ".ofv-image-content"
  },
  {
    name: "local-jpeg",
    file: new File([minimalJpeg()], "harness.jpeg", { type: "image/jpeg" }),
    fileName: "harness.jpeg",
    selector: ".ofv-image-content"
  },
  {
    name: "local-heic",
    file: new File([minimalHeif()], "harness.heic", { type: "image/heic" }),
    fileName: "harness.heic",
    selector: ".ofv-image-content, .ofv-fallback"
  },
  {
    name: "local-bmp",
    file: new File([minimalBmp()], "harness.bmp", { type: "image/bmp" }),
    fileName: "harness.bmp",
    selector: ".ofv-image-content"
  },
  {
    name: "local-gif",
    file: new File([minimalGif()], "harness.gif", { type: "image/gif" }),
    fileName: "harness.gif",
    selector: ".ofv-image-content"
  },
  {
    name: "local-webp",
    file: new File([minimalWebp()], "harness.webp", { type: "image/webp" }),
    fileName: "harness.webp",
    selector: ".ofv-image-content"
  },
  {
    name: "local-avif",
    file: new File([minimalAvif()], "harness.avif", { type: "image/avif" }),
    fileName: "harness.avif",
    selector: ".ofv-image-content, .ofv-fallback"
  },
  {
    name: "local-heif",
    file: new File([minimalHeif()], "harness.heif", { type: "image/heif" }),
    fileName: "harness.heif",
    selector: ".ofv-image-content, .ofv-fallback"
  },
  {
    name: "local-ico",
    file: new File([minimalIco()], "harness.ico", { type: "image/x-icon" }),
    fileName: "harness.ico",
    selector: ".ofv-image-content"
  },
  {
    name: "local-jxl",
    file: new File([minimalJxl()], "harness.jxl", { type: "image/jxl" }),
    fileName: "harness.jxl",
    selector: ".ofv-image-info, .ofv-fallback"
  },
  {
    name: "local-psd",
    file: new File([minimalPsdComposite()], "harness.psd", { type: "image/vnd.adobe.photoshop" }),
    fileName: "harness.psd",
    selector: ".ofv-psd-canvas"
  },
  {
    name: "local-eps",
    file: new File([minimalEps()], "harness.eps", { type: "application/postscript" }),
    fileName: "harness.eps",
    selector: ".ofv-data-preview, .ofv-ai-pdf-preview"
  },
  {
    name: "local-wasm",
    file: new File([minimalWasm()], "harness.wasm", { type: "application/wasm" }),
    fileName: "harness.wasm",
    selector: ".ofv-wasm-preview"
  },
  {
    name: "local-sqlite",
    file: new File([minimalSqlite()], "harness.sqlite", { type: "application/vnd.sqlite3" }),
    fileName: "harness.sqlite",
    selector: ".ofv-sqlite-preview"
  },
  {
    name: "local-sqlite3",
    file: new File([minimalSqlite()], "harness.sqlite3", { type: "application/vnd.sqlite3" }),
    fileName: "harness.sqlite3",
    selector: ".ofv-sqlite-preview"
  },
  {
    name: "local-db",
    file: new File([minimalSqlite()], "harness.db", { type: "application/vnd.sqlite3" }),
    fileName: "harness.db",
    selector: ".ofv-sqlite-preview"
  },
  {
    name: "local-font",
    file: new File([minimalWoff2()], "harness.woff2", { type: "font/woff2" }),
    fileName: "harness.woff2",
    selector: ".ofv-font-preview"
  },
  {
    name: "local-woff",
    file: new File([minimalWoff()], "harness.woff", { type: "font/woff" }),
    fileName: "harness.woff",
    selector: ".ofv-font-preview"
  },
  {
    name: "local-ttf",
    file: new File([minimalSfnt()], "harness.ttf", { type: "font/ttf" }),
    fileName: "harness.ttf",
    selector: ".ofv-font-preview"
  },
  {
    name: "local-otf",
    file: new File([minimalSfnt("OTTO")], "harness.otf", { type: "font/otf" }),
    fileName: "harness.otf",
    selector: ".ofv-font-preview"
  },
  {
    name: "local-avro",
    file: new File([minimalAvro()], "harness.avro", { type: "application/avro" }),
    fileName: "harness.avro",
    selector: ".ofv-avro-records, .ofv-data-preview"
  },
  {
    name: "local-parquet",
    file: new File([minimalParquet()], "harness.parquet", { type: "application/vnd.apache.parquet" }),
    fileName: "harness.parquet",
    selector: ".ofv-parquet-records, .ofv-data-preview"
  },
  {
    name: "local-webarchive",
    file: new File([xmlWebArchive()], "harness.webarchive", { type: "application/x-webarchive" }),
    fileName: "harness.webarchive",
    selector: ".ofv-webarchive-snippet"
  },
  {
    name: "local-flac",
    file: new File([minimalFlac()], "harness.flac", { type: "audio/flac" }),
    fileName: "harness.flac",
    selector: ".ofv-audio audio, .ofv-fallback"
  },
  {
    name: "local-wav",
    file: new File([minimalWav()], "harness.wav", { type: "audio/wav" }),
    fileName: "harness.wav",
    selector: ".ofv-audio audio, .ofv-fallback"
  },
  {
    name: "local-aiff",
    file: new File([minimalAiff()], "harness.aiff", { type: "audio/aiff" }),
    fileName: "harness.aiff",
    selector: ".ofv-audio audio, .ofv-fallback"
  },
  {
    name: "local-midi",
    file: new File([minimalMidi()], "harness.mid", { type: "audio/midi" }),
    fileName: "harness.mid",
    selector: ".ofv-audio audio, .ofv-fallback"
  },
  {
    name: "local-au",
    file: new File([minimalAu()], "harness.au", { type: "audio/basic" }),
    fileName: "harness.au",
    selector: ".ofv-audio audio, .ofv-fallback"
  },
  {
    name: "local-aac",
    file: new File([minimalAdtsAac()], "harness.aac", { type: "audio/aac" }),
    fileName: "harness.aac",
    selector: ".ofv-audio audio, .ofv-fallback"
  },
  {
    name: "local-ogg-opus",
    file: new File([minimalOggOpus()], "harness.ogg", { type: "audio/ogg" }),
    fileName: "harness.ogg",
    selector: ".ofv-audio audio, .ofv-fallback"
  },
  {
    name: "local-webm",
    file: new File([minimalWebm()], "harness.webm", { type: "video/webm" }),
    fileName: "harness.webm",
    selector: ".ofv-fallback, .ofv-video-stage video"
  },
  {
    name: "local-mov",
    file: new File([minimalMp4()], "harness.mov", { type: "video/quicktime" }),
    fileName: "harness.mov",
    selector: ".ofv-fallback, .ofv-video-stage video"
  },
  {
    name: "local-mkv",
    file: new File([minimalWebm()], "harness.mkv", { type: "video/x-matroska" }),
    fileName: "harness.mkv",
    selector: ".ofv-fallback, .ofv-video-stage video"
  },
  {
    name: "local-flv",
    file: new File([minimalFlv()], "harness.flv", { type: "video/x-flv" }),
    fileName: "harness.flv",
    selector: ".ofv-fallback, .ofv-video-stage video"
  },
  {
    name: "local-hls",
    file: new File([minimalHls()], "harness.m3u8", { type: "application/vnd.apple.mpegurl" }),
    fileName: "harness.m3u8",
    selector: ".ofv-video-hls-summary, .ofv-fallback"
  },
  {
    name: "local-kml",
    file: new File([minimalKml()], "harness.kml", { type: "application/vnd.google-earth.kml+xml" }),
    fileName: "harness.kml",
    selector: ".ofv-map-stage"
  },
  {
    name: "local-gpx",
    file: new File([minimalGpx()], "harness.gpx", { type: "application/gpx+xml" }),
    fileName: "harness.gpx",
    selector: ".ofv-map-stage"
  },
  {
    name: "local-topojson",
    file: new File([minimalTopoJson()], "harness.topojson", { type: "application/topo+json" }),
    fileName: "harness.topojson",
    selector: ".ofv-map-stage"
  },
  {
    name: "local-kmz",
    file: kmzFile(),
    fileName: "harness.kmz",
    selector: ".ofv-map-stage"
  },
  {
    name: "local-ifc",
    file: new File([minimalIfc()], "harness.ifc", { type: "application/x-step" }),
    fileName: "harness.ifc",
    selector: ".ofv-cad"
  },
  {
    name: "local-iges",
    file: new File([minimalIges()], "harness.iges", { type: "application/iges" }),
    fileName: "harness.iges",
    selector: ".ofv-cad-geometry-stage"
  },
  {
    name: "local-igs",
    file: new File([minimalIges()], "harness.igs", { type: "application/iges" }),
    fileName: "harness.igs",
    selector: ".ofv-cad-geometry-stage"
  },
  {
    name: "local-stp",
    file: new File([minimalStep()], "harness.stp", { type: "model/step" }),
    fileName: "harness.stp",
    selector: ".ofv-cad-geometry-stage"
  },
  {
    name: "local-sab",
    file: new File([minimalSat()], "harness.sab", { type: "application/sat" }),
    fileName: "harness.sab",
    selector: ".ofv-cad-conversion"
  },
  {
    name: "local-sat",
    file: new File([minimalSat()], "harness.sat", { type: "application/sat" }),
    fileName: "harness.sat",
    selector: ".ofv-cad-geometry-stage"
  },
  {
    name: "local-parasolid",
    file: new File([minimalParasolidText()], "harness.x_t", { type: "application/x-parasolid" }),
    fileName: "harness.x_t",
    selector: ".ofv-cad-geometry-stage"
  },
  {
    name: "local-gltf",
    file: new File([minimalGltf()], "harness.gltf", { type: "model/gltf+json" }),
    fileName: "harness.gltf",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-glb",
    file: new File([minimalGlb()], "harness.glb", { type: "model/gltf-binary" }),
    fileName: "harness.glb",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-stl",
    file: new File([minimalAsciiStl()], "harness.stl", { type: "model/stl" }),
    fileName: "harness.stl",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-ply",
    file: new File([minimalAsciiPly()], "harness.ply", { type: "application/ply" }),
    fileName: "harness.ply",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-vrml",
    file: new File([minimalVrml()], "harness.wrl", { type: "model/vrml" }),
    fileName: "harness.wrl",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-dae",
    file: new File([minimalCollada()], "harness.dae", { type: "model/vnd.collada+xml" }),
    fileName: "harness.dae",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-3ds",
    file: new File([minimal3ds()], "harness.3ds", { type: "model/3ds" }),
    fileName: "harness.3ds",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-3mf",
    file: threeMfFile(),
    fileName: "harness.3mf",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-usd",
    file: new File([minimalUsd()], "harness.usda", { type: "model/vnd.usd" }),
    fileName: "harness.usda",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-usd-ext",
    file: new File([minimalUsd()], "harness.usd", { type: "model/vnd.usd" }),
    fileName: "harness.usd",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  },
  {
    name: "local-fbx-fallback",
    file: new File(["FBX"], "harness.fbx", { type: "application/vnd.autodesk.fbx" }),
    fileName: "harness.fbx",
    selector: ".ofv-model-stage canvas, .ofv-fallback"
  }
];

const cases: RemoteHarnessCase[] = [...remoteCases, ...localCases];

const params = new URLSearchParams(window.location.search);
const customFile = params.get("file");
if (customFile) {
  cases.unshift({
    name: "custom-url",
    file: customFile,
    fileName: params.get("fileName") || customFile.split(/[/?#]/).filter(Boolean).pop() || "remote-file",
    selector: params.get("selector") || ".ofv-viewport > *"
  });
}

const plugins = [
  imagePlugin(),
  videoPlugin(),
  audioPlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc }),
  epubPlugin(),
  xpsPlugin(),
  officePlugin(),
  ofdPlugin(),
  archivePlugin(),
  emailPlugin(),
  drawingPlugin(),
  cadPlugin(),
  model3dPlugin(),
  gisPlugin(),
  assetPlugin(),
  textPlugin()
];

const bar = document.querySelector<HTMLElement>("#remoteHarnessBar");
const viewerHost = document.querySelector<HTMLElement>("#viewer");
if (!bar || !viewerHost) {
  throw new Error("Remote harness host is missing.");
}
const viewerContainer = viewerHost;

document.body.style.margin = "0";
document.body.style.background = "#f8fafc";
bar.style.cssText =
  "display:flex;gap:8px;padding:10px;background:#fff;border-bottom:1px solid #ddd;position:sticky;top:0;z-index:2;flex-wrap:wrap";
viewerHost.style.cssText = "height:calc(100vh - 56px);min-height:520px";

let viewer: FileViewer | undefined;

function mount(index: number): void {
  const item = cases[index] || cases[0];
  viewer?.destroy();
  delete window.__ofvLastError;
  delete window.__ofvLastLoad;
  window.__ofvCurrent = item;
  viewer = createViewer({
    container: viewerContainer,
    file: item.file,
    fileName: item.fileName,
    height: "100%",
    theme: "light",
    toolbar: true,
    plugins,
    onLoad(file) {
      window.__ofvLastLoad = {
        extension: file.extension,
        mimeType: file.mimeType,
        name: file.name
      };
    },
    onError(error) {
      window.__ofvLastError = error instanceof Error ? error.message : String(error);
    }
  });
}

window.__ofvCases = cases;
window.__ofvMount = mount;

cases.forEach((item, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = item.name;
  button.dataset.index = String(index);
  button.addEventListener("click", () => mount(index));
  bar.append(button);
});

mount(0);

declare global {
  interface Window {
    __ofvCases?: RemoteHarnessCase[];
    __ofvCurrent?: RemoteHarnessCase;
    __ofvLastError?: string;
    __ofvLastLoad?: {
      extension: string;
      mimeType: string;
      name: string;
    };
    __ofvMount?: (index: number) => void;
  }
}

function flatOdtXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:text><text:p>${escapeXml(text)}</text:p></office:text></office:body>
</office:document>`;
}

function flatOdsXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:spreadsheet>
    <table:table table:name="Harness"><table:table-row><table:table-cell><text:p>${escapeXml(text)}</text:p></table:table-cell></table:table-row></table:table>
  </office:spreadsheet></office:body>
</office:document>`;
}

function flatOdpXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:presentation>
    <presentation:page presentation:name="Slide 1"><text:p>${escapeXml(text)}</text:p></presentation:page>
  </office:presentation></office:body>
</office:document>`;
}

function odsFile(): File {
  return zipFile("harness.ods", "application/vnd.oasis.opendocument.spreadsheet", [
    { path: "mimetype", content: "application/vnd.oasis.opendocument.spreadsheet" },
    {
      path: "META-INF/manifest.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.spreadsheet" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
</manifest:manifest>`
    },
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`
    },
    { path: "content.xml", content: flatOdsXml("ODS harness cell") }
  ]);
}

function odpFile(): File {
  return zipFile("harness.odp", "application/vnd.oasis.opendocument.presentation", [
    { path: "content.xml", content: flatOdpXml("ODP harness slide") }
  ]);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function docxFile(options: { name?: string; type?: string; label?: string } = {}): File {
  const name = options.name || "harness.docx";
  const type = options.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const label = options.label || "DOCX";
  return zipFile(
    name,
    type,
    [
      {
        path: "[Content_Types].xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
      },
      {
        path: "_rels/.rels",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
      },
      {
        path: "word/document.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escapeXml(label)} harness preview</w:t></w:r></w:p>
    <w:p><w:r><w:t>This local ${escapeXml(label)} sample verifies browser rendering without relying on remote CORS resources.</w:t></w:r></w:p>
    <w:p><w:r><w:t>It should support zoom commands, keep rotation disabled, and remain readable inside the viewer container.</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`
      }
    ]
  );
}

function textboxDocxFile(): File {
  return zipFile(
    "textbox-harness.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    [
      {
        path: "[Content_Types].xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
      },
      {
        path: "_rels/.rels",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
      },
      {
        path: "word/document.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wps:wsp>
            <wps:txbx>
              <w:txbxContent>
                <w:p><w:r><w:t>Textbox DOCX harness</w:t></w:r></w:p>
                <w:p><w:r><w:t>Web frontend resume content</w:t></w:r></w:p>
                <w:p><w:r><w:t>Project experience should stay readable</w:t></w:r></w:p>
              </w:txbxContent>
            </wps:txbx>
          </wps:wsp>
        </w:drawing>
      </w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`
      }
    ]
  );
}

function xlsxFile(
  options: { name?: string; type?: string; label?: string } = {}
): File {
  const name = options.name || "harness.xlsx";
  const type = options.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const label = options.label || "XLSX";
  return zipFile(name, type, [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Harness" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    },
    {
      path: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Format</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Status</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Long note</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>${escapeXml(label)}</t></is></c>
      <c r="B2" t="inlineStr"><is><t>Ready</t></is></c>
      <c r="C2" t="inlineStr"><is><t>This local workbook checks sheet scrolling, column width handling, and shared zoom commands.</t></is></c>
    </row>
    <row r="3">
      <c r="A3" t="inlineStr"><is><t>Formula</t></is></c>
      <c r="B3"><f>SUM(B4:B5)</f><v>42</v></c>
      <c r="C3" t="inlineStr"><is><t>Formula metadata should stay hidden from the visible successful preview.</t></is></c>
    </row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>Value A</t></is></c><c r="B4"><v>20</v></c></row>
    <row r="5"><c r="A5" t="inlineStr"><is><t>Value B</t></is></c><c r="B5"><v>22</v></c></row>
  </sheetData>
</worksheet>`
    }
  ]);
}

function pptxFile(
  options: { name?: string; type?: string; label?: string } = {}
): File {
  const name = options.name || "harness.pptx";
  const type = options.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const label = options.label || "PPTX";
  return zipFile(name, type, [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
    },
    {
      path: "ppt/presentation.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500"/>
</p:presentation>`
    },
    {
      path: "ppt/_rels/presentation.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`
    },
    {
      path: "ppt/slides/slide1.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="1" name="${escapeXml(label)} text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(label)} harness slide</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
    }
  ]);
}

function minimalGeoJson(): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Harness route" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-122.42, 37.78],
            [-122.41, 37.79],
            [-122.4, 37.785]
          ]
        }
      }
    ]
  });
}

type ZipEntry = {
  path: string;
  content: string | Uint8Array;
};

function zipFile(name: string, type: string, entries: ZipEntry[]): File {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(data);
    const local = concatBytes(
      uint32Le(0x04034b50),
      uint16Le(20),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint32Le(crc),
      uint32Le(data.length),
      uint32Le(data.length),
      uint16Le(nameBytes.length),
      uint16Le(0),
      nameBytes,
      data
    );
    const central = concatBytes(
      uint32Le(0x02014b50),
      uint16Le(20),
      uint16Le(20),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint32Le(crc),
      uint32Le(data.length),
      uint32Le(data.length),
      uint16Le(nameBytes.length),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint32Le(0),
      uint32Le(offset),
      nameBytes
    );
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDirectory = concatBytes(...centralParts);
  const end = concatBytes(
    uint32Le(0x06054b50),
    uint16Le(0),
    uint16Le(0),
    uint16Le(entries.length),
    uint16Le(entries.length),
    uint32Le(centralDirectory.length),
    uint32Le(offset),
    uint16Le(0)
  );
  return new File([...localParts, centralDirectory, end].map(toArrayBuffer), name, { type });
}

function minimalRar4(): ArrayBuffer {
  const name = new TextEncoder().encode("docs/readme.txt");
  const headerSize = 32 + name.length;
  const bytes = new Uint8Array(7 + 13 + headerSize);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00], 0);
  let offset = 7;
  view.setUint16(offset, 0, true);
  bytes[offset + 2] = 0x73;
  view.setUint16(offset + 3, 0, true);
  view.setUint16(offset + 5, 13, true);
  view.setUint16(offset + 7, 0, true);
  view.setUint32(offset + 9, 0, true);
  offset += 13;
  view.setUint16(offset, 0, true);
  bytes[offset + 2] = 0x74;
  view.setUint16(offset + 3, 0, true);
  view.setUint16(offset + 5, headerSize, true);
  view.setUint32(offset + 7, 5, true);
  view.setUint32(offset + 11, 5, true);
  bytes[offset + 15] = 2;
  view.setUint32(offset + 16, 0, true);
  bytes[offset + 20] = 0x30;
  view.setUint32(offset + 21, 0, true);
  view.setUint16(offset + 25, 0, true);
  view.setUint16(offset + 26, name.length, true);
  view.setUint32(offset + 28, 0, true);
  bytes.set(name, offset + 32);
  return bytes.buffer;
}

function minimal7z(): ArrayBuffer {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  bytes.set([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04], 0);
  view.setUint32(8, 0, true);
  view.setUint32(12, 32, true);
  view.setUint32(16, 0, true);
  view.setUint32(20, 16, true);
  view.setUint32(24, 0, true);
  view.setUint32(28, 0x12345678, true);
  return bytes.buffer;
}

function minimalTar(fileName: string, contentText: string): ArrayBuffer {
  const content = new TextEncoder().encode(contentText);
  const header = new Uint8Array(512);
  header.set(ascii(fileName), 0);
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

function gzipText(text: string): ArrayBuffer {
  return gzipBytes(new TextEncoder().encode(text));
}

function gzipBytes(bytes: Uint8Array): ArrayBuffer {
  const header = [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff];
  const blocks: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0xffff) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + 0xffff));
    const final = offset + chunk.length >= bytes.length ? 1 : 0;
    blocks.push(final, ...uint16Le(chunk.length), ...uint16Le((~chunk.length) & 0xffff), ...chunk);
  }
  return Uint8Array.from([...header, ...blocks, ...uint32Le(crc32(bytes)), ...uint32Le(bytes.length)]).buffer;
}

function plainEmail(body: string): string {
  return [
    "From: product@example.com",
    "To: viewer@example.com",
    "Subject: Open File Viewer harness email",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ].join("\r\n");
}

function mboxEmail(): string {
  return [
    "From product@example.com Sat Jan 01 00:00:00 2026",
    "From: product@example.com",
    "To: viewer@example.com",
    "Subject: Open File Viewer harness mbox",
    "",
    "MBOX harness body"
  ].join("\n");
}

function htmlEmail(body: string): string {
  return [
    "From: product@example.com",
    "To: viewer@example.com",
    "Subject: Open File Viewer harness HTML email",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    body
  ].join("\r\n");
}

function epubFile(): File {
  return zipFile("harness.epub", "application/epub+zip", [
    { path: "mimetype", content: "application/epub+zip" },
    {
      path: "META-INF/container.xml",
      content: `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    },
    {
      path: "OPS/package.opf",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Open File Viewer EPUB Harness</dc:title>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`
    },
    {
      path: "OPS/chapter.xhtml",
      content: `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>EPUB harness chapter</h1><p>Readable EPUB body.</p></body></html>`
    }
  ]);
}

function xpsFile(): File {
  return zipFile("harness.xps", "application/vnd.ms-xpsdocument", [
    {
      path: "Documents/1/Pages/1.fpage",
      content: `<FixedPage xmlns="http://schemas.microsoft.com/xps/2005/06" Width="800" Height="600">
  <Glyphs UnicodeString="XPS harness page" />
</FixedPage>`
    },
    { path: "FixedDocSeq.fdseq", content: "<FixedDocumentSequence />" }
  ]);
}

function ofdFile(): File {
  return zipFile("harness.ofd", "application/ofd", [
    {
      path: "Doc_0/Pages/Page_0/Content.xml",
      content: `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Content><ofd:Layer>
    <ofd:TextObject Boundary="20 30 180 18" Size="12">
      <ofd:TextCode X="0" Y="0">OFD harness text</ofd:TextCode>
    </ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`
    }
  ]);
}

function minimalDxf(): string {
  return [
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
  ].join("\n");
}

function minimalDrawio(): string {
  return `<mxfile><diagram name="Harness"><mxGraphModel><root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Draw.io harness" vertex="1" parent="1">
      <mxGeometry x="20" y="20" width="140" height="60" as="geometry"/>
    </mxCell>
  </root></mxGraphModel></diagram></mxfile>`;
}

function minimalTldraw(): string {
  return JSON.stringify({
    records: [
      { id: "page:page", typeName: "page", name: "Page 1" },
      {
        id: "shape:box",
        typeName: "shape",
        type: "geo",
        parentId: "page:page",
        x: 24,
        y: 24,
        props: { w: 140, h: 72, geo: "rectangle", color: "blue", fill: "solid", text: "tldraw harness" }
      }
    ]
  });
}

function minimalExcalidraw(): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "open-file-viewer-harness",
    elements: [
      {
        id: "box",
        type: "rectangle",
        x: 20,
        y: 20,
        width: 140,
        height: 80,
        angle: 0,
        strokeColor: "#1f2937",
        backgroundColor: "#a7f3d0",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        groupIds: [],
        boundElements: null,
        updated: 1,
        link: null,
        locked: false
      }
    ],
    appState: {},
    files: {}
  });
}

function minimalStep(): string {
  return ["ISO-10303-21;", "DATA;", "#1=CARTESIAN_POINT('',(0.,0.,0.));", "ENDSEC;", "END-ISO-10303-21;"].join("\n");
}

function minimalDwg(): ArrayBuffer {
  return Uint8Array.from(ascii("AC1027\0\0DWGDATA\0LINE\0LAYER A-WALL\0BLOCK Door\0XREF site.dwg\0")).buffer;
}

function minimalGds(): ArrayBuffer {
  const records: number[] = [
    ...gdsRecord(0x0002, [0x00, 0x07]),
    ...gdsRecord(0x0102, new Array(24).fill(0)),
    ...gdsRecord(0x0206, [...ascii("OFV_LIB"), 0]),
    ...gdsRecord(0x0305, new Array(16).fill(0)),
    ...gdsRecord(0x0502, []),
    ...gdsRecord(0x0606, [...ascii("TOP"), 0]),
    ...gdsRecord(0x0800, []),
    ...gdsRecord(0x0d02, [0x00, 0x01]),
    ...gdsRecord(0x0e02, [0x00, 0x00]),
    ...gdsRecord(0x1003, [
      ...int32Be(0),
      ...int32Be(0),
      ...int32Be(1200),
      ...int32Be(0),
      ...int32Be(1200),
      ...int32Be(800),
      ...int32Be(0),
      ...int32Be(800),
      ...int32Be(0),
      ...int32Be(0)
    ]),
    ...gdsRecord(0x1100, []),
    ...gdsRecord(0x0700, []),
    ...gdsRecord(0x0400, [])
  ];
  return Uint8Array.from(records).buffer;
}

function minimalOasis(): ArrayBuffer {
  const compressedCellHints = [
    0x63, 0x66, 0x0e, 0xf1, 0x0f, 0x60, 0xe6, 0x70, 0xf1, 0x74, 0x8d, 0x0f, 0xf6, 0x8c, 0x72, 0x05, 0x00
  ];
  return Uint8Array.from([...ascii("%SEMI-OASIS\r\n"), 0x01, 0x03, ...ascii("1.0"), 0x00, 0x21, ...compressedCellHints, 0x02]).buffer;
}

function minimalPdf(): ArrayBuffer {
  return new TextEncoder().encode(
    [
      "%PDF-1.7",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 120 80] >> endobj",
      "trailer << /Root 1 0 R >>",
      "%%EOF"
    ].join("\n")
  ).buffer;
}

function minimalPdfCompatibleAi(): ArrayBuffer {
  return new TextEncoder().encode(
    ["%!PS-Adobe-3.0", "%%Creator: Open File Viewer harness", new TextDecoder().decode(minimalPdf())].join("\n")
  ).buffer;
}

function minimalTiff(): ArrayBuffer {
  const entryCount = 10;
  const ifdOffset = 8;
  const pixelOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const bytes = new Uint8Array(pixelOffset + 1);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 0x2a, 0x00]);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entryCount, true);
  writeTiffEntry(view, 10, 256, 4, 1, 1);
  writeTiffEntry(view, 22, 257, 4, 1, 1);
  writeTiffEntry(view, 34, 258, 3, 1, 8);
  writeTiffEntry(view, 46, 259, 3, 1, 1);
  writeTiffEntry(view, 58, 262, 3, 1, 1);
  writeTiffEntry(view, 70, 273, 4, 1, pixelOffset);
  writeTiffEntry(view, 82, 277, 3, 1, 1);
  writeTiffEntry(view, 94, 278, 4, 1, 1);
  writeTiffEntry(view, 106, 279, 4, 1, 1);
  writeTiffEntry(view, 118, 284, 3, 1, 1);
  view.setUint32(130, 0, true);
  bytes[pixelOffset] = 0xb8;
  return bytes.buffer;
}

function minimalPng(): ArrayBuffer {
  return base64ToArrayBuffer(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luz3egAAAABJRU5ErkJggg=="
  );
}

function minimalJpeg(): ArrayBuffer {
  return base64ToArrayBuffer(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/AKf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
  );
}

function writeTiffEntry(view: DataView, offset: number, tag: number, type: number, count: number, value: number): void {
  view.setUint16(offset, tag, true);
  view.setUint16(offset + 2, type, true);
  view.setUint32(offset + 4, count, true);
  if (type === 3 && count === 1) {
    view.setUint16(offset + 8, value, true);
  } else {
    view.setUint32(offset + 8, value, true);
  }
}

function minimalBmp(): ArrayBuffer {
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
  return bytes.buffer;
}

function minimalGif(): ArrayBuffer {
  return Uint8Array.from([
    ...ascii("GIF89a"),
    0x40, 0x00, 0x20, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0,
    0x02, 0x02, 0x44, 0x01, 0, 0x3b
  ]).buffer;
}

function minimalWebp(): ArrayBuffer {
  return base64ToArrayBuffer("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
}

function minimalAvif(): ArrayBuffer {
  const ftyp = bmffBox("ftyp", [...ascii("avif"), ...uint32Be(0), ...ascii("mif1"), ...ascii("avif")]);
  const ispe = bmffBox("ispe", [0, 0, 0, 0, ...uint32Be(640), ...uint32Be(360)]);
  const meta = bmffBox("meta", [0, 0, 0, 0, ...bmffBox("iprp", bmffBox("ipco", ispe))]);
  return Uint8Array.from([...ftyp, ...meta]).buffer;
}

function minimalHeif(): ArrayBuffer {
  const ftyp = bmffBox("ftyp", [...ascii("heic"), ...uint32Be(0), ...ascii("mif1"), ...ascii("heic")]);
  const ispe = bmffBox("ispe", [0, 0, 0, 0, ...uint32Be(800), ...uint32Be(600)]);
  const meta = bmffBox("meta", [0, 0, 0, 0, ...bmffBox("iprp", bmffBox("ipco", ispe))]);
  return Uint8Array.from([...ftyp, ...meta]).buffer;
}

function minimalIco(): ArrayBuffer {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  bytes[6] = 24;
  bytes[7] = 24;
  bytes[8] = 0;
  bytes[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, 4, true);
  view.setUint32(18, bytes.length, true);
  return bytes.buffer;
}

function minimalJxl(): ArrayBuffer {
  return Uint8Array.from([0xff, 0x0a, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]).buffer;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function minimalPsdComposite(): ArrayBuffer {
  const bytes = new Uint8Array(43);
  bytes.set(ascii("8BPS"), 0);
  setUint16Be(bytes, 4, 1);
  setUint16Be(bytes, 12, 3);
  setUint32Be(bytes, 14, 1);
  setUint32Be(bytes, 18, 1);
  setUint16Be(bytes, 22, 8);
  setUint16Be(bytes, 24, 3);
  setUint32Be(bytes, 26, 0);
  setUint32Be(bytes, 30, 0);
  setUint32Be(bytes, 34, 0);
  setUint16Be(bytes, 38, 0);
  bytes[40] = 0xff;
  bytes[41] = 0x50;
  bytes[42] = 0x20;
  return bytes.buffer;
}

function minimalEps(): string {
  return [
    "%!PS-Adobe-3.0 EPSF-3.0",
    "%%Title: Open File Viewer EPS harness",
    "%%BoundingBox: 0 0 120 80",
    "/Helvetica findfont 12 scalefont setfont",
    "10 40 moveto (EPS harness) show",
    "%%EOF"
  ].join("\n");
}

function minimalWoff2(): ArrayBuffer {
  const bytes = new Uint8Array(50);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("wOF2"), 0);
  bytes.set([0, 1, 0, 0], 4);
  view.setUint32(8, bytes.length, false);
  view.setUint16(12, 1, false);
  view.setUint32(16, 12, false);
  bytes[48] = 0x06;
  bytes[49] = 0x01;
  return bytes.buffer;
}

function minimalWoff(): ArrayBuffer {
  const bytes = new Uint8Array(44 + 20);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("wOFF"), 0);
  bytes.set([0, 1, 0, 0], 4);
  view.setUint32(8, bytes.length, false);
  view.setUint16(12, 1, false);
  view.setUint32(16, 12, false);
  bytes.set(ascii("name"), 44);
  view.setUint32(48, 64, false);
  return bytes.buffer;
}

function minimalSfnt(signature = "\0\x01\0\0"): ArrayBuffer {
  const bytes = new Uint8Array(12);
  bytes.set(ascii(signature), 0);
  return bytes.buffer;
}

function minimalSqlite(): ArrayBuffer {
  const bytes = new Uint8Array(512);
  bytes.set(ascii("SQLite format 3\0"), 0);
  bytes[16] = 0x02;
  bytes[17] = 0x00;
  bytes[18] = 0x01;
  bytes[19] = 0x01;
  bytes[20] = 0x00;
  bytes[21] = 0x40;
  bytes[22] = 0x20;
  bytes[23] = 0x20;
  setUint32Be(bytes, 28, 1);
  bytes[100] = 0x0d;
  return bytes.buffer;
}

function minimalWasm(): ArrayBuffer {
  return Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...wasmSection(1, [0x01, 0x60, 0x00, 0x00]),
    ...wasmSection(7, [0x01, ...wasmName("run"), 0x00, 0x00])
  ]).buffer;
}

function wasmSection(id: number, payload: number[]): number[] {
  return [id, ...wasmVarUint(payload.length), ...payload];
}

function wasmName(value: string): number[] {
  const bytes = ascii(value);
  return [...wasmVarUint(bytes.length), ...bytes];
}

function wasmVarUint(value: number): number[] {
  const out: number[] = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current !== 0) {
      byte |= 0x80;
    }
    out.push(byte);
  } while (current !== 0);
  return out;
}

function minimalAvro(): ArrayBuffer {
  const schema = JSON.stringify({
    type: "record",
    name: "Event",
    fields: [{ name: "name", type: "string" }]
  });
  const sync = Array.from({ length: 16 }, (_, index) => index);
  const metadata = [
    { key: "avro.schema", value: schema },
    { key: "avro.codec", value: "null" }
  ];
  const body = avroBytes("Launch");
  return Uint8Array.from([
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

function avroLong(value: number): number[] {
  return wasmVarUint((value << 1) >>> 0);
}

function avroBytes(value: string): number[] {
  const bytes = ascii(value);
  return [...avroLong(bytes.length), ...bytes];
}

function minimalParquet(): ArrayBuffer {
  return Uint8Array.from([...ascii("PAR1"), 1, 2, 3, 4, 4, 0, 0, 0, ...ascii("PAR1")]).buffer;
}

function minimalFlac(): ArrayBuffer {
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
  return bytes.buffer;
}

function minimalWav(): ArrayBuffer {
  const sampleRate = 8000;
  const channels = 1;
  const bitDepth = 8;
  const dataSize = 8;
  const bytes = new Uint8Array(44 + dataSize);
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
  bytes.fill(0x80, 44);
  return bytes.buffer;
}

function minimalAiff(): ArrayBuffer {
  const comm = [...ascii("COMM"), ...uint32Be(18), ...uint16Be(1), ...uint32Be(1), ...uint16Be(8), 0x40, 0x0b, 0xfa, 0, 0, 0, 0, 0, 0, 0, 0];
  const ssnd = [...ascii("SSND"), ...uint32Be(9), ...uint32Be(0), ...uint32Be(0), 0x80];
  const payload = [...ascii("AIFF"), ...comm, ...ssnd];
  return Uint8Array.from([...ascii("FORM"), ...uint32Be(payload.length), ...payload]).buffer;
}

function minimalMidi(): ArrayBuffer {
  return Uint8Array.from([
    ...ascii("MThd"), ...uint32Be(6), ...uint16Be(0), ...uint16Be(1), ...uint16Be(96),
    ...ascii("MTrk"), ...uint32Be(4), 0x00, 0xff, 0x2f, 0x00
  ]).buffer;
}

function minimalAu(): ArrayBuffer {
  const dataSize = 8;
  const bytes = new Uint8Array(24 + dataSize);
  bytes.set(ascii(".snd"), 0);
  bytes.set(uint32Be(24), 4);
  bytes.set(uint32Be(dataSize), 8);
  bytes.set(uint32Be(2), 12);
  bytes.set(uint32Be(8000), 16);
  bytes.set(uint32Be(1), 20);
  bytes.fill(0x80, 24);
  return bytes.buffer;
}

function minimalAdtsAac(): ArrayBuffer {
  return Uint8Array.from([0xff, 0xf1, 0x50, 0x80, 0x01, 0x1f, 0xfc]).buffer;
}

function minimalOggOpus(): ArrayBuffer {
  const opusHead = [...ascii("OpusHead"), 1, 2, ...uint16Le(312), ...uint32Le(48000), ...uint16Le(0), 0];
  return Uint8Array.from([
    ...oggPage({ granule: 0n, sequence: 0, packets: [opusHead] }),
    ...oggPage({ granule: 96312n, sequence: 1, packets: [[0xf8, 0xff, 0xfe]] })
  ]).buffer;
}

function minimalWebm(): ArrayBuffer {
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
  return Uint8Array.from([...header, ...ebmlElement(0x18538067, [...info, ...ebmlElement(0x1654ae6b, [...videoTrack, ...audioTrack])])]).buffer;
}

function minimalMp4(): ArrayBuffer {
  const ftyp = bmffBox("ftyp", [...ascii("isom"), 0, 0, 0, 1, ...ascii("isom")]);
  const mvhd = bmffBox("mvhd", [0, 0, 0, 0, ...uint32Be(0), ...uint32Be(0), ...uint32Be(1000), ...uint32Be(1000), ...new Array(80).fill(0)]);
  return Uint8Array.from([...ftyp, ...bmffBox("moov", mvhd)]).buffer;
}

function minimalFlv(): ArrayBuffer {
  return Uint8Array.from([...ascii("FLV"), 0x01, 0x05, 0x00, 0x00, 0x00, 0x09, 0, 0, 0, 0]).buffer;
}

function minimalHls(): string {
  return ["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=2500000", "hi/prog.m3u8", "#EXTINF:4.0,", "seg1.ts"].join("\n");
}

function minimalKml(): string {
  return `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>KML Place</name><Point><coordinates>118.78,32.04,0</coordinates></Point></Placemark></kml>`;
}

function minimalGpx(): string {
  return `<gpx version="1.1" creator="Open File Viewer"><wpt lat="32.04" lon="118.78"><name>GPX Point</name></wpt></gpx>`;
}

function minimalTopoJson(): string {
  return JSON.stringify({
    type: "Topology",
    objects: {
      point: {
        type: "GeometryCollection",
        geometries: [{ type: "Point", coordinates: [118.78, 32.04], properties: { name: "Topo Point" } }]
      }
    },
    arcs: []
  });
}

function kmzFile(): File {
  return zipFile("harness.kmz", "application/vnd.google-earth.kmz", [{ path: "doc.kml", content: minimalKml() }]);
}

function minimalIfc(): string {
  return [
    "ISO-10303-21;",
    "DATA;",
    "#1 = IFCPROJECT('0PROJECT',$,'Harness Project',$,$,$,$,$);",
    "#2 = IFCBUILDING('0BLDG',$,'Harness Building',$,$,$,$,$,$,$,$,$);",
    "#3 = IFCWALL('0WALL',$,'Harness Wall',$,$,$,$,$);",
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
  return ["700 0 1 0", "0 vertex $-1 0 0 0 #", "1 vertex $-1 100 0 0 #", "2 straight-curve $-1 0 0 0 1 0 0 #", "End-of-ACIS-data"].join(
    "\n"
  );
}

function minimal3ds(): ArrayBuffer {
  const bytes = new Uint8Array(6);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4d4d, true);
  view.setUint32(2, bytes.length, true);
  return bytes.buffer;
}

function minimalParasolidText(): string {
  return ["BEGIN HEADER;", "#1=point(0,0,0);", "#2=point(120,0,0);", "#3=line(0,0,0,120,0,0);", "END;"].join("\n");
}

function minimalGltf(): string {
  return JSON.stringify({
    asset: { version: "2.0", generator: "Open File Viewer harness" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Harness triangle" }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            mode: 4
          }
        ]
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0]
      }
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...minimalTriangleFloatBytes()))}`, byteLength: 36 }]
  });
}

function minimalGlb(): ArrayBuffer {
  const json = JSON.stringify({ asset: { version: "2.0", generator: "Open File Viewer harness" }, scene: 0, scenes: [{ nodes: [] }] });
  const jsonBytes = new TextEncoder().encode(json);
  const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const totalLength = 12 + 8 + paddedJsonLength;
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + paddedJsonLength);
  return bytes.buffer;
}

function minimalTriangleFloatBytes(): number[] {
  const bytes = new Uint8Array(36);
  const view = new DataView(bytes.buffer);
  const values = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return [...bytes];
}

function minimalAsciiStl(): string {
  return [
    "solid harness",
    "facet normal 0 0 1",
    "outer loop",
    "vertex 0 0 0",
    "vertex 1 0 0",
    "vertex 0 1 0",
    "endloop",
    "endfacet",
    "endsolid harness"
  ].join("\n");
}

function minimalAsciiPly(): string {
  return [
    "ply",
    "format ascii 1.0",
    "element vertex 3",
    "property float x",
    "property float y",
    "property float z",
    "element face 1",
    "property list uchar int vertex_indices",
    "end_header",
    "0 0 0",
    "1 0 0",
    "0 1 0",
    "3 0 1 2"
  ].join("\n");
}

function minimalVrml(): string {
  return [
    "#VRML V2.0 utf8",
    "Shape {",
    "  geometry IndexedFaceSet {",
    "    coord Coordinate { point [ 0 0 0, 1 0 0, 0 1 0 ] }",
    "    coordIndex [ 0, 1, 2, -1 ]",
    "  }",
    "}"
  ].join("\n");
}

function minimalCollada(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA version="1.4.1" xmlns="http://www.collada.org/2005/11/COLLADASchema">
  <asset><unit meter="1" name="meter"/><up_axis>Y_UP</up_axis></asset>
  <library_visual_scenes><visual_scene id="Scene" name="Scene"/></library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;
}

function threeMfFile(): File {
  return zipFile("harness.3mf", "model/3mf", [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`
    },
    {
      path: "3D/3dmodel.model",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources/>
  <build/>
</model>`
    }
  ]);
}

function minimalUsd(): string {
  return [
    "#usda 1.0",
    "(",
    "  defaultPrim = \"Harness\"",
    ")",
    "def Xform \"Harness\" {",
    "}"
  ].join("\n");
}

function xmlWebArchive(): string {
  const html = btoa("<html><body><h1>Hello XML WebArchive</h1></body></html>");
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>WebMainResource</key><dict>
  <key>WebResourceURL</key><string>https://example.com/xml</string>
  <key>WebResourceMIMEType</key><string>text/html</string>
  <key>WebResourceTextEncodingName</key><string>UTF-8</string>
  <key>WebResourceData</key><data>${html}</data>
</dict></dict></plist>`;
}

function ascii(value: string): number[] {
  return [...value].map((char) => char.charCodeAt(0));
}

function minimalOle(label: string): ArrayBuffer {
  const bytes = new Uint8Array(512);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  bytes.set(ascii(label), 64);
  bytes.set(ascii(`${label} harness preview`), 128);
  return bytes.buffer;
}

function uint32Le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
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

function uint16Le(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >> 8) & 0xff]);
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

function concatBytes(...chunks: Array<Uint8Array | number[]>): Uint8Array {
  const normalized = chunks.map((chunk) => (chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk)));
  const total = normalized.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of normalized) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function gdsRecord(type: number, payload: number[]): number[] {
  return [...uint16Be(payload.length + 4), (type >>> 8) & 0xff, type & 0xff, ...payload];
}

function int32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16Be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
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
