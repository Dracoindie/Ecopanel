/** @type {import('next').NextConfig} */
const isolatedDistDir = process.env.NEXT_DIST_DIR?.trim();
const nextConfig = {
  reactStrictMode: true,
  ...(isolatedDistDir ? { distDir: isolatedDistDir } : {})
};
export default nextConfig;
