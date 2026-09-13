/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
  },
  // Suppress BullMQ's optional @valkey/valkey-glide peer dep warning
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), '@valkey/valkey-glide'];
    }
    return config;
  },
};

export default nextConfig;
