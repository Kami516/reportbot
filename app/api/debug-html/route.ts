// app/api/debug-html/route.ts - Puppeteer Debug Version
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function GET() {
  let browser;
  
  try {
    console.log('🔍 Starting Puppeteer debug...');
    
    // Parse proxy config
    let proxyConfig: any = null;
    if (process.env.PROXY_CONFIG) {
      const [host, port, username, password] = process.env.PROXY_CONFIG.split(':');
      proxyConfig = { host, port: parseInt(port), username, password };
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ];

    // Add proxy if configured
    if (proxyConfig) {
      args.push(`--proxy-server=http://${proxyConfig.host}:${proxyConfig.port}`);
      console.log(`🔗 Using proxy: ${proxyConfig.host}:${proxyConfig.port}`);
    }

    browser = await puppeteer.launch({
      headless: true,
      args,
      defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    // Set proxy authentication if needed
    if (proxyConfig && proxyConfig.username) {
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password
      });
      console.log('🔐 Proxy authentication set');
    }

    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const url = `https://www.chainabuse.com/reports?sort=newest&_t=${Date.now()}`;
    console.log(`🔄 Loading: ${url}`);
    
    // Navigate to page
    const response = await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    console.log(`📄 Page loaded, status: ${response?.status()}`);

    // Wait a bit for React to fully render
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to find report elements
    const analysis = await page.evaluate(() => {
      // Count different selectors
      const selectors = {
        'create-ScamReportCard': document.querySelectorAll('.create-ScamReportCard').length,
        'ScamReportCard': document.querySelectorAll('[class*="ScamReportCard"]').length,
        'div[class*="report"]': document.querySelectorAll('div[class*="report" i]').length,
        'div[class*="scam"]': document.querySelectorAll('div[class*="scam" i]').length,
        'div[class*="card"]': document.querySelectorAll('div[class*="card" i]').length
      };

      // Find all classes that might be related to reports
      const allElements = Array.from(document.querySelectorAll('*'));
      const reportClasses = new Set<string>();
      
      allElements.forEach(el => {
        const classList = el.className;
        if (typeof classList === 'string' && classList) {
          classList.split(' ').forEach(cls => {
            if (cls && (
              cls.toLowerCase().includes('report') ||
              cls.toLowerCase().includes('scam') ||
              cls.toLowerCase().includes('card')
            )) {
              reportClasses.add(cls);
            }
          });
        }
      });

      // Look for text patterns
      const bodyText = document.body.textContent || '';
      const patterns = {
        'submitted by': (bodyText.match(/submitted by/gi) || []).length,
        'ago': (bodyText.match(/\d+\s+(minutes?|hours?|days?)\s+ago/gi) || []).length,
        'bitcoin': (bodyText.match(/bitcoin/gi) || []).length,
        'ethereum': (bodyText.match(/ethereum/gi) || []).length,
        'scam': (bodyText.match(/scam/gi) || []).length
      };

      // Get sample content from potential report elements
      const potentialReports = Array.from(document.querySelectorAll('.create-ScamReportCard, [class*="ScamReportCard"], [class*="report"]'));
      const samples = potentialReports.slice(0, 3).map((el, index) => ({
        index,
        tagName: el.tagName,
        className: el.className,
        textContent: (el.textContent || '').substring(0, 200),
        innerHTML: (el.innerHTML || '').substring(0, 300)
      }));

      // Get page structure
      const pageStructure = {
        hasNextData: !!document.getElementById('__NEXT_DATA__'),
        hasReactRoot: !!document.querySelector('[data-reactroot]'),
        title: document.title,
        bodyClassList: document.body.className,
        mainContent: document.querySelector('main')?.textContent?.substring(0, 500) || 'No main element'
      };

      return {
        selectors,
        reportClasses: Array.from(reportClasses).sort(),
        patterns,
        samples,
        pageStructure,
        totalElements: allElements.length,
        bodyTextLength: bodyText.length
      };
    });

    // Get full HTML
    const html = await page.content();
    
    // Take screenshot for debugging
    const screenshot = await page.screenshot({ 
      encoding: 'base64',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080 }
    });

    console.log(`✅ Analysis completed: ${analysis.selectors['create-ScamReportCard']} ScamReportCard elements found`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      url,
      proxyUsed: !!proxyConfig,
      analysis,
      htmlLength: html.length,
      htmlStart: html.substring(0, 2000),
      screenshot: `data:image/png;base64,${screenshot}`,
      debugInfo: {
        foundReportElements: analysis.selectors['create-ScamReportCard'] > 0,
        hasJavaScriptContent: analysis.pageStructure.hasNextData,
        totalPotentialReports: analysis.selectors['create-ScamReportCard'] + analysis.selectors['ScamReportCard'],
        textPatterns: analysis.patterns
      }
    });

  } catch (error: any) {
    console.error('💥 Puppeteer debug error:', error);
    return NextResponse.json({
      error: error.message,
      success: false,
      stack: error.stack?.substring(0, 1000)
    }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}