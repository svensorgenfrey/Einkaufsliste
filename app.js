// @ts-check
"use strict";

/** @typedef {'item' | 'heading' | 'divider'} ItemKind */
/** @typedef {{id: string, kind: ItemKind, text: string, checked: boolean, createdAt: string, updatedAt: string}} ListItem */
/** @typedef {{id: string, name: string, items: ListItem[], createdAt: string, updatedAt: string, schemaVersion: 1}} ShoppingList */
/** @typedef {{key: string, value: unknown}} Preference */
/** @typedef {{lists: ShoppingList[], preferences: Preference[], shares: Share[], syncStates: SyncRecord[]}} Snapshot */
/** @typedef {{mode: 'new-list' | 'rename-list' | 'delete-list' | 'edit-item' | 'delete-item', listId: string | null, itemId?: string}} EditorContext */
/** @typedef {{pointerId: number, handle: HTMLButtonElement, row: HTMLLIElement, listId: string, itemId: string, startY: number, y: number, offsetY: number, started: boolean, preview: HTMLLIElement | null, frame: number, originalIds: string[]}} DragSession */

/*
 * QR Code generator library (TypeScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */
// Vendored Nayuki v1.8.0, compiled with TypeScript 5.9.3 (ES2022).
/** @type {{QrCode:{encodeText:(text:string,ecc:unknown)=>{size:number,getModule:(x:number,y:number)=>boolean},Ecc:{MEDIUM:unknown}}}} */
var qrcodegen;
// @ts-ignore -- Generated third-party code; the original TypeScript was checked separately with --strict.
"use strict"; var qrcodegen; (function (qrcodegen) {     class QrCode {         version;         errorCorrectionLevel;         static encodeText(text, ecl) {             const segs = qrcodegen.QrSegment.makeSegments(text);             return QrCode.encodeSegments(segs, ecl);         }         static encodeBinary(data, ecl) {             const seg = qrcodegen.QrSegment.makeBytes(data);             return QrCode.encodeSegments([seg], ecl);         }         static encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {             if (!(QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode.MAX_VERSION)                 || mask < -1 || mask > 7)                 throw new RangeError("Invalid value");             let version;             let dataUsedBits;             for (version = minVersion;; version++) {                 const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;                 const usedBits = QrSegment.getTotalBits(segs, version);                 if (usedBits <= dataCapacityBits) {                     dataUsedBits = usedBits;                     break;                 }                 if (version >= maxVersion)                     throw new RangeError("Data too long");             }             for (const newEcl of [QrCode.Ecc.MEDIUM, QrCode.Ecc.QUARTILE, QrCode.Ecc.HIGH]) {                 if (boostEcl && dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8)                     ecl = newEcl;             }             let bb = [];             for (const seg of segs) {                 appendBits(seg.mode.modeBits, 4, bb);                 appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);                 for (const b of seg.getData())                     bb.push(b);             }             assert(bb.length == dataUsedBits);             const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;             assert(bb.length <= dataCapacityBits);             appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);             appendBits(0, (8 - bb.length % 8) % 8, bb);             assert(bb.length % 8 == 0);             for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11)                 appendBits(padByte, 8, bb);             let dataCodewords = [];             while (dataCodewords.length * 8 < bb.length)                 dataCodewords.push(0);             bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << (7 - (i & 7)));             return new QrCode(version, ecl, dataCodewords, mask);         }         size;         mask;         modules = [];         isFunction = [];         constructor(version, errorCorrectionLevel, dataCodewords, msk) {             this.version = version;             this.errorCorrectionLevel = errorCorrectionLevel;             if (version < QrCode.MIN_VERSION || version > QrCode.MAX_VERSION)                 throw new RangeError("Version value out of range");             if (msk < -1 || msk > 7)                 throw new RangeError("Mask value out of range");             this.size = version * 4 + 17;             let row = [];             for (let i = 0; i < this.size; i++)                 row.push(false);             for (let i = 0; i < this.size; i++) {                 this.modules.push(row.slice());                 this.isFunction.push(row.slice());             }             this.drawFunctionPatterns();             const allCodewords = this.addEccAndInterleave(dataCodewords);             this.drawCodewords(allCodewords);             if (msk == -1) {                 let minPenalty = 1000000000;                 for (let i = 0; i < 8; i++) {                     this.applyMask(i);                     this.drawFormatBits(i);                     const penalty = this.getPenaltyScore();                     if (penalty < minPenalty) {                         msk = i;                         minPenalty = penalty;                     }                     this.applyMask(i);                 }             }             assert(0 <= msk && msk <= 7);             this.mask = msk;             this.applyMask(msk);             this.drawFormatBits(msk);             this.isFunction = [];         }         getModule(x, y) {             return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];         }         drawFunctionPatterns() {             for (let i = 0; i < this.size; i++) {                 this.setFunctionModule(6, i, i % 2 == 0);                 this.setFunctionModule(i, 6, i % 2 == 0);             }             this.drawFinderPattern(3, 3);             this.drawFinderPattern(this.size - 4, 3);             this.drawFinderPattern(3, this.size - 4);             const alignPatPos = this.getAlignmentPatternPositions();             const numAlign = alignPatPos.length;             for (let i = 0; i < numAlign; i++) {                 for (let j = 0; j < numAlign; j++) {                     if (!(i == 0 && j == 0 || i == 0 && j == numAlign - 1 || i == numAlign - 1 && j == 0))                         this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);                 }             }             this.drawFormatBits(0);             this.drawVersion();         }         drawFormatBits(mask) {             const data = this.errorCorrectionLevel.formatBits << 3 | mask;             let rem = data;             for (let i = 0; i < 10; i++)                 rem = (rem << 1) ^ ((rem >>> 9) * 0x537);             const bits = (data << 10 | rem) ^ 0x5412;             assert(bits >>> 15 == 0);             for (let i = 0; i <= 5; i++)                 this.setFunctionModule(8, i, getBit(bits, i));             this.setFunctionModule(8, 7, getBit(bits, 6));             this.setFunctionModule(8, 8, getBit(bits, 7));             this.setFunctionModule(7, 8, getBit(bits, 8));             for (let i = 9; i < 15; i++)                 this.setFunctionModule(14 - i, 8, getBit(bits, i));             for (let i = 0; i < 8; i++)                 this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));             for (let i = 8; i < 15; i++)                 this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));             this.setFunctionModule(8, this.size - 8, true);         }         drawVersion() {             if (this.version < 7)                 return;             let rem = this.version;             for (let i = 0; i < 12; i++)                 rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);             const bits = this.version << 12 | rem;             assert(bits >>> 18 == 0);             for (let i = 0; i < 18; i++) {                 const color = getBit(bits, i);                 const a = this.size - 11 + i % 3;                 const b = Math.floor(i / 3);                 this.setFunctionModule(a, b, color);                 this.setFunctionModule(b, a, color);             }         }         drawFinderPattern(x, y) {             for (let dy = -4; dy <= 4; dy++) {                 for (let dx = -4; dx <= 4; dx++) {                     const dist = Math.max(Math.abs(dx), Math.abs(dy));                     const xx = x + dx;                     const yy = y + dy;                     if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)                         this.setFunctionModule(xx, yy, dist != 2 && dist != 4);                 }             }         }         drawAlignmentPattern(x, y) {             for (let dy = -2; dy <= 2; dy++) {                 for (let dx = -2; dx <= 2; dx++)                     this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);             }         }         setFunctionModule(x, y, isDark) {             this.modules[y][x] = isDark;             this.isFunction[y][x] = true;         }         addEccAndInterleave(data) {             const ver = this.version;             const ecl = this.errorCorrectionLevel;             if (data.length != QrCode.getNumDataCodewords(ver, ecl))                 throw new RangeError("Invalid argument");             const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];             const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];             const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);             const numShortBlocks = numBlocks - rawCodewords % numBlocks;             const shortBlockLen = Math.floor(rawCodewords / numBlocks);             let blocks = [];             const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);             for (let i = 0, k = 0; i < numBlocks; i++) {                 let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));                 k += dat.length;                 const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);                 if (i < numShortBlocks)                     dat.push(0);                 blocks.push(dat.concat(ecc));             }             let result = [];             for (let i = 0; i < blocks[0].length; i++) {                 blocks.forEach((block, j) => {                     if (i != shortBlockLen - blockEccLen || j >= numShortBlocks)                         result.push(block[i]);                 });             }             assert(result.length == rawCodewords);             return result;         }         drawCodewords(data) {             if (data.length != Math.floor(QrCode.getNumRawDataModules(this.version) / 8))                 throw new RangeError("Invalid argument");             let i = 0;             for (let right = this.size - 1; right >= 1; right -= 2) {                 if (right == 6)                     right = 5;                 for (let vert = 0; vert < this.size; vert++) {                     for (let j = 0; j < 2; j++) {                         const x = right - j;                         const upward = ((right + 1) & 2) == 0;                         const y = upward ? this.size - 1 - vert : vert;                         if (!this.isFunction[y][x] && i < data.length * 8) {                             this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));                             i++;                         }                     }                 }             }             assert(i == data.length * 8);         }         applyMask(mask) {             if (mask < 0 || mask > 7)                 throw new RangeError("Mask value out of range");             for (let y = 0; y < this.size; y++) {                 for (let x = 0; x < this.size; x++) {                     let invert;                     switch (mask) {                         case 0:                             invert = (x + y) % 2 == 0;                             break;                         case 1:                             invert = y % 2 == 0;                             break;                         case 2:                             invert = x % 3 == 0;                             break;                         case 3:                             invert = (x + y) % 3 == 0;                             break;                         case 4:                             invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0;                             break;                         case 5:                             invert = x * y % 2 + x * y % 3 == 0;                             break;                         case 6:                             invert = (x * y % 2 + x * y % 3) % 2 == 0;                             break;                         case 7:                             invert = ((x + y) % 2 + x * y % 3) % 2 == 0;                             break;                         default: throw new Error("Unreachable");                     }                     if (!this.isFunction[y][x] && invert)                         this.modules[y][x] = !this.modules[y][x];                 }             }         }         getPenaltyScore() {             let result = 0;             for (let y = 0; y < this.size; y++) {                 let runColor = false;                 let runX = 0;                 let runHistory = [0, 0, 0, 0, 0, 0, 0];                 for (let x = 0; x < this.size; x++) {                     if (this.modules[y][x] == runColor) {                         runX++;                         if (runX == 5)                             result += QrCode.PENALTY_N1;                         else if (runX > 5)                             result++;                     }                     else {                         this.finderPenaltyAddHistory(runX, runHistory);                         if (!runColor)                             result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;                         runColor = this.modules[y][x];                         runX = 1;                     }                 }                 result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * QrCode.PENALTY_N3;             }             for (let x = 0; x < this.size; x++) {                 let runColor = false;                 let runY = 0;                 let runHistory = [0, 0, 0, 0, 0, 0, 0];                 for (let y = 0; y < this.size; y++) {                     if (this.modules[y][x] == runColor) {                         runY++;                         if (runY == 5)                             result += QrCode.PENALTY_N1;                         else if (runY > 5)                             result++;                     }                     else {                         this.finderPenaltyAddHistory(runY, runHistory);                         if (!runColor)                             result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;                         runColor = this.modules[y][x];                         runY = 1;                     }                 }                 result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * QrCode.PENALTY_N3;             }             for (let y = 0; y < this.size - 1; y++) {                 for (let x = 0; x < this.size - 1; x++) {                     const color = this.modules[y][x];                     if (color == this.modules[y][x + 1] &&                         color == this.modules[y + 1][x] &&                         color == this.modules[y + 1][x + 1])                         result += QrCode.PENALTY_N2;                 }             }             let dark = 0;             for (const row of this.modules)                 dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);             const total = this.size * this.size;             const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;             assert(0 <= k && k <= 9);             result += k * QrCode.PENALTY_N4;             assert(0 <= result && result <= 2568888);             return result;         }         getAlignmentPatternPositions() {             if (this.version == 1)                 return [];             else {                 const numAlign = Math.floor(this.version / 7) + 2;                 const step = (this.version == 32) ? 26 :                     Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;                 let result = [6];                 for (let pos = this.size - 7; result.length < numAlign; pos -= step)                     result.splice(1, 0, pos);                 return result;             }         }         static getNumRawDataModules(ver) {             if (ver < QrCode.MIN_VERSION || ver > QrCode.MAX_VERSION)                 throw new RangeError("Version number out of range");             let result = (16 * ver + 128) * ver + 64;             if (ver >= 2) {                 const numAlign = Math.floor(ver / 7) + 2;                 result -= (25 * numAlign - 10) * numAlign - 55;                 if (ver >= 7)                     result -= 36;             }             assert(208 <= result && result <= 29648);             return result;         }         static getNumDataCodewords(ver, ecl) {             return Math.floor(QrCode.getNumRawDataModules(ver) / 8) -                 QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] *                     QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];         }         static reedSolomonComputeDivisor(degree) {             if (degree < 1 || degree > 255)                 throw new RangeError("Degree out of range");             let result = [];             for (let i = 0; i < degree - 1; i++)                 result.push(0);             result.push(1);             let root = 1;             for (let i = 0; i < degree; i++) {                 for (let j = 0; j < result.length; j++) {                     result[j] = QrCode.reedSolomonMultiply(result[j], root);                     if (j + 1 < result.length)                         result[j] ^= result[j + 1];                 }                 root = QrCode.reedSolomonMultiply(root, 0x02);             }             return result;         }         static reedSolomonComputeRemainder(data, divisor) {             let result = divisor.map(_ => 0);             for (const b of data) {                 const factor = b ^ result.shift();                 result.push(0);                 divisor.forEach((coef, i) => result[i] ^= QrCode.reedSolomonMultiply(coef, factor));             }             return result;         }         static reedSolomonMultiply(x, y) {             if (x >>> 8 != 0 || y >>> 8 != 0)                 throw new RangeError("Byte out of range");             let z = 0;             for (let i = 7; i >= 0; i--) {                 z = (z << 1) ^ ((z >>> 7) * 0x11D);                 z ^= ((y >>> i) & 1) * x;             }             assert(z >>> 8 == 0);             return z;         }         finderPenaltyCountPatterns(runHistory) {             const n = runHistory[1];             assert(n <= this.size * 3);             const core = n > 0 && runHistory[2] == n && runHistory[3] == n * 3 && runHistory[4] == n && runHistory[5] == n;             return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0)                 + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);         }         finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {             if (currentRunColor) {                 this.finderPenaltyAddHistory(currentRunLength, runHistory);                 currentRunLength = 0;             }             currentRunLength += this.size;             this.finderPenaltyAddHistory(currentRunLength, runHistory);             return this.finderPenaltyCountPatterns(runHistory);         }         finderPenaltyAddHistory(currentRunLength, runHistory) {             if (runHistory[0] == 0)                 currentRunLength += this.size;             runHistory.pop();             runHistory.unshift(currentRunLength);         }         static MIN_VERSION = 1;         static MAX_VERSION = 40;         static PENALTY_N1 = 3;         static PENALTY_N2 = 3;         static PENALTY_N3 = 40;         static PENALTY_N4 = 10;         static ECC_CODEWORDS_PER_BLOCK = [             [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],             [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],             [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],             [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],         ];         static NUM_ERROR_CORRECTION_BLOCKS = [             [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],             [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],             [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],             [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],         ];     }     qrcodegen.QrCode = QrCode;     function appendBits(val, len, bb) {         if (len < 0 || len > 31 || val >>> len != 0)             throw new RangeError("Value out of range");         for (let i = len - 1; i >= 0; i--)             bb.push((val >>> i) & 1);     }     function getBit(x, i) {         return ((x >>> i) & 1) != 0;     }     function assert(cond) {         if (!cond)             throw new Error("Assertion error");     }     class QrSegment {         mode;         numChars;         bitData;         static makeBytes(data) {             let bb = [];             for (const b of data)                 appendBits(b, 8, bb);             return new QrSegment(QrSegment.Mode.BYTE, data.length, bb);         }         static makeNumeric(digits) {             if (!QrSegment.isNumeric(digits))                 throw new RangeError("String contains non-numeric characters");             let bb = [];             for (let i = 0; i < digits.length;) {                 const n = Math.min(digits.length - i, 3);                 appendBits(parseInt(digits.substr(i, n), 10), n * 3 + 1, bb);                 i += n;             }             return new QrSegment(QrSegment.Mode.NUMERIC, digits.length, bb);         }         static makeAlphanumeric(text) {             if (!QrSegment.isAlphanumeric(text))                 throw new RangeError("String contains unencodable characters in alphanumeric mode");             let bb = [];             let i;             for (i = 0; i + 2 <= text.length; i += 2) {                 let temp = QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;                 temp += QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));                 appendBits(temp, 11, bb);             }             if (i < text.length)                 appendBits(QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);             return new QrSegment(QrSegment.Mode.ALPHANUMERIC, text.length, bb);         }         static makeSegments(text) {             if (text == "")                 return [];             else if (QrSegment.isNumeric(text))                 return [QrSegment.makeNumeric(text)];             else if (QrSegment.isAlphanumeric(text))                 return [QrSegment.makeAlphanumeric(text)];             else                 return [QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))];         }         static makeEci(assignVal) {             let bb = [];             if (assignVal < 0)                 throw new RangeError("ECI assignment value out of range");             else if (assignVal < (1 << 7))                 appendBits(assignVal, 8, bb);             else if (assignVal < (1 << 14)) {                 appendBits(0b10, 2, bb);                 appendBits(assignVal, 14, bb);             }             else if (assignVal < 1000000) {                 appendBits(0b110, 3, bb);                 appendBits(assignVal, 21, bb);             }             else                 throw new RangeError("ECI assignment value out of range");             return new QrSegment(QrSegment.Mode.ECI, 0, bb);         }         static isNumeric(text) {             return QrSegment.NUMERIC_REGEX.test(text);         }         static isAlphanumeric(text) {             return QrSegment.ALPHANUMERIC_REGEX.test(text);         }         constructor(mode, numChars, bitData) {             this.mode = mode;             this.numChars = numChars;             this.bitData = bitData;             if (numChars < 0)                 throw new RangeError("Invalid argument");             this.bitData = bitData.slice();         }         getData() {             return this.bitData.slice();         }         static getTotalBits(segs, version) {             let result = 0;             for (const seg of segs) {                 const ccbits = seg.mode.numCharCountBits(version);                 if (seg.numChars >= (1 << ccbits))                     return Infinity;                 result += 4 + ccbits + seg.bitData.length;             }             return result;         }         static toUtf8ByteArray(str) {             str = encodeURI(str);             let result = [];             for (let i = 0; i < str.length; i++) {                 if (str.charAt(i) != "%")                     result.push(str.charCodeAt(i));                 else {                     result.push(parseInt(str.substr(i + 1, 2), 16));                     i += 2;                 }             }             return result;         }         static NUMERIC_REGEX = /^[0-9]*$/;         static ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/;         static ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";     }     qrcodegen.QrSegment = QrSegment; })(qrcodegen || (qrcodegen = {})); (function (qrcodegen) {     var QrCode;     (function (QrCode) {         class Ecc {             ordinal;             formatBits;             static LOW = new Ecc(0, 1);             static MEDIUM = new Ecc(1, 0);             static QUARTILE = new Ecc(2, 3);             static HIGH = new Ecc(3, 2);             constructor(ordinal, formatBits) {                 this.ordinal = ordinal;                 this.formatBits = formatBits;             }         }         QrCode.Ecc = Ecc;     })(QrCode = qrcodegen.QrCode || (qrcodegen.QrCode = {})); })(qrcodegen || (qrcodegen = {})); (function (qrcodegen) {     var QrSegment;     (function (QrSegment) {         class Mode {             modeBits;             numBitsCharCount;             static NUMERIC = new Mode(0x1, [10, 12, 14]);             static ALPHANUMERIC = new Mode(0x2, [9, 11, 13]);             static BYTE = new Mode(0x4, [8, 16, 16]);             static KANJI = new Mode(0x8, [8, 10, 12]);             static ECI = new Mode(0x7, [0, 0, 0]);             constructor(modeBits, numBitsCharCount) {                 this.modeBits = modeBits;                 this.numBitsCharCount = numBitsCharCount;             }             numCharCountBits(ver) {                 return this.numBitsCharCount[Math.floor((ver + 7) / 17)];             }         }         QrSegment.Mode = Mode;     })(QrSegment = qrcodegen.QrSegment || (qrcodegen.QrSegment = {})); })(qrcodegen || (qrcodegen = {}));

