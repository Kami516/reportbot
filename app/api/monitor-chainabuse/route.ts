// app/api/monitor-chainabuse/route.ts - Fixed Snapshot Logic
import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser } from 'puppeteer';

interface ReportSnapshot {
  id: string;
  preview: string;
  author: string;
  timeAgo: string;
  timestamp: number;
  position: number;
  contentHash: string; // Add content hash for better comparison
}

interface ReportData {
  textContent: string;
  innerHTML: string;
  position: number;
}

class FixedPuppeteerMonitor {
  private telegramBotToken: string;
  private telegramChatId: string;
  private lastReports: ReportSnapshot[] = [];
  private lastReportHashes: Set<string> = new Set(); // Store hashes for quick lookup
  private checkCount: number = 0;
  private proxyConfig: any;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID!;
    
    if (process.env.PROXY_CONFIG) {
      const [host, port, username, password] = process.env.PROXY_CONFIG.split(':');
      this.proxyConfig = { host, port: parseInt(port), username, password };
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
    // Create stable hash from content (ignoring dynamic elements like timestamps)
    let cleanText = text
      .replace(/\d+\s+(seconds?|minutes?|hours?|days?)\s+ago/gi, 'TIME_AGO') // Normalize time
      .replace(/ago1Reported/gi, 'ago Reported') // Fix concatenated text
      .replace(/(\w)1Reported/gi, '$1 Reported') // Fix missing spaces
      .replace(/Domainpancakeswap/gi, 'Domain pancakeswap') // Fix domain text
      .replace(/Domain([a-z])/gi, 'Domain $1') // Add space after Domain
      .replace(/Submitted by\s+([^\d\n•]+?)(?:\s+\d+.*)?$/gi, 'Submitted by $1') // Clean author
      .replace(/\s+/g, ' ') // Normalize whitespace
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
    
    // Extract time info from cleaned text
    const timeMatch = cleanedText.match(/(\d+)\s+(seconds?|minutes?|hours?|days?)\s+ago/i);
    const timeAgo = timeMatch ? timeMatch[0] : `pos_${position}`;
    
    // Extract author - look for "Submitted by [username]"
    const authorMatch = cleanedText.match(/Submitted by\s+([^\d\n•]+?)(?:\s+\d+|$)/i);
    let author = 'unknown';
    if (authorMatch) {
      author = authorMatch[1]
        .replace(/\s+(seconds?|minutes?|hours?|days?)\s+ago.*$/i, '')
        .replace(/\s+Reported.*$/i, '')
        .trim();
    }
    
    // If no "Submitted by", try to extract from pattern like "PhishFort 2 minutes ago"
    if (author === 'unknown') {
      const altAuthorMatch = cleanedText.match(/^([A-Za-z][A-Za-z0-9_]*)\s+\d+\s+(seconds?|minutes?|hours?|days?)\s+ago/i);
      if (altAuthorMatch) {
        author = altAuthorMatch[1];
      }
    }
    
    // Extract main content - skip metadata lines
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
    
    // Get the main content
    let preview = '';
    if (contentLines.length > 0) {
      preview = contentLines[0];
    } else if (lines.length > 0) {
      // Fallback to first line if no content lines found
      preview = lines.find(line => line.trim().length > 30) || lines[0];
    } else {
      preview = `Report at position ${position}`;
    }
    
    // Clean preview text
    preview = preview
      .replace(/^(Other:|Phishing|Scam)\s*/i, '')
      .replace(/\s+Reported\s+Domain.*$/i, '')
      .trim();
    
    // Create stable content hash
    const contentHash = this.createContentHash(preview + author);
    
    // Create ID from content hash + position for uniqueness
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
    const match = timeAgo.match(/(\d+)\s+(seconds?|minutes?|hours?|days?)/i);
    if (!match) return 999999;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    if (unit.startsWith('second')) return Math.max(1, Math.floor(value / 60));
    if (unit.startsWith('minute')) return value;
    if (unit.startsWith('hour')) return value * 60;
    if (unit.startsWith('day')) return value * 24 * 60;
    
    return 999999;
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

      // Wait for reports to load
      await page.waitForSelector('.create-ScamReportCard', { timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extract reports
      const reportsData = await page.evaluate((): ReportData[] => {
        const reportElements = Array.from(document.querySelectorAll('.create-ScamReportCard'));
        console.log(`Found ${reportElements.length} ScamReportCard elements`);
        
        return reportElements.map((element, index) => ({
          textContent: element.textContent || '',
          innerHTML: element.innerHTML.substring(0, 500),
          position: index
        }));
      });

      console.log(`📊 Extracted ${reportsData.length} reports`);

      // Create snapshots
      const currentReports = reportsData.map((data, index) => 
        this.createReportSnapshot(data, index)
      );

      // Create set of current content hashes for comparison
      const currentHashes = new Set(currentReports.map(r => r.contentHash));

      const debug = {
        checkNumber: this.checkCount,
        timestamp: currentTime.toISOString(),
        reportsFound: currentReports.length,
        previousReports: this.lastReports.length,
        previousHashes: this.lastReportHashes.size,
        currentHashes: currentHashes.size,
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
        this.lastReports = currentReports;
        this.lastReportHashes = currentHashes;
        
        console.log(`📥 Baseline established: ${currentReports.length} reports, ${currentHashes.size} unique hashes`);
        
        await this.sendTelegramMessage(
          `🚀 <b>ChainAbuse Monitor Started</b>\n\n` +
          // `📊 <b>Baseline:</b> ${currentReports.length} reports tracked\n` +
          `⏰ <b>Started:</b> ${currentTime.toLocaleString('en-US')}\n\n` +
          // `🔧 <b>Configuration:</b>\n` +
          // `✅ Puppeteer + Proxy enabled\n` +
          // `✅ Content-based detection\n` +
          // `✅ 30-second monitoring interval\n\n` +
          `🔍 <b>Latest report preview:</b>\n` +
          `${currentReports[0] ? `⏰ ${currentReports[0].timeAgo}\n📝 ${currentReports[0].preview.substring(0, 100)}...` : 'No reports found'}\n\n` +
          `📡 <b>Monitoring for new reports...</b>`
        );

        return { newReports: 0, success: true, debug };
      }

      // Detect NEW reports using content hash comparison
      const newReports: ReportSnapshot[] = [];
      
      console.log(`🔍 Comparing hashes: ${currentHashes.size} current vs ${this.lastReportHashes.size} previous`);
      
      currentReports.forEach(currentReport => {
        // Check if this content hash existed before
        if (!this.lastReportHashes.has(currentReport.contentHash)) {
          // This is new content!
          const minutesAgo = this.parseTimeToMinutes(currentReport.timeAgo);
          
          // Only consider truly fresh reports (last 2 hours)
          if (minutesAgo <= 120) {
            console.log(`🆕 NEW REPORT: hash=${currentReport.contentHash}, time=${currentReport.timeAgo}, author=${currentReport.author}`);
            newReports.push(currentReport);
          } else {
            console.log(`⏰ Old report ignored: ${currentReport.timeAgo} (${minutesAgo} minutes ago)`);
          }
        }
      });

      // Update stored data
      this.lastReports = currentReports;
      this.lastReportHashes = currentHashes;

      console.log(`✅ Detection completed: ${newReports.length} truly new reports found`);

      // Send notifications ONLY for genuinely new reports
      for (const newReport of newReports) {
        await this.sendTelegramMessage(
          `🚨 <b>NEW CHAINABUSE REPORT DETECTED</b>\n\n` +
          `⏰ <b>Published:</b> ${newReport.timeAgo}\n` +
          // `👤 <b>Reporter:</b> ${newReport.author}\n\n` +
          `📝 <b>Report Content:</b>\n${newReport.preview}\n\n` +
          `🔗 <a href="https://www.chainabuse.com/reports">View on ChainAbuse</a>\n\n` +
          `📊 <b>Check #${this.checkCount}</b> • ${currentTime.toLocaleString('en-US')}`
        );
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

// Global instance
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