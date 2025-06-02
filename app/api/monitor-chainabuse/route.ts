// app/api/monitor-chainabuse/route.ts - Working Solution Monitor
import { NextRequest, NextResponse } from 'next/server';

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

interface ReportData {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  submittedBy: string;
  reportedDomain?: string;
  url?: string;
  source?: string;
}

class WorkingSolutionMonitor {
  private telegramBotToken: string;
  private telegramChatId: string;
  private lastKnownReports: Set<string> = new Set();
  private checkCount: number = 0;
  private isFirstRun: boolean = true;
  private driver: any = null;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID!;
  }

  private async initDriver() {
    if (this.driver) return;

    try {
      console.log('🚀 Initializing Working Solution Monitor...');
      
      const options = new chrome.Options();
      options.addArguments('--headless=new');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--window-size=1920,1080');
      options.addArguments('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Advanced options for better JavaScript support
      options.addArguments('--disable-blink-features=AutomationControlled');
      options.addArguments('--disable-features=VizDisplayCompositor');
      options.excludeSwitches(['enable-automation']);
      options.addArguments('--disable-background-timer-throttling');
      options.addArguments('--disable-backgrounding-occluded-windows');
      options.addArguments('--disable-renderer-backgrounding');
      
      // NO PROXY - based on test results proxy doesn't work
      console.log('⚠️ Running WITHOUT proxy (proxy returned 503)');

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

      const builder = new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options);

      if (service) builder.setChromeService(service);

      this.driver = await builder.build();

      // Hide webdriver property
      await this.driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");

      console.log('✅ Working Solution Monitor initialized (no proxy)');
    } catch (error: any) {
      console.error('💥 Driver initialization failed:', error.message);
      throw error;
    }
  }

  private async waitForReportsToLoad(): Promise<void> {
    console.log('⏳ Waiting for reports to load...');
    
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    let reportsLoaded = false;
    
    while (!reportsLoaded && attempts < maxAttempts) {
      try {
        const pageState = await this.driver.executeScript(`
          return {
            bodyLength: document.body.innerText.length,
            hasSubmittedBy: document.body.innerText.includes('Submitted by'),
            hasMinutesAgo: /\\d+\\s+minutes?\\s+ago/i.test(document.body.innerText),
            hasHoursAgo: /\\d+\\s+hours?\\s+ago/i.test(document.body.innerText),
            hasDaysAgo: /\\d+\\s+days?\\s+ago/i.test(document.body.innerText),
            hasScamWords: /scam|phishing|fraud/i.test(document.body.innerText),
            reportElements: document.querySelectorAll('[class*="Report"], [class*="Card"], [class*="report"], [class*="card"]').length,
            readyState: document.readyState,
            hasError: document.body.innerText.includes('error') || document.body.innerText.includes('Error'),
            title: document.title
          };
        `);
        
        // Success conditions
        if ((pageState.hasSubmittedBy && (pageState.hasMinutesAgo || pageState.hasHoursAgo || pageState.hasDaysAgo)) ||
            (pageState.hasScamWords && pageState.reportElements > 0) ||
            pageState.bodyLength > 20000) {
          reportsLoaded = true;
          console.log(`✅ Reports loaded after ${attempts + 1} attempts`);
          console.log(`📊 Page state: bodyLength=${pageState.bodyLength}, submittedBy=${pageState.hasSubmittedBy}, timeRefs=${pageState.hasMinutesAgo || pageState.hasHoursAgo}, elements=${pageState.reportElements}`);
        } else {
          attempts++;
          console.log(`🔄 Waiting attempt ${attempts}/${maxAttempts} - bodyLength: ${pageState.bodyLength}, hasSubmittedBy: ${pageState.hasSubmittedBy}, title: ${pageState.title}`);
          await this.driver.sleep(1000);
        }
      } catch (e: any) {
        console.log(`⚠️ Error checking page state: ${e.message}`);
        attempts++;
        await this.driver.sleep(1000);
      }
    }
    
    if (!reportsLoaded) {
      console.log('⚠️ Reports may not have loaded completely after 30 seconds');
    }
    
    // Extra wait for any final loading
    await this.driver.sleep(3000);
  }

  private async getReportsWithWorkingSolution(): Promise<{ reports: ReportData[], debug: any }> {
    try {
      await this.initDriver();
      
      console.log('🌐 Navigating to ChainAbuse reports (without proxy)...');
      await this.driver.get('https://www.chainabuse.com/reports?sort=newest');
      
      // Wait for React/Next.js to load completely
      await this.waitForReportsToLoad();
      
      console.log('🔍 Extracting reports with enhanced methods...');
      
      // Enhanced extraction with multiple methods
      const extractionResult = await this.driver.executeScript(`
        const reports = [];
        const debug = {
          pageTitle: document.title,
          currentUrl: window.location.href,
          bodyTextLength: document.body.innerText.length,
          bodyHtmlLength: document.body.innerHTML.length,
          nextDataExists: !!document.getElementById('__NEXT_DATA__'),
          reactRootExists: !!document.querySelector('[data-reactroot]'),
          extractionMethods: {},
          foundElements: {},
          patterns: {},
          samples: {}
        };

        try {
          const bodyText = document.body.innerText || '';
          const bodyHtml = document.body.innerHTML || '';
          
          debug.samples.bodyTextStart = bodyText.substring(0, 2000);
          debug.samples.bodyHtmlStart = bodyHtml.substring(0, 2000);
          
          // Method 1: Direct pattern search
          const timePattern = /(\\d+)\\s+(minute|hour|day)s?\\s+ago/gi;
          const submittedPattern = /Submitted\\s+by\\s+([A-Za-z0-9_]+)/gi;
          const scamPattern = /(Phishing|Bitcoin|Ethereum|Crypto|Investment|Romance|Fraud)?\\s*Scam/gi;
          
          const timeMatches = Array.from(bodyText.matchAll(timePattern));
          const submittedMatches = Array.from(bodyText.matchAll(submittedPattern));
          const scamMatches = Array.from(bodyText.matchAll(scamPattern));
          
          debug.patterns = {
            timeMatches: timeMatches.length,
            submittedMatches: submittedMatches.length,
            scamMatches: scamMatches.length
          };
          
          debug.extractionMethods.directPattern = {
            timeMatches: timeMatches.map(m => m[0]),
            submittedMatches: submittedMatches.map(m => m[1]),
            scamMatches: scamMatches.map(m => m[0])
          };
          
          // Create reports from direct patterns
          const maxReports = Math.min(timeMatches.length, submittedMatches.length, 20);
          for (let i = 0; i < maxReports; i++) {
            if (timeMatches[i] && submittedMatches[i]) {
              const timestamp = timeMatches[i][0];
              const submittedBy = submittedMatches[i][1];
              const title = scamMatches[i] ? scamMatches[i][0] : 'Scam Report';
              
              const id = 'direct_' + i + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              
              reports.push({
                id: id,
                title: title,
                description: 'Report found via direct pattern matching',
                timestamp: timestamp,
                submittedBy: submittedBy,
                source: 'DirectPattern'
              });
            }
          }
          
          // Method 2: Element-based search
          const allElements = document.querySelectorAll('*');
          let elementReports = 0;
          
          for (let i = 0; i < Math.min(allElements.length, 1000); i++) {
            const element = allElements[i];
            const text = element.innerText || element.textContent || '';
            
            if (text.length > 20 && text.length < 1000) {
              const submittedMatch = text.match(/Submitted\\s+by\\s+([A-Za-z0-9_]+)/i);
              const timeMatch = text.match(/(\\d+)\\s+(minute|hour|day)s?\\s+ago/i);
              
              if (submittedMatch && timeMatch) {
                const id = 'element_' + elementReports + '_' + Date.now();
                const existing = reports.find(r => r.submittedBy === submittedMatch[1] && r.timestamp === timeMatch[0]);
                
                if (!existing) {
                  reports.push({
                    id: id,
                    title: 'Element Scam Report',
                    description: text.substring(0, 200),
                    timestamp: timeMatch[0],
                    submittedBy: submittedMatch[1],
                    source: 'ElementSearch'
                  });
                  elementReports++;
                }
              }
            }
          }
          
          debug.extractionMethods.elementSearch = { foundElements: elementReports };
          
          // Method 3: CSS selector search
          const selectors = [
            '[class*="ScamReportCard"]',
            '[class*="create-ScamReportCard"]',
            '[class*="report"]',
            '[class*="Report"]',
            '[class*="card"]',
            '[class*="Card"]',
            'div:contains("Submitted by")',
            'span:contains("ago")'
          ];
          
          let selectorResults = {};
          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              selectorResults[selector] = elements.length;
              
              if (elements.length > 0) {
                debug.foundElements[selector] = elements.length;
                
                // Extract from these elements if they contain report data
                for (const element of Array.from(elements).slice(0, 10)) {
                  const text = element.innerText || element.textContent || '';
                  const submittedMatch = text.match(/Submitted\\s+by\\s+([A-Za-z0-9_]+)/i);
                  const timeMatch = text.match(/(\\d+)\\s+(minute|hour|day)s?\\s+ago/i);
                  
                  if (submittedMatch && timeMatch) {
                    const id = 'selector_' + selector.replace(/[^a-zA-Z0-9]/g, '') + '_' + Math.random().toString(36).substr(2, 9);
                    const existing = reports.find(r => r.submittedBy === submittedMatch[1] && r.timestamp === timeMatch[0]);
                    
                    if (!existing) {
                      reports.push({
                        id: id,
                        title: 'Selector Scam Report',
                        description: text.substring(0, 150),
                        timestamp: timeMatch[0],
                        submittedBy: submittedMatch[1],
                        source: 'SelectorSearch'
                      });
                    }
                  }
                }
              }
            } catch (e) {
              selectorResults[selector] = 'error: ' + e.message;
            }
          }
          
          debug.extractionMethods.selectorSearch = selectorResults;
          
          // Method 4: Try to find Next.js data
          const nextDataScript = document.getElementById('__NEXT_DATA__');
          if (nextDataScript) {
            try {
              const nextData = JSON.parse(nextDataScript.textContent || '{}');
              debug.nextData = {
                page: nextData.page,
                hasProps: !!nextData.props,
                runtimeConfig: nextData.runtimeConfig
              };
            } catch (e) {
              debug.nextData = { error: 'Parse failed' };
            }
          }
          
        } catch (error) {
          debug.error = error.message;
        }
        
        return { reports, debug };
      `);

      console.log(`📊 Enhanced extraction complete: ${extractionResult.reports.length} reports found`);
      console.log(`🔍 Methods: Direct=${extractionResult.debug.patterns.timeMatches}, Element=${extractionResult.debug.extractionMethods.elementSearch?.foundElements || 0}, Selector=${Object.keys(extractionResult.debug.foundElements || {}).length}`);
      
      return extractionResult;
      
    } catch (error: any) {
      console.error('💥 Enhanced extraction error:', error);
      throw error;
    }
  }

  private async sendTelegramMessage(message: string): Promise<void> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegramChatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram error: ${JSON.stringify(errorData)}`);
      }
      
      console.log('✅ Telegram message sent');
    } catch (error: any) {
      console.error('❌ Telegram error:', error.message);
      throw error;
    }
  }

  private formatReportMessage(report: ReportData): string {
    const timestamp = new Date().toLocaleString('pl-PL');
    
    let message = `🚨 <b>NOWY RAPORT CHAINABUSE!</b>\n\n`;
    message += `📝 <b>Typ:</b> ${report.title}\n`;
    message += `📄 <b>Opis:</b> ${report.description}\n`;
    message += `⏰ <b>Zgłoszony:</b> ${report.timestamp}\n`;
    message += `👤 <b>Przez:</b> ${report.submittedBy}\n`;
    message += `🔗 <b>Link:</b> https://www.chainabuse.com/reports\n`;
    message += `\n🤖 <i>Wykryto: ${timestamp}</i>`;
    message += `\n🔍 <i>Metoda: ${report.source}</i>`;
    message += `\n⚡ <i>Working Solution v1.0</i>`;

    return message;
  }

  public async checkForNewReports(): Promise<{ newReports: number; success: boolean; debug?: any }> {
    try {
      const currentTime = new Date();
      this.checkCount++;
      
      console.log(`🚀 Working Solution check #${this.checkCount}: ${currentTime.toLocaleTimeString('pl-PL')}`);
      
      const { reports, debug } = await this.getReportsWithWorkingSolution();
      
      const fullDebug = {
        checkNumber: this.checkCount,
        isFirstRun: this.isFirstRun,
        extractedReports: reports.length,
        knownReportsCount: this.lastKnownReports.size,
        enhancedDebug: debug,
        reportSummary: reports.map(r => ({ 
          id: r.id, 
          title: r.title, 
          timestamp: r.timestamp, 
          by: r.submittedBy,
          source: r.source
        }))
      };

      // Pierwsze uruchomienie
      if (this.isFirstRun) {
        reports.forEach(report => this.lastKnownReports.add(report.id));
        this.isFirstRun = false;
        
        const debugText = `🔍 <b>Working Solution Monitor uruchomiony!</b>\n\n` +
          `📊 <b>Stan początkowy:</b>\n` +
          `• Raporty znalezione: ${reports.length}\n` +
          `• Strona: ${debug.pageTitle}\n` +
          `• URL: ${debug.currentUrl}\n` +
          `• Tekst body: ${debug.bodyTextLength} znaków\n` +
          `• HTML body: ${debug.bodyHtmlLength} znaków\n` +
          `• Next.js data: ${debug.nextDataExists ? '✅' : '❌'}\n` +
          `• React root: ${debug.reactRootExists ? '✅' : '❌'}\n\n` +
          `🎯 <b>Wzorce znalezione:</b>\n` +
          `• "X ago": ${debug.patterns?.timeMatches || 0}\n` +
          `• "Submitted by": ${debug.patterns?.submittedMatches || 0}\n` +
          `• "Scam": ${debug.patterns?.scamMatches || 0}\n\n` +
          `🔧 <b>Metody extraction:</b>\n` +
          `• Direct Pattern: ${debug.patterns?.timeMatches || 0} matches\n` +
          `• Element Search: ${debug.extractionMethods?.elementSearch?.foundElements || 0} elements\n` +
          `• Selector Search: ${Object.keys(debug.foundElements || {}).length} selectors\n\n` +
          `⚠️ <b>Proxy wyłączony</b> (503 error)\n` +
          `🌐 <b>Direct connection working</b>\n\n`;
        
        await this.sendTelegramMessage(debugText + `⚡ <i>Working Solution Monitor v1.0</i>`);
        
        // Send detailed sample if content found
        if (debug.samples?.bodyTextStart && debug.samples.bodyTextStart.length > 100) {
          const sampleText = `📄 <b>Próbka tekstu ze strony:</b>\n\n<code>${debug.samples.bodyTextStart.substring(0, 1000)}</code>`;
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.sendTelegramMessage(sampleText);
        }
        
        return { newReports: 0, success: true, debug: fullDebug };
      }

      // Znajdź nowe raporty
      const newReports = reports.filter(report => !this.lastKnownReports.has(report.id));

      if (newReports.length > 0) {
        console.log(`🚨 Found ${newReports.length} new reports!`);
        
        for (const report of newReports) {
          const message = this.formatReportMessage(report);
          await this.sendTelegramMessage(message);
          this.lastKnownReports.add(report.id);
          
          if (newReports.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        return { newReports: newReports.length, success: true, debug: fullDebug };
      } else {
        console.log('ℹ️ No new reports found');
        const currentIds = new Set(reports.map(r => r.id));
        this.lastKnownReports = currentIds;
        return { newReports: 0, success: true, debug: fullDebug };
      }

    } catch (error: any) {
      console.error('💥 Working Solution Monitor error:', error);
      return { 
        newReports: 0, 
        success: false, 
        debug: { 
          error: error.message, 
          checkNumber: this.checkCount 
        } 
      };
    }
  }

  public async cleanup() {
    if (this.driver) {
      try {
        await this.driver.quit();
        console.log('🔧 Working solution driver closed');
      } catch (error) {
        console.log('⚠️ Error closing driver:', error);
      }
    }
  }
}

// Global instance
let workingMonitor: WorkingSolutionMonitor | null = null;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Missing Telegram configuration',
        success: false,
        newReports: 0
      }, { status: 500 });
    }

    if (!workingMonitor) {
      console.log('🔧 Initializing Working Solution Monitor...');
      workingMonitor = new WorkingSolutionMonitor();
    }

    const result = await workingMonitor.checkForNewReports();
    
    return NextResponse.json({
      success: result.success,
      newReports: result.newReports,
      timestamp: new Date().toISOString(),
      debug: result.debug
    });

  } catch (error: any) {
    console.error('💥 API Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error.message,
      success: false,
      newReports: 0,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Working Solution ChainAbuse Monitor - No Proxy + Enhanced JS',
    timestamp: new Date().toISOString(),
    version: 'working-v1.0',
    features: [
      'No proxy (direct connection)',
      'Enhanced JavaScript execution',
      'Multiple extraction methods',
      'Pattern matching',
      'Element-based search', 
      'CSS selector search',
      'Extended wait times',
      'Detailed debugging'
    ]
  });
}