// BEGIN SHARE PROTOCOL
/** @typedef {[number, string]} Stamp */
/** @template T @typedef {{value:T, stamp:Stamp}} Register */
/** @typedef {{content:Register<{kind:ItemKind,text:string}>,checked:Register<boolean>,deleted:Stamp|null}} SharedItem */
/** @typedef {{v:1,clock:number,name:Register<string>,order:Register<string[]>,items:Record<string,SharedItem>}} SharedDocument */
/** @typedef {{v:1,iv:string,ct:string}} Ciphertext */
/** @typedef {{id:string,remoteId:string,origin:string,key:string,memberToken:string,ownerToken:string|null,registered:boolean}} Share */
/** @typedef {{id:string,doc:SharedDocument|null,dirty:boolean}} SyncRecord */
/** @typedef {{id:string,invitationId:string,claimToken:string,wrapKey:string,box:Ciphertext,expiresAt:number|null}} Invitation */
/** @typedef {{v:1,remoteId:string,invitationId:string,claimToken:string,wrapKey:string,requestId:string}} Claim */

const ShareProtocol = (() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  /** @param {Uint8Array} bytes */
  function encode(bytes) { return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  /** @param {string} text */
  function decode(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Ungültige Kodierung.');
    const result = Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    if (encode(result) !== text) throw new Error('Ungültige Kodierung.');
    return result;
  }
  function secret() { return encode(crypto.getRandomValues(new Uint8Array(32))); }
  /** @param {unknown} value @returns {void} */
  function token(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value) || decode(value).length !== 32) throw new Error('Ungültiger Schlüssel.'); }
  /** @param {string} value */
  async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2,'0')).join(''); }
  /** @param {string} key @param {string} context @param {unknown} value @returns {Promise<Ciphertext>} */
  async function encrypt(key, context, value) {
    token(key);
    const imported = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context),tagLength:128}, imported, encoder.encode(JSON.stringify(value)));
    return {v:1,iv:encode(iv),ct:encode(new Uint8Array(encrypted))};
  }
  /** @param {string} key @param {string} context @param {Ciphertext} box @returns {Promise<any>} */
  async function decrypt(key, context, box) {
    token(key);
    if (box?.v !== 1 || decode(box.iv).length !== 12 || box.ct.length > 1_400_000) throw new Error('Ungültiges Chiffrat.');
    const imported = await crypto.subtle.importKey('raw', decode(key), 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(box.iv),additionalData:encoder.encode(context),tagLength:128}, imported, decode(box.ct));
    return JSON.parse(decoder.decode(plain));
  }
  /** @param {string} id */
  const contentContext = id => `einkaufsliste/content/1/${id}`;
  /** @param {string} id @param {string} invite */
  const invitationContext = (id, invite) => `einkaufsliste/invitation/1/${id}/${invite}`;
  /** Only participant credentials cross the invitation boundary. @param {Share} share @param {string} invitationId @param {string} wrapKey */
  function invitationBox(share,invitationId,wrapKey) {
    return encrypt(wrapKey,invitationContext(share.remoteId,invitationId),{v:1,remoteId:share.remoteId,key:share.key,memberToken:share.memberToken});
  }
  /** @param {Stamp} a @param {Stamp} b */
  function compare(a,b) { return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); }
  /** @template T @param {Register<T>} a @param {Register<T>} b @returns {Register<T>} */
  function choose(a,b) { return compare(a.stamp,b.stamp) >= 0 ? a : b; }
  /** @param {SharedDocument} value */
  function canonical(value) { return JSON.stringify({...value,items:Object.fromEntries(Object.keys(value.items).sort().map(id => [id,value.items[id]]))}); }
  /** @param {SharedDocument} a @param {SharedDocument} b @returns {SharedDocument} */
  function merge(a,b) {
    /** @type {Record<string,SharedItem>} */ const items = {};
    for (const id of [...new Set([...Object.keys(a.items),...Object.keys(b.items)])].sort()) {
      const x = a.items[id], y = b.items[id];
      if (!x || !y) items[id] = x || y;
      else items[id] = {content:choose(x.content,y.content),checked:choose(x.checked,y.checked),deleted:x.deleted && y.deleted ? (compare(x.deleted,y.deleted)>=0 ? x.deleted : y.deleted) : x.deleted || y.deleted};
    }
    return {v:1,clock:Math.max(a.clock,b.clock),name:choose(a.name,b.name),order:choose(a.order,b.order),items};
  }
  /** @param {ShoppingList} list @returns {SharedDocument} */
  function initial(list) {
    /** @type {Stamp} */ const stamp = [1,secret()];
    return {v:1,clock:1,name:{value:list.name,stamp},order:{value:list.items.map(i=>i.id),stamp},items:Object.fromEntries(list.items.map(i=>[i.id,{content:{value:{kind:i.kind,text:i.text},stamp},checked:{value:i.checked,stamp},deleted:null}]))};
  }
  /** @param {SharedDocument} original @param {ShoppingList} list @returns {SharedDocument} */
  function edit(original,list) {
    const doc = structuredClone(original);
    /** @type {Stamp} */ const stamp = [doc.clock+1,secret()];
    let changed = false;
    if (doc.name.value !== list.name) { doc.name = {value:list.name,stamp}; changed=true; }
    const ids = list.items.map(i=>i.id);
    for (const item of list.items) {
      const old = doc.items[item.id];
      if (!old) { doc.items[item.id] = {content:{value:{kind:item.kind,text:item.text},stamp},checked:{value:item.checked,stamp},deleted:null}; changed=true; continue; }
      if (old.deleted) continue;
      if (old.content.value.kind !== item.kind || old.content.value.text !== item.text) { old.content={value:{kind:item.kind,text:item.text},stamp}; changed=true; }
      if (old.checked.value !== item.checked) { old.checked={value:item.checked,stamp}; changed=true; }
    }
    for (const [id,item] of Object.entries(doc.items)) if (!item.deleted && !ids.includes(id)) { item.deleted=stamp; changed=true; }
    if (JSON.stringify(project(original,list).items.map(i=>i.id)) !== JSON.stringify(ids)) { doc.order={value:ids,stamp}; changed=true; }
    if (changed) doc.clock=stamp[0];
    return doc;
  }
  /** @param {SharedDocument} doc @param {ShoppingList} base @returns {ShoppingList} */
  function project(doc,base) {
    const alive = Object.keys(doc.items).filter(id=>!doc.items[id].deleted).sort();
    const ids = [...new Set([...doc.order.value.filter(id=>alive.includes(id)),...alive])];
    const now = new Date().toISOString();
    return {...base,name:doc.name.value,items:ids.map(id=>{ const old=base.items.find(i=>i.id===id); const item=doc.items[id]; return {id,...item.content.value,checked:item.checked.value,createdAt:old?.createdAt||now,updatedAt:now}; }),updatedAt:now};
  }
  /** Validate decrypted, untrusted content before it reaches IndexedDB or the UI. @param {any} doc @returns {SharedDocument} */
  function validate(doc) {
    const bad = () => { throw new Error('Die geteilte Liste hat ein ungültiges Format.'); };
    if (!doc || doc.v!==1 || !Number.isSafeInteger(doc.clock) || doc.clock<1 || doc.clock>=Number.MAX_SAFE_INTEGER-1 || !doc.items || Array.isArray(doc.items) || Object.keys(doc.items).length>10000) bad();
    /** @param {any} stamp */ const checkStamp = stamp => { if (!Array.isArray(stamp) || stamp.length!==2 || !Number.isSafeInteger(stamp[0]) || stamp[0]<1 || stamp[0]>doc.clock) bad(); token(stamp[1]); };
    /** @param {any} reg */ const checkReg = reg => { if (!reg || !('value' in reg)) bad(); checkStamp(reg.stamp); };
    checkReg(doc.name); checkReg(doc.order);
    if (typeof doc.name.value!=='string' || !doc.name.value.trim() || doc.name.value.length>100 || !Array.isArray(doc.order.value) || doc.order.value.length>10000 || new Set(doc.order.value).size!==doc.order.value.length) bad();
    for (const id of doc.order.value) if (typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) bad();
    for (const [id,item] of Object.entries(/** @type {Record<string,any>} */(doc.items))) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) bad();
      checkReg(item.content); checkReg(item.checked);
      const value=item.content.value;
      if (!value || !['item','heading','divider'].includes(value.kind) || typeof value.text!=='string' || value.text.length>500 || typeof item.checked.value!=='boolean') bad();
      if (item.deleted!==null) checkStamp(item.deleted);
    }
    // Rebuild only supported fields, with stable property ordering.
    return {v:1,clock:doc.clock,name:{value:doc.name.value,stamp:doc.name.stamp},order:{value:doc.order.value,stamp:doc.order.stamp},items:Object.fromEntries(Object.entries(/** @type {Record<string,SharedItem>} */(doc.items)).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,i])=>[id,{content:{value:{kind:i.content.value.kind,text:i.content.value.text},stamp:i.content.stamp},checked:{value:i.checked.value,stamp:i.checked.stamp},deleted:i.deleted}]))};
  }
  /** @param {Share} share */
  function ownerBackup(share) {
    if (!share.ownerToken) throw new Error('Nur der Besitzer kann eine Sicherung erstellen.');
    return {kind:'einkaufsliste-owner',version:1,origin:share.origin,remoteId:share.remoteId,key:share.key,memberToken:share.memberToken,ownerToken:share.ownerToken};
  }
  /** @param {any} value @param {string} origin @returns {Share} */
  function parseBackup(value,origin) {
    if (value?.kind!=='einkaufsliste-owner' || value.version!==1 || value.origin!==origin) throw new Error('Die Sicherung gehört nicht zu dieser Serveradresse oder hat ein unbekanntes Format.');
    for (const field of ['remoteId','key','memberToken','ownerToken']) token(value[field]);
    return {id:crypto.randomUUID(),remoteId:value.remoteId,origin,key:value.key,memberToken:value.memberToken,ownerToken:value.ownerToken,registered:true};
  }
  /** @param {any} value @returns {Claim} */
  function validateClaim(value) {
    if (!value || value.v!==1) throw new Error('Ungültige Einladung.');
    for (const field of ['remoteId','invitationId','claimToken','wrapKey','requestId']) token(value[field]);
    return {v:1,remoteId:value.remoteId,invitationId:value.invitationId,claimToken:value.claimToken,wrapKey:value.wrapKey,requestId:value.requestId};
  }
  /** Compact ASCII avoids double-encoding random values and keeps mobile QR modules large. @param {Pick<Claim,'remoteId'|'invitationId'|'claimToken'|'wrapKey'>} value */
  function invitationFragment(value) {
    const parts=[value.remoteId,value.invitationId,value.claimToken,value.wrapKey];
    for (const part of parts) token(part);
    return ['1',...parts].join('.');
  }
  /** Reopening the same link must preserve the durable idempotency key. @param {string} fragment @param {unknown} [previous] @returns {Claim} */
  function claimFromFragment(fragment,previous) {
    const parts=fragment.split('.');
    if (parts.length!==5 || parts[0]!=='1') throw new Error('Ungültige Einladung.');
    let candidate=validateClaim({v:1,remoteId:parts[1],invitationId:parts[2],claimToken:parts[3],wrapKey:parts[4],requestId:secret()});
    if (previous) {
      try { const saved=validateClaim(previous); if (invitationFragment(saved)===invitationFragment(candidate)) candidate=saved; } catch { /* An invalid previous link cannot grant access. */ }
    }
    return candidate;
  }
  return {encode,decode,secret,token,hash,encrypt,decrypt,contentContext,invitationContext,canonical,merge,initial,edit,project,validate,ownerBackup,parseBackup,validateClaim,invitationFragment,claimFromFragment,invitationBox};
})();

