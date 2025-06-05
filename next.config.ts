import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['https-proxy-agent']
  },
  
  // Auto-start monitor on development server ready
  async rewrites() {
    // Trigger auto-monitor start when server is ready
    if (process.env.NODE_ENV === 'development') {
      setTimeout(async () => {
        try {
          console.log('🚀 Auto-starting ChainAbuse monitor...');
          
          const response = await fetch('http://localhost:3000/api/auto-monitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' })
          });
          
          if (response.ok) {
            console.log('✅ ChainAbuse monitor auto-started successfully!');
          }
        } catch (error) {
          console.log('⏳ Monitor will start when first API call is made');
        }
      }, 5000);
    }
    
    return [];
  }
};

export default nextConfig;