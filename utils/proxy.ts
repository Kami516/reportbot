// src/utils/proxy.ts
interface ProxyConfig {
    host: string;
    port: number;
    username: string;
    password: string;
  }
  
  export function parseProxyConfig(proxyString: string): ProxyConfig {
    const parts = proxyString.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid proxy config format. Expected: host:port:username:password');
    }
    
    const [host, port, username, password] = parts;
    return {
      host,
      port: parseInt(port),
      username,
      password
    };
  }
  
  export function createProxyAgent(proxyConfig: ProxyConfig) {
    // For server-side usage with https-proxy-agent
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
      return new HttpsProxyAgent(proxyUrl);
    } catch (error) {
      console.warn('https-proxy-agent not available, using direct connection');
      return null;
    }
  }
  
  // Alternative fetch function with proxy support
  export async function fetchWithProxy(url: string, options: RequestInit = {}, proxyConfig?: ProxyConfig) {
    if (proxyConfig && typeof window === 'undefined') {
      // Server-side with proxy
      const agent = createProxyAgent(proxyConfig);
      return fetch(url, {
        ...options,
        // @ts-ignore - agent property exists in Node.js fetch
        agent,
      });
    }
    
    // Client-side or fallback
    return fetch(url, options);
  }