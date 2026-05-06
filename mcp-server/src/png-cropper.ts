import { inflateSync, deflateSync, crc32 } from "node:zlib";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PngCropper {
  static crop(buffer: Buffer, rect: Rect): Buffer {
    // 1. Parse Basic Structure
    if (buffer.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("Invalid PNG signature");
    }

    let offset = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0;
    const idats: Buffer[] = [];

    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
      const data = buffer.slice(offset + 8, offset + 8 + length);

      if (type === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
          throw new Error(`Unsupported PNG format: depth=${bitDepth}, type=${colorType}. Only 8-bit RGB/RGBA supported.`);
        }
      } else if (type === "IDAT") {
        idats.push(data);
      } else if (type === "IEND") {
        break;
      }
      offset += length + 12;
    }

    const bpp = colorType === 6 ? 4 : 3; // bytes per pixel
    const rawData = inflateSync(Buffer.concat(idats));
    const rowSize = 1 + width * bpp;

    // 2. Unfilter and Crop in one pass (assuming filter 0 for simplicity, or handling all)
    // Most agent-friendly browsers use filter 0 or very simple ones. 
    // To be robust, let's implement unfiltering for all 5 types.
    const unfiltered = Buffer.alloc(width * height * bpp);
    for (let y = 0; y < height; y++) {
      const rowStart = y * rowSize;
      const filterType = rawData[rowStart];
      const rowData = rawData.slice(rowStart + 1, rowStart + rowSize);
      const prevRowStart = (y - 1) * width * bpp;

      for (let x = 0; x < width * bpp; x++) {
        const left = x >= bpp ? unfiltered[y * width * bpp + x - bpp] : 0;
        const up = y > 0 ? unfiltered[prevRowStart + x] : 0;
        const upLeft = (x >= bpp && y > 0) ? unfiltered[prevRowStart + x - bpp] : 0;

        let val = rowData[x];
        if (filterType === 1) val = (val + left) & 0xFF;
        else if (filterType === 2) val = (val + up) & 0xFF;
        else if (filterType === 3) val = (val + Math.floor((left + up) / 2)) & 0xFF;
        else if (filterType === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const paeth = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
          val = (val + paeth) & 0xFF;
        }
        unfiltered[y * width * bpp + x] = val;
      }
    }

    // 3. Extract Region
    const targetX = Math.max(0, Math.min(rect.x, width));
    const targetY = Math.max(0, Math.min(rect.y, height));
    const targetW = Math.min(rect.width, width - targetX);
    const targetH = Math.min(rect.height, height - targetY);

    const croppedRaw = Buffer.alloc(targetH * (1 + targetW * bpp));
    for (let y = 0; y < targetH; y++) {
      const srcY = targetY + y;
      const srcOffset = (srcY * width + targetX) * bpp;
      const dstOffset = y * (1 + targetW * bpp);
      croppedRaw[dstOffset] = 0; // Filter None for output
      unfiltered.copy(croppedRaw, dstOffset + 1, srcOffset, srcOffset + targetW * bpp);
    }

    // 4. Rebuild PNG
    const newIhdr = Buffer.alloc(13);
    newIhdr.writeUInt32BE(targetW, 0);
    newIhdr.writeUInt32BE(targetH, 4);
    newIhdr.writeUInt8(8, 8);
    newIhdr.writeUInt8(colorType, 9);
    newIhdr.writeUInt8(0, 10);
    newIhdr.writeUInt8(0, 11);
    newIhdr.writeUInt8(0, 12);

    const idatData = deflateSync(croppedRaw);

    const chunks: Buffer[] = [Buffer.from("89504e470d0a1a0a", "hex")];
    
    const writeChunk = (type: string, data: Buffer) => {
      const b = Buffer.alloc(8 + data.length + 4);
      b.writeUInt32BE(data.length, 0);
      b.write(type, 4);
      data.copy(b, 8);
      // CRC is calculated over type + data
      const crcBuffer = Buffer.alloc(4 + data.length);
      crcBuffer.write(type, 0);
      data.copy(crcBuffer, 4);
      // Wait, Node's zlib.crc32 is exactly what we need!
      b.writeUInt32BE(crc32(crcBuffer), 8 + data.length);
      chunks.push(b);
    };

    writeChunk("IHDR", newIhdr);
    writeChunk("IDAT", idatData);
    writeChunk("IEND", Buffer.alloc(0));

    return Buffer.concat(chunks);
  }
}
