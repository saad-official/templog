import { existsSync } from "node:fs";
import path from "node:path";

/** The hero product video, if one has been recorded into public/video/. */
export const PRODUCT_VIDEO = { src: "/video/templog.mp4", poster: "/video/templog-poster.jpg" } as const;

/**
 * Checked when the home page renders at build time: with no recording in
 * `public/video/templog.mp4` the hero shows the CSS phone mock instead of an
 * empty player.
 */
export function findProductVideo(publicDir = path.join(process.cwd(), "public")): typeof PRODUCT_VIDEO | null {
  return existsSync(path.join(publicDir, "video", "templog.mp4")) ? PRODUCT_VIDEO : null;
}
