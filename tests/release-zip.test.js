import test from "node:test";
import assert from "node:assert/strict";
import { createZip, readZip } from "../scripts/zip.mjs";

test("release ZIP is deterministic and round-trips nested, empty, and UTF-8 files", () => {
  const entries = [
    ["module.json", Buffer.from('{"version":"1.3.0"}\n')],
    ["scripts/config.js", Buffer.from("export const version = '1.3.0';\n")],
    ["assets/empty.txt", Buffer.alloc(0)],
    ["lang/\u0440\u0443.txt", Buffer.from("\u041f\u0440\u0435\u043c\u0438\u0443\u043c")]
  ];
  const archive = createZip(entries);
  assert.deepEqual(createZip(entries), archive);
  assert.deepEqual([...readZip(archive)], entries);
});
test("release ZIP refuses duplicate or traversing entry names", () => {
  for (const name of ["../private", "/absolute", "C:/private", "dir\\file", "dir//file", "./module.json"]) {
    assert.throws(() => createZip([[name, Buffer.from("test")]]), /Unsafe ZIP entry/);
  }
  assert.throws(() => createZip([["same", Buffer.alloc(0)], ["same", Buffer.alloc(0)]]), /Duplicate ZIP entry/);
});
test("release ZIP verification rejects changed CRC and inconsistent local metadata", () => {
  const original = createZip([["module.json", Buffer.from("test")]]);
  const crc = Buffer.from(original), directory = crc.readUInt32LE(crc.length - 6);
  crc.writeUInt32LE(0, directory + 16);
  assert.throws(() => readZip(crc), /ZIP CRC32/);
  const size = Buffer.from(original);
  size.writeUInt32LE(123, 22);
  assert.throws(() => readZip(size));
});
test("release ZIP verification rejects trailing data and truncation", () => {
  const archive = createZip([["module.json", Buffer.from("test")]]);
  assert.throws(() => readZip(Buffer.concat([archive, Buffer.from("junk")])));
  assert.throws(() => readZip(archive.subarray(0, archive.length - 1)));
});
