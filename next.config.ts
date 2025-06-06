import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['https-proxy-agent']
  },
  
  // Auto-start monitor on both development AND production
  async rewrites() {
    // Trigger auto-monitor start when server is ready
    // Works in both development and production
    setTimeout(async () => {
      try {
        console.log('🚀 Auto-starting ChainAbuse monitor...');
        
        // Use environment variable or fallback to localhost
        const baseUrl = process.env.NEXT_PUBLIC_URL || 
                       process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                       'http://localhost:3000';
        
        const response = await fetch(`${baseUrl}/api/auto-monitor`, {
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
    
    return [];
  }
};

export default nextConfig;