class ShareError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status,message) { super(message); this.status=status; }
}
class ShareTransport {
  /** @param {string} origin */
  constructor(origin) { this.origin=origin; }
  /** @param {string} path @param {string} token @param {string} [method] @param {unknown} [body] @param {AbortSignal} [signal] @param {Record<string,string>} [headers] */
  async request(path,token,method='GET',body=undefined,signal=undefined,headers={}) {
    const response = await fetch(this.origin+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    const data = response.status===204 || response.status===304 ? null : await response.json().catch(()=>null);
    if (!response.ok && response.status!==304) throw new ShareError(response.status,data?.error || 'Server nicht erreichbar.');
    return {status:response.status,data,revision:response.headers.get('ETag')};
  }
}
// END SHARE PROTOCOL

/** @template {HTMLElement} T @param {string} id @returns {T} */
function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Element fehlt: ${id}`);
  return /** @type {T} */ (found);
}

const ui = {
  shell: element("app-shell"), select: /** @type {HTMLSelectElement} */ (element("list-select")),
  list: element("shopping-list"), viewport: element("list-viewport"), newList: element("new-list"),
  menuToggle: element("list-menu-toggle"), menu: element("list-menu"), all: element("toggle-all"),
  allLabel: element("all-label"), count: element("item-count"), progress: element("progress-fill"),
  searchForm: element("search-form"), search: /** @type {HTMLInputElement} */ (element("list-search")), searchClear: element("search-clear"), searchCount: element("search-count"),
  normal: element("scale-normal"), large: element("scale-large"), item: element("kind-item"), heading: element("kind-heading"), divider: element("add-divider"),
  composer: /** @type {HTMLFormElement} */ (element("composer")), input: /** @type {HTMLInputElement} */ (element("new-text")), add: element("add-item"),
  composerPanel: element("composer-panel"), composerGrip: /** @type {HTMLButtonElement} */ (element("composer-grip")), composerContent: element("composer-content"),
  empty: element("empty-state"), emptyText: element("empty-text"), emptyCreate: element("empty-create"),
  status: element("save-status"), statusText: element("save-status-text"),
  error: element("storage-error"), errorMessage: element("storage-error-message"), retry: element("retry-storage"),
  dialog: /** @type {HTMLDialogElement} */ (element("editor")), form: /** @type {HTMLFormElement} */ (element("editor-form")),
  dialogTitle: element("dialog-title"), fields: element("dialog-fields"), dialogError: element("dialog-error"),
  save: /** @type {HTMLButtonElement} */ (element("save-dialog")), remove: /** @type {HTMLButtonElement} */ (element("dialog-delete")),
  close: element("close-dialog"), cancel: element("cancel-dialog"), toast: element("toast"), announcer: element("announcer"), landscape: element("landscape-notice")
};

const shareUI = {
  dialog:/** @type {HTMLDialogElement} */(element('sharing-dialog')), title:element('sharing-title'), body:element('sharing-body'), error:element('sharing-error'), actions:element('sharing-actions'), close:/** @type {HTMLButtonElement} */(element('sharing-close')),
  banner:element('sync-status'), backup:/** @type {HTMLInputElement} */(element('owner-backup'))
};
/** @type {Share|null} */ let selectedShare=null;
let waitingForOwner=false;
let remoteStatus='';
let syncTarget='';
let syncTimer=0;
let syncFailures=0;
let syncAgain=false;
/** @type {AbortController|null} */ let syncRequest=null;
/** @type {Claim|null} */ let pendingClaim=null;
let sharingBusy=false;
/** @type {string|null} */ let sharingListId=null;
const transport=new ShareTransport(location.origin);
const incomingInvitation=location.hash.startsWith('#einladung=') ? location.hash.slice(11) : null;
if (incomingInvitation!==null) history.replaceState(null,'',location.pathname+location.search);

function stopSync() {
  window.clearTimeout(syncTimer); syncTimer=0; syncAgain=false;
  syncRequest?.abort(); syncRequest=null;
}
/** @param {number} [delay] */
function scheduleSync(delay=300) {
  window.clearTimeout(syncTimer);
  if (!selectedShare || document.hidden || !state.ready) return;
  if (syncRequest) { syncAgain=true; return; }
  syncTimer=window.setTimeout(()=>{ void syncSelected(); },delay);
}
function reconcileSync() {
  const target=selectedShare ? `${selectedShare.id}/${selectedShare.remoteId}` : '';
  if (target===syncTarget) return;
  stopSync(); syncTarget=target; syncFailures=0; remoteStatus=selectedShare ? 'Geteilt · lokal gespeichert' : '';
  scheduleSync(0);
}
async function syncSelected() {
  if (syncRequest) { syncAgain=true; return; }
  const share=selectedShare, store=state.store;
  if (!share || !store || document.hidden || !state.ready) return;
  const controller=new AbortController(); syncRequest=controller;
  let delay=3000;
  try {
    const before=await store.syncState(share.id);
    const result=await new ShareSync(store,transport).sync(share.id,controller.signal);
    if (controller.signal.aborted || syncRequest!==controller) return;
    syncFailures=0;
    remoteStatus={private:'',waiting:'Warte auf Besitzer',invitation:'Warte auf QR-Annahme',synced:'Geteilt · synchronisiert',pending:'Geteilt · Änderungen warten'}[result];
    if (result==='pending') delay=300;
    const after=await store.syncState(share.id);
    await refresh();
    if (JSON.stringify(before)!==JSON.stringify(after)) channel?.postMessage({synced:true});
  } catch (error) {
    if (controller.signal.aborted || syncRequest!==controller) return;
    syncFailures++;
    delay=Math.min(60000,3000*2**Math.min(syncFailures-1,5));
    remoteStatus=error instanceof ShareError ? error.status===410 ? 'Freigabe beendet · lokal gespeichert' : error.status===404 ? 'Kein Serverzugriff · lokal gespeichert' : `${error.message} Lokal gespeichert.` : error instanceof TypeError || !navigator.onLine ? 'Offline · lokal gespeichert' : 'Synchronisierung fehlgeschlagen · lokal gespeichert';
  } finally {
    if (syncRequest===controller) {
      syncRequest=null; renderSyncStatus();
      const again=syncAgain; syncAgain=false;
      scheduleSync(again ? 300 : delay);
    }
  }
}
function renderSyncStatus() {
  shareUI.banner.hidden=!selectedShare;
  shareUI.banner.textContent=remoteStatus || 'Geteilt · lokal gespeichert';
  const progress=document.getElementById('sharing-progress');
  if (progress && sharingListId===selectedShare?.id) progress.textContent=remoteStatus;
}
/** @param {string} title @param {string|null} [listId] */
function sharingScreen(title,listId=null) {
  toggleMenu(false); sharingListId=listId;
  shareUI.title.textContent=title; shareUI.body.replaceChildren(); shareUI.actions.replaceChildren(); shareUI.error.hidden=true;
  if (!shareUI.dialog.open) shareUI.dialog.showModal();
}
/** @param {string} text */
function sharingCopy(text) { const p=document.createElement('p'); p.className='dialog-copy'; p.textContent=text; shareUI.body.append(p); return p; }
/** @param {string} text @param {()=>Promise<void>|void} action @param {boolean} [danger] */
function sharingButton(text,action,danger=false) {
  const button=document.createElement('button'); button.type='button'; button.className=danger?'text-button danger-text':'filled-button'; button.textContent=text;
  button.addEventListener('click',()=>{ void sharingWork(action); }); shareUI.actions.append(button); return button;
}
/** @param {()=>Promise<void>|void} work */
async function sharingWork(work) {
  if (sharingBusy) return;
  sharingBusy=true; shareUI.error.hidden=true; shareUI.close.disabled=true;
  for (const button of shareUI.actions.querySelectorAll('button')) button.disabled=true;
  try { await work(); }
  catch (error) { shareUI.error.textContent=error instanceof Error ? error.message : 'Aktion fehlgeschlagen. Bitte erneut versuchen.'; shareUI.error.hidden=false; }
  finally { sharingBusy=false; shareUI.close.disabled=false; for (const button of shareUI.actions.querySelectorAll('button')) button.disabled=false; }
}
function closeSharing() { if (sharingBusy) return; shareUI.dialog.close(); ui.menuToggle.focus(); }
/** @param {string} id */
async function showSharing(id) {
  const store=state.store; if (!store) return;
  const share=await store.share(id);
  sharingScreen(share?.ownerToken ? 'Liste teilen' : share ? 'Geteilte Liste' : 'Liste teilen',id);
  if (share && !share.ownerToken) {
    sharingCopy('Diese Liste wird Ende-zu-Ende-verschlüsselt geteilt. Alle Teilnehmer können Einträge bearbeiten. Neue Personen kann nur der Besitzer einladen.');
    const progress=sharingCopy(remoteStatus); progress.id='sharing-progress';
    sharingCopy('Du kannst die Liste auch als private Kopie behalten. Danach erhält diese Kopie keine weiteren Änderungen.');
    sharingButton('Als private Kopie behalten',async()=>{ stopSync(); await store.detachShare(share); await refresh(); channel?.postMessage({changed:true}); shareUI.dialog.close(); });
    return;
  }
  sharingCopy('Der QR-Code gibt einer Person Zugriff auf diese Liste. Er ist zehn Minuten und nur einmal gültig. Beim ersten Teilen müssen beide Apps geöffnet und online sein.');
  sharingCopy('Name und Einträge bleiben verschlüsselt. Inhalte werden erst nach bestätigter Übernahme hochgeladen.');
  const invite=await store.invitation(id);
  if (share && invite) {
    try {
      const status=await transport.request(`/api/shares/${share.remoteId}/invitation`,share.ownerToken || '');
      if (status.data.id===invite.invitationId && !status.data.expired && !status.data.claimed) { displayInvitation(share,invite); return; }
      if (status.data.claimed) sharingCopy('Die letzte Einladung wurde bereits übernommen. Für eine weitere Person wird ein neuer QR-Code benötigt.');
      sharingButton('Neuen QR-Code erzeugen',()=>createInvitation(id,true));
    } catch { sharingCopy('Die letzte Einladung konnte nicht geprüft werden. Erneutes Erzeugen versucht es mit dem Server noch einmal.'); sharingButton('QR-Code erneut erzeugen',()=>createInvitation(id,false)); }
  } else sharingButton('QR-Code erzeugen',()=>createInvitation(id,false));
}
/** @param {Share} share @param {Invitation} invite */
function displayInvitation(share,invite) {
  shareUI.body.replaceChildren();
  sharingCopy('Einmaliger Zugang zur Liste. Mit der Smartphone-Kamera scannen; beim ersten Teilen beide Apps geöffnet lassen.');
  const payload={v:1,remoteId:share.remoteId,invitationId:invite.invitationId,claimToken:invite.claimToken,wrapKey:invite.wrapKey};
  const url=new URL(location.pathname,location.origin);
  url.hash='einladung='+ShareProtocol.invitationFragment(payload);
  const qr=qrcodegen.QrCode.encodeText(url.href,qrcodegen.QrCode.Ecc.MEDIUM);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id='qr-code'; svg.setAttribute('viewBox',`0 0 ${qr.size+8} ${qr.size+8}`); svg.setAttribute('role','img'); svg.setAttribute('aria-label','Einmaliger QR-Code zum Teilen der Liste');
  const background=document.createElementNS(svg.namespaceURI,'rect'); background.setAttribute('width','100%'); background.setAttribute('height','100%'); background.setAttribute('fill','#ffffff'); svg.append(background);
  let path=''; for (let y=0;y<qr.size;y++) for (let x=0;x<qr.size;x++) if (qr.getModule(x,y)) path+=`M${x+4},${y+4}h1v1h-1z`;
  const modules=document.createElementNS(svg.namespaceURI,'path'); modules.setAttribute('d',path); modules.setAttribute('fill','#000000'); svg.append(modules); shareUI.body.append(svg);
  sharingCopy(`Mit der Smartphone-Kamera scannen. Gültig bis ${new Date(invite.expiresAt || 0).toLocaleTimeString('de',{hour:'2-digit',minute:'2-digit'})}. Wer den Code zuerst einlöst, erhält Zugriff.`);
  sharingCopy('Abbrechen sperrt unbenutzte Einladungen. Bereits übernommene Listen bleiben geteilt; nutze dafür „Freigabe beenden“.');
  const progress=sharingCopy(remoteStatus || 'Warte auf QR-Annahme'); progress.id='sharing-progress';
  const field=document.createElement('label'); field.className='field'; const caption=document.createElement('span'); caption.textContent='Einladungslink (geheim halten)';
  const link=document.createElement('input'); link.type='text'; link.readOnly=true; link.value=url.href; link.setAttribute('aria-label','Einladungslink'); field.append(caption,link); field.hidden=true; shareUI.body.append(field);
  shareUI.actions.replaceChildren();
  sharingButton('Link kopieren',async()=>{ try { await navigator.clipboard.writeText(url.href); toast('Einladungslink kopiert'); } catch { field.hidden=false; link.focus(); link.select(); sharingCopy('Bitte den markierten Link über das Kopiermenü kopieren.'); } });
  sharingButton('Neuer QR-Code',()=>createInvitation(share.id,true));
  sharingButton('Einladung abbrechen',async()=>{ await transport.request(`/api/shares/${share.remoteId}/invitation`,share.ownerToken || '','DELETE'); await state.store?.deleteInvitation(share.id); await showSharing(share.id); scheduleSync(0); },true);
}
/** @param {string} id @param {boolean} force */
async function createInvitation(id,force) {
  const store=state.store; if (!store) return;
  if (!window.isSecureContext || !crypto.subtle) throw new Error('Zum Teilen wird HTTPS benötigt (lokal ist localhost erlaubt).');
  const share=await store.prepareShare(id,location.origin);
  if (!share.ownerToken) throw new Error('Nur der Besitzer kann Personen einladen.');
  let invite=await store.invitation(id);
  if (force || !invite || (invite.expiresAt!==null && invite.expiresAt<=Date.now())) {
    const invitationId=ShareProtocol.secret(), claimToken=ShareProtocol.secret(), wrapKey=ShareProtocol.secret();
    const box=await ShareProtocol.invitationBox(share,invitationId,wrapKey);
    invite={id,invitationId,claimToken,wrapKey,box,expiresAt:null};
    await store.saveInvitation(invite);
  }
  // Credentials and the idempotent invitation are durable before the first request.
  await refresh();
  await transport.request('/api/shares',share.ownerToken,'POST',{id:share.remoteId,memberHash:await ShareProtocol.hash(share.memberToken)});
  await store.markRegistered(share);
  const response=await transport.request(`/api/shares/${share.remoteId}/invitation`,share.ownerToken,'POST',{id:invite.invitationId,claimHash:await ShareProtocol.hash(invite.claimToken),box:invite.box});
  invite.expiresAt=response.data.expiresAt; await store.saveInvitation(invite);
  await showSharing(id); scheduleSync(0); channel?.postMessage({changed:true});
}
/** @param {boolean} deleteAll */
async function confirmEndSharing(deleteAll) {
  const share=selectedShare, store=state.store; if (!share?.ownerToken || !store) return;
  sharingScreen(deleteAll?'Für alle löschen?':'Freigabe beenden?',share.id);
  sharingCopy(deleteAll?'Die Freigabe wird für alle gesperrt und deine lokale Liste gelöscht. Bereits entschlüsselte Kopien auf anderen Geräten lassen sich nicht zurückholen.':'Alle bisherigen Zugänge und Einladungen werden gesperrt. Deine lokale Liste bleibt erhalten. Erneutes Teilen erzeugt neue Schlüssel und erfordert neue Einladungen.');
  sharingCopy('Die Aktion ist erst nach einer Bestätigung des Servers abgeschlossen.');
  sharingButton(deleteAll?'Für alle löschen':'Freigabe beenden',async()=>{
    stopSync();
    try {
      await transport.request(`/api/shares/${share.remoteId}`,share.ownerToken || '','DELETE');
      if (deleteAll) await store.remove(share.id); else await store.detachShare(share);
      await refresh(); channel?.postMessage({changed:true}); shareUI.dialog.close(); toast(deleteAll?'Freigabe beendet und Liste gelöscht':'Freigabe beendet; lokale Liste bleibt erhalten');
    } finally { scheduleSync(0); }
  },true);
}
async function showBackupExport() {
  const share=selectedShare; if (!share?.ownerToken) return;
  sharingScreen('Besitzer-Sicherung',share.id);
  sharingCopy('Diese Datei enthält den Listenschlüssel und alle Besitzerrechte. Bewahre sie wie ein Passwort auf und gib sie nicht weiter. Sie stellt nur den zuletzt synchronisierten Stand wieder her; ausstehende lokale Änderungen sind nicht enthalten.');
  sharingButton('Sicherung herunterladen',async()=>{
    await transport.request(`/api/shares/${share.remoteId}/invitation`,share.ownerToken || '');
    const remote=await transport.request(`/api/shares/${share.remoteId}/content`,share.ownerToken || '');
    if (remote.status===202) throw new Error('Eine Sicherung ist erst nach dem ersten Inhaltsupload möglich.');
    const backup=ShareProtocol.ownerBackup(share);
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download='einkaufsliste-besitzer-sicherung.json'; a.click(); window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    sharingCopy('Sicherung heruntergeladen. Nach dem Beenden und erneuten Teilen wird eine neue Sicherung benötigt.');
  });
}
function showBackupImport() {
  sharingScreen('Sicherung importieren');
  sharingCopy('Wähle eine Besitzer-Sicherung dieser Serveradresse. Der zuletzt synchronisierte Stand wird heruntergeladen und lokal gespeichert. Bestehende Listen bleiben erhalten.');
  sharingButton('Sicherungsdatei auswählen',()=>{ shareUI.backup.value=''; shareUI.backup.click(); });
}
/** @param {File} file */
async function importOwnerBackup(file) {
  if (file.size>16384) throw new Error('Die Sicherungsdatei ist zu groß.');
  if (!state.store) return;
  const id=await new ShareSync(state.store,transport).restoreOwner(JSON.parse(await file.text()));
  state.activeId=id; state.query=''; await refresh(); scheduleSync(0); channel?.postMessage({changed:true}); shareUI.dialog.close(); toast('Besitzerzugriff wiederhergestellt');
}
function showClaim() {
  const claim=pendingClaim; if (!claim) return;
  sharingScreen('Liste übernehmen');
  sharingCopy('Möchtest du diese Ende-zu-Ende-verschlüsselte Liste übernehmen? Beim ersten Teilen muss die Besitzer-App geöffnet und online sein. Alle Teilnehmer können die Liste bearbeiten.');
  sharingButton('Liste übernehmen',async()=>{
    const response=await transport.request(`/api/shares/${claim.remoteId}/claim`,claim.claimToken,'POST',{invitationId:claim.invitationId,requestId:claim.requestId});
    const packet=await ShareProtocol.decrypt(claim.wrapKey,ShareProtocol.invitationContext(claim.remoteId,claim.invitationId),response.data.box);
    if (packet?.v!==1 || packet.remoteId!==claim.remoteId || 'ownerToken' in packet) throw new Error('Ungültiges Schlüsselpaket.');
    ShareProtocol.token(packet.key); ShareProtocol.token(packet.memberToken);
    if (!state.store) return;
    const id=await state.store.installShare({id:uuid(),remoteId:claim.remoteId,origin:location.origin,key:packet.key,memberToken:packet.memberToken,ownerToken:null,registered:true},null);
    await state.store.preference('pendingClaim',null); pendingClaim=null; state.activeId=id; state.query='';
    await refresh(); scheduleSync(0); channel?.postMessage({changed:true}); shareUI.dialog.close(); toast('Liste übernommen; Änderungen erscheinen nach der Synchronisierung.');
  });
  sharingButton('Einladung verwerfen',async()=>{ await state.store?.preference('pendingClaim',null); pendingClaim=null; shareUI.dialog.close(); render(); },true);
}
async function restoreInvitation() {
  if (!state.store) return;
  try {
    if (incomingInvitation!==null) {
      if (incomingInvitation.length>4096) throw new Error('Ungültige Einladung.');
      const saved=/** @type {Preference|undefined} */(await state.store.read('preferences','pendingClaim'));
      pendingClaim=ShareProtocol.claimFromFragment(incomingInvitation,saved?.value);
      await state.store.preference('pendingClaim',pendingClaim);
    } else {
      const saved=await state.store.read('preferences','pendingClaim');
      if (saved && /** @type {Preference} */(saved).value) pendingClaim=ShareProtocol.validateClaim(/** @type {Preference} */(saved).value);
    }
    if (pendingClaim) showClaim();
  } catch { toast('Die Einladung konnte nicht gelesen werden. Bitte einen neuen QR-Code verwenden.'); }
  render();
}
shareUI.close.addEventListener('click',closeSharing);
shareUI.dialog.addEventListener('cancel',event=>{ event.preventDefault(); closeSharing(); });
shareUI.backup.addEventListener('change',()=>{ const file=shareUI.backup.files?.[0]; if (file) void sharingWork(()=>importOwnerBackup(file)); });
window.addEventListener('online',()=>{ stopSync(); syncFailures=0; scheduleSync(0); });
document.addEventListener('visibilitychange',()=>{ if (document.hidden) stopSync(); else { syncFailures=0; scheduleSync(0); } });
window.addEventListener('pagehide',stopSync);

/** @returns {string} */
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** @param {string} name @returns {ShoppingList} */
function makeList(name) {
  const now = new Date().toISOString();
  return { id: uuid(), name, items: [], createdAt: now, updatedAt: now, schemaVersion: 1 };
}

// All local edits and merge metadata commit together, before network activity.
class LocalStore {
  /** @param {IDBDatabase} database */
  constructor(database) { this.database = database; }

  /** @returns {Promise<LocalStore>} */
  static open() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB ist nicht verfügbar.")); return; }
      const request = indexedDB.open("einkaufsliste-local", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("lists")) db.createObjectStore("lists", { keyPath: "id" });
        if (!db.objectStoreNames.contains("preferences")) db.createObjectStore("preferences", { keyPath: "key" });
        const shares = db.createObjectStore("shares", { keyPath: "id" });
        shares.createIndex("remoteId", "remoteId", {unique:true});
        db.createObjectStore("syncStates", {keyPath:"id"});
        db.createObjectStore("invitations", {keyPath:"id"});
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Ein anderer Tab blockiert den lokalen Speicher. Bitte schließe ältere Tabs."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          showFatal("Die Speicherversion wurde in einem anderen Tab geändert. Bitte lade die Seite neu.");
        };
        resolve(new LocalStore(db));
      };
    });
  }

  /** @param {string[]} stores @param {(transaction: IDBTransaction) => void} work @returns {Promise<void>} */
  write(stores, work) {
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction(stores, "readwrite");
      /** @type {unknown} */ let failure = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure || tx.error || new Error("Speichern fehlgeschlagen."));
      tx.onerror = () => { /* The abort handler reports failed requests. */ };
      try { work(tx); } catch (error) { failure = error; tx.abort(); }
    });
  }

  /** @returns {Promise<void>} */
  initialize() {
    return this.write(["lists", "preferences"], tx => {
      const preferences = tx.objectStore("preferences");
      const request = preferences.get("initialized");
      request.onsuccess = () => {
        if (request.result) return;
        const list = makeList("Einkaufsliste");
        tx.objectStore("lists").add(list);
        preferences.put({ key: "activeListId", value: list.id });
        preferences.put({ key: "large", value: false });
        preferences.put({ key: "initialized", value: true });
      };
    });
  }

  /** @returns {Promise<Snapshot>} */
  snapshot() {
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction(["lists", "preferences", "shares", "syncStates"], "readonly");
      const lists = tx.objectStore("lists").getAll();
      const preferences = tx.objectStore("preferences").getAll();
      const shares = tx.objectStore("shares").getAll();
      const syncStates = tx.objectStore("syncStates").getAll();
      tx.oncomplete = () => resolve({ lists: lists.result, preferences: preferences.result, shares: shares.result, syncStates: syncStates.result });
      tx.onabort = () => reject(tx.error || new Error("Lesen fehlgeschlagen."));
    });
  }

  /** @param {string} key @param {unknown} value @returns {Promise<void>} */
  preference(key, value) {
    return this.write(["preferences"], tx => { tx.objectStore("preferences").put({ key, value }); });
  }

  /** @param {ShoppingList} list @returns {Promise<void>} */
  create(list) {
    return this.write(["lists", "preferences"], tx => {
      tx.objectStore("lists").add(list);
      tx.objectStore("preferences").put({ key: "activeListId", value: list.id });
    });
  }

  /** @param {string} id @param {(list: ShoppingList) => void} change @returns {Promise<void>} */
  update(id, change) {
    // Read and write in one transaction so edits in another tab are preserved.
    return this.write(["lists", "shares", "syncStates"], tx => {
      const store = tx.objectStore("lists");
      const request = store.get(id);
      request.onsuccess = () => {
        const list = /** @type {ShoppingList | undefined} */ (request.result);
        if (!list) { tx.abort(); return; }
        const shareRequest = tx.objectStore("shares").get(id);
        shareRequest.onsuccess = () => {
          if (!shareRequest.result) { change(list); list.updatedAt=new Date().toISOString(); store.put(list); return; }
          const metadata = tx.objectStore("syncStates").get(id);
          metadata.onsuccess = () => {
            const record = /** @type {SyncRecord|undefined} */(metadata.result);
            if (!record?.doc) { tx.abort(); return; }
            change(list);
            const doc=ShareProtocol.validate(ShareProtocol.edit(record.doc,list));
            tx.objectStore("syncStates").put({id,doc,dirty:record.dirty || ShareProtocol.canonical(doc)!==ShareProtocol.canonical(record.doc)});
            store.put(ShareProtocol.project(doc,list));
          };
        };
      };
    });
  }

  /** @param {string} id @returns {Promise<void>} */
  remove(id) {
    return this.write(["lists", "preferences", "shares", "syncStates", "invitations"], tx => {
      for (const store of ["shares", "syncStates", "invitations"]) tx.objectStore(store).delete(id);
      const lists = tx.objectStore("lists");
      lists.delete(id);
      const request = lists.getAll();
      request.onsuccess = () => {
        const remaining = /** @type {ShoppingList[]} */ (request.result);
        remaining.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        tx.objectStore("preferences").put({ key: "activeListId", value: remaining[0]?.id || null });
      };
    });
  }
  /** @template T @param {string} store @param {IDBValidKey} id @returns {Promise<T|undefined>} */
  read(store,id) {
    return new Promise((resolve,reject)=>{ const tx=this.database.transaction(store,'readonly'); const request=tx.objectStore(store).get(id); tx.oncomplete=()=>resolve(request.result); tx.onabort=()=>reject(tx.error); });
  }
  /** @param {string} id @returns {Promise<Share|undefined>} */
  share(id) { return this.read('shares',id); }
  /** @param {string} id @returns {Promise<SyncRecord|undefined>} */
  syncState(id) { return this.read('syncStates',id); }
  /** @param {string} id @returns {Promise<Invitation|undefined>} */
  invitation(id) { return this.read('invitations',id); }
  /** @param {string} id @param {string} origin @returns {Promise<Share>} */
  async prepareShare(id,origin) {
    /** @type {Share} */ const candidate={id,remoteId:ShareProtocol.secret(),origin,key:ShareProtocol.secret(),memberToken:ShareProtocol.secret(),ownerToken:ShareProtocol.secret(),registered:false};
    let result=candidate;
    await this.write(['lists','shares','syncStates'],tx=>{
      const request=tx.objectStore('shares').get(id);
      request.onsuccess=()=>{
        if (request.result) { result=request.result; return; }
        const listRequest=tx.objectStore('lists').get(id);
        listRequest.onsuccess=()=>{ if (!listRequest.result) { tx.abort(); return; } tx.objectStore('shares').put(candidate); tx.objectStore('syncStates').put({id,doc:ShareProtocol.initial(listRequest.result),dirty:true}); };
      };
    });
    return result;
  }
  /** @param {Share} expected */
  markRegistered(expected) {
    return this.write(['shares'],tx=>{ const store=tx.objectStore('shares'); const request=store.get(expected.id); request.onsuccess=()=>{ const current=/** @type {Share|undefined} */(request.result); if (current?.remoteId===expected.remoteId) store.put({...current,registered:true}); }; });
  }
  /** @param {Share} expected @param {SharedDocument} remote @returns {Promise<SharedDocument>} */
  async mergeRemote(expected,remote) {
    let merged=remote;
    await this.write(['lists','shares','syncStates'],tx=>{
      const request=tx.objectStore('shares').get(expected.id);
      request.onsuccess=()=>{
        if (request.result?.remoteId!==expected.remoteId) { tx.abort(); return; }
        const recordRequest=tx.objectStore('syncStates').get(expected.id);
        recordRequest.onsuccess=()=>{
          const record=/** @type {SyncRecord} */(recordRequest.result);
          merged=record.doc ? ShareProtocol.merge(record.doc,remote) : remote;
          tx.objectStore('syncStates').put({id:expected.id,doc:merged,dirty:ShareProtocol.canonical(merged)!==ShareProtocol.canonical(remote)});
          const listRequest=tx.objectStore('lists').get(expected.id);
          listRequest.onsuccess=()=>{ if (listRequest.result) tx.objectStore('lists').put(ShareProtocol.project(merged,listRequest.result)); else tx.abort(); };
        };
      };
    });
    return merged;
  }
  /** Clear the durable dirty flag only if no later local edit exists. @param {Share} expected @param {SharedDocument} sent @returns {Promise<boolean>} */
  async acknowledge(expected,sent) {
    let acknowledged=false;
    await this.write(['shares','syncStates'],tx=>{
      const shareRequest=tx.objectStore('shares').get(expected.id);
      shareRequest.onsuccess=()=>{
        if (shareRequest.result?.remoteId!==expected.remoteId) return;
        const request=tx.objectStore('syncStates').get(expected.id);
        request.onsuccess=()=>{ const record=/** @type {SyncRecord|undefined} */(request.result); if (record?.doc && ShareProtocol.canonical(record.doc)===ShareProtocol.canonical(sent)) { acknowledged=true; tx.objectStore('syncStates').put({...record,dirty:false}); } };
      };
    });
    return acknowledged;
  }
  /** @param {Share} expected */
  detachShare(expected) {
    return this.write(['shares','syncStates','invitations'],tx=>{ const request=tx.objectStore('shares').get(expected.id); request.onsuccess=()=>{ if (request.result?.remoteId!==expected.remoteId) return; for (const store of ['shares','syncStates','invitations']) tx.objectStore(store).delete(expected.id); }; });
  }
  /** @param {Invitation} invite */
  saveInvitation(invite) { return this.write(['invitations'],tx=>{ tx.objectStore('invitations').put(invite); }); }
  /** @param {string} id */
  deleteInvitation(id) { return this.write(['invitations'],tx=>{ tx.objectStore('invitations').delete(id); }); }
  /** @param {Share} credentials @param {SharedDocument|null} remote @returns {Promise<string>} */
  async installShare(credentials,remote) {
    let id=credentials.id;
    await this.write(['lists','shares','syncStates','preferences'],tx=>{
      const shares=tx.objectStore('shares'); const request=shares.index('remoteId').get(credentials.remoteId);
      request.onsuccess=()=>{
        const existing=/** @type {Share|undefined} */(request.result);
        if (existing) {
          if (existing.key!==credentials.key || existing.memberToken!==credentials.memberToken) { tx.abort(); return; }
          id=existing.id;
          if (credentials.ownerToken) shares.put({...existing,ownerToken:credentials.ownerToken});
        } else {
          shares.add(credentials);
          const base=makeList('Geteilte Liste'); base.id=id;
          tx.objectStore('lists').add(remote ? ShareProtocol.project(remote,base) : base);
          tx.objectStore('syncStates').add({id,doc:remote,dirty:false});
        }
        tx.objectStore('preferences').put({key:'activeListId',value:id});
      };
    });
    if (remote) await this.mergeRemote({...credentials,id},remote);
    return id;
  }

}

// BEGIN SHARE SYNC
class ShareSync {
  /** @param {LocalStore} store @param {ShareTransport} transport */
  constructor(store,transport) { this.store=store; this.transport=transport; }
  /** Validate origin before any request; prove owner rights separately from content access. @param {unknown} value @returns {Promise<string>} */
  async restoreOwner(value) {
    const share=ShareProtocol.parseBackup(value,this.transport.origin);
    await this.transport.request(`/api/shares/${share.remoteId}/invitation`,share.ownerToken || '');
    const remote=await this.transport.request(`/api/shares/${share.remoteId}/content`,share.memberToken);
    if (remote.status===202) throw new Error('Auf dem Server ist noch kein Listeninhalt vorhanden.');
    const doc=ShareProtocol.validate(await ShareProtocol.decrypt(share.key,ShareProtocol.contentContext(share.remoteId),remote.data));
    return this.store.installShare(share,doc);
  }
  /** @param {string} id @param {AbortSignal} signal @returns {Promise<'private'|'waiting'|'invitation'|'synced'|'pending'>} */
  async sync(id,signal) {
    const share=await this.store.share(id);
    if (!share) return 'private';
    if (share.origin!==this.transport.origin) throw new Error('Die gespeicherte Serveradresse stimmt nicht überein.');
    const path=`/api/shares/${share.remoteId}`;
    const token=share.ownerToken || share.memberToken;
    if (!share.registered) {
      if (!share.ownerToken) throw new Error('Fehlende Besitzerberechtigung.');
      await this.transport.request('/api/shares',share.ownerToken,'POST',{id:share.remoteId,memberHash:await ShareProtocol.hash(share.memberToken)},signal);
      await this.store.markRegistered(share);
    }
    for (let attempt=0;attempt<4;attempt++) {
      signal.throwIfAborted();
      try {
        const remote=await this.transport.request(`${path}/content`,token,'GET',undefined,signal);
        /** @type {SharedDocument} */ let merged;
        if (remote.status===202) {
          if (!share.ownerToken) return 'waiting';
          const invitation=await this.transport.request(`${path}/invitation`,share.ownerToken,'GET',undefined,signal);
          if (!invitation.data.ready) return 'invitation';
          const record=await this.store.syncState(id);
          if (!record?.doc) return 'waiting';
          merged=record.doc;
        } else {
          const document=ShareProtocol.validate(await ShareProtocol.decrypt(share.key,ShareProtocol.contentContext(share.remoteId),remote.data));
          signal.throwIfAborted();
          merged=await this.store.mergeRemote(share,document);
          if (ShareProtocol.canonical(merged)===ShareProtocol.canonical(document)) return await this.store.acknowledge(share,merged) ? 'synced' : 'pending';
        }
        const ciphertext=await ShareProtocol.encrypt(share.key,ShareProtocol.contentContext(share.remoteId),merged);
        signal.throwIfAborted();
        await this.transport.request(`${path}/content`,token,'PUT',ciphertext,signal,remote.status===202 ? {'If-None-Match':'*'} : {'If-Match':remote.revision || ''});
        return await this.store.acknowledge(share,merged) ? 'synced' : 'pending';
      } catch (error) { if (!(error instanceof ShareError) || error.status!==409 || attempt===3) throw error; }
    }
    return 'pending';
  }
}
// END SHARE SYNC

/** @type {{store: LocalStore | null, lists: ShoppingList[], activeId: string | null, large: boolean, kind: 'item' | 'heading', query: string, ready: boolean, pending: number, failed: boolean, editor: EditorContext | null, drag: DragSession | null, refreshPending: boolean, composerCollapsed: boolean}} */
const state = { store: null, lists: [], activeId: null, large: false, kind: "item", query: "", ready: false, pending: 0, failed: false, editor: null, drag: null, refreshPending: false, composerCollapsed: false };
let writeQueue = Promise.resolve();
let toastTimer = 0;
let ignoreClickUntil = 0;
/** @type {{pointerId: number, startY: number, y: number, moved: boolean} | null} */
let composerDrag = null;
let ignoreComposerClick = false;
let editorSaving = false;
/** @type {HTMLElement | null} */ let dialogReturnFocus = null;
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("einkaufsliste-local-changes") : null;

/** @returns {ShoppingList | undefined} */
function activeList() { return state.lists.find(list => list.id === state.activeId); }

/** @param {string} text @returns {string} */
function searchText(text) {
  return text.toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}

/** @param {ShoppingList | undefined} [list] @returns {ListItem[]} */
function visibleItems(list = activeList()) {
  const terms = searchText(state.query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return list?.items || [];
  return list?.items.filter(item => item.kind !== "divider" && terms.every(term => searchText(item.text).includes(term))) || [];
}

function clearSearch() {
  state.query = ""; ui.search.value = ""; render(); ui.viewport.scrollTop = 0;
}

/** @param {string} text */
function announce(text) { ui.announcer.textContent = ""; requestAnimationFrame(() => { ui.announcer.textContent = text; }); }

/** @param {string} text */
function toast(text) {
  window.clearTimeout(toastTimer);
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  announce(text);
  toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 3500);
}

function renderStatus() {
  ui.status.dataset.state = state.failed ? "error" : state.pending ? "saving" : "saved";
  ui.statusText.textContent = state.failed ? "Speicherfehler" : state.pending ? "Speichern …" : "Lokal gespeichert";
  renderSyncStatus();
}

/** @param {string} message */
function showFatal(message) {
  state.ready = false;
  state.failed = true;
  ui.errorMessage.textContent = message;
  ui.error.hidden = false;
  render();
}

/** @param {boolean} [initial] */
async function refresh(initial = false) {
  if (!state.store) return;
  if (state.drag) { state.refreshPending = true; return; }
  const snapshot = await state.store.snapshot();
  snapshot.lists.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  state.lists = snapshot.lists;
  const preferences = new Map(snapshot.preferences.map(preference => [preference.key, preference.value]));
  if (initial || !state.lists.some(list => list.id === state.activeId)) {
    state.query = "";
    const selected = preferences.get("activeListId");
    state.activeId = typeof selected === "string" && state.lists.some(list => list.id === selected) ? selected : state.lists[0]?.id || null;
  }
  state.large = preferences.get("large") === true;
  selectedShare = snapshot.shares.find(share => share.id===state.activeId) || null;
  waitingForOwner = !!selectedShare && !snapshot.syncStates.find(record=>record.id===state.activeId)?.doc;
  reconcileSync();
  if (selectedShare && snapshot.syncStates.find(record=>record.id===state.activeId)?.dirty && remoteStatus==='Geteilt · synchronisiert') remoteStatus='Geteilt · Änderungen warten';
  render();
}

/** @param {(store: LocalStore) => Promise<void>} operation @returns {Promise<boolean>} */
function persist(operation) {
  if (!state.ready || !state.store) return Promise.resolve(false);
  const store = state.store;
  state.pending += 1;
  renderStatus();
  const task = writeQueue.then(async () => {
    try {
      await operation(store);
      state.failed = false;
      await refresh();
      channel?.postMessage({ changed: true });
      scheduleSync(300);
      return true;
    } catch (error) {
      console.error("Lokaler Speicher:", error);
      state.failed = true;
      toast("Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.");
      try { await refresh(); } catch { showFatal("Der lokale Speicher ist nicht verfügbar. Bitte prüfe die Browser-Einstellungen und lade die Seite neu."); }
      return false;
    } finally {
      state.pending -= 1;
      renderStatus();
    }
  });
  writeQueue = task.then(() => undefined);
  return task;
}

/** @param {string} name @returns {SVGSVGElement} */
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("icon"); svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`); svg.append(use); return svg;
}

