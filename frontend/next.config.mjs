/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // minimal self-contained server bundle for the Docker image
};

export default nextConfig;
