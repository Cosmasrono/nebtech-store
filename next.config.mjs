/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow production validation without overwriting a running dev server's output.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
};
export default nextConfig;