/** @param {ListItem} item @returns {HTMLLIElement} */
function renderItem(item) {
  const row = document.createElement("li");
  row.className = `list-row ${item.kind}-row${item.kind === "item" && item.checked ? " done" : ""}`;
  row.dataset.itemId = item.id;
  if (item.kind === "item") {
    const label = document.createElement("label"); label.className = "check-wrap";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = item.checked;
    checkbox.dataset.action = "check";
    checkbox.disabled = !state.ready;
    checkbox.setAttribute("aria-label", `${item.text}: ${item.checked ? "als offen markieren" : "abhaken"}`);
    label.append(checkbox); row.append(label);
  }
  const edit = document.createElement("button"); edit.type = "button"; edit.dataset.action = "edit-item";
  edit.disabled = !state.ready;
  if (item.kind === "divider") {
    edit.className = "divider-content"; edit.setAttribute("aria-label", "Trennlinie bearbeiten"); edit.append(document.createElement("hr")); row.append(edit);
  } else {
    edit.className = "item-text"; edit.textContent = item.text; edit.setAttribute("aria-label", `${item.kind === "heading" ? "Überschrift" : "Eintrag"} bearbeiten: ${item.text}`);
    const content = document.createElement(item.kind === "heading" ? "h3" : "div"); content.classList.add("item-content"); content.append(edit); row.append(content);
  }
  const handle = document.createElement("button"); handle.type = "button"; handle.className = "drag-handle"; handle.dataset.action = "move-item";
  // Reordering requires the full list, otherwise hidden rows could move too.
  handle.disabled = !state.ready || !!state.query.trim();
  handle.setAttribute("aria-label", `${item.kind === "divider" ? "Trennlinie" : item.text} verschieben`);
  handle.setAttribute("aria-describedby", "drag-help"); handle.title = "Ziehen oder mit Pfeiltasten verschieben"; handle.append(icon("grip")); row.append(handle);
  return row;
}

