import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Custom webpack configuration to auto-start monitor
  webpack: (config, { dev, isServer }) => {
    // Only run in development mode and on server-side
    if (dev && isServer) {
      // Import and start the monitor when webpack builds
      const { startServerMonitor } = require('./startup/monitor');
      
      // Start monitor after a delay to ensure everything is ready
      setTimeout(() => {
        console.log('🚀 Starting ChainAbuse monitor automatically...');
        startServerMonitor();
      }, 10000); // 10 second delay for full Next.js initialization
    }
    
    return config;
  },
};

export default nextConfig;