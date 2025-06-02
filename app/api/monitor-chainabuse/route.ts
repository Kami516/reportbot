// app/api/monitor-chainabuse/route.ts - Fixed for Real Reports
import { NextRequest, NextResponse } from 'next/server';
import { parseProxyConfig, fetchWithProxy } from '../../../utils/proxy';

interface Report {
  id: string;
  timestamp: string;
  url: string;
  content: any;
  source: string;
  reportType?: string;
  submittedBy?: string;
  timeAgo?: string;
}

class FixedRealMonitor {
  private telegramBotToken: string;
  private telegramChatId: string;
  private lastReportIds: Set<string> = new Set();
  private lastCheckTimestamp: number = 0;
  private proxyConfig: any;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID!;
    
    if (process.env.PROXY_CONFIG) {
      this.proxyConfig = parseProxyConfig(process.env.PROXY_CONFIG);
    }
  }

  private async fetchPageWithCacheBusting(): Promise<{ reports: Report[], debug: any }> {
    const debug: any = {
      attempts: [],
      totalReports: 0,
      method: '',
      cacheBypass: true,
      patterns: {
        reportCards: 0,
        reportClasses: 0,
        structureReports: 0,
        submissions: 0,
        bitcoinAddresses: 0,
        ethereumAddresses: 0,
        nextjsReports: 0
      }
    };

    const reports: Report[] = [];

    // Cache-busting URLs
    const urlsToTry = [
      `https://www.chainabuse.com/reports?page=0&sort=newest&_t=${Date.now()}`,
      `https://www.chainabuse.com/reports?page=0&sort=newest&cache=${Math.random()}`,
      `https://www.chainabuse.com/reports?sort=newest&refresh=${Date.now()}`
    ];

    for (let i = 0; i < urlsToTry.length; i++) {
      const url = urlsToTry[i];
      
      try {
        console.log(`🔄 Cache-busting attempt ${i + 1}: ${url.substring(0, 80)}...`);
        
        const headers: any = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin'
        };

        const response = await fetchWithProxy(url, { headers }, this.proxyConfig);
        
        debug.attempts.push({
          url: url.substring(0, 80),
          status: response.status,
          success: response.ok,
          contentLength: 0
        });

        if (response.ok) {
          const content = await response.text();
          debug.attempts[debug.attempts.length - 1].contentLength = content.length;
          
          console.log(`✅ Response received: ${content.length} chars`);
          
          const foundReports = this.extractAllReportTypes(content, `attempt_${i + 1}`, debug);
          
          if (foundReports.length > 0) {
            console.log(`📊 Found ${foundReports.length} reports`);
            reports.push(...foundReports);
            debug.method = `cache_bust_${i + 1}`;
            break;
          } else {
            console.log(`❌ No reports found in attempt ${i + 1}`);
          }
        } else {
          console.log(`❌ HTTP error ${response.status} in attempt ${i + 1}`);
        }

        if (i < urlsToTry.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error: any) {
        console.log(`💥 Attempt ${i + 1} failed:`, error.message);
        debug.attempts.push({
          url: url.substring(0, 80),
          error: error.message
        });
      }
    }

    const uniqueReports = this.removeDuplicates(reports);
    uniqueReports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    debug.totalReports = uniqueReports.length;
    return { reports: uniqueReports, debug };
  }

  private extractAllReportTypes(html: string, source: string, debug: any): Report[] {
    const reports: Report[] = [];

    console.log(`🔍 Extracting reports using CSS structure analysis (${html.length} chars)...`);

    try {
      // Method 1: Look for ScamReportCard divs (main method)
      console.log('📋 Looking for create-ScamReportCard structures...');
      const reportCardPattern = /<div[^>]*class="[^"]*create-ScamReportCard[^"]*"[^>]*>[\s\S]*?<\/div>/g;
      const reportCards = html.match(reportCardPattern) || [];
      
      debug.patterns.reportCards = reportCards.length;
      console.log(`Found ${reportCards.length} ScamReportCard divs`);

      // Extract data from each report card
      let cardCount = 0;
      for (const card of reportCards) {
        cardCount++;
        const cardData = this.parseReportCard(card, cardCount, source);
        if (cardData) {
          reports.push(cardData);
        }
      }

      // Method 2: Look for any divs with report-related classes
      console.log('🎯 Looking for report-related CSS classes...');
      const reportClassPatterns = [
        /class="[^"]*[Rr]eport[^"]*"/g,
        /class="[^"]*[Ss]cam[^"]*"/g,
        /class="[^"]*[Aa]ddress[^"]*"/g,
        /class="[^"]*[Dd]omain[^"]*"/g
      ];

      let classCount = 0;
      reportClassPatterns.forEach(pattern => {
        const matches = html.match(pattern) || [];
        classCount += matches.length;
      });
      debug.patterns.reportClasses = classCount;
      console.log(`Found ${classCount} report-related CSS classes`);

      // Method 3: Extract data from CSS-based structure
      console.log('🏗️ Parsing CSS-based report structure...');
      const structureReports = this.parseCSSStructure(html, source);
      reports.push(...structureReports);
      debug.patterns.structureReports = structureReports.length;

      // Method 4: Look for "Submitted by" with time patterns (still valid)
      console.log('⏰ Looking for submission time patterns...');
      const submissionPattern = /Submitted by\s+([^<\n]+?)\s+(\d+\s+(?:minutes?|hours?|days?)\s+ago)/gi;
      let submissionMatch;
      let submissionCount = 0;
      
      while ((submissionMatch = submissionPattern.exec(html)) !== null) {
        submissionCount++;
        const submittedBy = submissionMatch[1].trim();
        const timeAgo = submissionMatch[2].trim();
        
        // Get context around this submission
        const contextStart = Math.max(0, submissionMatch.index - 3000);
        const contextEnd = Math.min(html.length, submissionMatch.index + 3000);
        const context = html.substring(contextStart, contextEnd);
        
        // Look for any crypto addresses or domains in context
        const contextData = this.extractFromContext(context, submittedBy, timeAgo, submissionCount, source);
        if (contextData) {
          reports.push(contextData);
        }
      }
      
      debug.patterns.submissions = submissionCount;
      console.log(`Found ${submissionCount} submission patterns`);

      // Method 5: Fallback - look for crypto addresses anywhere
      console.log('💰 Fallback: looking for crypto addresses...');
      
      // Bitcoin addresses
      const bitcoinPattern = /\b(bc1|[13])[a-zA-Z0-9]{25,62}\b/g;
      const bitcoinMatches = html.match(bitcoinPattern) || [];
      debug.patterns.bitcoinAddresses = bitcoinMatches.length;
      
      for (const address of bitcoinMatches) {
        reports.push({
          id: `btc_${address}`,
          timestamp: new Date().toISOString(),
          url: `https://www.chainabuse.com/reports/${address}`,
          content: { address, type: 'bitcoin' },
          source: `${source}_bitcoin_fallback`,
          reportType: 'Bitcoin Address (Fallback)'
        });
      }

      // Ethereum addresses  
      const ethereumPattern = /\b0x[a-fA-F0-9]{40}\b/g;
      const ethereumMatches = html.match(ethereumPattern) || [];
      debug.patterns.ethereumAddresses = ethereumMatches.length;
      
      for (const address of ethereumMatches) {
        reports.push({
          id: `eth_${address}`,
          timestamp: new Date().toISOString(),
          url: `https://www.chainabuse.com/reports/${address}`,
          content: { address, type: 'ethereum' },
          source: `${source}_ethereum_fallback`,
          reportType: 'Ethereum Address (Fallback)'
        });
      }

      // Method 6: Try Next.js data extraction
      console.log('⚛️ Looking for Next.js data...');
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const nextReports = this.searchForReportsInData(nextData, `${source}_nextjs`);
          reports.push(...nextReports);
          debug.patterns.nextjsReports = nextReports.length;
          console.log(`Found ${nextReports.length} reports in Next.js data`);
        } catch (e) {
          console.log('❌ Failed to parse Next.js data');
        }
      }

    } catch (error) {
      console.error('Error extracting reports:', error);
    }

    console.log(`📊 Total extracted: ${reports.length} reports`);
    return reports;
  }

  private parseReportCard(cardHtml: string, cardIndex: number, source: string): Report | null {
    try {
      // Extract any text content from the card
      const textContent = cardHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Look for crypto addresses in the card
      const bitcoinMatch = textContent.match(/\b(bc1|[13])[a-zA-Z0-9]{25,62}\b/);
      const ethereumMatch = textContent.match(/\b0x[a-fA-F0-9]{40}\b/);
      
      // Look for domains/URLs
      const domainMatch = textContent.match(/https?:\/\/[^\s]+/) || textContent.match(/[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}[^\s]*/);
      
      // Look for submission info
      const submissionMatch = textContent.match(/Submitted by\s+([^0-9]+?)\s+(\d+\s+(?:minutes?|hours?|days?)\s+ago)/i);
      
      let reportedValue = null;
      let reportType = 'Unknown';
      
      if (bitcoinMatch) {
        reportedValue = bitcoinMatch[0];
        reportType = 'Bitcoin Address';
      } else if (ethereumMatch) {
        reportedValue = ethereumMatch[0];
        reportType = 'Ethereum Address';
      } else if (domainMatch) {
        reportedValue = domainMatch[0];
        reportType = 'Domain/URL';
      }
      
      if (!reportedValue) {
        // No clear reported value found
        return null;
      }
      
      const timestamp = submissionMatch ? this.parseTimeAgo(submissionMatch[2]) : new Date().toISOString();
      const submittedBy = submissionMatch ? submissionMatch[1].trim() : 'Unknown';
      const timeAgo = submissionMatch ? submissionMatch[2] : 'Unknown';
      
      return {
        id: `card_${reportedValue}_${Date.now()}_${cardIndex}`,
        timestamp,
        url: `https://www.chainabuse.com/reports/${encodeURIComponent(reportedValue)}`,
        content: { 
          reportedValue,
          type: 'report_card',
          submittedBy,
          timeAgo,
          textContent: textContent.substring(0, 200),
          rawCard: cardHtml.substring(0, 300)
        },
        source: `${source}_card`,
        reportType,
        submittedBy,
        timeAgo
      };
      
    } catch (error) {
      console.error('Error parsing report card:', error);
      return null;
    }
  }

  private parseCSSStructure(html: string, source: string): Report[] {
    const reports: Report[] = [];
    
    try {
      // Look for divs that might contain report data
      const reportDivPattern = /<div[^>]*class="[^"]*(?:report|scam|address|domain)[^"]*"[^>]*>([^<]*)<\/div>/gi;
      let divMatch;
      let divCount = 0;
      
      while ((divMatch = reportDivPattern.exec(html)) !== null) {
        divCount++;
        const divContent = divMatch[1].trim();
        
        if (divContent && divContent.length > 5) {
          // Check if content looks like a crypto address or domain
          const isBitcoin = /\b(bc1|[13])[a-zA-Z0-9]{25,62}\b/.test(divContent);
          const isEthereum = /\b0x[a-fA-F0-9]{40}\b/.test(divContent);
          const isDomain = /^https?:\/\//.test(divContent) || /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/.test(divContent);
          
          if (isBitcoin || isEthereum || isDomain) {
            const reportType = isBitcoin ? 'Bitcoin Address' : isEthereum ? 'Ethereum Address' : 'Domain/URL';
            
            reports.push({
              id: `css_${divContent}_${divCount}`,
              timestamp: new Date().toISOString(),
              url: `https://www.chainabuse.com/reports/${encodeURIComponent(divContent)}`,
              content: { 
                reportedValue: divContent,
                type: 'css_extracted',
                className: divMatch[0].match(/class="([^"]*)"/) ? divMatch[0].match(/class="([^"]*)"/)![1] : 'unknown'
              },
              source: `${source}_css`,
              reportType: `${reportType} (CSS)`
            });
          }
        }
      }
      
    } catch (error) {
      console.error('Error parsing CSS structure:', error);
    }
    
    return reports;
  }

  private extractFromContext(context: string, submittedBy: string, timeAgo: string, index: number, source: string): Report | null {
    try {
      // Remove HTML tags to get plain text
      const textContent = context.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Look for crypto addresses
      const bitcoinMatch = textContent.match(/\b(bc1|[13])[a-zA-Z0-9]{25,62}\b/);
      const ethereumMatch = textContent.match(/\b0x[a-fA-F0-9]{40}\b/);
      const domainMatch = textContent.match(/https?:\/\/[^\s]+/) || textContent.match(/[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}[^\s]*/);
      
      let reportedValue = null;
      let reportType = 'Unknown';
      
      if (bitcoinMatch) {
        reportedValue = bitcoinMatch[0];
        reportType = 'Bitcoin Address';
      } else if (ethereumMatch) {
        reportedValue = ethereumMatch[0];
        reportType = 'Ethereum Address';  
      } else if (domainMatch) {
        reportedValue = domainMatch[0];
        reportType = 'Domain/URL';
      }
      
      if (!reportedValue) return null;
      
      return {
        id: `context_${reportedValue}_${Date.now()}_${index}`,
        timestamp: this.parseTimeAgo(timeAgo),
        url: `https://www.chainabuse.com/reports/${encodeURIComponent(reportedValue)}`,
        content: { 
          reportedValue,
          type: 'context_extracted',
          submittedBy,
          timeAgo,
          context: textContent.substring(0, 200)
        },
        source: `${source}_context`,
        reportType: `${reportType} (Context)`,
        submittedBy,
        timeAgo
      };
      
    } catch (error) {
      console.error('Error extracting from context:', error);
      return null;
    }
  }

  private parseTimeAgo(timeAgo: string): string {
    try {
      const now = new Date();
      const match = timeAgo.match(/(\d+)\s+(minutes?|hours?|days?)/i);
      
      if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        if (unit.startsWith('minute')) {
          now.setMinutes(now.getMinutes() - amount);
        } else if (unit.startsWith('hour')) {
          now.setHours(now.getHours() - amount);
        } else if (unit.startsWith('day')) {
          now.setDate(now.getDate() - amount);
        }
      }
      
      return now.toISOString();
    } catch (error) {
      return new Date().toISOString();
    }
  }

  private searchForReportsInData(data: any, source: string): Report[] {
    const reports: Report[] = [];
    
    try {
      this.deepSearch(data, reports, source, 0);
    } catch (error) {
      console.error('Error in deep search:', error);
    }

    return reports;
  }

  private deepSearch(obj: any, reports: Report[], source: string, depth: number): void {
    if (depth > 3 || !obj || typeof obj !== 'object') return;

    try {
      if (Array.isArray(obj)) {
        for (let i = 0; i < Math.min(obj.length, 15); i++) {
          const item = obj[i];
          if (this.looksLikeReport(item)) {
            const report = this.createReportFromObject(item, source);
            if (report) reports.push(report);
          } else {
            this.deepSearch(item, reports, source, depth + 1);
          }
        }
      } else {
        const keys = Object.keys(obj);
        for (const key of keys.slice(0, 15)) {
          if (!key.startsWith('_') && key !== 'router') {
            this.deepSearch(obj[key], reports, source, depth + 1);
          }
        }
      }
    } catch (error) {
      // Continue searching
    }
  }

  private looksLikeReport(item: any): boolean {
    if (!item || typeof item !== 'object') return false;

    const itemStr = JSON.stringify(item);
    const keys = Object.keys(item).map(k => k.toLowerCase());
    
    // Check for crypto addresses
    const hasAddress = /\b(bc1|1|3)[a-zA-Z0-9]{25,62}\b/.test(itemStr) || 
                      /\b0x[a-fA-F0-9]{40}\b/.test(itemStr) ||
                      /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/.test(itemStr);
    
    // Check for report-related keywords
    const reportKeywords = ['id', 'address', 'scam', 'report', 'fraud', 'coin', 'wallet', 'description', 'submitted'];
    const hasReportKeyword = reportKeywords.some(keyword => 
      keys.some(key => key.includes(keyword)) || itemStr.toLowerCase().includes(keyword)
    );

    return hasAddress || (hasReportKeyword && keys.length > 2);
  }

  private createReportFromObject(obj: any, source: string): Report | null {
    try {
      let id = obj.id || obj._id || obj.reportId;
      
      if (!id) {
        const objStr = JSON.stringify(obj);
        // Try different address patterns
        const addressPatterns = [
          /\b(bc1|1|3)[a-zA-Z0-9]{25,62}\b/,
          /\b0x[a-fA-F0-9]{40}\b/,
          /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/
        ];
        
        for (const pattern of addressPatterns) {
          const match = objStr.match(pattern);
          if (match) {
            id = match[0];
            break;
          }
        }
      }

      if (!id) return null;

      return {
        id: String(id),
        timestamp: obj.createdAt || obj.created_at || obj.timestamp || new Date().toISOString(),
        url: `https://www.chainabuse.com/reports/${id}`,
        content: obj,
        source,
        reportType: obj.type || 'Unknown',
        submittedBy: obj.submittedBy || obj.reporter,
        timeAgo: obj.timeAgo
      };
    } catch (error) {
      return null;
    }
  }

  private removeDuplicates(reports: Report[]): Report[] {
    const seen = new Set<string>();
    const unique: Report[] = [];

    for (const report of reports) {
      const key = report.id.split('_')[0]; // Remove timestamp suffix for deduplication
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(report);
      }
    }

    return unique;
  }

  private async sendTelegramMessage(message: string): Promise<void> {
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
      throw new Error(`Telegram API error: ${JSON.stringify(errorData)}`);
    }
  }

  private formatReportMessage(report: Report): string {
    const content = report.content || {};
    const currentTime = new Date();
    const timeSinceLastCheck = this.lastCheckTimestamp > 0 
      ? Math.round((Date.now() - this.lastCheckTimestamp) / 1000)
      : 0;

    let addressDisplay = '';
    if (content.reportedAddress) {
      addressDisplay = `<b>Reported Address:</b> <code>${content.reportedAddress}</code>\n`;
    } else if (content.reportedDomain) {
      addressDisplay = `<b>Reported Domain:</b> ${content.reportedDomain}\n`;
    } else if (content.address) {
      if (content.type === 'bitcoin') {
        addressDisplay = `<b>Bitcoin Address:</b> <code>${content.address}</code>\n`;
      } else if (content.type === 'ethereum') {
        addressDisplay = `<b>Ethereum Address:</b> <code>${content.address}</code>\n`;
      } else if (content.type === 'solana') {
        addressDisplay = `<b>Solana Address:</b> <code>${content.address}</code>\n`;
      } else {
        addressDisplay = `<b>Address:</b> <code>${content.address}</code>\n`;
      }
    }

    return `
🚨 <b>NOWY RAPORT ChainAbuse!</b>

<b>ID:</b> ${report.id}
<b>Typ:</b> ${report.reportType || 'Report'}
<b>Źródło:</b> ${report.source}
<b>Wykryto:</b> ${currentTime.toLocaleString('pl-PL')}
${addressDisplay}${report.submittedBy ? `<b>Zgłoszone przez:</b> ${report.submittedBy}\n` : ''}${report.timeAgo ? `<b>Czas zgłoszenia:</b> ${report.timeAgo}\n` : ''}${timeSinceLastCheck > 0 ? `<b>Czas od ostatniego sprawdzenia:</b> ${timeSinceLastCheck}s\n` : ''}

${content.title ? `<b>Tytuł:</b> ${content.title}\n` : ''}${content.coin ? `<b>Moneta:</b> ${content.coin}\n` : ''}${content.category ? `<b>Kategoria:</b> ${content.category}\n` : ''}

<b>Link:</b> ${report.url}

🔄 <i>Monitor wykrywa: Bitcoin, Ethereum, UUID i inne adresy</i>
    `.trim();
  }

  public async checkForNewReports(): Promise<{ newReports: number; success: boolean; debug?: any }> {
    try {
      const currentTime = Date.now();
      console.log(`🚀 Enhanced check started at ${new Date().toLocaleTimeString('pl-PL')}`);
      
      if (this.lastCheckTimestamp > 0) {
        const timeSinceLastCheck = Math.round((currentTime - this.lastCheckTimestamp) / 1000);
        console.log(`⏱️ Time since last check: ${timeSinceLastCheck}s`);
      }
      
      const { reports, debug } = await this.fetchPageWithCacheBusting();
      
      if (reports.length === 0) {
        console.log('❌ No reports found');
        return { newReports: 0, success: false, debug };
      }

      console.log(`📊 Found ${reports.length} total reports`);
      console.log(`Pattern breakdown:`, debug.patterns);

      // Filter new reports
      const newReports = reports.filter(report => {
        const baseId = report.id.split('_')[0]; // Remove timestamp suffix
        return !this.lastReportIds.has(baseId);
      });
      
      console.log(`🔍 ${newReports.length} reports not seen before`);

      // First run - initialize
      if (this.lastReportIds.size === 0) {
        reports.forEach(r => {
          const baseId = r.id.split('_')[0];
          this.lastReportIds.add(baseId);
        });
        this.lastCheckTimestamp = currentTime;
        
        console.log(`🎯 First run - stored ${reports.length} report IDs`);
        
        await this.sendTelegramMessage(
          `🔍 <b>CSS-Based ChainAbuse Monitor Uruchomiony!</b>\n\nZnaleziono ${reports.length} istniejących raportów:\n• ScamReportCard divs: ${debug.patterns.reportCards}\n• Report CSS classes: ${debug.patterns.reportClasses}\n• Structure reports: ${debug.patterns.structureReports}\n• Submission patterns: ${debug.patterns.submissions}\n• Bitcoin fallback: ${debug.patterns.bitcoinAddresses}\n• Ethereum fallback: ${debug.patterns.ethereumAddresses}\n\nTeraz monitoruję CSS-based report structure!\n\n🏗️ <i>Focus: create-ScamReportCard divs + CSS classes</i>`
        );
        
        return { newReports: 0, success: true, debug };
      }

      if (newReports.length > 0) {
        console.log(`🚨 ZNALEZIONO ${newReports.length} NOWYCH RAPORTÓW!`);
        
        // Sort by timestamp (newest first, but send oldest first)
        newReports.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        for (const report of newReports) {
          console.log(`📤 Sending notification for: ${report.id} (${report.reportType})`);
          const message = this.formatReportMessage(report);
          await this.sendTelegramMessage(message);
          
          const baseId = report.id.split('_')[0];
          this.lastReportIds.add(baseId);
          
          // Delay between messages
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        console.log('ℹ️ No new reports (all were seen before)');
      }

      this.lastCheckTimestamp = currentTime;
      
      // Cleanup old IDs (keep last 1000)
      if (this.lastReportIds.size > 1000) {
        const idsArray = Array.from(this.lastReportIds);
        this.lastReportIds = new Set(idsArray.slice(-500));
      }

      return { newReports: newReports.length, success: true, debug };

    } catch (error: any) {
      console.error('💥 Enhanced check error:', error);
      return { newReports: 0, success: false, debug: { error: error?.message } };
    }
  }
}

// Global instance
let monitor: FixedRealMonitor | null = null;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Missing Telegram configuration',
        success: false,
        newReports: 0
      }, { status: 500 });
    }

    if (!monitor) {
      console.log('🔧 Initializing Fixed Real Monitor...');
      monitor = new FixedRealMonitor();
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
      error: 'Internal server error',
      message: error?.message,
      success: false,
      newReports: 0,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Fixed Real ChainAbuse Monitor API',
    timestamp: new Date().toISOString(),
    version: 'fixed-real-v1',
    features: [
      'Bitcoin address detection', 
      'Ethereum address detection',
      'UUID pattern detection',
      'Report card parsing with timestamps',
      'Time-based filtering',
      'Enhanced cache-busting'
    ]
  });
}