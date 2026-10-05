import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findProductVideo, PRODUCT_VIDEO } from "@/lib/marketing/product-video";

describe("findProductVideo", () => {
  it("returns nothing when public/video/templog.mp4 is missing, so the CSS mock renders", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "templog-video-"));
    expect(findProductVideo(empty)).toBeNull();
  });

  it("returns the video and poster URLs when the file exists", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "templog-video-"));
    mkdirSync(path.join(dir, "video"));
    writeFileSync(path.join(dir, "video", "templog.mp4"), "");
    expect(findProductVideo(dir)).toEqual({ src: "/video/templog.mp4", poster: "/video/templog-poster.jpg" });
    expect(PRODUCT_VIDEO.src).toBe("/video/templog.mp4");
  });
});
