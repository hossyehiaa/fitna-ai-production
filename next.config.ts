import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (Milestone 2's real PDF text extraction) depends on
  // pdfjs-dist and the native @napi-rs/canvas binary. Left to Next's
  // default bundling, the route handler that imports pdf-parse crashes
  // at module-load time (before its own try/catch can run) with errors
  // like "DOMMatrix is not defined" / "Cannot load @napi-rs/canvas" —
  // this is what was causing "معرفناش نستخرج نص من الملف ده" for every
  // single PDF, valid or not. Excluding these from bundling and letting
  // Next require() them normally at runtime fixes it.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
