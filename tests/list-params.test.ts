import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, pageOf, readList, sortRows } from "@/lib/list-params";

const fallback = { sort: "date", dir: "desc" as const };

describe("list paging and sorting from the URL", () => {
  it("falls back to page one of the default size and sort", () => {
    expect(readList({}, ["date", "total"], fallback)).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE, offset: 0, sort: "date", dir: "desc", q: "" });
  });

  it("reads a page, a size and a sort", () => {
    expect(readList({ page: "3", size: "25", sort: "total", dir: "asc" }, ["date", "total"], fallback)).toEqual({ page: 3, size: 25, offset: 50, sort: "total", dir: "asc", q: "" });
  });

  it("ignores what it does not offer: odd sizes, unknown columns, bad pages", () => {
    const l = readList({ page: "-2", size: "7", sort: "password", dir: "sideways" }, ["date"], fallback);
    expect(l).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE, offset: 0, sort: "date", dir: "desc", q: "" });
    expect(readList({ page: "1.5" }, ["date"], fallback).page).toBe(1);
    expect(readList({ sort: "date", dir: "x" }, ["date"], { sort: "date", dir: "asc" }).dir).toBe("asc");
  });

  it("slices a page", () => {
    expect(pageOf([1, 2, 3, 4, 5], { offset: 2, size: 2 })).toEqual([3, 4]);
    expect(pageOf([1, 2], { offset: 50, size: 25 })).toEqual([]);
  });

  it("sorts numbers and words both ways, with empty values always last", () => {
    const rows = [{ n: 2, s: "b" }, { n: 10, s: "a" }, { n: null, s: "" }];
    const get = { n: (r: (typeof rows)[number]) => r.n, s: (r: (typeof rows)[number]) => r.s };
    expect(sortRows(rows, get, { sort: "n", dir: "desc" }).map((r) => r.n)).toEqual([10, 2, null]);
    expect(sortRows(rows, get, { sort: "n", dir: "asc" }).map((r) => r.n)).toEqual([2, 10, null]);
    expect(sortRows(rows, get, { sort: "s", dir: "asc" }).map((r) => r.s)).toEqual(["a", "b", ""]);
    expect(sortRows(rows, get, { sort: "unknown", dir: "asc" })).toEqual(rows);
  });
});

describe("list search", () => {
  it("keeps what was typed, trimmed and capped, and finds it in rows in any case", async () => {
    const { matching, likeOf } = await import("@/lib/list-params");
    expect(readList({ q: "  zbl-2026  " }, ["date"], { sort: "date", dir: "desc" }).q).toBe("zbl-2026");
    expect(readList({ q: "x".repeat(300) }, ["date"], { sort: "date", dir: "desc" }).q).toHaveLength(100);
    const rows = [{ n: "ZBL-2026-0001", who: "Asif Computers" }, { n: "ZBL-2026-0002", who: "Oracle" }];
    expect(matching(rows, "asif", (r) => [r.n, r.who]).map((r) => r.n)).toEqual(["ZBL-2026-0001"]);
    expect(matching(rows, "", (r) => [r.n])).toHaveLength(2);
    // a person typing % or _ means the character, not a wildcard
    expect(likeOf("50%_off")).toBe(String.raw`%50\%\_off%`);
  });
});
