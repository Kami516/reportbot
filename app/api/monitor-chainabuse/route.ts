// app/api/monitor-chainabuse/route.ts - Fixed Selenium Monitor
import { NextRequest, NextResponse } from 'next/server';
import { Builder, By, WebDriver, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

interface ChainAbuseReport {
  id: string;
  title: string;
  submittedBy: string;
  timeAgo: string;
  addresses: string[];
  extractedAt: string;
  confidence: number;
  method: string;
}

class FixedSeleniumMonitor {
  private telegramBotToken: string;
  private telegramChatId: string;
  private lastReportIds: Set<string> = new Set();
  private checkCount: number = 0;
  private isInitialized: boolean = false;
  private driver: WebDriver | null = null;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID!;
  }

  private async initializeDriver(): Promise<WebDriver> {
    if (this.driver) return this.driver;

    console.log('🔧 Initializing Fixed Chrome WebDriver...');
    
    const options = new chrome.Options();
    
    // Podstawowe opcje
    options.addArguments('--headless');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1366,768');
    
    // User agent jako string
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    options.addArguments(`--user-agent=${userAgent}`);
    
    // Wyłącz automatyzację
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--disable-extensions');
    
    // Preferencje
    const prefs = {
      'profile.default_content_setting_values.notifications': 2,
      'profile.managed_default_content_settings.images': 1
    };
    options.setUserPreferences(prefs);

    this.driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Ukryj webdriver property
    await this.driver.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    `);

    console.log('✅ Fixed Chrome WebDriver initialized');
    return this.driver;
  }

  private async fetchReportsWithSelenium(): Promise<ChainAbuseReport[]> {
    const reports: ChainAbuseReport[] = [];
    const extractedAt = new Date().toISOString();

    try {
      const driver = await this.initializeDriver();
      
      console.log('🔄 Loading ChainAbuse reports page...');
      
      // Idź bezpośrednio na stronę reports
      const timestamp = Date.now();
      const url = `https://www.chainabuse.com/reports?sort=newest&_t=${timestamp}`;
      
      await driver.get(url);
      
      // Czekaj na podstawowe elementy
      console.log('⏳ Waiting for page to load...');
      await driver.wait(until.elementLocated(By.tagName('body')), 15000);
      await driver.wait(until.elementLocated(By.id('__next')), 10000);
      
      // Czekaj na załadowanie
      let attempts = 0;
      const maxAttempts = 20; // 10 sekund
      
      while (attempts < maxAttempts) {
        await driver.sleep(500);
        
        const pageInfo = await driver.executeScript(`
          return {
            textLength: document.body.innerText.length,
            hasContent: document.body.innerText.length > 2000,
            hasSubmitted: document.body.innerText.includes('Submitted'),
            hasAgo: document.body.innerText.includes(' ago'),
            title: document.title,
            url: window.location.href
          };
        `);
        
        attempts++;
        const info = pageInfo as any;
        
        console.log(`📊 Attempt ${attempts}: ${info.textLength} chars, hasSubmitted: ${info.hasSubmitted}, hasAgo: ${info.hasAgo}`);
        
        if (info.hasContent || info.hasSubmitted || info.hasAgo) {
          console.log('✅ Content detected!');
          break;
        }
      }
      
      // Metoda 1: Wyciągnij przez JavaScript
      console.log('🔍 Method 1: JavaScript extraction...');
      const jsReports = await this.extractFromJavaScript(driver, extractedAt);
      reports.push(...jsReports);
      
      // Metoda 2: Znajdź elementy
      if (reports.length === 0) {
        console.log('🔍 Method 2: Element extraction...');
        const elementReports = await this.extractFromElements(driver, extractedAt);
        reports.push(...elementReports);
      }
      
      // Metoda 3: Parsuj tekst
      if (reports.length === 0) {
        console.log('🔍 Method 3: Text extraction...');
        const textReports = await this.extractFromText(driver, extractedAt);
        reports.push(...textReports);
      }
      
      // Metoda 4: Debug
      if (reports.length === 0) {
        console.log('🔍 Method 4: Full debug...');
        await this.performDebugAnalysis(driver);
      }
      
      console.log(`🔍 Fixed Selenium extracted ${reports.length} reports total`);
      return this.deduplicateReports(reports);
      
    } catch (error) {
      console.error('💥 Fixed Selenium error:', error);
      return [];
    }
  }

  private async extractFromJavaScript(driver: WebDriver, extractedAt: string): Promise<ChainAbuseReport[]> {
    const reports: ChainAbuseReport[] = [];
    
    try {
      const jsResult = await driver.executeScript(`
        const data = {
          page: {
            title: document.title,
            url: window.location.href,
            textLength: document.body.innerText.length,
            bodyText: document.body.innerText.substring(0, 2000)
          },
          nextData: null,
          patterns: {
            submitted: (document.body.innerText.match(/submitted/gi) || []).length,
            ago: (document.body.innerText.match(/\\d+\\s+(?:minute|hour|day)s?\\s+ago/gi) || []).length,
            scam: (document.body.innerText.match(/scam/gi) || []).length
          }
        };
        
        if (window.__NEXT_DATA__) {
          data.nextData = {
            page: window.__NEXT_DATA__.page,
            hasProps: !!window.__NEXT_DATA__.props,
            propsKeys: window.__NEXT_DATA__.props ? Object.keys(window.__NEXT_DATA__.props) : []
          };
        }
        
        return data;
      `);
      
      const data = jsResult as any;
      console.log(`📊 JavaScript data: ${data.page.textLength} chars, patterns:`, data.patterns);
      
      // Jeśli są wzorce, spróbuj parsować tekst
      if (data.patterns.submitted > 0 || data.patterns.ago > 0) {
        const textReports = this.parseTextForReports(data.page.bodyText, extractedAt, 'JavaScript');
        reports.push(...textReports);
      }
      
    } catch (jsError) {
      console.log('⚠️ JavaScript extraction failed:', jsError);
    }
    
    return reports;
  }

  private async extractFromElements(driver: WebDriver, extractedAt: string): Promise<ChainAbuseReport[]> {
    const reports: ChainAbuseReport[] = [];
    
    try {
      const selectors = [
        '[class*="Card"]',
        '[class*="Report"]',
        '[class*="Item"]',
        'article',
        'li[class]',
        'div[class*="create"]',
        'div[class]'
      ];
      
      for (const selector of selectors) {
        try {
          const elements = await driver.findElements(By.css(selector));
          
          if (elements.length > 0) {
            console.log(`🔍 Found ${elements.length} elements with ${selector}`);
            
            for (let i = 0; i < Math.min(elements.length, 15); i++) {
              try {
                const element = elements[i];
                const text = await element.getText();
                
                if (text && text.length > 30 && (
                  text.includes('Submitted') || 
                  text.includes('ago') || 
                  text.includes('Scam')
                )) {
                  console.log(`📝 Element ${i}: ${text.substring(0, 100)}...`);
                  
                  const elementReports = this.parseTextForReports(text, extractedAt, `Element_${selector}`);
                  reports.push(...elementReports);
                }
              } catch (elementError) {
                // Kontynuuj z następnym
              }
            }
            
            if (reports.length > 0) break;
          }
        } catch (selectorError) {
          // Kontynuuj z następnym selektorem
        }
      }
    } catch (error) {
      console.log('⚠️ Element extraction failed:', error);
    }
    
    return reports;
  }

  private async extractFromText(driver: WebDriver, extractedAt: string): Promise<ChainAbuseReport[]> {
    const reports: ChainAbuseReport[] = [];
    
    try {
      const pageText = await driver.executeScript('return document.body.innerText') as string;
      
      console.log(`📄 Full page text: ${pageText.length} characters`);
      
      if (pageText.length > 500) {
        const textReports = this.parseTextForReports(pageText, extractedAt, 'FullText');
        reports.push(...textReports);
      }
      
    } catch (error) {
      console.log('⚠️ Text extraction failed:', error);
    }
    
    return reports;
  }

  private async performDebugAnalysis(driver: WebDriver): Promise<void> {
    try {
      console.log('🔍 PERFORMING FULL DEBUG ANALYSIS...');
      
      const debugInfo = await driver.executeScript(`
        return {
          basic: {
            title: document.title,
            url: window.location.href,
            domain: document.domain,
            readyState: document.readyState
          },
          content: {
            bodyTextLength: document.body.innerText.length,
            bodyHTMLLength: document.body.innerHTML.length,
            bodyTextStart: document.body.innerText.substring(0, 1000),
            hasNextData: !!window.__NEXT_DATA__
          },
          elements: {
            divs: document.querySelectorAll('div').length,
            spans: document.querySelectorAll('span').length,
            paragraphs: document.querySelectorAll('p').length,
            articles: document.querySelectorAll('article').length,
            links: document.querySelectorAll('a').length
          },
          classes: Array.from(new Set(
            Array.from(document.querySelectorAll('[class]'))
              .map(el => el.className)
              .join(' ')
              .split(' ')
              .filter(c => c.length > 0)
          )).slice(0, 30),
          scripts: document.querySelectorAll('script').length
        };
      `);
      
      console.log('🔍 FULL DEBUG RESULT:');
      console.log(JSON.stringify(debugInfo, null, 2));
      
    } catch (debugError) {
      console.log('⚠️ Debug analysis failed:', debugError);
    }
  }

  private parseTextForReports(text: string, extractedAt: string, method: string): ChainAbuseReport[] {
    const reports: ChainAbuseReport[] = [];
    
    // Szukaj wzorców
    const patterns = [
      /Submitted by\s+([^0-9\n\r]+?)\s*(\d+\s+(?:minute|hour|day)s?\s+ago)/gi,
      /(Phishing|Scam|Fraud)\s.*?(\d+\s+(?:minute|hour|day)s?\s+ago)/gi,
      /(\d+\s+(?:minute|hour|day)s?\s+ago).*?(Phishing|Scam|Fraud)/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let submittedBy = 'Unknown';
        let timeAgo = 'Unknown';
        let title = 'Report';
        
        if (match[1] && match[2]) {
          if (match[1].includes('minute') || match[1].includes('hour') || match[1].includes('day')) {
            timeAgo = match[1];
            title = match[2] + ' Report';
          } else {
            submittedBy = match[1].trim();
            timeAgo = match[2];
          }
        }
        
        if (timeAgo !== 'Unknown') {
          const report: ChainAbuseReport = {
            id: `${method}_${Date.now()}_${Math.random()}`,
            title,
            submittedBy,
            timeAgo,
            addresses: this.extractAddresses(text),
            extractedAt,
            confidence: 75,
            method
          };
          
          reports.push(report);
        }
      }
    }
    
    return reports;
  }

  private extractAddresses(text: string): string[] {
    const addresses: string[] = [];
    
    // Bitcoin addresses
    const bitcoinPattern = /\b(?:bc1|[13])[a-zA-Z0-9]{25,62}\b/g;
    const bitcoinMatches = text.match(bitcoinPattern);
    if (bitcoinMatches) addresses.push(...bitcoinMatches);
    
    // Ethereum addresses
    const ethereumPattern = /\b0x[a-fA-F0-9]{40}\b/g;
    const ethereumMatches = text.match(ethereumPattern);
    if (ethereumMatches) addresses.push(...ethereumMatches);
    
    return [...new Set(addresses)];
  }

  private deduplicateReports(reports: ChainAbuseReport[]): ChainAbuseReport[] {
    const seen = new Map<string, ChainAbuseReport>();
    
    for (const report of reports) {
      const key = `${report.submittedBy}_${report.timeAgo}`;
      const existing = seen.get(key);
      
      if (!existing || existing.confidence < report.confidence) {
        seen.set(key, report);
      }
    }
    
    return Array.from(seen.values());
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
          disable_web_page_preview: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram error: ${JSON.stringify(errorData)}`);
      }
      
      console.log('✅ Telegram message sent');
    } catch (error: any) {
      console.error('❌ Telegram error:', error.message);
    }
  }

  private async sendNewReportAlert(report: ChainAbuseReport): Promise<void> {
    const addressesText = report.addresses.length > 0 
      ? `\n💰 <b>Adresy:</b> ${report.addresses.slice(0, 2).map(addr => `<code>${addr}</code>`).join(', ')}`
      : '';

    const message = `🚨 <b>NOWY RAPORT ChainAbuse!</b>

📋 <b>Typ:</b> ${report.title}
👤 <b>Zgłosił:</b> ${report.submittedBy}
⏰ <b>Kiedy:</b> ${report.timeAgo}
🔧 <b>Metoda:</b> ${report.method}
🎯 <b>Pewność:</b> ${report.confidence}%${addressesText}

🔗 <b>Sprawdź:</b> https://www.chainabuse.com/reports

⚡ <i>Fixed Selenium Monitor v4.0</i>`;

    await this.sendTelegramMessage(message);
  }

  public async checkForNewReports(): Promise<{ newReports: number; success: boolean; debug?: any }> {
    try {
      const currentTime = new Date();
      this.checkCount++;
      
      console.log(`🚀 Fixed Selenium Monitor check #${this.checkCount}: ${currentTime.toLocaleTimeString()}`);
      
      const currentReports = await this.fetchReportsWithSelenium();
      
      const debug = {
        checkNumber: this.checkCount,
        isInitialized: this.isInitialized,
        currentReportsCount: currentReports.length,
        knownReportsCount: this.lastReportIds.size,
        methods: currentReports.reduce((acc: any, r) => {
          acc[r.method] = (acc[r.method] || 0) + 1;
          return acc;
        }, {}),
        samples: currentReports.slice(0, 3).map(r => ({
          title: r.title,
          submittedBy: r.submittedBy,
          method: r.method,
          confidence: r.confidence
        }))
      };

      if (!this.isInitialized) {
        console.log(`📋 First run - saving ${currentReports.length} reports as baseline`);
        
        for (const report of currentReports) {
          this.lastReportIds.add(report.id);
        }
        
        this.isInitialized = true;
        
        await this.sendTelegramMessage(
          `🔍 <b>Fixed Selenium Monitor v4.0 uruchomiony!</b>

📊 <b>Stan bazowy:</b>
• Znalezionych raportów: ${currentReports.length}
• Użyte metody: ${Object.keys(debug.methods).join(', ') || 'Brak'}

🔧 <b>Funkcje:</b>
• Chrome WebDriver z JavaScript rendering
• 4 metody wykrywania (JS → Elements → Text → Debug)
• Pattern matching dla różnych formatów
• Pełna analiza debug

🔄 <b>Monitoring aktywny</b>

⚡ <i>Fixed Selenium Monitor v4.0</i>`
        );
        
        return { newReports: 0, success: true, debug };
      }

      const newReports: ChainAbuseReport[] = [];
      
      for (const report of currentReports) {
        if (!this.lastReportIds.has(report.id)) {
          newReports.push(report);
          this.lastReportIds.add(report.id);
        }
      }

      console.log(`🔍 Found ${newReports.length} new reports`);

      for (const report of newReports) {
        await this.sendNewReportAlert(report);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return { 
        newReports: newReports.length, 
        success: true, 
        debug: {
          ...debug,
          newReportsDetails: newReports.map(r => ({
            title: r.title,
            method: r.method,
            confidence: r.confidence
          }))
        }
      };

    } catch (error: any) {
      console.error('💥 Fixed Selenium Monitor error:', error);
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

  public async cleanup(): Promise<void> {
    if (this.driver) {
      try {
        await this.driver.quit();
        this.driver = null;
        console.log('✅ WebDriver closed');
      } catch (error) {
        console.error('⚠️ Error closing WebDriver:', error);
      }
    }
  }
}

// Globalna instancja
let monitor: FixedSeleniumMonitor | null = null;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Brak konfiguracji Telegram',
        success: false,
        newReports: 0
      }, { status: 500 });
    }

    if (!monitor) {
      console.log('🔧 Inicjalizacja Fixed Selenium Monitor...');
      monitor = new FixedSeleniumMonitor();
    }

    const result = await monitor.checkForNewReports();
    
    return NextResponse.json({
      success: result.success,
      newReports: result.newReports,
      timestamp: new Date().toISOString(),
      debug: result.debug
    });

  } catch (error: any) {
    console.error('💥 API Error:', error);
    return NextResponse.json({ 
      error: 'Błąd wewnętrzny serwera',
      message: error.message,
      success: false,
      newReports: 0,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Fixed Selenium Monitor v4.0',
    timestamp: new Date().toISOString(),
    version: 'fixed-selenium-v4.0',
    features: [
      'Chrome WebDriver without TypeScript errors',
      'JavaScript rendering and content extraction',
      '4-method detection system',
      'Advanced pattern matching',
      'Full debug analysis',
      'Clean TypeScript implementation'
    ]
  });
}