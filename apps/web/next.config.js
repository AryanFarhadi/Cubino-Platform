/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@cubino/shared"],
};

module.exports = nextConfig;
