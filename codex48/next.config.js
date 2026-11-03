/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // keep the PDF and Word readers out of the bundle so they load normally on the server
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth'],
  },
};

module.exports = nextConfig;