function render() {
  const focused = document.activeElement;
  const focusedRow = focused instanceof HTMLElement ? focused.closest("[data-item-id]") : null;
  const focusId = focusedRow instanceof HTMLElement ? focusedRow.dataset.itemId : null;
  const focusAction = focused instanceof HTMLElement ? focused.dataset.action : null;
  const list = activeList();
  const items = visibleItems(list);
  const searching = !!state.query.trim();
  ui.shell.dataset.scale = state.large ? "large" : "normal";
  ui.shell.classList.toggle("is-searching", searching);
  ui.shell.setAttribute("aria-busy", String(!state.ready));
  ui.select.replaceChildren();
  if (!state.lists.length) {
    const option = new Option(state.ready ? "Keine Liste" : state.failed ? "Speicher nicht verfügbar" : "Wird geladen …", ""); ui.select.add(option);
  } else {
    for (const entry of state.lists) ui.select.add(new Option(entry.name, entry.id));
    ui.select.value = state.activeId || "";
  }
  /** @param {HTMLElement} control @param {boolean} disabled */
  const disable = (control, disabled) => { if ("disabled" in control) control.disabled = disabled; };
  disable(ui.select, !state.ready || !list);
  disable(ui.newList, !state.ready);
  disable(ui.menuToggle, !state.ready);
  for (const button of ui.menu.querySelectorAll('button[data-action]')) {
    if (!(button instanceof HTMLButtonElement)) continue;
    const action=button.dataset.action;
    button.disabled=!state.ready || (!list && action!=='import-owner' && action!=='claim-list');
    if (['export-owner','end-share','delete-all'].includes(action || '')) button.hidden=!selectedShare?.ownerToken;
    if (action==='claim-list') button.hidden=!pendingClaim;
    if (action==='share-list') button.textContent=selectedShare ? 'Freigabe ansehen' : 'Liste teilen';
    if (action==='delete-list') button.hidden=!!selectedShare?.ownerToken;
    if (action==='rename-list' && waitingForOwner) button.disabled=true;
  }
  disable(ui.search, !state.ready || !list);
  if (ui.search.value !== state.query) ui.search.value = state.query;
  ui.searchClear.hidden = !state.query;
  ui.searchCount.hidden = !searching;
  ui.searchCount.textContent = searching ? `${items.length} Treffer` : "";
  const checks = items.filter(item => item.kind === "item");
  const checked = checks.filter(item => item.checked).length;
  const allChecked = checks.length > 0 && checked === checks.length;
  ui.allLabel.textContent = `${searching ? "Treffer" : "Alle"} ${allChecked ? "öffnen" : "abhaken"}`;
  const scope = searching ? "Gefundene Checkboxen" : "Alle Checkboxen";
  ui.all.setAttribute("aria-label", `${scope} ${allChecked ? "als offen markieren" : "abhaken"}`);
  ui.all.title = ui.all.getAttribute("aria-label") || "";
  ui.count.textContent = `${checked} / ${checks.length}`;
  disable(ui.all, !state.ready || !checks.length || waitingForOwner);
  ui.progress.style.width = `${checks.length ? checked / checks.length * 100 : 0}%`;
  ui.normal.setAttribute("aria-pressed", String(!state.large));
  ui.large.setAttribute("aria-pressed", String(state.large));
  for (const control of [ui.normal, ui.large]) disable(control, !state.ready);
  for (const control of [ui.item, ui.heading, ui.divider, ui.input, ui.add]) disable(control, !state.ready || !list || waitingForOwner);
  ui.list.replaceChildren(...items.map(renderItem));
  ui.empty.hidden = !state.ready || !!items.length;
  ui.emptyText.textContent = waitingForOwner ? "Warte auf Besitzer – lokale Übernahme gespeichert" : list ? searching ? `Keine Treffer für „${state.query.trim()}“` : "Noch keine Einträge" : "Noch keine Liste";
  ui.emptyCreate.hidden = !!list;
  ui.error.hidden = state.ready;
  renderStatus();
  if (focusId && focusAction) {
    const control = ui.list.querySelector(`[data-item-id="${focusId}"] [data-action="${focusAction}"]`);
    if (control instanceof HTMLElement) control.focus({ preventScroll: true });
  }
}

