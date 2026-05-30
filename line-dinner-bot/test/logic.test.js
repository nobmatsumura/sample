import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBulk, sample } from "../src/index.js";

test("sample は要求件数を重複なしで返す", () => {
  const pool = ["a", "b", "c", "d", "e"];
  const picks = sample(pool, 3);
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks).size, 3); // 重複なし
  for (const p of picks) assert.ok(pool.includes(p));
});

test("sample はプール件数を超えない", () => {
  const picks = sample(["a", "b"], 3);
  assert.equal(picks.length, 2);
});

test("parseBulk はカンマ・読点・改行で分割し重複を除く", () => {
  assert.deepEqual(parseBulk("カレー, 鍋、餃子\n餃子"), ["カレー", "鍋", "餃子"]);
});

test("parseBulk は箇条書き記号を取り除く", () => {
  assert.deepEqual(parseBulk("・カレー\n- 鍋\n* 餃子"), ["カレー", "鍋", "餃子"]);
});

test("parseBulk は空入力で空配列", () => {
  assert.deepEqual(parseBulk("   "), []);
});
