import { describe, it, expect } from "vitest";
import {
  generateAttributes,
  getEmptyRssResult,
  serializeRss,
  convertItemsToRss,
  generateFakeNzb,
  getCapabilitiesXml,
} from "./newznab";
import type { NewznabItem } from "@/types";

describe("generateAttributes", () => {
  it("should generate category attributes", () => {
    const attrs = generateAttributes(null, ["5000", "5040"]);

    expect(attrs).toHaveLength(2);
    expect(attrs[0]).toEqual({ name: "category", value: "5000" });
    expect(attrs[1]).toEqual({ name: "category", value: "5040" });
  });

  it("should add season attribute when provided", () => {
    const attrs = generateAttributes("01", ["5000"]);

    expect(attrs).toHaveLength(2);
    expect(attrs[1]).toEqual({ name: "season", value: "01" });
  });

  it("should add tvdbid attribute when provided", () => {
    const attrs = generateAttributes(null, ["5000"], 12345);

    expect(attrs).toHaveLength(2);
    expect(attrs[1]).toEqual({ name: "tvdbid", value: "12345" });
  });

  it("should include all attributes when all params provided", () => {
    const attrs = generateAttributes("02", ["5000", "5040"], 99999);

    expect(attrs).toHaveLength(4);
    expect(attrs.find((a) => a.name === "season")).toEqual({ name: "season", value: "02" });
    expect(attrs.find((a) => a.name === "tvdbid")).toEqual({ name: "tvdbid", value: "99999" });
  });
});

describe("getEmptyRssResult", () => {
  it("should return empty RSS structure", () => {
    const result = getEmptyRssResult();

    expect(result.channel.title).toBe("RundfunkArr");
    expect(result.channel.response.offset).toBe(0);
    expect(result.channel.response.total).toBe(0);
    expect(result.channel.items).toEqual([]);
  });
});

describe("serializeRss", () => {
  it("should serialize empty RSS to valid XML", () => {
    const rss = getEmptyRssResult();
    const xml = serializeRss(rss);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<rss");
    expect(xml).toContain("xmlns:newznab");
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<title>RundfunkArr</title>");
  });

  it("should include newznab:response with offset and total", () => {
    const rss = getEmptyRssResult();
    const xml = serializeRss(rss);

    expect(xml).toContain("newznab:response");
    expect(xml).toContain('offset="0"');
    expect(xml).toContain('total="0"');
  });
});

describe("convertItemsToRss", () => {
  const mockItem: NewznabItem = {
    title: "Test.Show.S01E01.720p.WEB.h264-TEST",
    guid: { isPermaLink: true, value: "http://example.com/1" },
    link: "http://example.com/video.mp4",
    comments: "http://example.com/page",
    pubDate: "Mon, 01 Jan 2024 12:00:00 GMT",
    category: "TV > HD",
    description: "Test description",
    enclosure: {
      url: "/api/download?id=1",
      length: 1000000,
      type: "application/x-nzb",
    },
    attributes: [{ name: "category", value: "5040" }],
  };

  it("should convert items to RSS XML", () => {
    const xml = convertItemsToRss([mockItem], 100, 0);

    expect(xml).toContain("Test.Show.S01E01.720p.WEB.h264-TEST");
    expect(xml).toContain('total="1"');
  });

  it("should handle pagination with offset", () => {
    const items = [mockItem, { ...mockItem, title: "Second.Item" }];
    const xml = convertItemsToRss(items, 1, 1);

    expect(xml).toContain("Second.Item");
    expect(xml).not.toContain("Test.Show.S01E01");
    expect(xml).toContain('offset="1"');
    expect(xml).toContain('total="2"');
  });

  it("should return empty RSS for empty items array", () => {
    const xml = convertItemsToRss([], 100, 0);

    expect(xml).toContain('total="0"');
  });

  it("should respect limit parameter", () => {
    const items = Array(5)
      .fill(null)
      .map((_, i) => ({ ...mockItem, title: `Item${i}` }));
    const xml = convertItemsToRss(items, 2, 0);

    expect(xml).toContain("Item0");
    expect(xml).toContain("Item1");
    expect(xml).not.toContain("Item2");
  });
});

describe("generateFakeNzb", () => {
  it("should generate valid NZB XML", () => {
    const nzb = generateFakeNzb("http://example.com/video.mp4", "Test.Show.S01E01");

    expect(nzb).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(nzb).toContain("<!DOCTYPE nzb");
    expect(nzb).toContain("<nzb");
  });

  it("should include URL in comment", () => {
    const url = "http://example.com/video.mp4";
    const nzb = generateFakeNzb(url, "Test");

    expect(nzb).toContain(`<!-- ${url} -->`);
  });

  it("should include title in meta", () => {
    const title = "My.Show.S01E01.720p";
    const nzb = generateFakeNzb("http://example.com", title);

    expect(nzb).toContain(`<meta type="title">${title}</meta>`);
  });

  it("should include base64 encoded URL in segment", () => {
    const url = "http://example.com/test.mp4";
    const nzb = generateFakeNzb(url, "Test");
    const encoded = Buffer.from(url).toString("base64");

    expect(nzb).toContain(encoded);
  });
});

describe("getCapabilitiesXml", () => {
  it("should return valid capabilities XML", () => {
    const xml = getCapabilitiesXml();

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<caps>");
  });

  it("should include server info", () => {
    const xml = getCapabilitiesXml();

    expect(xml).toContain('title="RundfunkArr"');
    expect(xml).toContain("German Public TV Indexer");
  });

  it("should include supported search types", () => {
    const xml = getCapabilitiesXml();

    expect(xml).toContain("<searching>");
    expect(xml).toContain('available="yes"');
    expect(xml).toContain("tv-search");
    expect(xml).toContain("movie-search");
  });

  it("should include category definitions", () => {
    const xml = getCapabilitiesXml();

    expect(xml).toContain('id="5000"');
    expect(xml).toContain('name="TV"');
    expect(xml).toContain('id="2000"');
    expect(xml).toContain('name="Movies"');
  });

  it("should indicate registration is not available", () => {
    const xml = getCapabilitiesXml();

    expect(xml).toContain("<registration");
    expect(xml).toContain('available="no"');
  });
});
