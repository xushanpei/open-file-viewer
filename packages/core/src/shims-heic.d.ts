declare module "heic2any" {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
    gifInterval?: number;
    multiple?: boolean;
  }
  function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;
  export default heic2any;
}

declare module "utif" {
  export interface UtifIfd {
    width?: number;
    height?: number;
    data?: Uint8Array;
    [key: string]: unknown;
  }
  export function decode(buffer: ArrayBuffer): UtifIfd[];
  export function decodeImage(buffer: ArrayBuffer, ifd: UtifIfd): void;
  export function toRGBA8(ifd: UtifIfd): Uint8Array;
}