/** @param {'item' | 'heading'} kind */
function setKind(kind) {
  state.kind = kind;
  ui.item.setAttribute("aria-pressed", String(kind === "item"));
  ui.heading.setAttribute("aria-pressed", String(kind === "heading"));
  ui.input.placeholder = kind === "item" ? "Eintrag hinzufügen" : "Überschrift hinzufügen";
  ui.input.setAttribute("aria-label", kind === "item" ? "Neuer Eintrag" : "Neue Überschrift");
  ui.add.setAttribute("aria-label", kind === "item" ? "Eintrag hinzufügen" : "Überschrift hinzufügen");
  ui.input.focus();
}

/** @param {boolean} collapsed */
function setComposerCollapsed(collapsed) {
  state.composerCollapsed = collapsed;
  ui.composerPanel.classList.toggle("is-collapsed", collapsed);
  ui.composerGrip.setAttribute("aria-expanded", String(!collapsed));
  ui.composerGrip.setAttribute("aria-label", collapsed ? "Eingabeleiste ausklappen" : "Eingabeleiste einklappen");
  ui.composerGrip.title = collapsed ? "Zum Öffnen nach oben ziehen" : "Zum Einklappen nach unten ziehen";
  ui.composerContent.inert = collapsed;
}
setComposerCollapsed(state.composerCollapsed);

