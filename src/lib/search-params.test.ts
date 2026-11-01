import { describe, expect, it } from "vitest";
import { parseSearch, stringifySearch } from "./search-params";

describe("parseSearch", () => {
  it("keeps ids that look like numbers as text", () => {
    expect(parseSearch("?date=2026-11-09&event=0&account=d")).toEqual({
      date: "2026-11-09",
      event: "0",
      account: "d",
    });
    expect(parseSearch("?email=123&task=1e3&id=-5")).toEqual({
      email: "123",
      task: "1e3",
      id: "-5",
    });
  });

  it("reads flags", () => {
    expect(parseSearch("?unread=true&edit=false")).toEqual({ unread: true, edit: false });
  });

  it("reads quoted values as text, as the router's default wrote them", () => {
    expect(parseSearch("?event=%220%22&q=%22true%22")).toEqual({ event: "0", q: "true" });
  });

  it("keeps a value that only starts with a quote", () => {
    expect(parseSearch('?q="angebot keller')).toEqual({ q: '"angebot keller' });
  });

  it("reads an empty search", () => {
    expect(parseSearch("")).toEqual({});
    expect(parseSearch("?")).toEqual({});
  });
});

describe("stringifySearch", () => {
  it("writes ids plainly and leaves out what is not set", () => {
    expect(stringifySearch({ event: "0", account: "d", date: undefined })).toBe(
      "?event=0&account=d",
    );
  });

  it("writes flags", () => {
    expect(stringifySearch({ unread: true })).toBe("?unread=true");
  });

  it("quotes text that would read back as something else", () => {
    expect(stringifySearch({ q: "true" })).toBe("?q=%22true%22");
    expect(stringifySearch({ q: '"angebot"' })).toBe("?q=%22%5C%22angebot%5C%22%22");
  });

  it("writes nothing for an empty search", () => {
    expect(stringifySearch({})).toBe("");
  });

  it("reads back what it wrote", () => {
    const search = { q: '"angebot" true', event: "007", unread: true, subject: "false" };
    expect(parseSearch(stringifySearch(search))).toEqual(search);
  });
});
