// app/api/monitor-chainabuse/route.ts - Minimal Category Fix
import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser } from 'puppeteer';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface ReportSnapshot {
  id: string;
  preview: string;
  author: string;
  timeAgo: string;
  timestamp: number;
  position: number;
  contentHash: string;
}

interface ReportData {
  textContent: string;
  innerHTML: string;
  position: number;
  category: string; // Add category extraction
}

class FixedPuppeteerMonitor {
  private telegramBotToken: string;
  private telegramChatId: string;
  private lastReports: ReportSnapshot[] = [];
  private lastReportHashes: Set<string> = new Set();
  private sentReportHashes: Set<string> = new Set();
  private monitorStartTime: number = 0;
  private checkCount: number = 0;
  private proxyConfig: any;
  private sentReportsFile: string;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID!;
    this.sentReportsFile = join(process.cwd(), 'sent-reports.json');
    
    if (process.env.PROXY_CONFIG) {
      const [host, port, username, password] = process.env.PROXY_CONFIG.split(':');
      this.proxyConfig = { host, port: parseInt(port), username, password };
    }

    // Load previously sent reports from file
    this.loadSentReports();
  }

  private loadSentReports(): void {
    try {
      if (existsSync(this.sentReportsFile)) {
        const data = readFileSync(this.sentReportsFile, 'utf8');
        const savedData = JSON.parse(data);
        
        if (savedData.sentHashes && Array.isArray(savedData.sentHashes)) {
          this.sentReportHashes = new Set(savedData.sentHashes);
          console.log(`📂 Loaded ${this.sentReportHashes.size} previously sent report hashes from file`);
        }
      } else {
        console.log(`📂 No previous sent reports file found - starting fresh`);
      }
    } catch (error) {
      console.error('❌ Error loading sent reports file:', error);
      this.sentReportHashes = new Set();
    }
  }

  private saveSentReports(): void {
    try {
      const dataToSave = {
        sentHashes: Array.from(this.sentReportHashes),
        lastSaved: new Date().toISOString(),
        totalSent: this.sentReportHashes.size
      };
      
      writeFileSync(this.sentReportsFile, JSON.stringify(dataToSave, null, 2));
      console.log(`💾 Saved ${this.sentReportHashes.size} sent report hashes to file`);
    } catch (error) {
      console.error('❌ Error saving sent reports file:', error);
    }
  }

  private async launchBrowser(): Promise<Browser> {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security'
    ];

    if (this.proxyConfig) {
      args.push(`--proxy-server=http://${this.proxyConfig.host}:${this.proxyConfig.port}`);
    }

    return await puppeteer.launch({
      headless: true,
      args,
      defaultViewport: { width: 1920, height: 1080 }
    });
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

  private createContentHash(text: string): string {
    let cleanText = text
      .replace(/\d+\s+(seconds?|minutes?|hours?|days?)\s+ago/gi, 'TIME_AGO')
      .replace(/ago1Reported/gi, 'ago Reported')
      .replace(/(\w)1Reported/gi, '$1 Reported')
      .replace(/Domainpancakeswap/gi, 'Domain pancakeswap')
      .replace(/Domain([a-z])/gi, 'Domain $1')
      .replace(/Submitted by\s+([^\d\n•]+?)(?:\s+\d+.*)?$/gi, 'Submitted by $1')
      .replace(/\s+/g, ' ')
      .trim();
    
    let hash = 0;
    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private createReportSnapshot(reportData: ReportData, position: number): ReportSnapshot {
    const textContent = reportData.textContent || '';
    const category = reportData.category || '';
    
    // Clean up text - add spaces between concatenated elements
    const cleanedText = textContent
      .replace(/(\d+)\s+(seconds?|minutes?|hours?|days?)\s+ago1Reported/gi, '$1 $2 ago Reported')
      .replace(/ago1Reported/gi, 'ago Reported')
      .replace(/Submitted by([^\s])/gi, 'Submitted by $1')
      .replace(/(\w)1Reported/gi, '$1 Reported')
      .replace(/Domainpancakeswap/gi, 'Domain pancakeswap')
      .replace(/Domain([a-z])/gi, 'Domain $1')
      .replace(/(\w)(\d+)\s+(seconds?|minutes?|hours?|days?)\s+ago/gi, '$1 $2 $3 ago')
      .replace(/\s+/g, ' ')
      .trim();
    
    const timeMatch = cleanedText.match(/(\d+)\s+(seconds?|minutes?|hours?|days?)\s+ago/i);
    const timeAgo = timeMatch ? timeMatch[0] : `pos_${position}`;
    
    const authorMatch = cleanedText.match(/Submitted by\s+([^\d\n•]+?)(?:\s+\d+|$)/i);
    let author = 'unknown';
    if (authorMatch) {
      author = authorMatch[1]
        .replace(/\s+(seconds?|minutes?|hours?|days?)\s+ago.*$/i, '')
        .replace(/\s+Reported.*$/i, '')
        .trim();
    }
    
    if (author === 'unknown') {
      const altAuthorMatch = cleanedText.match(/^([A-Za-z][A-Za-z0-9_]*)\s+\d+\s+(seconds?|minutes?|hours?|days?)\s+ago/i);
      if (altAuthorMatch) {
        author = altAuthorMatch[1];
      }
    }
    
    const lines = cleanedText.split('\n').filter((line: string) => line.trim().length > 10);
    const contentLines = lines.filter((line: string) => {
      const trimmed = line.trim();
      return !trimmed.match(/^Submitted by/i) && 
             !trimmed.match(/^\d+\s+(seconds?|minutes?|hours?|days?)\s+ago/i) &&
             !trimmed.match(/^Vote/i) &&
             !trimmed.match(/^Comments/i) &&
             !trimmed.match(/^Other:/i) &&
             !trimmed.match(/^Reported Domain/i) &&
             trimmed.length > 20;
    });
    
    let preview = '';
    if (contentLines.length > 0) {
      preview = contentLines[0];
    } else if (lines.length > 0) {
      preview = lines.find(line => line.trim().length > 30) || lines[0];
    } else {
      preview = `Report at position ${position}`;
    }
    
    // ONLY CHANGE: Format category with dot and space at the beginning
    if (category && category.trim()) {
      preview = `${category.trim()}. ${preview.replace(/^(Other:|Phishing|Scam)\s*/i, '').trim()}`;
    }
    
    const contentHash = this.createContentHash(preview + author);
    const id = `${contentHash}_${position}`;
    
    return {
      id,
      preview: preview.substring(0, 300),
      author,
      timeAgo,
      timestamp: Date.now(),
      position,
      contentHash
    };
  }

  private parseTimeToMinutes(timeAgo: string): number {
    // Handle edge cases for parsing time
    if (!timeAgo || timeAgo.includes('pos_')) return 999999; // Position-based fallback
    
    const match = timeAgo.match(/(\d+)\s+(seconds?|minutes?|hours?|days?)/i);
    if (!match) {
      console.log(`⚠️ Could not parse time: "${timeAgo}"`);
      return 999999; // If we can't parse, treat as very old
    }
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    let minutes = 999999;
    if (unit.startsWith('second')) minutes = Math.max(0, Math.floor(value / 60));
    if (unit.startsWith('minute')) minutes = value;
    if (unit.startsWith('hour')) minutes = value * 60;
    if (unit.startsWith('day')) minutes = value * 24 * 60;
    
    console.log(`⏱️ Parsed "${timeAgo}" as ${minutes} minutes`);
    return minutes;
  }

  public async checkForNewReports(): Promise<{ newReports: number; success: boolean; debug?: any }> {
    let browser: Browser | null = null;
    
    try {
      const currentTime = new Date();
      this.checkCount++;
      
      console.log(`🚀 Fixed Monitor check #${this.checkCount}: ${currentTime.toLocaleTimeString('pl-PL')}`);
      
      browser = await this.launchBrowser();
      const page = await browser.newPage();

      if (this.proxyConfig?.username) {
        await page.authenticate({
          username: this.proxyConfig.username,
          password: this.proxyConfig.password
        });
      }

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const url = `https://www.chainabuse.com/reports?sort=newest&_t=${Date.now()}`;
      console.log(`🔄 Loading: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      await page.waitForSelector('.create-ScamReportCard', { timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // ONLY CHANGE: Extract category from create-ScamReportCard__category-section
      const reportsData = await page.evaluate((): ReportData[] => {
        const reportElements = Array.from(document.querySelectorAll('.create-ScamReportCard'));
        console.log(`Found ${reportElements.length} ScamReportCard elements`);
        
        return reportElements.map((element, index) => {
          // Extract category from the category section div
          const categoryElement = element.querySelector('.create-ScamReportCard__category-section');
          const category = categoryElement ? categoryElement.textContent?.trim() || '' : '';
          
          return {
            textContent: element.textContent || '',
            innerHTML: element.innerHTML.substring(0, 500),
            position: index,
            category: category
          };
        });
      });

      console.log(`📊 Extracted ${reportsData.length} reports`);

      const currentReports = reportsData.map((data, index) => 
        this.createReportSnapshot(data, index)
      );

      const currentHashes = new Set(currentReports.map(r => r.contentHash));

      const debug = {
        checkNumber: this.checkCount,
        timestamp: currentTime.toISOString(),
        reportsFound: currentReports.length,
        previousReports: this.lastReports.length,
        previousHashes: this.lastReportHashes.size,
        currentHashes: currentHashes.size,
        sentHashes: this.sentReportHashes.size,
        url,
        sampleReports: currentReports.slice(0, 2).map(r => ({
          id: r.id,
          contentHash: r.contentHash,
          timeAgo: r.timeAgo,
          author: r.author,
          preview: r.preview.substring(0, 100)
        })),
        samplePreviousHashes: Array.from(this.lastReportHashes).slice(0, 3),
        sampleCurrentHashes: Array.from(currentHashes).slice(0, 3)
      };

      // First run - establish baseline
      if (this.checkCount === 1) {
        this.monitorStartTime = Date.now(); // Record when monitoring started
        this.lastReports = currentReports;
        this.lastReportHashes = currentHashes;
        
        // IMPORTANT: Mark ALL current reports as already seen/sent to prevent sending old reports
        currentReports.forEach(report => {
          this.sentReportHashes.add(report.contentHash);
        });
        
        // Save the baseline to file
        this.saveSentReports();
        
        console.log(`📥 Baseline established: ${currentReports.length} reports, ${currentHashes.size} unique hashes`);
        console.log(`🔒 Marked ${currentReports.length} existing reports as already processed`);
        console.log(`⏰ Monitor start time: ${new Date(this.monitorStartTime).toLocaleString('en-US')}`);
        
        await this.sendTelegramMessage(
          `🚀 <b>ChainAbuse Monitor Started</b>\n\n` +
          `⏰ <b>Started:</b> ${currentTime.toLocaleString('en-US')}\n\n` +
          // `📊 <b>Baseline:</b> ${currentReports.length} existing reports marked as processed\n` +
          // `💾 <b>Persistent storage:</b> ${this.sentReportHashes.size} total tracked reports\n\n` +
          `🔍 <b>Latest report preview:</b>\n` +
          `${currentReports[0] ? `⏰ ${currentReports[0].timeAgo}\n📝 ${currentReports[0].preview.substring(0, 100)}...` : 'No reports found'}\n\n` +
          `📡 <b>Monitoring for NEW reports only...</b>`
        );

        return { newReports: 0, success: true, debug };
      }

      const newReports: ReportSnapshot[] = [];
      
      console.log(`🔍 Comparing hashes: ${currentHashes.size} current vs ${this.lastReportHashes.size} previous`);
      
      currentReports.forEach(currentReport => {
        // Check if this content hash existed before AND wasn't already sent
        if (!this.lastReportHashes.has(currentReport.contentHash) && 
            !this.sentReportHashes.has(currentReport.contentHash)) {
          
          const timeAgoText = currentReport.timeAgo.toLowerCase();
          
          // ULTRA STRICT: Only accept reports that are literally just published
          const isVeryFresh = (
            timeAgoText.includes('0 minutes ago') ||
            timeAgoText.includes('few seconds ago') ||
            timeAgoText.includes('just now') ||
            (timeAgoText.includes('seconds ago') && !timeAgoText.match(/[5-9]\d+\s+seconds/)) // Less than 50 seconds
          );
          
          console.log(`🔍 Checking report: "${currentReport.timeAgo}" - isVeryFresh: ${isVeryFresh}`);
          
          if (isVeryFresh) {
            console.log(`🆕 ULTRA FRESH REPORT ACCEPTED: ${currentReport.timeAgo}, hash=${currentReport.contentHash.substring(0, 8)}`);
            newReports.push(currentReport);
          } else {
            console.log(`⏰ Report REJECTED (not fresh enough): "${currentReport.timeAgo}" - marking as seen`);
            // Mark rejected reports as seen to prevent future sending
            this.sentReportHashes.add(currentReport.contentHash);
          }
        } else if (this.sentReportHashes.has(currentReport.contentHash)) {
          console.log(`🔄 Already sent report skipped: hash=${currentReport.contentHash.substring(0, 8)}...`);
        } else if (this.lastReportHashes.has(currentReport.contentHash)) {
          console.log(`👁️ Known report (from previous check): hash=${currentReport.contentHash.substring(0, 8)}...`);
        }
      });

      this.lastReports = currentReports;
      this.lastReportHashes = currentHashes;

      console.log(`✅ Detection completed: ${newReports.length} truly new reports found`);

      for (const newReport of newReports) {
        await this.sendTelegramMessage(
          `🚨 <b>NEW CHAINABUSE REPORT DETECTED</b>\n\n` +
          `⏰ <b>Published:</b> ${newReport.timeAgo}\n` +
          `📝 <b>Report Content:</b>\n${newReport.preview}\n\n` +
          `🔗 <a href="https://www.chainabuse.com/reports">View on ChainAbuse</a>\n\n` +
          `📊 <b>Check #${this.checkCount}</b> • ${currentTime.toLocaleString('en-US')}`
        );
        
        // Mark as sent to prevent future duplicates
        this.sentReportHashes.add(newReport.contentHash);
        console.log(`✅ Report sent and marked: hash=${newReport.contentHash.substring(0, 8)}...`);
      }

      // Save sent reports to file for persistence
      this.saveSentReports();

      // Clean up old sent hashes periodically (keep last 2000 to prevent memory issues)
      if (this.sentReportHashes.size > 2000) {
        const sentArray = Array.from(this.sentReportHashes);
        this.sentReportHashes = new Set(sentArray.slice(-2000));
        this.saveSentReports(); // Save after cleanup
        console.log(`🧹 Cleaned sent hashes, kept last 2000`);
      }

      return { 
        newReports: newReports.length, 
        success: true, 
        debug: {
          ...debug,
          newReports: newReports.map(r => ({
            id: r.id,
            contentHash: r.contentHash,
            timeAgo: r.timeAgo,
            author: r.author,
            preview: r.preview.substring(0, 100)
          })),
          detectionMethod: 'content-hash-comparison',
          hashComparison: {
            newHashes: Array.from(currentHashes).filter(h => !this.lastReportHashes.has(h)),
            removedHashes: Array.from(this.lastReportHashes).filter(h => !currentHashes.has(h))
          }
        }
      };

    } catch (error: any) {
      console.error('💥 Fixed Monitor error:', error);
      return { 
        newReports: 0, 
        success: false, 
        debug: { 
          error: error.message, 
          checkNumber: this.checkCount,
          stack: error.stack?.substring(0, 500)
        }
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

let monitor: FixedPuppeteerMonitor | null = null;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID',
        success: false,
        newReports: 0
      }, { status: 500 });
    }

    if (!monitor) {
      console.log('🔧 Initializing Fixed Puppeteer Monitor...');
      monitor = new FixedPuppeteerMonitor();
    }

    const result = await monitor.checkForNewReports();
    
    return NextResponse.json({
      success: result.success,
      newReports: result.newReports,
      timestamp: new Date().toISOString(),
      debug: result.debug,
      method: 'fixed-puppeteer'
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
    status: 'Fixed Puppeteer ChainAbuse Monitor',
    timestamp: new Date().toISOString(),
    version: 'fixed-v1',
    features: [
      'Content hash-based detection',
      'Stable snapshot comparison', 
      'Time normalization for hashing',
      'Duplicate detection prevention',
      'Fresh report filtering (2 hours)',
      'Reliable change detection'
    ]
  });
}