/** @param {PointerEvent} event */
function startComposerDrag(event) {
  if (event.button !== 0 || !event.isPrimary || composerDrag) return;
  composerDrag = { pointerId: event.pointerId, startY: event.clientY, y: event.clientY, moved: false };
  ui.composerGrip.setPointerCapture(event.pointerId);
}

/** @param {PointerEvent} event */
function moveComposerDrag(event) {
  const drag = composerDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.y = event.clientY;
  const delta = drag.y - drag.startY;
  if (Math.abs(delta) >= 8) {
    drag.moved = true;
    ui.composerPanel.classList.add("is-dragging");
    const offset = state.composerCollapsed ? Math.min(0, delta) : Math.max(0, delta);
    ui.composerPanel.style.setProperty("--composer-drag-offset", `${offset}px`);
  }
}

/** @param {PointerEvent} event */
function finishComposerDrag(event) {
  const drag = composerDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  composerDrag = null;
  if (ui.composerGrip.hasPointerCapture(event.pointerId)) ui.composerGrip.releasePointerCapture(event.pointerId);
  const delta = drag.y - drag.startY;
  if (drag.moved) {
    ignoreComposerClick = true;
    if (Math.abs(delta) >= 36) setComposerCollapsed(delta > 0);
    ui.composerPanel.classList.remove("is-dragging");
    ui.composerPanel.style.removeProperty("--composer-drag-offset");
  }
}

/** @param {PointerEvent} event */
function cancelComposerDrag(event) {
  if (event.pointerId !== composerDrag?.pointerId) return;
  composerDrag = null;
  ui.composerPanel.classList.remove("is-dragging");
  ui.composerPanel.style.removeProperty("--composer-drag-offset");
}

/** @param {ItemKind} kind @param {string} [text] @returns {Promise<boolean>} */
async function addItem(kind, text = "") {
  const listId = state.activeId;
  if (!listId || (kind !== "divider" && !text.trim())) return false;
  const now = new Date().toISOString();
  /** @type {ListItem} */ const item = { id: uuid(), kind, text: text.trim(), checked: false, createdAt: now, updatedAt: now };
  const saved = await persist(store => store.update(listId, list => { list.items.push(item); }));
  if (saved && state.activeId === listId) {
    ui.viewport.scrollTop = ui.viewport.scrollHeight;
    announce(kind === "divider" ? "Trennlinie hinzugefügt" : `${item.text} hinzugefügt`);
  }
  return saved;
}

/** @param {boolean} open @param {boolean} [restoreFocus] */
function toggleMenu(open, restoreFocus = false) {
  ui.menu.hidden = !open; ui.menuToggle.setAttribute("aria-expanded", String(open));
  if (open) ui.menu.querySelector(/** @type {"button"} */("button:not([hidden]):not(:disabled)"))?.focus();
  else if (restoreFocus) ui.menuToggle.focus();
}

/** @param {string} label @param {string} id @param {string} value @param {number} maxLength @returns {HTMLInputElement} */
function textField(label, id, value, maxLength) {
  const wrap = document.createElement("label"); wrap.className = "field";
  const title = document.createElement("span"); title.textContent = label;
  const input = document.createElement("input"); input.id = id; input.name = id; input.value = value; input.maxLength = maxLength; input.required = true; input.type = "text"; input.enterKeyHint = "done";
  wrap.append(title, input); ui.fields.append(wrap); return input;
}

/** @param {EditorContext} context */
function openEditor(context) {
  if (editorSaving) return;
  const list = state.lists.find(entry => entry.id === context.listId);
  const item = list?.items.find(entry => entry.id === context.itemId);
  if (context.mode !== "new-list" && !list) return;
  if ((context.mode === "edit-item" || context.mode === "delete-item") && !item) return;
  if (!ui.dialog.open) dialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  toggleMenu(false);
  state.editor = context; ui.fields.replaceChildren(); ui.dialogError.hidden = true; ui.save.disabled = false;
  ui.save.classList.remove("danger"); ui.save.textContent = "Speichern"; ui.remove.hidden = true;
  /** @type {HTMLInputElement | null} */ let input = null;
  if (context.mode === "new-list" || context.mode === "rename-list") {
    ui.dialogTitle.textContent = context.mode === "new-list" ? "Neue Liste" : "Liste umbenennen";
    input = textField("Listenname", "edit-name", context.mode === "new-list" ? "" : list?.name || "", 100);
    input.placeholder = "Zum Beispiel Wocheneinkauf";
    if (context.mode === "new-list") ui.save.textContent = "Anlegen";
  } else if (context.mode === "delete-list" || context.mode === "delete-item") {
    ui.dialogTitle.textContent = context.mode === "delete-list" ? "Liste löschen?" : "Element löschen?";
    const copy = document.createElement("p"); copy.className = "dialog-copy";
    const name = document.createElement("strong"); name.textContent = context.mode === "delete-list" ? list?.name || "" : item?.kind === "divider" ? "Trennlinie" : item?.text || "";
    copy.append(name, document.createTextNode(context.mode === "delete-list" ? " und alle enthaltenen Elemente werden aus diesem Browser gelöscht." : " wird aus dieser Liste gelöscht.")); ui.fields.append(copy);
    ui.save.textContent = "Löschen"; ui.save.classList.add("danger");
  } else if (item && list) {
    ui.dialogTitle.textContent = "Element bearbeiten";
    const wrap = document.createElement("label"); wrap.className = "field";
    const label = document.createElement("span"); label.textContent = "Elementtyp";
    const select = document.createElement("select"); select.id = "edit-kind"; select.name = "edit-kind";
    for (const [value, title] of [["item", "Checkbox-Eintrag"], ["heading", "Überschrift"], ["divider", "Trennlinie"]]) select.add(new Option(title, value));
    select.value = item.kind; wrap.append(label, select); ui.fields.append(wrap);
    input = textField("Text", "edit-text", item.text, 500);
    const inputWrap = input.parentElement;
    input.required = item.kind !== "divider";
    if (inputWrap) inputWrap.hidden = item.kind === "divider";
    select.addEventListener("change", () => {
      if (inputWrap) inputWrap.hidden = select.value === "divider";
      if (input) { input.required = select.value !== "divider"; if (input.required) input.focus(); }
    });
    const move = document.createElement("div"); move.className = "move-controls";
    for (const [delta, title, symbol] of [[-1, "Nach oben", "up"], [1, "Nach unten", "down"]]) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.move = String(delta); button.append(icon(String(symbol)), document.createTextNode(String(title)));
      button.addEventListener("click", () => { void moveItem(list.id, item.id, Number(delta)); }); move.append(button);
    }
    ui.fields.append(move); updateMoveControls(); ui.remove.hidden = false;
  }
  if (!ui.dialog.open) ui.dialog.showModal();
  requestAnimationFrame(() => {
    if (input && input.required) { input.focus(); input.select(); }
    else if (context.mode.startsWith("delete")) ui.cancel.focus();
  });
}

function updateMoveControls() {
  const context = state.editor;
  const list = state.lists.find(entry => entry.id === context?.listId);
  const index = list?.items.findIndex(item => item.id === context?.itemId) ?? -1;
  for (const button of ui.fields.querySelectorAll("button[data-move]")) {
    if (button instanceof HTMLButtonElement) button.disabled = !!state.query.trim() || index < 0 || (button.dataset.move === "-1" ? index === 0 : index === (list?.items.length || 0) - 1);
  }
}

function closeEditor() {
  if (editorSaving) return;
  ui.dialog.close(); state.editor = null;
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus(); else ui.input.focus();
}

/** @returns {Promise<void>} */
async function submitEditor() {
  const context = state.editor;
  if (!context || ui.save.disabled) return;
  const data = new FormData(ui.form);
  const name = String(data.get("edit-name") || "").trim();
  const text = String(data.get("edit-text") || "").trim();
  const rawKind = data.get("edit-kind");
  const kind = /** @type {ItemKind} */ (["item", "heading", "divider"].includes(String(rawKind)) ? rawKind : "item");
  if (((context.mode === "new-list" || context.mode === "rename-list") && !name) || (context.mode === "edit-item" && kind !== "divider" && !text)) {
    ui.dialogError.textContent = "Bitte einen Text eingeben."; ui.dialogError.hidden = false; return;
  }
  ui.save.disabled = true;
  editorSaving = true;
  let success = false;
  if (context.mode === "new-list") {
    const list = makeList(name);
    success = await persist(async store => { await store.create(list); state.activeId = list.id; state.query = ""; });
  } else if (context.mode === "delete-list" && context.listId) {
    success = await persist(store => store.remove(/** @type {string} */ (context.listId)));
  } else if (context.listId) {
    success = await persist(store => store.update(/** @type {string} */ (context.listId), list => {
      if (context.mode === "rename-list") list.name = name;
      else if (context.mode === "delete-item") list.items = list.items.filter(item => item.id !== context.itemId);
      else {
        const item = list.items.find(entry => entry.id === context.itemId);
        if (item) { item.kind = kind; item.text = kind === "divider" ? "" : text; if (kind !== "item") item.checked = false; item.updatedAt = new Date().toISOString(); }
      }
    }));
  }
  ui.save.disabled = false;
  editorSaving = false;
  if (success) { closeEditor(); if (context.mode.startsWith("delete")) toast(context.mode === "delete-list" ? "Liste gelöscht" : "Element gelöscht"); }
  else { ui.dialogError.textContent = "Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten."; ui.dialogError.hidden = false; }
}

