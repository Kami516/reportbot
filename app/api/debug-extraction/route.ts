// app/api/debug-extraction/route.ts - Debug what data we extract
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function GET() {
  let browser;
  
  try {
    console.log('🔍 Starting extraction debug...');
    
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

    if (proxyConfig) {
      args.push(`--proxy-server=http://${proxyConfig.host}:${proxyConfig.port}`);
    }

    browser = await puppeteer.launch({
      headless: true,
      args,
      defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    if (proxyConfig?.username) {
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password
      });
    }

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const url = `https://www.chainabuse.com/reports?sort=newest&_t=${Date.now()}`;
    console.log(`🔄 Loading: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });

    await page.waitForSelector('.create-ScamReportCard', { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Detailed extraction debug
    const extractionDebug = await page.evaluate(() => {
      const reportElements = Array.from(document.querySelectorAll('.create-ScamReportCard'));
      console.log(`Found ${reportElements.length} reports`);
      
      // Check for reported section
      const reportedSections = Array.from(document.querySelectorAll('.create-ReportedSection, [class*="ReportedSection"]'));
      console.log(`Found ${reportedSections.length} reported sections`);
      
      const debug = {
        reportsCount: reportElements.length,
        reportedSectionsCount: reportedSections.length,
        firstReportAnalysis: null as any,
        allClassNames: [] as string[],
        reportedSectionContent: '',
        pageStructure: {
          hasReportedSection: !!document.querySelector('.create-ReportedSection'),
          hasReportedDomain: !!document.querySelector('[class*="domain"]'),
          hasReportedAddress: !!document.querySelector('[class*="address"]')
        }
      };
      
      // Analyze first report in detail
      if (reportElements.length > 0) {
        const firstReport = reportElements[0];
        const textContent = firstReport.textContent || '';
        
        // Find all category-related elements
        const categoryElements = Array.from(firstReport.querySelectorAll('[class*="category"]'));
        const categoryTexts = categoryElements.map(el => ({
          className: el.className,
          textContent: el.textContent?.trim()
        }));
        
        debug.firstReportAnalysis = {
          textContent: textContent.substring(0, 500),
          innerHTML: firstReport.innerHTML.substring(0, 800),
          categoryElements: categoryTexts,
          allClasses: firstReport.className,
          childrenClasses: Array.from(firstReport.querySelectorAll('*')).map(el => el.className).filter(c => c)
        };
      }
      
      // Get all unique class names on the page
      const allElements = Array.from(document.querySelectorAll('*'));
      const uniqueClasses = new Set<string>();
      allElements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          el.className.split(' ').forEach(cls => {
            if (cls && (cls.includes('report') || cls.includes('Report') || cls.includes('domain') || cls.includes('Domain') || cls.includes('category') || cls.includes('Category'))) {
              uniqueClasses.add(cls);
            }
          });
        }
      });
      debug.allClassNames = Array.from(uniqueClasses).sort();
      
      // Get reported section content
      const reportedSection = document.querySelector('.create-ReportedSection');
      if (reportedSection) {
        debug.reportedSectionContent = reportedSection.textContent?.substring(0, 300) || '';
      }
      
      return debug;
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      url,
      extractionDebug
    });

  } catch (error: any) {
    console.error('💥 Debug error:', error);
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