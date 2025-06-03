// app/api/monitor-chainabuse/route.ts - Clean Report Content Version
import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser, Page } from 'puppeteer';
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
  reportUrl: string;
  reportId?: string;
}

interface ReportData {
  textContent: string;
  innerHTML: string;
  position: number;
  category: string;
  reportUrl: string;
  reportId: string;
  clickSuccess: boolean;
  navigationUrl: string;
}

class CleanReportMonitor {
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

  // Detect scam category based on content analysis using exact ChainAbuse categories
  private detectScamCategory(content: string, rawContent: string): string {
    const text = (content + ' ' + rawContent).toLowerCase();
    
    // Exact ChainAbuse categories in order of popularity
    const categories = [
      'Phishing Scam',
      'Rug Pull Scam', 
      'Other Blackmail Scam',
      'Sextortion Scam',
      'Ransomware',
      'Impersonation Scam',
      'Fake Returns Scam',
      'Hack - Other',
      'NFT Airdrop Scam',
      'Fake Project Scam',
      'Romance Scam',
      'Pigbutchering Scam',
      'Contract Exploit Scam',
      'Donation Impersonation Scam'
    ];
    
    // Simple keyword matching for each category
    const categoryKeywords: { [key: string]: string[] } = {
      'Phishing Scam': ['phishing', 'phish', 'fake website', 'fake site', 'credential'],
      'Rug Pull Scam': ['rug pull', 'rugpull', 'liquidity'],
      'Other Blackmail Scam': ['blackmail', 'threaten', 'demand payment'],
      'Sextortion Scam': ['sextortion', 'webcam', 'intimate', 'nude'],
      'Ransomware': ['ransomware', 'encrypted', 'decrypt', 'locked files'],
      'Impersonation Scam': ['impersonat', 'pretend', 'fake identity', 'posing as'],
      'Fake Returns Scam': ['fake return', 'guaranteed return', 'high return'],
      'Hack - Other': ['hack', 'hacked', 'breach', 'compromised'],
      'NFT Airdrop Scam': ['nft', 'airdrop', 'free nft', 'mint'],
      'Fake Project Scam': ['fake project', 'fake ico', 'fake token'],
      'Romance Scam': ['romance', 'dating', 'relationship', 'love'],
      'Pigbutchering Scam': ['pigbutchering', 'pig butchering', 'investment fraud'],
      'Contract Exploit Scam': ['contract exploit', 'smart contract', 'defi exploit'],
      'Donation Impersonation Scam': ['donation', 'charity', 'fundraising']
    };
    
    // Find best matching category
    for (const category of categories) {
      const keywords = categoryKeywords[category] || [];
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return category;
        }
      }
    }
    
    // Default fallback
    return 'Phishing Scam';
  }

  // Normalize category to match exact ChainAbuse categories
  private normalizeScamCategory(category: string): string {
    const normalized = category.toLowerCase().trim();
    
    // Exact ChainAbuse categories
    const exactCategories = [
      'Phishing Scam',
      'Rug Pull Scam', 
      'Other Blackmail Scam',
      'Sextortion Scam',
      'Ransomware',
      'Impersonation Scam',
      'Fake Returns Scam',
      'Hack - Other',
      'NFT Airdrop Scam',
      'Fake Project Scam',
      'Romance Scam',
      'Pigbutchering Scam',
      'Contract Exploit Scam',
      'Donation Impersonation Scam'
    ];
    
    // Check if category already matches exactly
    for (const exactCategory of exactCategories) {
      if (normalized === exactCategory.toLowerCase()) {
        return exactCategory;
      }
    }
    
    // Simple mapping based on keywords
    if (normalized.includes('phish')) return 'Phishing Scam';
    if (normalized.includes('rug pull')) return 'Rug Pull Scam';
    if (normalized.includes('blackmail')) return 'Other Blackmail Scam';
    if (normalized.includes('sextortion')) return 'Sextortion Scam';
    if (normalized.includes('ransomware')) return 'Ransomware';
    if (normalized.includes('impersonat')) return 'Impersonation Scam';
    if (normalized.includes('fake return')) return 'Fake Returns Scam';
    if (normalized.includes('hack')) return 'Hack - Other';
    if (normalized.includes('nft') || normalized.includes('airdrop')) return 'NFT Airdrop Scam';
    if (normalized.includes('fake project')) return 'Fake Project Scam';
    if (normalized.includes('romance')) return 'Romance Scam';
    if (normalized.includes('pigbutcher')) return 'Pigbutchering Scam';
    if (normalized.includes('contract')) return 'Contract Exploit Scam';
    if (normalized.includes('donation')) return 'Donation Impersonation Scam';
    
    // If no match, return as-is or default
    return category || 'Phishing Scam';
  }

  // Clean report content to remove duplicated information
  private cleanReportContent(rawContent: string): {
    cleanContent: string;
    author: string;
    category: string;
    reportedDomain: string;
    reportedAddress: string;
  } {
    let content = rawContent;
    
    // Extract category more precisely - look for common category patterns
    const categoryPatterns = [
      // Standard pattern: "Category. Rest of content"
      /^([^.]+?(?:Scam|Phishing|Fraud|Theft|Hack|Attack|Threat|Malware|Ransomware|Ponzi|Pyramid|Rug Pull|Exit Scam|Romance Scam|Investment Scam|Tech Support Scam|Fake Website|Impersonation|Money Laundering|Darknet|Illegal|Criminal|Suspicious|Report|Incident|Alert|Warning|Notice|Violation|Abuse|Spam|Botnet|Mining|Unauthorized|Blackmail|Extortion|Sextortion|Trading|Exchange|Wallet|DeFi|NFT|Token|Coin|Crypto|Bitcoin|Ethereum|Address|Domain|URL|Website|Platform|Service|Application|App|Software|System|Network|Protocol|Blockchain|Smart Contract)[^.]*)\.\s*(.*)/i,
      // Fallback: First sentence ending with period
      /^([^.]{1,80})\.\s*(.*)/,
      // If no period, look for capital letter followed by lowercase (sentence boundary)
      /^([A-Z][^A-Z]*?)([A-Z][a-z].*)/
    ];
    
    let category = '';
    let restContent = content;
    
    for (const pattern of categoryPatterns) {
      const match = content.match(pattern);
      if (match) {
        const potentialCategory = match[1].trim();
        
        // Validate category - should be short and descriptive
        if (potentialCategory.length <= 100 && 
            potentialCategory.length >= 5 &&
            !potentialCategory.match(/^(The|This|A|An|I|You|We|They|It|My|Our|Your)\s/i) &&
            !potentialCategory.includes('http') &&
            !potentialCategory.includes('@') &&
            !potentialCategory.match(/\d{4}-\d{2}-\d{2}/) &&
            !potentialCategory.match(/Submitted by/i)) {
          
          category = potentialCategory;
          restContent = match[2] ? match[2].trim() : '';
          break;
        }
      }
    }
    
    // Smart categorization based on most common ChainAbuse categories
    if (!category || category.length < 5) {
      category = this.detectScamCategory(content, rawContent);
      restContent = content;
    } else {
      // Normalize existing category to match common patterns
      category = this.normalizeScamCategory(category);
    }
    
    content = restContent;
    
    // Extract author from "Submitted by" pattern
    const authorMatches = [
      content.match(/Submitted by\s+([^.\d\n]+?)(?:\s+\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago|$)/i),
      content.match(/^([A-Za-z][A-Za-z0-9_]*)\s+\d+\s+(seconds?|minutes?|hours?|days?)\s+ago/i)
    ];
    
    let author = 'unknown';
    for (const match of authorMatches) {
      if (match) {
        author = match[1].trim();
        break;
      }
    }
    
    // Extract reported domain - look for proper domains only
    let reportedDomain = '';
    
    // First try explicit "Reported Domain" pattern
    const explicitDomainMatch = content.match(/Reported\s+Domain\s+([^\s\n]+)/i);
    if (explicitDomainMatch) {
      const domain = explicitDomainMatch[1].trim();
      // Validate it's a proper domain/URL
      if (domain.match(/^https?:\/\//) || domain.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
        reportedDomain = domain;
      }
    }
    
    // If no explicit domain, look for URLs in the content
    if (!reportedDomain) {
      const urlMatch = content.match(/(https?:\/\/[^\s\n]+)/i);
      if (urlMatch) {
        reportedDomain = urlMatch[1].trim();
      }
    }
    
    // If still no domain, look for domains in the content (more permissive search)
    if (!reportedDomain) {
      // Look for domain patterns throughout the text
      const domainMatches = content.match(/\b([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g);
      if (domainMatches) {
        for (const potentialDomain of domainMatches) {
          const domain = potentialDomain.trim();
          // Validate it's a proper domain
          if (domain.length >= 4 &&
              domain.includes('.') &&
              !domain.match(/^[a-z]+\.[A-Z]/) && // Reject patterns like "quickly.Submitted"
              !domain.match(/\.(jpg|png|gif|pdf|doc|txt|zip)$/i) && // Not file extensions
              domain.match(/\.(com|org|net|io|co|uk|de|fr|gov|edu|mil|int|eu|us|ca|au|jp|cn|ru|br|in|mx|it|es|pl|nl|se|no|dk|fi|ch|at|be|cz|sk|hu|ro|bg|hr|si|lt|lv|ee|gr|pt|ie|lu|mt|cy|is|li|ad|mc|sm|va|md|ua|by|rs|me|mk|al|ba|xk|am|az|ge|kz|kg|tj|tm|uz|mn|pk|bd|lk|np|bt|mm|th|la|kh|vn|my|sg|id|ph|tl|pg|sb|vu|fj|to|ws|ki|nr|tv|fm|mh|pw|gu|as|mp|vi|pr|cr|pa|ni|hn|sv|gt|bz|mx|do|ht|jm|cu|bs|bb|tt|gd|lc|vc|ag|kn|dm|gp|mq|bl|mf|sx|cw|aw|tc|vg|ai|ms|ky|bm|gl|fo|sj|ax|gg|je|im|gi|va|sm|ad|li|mc)$/i)) {
            reportedDomain = domain;
            break;
          }
        }
      }
    }
    
    // Also check the original raw content for domains that might have been cleaned out
    if (!reportedDomain) {
      const rawDomainMatches = rawContent.match(/\b([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g);
      if (rawDomainMatches) {
        for (const potentialDomain of rawDomainMatches) {
          const domain = potentialDomain.trim();
          if (domain.length >= 4 &&
              domain.includes('.') &&
              !domain.match(/^[a-z]+\.[A-Z]/) &&
              !domain.match(/\.(jpg|png|gif|pdf|doc|txt|zip)$/i) &&
              domain.match(/\.(com|org|net|io|co|uk|de|fr|gov|edu|mil|int|eu|us|ca|au|jp|cn|ru|br|in|mx|it|es|pl|nl|se|no|dk|fi|ch|at|be|cz|sk|hu|ro|bg|hr|si|lt|lv|ee|gr|pt|ie|lu|mt|cy|is|li|ad|mc|sm|va|md|ua|by|rs|me|mk|al|ba|xk|am|az|ge|kz|kg|tj|tm|uz|mn|pk|bd|lk|np|bt|mm|th|la|kh|vn|my|sg|id|ph|tl|pg|sb|vu|fj|to|ws|ki|nr|tv|fm|mh|pw|gu|as|mp|vi|pr|cr|pa|ni|hn|sv|gt|bz|mx|do|ht|jm|cu|bs|bb|tt|gd|lc|vc|ag|kn|dm|gp|mq|bl|mf|sx|cw|aw|tc|vg|ai|ms|ky|bm|gl|fo|sj|ax|gg|je|im|gi|va|sm|ad|li|mc)$/i)) {
            reportedDomain = domain;
            break;
          }
        }
      }
    }
    
    // Clean up domain - remove trailing periods and validate
    if (reportedDomain) {
      reportedDomain = reportedDomain.replace(/[.,;]+$/, '');
      
      // Final validation - reject if it looks like random text
      if (reportedDomain.match(/^[a-z]+\.[A-Z]/) || // like "quickly.Submitted"
          reportedDomain.length < 4 || 
          reportedDomain.split('.').some(part => part.length < 1)) {
        reportedDomain = '';
      }
    }
    
    // Extract reported address
    const addressMatch = content.match(/Reported\s+Address\s*([a-zA-Z0-9]+)/i);
    const reportedAddress = addressMatch ? addressMatch[1].trim() : '';
    
    // Clean the content by removing extracted parts and duplicated info
    let cleanContent = content
      // Remove category-related words that might be duplicated in content
      .replace(/^(Phishing|Rug Pull|Other Blackmail|Sextortion|Ransomware|Impersonation|Fake Returns|Hack - Other|NFT Airdrop|Fake Project|Romance|Pigbutchering|Contract Exploit|Donation Impersonation)\s*Scam\s*/i, '')
      .replace(/^(Phishing|Rug Pull|Other Blackmail|Sextortion|Ransomware|Impersonation|Fake Returns|Hack|NFT Airdrop|Fake Project|Romance|Pigbutchering|Contract Exploit|Donation Impersonation)\s*/i, '')
      .replace(/^Scam\s*/i, '')
      // Remove "Submitted by" lines completely
      .replace(/Submitted by\s+[^.\n]*(?:\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago)?[.\n]*/gi, '')
      // Remove time ago patterns at the end and in middle
      .replace(/\s*\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago\s*/gi, '')
      // Remove "Reported Domain" lines
      .replace(/Reported\s+Domain\s+[^\s\n]+\s*/gi, '')
      // Remove "Reported Address" lines  
      .replace(/Reported\s+Address\s*[a-zA-Z0-9]+\s*/gi, '')
      // Remove timestamp patterns like "2025-06-03T12:56:33.753Z"
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/gi, '')
      // Remove date patterns like "at 2025-06-03"
      .replace(/\bat\s+\d{4}-\d{2}-\d{2}[^\s]*/gi, '')
      // Remove "Threat detected at" patterns
      .replace(/Threat detected at[^.]*\./gi, '')
      // Remove domain fragments that got concatenated
      .replace(/[a-zA-Z0-9.-]+\.(?:com|org|net|io|co|uk|de|fr|squarespace\.com)(?:\/[^\s]*)?/gi, '')
      // Remove URL fragments
      .replace(/https?:\/\/[^\s]+/gi, '')
      // Remove other metadata patterns
      .replace(/Vote\s*\d*\s*/gi, '')
      .replace(/Comments?\s*\d*\s*/gi, '')
      .replace(/Other:\s*/gi, '')
      // Clean up author names that got concatenated
      .replace(/\b(PhishFort|Metamask|Binance|Coinbase|TrustWallet)\s*\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago\b/gi, '')
      // Remove pattern like "classified as infringement"
      .replace(/,?\s*classified as [^.,\n]*/gi, '')
      // Fix common concatenation issues
      .replace(/([a-z])(\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago)/gi, '$1 $2')
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      // Remove multiple dots and clean punctuation
      .replace(/\.{2,}/g, '.')
      .replace(/\s*\.\s*$/, '')
      // Multiple spaces to single space
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace and dots
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .trim();
    
    // If clean content is too short or empty, try to extract meaningful content
    if (cleanContent.length < 20) {
      // Split original content into lines and find the meaningful content
      const lines = rawContent.split(/[\n.]/).map(line => line.trim()).filter(line => line.length > 10);
      
      for (const line of lines) {
        // Skip lines that are just metadata
        if (!/^(Submitted by|Reported|Vote|Comments|Other|Category|Threat detected|at \d{4})/i.test(line) &&
            !/^\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago/i.test(line) &&
            !/^https?:\/\//i.test(line) &&
            !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(line)) {
          cleanContent = line.trim();
          break;
        }
      }
    }
    
    // Final cleanup - remove any remaining concatenated elements
    cleanContent = cleanContent
      .replace(/\b[a-zA-Z0-9.-]+\.(?:com|org|net|io|co|uk|de|fr)\/[^\s]*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return {
      cleanContent,
      author,
      category,
      reportedDomain,
      reportedAddress
    };
  }

  private async extractReportUrlByClick(page: Page, reportElement: any, index: number): Promise<{reportUrl: string, reportId: string, success: boolean}> {
    try {
      console.log(`🖱️ Attempting to click report ${index} to extract URL...`);
      
      // Open new tab for clicking to avoid disrupting main page
      const newPage = await page.browser().newPage();
      
      if (this.proxyConfig?.username) {
        await newPage.authenticate({
          username: this.proxyConfig.username,
          password: this.proxyConfig.password
        });
      }

      await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Go to main page in new tab
      const mainUrl = `https://www.chainabuse.com/reports?sort=newest&_t=${Date.now()}`;
      await newPage.goto(mainUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      await newPage.waitForSelector('.create-ScamReportCard', { timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));

      let finalUrl = '';
      
      newPage.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/report/') && response.status() === 200) {
          finalUrl = url;
          console.log(`🎯 Captured navigation URL: ${url}`);
        }
      });

      newPage.on('framenavigated', (frame) => {
        if (frame === newPage.mainFrame()) {
          const currentUrl = frame.url();
          if (currentUrl.includes('/report/')) {
            finalUrl = currentUrl;
            console.log(`🎯 Captured frame navigation: ${currentUrl}`);
          }
        }
      });

      // Click the specific report element
      const reportElements = await newPage.$$('.create-ScamReportCard');
      if (reportElements[index]) {
        console.log(`🖱️ Clicking report element ${index}...`);
        
        await newPage.evaluate((element) => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, reportElements[index]);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        await reportElements[index].click();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const currentUrl = newPage.url();
        if (currentUrl.includes('/report/')) {
          finalUrl = currentUrl;
        }
      }

      await newPage.close();

      if (finalUrl && finalUrl.includes('/report/')) {
        const uuidMatch = finalUrl.match(/\/report\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        const reportId = uuidMatch ? uuidMatch[1] : '';
        
        let properUrl = finalUrl;
        if (reportId && !finalUrl.includes('context=browse-all')) {
          properUrl = `https://www.chainabuse.com/report/${reportId}?context=browse-all`;
        }
        
        console.log(`✅ Successfully extracted URL: ${properUrl}`);
        return {
          reportUrl: properUrl,
          reportId: reportId,
          success: true
        };
      } else {
        console.log(`⚠️ No navigation detected for report ${index}`);
        return {
          reportUrl: `https://www.chainabuse.com/reports?sort=newest#report-${index}`,
          reportId: '',
          success: false
        };
      }

    } catch (error: any) {
      console.error(`❌ Click navigation failed for report ${index}:`, error.message);
      return {
        reportUrl: `https://www.chainabuse.com/reports?sort=newest#report-${index}`,
        reportId: '',
        success: false
      };
    }
  }

  private createReportSnapshot(reportData: ReportData, position: number): ReportSnapshot {
    const textContent = reportData.textContent || '';
    const reportUrl = reportData.reportUrl || '';
    const reportId = reportData.reportId || '';
    
    // Clean up text and extract information
    const cleanedData = this.cleanReportContent(textContent);
    
    const timeMatch = textContent.match(/(\d+)\s+(seconds?|minutes?|hours?|days?)\s+ago/i);
    const timeAgo = timeMatch ? timeMatch[0] : `pos_${position}`;
    
    const contentHash = this.createContentHash(cleanedData.cleanContent + cleanedData.author);
    const id = `${contentHash}_${position}`;
    
    return {
      id,
      preview: cleanedData.cleanContent.substring(0, 300),
      author: cleanedData.author,
      timeAgo,
      timestamp: Date.now(),
      position,
      contentHash,
      reportUrl,
      reportId
    };
  }

  public async checkForNewReports(): Promise<{ newReports: number; success: boolean; debug?: any }> {
    let browser: Browser | null = null;
    
    try {
      const currentTime = new Date();
      this.checkCount++;
      
      console.log(`🚀 Clean Report Monitor check #${this.checkCount}: ${currentTime.toLocaleTimeString('pl-PL')}`);
      
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

      // Get basic report data first
      const basicReportsData = await page.evaluate(() => {
        const reportElements = Array.from(document.querySelectorAll('.create-ScamReportCard'));
        console.log(`Found ${reportElements.length} ScamReportCard elements`);
        
        return reportElements.map((element, index) => {
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

      console.log(`📊 Found ${basicReportsData.length} reports, extracting URLs by clicking...`);

      // Extract URLs for first few reports by clicking
      const reportsData: ReportData[] = [];
      const maxClickTests = Math.min(3, basicReportsData.length);
      
      for (let i = 0; i < basicReportsData.length; i++) {
        const basicData = basicReportsData[i];
        let reportUrl = `https://www.chainabuse.com/reports?sort=newest#report-${i}`;
        let reportId = '';
        let clickSuccess = false;
        let navigationUrl = '';

        if (i < maxClickTests) {
          const clickResult = await this.extractReportUrlByClick(page, null, i);
          reportUrl = clickResult.reportUrl;
          reportId = clickResult.reportId;
          clickSuccess = clickResult.success;
          navigationUrl = clickResult.reportUrl;
        }

        reportsData.push({
          textContent: basicData.textContent,
          innerHTML: basicData.innerHTML,
          position: i,
          category: basicData.category,
          reportUrl: reportUrl,
          reportId: reportId,
          clickSuccess: clickSuccess,
          navigationUrl: navigationUrl
        });
      }

      const currentReports = reportsData.map((data, index) => 
        this.createReportSnapshot(data, index)
      );

      const currentHashes = new Set(currentReports.map(r => r.contentHash));
      const successfulClicks = reportsData.filter(r => r.clickSuccess).length;

      const debug = {
        checkNumber: this.checkCount,
        timestamp: currentTime.toISOString(),
        reportsFound: currentReports.length,
        clickNavigationStats: {
          attemptedClicks: maxClickTests,
          successfulClicks: successfulClicks,
          successRate: maxClickTests > 0 ? (successfulClicks / maxClickTests * 100).toFixed(1) + '%' : '0%'
        },
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
          preview: r.preview.substring(0, 100),
          reportUrl: r.reportUrl,
          reportId: r.reportId
        }))
      };

      // First run - establish baseline
      if (this.checkCount === 1) {
        this.monitorStartTime = Date.now();
        this.lastReports = currentReports;
        this.lastReportHashes = currentHashes;
        
        currentReports.forEach(report => {
          this.sentReportHashes.add(report.contentHash);
        });
        
        this.saveSentReports();
        
        console.log(`📥 Baseline established: ${currentReports.length} reports, ${currentHashes.size} unique hashes`);
        console.log(`🖱️ Click Navigation Results: ${successfulClicks}/${maxClickTests} successful clicks`);
        
        // Get cleaned preview for the startup message
        let startupPreview = 'No reports found';
        if (currentReports[0]) {
          const originalTextContent = reportsData[0]?.textContent || currentReports[0].preview;
          const cleanedStartupData = this.cleanReportContent(originalTextContent);
          
          startupPreview = `⏰ ${currentReports[0].timeAgo}\n` +
                          `🏷️ ${cleanedStartupData.category}\n` +
                          `📝 ${cleanedStartupData.cleanContent.substring(0, 100)}...`;
        }
        
        await this.sendTelegramMessage(
          `🚀 <b>ChainAbuse Monitor Started</b>\n\n` +
          `⏰ <b>Started:</b> ${currentTime.toLocaleString('en-US')}\n\n` +
          `🔍 <b>Latest report preview:</b>\n` +
          `${startupPreview}\n\n` +
          `🔗 Sample URL: ${currentReports[0]?.reportUrl || 'None'}\n\n` +
          `📡 <b>Monitoring for NEW reports...</b>`
        );

        return { newReports: 0, success: true, debug };
      }

      const newReports: ReportSnapshot[] = [];
      
      console.log(`🔍 Comparing hashes: ${currentHashes.size} current vs ${this.lastReportHashes.size} previous`);
      
      currentReports.forEach(currentReport => {
        if (!this.lastReportHashes.has(currentReport.contentHash) && 
            !this.sentReportHashes.has(currentReport.contentHash)) {
          
          const timeAgoText = currentReport.timeAgo.toLowerCase();
          
          const isVeryFresh = (
            timeAgoText.includes('0 minutes ago') ||
            timeAgoText.includes('few seconds ago') ||
            timeAgoText.includes('just now') ||
            (timeAgoText.includes('seconds ago') && !timeAgoText.match(/[5-9]\d+\s+seconds/))
          );
          
          console.log(`🔍 Checking report: "${currentReport.timeAgo}" - isVeryFresh: ${isVeryFresh}`);
          
          if (isVeryFresh) {
            console.log(`🆕 FRESH REPORT ACCEPTED: ${currentReport.timeAgo}, URL=${currentReport.reportUrl}`);
            newReports.push(currentReport);
          } else {
            console.log(`⏰ Report REJECTED (not fresh enough): "${currentReport.timeAgo}" - marking as seen`);
            this.sentReportHashes.add(currentReport.contentHash);
          }
        }
      });

      this.lastReports = currentReports;
      this.lastReportHashes = currentHashes;

      console.log(`✅ Detection completed: ${newReports.length} truly new reports found`);

      for (const newReport of newReports) {
        // For new reports, try to get the proper URL by clicking
        let actualReportUrl = newReport.reportUrl;
        let actualReportId = newReport.reportId;
        
        if (!actualReportId && newReport.position < maxClickTests) {
          console.log(`🖱️ Getting proper URL for new report at position ${newReport.position}...`);
          const clickResult = await this.extractReportUrlByClick(page, null, newReport.position);
          if (clickResult.success) {
            actualReportUrl = clickResult.reportUrl;
            actualReportId = clickResult.reportId;
          }
        }

        // Get cleaned report content using the original text content
        const originalTextContent = reportsData[newReport.position]?.textContent || newReport.preview;
        const cleanedData = this.cleanReportContent(originalTextContent);
        
        // Build the formatted message with cleaned content
        let message = `🚨 <b>NEW CHAINABUSE REPORT DETECTED</b>\n\n`;
        
        if (cleanedData.category) {
          message += `🏷️ <b>Category:</b> ${cleanedData.category}\n`;
        }
        
        message += `⏰ <b>Published:</b> ${newReport.timeAgo}\n` +
                  `📝 <b>Report Content:</b>\n${cleanedData.cleanContent}`;
        
        if (cleanedData.author && cleanedData.author !== 'unknown') {
          message += `\n\n👤 <b>Submitted by:</b> ${cleanedData.author}`;
        }
        
        if (cleanedData.reportedDomain) {
          message += `\n🌐 <b>Reported Domain:</b> ${cleanedData.reportedDomain}`;
        }
        
        if (cleanedData.reportedAddress) {
          message += `\n💳 <b>Reported Address:</b> ${cleanedData.reportedAddress}`;
        }
        
        // Use the proper URL
        let linkText = 'View Report Details';
        let linkInfo = '';
        
        if (actualReportId) {
          linkText = `View Report ${actualReportId.substring(0, 8)}...`;
        } else {
          linkText = 'View Reports Page';
          linkInfo = `\n⚠️ <i>Direct link unavailable</i>`;
        }
        
        message += linkInfo +
                  `\n\n🔗 <a href="${actualReportUrl}">${linkText}</a>\n\n` +
                  `📊 ${currentTime.toLocaleString('en-US')}`;

        await this.sendTelegramMessage(message);
        
        this.sentReportHashes.add(newReport.contentHash);
        console.log(`✅ Report sent: hash=${newReport.contentHash.substring(0, 8)}, URL=${actualReportUrl}`);
      }

      this.saveSentReports();

      if (this.sentReportHashes.size > 2000) {
        const sentArray = Array.from(this.sentReportHashes);
        this.sentReportHashes = new Set(sentArray.slice(-2000));
        this.saveSentReports();
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
            preview: r.preview.substring(0, 100),
            reportUrl: r.reportUrl,
            reportId: r.reportId
          })),
          detectionMethod: 'clean-content-extraction'
        }
      };

    } catch (error: any) {
      console.error('💥 Clean Report Monitor error:', error);
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

let monitor: CleanReportMonitor | null = null;

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
      console.log('🔧 Initializing Clean Report Monitor...');
      monitor = new CleanReportMonitor();
    }

    const result = await monitor.checkForNewReports();
    
    return NextResponse.json({
      success: result.success,
      newReports: result.newReports,
      timestamp: new Date().toISOString(),
      debug: result.debug,
      method: 'clean-content'
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
    status: 'Clean Content ChainAbuse Monitor',
    timestamp: new Date().toISOString(),
    version: 'clean-v1',
    features: [
      'Advanced content cleaning',
      'Duplicate information removal',
      'Smart content extraction',
      'Category separation',
      'Author extraction',
      'Domain/Address parsing',
      'Concatenation fixes',
      'Metadata removal',
      'Clean Telegram formatting'
    ]
  });
}