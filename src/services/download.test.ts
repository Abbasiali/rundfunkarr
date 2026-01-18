import { describe, it, expect } from "vitest";
import { parseNzbContent } from "./download";

describe("parseNzbContent", () => {
  it("should parse valid NZB content with filename and URL", () => {
    const nzbContent = `<?xml version="1.0" encoding="UTF-8"?>
<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">
  <!-- https://example.com/video.mp4 -->
  <file poster="RundfunkArr" subject='filename="Show.S01E01.720p.WEB.h264-GROUP.nzb"'>
    <segments></segments>
  </file>
</nzb>`;

    const result = parseNzbContent(nzbContent);

    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("Show.S01E01.720p.WEB.h264-GROUP");
    expect(result?.url).toBe("https://example.com/video.mp4");
  });

  it("should parse filename with special characters", () => {
    const nzbContent = `filename="Der.Tatort.S2024E01.German.720p.WEB.h264-MEDiATHEK.nzb"
    <!-- https://example.com/video.mp4 -->`;

    const result = parseNzbContent(nzbContent);

    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("Der.Tatort.S2024E01.German.720p.WEB.h264-MEDiATHEK");
  });

  it("should return null when filename is missing", () => {
    const nzbContent = `<!-- https://example.com/video.mp4 -->`;

    const result = parseNzbContent(nzbContent);

    expect(result).toBeNull();
  });

  it("should return null when URL is missing", () => {
    const nzbContent = `filename="Show.S01E01.nzb"`;

    const result = parseNzbContent(nzbContent);

    expect(result).toBeNull();
  });

  it("should return null for empty content", () => {
    const result = parseNzbContent("");

    expect(result).toBeNull();
  });

  it("should handle HTTP URLs", () => {
    const nzbContent = `filename="Show.nzb"
    <!-- http://example.com/video.mp4 -->`;

    const result = parseNzbContent(nzbContent);

    expect(result).not.toBeNull();
    expect(result?.url).toBe("http://example.com/video.mp4");
  });

  it("should handle URLs with query parameters", () => {
    const nzbContent = `filename="Show.nzb"
    <!-- https://example.com/video.mp4?token=abc123 -->`;

    const result = parseNzbContent(nzbContent);

    expect(result).not.toBeNull();
    // Note: The regex stops at whitespace, so query params with & would be cut off
    expect(result?.url).toBe("https://example.com/video.mp4?token=abc123");
  });
});
