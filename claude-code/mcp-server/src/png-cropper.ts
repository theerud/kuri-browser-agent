import { deflateSync, inflateSync, crc32 } from "node:zlib";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const MAX_PIXELS = 40_000_000;

export class PngCropper {
  static crop(buffer: Buffer, rect: Rect): Buffer {
    this.validateRect(rect);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error("Invalid PNG signature");
    }

    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    const idats: Buffer[] = [];

    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      if (length > buffer.length - offset - 12) throw new Error("Invalid PNG chunk length");
      const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      if (type === "IHDR") {
        if (length !== 13) throw new Error("Invalid PNG header");
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        colorType = data[9];
        if (data[8] !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) {
          throw new Error("Only non-interlaced 8-bit RGB/RGBA PNGs are supported");
        }
        if (!width || !height || width * height > MAX_PIXELS) throw new Error("PNG dimensions are invalid or too large");
      } else if (type === "IDAT") {
        idats.push(data);
      } else if (type === "IEND") {
        break;
      }
      offset += length + 12;
    }

    if (!width || !height || idats.length === 0) throw new Error("PNG is missing required chunks");
    if (rect.x + rect.width > width || rect.y + rect.height > height) {
      throw new Error("crop rectangle exceeds PNG bounds");
    }

    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const rowSize = 1 + width * bytesPerPixel;
    const rawData = inflateSync(Buffer.concat(idats), { maxOutputLength: rowSize * height });
    if (rawData.length !== rowSize * height) throw new Error("PNG image data has an unexpected size");

    const unfiltered = Buffer.alloc(width * height * bytesPerPixel);
    for (let y = 0; y < height; y++) {
      const rowStart = y * rowSize;
      const filterType = rawData[rowStart];
      if (filterType > 4) throw new Error(`Unsupported PNG filter: ${filterType}`);
      for (let x = 0; x < width * bytesPerPixel; x++) {
        const outputIndex = y * width * bytesPerPixel + x;
        const left = x >= bytesPerPixel ? unfiltered[outputIndex - bytesPerPixel] : 0;
        const up = y > 0 ? unfiltered[outputIndex - width * bytesPerPixel] : 0;
        const upLeft = x >= bytesPerPixel && y > 0 ? unfiltered[outputIndex - width * bytesPerPixel - bytesPerPixel] : 0;
        let value = rawData[rowStart + 1 + x];
        if (filterType === 1) value = (value + left) & 0xff;
        else if (filterType === 2) value = (value + up) & 0xff;
        else if (filterType === 3) value = (value + Math.floor((left + up) / 2)) & 0xff;
        else if (filterType === 4) value = (value + this.paeth(left, up, upLeft)) & 0xff;
        unfiltered[outputIndex] = value;
      }
    }

    const croppedRowSize = 1 + rect.width * bytesPerPixel;
    const croppedRaw = Buffer.alloc(rect.height * croppedRowSize);
    for (let y = 0; y < rect.height; y++) {
      const sourceStart = ((rect.y + y) * width + rect.x) * bytesPerPixel;
      const destinationStart = y * croppedRowSize;
      croppedRaw[destinationStart] = 0;
      unfiltered.copy(croppedRaw, destinationStart + 1, sourceStart, sourceStart + rect.width * bytesPerPixel);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(rect.width, 0);
    header.writeUInt32BE(rect.height, 4);
    header[8] = 8;
    header[9] = colorType;
    return Buffer.concat([
      PNG_SIGNATURE,
      this.chunk("IHDR", header),
      this.chunk("IDAT", deflateSync(croppedRaw)),
      this.chunk("IEND", Buffer.alloc(0)),
    ]);
  }

  private static validateRect(rect: Rect) {
    for (const [name, value] of Object.entries(rect)) {
      if (!Number.isInteger(value)) throw new Error(`crop ${name} must be an integer`);
    }
    if (rect.x < 0 || rect.y < 0 || rect.width < 1 || rect.height < 1) {
      throw new Error("crop coordinates must be non-negative and dimensions must be positive");
    }
    if (rect.width > 8192 || rect.height > 8192 || rect.width * rect.height > 16_777_216) {
      throw new Error("crop rectangle is too large");
    }
  }

  private static paeth(left: number, up: number, upLeft: number): number {
    const prediction = left + up - upLeft;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const upLeftDistance = Math.abs(prediction - upLeft);
    return leftDistance <= upDistance && leftDistance <= upLeftDistance ? left : upDistance <= upLeftDistance ? up : upLeft;
  }

  private static chunk(type: string, data: Buffer): Buffer {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
    return chunk;
  }
}
