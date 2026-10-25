/**
 * Minimal, dependency-free ISO/IEC 18004 QR Code matrix generator (Versions 1–6, ECC Level L, Byte mode).
 * Used strictly to encode public `joinUrl` strings (NEVER session tokens, per PLAN.md S14 & P4.2).
 */

type VersionSpec = {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  alignment: number[];
};

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, alignment: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, alignment: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, alignment: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, alignment: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, alignment: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewords: 36, alignment: [6, 34] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ poly[j]!;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j]!, factor);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ rem[0]!;
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      rem[j] = (rem[j] ?? 0) ^ gfMul(gen[j + 1]!, factor);
    }
  }
  return rem;
}

function encodeDataCodewords(bytes: Uint8Array, totalCodewords: number): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Byte mode indicator (0100) + 8-bit character count (Versions 1–9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) {
    pushBits(b, 8);
  }

  const maxBits = totalCodewords * 8;
  const terminator = Math.min(4, maxBits - bits.length);
  pushBits(0, terminator);
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(totalCodewords);
  const byteLen = bits.length / 8;
  for (let i = 0; i < byteLen; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j]!;
    }
    codewords[i] = b;
  }

  const padBytes = [0xec, 0x11];
  for (let i = byteLen; i < totalCodewords; i++) {
    codewords[i] = padBytes[(i - byteLen) % 2]!;
  }
  return codewords;
}

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSION_SPECS.find((s) => bytes.length + 2 <= s.dataCodewords);
  if (!spec) {
    throw new Error(`QR payload too long (${bytes.length} bytes)`);
  }

  const size = spec.size;
  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r]![c] = dark;
    isFunction[r]![c] = true;
  };

  const drawFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const isBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(topR + dr, leftC + dc, !isBorder && (isOuter || isInner));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const align = spec.alignment;
  for (const r of align) {
    for (const c of align) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(r + dr, c + dc, dark);
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunctionModule(8, i, false);
      setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunctionModule(8, size - 1 - i, false);
    setFunctionModule(size - 1 - i, 8, false);
  }
  setFunctionModule(size - 8, 8, true);

  // Encode data + EC
  const dataCw = encodeDataCodewords(bytes, spec.dataCodewords);
  let allCw: Uint8Array;
  if (spec.version === 6) {
    // Version 6-L uses 2 blocks of (68 data, 18 EC)
    const b1Data = dataCw.slice(0, 68);
    const b2Data = dataCw.slice(68, 136);
    const b1Ec = computeReedSolomon(b1Data, 18);
    const b2Ec = computeReedSolomon(b2Data, 18);
    allCw = new Uint8Array(136 + 36);
    for (let i = 0; i < 68; i++) {
      allCw[i * 2] = b1Data[i]!;
      allCw[i * 2 + 1] = b2Data[i]!;
    }
    for (let i = 0; i < 18; i++) {
      allCw[136 + i * 2] = b1Ec[i]!;
      allCw[136 + i * 2 + 1] = b2Ec[i]!;
    }
  } else {
    const ecCw = computeReedSolomon(dataCw, spec.ecCodewords);
    allCw = new Uint8Array(dataCw.length + ecCw.length);
    allCw.set(dataCw, 0);
    allCw.set(ecCw, dataCw.length);
  }

  // Place data bits in zigzag
  let bitIdx = 0;
  const totalBits = allCw.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const upwards = ((right + 1) & 2) === 0;
      const r = upwards ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunction[r]![c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = allCw[bitIdx >>> 3]!;
            dark = ((byte >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          // Apply Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r]![c] = dark;
        }
      }
    }
  }

  // Write Format Information for ECC Level L (01) + Mask 0 (000) -> 0x77c4
  const formatBits = 0x77c4;
  const getFmtBit = (i: number) => ((formatBits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getFmtBit(14 - i));
  setFunctionModule(8, 7, getFmtBit(8));
  setFunctionModule(8, 8, getFmtBit(7));
  setFunctionModule(7, 8, getFmtBit(6));
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getFmtBit(14 - i));

  for (let i = 0; i < 8; i++) setFunctionModule(8, size - 1 - i, getFmtBit(i));
  for (let i = 8; i < 15; i++) setFunctionModule(size - 15 + i, 8, getFmtBit(i));

  return modules;
}
