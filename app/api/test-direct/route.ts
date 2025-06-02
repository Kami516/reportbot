// app/api/test-direct/route.ts - Simple Direct Test
import { NextRequest, NextResponse } from 'next/server';
import { parseProxyConfig, fetchWithProxy } from '../../../utils/proxy';

export async function GET() {
  try {
    console.log('🧪 Testing direct connection to ChainAbuse...');
    
    const proxyConfig = process.env.PROXY_CONFIG ? parseProxyConfig(process.env.PROXY_CONFIG) : undefined;
    
    // Test 1: Sprawdź IP przez proxy
    let ipTest = null;
    try {
      const ipResponse = await fetchWithProxy('https://httpbin.org/ip', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }, proxyConfig);
      
      const ipData = await ipResponse.text();
      ipTest = { success: true, data: ipData };
      console.log('IP test result:', ipData);
    } catch (e: any) {
      ipTest = { success: false, error: e.message };
    }
    
    // Test 2: ChainAbuse homepage
    let homepageTest = null;
    try {
      const homeResponse = await fetchWithProxy('https://www.chainabuse.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      }, proxyConfig);
      
      const homeHtml = await homeResponse.text();
      
      homepageTest = {
        success: true,
        status: homeResponse.status,
        length: homeHtml.length,
        hasChainAbuse: homeHtml.includes('ChainAbuse') || homeHtml.includes('chainabuse'),
        hasCloudflare: homeHtml.includes('Cloudflare') || homeHtml.includes('Just a moment'),
        hasError: homeHtml.includes('error') || homeHtml.includes('Error'),
        sample: homeHtml.substring(0, 1000)
      };
      
      console.log('Homepage test result:', homepageTest);
    } catch (e: any) {
      homepageTest = { success: false, error: e.message };
    }
    
    // Test 3: ChainAbuse reports page
    let reportsTest = null;
    try {
      const reportsResponse = await fetchWithProxy('https://www.chainabuse.com/reports', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Referer': 'https://www.chainabuse.com/'
        }
      }, proxyConfig);
      
      const reportsHtml = await reportsResponse.text();
      
      // Analizuj content
      const analysis = {
        status: reportsResponse.status,
        length: reportsHtml.length,
        hasReports: reportsHtml.includes('Submitted by') || reportsHtml.includes('minutes ago'),
        hasNextData: reportsHtml.includes('__NEXT_DATA__'),
        hasScamReportCard: reportsHtml.includes('ScamReportCard') || reportsHtml.includes('create-ScamReportCard'),
        hasCloudflare: reportsHtml.includes('Cloudflare') || reportsHtml.includes('Just a moment'),
        hasLogin: reportsHtml.includes('login') || reportsHtml.includes('Login') || reportsHtml.includes('sign in'),
        hasError: reportsHtml.includes('error') || reportsHtml.includes('Error') || reportsHtml.includes('404'),
        sample: reportsHtml.substring(0, 2000)
      };
      
      // Sprawdź Next.js data
      let nextData = null;
      const nextDataMatch = reportsHtml.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
      if (nextDataMatch) {
        try {
          nextData = JSON.parse(nextDataMatch[1]);
        } catch (e) {
          nextData = { error: 'Parse failed' };
        }
      }
      
      reportsTest = {
        success: true,
        analysis,
        nextData: nextData ? {
          page: nextData.page,
          runtimeConfig: nextData.runtimeConfig,
          hasProps: !!nextData.props
        } : null
      };
      
      console.log('Reports test result:', analysis);
    } catch (e: any) {
      reportsTest = { success: false, error: e.message };
    }
    
    // Test 4: Try API endpoint
    let apiTest = null;
    try {
      const apiResponse = await fetchWithProxy('https://api.chainabuse.com/v1/reports', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Origin': 'https://www.chainabuse.com',
          'Referer': 'https://www.chainabuse.com/'
        }
      }, proxyConfig);
      
      const apiData = await apiResponse.text();
      
      apiTest = {
        success: true,
        status: apiResponse.status,
        length: apiData.length,
        sample: apiData.substring(0, 500)
      };
      
      console.log('API test result:', apiTest);
    } catch (e: any) {
      apiTest = { success: false, error: e.message };
    }
    
    // Recommendations
    const recommendations = [];
    
    if (!ipTest?.success) {
      recommendations.push("❌ Proxy connection failed");
    }
    
    if (homepageTest?.hasCloudflare || reportsTest?.analysis?.hasCloudflare) {
      recommendations.push("🛡️ Cloudflare protection detected");
    }
    
    if (reportsTest?.analysis?.hasLogin) {
      recommendations.push("🔐 Login required for reports page");
    }
    
    if (reportsTest?.analysis?.length === 0) {
      recommendations.push("📄 Empty reports page - blocked or requires auth");
    }
    
    if (reportsTest?.analysis?.hasNextData && !reportsTest?.analysis?.hasReports) {
      recommendations.push("🔄 Next.js SPA detected but no reports visible - need JavaScript execution");
    }
    
    if (apiTest?.status === 401 || apiTest?.status === 403) {
      recommendations.push("🔑 API requires authentication");
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tests: {
        ipTest,
        homepageTest,
        reportsTest,
        apiTest
      },
      config: {
        proxyUsed: !!proxyConfig,
        proxyHost: proxyConfig ? `${proxyConfig.host}:${proxyConfig.port}` : null
      },
      recommendations
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}