/** @param {string} listId @param {string} itemId @param {number} delta @returns {Promise<void>} */
async function moveItem(listId, itemId, delta) {
  const success = await persist(store => store.update(listId, list => {
    const index = list.items.findIndex(item => item.id === itemId);
    const destination = index + delta;
    if (index < 0 || destination < 0 || destination >= list.items.length) return;
    const [item] = list.items.splice(index, 1); list.items.splice(destination, 0, item);
  }));
  if (success) {
    updateMoveControls();
    const list = state.lists.find(entry => entry.id === listId);
    const position = list?.items.findIndex(item => item.id === itemId) ?? -1;
    announce(`Element an Position ${position + 1} verschoben`);
    if (!ui.dialog.open) {
      const handle = ui.list.querySelector(`[data-item-id="${itemId}"] .drag-handle`);
      if (handle instanceof HTMLElement) { handle.focus(); handle.scrollIntoView({ block: "nearest" }); }
    }
  }
}

/** @param {PointerEvent} event */
function startDrag(event) {
  const target = event.target instanceof Element ? event.target.closest(".drag-handle") : null;
  if (!(target instanceof HTMLButtonElement) || target.disabled || event.button !== 0 || !event.isPrimary || state.pending || state.drag || !state.ready || !state.activeId) return;
  const row = target.closest("li");
  if (!(row instanceof HTMLLIElement) || !row.dataset.itemId) return;
  // Keep capture on the stable container: moving the captured row itself can
  // release pointer capture in Safari and Chromium while reordering the DOM.
  event.preventDefault(); ui.list.setPointerCapture(event.pointerId);
  state.drag = { pointerId: event.pointerId, handle: target, row, listId: state.activeId, itemId: row.dataset.itemId, startY: event.clientY, y: event.clientY, offsetY: event.clientY - row.getBoundingClientRect().top, started: false, preview: null, frame: 0, originalIds: Array.from(ui.list.children, child => /** @type {HTMLElement} */ (child).dataset.itemId || "") };
}

function dragFrame() {
  const drag = state.drag;
  if (!drag?.started) return;
  const viewport = ui.viewport.getBoundingClientRect();
  const edge = 52;
  if (drag.y < viewport.top + edge) ui.viewport.scrollTop -= Math.min(14, (viewport.top + edge - drag.y) / 4);
  else if (drag.y > viewport.bottom - edge) ui.viewport.scrollTop += Math.min(14, (drag.y - viewport.bottom + edge) / 4);
  if (drag.preview) drag.preview.style.top = `${drag.y - drag.offsetY}px`;
  const rows = Array.from(ui.list.children).filter(row => row !== drag.row);
  const before = rows.find(row => { const rect = row.getBoundingClientRect(); return drag.y < rect.top + rect.height / 2; });
  if (before) { if (drag.row.nextElementSibling !== before) ui.list.insertBefore(drag.row, before); }
  else if (ui.list.lastElementChild !== drag.row) ui.list.append(drag.row);
  drag.frame = requestAnimationFrame(dragFrame);
}

/** @param {PointerEvent} event */
function updateDrag(event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault(); drag.y = event.clientY;
  if (!drag.started && Math.abs(drag.y - drag.startY) >= 6) {
    drag.started = true;
    const rect = drag.row.getBoundingClientRect();
    const preview = /** @type {HTMLLIElement} */ (drag.row.cloneNode(true));
    preview.classList.add("drag-preview"); preview.setAttribute("aria-hidden", "true"); preview.inert = true;
    preview.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;min-height:${rect.height}px;--scale:${state.large ? 1.5 : 1}`;
    document.body.append(preview); drag.preview = preview;
    drag.row.classList.add("is-dragging"); document.body.classList.add("dragging");
    drag.frame = requestAnimationFrame(dragFrame); announce("Element wird verschoben");
  }
}

/** @param {boolean} cancel */
async function finishDrag(cancel) {
  const drag = state.drag;
  if (!drag) return;
  const ids = Array.from(ui.list.children, row => /** @type {HTMLElement} */ (row).dataset.itemId || "");
  cancelAnimationFrame(drag.frame); drag.preview?.remove(); drag.row.classList.remove("is-dragging"); document.body.classList.remove("dragging");
  state.drag = null; ignoreClickUntil = Date.now() + 350;
  if (ui.list.hasPointerCapture(drag.pointerId)) ui.list.releasePointerCapture(drag.pointerId);
  if (cancel) { render(); announce("Verschieben abgebrochen"); }
  else if (!drag.started) openEditor({ mode: "edit-item", listId: drag.listId, itemId: drag.itemId });
  else if (ids.join() !== drag.originalIds.join()) {
    const rank = new Map(ids.map((id, index) => [id, index]));
    const success = await persist(store => store.update(drag.listId, list => { list.items.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)); }));
    if (success) announce("Reihenfolge gespeichert");
  }
  if (state.refreshPending) { state.refreshPending = false; try { await refresh(); } catch { toast("Lokaler Speicher konnte nicht neu geladen werden."); } }
}

ui.newList.addEventListener("click", () => openEditor({ mode: "new-list", listId: null }));
ui.emptyCreate.addEventListener("click", () => openEditor({ mode: "new-list", listId: null }));
ui.select.addEventListener("change", () => {
  stopSync(); selectedShare=null; waitingForOwner=false; remoteStatus="";
  state.activeId = ui.select.value; state.query = ""; ui.input.value = ""; toggleMenu(false); render(); ui.viewport.scrollTop = 0;
  void persist(store => store.preference("activeListId", state.activeId));
});
ui.search.addEventListener("input", () => {
  if (state.drag) void finishDrag(true);
  state.query = ui.search.value; render(); ui.viewport.scrollTop = 0;
});
ui.searchClear.addEventListener("click", () => { clearSearch(); ui.search.focus(); });
ui.searchForm.addEventListener("submit", event => { event.preventDefault(); ui.search.blur(); });
ui.menuToggle.addEventListener("click", () => toggleMenu(ui.menu.hidden));
ui.menu.addEventListener("click", event => {
  const button=event.target instanceof Element ? event.target.closest('button[data-action]') : null;
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  const action=button.dataset.action;
  if (action==='rename-list' || action==='delete-list') openEditor({mode:action,listId:state.activeId});
  else if (action==='share-list' && state.activeId) void showSharing(state.activeId);
  else if (action==='claim-list') showClaim();
  else if (action==='end-share' || action==='delete-all') void confirmEndSharing(action==='delete-all');
  else if (action==='export-owner') void showBackupExport();
  else if (action==='import-owner') showBackupImport();
});
document.addEventListener("click", event => { if (event.target instanceof Node && !ui.menu.parentElement?.contains(event.target)) toggleMenu(false); });
ui.menu.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault(); const buttons = Array.from(ui.menu.querySelectorAll(/** @type {"button"} */("button:not([hidden]):not(:disabled)")));
    const current = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
});
ui.all.addEventListener("click", () => {
  const list = activeList(); if (!list) return;
  const checks = visibleItems(list).filter(item => item.kind === "item");
  const ids = new Set(checks.map(item => item.id));
  const checked = !checks.every(item => item.checked);
  void persist(store => store.update(list.id, current => { for (const item of current.items) if (item.kind === "item" && ids.has(item.id)) { item.checked = checked; item.updatedAt = new Date().toISOString(); } }));
});
for (const [button, large] of [[ui.normal, false], [ui.large, true]]) {
  if (button instanceof HTMLElement) button.addEventListener("click", () => { void persist(store => store.preference("large", large)); });
}
ui.item.addEventListener("click", () => setKind("item"));
ui.heading.addEventListener("click", () => setKind("heading"));
ui.divider.addEventListener("click", () => { void addItem("divider"); });
ui.composer.addEventListener("submit", event => {
  event.preventDefault(); const text = ui.input.value;
  if (!text.trim()) { ui.input.focus(); return; }
  // Clear immediately so repeated Enter presses cannot enqueue the same draft.
  ui.input.value = "";
  void addItem(state.kind, text).then(saved => { if (!saved && !ui.input.value) ui.input.value = text; });
  ui.input.focus();
});
ui.composerGrip.addEventListener("pointerdown", startComposerDrag);
ui.composerGrip.addEventListener("pointermove", moveComposerDrag);
ui.composerGrip.addEventListener("pointerup", finishComposerDrag);
ui.composerGrip.addEventListener("pointercancel", cancelComposerDrag);
ui.composerGrip.addEventListener("lostpointercapture", cancelComposerDrag);
ui.composerGrip.addEventListener("click", event => {
  if (ignoreComposerClick) { ignoreComposerClick = false; event.preventDefault(); return; }
  setComposerCollapsed(!state.composerCollapsed);
});
ui.list.addEventListener("change", event => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;
  const row = checkbox.closest("li"); const itemId = row?.dataset.itemId; const listId = state.activeId;
  if (!itemId || !listId) return;
  const checked = checkbox.checked;
  void persist(store => store.update(listId, list => { const item = list.items.find(entry => entry.id === itemId); if (item?.kind === "item") { item.checked = checked; item.updatedAt = new Date().toISOString(); } }));
});
ui.list.addEventListener("click", event => {
  if (Date.now() < ignoreClickUntil) return;
  const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
  if (!(button instanceof HTMLButtonElement)) return;
  const itemId = button.closest("li")?.dataset.itemId;
  if (itemId) openEditor({ mode: "edit-item", listId: state.activeId, itemId });
});
ui.list.addEventListener("keydown", event => {
  const handle = event.target;
  if (!(handle instanceof HTMLButtonElement) || handle.disabled || !handle.classList.contains("drag-handle") || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault(); const id = handle.closest("li")?.dataset.itemId;
  if (id && state.activeId) void moveItem(state.activeId, id, event.key === "ArrowUp" ? -1 : 1);
});
ui.list.addEventListener("pointerdown", startDrag);
ui.list.addEventListener("pointermove", updateDrag);
ui.list.addEventListener("pointerup", event => { if (event.pointerId === state.drag?.pointerId) void finishDrag(false); });
ui.list.addEventListener("pointercancel", event => { if (event.pointerId === state.drag?.pointerId) void finishDrag(true); });
ui.list.addEventListener("lostpointercapture", event => { if (event.pointerId === state.drag?.pointerId) void finishDrag(true); });
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (state.drag) { event.preventDefault(); void finishDrag(true); }
  else if (!ui.menu.hidden) { event.preventDefault(); toggleMenu(false, true); }
  else if (document.activeElement === ui.search && state.query) { event.preventDefault(); clearSearch(); }
});
ui.form.addEventListener("submit", event => { event.preventDefault(); void submitEditor(); });
ui.cancel.addEventListener("click", closeEditor); ui.close.addEventListener("click", closeEditor);
ui.dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
ui.remove.addEventListener("click", () => { const context = state.editor; if (context) openEditor({ mode: "delete-item", listId: context.listId, itemId: context.itemId }); });
ui.retry.addEventListener("click", () => { location.reload(); });

async function refreshOtherTab() {
  if (!state.ready || state.pending) return;
  try { await refresh(); updateMoveControls(); } catch { toast("Lokaler Speicher konnte nicht neu geladen werden."); }
}
channel?.addEventListener("message", event => { void refreshOtherTab().then(()=>{ if (event.data?.changed) scheduleSync(0); }); });
window.addEventListener("focus", () => { void refreshOtherTab(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshOtherTab(); });

const mobileLandscape = window.matchMedia("(orientation: landscape) and (max-width: 1024px), (orientation: landscape) and (pointer: coarse)");
function updateOrientation() {
  ui.landscape.hidden = !mobileLandscape.matches;
  ui.shell.inert = mobileLandscape.matches;
  if (mobileLandscape.matches) { if (state.drag) void finishDrag(true); if (ui.dialog.open) closeEditor(); toggleMenu(false); }
}
mobileLandscape.addEventListener("change", updateOrientation); updateOrientation();

// The visual viewport follows the on-screen keyboard on iOS and Android.
// Native pinch zoom remains available and keeps the browser's own layout.
function updateViewport() {
  const viewport = window.visualViewport;
  if (viewport && viewport.scale === 1) {
    document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
    document.documentElement.style.setProperty("--viewport-top", `${viewport.offsetTop}px`);
  } else {
    document.documentElement.style.removeProperty("--app-height");
    document.documentElement.style.removeProperty("--viewport-top");
  }
}
window.visualViewport?.addEventListener("resize", updateViewport);
window.visualViewport?.addEventListener("scroll", updateViewport);
window.addEventListener("resize", updateViewport);
updateViewport();

async function initialize() {
  try {
    state.store = await LocalStore.open();
    await state.store.initialize();
    state.ready = true;
    await refresh(true);
    await restoreInvitation();
  } catch (error) {
    console.error("IndexedDB:", error);
    showFatal("Lokaler Speicher nicht verfügbar. Bitte erlaube Websitedaten in den Browser-Einstellungen und lade die Seite neu.");
  }
}
void initialize();
