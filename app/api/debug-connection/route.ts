// app/api/debug-connection/route.ts - Debug Connection Test
import { NextRequest, NextResponse } from 'next/server';

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

export async function GET() {
  let driver = null;
  
  try {
    console.log('🔧 Starting connection debug test...');
    
    const options = new chrome.Options();
    // DODAJEMY --no-headless dla debugowania!
    // options.addArguments('--headless=new'); // WYŁĄCZONE!
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Find ChromeDriver
    const possibleDriverPaths = [
      '/opt/homebrew/bin/chromedriver',
      '/usr/local/bin/chromedriver',
      '/usr/bin/chromedriver'
    ];

    let driverPath = null;
    for (const path of possibleDriverPaths) {
      try {
        const fs = require('fs');
        if (fs.existsSync(path)) {
          driverPath = path;
          break;
        }
      } catch (e) { continue; }
    }

    let service = null;
    if (driverPath) {
      service = new chrome.ServiceBuilder(driverPath);
    }

    // Proxy test
    let proxyInfo = null;
    if (process.env.PROXY_CONFIG) {
      const [host, port, username, password] = process.env.PROXY_CONFIG.split(':');
      options.addArguments(`--proxy-server=http://${host}:${port}`);
      options.addArguments(`--proxy-auth=${username}:${password}`);
      proxyInfo = { host, port, username, hasPassword: !!password };
    }

    const builder = new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options);

    if (service) builder.setChromeService(service);

    driver = await builder.build();
    
    console.log('✅ Driver created, testing connections...');
    
    // Test 1: Basic IP check
    let ipTest = null;
    try {
      console.log('🌐 Testing IP...');
      await driver.get('https://httpbin.org/ip');
      await driver.sleep(3000);
      const ipBody = await driver.findElement(By.css('body')).getText();
      ipTest = { success: true, response: ipBody };
      console.log('IP test result:', ipBody);
    } catch (e: any) {
      ipTest = { success: false, error: e.message };
    }

    // Test 2: ChainAbuse homepage
    let chainabuseTest = null;
    try {
      console.log('🏠 Testing ChainAbuse homepage...');
      await driver.get('https://www.chainabuse.com');
      await driver.sleep(5000);
      
      const homePageInfo = await driver.executeScript(`
        return {
          title: document.title,
          bodyLength: document.body.innerText.length,
          htmlLength: document.body.innerHTML.length,
          currentUrl: window.location.href,
          hasContent: document.body.innerText.length > 100,
          bodyText: document.body.innerText.substring(0, 500),
          hasCloudflare: document.body.innerText.includes('Cloudflare') || document.body.innerText.includes('Just a moment'),
          hasError: document.body.innerText.includes('error') || document.body.innerText.includes('Error'),
          hasAccess: document.body.innerText.includes('ChainAbuse') || document.body.innerText.includes('reports')
        };
      `);
      
      chainabuseTest = { success: true, data: homePageInfo };
      console.log('ChainAbuse homepage test:', homePageInfo);
    } catch (e: any) {
      chainabuseTest = { success: false, error: e.message };
    }

    // Test 3: ChainAbuse reports page  
    let reportsPageTest = null;
    try {
      console.log('📊 Testing ChainAbuse reports page...');
      await driver.get('https://www.chainabuse.com/reports?sort=newest');
      await driver.sleep(8000); // Longer wait
      
      const reportsPageInfo = await driver.executeScript(`
        return {
          title: document.title,
          bodyLength: document.body.innerText.length,
          htmlLength: document.body.innerHTML.length,
          currentUrl: window.location.href,
          hasReports: document.body.innerText.includes('Submitted by') || document.body.innerText.includes('minutes ago'),
          hasReactRoot: !!document.querySelector('[data-reactroot]'),
          hasNextData: !!document.getElementById('__NEXT_DATA__'),
          bodyText: document.body.innerText.substring(0, 1000),
          htmlSnippet: document.body.innerHTML.substring(0, 1000),
          reportCards: document.querySelectorAll('[class*="ScamReportCard"], [class*="create-ScamReportCard"]').length,
          allClasses: Array.from(document.querySelectorAll('[class]')).map(el => el.className).slice(0, 20),
          hasCloudflare: document.body.innerText.includes('Cloudflare') || document.body.innerText.includes('Just a moment'),
          hasError: document.body.innerText.includes('error') || document.body.innerText.includes('Error'),
          hasLogin: document.body.innerText.includes('login') || document.body.innerText.includes('Login') || document.body.innerText.includes('sign in'),
          status: document.readyState
        };
      `);
      
      reportsPageTest = { success: true, data: reportsPageInfo };
      console.log('Reports page test:', reportsPageInfo);
    } catch (e: any) {
      reportsPageTest = { success: false, error: e.message };
    }

    // Test 4: Different user agents
    let userAgentTest = null;
    try {
      console.log('🕵️ Testing different user agent...');
      await driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
      await driver.get('https://www.chainabuse.com/reports');
      await driver.sleep(5000);
      
      const uaTestInfo = await driver.executeScript(`
        return {
          userAgent: navigator.userAgent,
          webdriver: navigator.webdriver,
          bodyLength: document.body.innerText.length,
          hasContent: document.body.innerText.length > 100
        };
      `);
      
      userAgentTest = { success: true, data: uaTestInfo };
    } catch (e: any) {
      userAgentTest = { success: false, error: e.message };
    }

    await driver.quit();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tests: {
        ipTest,
        chainabuseTest,
        reportsPageTest,
        userAgentTest
      },
      config: {
        proxyInfo,
        driverPath,
        headless: false // Debug mode
      },
      recommendations: generateDebugRecommendations(ipTest, chainabuseTest, reportsPageTest)
    });
    
  } catch (error: any) {
    if (driver) {
      try { await driver.quit(); } catch (e) {}
    }
    
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

function generateDebugRecommendations(ipTest: any, chainabuseTest: any, reportsPageTest: any): string[] {
  const recommendations = [];
  
  if (!ipTest?.success) {
    recommendations.push("❌ Proxy connection failed - check proxy settings");
  }
  
  if (chainabuseTest?.data?.hasCloudflare) {
    recommendations.push("🛡️ Cloudflare protection detected - try different IP/proxy");
  }
  
  if (chainabuseTest?.data?.hasError) {
    recommendations.push("⚠️ Error page detected - site may be blocking requests");
  }
  
  if (!chainabuseTest?.data?.hasAccess) {
    recommendations.push("🚫 No access to ChainAbuse - possible geoblocking");
  }
  
  if (reportsPageTest?.data?.bodyLength === 0) {
    recommendations.push("📄 Empty page content - JavaScript may be disabled or blocked");
  }
  
  if (reportsPageTest?.data?.hasLogin) {
    recommendations.push("🔐 Login required - need authentication");
  }
  
  if (reportsPageTest?.data?.reportCards === 0 && reportsPageTest?.data?.bodyLength > 0) {
    recommendations.push("🔍 Page loads but no reports found - may need to wait longer or use different selectors");
  }
  
  return recommendations;
}