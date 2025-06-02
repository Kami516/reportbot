// app/api/debug-selenium/route.ts - Ultra Simple Debug
import { NextRequest, NextResponse } from 'next/server';
import { Builder, By, WebDriver, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

export async function GET() {
  let driver: WebDriver | null = null;
  
  try {
    console.log('🔧 Ultra simple debug starting...');
    
    // WebDriver setup
    const options = new chrome.Options();
    options.addArguments('--headless');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    console.log('✅ WebDriver ready');

    // Load page
    await driver.get('https://www.chainabuse.com/reports?sort=newest');
    await driver.wait(until.elementLocated(By.tagName('body')), 15000);
    await driver.sleep(5000);
    
    console.log('✅ Page loaded');

    // Get basic info
    const info = await driver.executeScript(`
      return {
        title: document.title,
        url: window.location.href,
        textLength: document.body.innerText.length,
        text: document.body.innerText.substring(0, 2000),
        hasNext: !!window.__NEXT_DATA__,
        divs: document.querySelectorAll('div').length
      };
    `);

    console.log('✅ Info extracted');

    const pageData = info as any;
    const pageText = pageData.text || '';
    
    // Simple pattern matching
    const submittedCount = (pageText.match(/submitted by/gi) || []).length;
    const agoCount = (pageText.match(/\d+\s+(?:minute|hour|day)s?\s+ago/gi) || []).length;
    const scamCount = (pageText.match(/scam/gi) || []).length;
    
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      basic: {
        title: pageData.title,
        url: pageData.url,
        textLength: pageData.textLength,
        hasNextData: pageData.hasNext,
        elementCount: pageData.divs
      },
      patterns: {
        submittedBy: submittedCount,
        timeAgo: agoCount,
        scam: scamCount
      },
      textSample: pageText,
      analysis: {
        hasContent: pageData.textLength > 1000,
        hasPatterns: submittedCount > 0 || agoCount > 0,
        recommendation: ''
      }
    };

    // Set recommendation
    if (!result.analysis.hasContent) {
      result.analysis.recommendation = 'Page content too small - may not have loaded properly';
    } else if (!result.analysis.hasPatterns) {
      result.analysis.recommendation = 'No report patterns found - data likely loaded asynchronously';
    } else {
      result.analysis.recommendation = `Found ${submittedCount} submitted patterns and ${agoCount} time patterns`;
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('💥 Ultra simple debug error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
    
  } finally {
    if (driver) {
      try {
        await driver.quit();
        console.log('✅ WebDriver closed');
      } catch (e) {
        console.error('Error closing driver:', e);
      }
    }
  }
}