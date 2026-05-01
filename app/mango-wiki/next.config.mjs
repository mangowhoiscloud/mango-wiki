/** @type {import('next').NextConfig} */

// GitHub Pages serves at https://mangowhoiscloud.github.io/mango-wiki/.
// `basePath` + `assetPrefix` are required so internal links resolve under the
// `/mango-wiki/` subpath. They activate only in production builds; `next dev`
// still serves at the root for local hacking.
//
// Set MANGO_WIKI_BASE_PATH="" if you ever deploy at the apex (custom domain
// with no subpath) — e.g. via a CNAME at wiki.example.com.
const isProduction = process.env.NODE_ENV === "production";
const basePath =
  process.env.MANGO_WIKI_BASE_PATH !== undefined
    ? process.env.MANGO_WIKI_BASE_PATH
    : isProduction
      ? "/mango-wiki"
      : "";

const nextConfig = {
  reactStrictMode: true,
  output: "export", // static export → out/ → GitHub Pages
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true, // GitHub Pages serves directories
  images: {
    unoptimized: true, // no Image Optimization API in static export
  },
};

export default nextConfig;
