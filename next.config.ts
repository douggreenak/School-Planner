import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer-core'],
  // Allow access from any local network device during development
  // (your phone, another laptop, etc. on the same WiFi)
  allowedDevOrigins: [
    '192.168.1.15',
    // Any other LAN IPs you want to access from — add them here.
    // Wildcards are supported: '192.168.1.*', '10.0.0.*', '*.local'
    '192.168.1.*',
    '10.0.0.*',
    '*.local',
  ],
};

export default nextConfig;
