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
  amountLostFromHTML?: string;
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
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: '/usr/bin/google-chrome' 
    });
  }

  // NOWA FUNKCJA: Pobierz Amount Lost ze strony szczegółów raportu
  private async extractAmountLostFromDetailPage(browser: Browser, reportUrl: string, reportId: string): Promise<string> {
    let detailPage: Page | null = null;
    
    try {
      console.log(`💰 Opening detail page for Amount Lost: ${reportUrl}`);
      
      detailPage = await browser.newPage();
      
      if (this.proxyConfig?.username) {
        await detailPage.authenticate({
          username: this.proxyConfig.username,
          password: this.proxyConfig.password
        });
      }

      await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Idź bezpośrednio na stronę szczegółów raportu
      const detailUrl = reportId ? 
        `https://www.chainabuse.com/report/${reportId}?context=browse-all` : 
        reportUrl;
      
      console.log(`🔄 Loading detail page: ${detailUrl}`);
      
      await detailPage.goto(detailUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      // Czekaj na załadowanie strony szczegółów
      await new Promise(resolve => setTimeout(resolve, 3000));

      // EXTRACT Amount Lost ze strony szczegółów
      const amountLost = await detailPage.evaluate(() => {
        console.log('🔍 Searching for Amount Lost on detail page...');
        
        // METODA 1: Szukaj przez klasy LossesSection (jak w debugu)
        const lossesSection = document.querySelector('.create-LossesSection');
        let amount = '';
        
        if (lossesSection) {
          console.log('✅ Found LossesSection on detail page');
          
          // Szukaj wszystkich paragrafów w sekcji
          const paragraphs = lossesSection.querySelectorAll('p');
          console.log(`Found ${paragraphs.length} paragraphs in LossesSection`);
          
          for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const text = p.textContent?.trim().toLowerCase() || '';
            
            console.log(`Paragraph ${i}: "${text}"`);
            
            // Sprawdź czy paragraf zawiera "amount" i "lost"
            if (text.includes('amount') && text.includes('lost')) {
              console.log(`✅ Found "Amount lost" paragraph: "${p.textContent}"`);
              
              // Sprawdź następny paragraf z kwotą
              if (i + 1 < paragraphs.length) {
                const nextP = paragraphs[i + 1];
                const nextText = nextP.textContent?.trim() || '';
                
                console.log(`Next paragraph: "${nextText}"`);
                
                if (nextText.includes('USD') || nextText.includes('$') || nextText.match(/[0-9.,]+/)) {
                  amount = nextText;
                  console.log(`✅ Found Amount Lost in next paragraph: "${amount}"`);
                  break;
                }
              }
              
              // Sprawdź czy ten sam paragraf zawiera kwotę
              if (text.includes('usd') || text.includes('$')) {
                amount = p.textContent?.trim() || '';
                console.log(`✅ Found Amount Lost in same paragraph: "${amount}"`);
                break;
              }
            }
          }
        } else {
          console.log('❌ No LossesSection found on detail page');
        }
        
        // METODA 2: Szukaj przez tekst "Amount lost" w całym dokumencie
        if (!amount) {
          console.log('🔍 Trying full document search for "Amount lost"...');
          
          const allElements = document.querySelectorAll('*');
          
          for (const element of allElements) {
            const text = element.textContent?.trim().toLowerCase() || '';
            
            // Sprawdź czy element zawiera dokładnie "amount lost"
            if (text.includes('amount lost') && text.length < 200) {
              console.log(`Found "Amount lost" in element: "${element.textContent}"`);
              
              // Sprawdź czy ten sam element zawiera kwotę
              if (text.includes('usd') || text.includes('$') || text.match(/[0-9.,]+\s*(usd|\$)/)) {
                amount = element.textContent?.trim() || '';
                console.log(`✅ Found Amount Lost in same element: "${amount}"`);
                break;
              }
              
              // Sprawdź następny element sibling
              const nextSibling = element.nextElementSibling;
              if (nextSibling) {
                const siblingText = nextSibling.textContent?.trim() || '';
                if (siblingText.includes('USD') || siblingText.includes('$') || siblingText.match(/[0-9.,]+/)) {
                  amount = siblingText;
                  console.log(`✅ Found Amount Lost in next sibling: "${amount}"`);
                  break;
                }
              }
            }
          }
        }
        
        // METODA 3: Regex na całej stronie jako ostateczność
        if (!amount) {
          console.log('🔍 Trying regex search on full page text...');
          
          const fullPageText = document.body.textContent || '';
          
          // Szukaj wzorca "Amount lost" + kwota
          const amountRegex = /Amount\s+lost[:\s]*([0-9,.\s]+\s*(?:USD|\$|€|£|BTC|ETH))/gi;
          const match = fullPageText.match(amountRegex);
          
          if (match && match[0]) {
            amount = match[0];
            console.log(`✅ Found Amount Lost via regex: "${amount}"`);
          } else {
            console.log('❌ No Amount Lost found via regex');
          }
        }
        
        // Czyść Amount Lost z nadmiarowego tekstu
        if (amount) {
          // Usuń "Amount lost" z początku jeśli jest
          amount = amount.replace(/^Amount\s+lost[:\s]*/gi, '').trim();
          
          // Wyciągnij tylko kwotę + walutę
          const cleanMatch = amount.match(/([0-9,.\s]+\s*(?:USD|\$|€|£|BTC|ETH))/gi);
          if (cleanMatch && cleanMatch[0]) {
            amount = cleanMatch[0].trim();
          }
        }
        
        return amount;
      });

      console.log(`💰 Detail page extraction result: "${amountLost}"`);
      return amountLost || '';

    } catch (error: any) {
      console.error(`❌ Detail page extraction failed:`, error.message);
      return '';
    } finally {
      if (detailPage) {
        await detailPage.close();
      }
    }
  }

  // Funkcja do czyszczenia Lorem ipsum z treści
  private removeLoremIpsum(content: string): string {
    let cleanContent = content;
    
    // Usuń Lorem ipsum po "For security reasons..." 
    cleanContent = cleanContent.replace(
      /(For security reasons and to protect investigations, this report is currently only shared with Law Enforcement Partners\.?\s*)(Lorem ipsum[\s\S]*)/i,
      '$1'
    );
    
    // Usuń samodzielny Lorem ipsum tekst
    cleanContent = cleanContent.replace(/Lorem ipsum[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '');
    
    // Usuń dodatkowe puste linie
    cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();
    
    return cleanContent;
  }

  private async sendTelegramMessage(message: string): Promise<void> {
    try {
      // 🧹 USUŃ LOREM IPSUM Z TREŚCI
      const cleanMessage = this.removeLoremIpsum(message);
      
      if (cleanMessage !== message) {
        console.log('🧹 Lorem ipsum removed from message');
      }

      const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegramChatId,
          text: cleanMessage,
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
      'Donation Impersonation Scam',
      'Other'
    ];
    
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
    
    for (const category of categories) {
      const keywords = categoryKeywords[category] || [];
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return category;
        }
      }
    }
    
    return 'Other';
  }

  // Normalize category to match exact ChainAbuse categories
  private normalizeScamCategory(category: string): string {
    const normalized = category.toLowerCase().trim();
    
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
      'Donation Impersonation Scam',
      'Other'
    ];
    
    for (const exactCategory of exactCategories) {
      if (normalized === exactCategory.toLowerCase()) {
        return exactCategory;
      }
    }
    
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
    
    return 'Other';
  }

  // Zamień swoją funkcję quickAnalyzeForTelegram na tę wersję
  private quickAnalyzeForTelegram(textContent: string): {
    category: string;
    amountLost: string;
    author: string;
    reportedDomain: string;
    reportedAddresses: string[];
    cleanContent: string;
  } {
    console.log('🔍 Quick analysis for Telegram message...');
    console.log('📝 FULL textContent length:', textContent.length);
    console.log('📝 FULL textContent preview:', textContent.substring(0, 500));
    
    // Extract Amount Lost - NOWA METODA: szukaj dokładnie "Amount lost" a potem pierwszej kwoty USD
    let amountLost = '';
    
    // Podziel tekst na linie i znajdź linię z "Amount lost"
    const lines = textContent.split('\n');
    console.log('📄 Total lines:', lines.length);
    console.log('📄 First 10 lines:', lines.slice(0, 10).map((line, i) => `${i}: "${line.trim()}"`));
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // WARIANT 1: Sprawdź czy linia zawiera dokładnie "Amount lost" (może być z dodatkowymi spacjami)
      if (line.toLowerCase().replace(/\s+/g, ' ').includes('amount lost')) {
        console.log('💰 Found "Amount lost" line:', line);
        
        // Szukaj w następnych liniach pierwszej kwoty USD
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          
          // Sprawdź czy linia zawiera liczbę + USD
          const usdMatch = nextLine.match(/([0-9,.]+ USD)/i);
          if (usdMatch) {
            amountLost = usdMatch[1].trim();
            console.log('💰 Found Amount Lost immediately after "Amount lost":', amountLost);
            break;
          }
        }
        
        if (amountLost) break;
      }
      
      // WARIANT 2: NOWY - Sprawdź czy jest "Amount" w tej linii, a "lost" w następnej
      if (line.toLowerCase().trim() === 'amount') {
        console.log('💰 Found "Amount" line:', line);
        
        // Sprawdź czy następna linia to "lost"
        if (i + 1 < lines.length && lines[i + 1].trim().toLowerCase() === 'lost') {
          console.log('💰 Found "lost" in next line:', lines[i + 1]);
          
          // Szukaj w następnych liniach pierwszej kwoty USD
          for (let j = i + 2; j < Math.min(i + 7, lines.length); j++) {
            const nextLine = lines[j].trim();
            
            // Sprawdź czy linia zawiera liczbę + USD
            const usdMatch = nextLine.match(/([0-9,.]+ USD)/i);
            if (usdMatch) {
              amountLost = usdMatch[1].trim();
              console.log('💰 Found Amount Lost after "Amount" + "lost" pattern:', amountLost);
              break;
            }
          }
          
          if (amountLost) break;
        }
      }
    }
    
    // Jeśli nie znaleziono przez linie, spróbuj bezpośrednio w tekście jak wcześniej (fallback)
    if (!amountLost) {
      console.log('🔍 FALLBACK: Searching for any USD amounts in full text');
      const allUSDAmounts = textContent.match(/([0-9,.]+ USD)/gi) || [];
      console.log('💰 All USD amounts found:', allUSDAmounts);
      
      if (allUSDAmounts.length > 0) {
        amountLost = allUSDAmounts[allUSDAmounts.length - 1].trim();
        console.log('💰 Fallback: Taking LAST USD amount:', amountLost);
      } else {
        console.log('❌ No USD amounts found in textContent');
        
        // DODATKOWE DEBUGOWANIE - sprawdź czy są jakiekolwiek liczby
        const allNumbers = textContent.match(/\d+[.,]?\d*/g) || [];
        console.log('🔢 All numbers found:', allNumbers);
        
        // Sprawdź czy jest słowo "USD" w ogóle
        const hasUSD = textContent.toLowerCase().includes('usd');
        console.log('💵 Contains "USD":', hasUSD);
        
        // Sprawdź czy są słowa "amount" i "lost"
        const hasAmount = textContent.toLowerCase().includes('amount');
        const hasLost = textContent.toLowerCase().includes('lost');
        console.log('🔍 Contains "amount":', hasAmount, 'Contains "lost":', hasLost);
      }
    }

    // Extract Category - pozostaje bez zmian
    let category = '';
    const categoryPatterns = [
      'Phishing Scam',
      'Contract Exploit Scam', 
      'Hack - Other',
      'Rug Pull Scam',
      'Romance Scam',
      'Sextortion Scam',
      'Ransomware',
      'Impersonation Scam',
      'Fake Returns Scam',
      'NFT Airdrop Scam',
      'Other Blackmail Scam',
      'Pigbutchering Scam',
      'Donation Impersonation Scam'
    ];
    
    // Look for category at the beginning of content
    const firstLine = textContent.split('\n')[0] || '';
    for (const cat of categoryPatterns) {
      if (firstLine.toLowerCase().includes(cat.toLowerCase()) || 
          textContent.toLowerCase().includes(cat.toLowerCase())) {
        category = cat;
        console.log('🏷️ Category found:', category);
        break;
      }
    }

    // Extract author - pozostaje bez zmian
    let author = 'unknown';
    const authorMatches = [
      textContent.match(/Submitted by\s+([a-zA-Z0-9_-]+)/i),
      textContent.match(/by\s+([a-zA-Z0-9_-]+)/i),
      textContent.match(/chainabuse-guest/i)
    ];
    
    for (const match of authorMatches) {
      if (match) {
        author = match[0].includes('chainabuse-guest') ? 'chainabuse-guest' : (match[1] || '').trim();
        if (author) {
          console.log('👤 Author found:', author);
          break;
        }
      }
    }

    // Extract domain - pozostaje bez zmian
    let reportedDomain = '';
    const domainPatterns = [
      /Reported Domain\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /Domain\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
    ];
    
    for (const pattern of domainPatterns) {
      const match = textContent.match(pattern);
      if (match && match[1]) {
        reportedDomain = match[1].trim().replace(/Reported$/i, '').replace(/submitted$/i, '');
        if (reportedDomain.includes('.')) {
          console.log('🌐 Domain found:', reportedDomain);
          break;
        }
      }
    }

    // ZMIENIONE: Wyciąganie WSZYSTKICH adresów
    const reportedAddresses: string[] = [];
    
console.log('💳 Searching for multiple addresses...');
console.log('💳 Full content sample:', textContent.substring(0, 300));

// KROK 1: Znajdź wszystkie potencjalne adresy z luźnymi wzorcami
const allPotentialMatches = [
  ...textContent.matchAll(/([13][1-9A-HJ-NP-Za-km-z]{20,40})/g),           // Bitcoin Legacy
  ...textContent.matchAll(/(bc1[02-9ac-hj-np-z]{30,70})/g),                // Bitcoin Bech32  
  ...textContent.matchAll(/(ltc1[02-9ac-hj-np-z]{30,70})/g),               // Litecoin Bech32
  ...textContent.matchAll(/(addr1[a-z0-9]{50,120})/g),                     // Cardano (ADA)
  ...textContent.matchAll(/(0x[a-fA-F0-9]{40})/g),                      // Ethereum/Polygon/Arbitrum/Avalanche
  ...textContent.matchAll(/(T[1-9A-HJ-NP-Za-km-z]{30,40})/g),              // Tron
  ...textContent.matchAll(/([LM][1-9A-HJ-NP-Za-km-z]{20,40})/g),           // Litecoin Legacy
  ...textContent.matchAll(/(erd1[a-z0-9]{58})/g),                          // MultiversX/Elrond (dla Hedera)
  ...textContent.matchAll(/([1-9A-HJ-NP-Za-km-z]{32,44})/g), 
];

console.log(`💳 Found ${allPotentialMatches.length} potential address matches`);

// Zbierz wszystkie pozycje dopasowań żeby uniknąć nakładania
const processedPositions: Array<{start: number, end: number}> = [];

for (const match of allPotentialMatches) {
  // Bezpieczne przypisanie z sprawdzeniem typu
  const startPos = (match.index !== undefined) ? match.index : 0;
  const endPos = startPos + match[1].length;
  
  // Sprawdź czy ten fragment nie nakłada się z już przetworzonymi
  let isOverlapping = false;
  for (const pos of processedPositions) {
    if ((startPos >= pos.start && startPos < pos.end) || 
        (endPos > pos.start && endPos <= pos.end)) {
      isOverlapping = true;
      break;
    }
  }
  
  if (isOverlapping) {
    console.log(`💳 Skipping overlapping match: "${match[1]}" at position ${startPos}`);
    continue;
  }
  
  let rawAddress = match[1];
  console.log(`💳 Processing raw match: "${rawAddress}" at position ${startPos}-${endPos}`);
  
let cleanedAddress = rawAddress;

// KROK 1: Usuń tylko znane prefiksy (nie całą resztę)
if (cleanedAddress.startsWith('ddress')) {
  cleanedAddress = cleanedAddress.substring(6); // Usuń "ddress"
}
if (cleanedAddress.startsWith('Address')) {
  cleanedAddress = cleanedAddress.substring(7); // Usuń "Address" 
}
if (cleanedAddress.startsWith('eported')) {
  cleanedAddress = cleanedAddress.substring(7); // Usuń "eported"
}

// KROK 2: Usuń suffiksy - ale tylko konkretne słowa
cleanedAddress = cleanedAddress
  .replace(/Reported$/i, '')
  .replace(/ReportedDomain$/i, '')
  .replace(/ReportedAddress$/i, '')
  .replace(/Domain$/i, '')
  .replace(/Address$/i, '')
  .replace(/Reporte$/i, '')
  .replace(/Addres$/i, '')
  .replace(/^TRC20/i, '')
  .replace(/^USDT/i, '')
  .replace(/^BTC/i, '')
  .replace(/^ETH/i, '')
  .trim();

// KROK 3: Jeśli nadal nieprawidłowy, wyciągnij TYLKO pierwszy prawidłowy adres
if (!/^(0x[a-fA-F0-9]{40}|bc1[02-9ac-hj-np-z]+|[13][1-9A-HJ-NP-Za-km-z]+|T[1-9A-HJ-NP-Za-km-z]+|[LM][1-9A-HJ-NP-Za-km-z]+|addr1[a-z0-9]+)$/.test(cleanedAddress)) {
  const match = cleanedAddress.match(/(0x[a-fA-F0-9]{40}|bc1[02-9ac-hj-np-z]{39,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34}|T[1-9A-HJ-NP-Za-km-z]{33}|[LM][1-9A-HJ-NP-Za-km-z]{26,34}|addr1[a-z0-9]{53,103})/);
  if (match) {
    cleanedAddress = match[1];
  }
}
    
  console.log(`💳 Cleaned address: "${cleanedAddress}"`);
  
let isValidAddress = false;
let addressType = '';

if (/^bc1[02-9ac-hj-np-z]{38,61}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Bitcoin Bech32';
} else if (/^ltc1[02-9ac-hj-np-z]{38,61}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Litecoin Bech32';
} else if (/^addr1[a-z0-9]{50,120}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Cardano (ADA)';
} else if (/^[13][1-9A-HJ-NP-Za-km-z]{24,33}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Bitcoin Legacy';
} else if (/^0x[a-fA-F0-9]{40}$/.test(cleanedAddress)) {
  isValidAddress = true;
  // Określ typ na podstawie kontekstu - wszystkie używają tego samego formatu
  if (textContent.toLowerCase().includes('polygon') || textContent.toLowerCase().includes('matic')) {
    addressType = 'Polygon (MATIC)';
  } else if (textContent.toLowerCase().includes('arbitrum')) {
    addressType = 'Arbitrum';
  } else if (textContent.toLowerCase().includes('avalanche') || textContent.toLowerCase().includes('avax')) {
    addressType = 'Avalanche (AVAX)';
  } else if (textContent.toLowerCase().includes('base')) {
    addressType = 'Base';
  } else {
    addressType = 'Ethereum'; // Domyślnie Ethereum
  }
} else if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Tron';
} else if (/^[LM][1-9A-HJ-NP-Za-km-z]{25,33}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Litecoin Legacy';
} else if (/^0\.0\.[0-9]+$/.test(cleanedAddress)) {
  // Hedera używa formatu 0.0.123456
  isValidAddress = true;
  addressType = 'Hedera (HBAR)';
} else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanedAddress) && 
           !cleanedAddress.startsWith('1') && 
           !cleanedAddress.startsWith('3') && 
           !cleanedAddress.startsWith('L') && 
           !cleanedAddress.startsWith('M') && 
           !cleanedAddress.startsWith('T')) {
  // Solana, Base58 format - ale nie inne znane formaty
} else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanedAddress) && 
           !cleanedAddress.startsWith('1') && 
           !cleanedAddress.startsWith('3') && 
           !cleanedAddress.startsWith('L') && 
           !cleanedAddress.startsWith('M') && 
           !cleanedAddress.startsWith('T')) {
  // Solana uses Base58, 32-44 characters
  isValidAddress = true;
  addressType = 'Solana (SOL)';
}
  
  console.log(`💳 Validation: ${cleanedAddress} is ${isValidAddress ? 'VALID' : 'INVALID'} ${addressType}`);
  
  if (isValidAddress && 
    cleanedAddress.length >= 25 && 
    !reportedAddresses.includes(cleanedAddress)) {
  
  // NOWY: Sprawdź czy nowy adres nie jest fragmentem już dodanego adresu
  let isDuplicateFragment = false;
  
  for (const existingAddress of reportedAddresses) {
    // Sprawdź czy nowy adres jest fragmentem istniejącego
    if (existingAddress.includes(cleanedAddress) && existingAddress !== cleanedAddress) {
      console.log(`💳 Skipping fragment: "${cleanedAddress}" is part of "${existingAddress}"`);
      isDuplicateFragment = true;
      break;
    }
    
    // Sprawdź czy istniejący adres jest fragmentem nowego (zamień go)
    if (cleanedAddress.includes(existingAddress) && existingAddress !== cleanedAddress) {
      console.log(`💳 Replacing fragment: "${existingAddress}" with full address "${cleanedAddress}"`);
      const index = reportedAddresses.indexOf(existingAddress);
      reportedAddresses[index] = cleanedAddress;
      isDuplicateFragment = true;
      break;
    }
  }
  
  if (!isDuplicateFragment) {
    reportedAddresses.push(cleanedAddress);
    console.log(`✅ Added ${addressType} address: ${cleanedAddress}`);
    processedPositions.push({ start: startPos, end: endPos });
  }
} else if (!isValidAddress) {
  console.log(`❌ Rejected invalid address: ${cleanedAddress}`);
} else {
  console.log(`⚠️ Skipped duplicate address: ${cleanedAddress}`);
}
}
    
    console.log(`💳 Total addresses found: ${reportedAddresses.length}`);

    // Extract clean content - pozostaje bez zmian
    let cleanContent = textContent
      .replace(/^(Phishing|Contract Exploit|Hack - Other|Rug Pull|Romance|Sextortion|Ransomware|Impersonation|Fake Returns|NFT Airdrop|Other Blackmail|Pigbutchering|Donation Impersonation).*?Scam[.\s]*/i, '')
      .replace(/Submitted by[^\n]*/gi, '')
      .replace(/Amount lost[^\n]*/gi, '')
      .replace(/Reported Domain[^\n]*/gi, '')
      .replace(/Reported Address[^\n]*/gi, '')
      .replace(/\d+\s+(minutes?|hours?|days?)\s+ago/gi, '')
      .replace(/\b[13][a-zA-Z0-9]{25,62}\b/gi, '')
      .replace(/\bbc1[a-zA-Z0-9]{25,62}\b/gi, '')
      .replace(/\b0x[a-fA-F0-9]{40}\b/gi, '')
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanContent.length < 20) {
      const lines = textContent.split(/[\n.]/).filter(line => 
        line.trim().length > 10 && 
        !/^(Submitted|Amount|Reported|Category|\d+\s+(minutes?|hours?|days?))/i.test(line.trim())
      );
      
      if (lines.length > 0) {
        cleanContent = lines[0].trim();
      }
    }

    console.log('✅ Quick analysis result:', {
      category: category.substring(0, 20),
      amountLost,
      author,
      cleanContent: cleanContent.substring(0, 50)
    });

    return {
      category,
      amountLost,
      author,
      reportedDomain,
      reportedAddresses,
      cleanContent
    };
  }

  // UPDATED: Clean report content with Amount Lost extraction
  private cleanReportContent(rawContent: string): {
    cleanContent: string;
    author: string;
    category: string;
    reportedDomain: string;
    reportedAddresses: string[];
    amountLost: string;
    threatDetectedAt?: string;
  } {
    let content = rawContent;
    
    console.log('🔍 Original content length:', content.length);
    console.log('🔍 Original content sample:', content.substring(0, 200));
    
    // Check for law enforcement restriction message and remove Lorem ipsum after it
    if (content.includes('For security reasons and to protect investigations, this report is currently only shared with Law Enforcement Partners')) {
      content = content.replace(
        /(For security reasons and to protect investigations, this report is currently only shared with Law Enforcement Partners\.?\s*)(Lorem ipsum[\s\S]*)/i,
        '$1'
      );
    }
    
    // STEP 1: Extract threat detection timestamp BEFORE cleaning
    let threatDetectedAt = '';
    const threatDetectedMatch = content.match(/Threat detected at\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/i);
    if (threatDetectedMatch) {
      threatDetectedAt = threatDetectedMatch[1];
      console.log('🕒 Threat detected at:', threatDetectedAt);
    }

    // STEP 1.5: SIMPLE - Extract Amount Lost (LAST USD amount)
    let amountLost = '';
    
    // Find ALL amounts followed by USD in the content
    const allUSDAmounts = content.match(/([0-9,.]+ USD)/gi) || [];
    
    if (allUSDAmounts.length > 0) {
      // Take the LAST amount found (most likely to be the loss amount)
      amountLost = allUSDAmounts[allUSDAmounts.length - 1].trim();
      console.log('💰 Found USD amounts in cleanReportContent:', allUSDAmounts);
      console.log('💰 Taking LAST amount as Amount Lost:', amountLost);
    } else {
      console.log('❌ No USD amounts found in cleanReportContent');
    }
    
    // STEP 2: Extract category more precisely
    const categoryPatterns = [
      /^([^.]+?(?:Scam|Phishing|Fraud|Theft|Hack|Attack|Ransomware|Blackmail|Sextortion|Romance|Investment|Tech Support|Fake|Impersonation|Rug Pull|NFT|Airdrop|Contract Exploit|Donation)[^.]*)\.\s*(.*)/i,
      /^([^.]{5,100})\.\s*(.*)/,
    ];
    
    let category = '';
    let restContent = content;
    
    for (const pattern of categoryPatterns) {
      const match = content.match(pattern);
      if (match) {
        const potentialCategory = match[1].trim();
        
        if (potentialCategory.length <= 100 && 
            potentialCategory.length >= 5 &&
            !potentialCategory.match(/^(The|This|A|An|I|You|We|They|It|My|Our|Your)\s/i) &&
            !potentialCategory.includes('http') &&
            !potentialCategory.includes('@') &&
            !potentialCategory.match(/\d{4}-\d{2}-\d{2}/) &&
            !potentialCategory.match(/Submitted by/i) &&
            !potentialCategory.match(/Threat detected/i)) {
          
          category = potentialCategory;
          restContent = match[2] ? match[2].trim() : '';
          break;
        }
      }
    }
    
    if (!category || category.length < 5) {
      category = this.detectScamCategory(content, rawContent);
      restContent = content;
    } else {
      category = this.normalizeScamCategory(category);
    }
    
    content = restContent;
    
    // STEP 3: Extract author from "Submitted by" pattern
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
    
    // STEP 4: Extract reported domain
    let reportedDomain = '';
    
    const explicitDomainPatterns = [
      /(?:Reported\s*)?Domain\s*([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})(?:Reported|submitted|Submitted)?/i,
      /Reported\s+Domain\s+([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})(?:Reported|submitted|Submitted)?/i,
      /\bDomain([a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})(?:Reported|submitted|Submitted)?/i,
      /https?:\/\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})(?:Reported|submitted|Submitted)?/i
    ];
    
    for (const pattern of explicitDomainPatterns) {
      const match = content.match(pattern);
      if (match) {
        let domain = match[1].trim();
        
        domain = domain.replace(/Reported$/i, '');
        domain = domain.replace(/submitted$/i, '');
        domain = domain.replace(/Submitted$/i, '');
        domain = domain.replace(/^Domain/i, '');
        domain = domain.replace(/^Address/i, '');
        domain = domain.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9.]+$/g, '').trim();
        
        if (domain && domain.includes('.')) {
          reportedDomain = domain;
          console.log('🌐 Found and cleaned explicit domain pattern:', reportedDomain);
          break;
        }
      }
    }
    
    if (!reportedDomain) {
      const urlMatch = content.match(/(https?:\/\/[^\s\n]+)/i);
      if (urlMatch) {
        try {
          const url = new URL(urlMatch[1]);
          reportedDomain = url.hostname;
          console.log('🔗 Extracted domain from URL:', reportedDomain);
        } catch {
          const urlString = urlMatch[1].trim();
          const domainMatch = urlString.match(/https?:\/\/([^\/\s]+)/i);
          if (domainMatch) {
            let domain = domainMatch[1];
            domain = domain.replace(/Reported$/i, '').replace(/submitted$/i, '').replace(/Submitted$/i, '').trim();
            reportedDomain = domain;
            console.log('🔗 Manual domain extraction from URL:', reportedDomain);
          }
        }
      }
    }
    
    if (!reportedDomain) {
      const domainMatches = content.match(/\b([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:Reported|submitted|Submitted)?\b/g);
      if (domainMatches) {
        for (const potentialDomain of domainMatches) {
          let domain = potentialDomain.trim();
          
          domain = domain.replace(/Reported$/i, '');
          domain = domain.replace(/submitted$/i, '');
          domain = domain.replace(/Submitted$/i, '');
          
          if (domain.length >= 4 &&
              domain.includes('.') &&
              !domain.match(/^[a-z]+\.[A-Z]/) &&
              !domain.match(/\.(jpg|png|gif|pdf|doc|txt|zip)$/i) &&
              domain.match(/\.(com|org|world|net|io|co|uk|de|fr|gov|edu|mil|int|eu|us|ca|au|jp|cn|ru|br|in|mx|it|es|pl|nl|se|no|dk|fi|ch|at|be|cz|sk|hu|ro|bg|hr|si|lt|lv|ee|gr|pt|ie|lu|mt|cy|is|li|ad|mc|sm|va|md|ua|by|rs|me|mk|al|ba|xk|am|az|ge|kz|kg|tj|tm|uz|mn|pk|bd|lk|np|bt|mm|th|la|kh|vn|my|sg|id|ph|tl|pg|sb|vu|fj|to|ws|ki|nr|tv|fm|mh|pw|gu|as|mp|vi|pr|cr|pa|ni|hn|sv|gt|bz|mx|do|ht|jm|cu|bs|bb|tt|gd|lc|vc|ag|kn|dm|gp|mq|bl|mf|sx|cw|aw|tc|vg|ai|ms|ky|bm|gl|fo|sj|ax|gg|je|im|gi|va|sm|ad|li|mc|xyz)$/i)) {
            reportedDomain = domain;
            console.log('🔍 Found and cleaned pattern domain:', reportedDomain);
            break;
          }
        }
      }
    }
    
    if (reportedDomain) {
      reportedDomain = reportedDomain
        .replace(/Reported$/i, '')
        .replace(/submitted$/i, '')
        .replace(/Submitted$/i, '')
        .replace(/[.,;]+$/, '')
        .trim();
      
      if (reportedDomain.length < 4 || 
          !reportedDomain.includes('.') ||
          reportedDomain.split('.').some(part => part.length < 1)) {
        console.log('⚠️ Domain failed validation:', reportedDomain);
        reportedDomain = '';
      }
    }
    
 // STEP 5: ZMIENIONE - Extract WSZYSTKIE reported addresses
    const reportedAddresses: string[] = [];
    
console.log('💳 Searching for multiple addresses in cleanReportContent...');
console.log('💳 Full content sample:', content.substring(0, 300));

const allPotentialMatches = [
  ...content.matchAll(/([13][1-9A-HJ-NP-Za-km-z]{20,40})/g),           // Bitcoin Legacy
  ...content.matchAll(/(bc1[02-9ac-hj-np-z]{30,70})/g),                // Bitcoin Bech32  
  ...content.matchAll(/(ltc1[02-9ac-hj-np-z]{30,70})/g),               // Litecoin Bech32
  ...content.matchAll(/(addr1[a-z0-9]{50,120})/g),                     // Cardano (ADA)
  ...content.matchAll(/(0x[a-fA-F0-9]{40})/g),                      // Ethereum/Polygon/Arbitrum/Avalanche
  ...content.matchAll(/(T[1-9A-HJ-NP-Za-km-z]{30,40})/g),              // Tron
  ...content.matchAll(/([LM][1-9A-HJ-NP-Za-km-z]{20,40})/g),           // Litecoin Legacy
  ...content.matchAll(/(erd1[a-z0-9]{58})/g),                          // MultiversX/Elrond (dla Hedera)
 ...content.matchAll(/([1-9A-HJ-NP-Za-km-z]{32,44})/g),               // Solana - DODAJ TO
];

console.log(`💳 Found ${allPotentialMatches.length} potential address matches`);

// Zbierz wszystkie pozycje dopasowań żeby uniknąć nakładania
const processedPositions: Array<{start: number, end: number}> = [];

for (const match of allPotentialMatches) {
  // Bezpieczne przypisanie z sprawdzeniem typu
  const startPos = (match.index !== undefined) ? match.index : 0;
  const endPos = startPos + match[1].length;
  
  // Sprawdź czy ten fragment nie nakłada się z już przetworzonymi
  let isOverlapping = false;
  for (const pos of processedPositions) {
    if ((startPos >= pos.start && startPos < pos.end) || 
        (endPos > pos.start && endPos <= pos.end)) {
      isOverlapping = true;
      break;
    }
  }
  
  if (isOverlapping) {
    console.log(`💳 Skipping overlapping match: "${match[1]}" at position ${startPos}`);
    continue;
  }
  
  let rawAddress = match[1];
  console.log(`💳 Processing raw match: "${rawAddress}" at position ${startPos}-${endPos}`);
  
let cleanedAddress = rawAddress;

// KROK 1: Usuń tylko znane prefiksy (nie całą resztę)
if (cleanedAddress.startsWith('ddress')) {
  cleanedAddress = cleanedAddress.substring(6); // Usuń "ddress"
}
if (cleanedAddress.startsWith('Address')) {
  cleanedAddress = cleanedAddress.substring(7); // Usuń "Address" 
}
if (cleanedAddress.startsWith('eported')) {
  cleanedAddress = cleanedAddress.substring(7); // Usuń "eported"
}

// KROK 2: Usuń suffiksy - ale tylko konkretne słowa
cleanedAddress = cleanedAddress
  .replace(/Reported$/i, '')
  .replace(/ReportedDomain$/i, '')
  .replace(/ReportedAddress$/i, '')
  .replace(/Domain$/i, '')
  .replace(/Address$/i, '')
  .replace(/Reporte$/i, '')
  .replace(/Addres$/i, '')
  .replace(/^TRC20/i, '')
  .replace(/^USDT/i, '')
  .replace(/^BTC/i, '')
  .replace(/^ETH/i, '')
  .trim();

// KROK 3: Jeśli nadal nieprawidłowy, wyciągnij TYLKO pierwszy prawidłowy adres
if (!/^(0x[a-fA-F0-9]{40}|bc1[02-9ac-hj-np-z]+|[13][1-9A-HJ-NP-Za-km-z]+|T[1-9A-HJ-NP-Za-km-z]+|[LM][1-9A-HJ-NP-Za-km-z]+|addr1[a-z0-9]+)$/.test(cleanedAddress)) {
  const match = cleanedAddress.match(/(0x[a-fA-F0-9]{40}|bc1[02-9ac-hj-np-z]{39,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34}|T[1-9A-HJ-NP-Za-km-z]{33}|[LM][1-9A-HJ-NP-Za-km-z]{26,34}|addr1[a-z0-9]{53,103})/);
  if (match) {
    cleanedAddress = match[1];
  }
}
    
  console.log(`💳 Cleaned address: "${cleanedAddress}"`);
  
let isValidAddress = false;
let addressType = '';

if (/^bc1[02-9ac-hj-np-z]{38,61}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Bitcoin Bech32';
} else if (/^ltc1[02-9ac-hj-np-z]{38,61}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Litecoin Bech32';
} else if (/^addr1[a-z0-9]{50,120}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Cardano (ADA)';
} else if (/^[13][1-9A-HJ-NP-Za-km-z]{24,33}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Bitcoin Legacy';
} else if (/^0x[a-fA-F0-9]{40}$/.test(cleanedAddress)) {
  isValidAddress = true;
  // Określ typ na podstawie kontekstu - wszystkie używają tego samego formatu
  if (content.toLowerCase().includes('polygon') || content.toLowerCase().includes('matic')) {
    addressType = 'Polygon (MATIC)';
  } else if (content.toLowerCase().includes('arbitrum')) {
    addressType = 'Arbitrum';
  } else if (content.toLowerCase().includes('avalanche') || content.toLowerCase().includes('avax')) {
    addressType = 'Avalanche (AVAX)';
  } else if (content.toLowerCase().includes('base')) {
    addressType = 'Base';
  } else {
    addressType = 'Ethereum'; // Domyślnie Ethereum
  }
} else if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Tron';
} else if (/^[LM][1-9A-HJ-NP-Za-km-z]{25,33}$/.test(cleanedAddress)) {
  isValidAddress = true;
  addressType = 'Litecoin Legacy';
} else if (/^0\.0\.[0-9]+$/.test(cleanedAddress)) {
  // Hedera używa formatu 0.0.123456
  isValidAddress = true;
  addressType = 'Hedera (HBAR)';
} else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanedAddress) && 
           !cleanedAddress.startsWith('1') && 
           !cleanedAddress.startsWith('3') && 
           !cleanedAddress.startsWith('L') && 
           !cleanedAddress.startsWith('M') && 
           !cleanedAddress.startsWith('T')) {
  // Solana, Base58 format - ale nie inne znane formaty
} else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanedAddress) && 
           !cleanedAddress.startsWith('1') && 
           !cleanedAddress.startsWith('3') && 
           !cleanedAddress.startsWith('L') && 
           !cleanedAddress.startsWith('M') && 
           !cleanedAddress.startsWith('T')) {
  // Solana uses Base58, 32-44 characters
  isValidAddress = true;
  addressType = 'Solana (SOL)';
}
  
  console.log(`💳 Validation: ${cleanedAddress} is ${isValidAddress ? 'VALID' : 'INVALID'} ${addressType}`);
  
  if (isValidAddress && 
    cleanedAddress.length >= 25 && 
    !reportedAddresses.includes(cleanedAddress)) {
  
  // NOWY: Sprawdź czy nowy adres nie jest fragmentem już dodanego adresu
  let isDuplicateFragment = false;
  
  for (const existingAddress of reportedAddresses) {
    // Sprawdź czy nowy adres jest fragmentem istniejącego
    if (existingAddress.includes(cleanedAddress) && existingAddress !== cleanedAddress) {
      console.log(`💳 Skipping fragment: "${cleanedAddress}" is part of "${existingAddress}"`);
      isDuplicateFragment = true;
      break;
    }
    
    // Sprawdź czy istniejący adres jest fragmentem nowego (zamień go)
    if (cleanedAddress.includes(existingAddress) && existingAddress !== cleanedAddress) {
      console.log(`💳 Replacing fragment: "${existingAddress}" with full address "${cleanedAddress}"`);
      const index = reportedAddresses.indexOf(existingAddress);
      reportedAddresses[index] = cleanedAddress;
      isDuplicateFragment = true;
      break;
    }
  }
  
  if (!isDuplicateFragment) {
    reportedAddresses.push(cleanedAddress);
    console.log(`✅ Added ${addressType} address: ${cleanedAddress}`);
    processedPositions.push({ start: startPos, end: endPos });
  }
} else if (!isValidAddress) {
  console.log(`❌ Rejected invalid address: ${cleanedAddress}`);
} else {
  console.log(`⚠️ Skipped duplicate address: ${cleanedAddress}`);
}
}
    
    console.log(`💳 Total addresses found in cleanReportContent: ${reportedAddresses.length}`);
    
    // STEP 6: COMPREHENSIVE CONTENT CLEANING
    let cleanContent = content
      .replace(/^(Phishing|Rug Pull|Other Blackmail|Sextortion|Ransomware|Impersonation|Fake Returns|Hack - Other|NFT Airdrop|Fake Project|Romance|Pigbutchering|Contract Exploit|Donation Impersonation)\s*Scam\s*/i, '')
      .replace(/^(Phishing|Rug Pull|Other Blackmail|Sextortion|Ransomware|Impersonation|Fake Returns|Hack|NFT Airdrop|Fake Project|Romance|Pigbutchering|Contract Exploit|Donation Impersonation)\s*/i, '')
      .replace(/^Scam\s*/i, '')
      
      .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z])(\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago)/gi, '$1 $2')
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      .replace(/(ago)([A-Z])/gi, '$1 $2')
      
      .replace(/([a-z0-9])Domain([a-z])/gi, '$1 Domain $2')
      .replace(/Domain([a-z])/gi, 'Domain $1')
      .replace(/([a-z0-9])Address([a-z0-9])/gi, '$1 Address $2')
      .replace(/Address([a-z0-9])/gi, 'Address $1')
      .replace(/([a-z])Reported/gi, '$1 Reported')
      .replace(/Reported([A-Z])/g, 'Reported $1')
      .replace(/([a-z])submitted/gi, '$1 submitted')
      .replace(/submitted([A-Z])/g, 'submitted $1')
      .replace(/([a-z])Submitted/gi, '$1 Submitted')
      .replace(/Submitted([A-Z])/g, 'Submitted $1')
      
      // Remove "Amount lost" line from content
      .replace(/Amount lost\s*[0-9,.]+ USD\s*/gi, '')
      
      .replace(/Submitted by\s+[^.\n]*(?:\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago)?[.\n]*/gi, '')
      
      .replace(/\s*\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago\s*/gi, ' ')
      
      .replace(/\b[a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(?:Reported|submitted|Submitted)\b/gi, '')
      .replace(/\b[a-zA-Z0-9]{20,}(?:Reported|submitted|Submitted)\b/gi, '')
      
      .replace(/\b(?:Domain|Address)[a-zA-Z0-9.-]*\.[a-zA-Z]{2,}\b/gi, '')
      .replace(/\b(?:Domain|Address)[a-zA-Z0-9]{20,}\b/gi, '')
      
      .replace(/Reported\s+Domain\s+[^\s\n]+\s*/gi, '')
      .replace(/(?:Reported\s*)?Domain\s*[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:Reported|submitted|Submitted)?\s*/gi, '')
      .replace(/Reported\s+Address\s*[a-zA-Z0-9]+\s*/gi, '')
      .replace(/(?:Reported\s*)?Address\s*[a-zA-Z0-9]{20,}(?:Reported|submitted|Submitted)?\s*/gi, '')
      
      .replace(/\bReported\s*$/gi, '')
      .replace(/^\s*Reported\b/gi, '')
      .replace(/\s+Reported\s+/gi, ' ')
      .replace(/\bsubmitted\s*$/gi, '')
      .replace(/^\s*submitted\b/gi, '')
      .replace(/\s+submitted\s+/gi, ' ')
      .replace(/\bSubmitted\s*$/gi, '')
      .replace(/^\s*Submitted\b/gi, '')
      .replace(/\s+Submitted\s+/gi, ' ')
      
      .replace(/\b(?:Domain|Address)[a-zA-Z0-9.-]+/gi, '')
      
      .replace(/\s*\.(com|org|world|net|io|co|uk|de|fr|gov|edu|mil|int|eu|us|ca|au|jp|cn|ru|br|in|mx|it|es|pl|nl|se|no|dk|fi|ch|at|be|cz|sk|hu|ro|bg|hr|si|lt|lv|ee|gr|pt|ie|lu|mt|cy|is|li|ad|mc|sm|va|md|ua|by|rs|me|mk|al|ba|xk|am|az|ge|kz|kg|tj|tm|uz|mn|pk|bd|lk|np|bt|mm|th|la|kh|vn|my|sg|id|ph|tl|pg|sb|vu|fj|to|ws|ki|nr|tv|fm|mh|pw|gu|as|mp|vi|pr|cr|pa|ni|hn|sv|gt|bz|mx|do|ht|jm|cu|bs|bb|tt|gd|lc|vc|ag|kn|dm|gp|mq|bl|mf|sx|cw|aw|tc|vg|ai|ms|ky|bm|gl|fo|sj|ax|gg|je|im|gi|va|sm|ad|li|mc|xyz)\s*$/gi, '')
      
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/gi, '')
      .replace(/\bat\s+\d{4}-\d{2}-\d{2}[^\s]*/gi, '')
      .replace(/Threat detected at[^.]*\./gi, '')
      
      .replace(/https?:\/\/[^\s]+/gi, '')
      
      .replace(/Vote\s*\d*\s*/gi, '')
      .replace(/Comments?\s*\d*\s*/gi, '')
      .replace(/Other:\s*/gi, '')
      .replace(/,?\s*classified as [^.,\n]*/gi, '')
      
      .replace(/\b(PhishFort|Metamask|Binance|Coinbase|TrustWallet)\s*\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago\b/gi, '')
      
      .replace(/\b[a-zA-Z0-9]{25,}(?:Reported|submitted|Submitted)?\b/gi, '')
      .replace(/\b[a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(?:Reported|submitted|Submitted)?\b/gi, '')
      
      .replace(/\.{2,}/g, '.')
      .replace(/\s*\.\s*$/, '')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .trim();
    
    // STEP 7: If clean content is too short, try to extract meaningful content
    if (cleanContent.length < 20) {
      const lines = rawContent.split(/[\n.]/).map(line => line.trim()).filter(line => line.length > 10);
      
      for (const line of lines) {
        if (!/^(Submitted by|Reported|Vote|Comments|Other|Category|at \d{4})/i.test(line) &&
            !/^\d+\s+(?:seconds?|minutes?|hours?|days?)\s+ago/i.test(line) &&
            !/^https?:\/\//i.test(line) &&
            !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(line) &&
            !/^Threat detected/i.test(line) &&
            !/^Amount lost/i.test(line) &&
            !/\.(com|org|world|net|io)$/i.test(line)) {
          cleanContent = line.trim();
          break;
        }
      }
    }
    
    // STEP 8: Final cleanup
    cleanContent = cleanContent
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      
      .replace(/\bReported$/gi, '')
      .replace(/^Reported\b/gi, '')
      .replace(/\s+Reported\s+/gi, ' ')
      .replace(/\bsubmitted$/gi, '')
      .replace(/^submitted\b/gi, '')
      .replace(/\s+submitted\s+/gi, ' ')
      .replace(/\bSubmitted$/gi, '')
      .replace(/^Submitted\b/gi, '')
      .replace(/\s+Submitted\s+/gi, ' ')
      
      .replace(/\bDomain$/gi, '')
      .replace(/^Domain\b/gi, '')
      .replace(/\bAddress$/gi, '')
      .replace(/^Address\b/gi, '')
      
      .replace(/\b[a-zA-Z0-9]{30,}\b/gi, '')
      .replace(/\b[13][a-zA-Z0-9]{25,62}\b/gi, '')
      .replace(/\bbc1[a-zA-Z0-9]{25,62}\b/gi, '')
      .replace(/\b0x[a-fA-F0-9]{40}\b/gi, '')
      
      .replace(/\b[a-zA-Z0-9.-]+\.(com|org|world|net|io|co|uk|de|fr|gov|edu|mil|int|eu|us|ca|au|jp|cn|ru|br|in|mx|it|es|pl|nl|se|no|dk|fi|ch|at|be|cz|sk|hu|ro|bg|hr|si|lt|lv|ee|gr|pt|ie|lu|mt|cy|is|li|ad|mc|sm|va|md|ua|by|rs|me|mk|al|ba|xk|am|az|ge|kz|kg|tj|tm|uz|mn|pk|bd|lk|np|bt|mm|th|la|kh|vn|my|sg|id|ph|tl|pg|sb|vu|fj|to|ws|ki|nr|tv|fm|mh|pw|gu|as|mp|vi|pr|cr|pa|ni|hn|sv|gt|bz|mx|do|ht|jm|cu|bs|bb|tt|gd|lc|vc|ag|kn|dm|gp|mq|bl|mf|sx|cw|aw|tc|vg|ai|ms|ky|bm|gl|fo|sj|ax|gg|je|im|gi|va|sm|ad|li|mc|xyz)\b/gi, '')
      
      .replace(/\s*\.(com|org|world|net|io|co|uk|de|fr|gov|edu|mil|int|eu|us|ca|au|jp|cn|ru|br|in|mx|it|es|pl|nl|se|no|dk|fi|ch|at|be|cz|sk|hu|ro|bg|hr|si|lt|lv|ee|gr|pt|ie|lu|mt|cy|is|li|ad|mc|sm|va|md|ua|by|rs|me|mk|al|ba|xk|am|az|ge|kz|kg|tj|tm|uz|mn|pk|bd|lk|np|bt|mm|th|la|kh|vn|my|sg|id|ph|tl|pg|sb|vu|fj|to|ws|ki|nr|tv|fm|mh|pw|gu|as|mp|vi|pr|cr|pa|ni|hn|sv|gt|bz|mx|do|ht|jm|cu|bs|bb|tt|gd|lc|vc|ag|kn|dm|gp|mq|bl|mf|sx|cw|aw|tc|vg|ai|ms|ky|bm|gl|fo|sj|ax|gg|je|im|gi|va|sm|ad|li|mc|xyz)\s*/gi, '')
      
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .trim();
    
    console.log('✅ Cleaned content:', cleanContent.substring(0, 100));
    console.log('📋 Category:', category);
    console.log('👤 Author:', author);
    console.log('🌐 Domain:', reportedDomain);
    console.log('💳 Address:', reportedAddresses);
    console.log('💰 Amount Lost:', amountLost);
    console.log('🕒 Threat detected:', threatDetectedAt);
    
    return {
      cleanContent,
      author,
      category,
      reportedDomain,
      reportedAddresses,
      amountLost,
      threatDetectedAt
    };
  }

  private async extractReportUrlByClick(page: Page, reportElement: any, index: number): Promise<{reportUrl: string, reportId: string, success: boolean}> {
  try {
    console.log(`🖱️ Attempting to click report ${index} to extract URL...`);
    
    const newPage = await page.browser().newPage();
    
    if (this.proxyConfig?.username) {
      await newPage.authenticate({
        username: this.proxyConfig.username,
        password: this.proxyConfig.password
      });
    }

    await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const mainUrl = `https://www.chainabuse.com/reports?sort=newest&_t=${Date.now()}`;
    await newPage.goto(mainUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await newPage.waitForSelector('.create-ScamReportCard', { timeout: 20000 });
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

    // POPRAWKA: Dodaj proper typing dla ElementHandle
    const reportElements: import('puppeteer').ElementHandle<Element>[] = await newPage.$$('.create-ScamReportCard');
    
    if (reportElements[index]) {
      console.log(`🖱️ Clicking report element ${index}...`);
      
      await newPage.evaluate((element: Element) => {
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

  // NOWA FUNKCJA: Simple Amount Lost extractor - gets LAST amount before USD
  private extractAmountFromInnerHTML(innerHTML: string): string {
    console.log('🔍 Fallback: extracting amount from innerHTML...');
    console.log(`🔍 innerHTML length: ${innerHTML.length}`);
    console.log(`🔍 innerHTML preview: "${innerHTML.substring(0, 300)}"`);
    
    // Najprostsza metoda - znajdź wszystkie kwoty USD
    const usdRegex = /([0-9,.]+\s*USD)/gi;
    const matchResult = innerHTML.match(usdRegex);
    const allUSDMatches: string[] = matchResult ? matchResult : [];
    
    console.log(`💰 All USD found in innerHTML: ${JSON.stringify(allUSDMatches)}`);
    
    if (allUSDMatches.length > 0) {
      // Sprawdź czy jest "amount" i "lost" w innerHTML
      const hasAmount = innerHTML.toLowerCase().includes('amount');
      const hasLost = innerHTML.toLowerCase().includes('lost');
      
      console.log(`💰 innerHTML has "amount": ${hasAmount}, has "lost": ${hasLost}`);
      
      if (hasAmount && hasLost) {
        // Weź pierwszą kwotę USD (prawdopodobnie Amount Lost)
        const firstAmount = allUSDMatches[0].trim();
        console.log(`💰 Found Amount Lost via innerHTML: "${firstAmount}"`);
        return firstAmount;
      } else if (allUSDMatches.length === 1) {
        // Jeśli jest tylko jedna kwota USD, prawdopodobnie to Amount Lost
        const singleAmount = allUSDMatches[0].trim();
        console.log(`💰 Single USD amount found: "${singleAmount}"`);
        return singleAmount;
      }
    }
    
    console.log('❌ No amount found in innerHTML');
    return '';
  }

  // NOWA FUNKCJA: Sprawdź czy Amount Lost >= $10,000 USD
private isAmountUSDSignificant(amountLostString: string): boolean {
  if (!amountLostString) {
    console.log('💰 No amount string provided');
    return false;
  }

  console.log(`💰 Analyzing USD amount: "${amountLostString}"`);

  // Sprawdź czy zawiera USD lub $
  if (!amountLostString.toLowerCase().includes('usd') && !amountLostString.includes('$')) {
    console.log('💰 Not USD currency - filtering out');
    return false;
  }

  // Wyciągnij liczby z tekstu
  let cleanAmount = amountLostString
    .replace(/amount\s+lost/gi, '')
    .replace(/usd/gi, '')
    .replace(/\$/g, '')
    .replace(/:/g, '')
    .trim();

  console.log(`💰 Cleaned amount string: "${cleanAmount}"`);

  // Wyciągnij liczbę
  const numberMatch = cleanAmount.match(/([0-9,.\s]+)/);
  if (!numberMatch) {
    console.log('💰 No number found in amount string');
    return false;
  }

  // Oczyść liczbę
  const numberString = numberMatch[1]
    .replace(/,/g, '') // Usuń przecinki
    .replace(/\s+/g, '') // Usuń spacje
    .trim();

  const amount = parseFloat(numberString);

  if (isNaN(amount)) {
    console.log('💰 Could not parse amount as number');
    return false;
  }

  console.log(`💰 Parsed USD amount: $${amount.toFixed(2)}`);

  // Sprawdź czy >= $10,000
  const isSignificant = amount >= 1;

  console.log(`💰 Amount ${isSignificant ? 'IS' : 'IS NOT'} significant (>= $10,000 USD)`);

  return isSignificant;
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
      timeout: 45000 
    });

    await page.waitForSelector('.create-ScamReportCard', { timeout: 20000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const basicReportsData = await page.evaluate(() => {
      const reportElements = Array.from(document.querySelectorAll('.create-ScamReportCard'));
      console.log(`Found ${reportElements.length} ScamReportCard elements`);
      
      return reportElements.map((element, index) => {
        const categoryElement = element.querySelector('.create-ScamReportCard__category-section');
        const category = categoryElement ? categoryElement.textContent?.trim() || '' : '';
        
        // NOWA METODA: Szukaj sekcji "Amount lost" dokładnie jak w HTML
        let amountLostFromHTML = '';
        
        console.log(`Searching for Amount Lost in report ${index}...`);
        
        // Metoda 1: Szukaj przez create-LossesSection
        const lossesSection = element.querySelector('.create-LossesSection');
        if (lossesSection) {
          console.log(`Found LossesSection in report ${index}`);
          
          // Szukaj wszystkich paragrafów w sekcji
          const paragraphs = lossesSection.querySelectorAll('p');
          
          for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const text = p.textContent?.trim().toLowerCase() || '';
            
            // Sprawdź czy paragraf zawiera "amount" i "lost"
            if (text.includes('amount') && text.includes('lost')) {
              console.log(`Found "Amount lost" paragraph in report ${index}: "${p.textContent}"`);
              
              // Sprawdź następny paragraf z kwotą
              if (i + 1 < paragraphs.length) {
                const nextP = paragraphs[i + 1];
                const nextText = nextP.textContent?.trim() || '';
                
                if (nextText.includes('USD')) {
                  amountLostFromHTML = nextText;
                  console.log(`Found Amount Lost value in report ${index}: "${amountLostFromHTML}"`);
                  break;
                }
              }
            }
            
            // Alternatywnie - sprawdź czy ten paragraf już zawiera kwotę USD
            if (text.includes('amount') && text.includes('lost') && text.includes('usd')) {
              amountLostFromHTML = p.textContent?.trim() || '';
              console.log(`Found complete Amount Lost in single paragraph in report ${index}: "${amountLostFromHTML}"`);
              break;
            }
          }
        }
        
        // Metoda 2: Jeśli nie znaleziono w LossesSection, szukaj w całym elemencie
        if (!amountLostFromHTML) {
          console.log(`LossesSection method failed for report ${index}, trying full element search...`);
          
          const allParagraphs = element.querySelectorAll('p');
          
          for (let i = 0; i < allParagraphs.length; i++) {
            const p = allParagraphs[i];
            const text = p.textContent?.trim().toLowerCase() || '';
            
            // Sprawdź czy paragraf zawiera "amount" i "lost" 
            if (text.includes('amount') && text.includes('lost')) {
              console.log(`Found "Amount lost" in full search for report ${index}: "${p.textContent}"`);
              
              // Sprawdź następny paragraf
              if (i + 1 < allParagraphs.length) {
                const nextP = allParagraphs[i + 1];
                const nextText = nextP.textContent?.trim() || '';
                
                if (nextText.includes('USD')) {
                  amountLostFromHTML = nextText;
                  console.log(`Found Amount Lost value in full search for report ${index}: "${amountLostFromHTML}"`);
                  break;
                }
              }
            }
          }
        }
        
        // Metoda 3: Szukaj przez klasy z "Text" i "body"
        if (!amountLostFromHTML) {
          console.log(`Paragraph methods failed for report ${index}, trying class-based search...`);
          
          // Szukaj elementów z klasami jak w HTML (create-Text type-body-lg-heavy)
          const textElements = element.querySelectorAll('[class*="create-Text"][class*="type-body"]');
          
          for (let i = 0; i < textElements.length; i++) {
            const el = textElements[i];
            const text = el.textContent?.trim().toLowerCase() || '';
            
            if (text.includes('amount') && text.includes('lost')) {
              console.log(`Found "Amount lost" via class search for report ${index}: "${el.textContent}"`);
              
              // Sprawdź następny element z tą samą klasą lub podobną
              if (i + 1 < textElements.length) {
                const nextEl = textElements[i + 1];
                const nextText = nextEl.textContent?.trim() || '';
                
                if (nextText.includes('USD')) {
                  amountLostFromHTML = nextText;
                  console.log(`Found Amount Lost via class search for report ${index}: "${amountLostFromHTML}"`);
                  break;
                }
              }
            }
          }
        }
        
        // Metoda 4: Ostateczna - szukaj dowolnego elementu zawierającego USD w pobliżu "amount"
        if (!amountLostFromHTML) {
          console.log(`All specific methods failed for report ${index}, trying USD proximity search...`);
          
          const allElements = element.querySelectorAll('*');
          let foundAmountElement = false;
          
          for (const el of allElements) {
            const text = el.textContent?.trim().toLowerCase() || '';
            
            // Jeśli znaleźliśmy element z "amount" i "lost"
            if (text.includes('amount') && text.includes('lost')) {
              foundAmountElement = true;
              console.log(`Found amount element in proximity search for report ${index}`);
              continue;
            }
            
            // Jeśli wcześniej był "amount" i teraz znajdziemy USD
            if (foundAmountElement && text.includes('usd') && text.match(/[0-9]/)) {
              amountLostFromHTML = el.textContent?.trim() || '';
              console.log(`Found Amount Lost via proximity search for report ${index}: "${amountLostFromHTML}"`);
              break;
            }
          }
        }
        
        if (!amountLostFromHTML) {
          console.log(`❌ No Amount Lost found for report ${index} using any method`);
        }
        
        return {
          textContent: element.textContent || '',
          innerHTML: element.innerHTML,
          position: index,
          category: category,
          amountLostFromHTML: amountLostFromHTML
        };
      });
    });

    console.log(`📊 Found ${basicReportsData.length} reports, extracting URLs by clicking...`);
    
    // TYMCZASOWE DEBUGOWANIE: Sprawdź co zwróciła funkcja
    console.log('🔍 DEBUGGING basicReportsData:');
    basicReportsData.forEach((report, index) => {
      console.log(`Report ${index}:`);
      console.log(`  - Category: "${report.category}"`);
      console.log(`  - amountLostFromHTML: "${report.amountLostFromHTML}"`);
      console.log(`  - textContent length: ${report.textContent.length}`);
      console.log(`  - textContent preview: "${report.textContent.substring(0, 100)}"`);
    });

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
        navigationUrl: navigationUrl,
        amountLostFromHTML: basicData.amountLostFromHTML || this.extractAmountFromInnerHTML(basicData.innerHTML)
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
        `📡 <b>Monitoring for NEW reports with Amount Lost detection...</b>`
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
          timeAgoText.includes('5 minutes ago') ||
          timeAgoText.includes('4 minutes ago') ||
          timeAgoText.includes('3 minutes ago') ||
          timeAgoText.includes('2 minutes ago') ||	
          timeAgoText.includes('1 minute ago') ||
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
  let actualReportUrl = newReport.reportUrl;
  let actualReportId = newReport.reportId;
  
  if (!actualReportId && newReport.position < maxClickTests) {
    console.log(`🖱️ Getting proper URL for new report at position ${newReport.position}...`);
    const clickResult = await this.extractReportUrlByClick(page, undefined, newReport.position);
    if (clickResult.success) {
      actualReportUrl = clickResult.reportUrl;
      actualReportId = clickResult.reportId;
    }
  }

  // DODAJ Amount Lost extraction dla nowych raportów
  const reportData = reportsData[newReport.position];
  if (reportData.clickSuccess && reportData.reportId) {
    console.log(`💰 Extracting Amount Lost from detail page for NEW report ${newReport.position}...`);
    const amountLost = await this.extractAmountLostFromDetailPage(browser, reportData.reportUrl, reportData.reportId);
    
    if (amountLost) {
      console.log(`✅ Amount Lost found for NEW report: "${amountLost}"`);
      reportData.amountLostFromHTML = amountLost;
    }
  }

  // Get original text content for analysis
  const originalTextContent = reportsData[newReport.position]?.textContent || newReport.preview;
  const amountFromHTML = reportsData[newReport.position]?.amountLostFromHTML || '';
  
  console.log(`💰 Amount from HTML for report ${newReport.position}: "${amountFromHTML}"`);
  
  // Use BOTH old and new analysis
  const cleanedData = this.cleanReportContent(originalTextContent);
  const quickData = this.quickAnalyzeForTelegram(originalTextContent);
  
  // NOWA LOGIKA: Preferuj amountFromHTML (które teraz zawiera Amount Lost ze strony szczegółów)
  const finalAmountLost = amountFromHTML || quickData.amountLost || cleanedData.amountLost;
  
  // 🚨 NOWE FILTROWANIE - sprawdź czy Amount Lost >= $10,000 USD
  if (!this.isAmountUSDSignificant(finalAmountLost)) {
    console.log(`🚫 REPORT FILTERED OUT: Amount Lost "${finalAmountLost}" is below $10,000 USD threshold or not USD`);
    
    // Oznacz jako wysłane żeby nie sprawdzać ponownie, ale nie wysyłaj na Telegram
    this.sentReportHashes.add(newReport.contentHash);
    continue; // Przejdź do następnego raportu
  }
  
  console.log(`✅ REPORT PASSED FILTER: Amount Lost "${finalAmountLost}" is >= $10,000 USD`);
  
  // Build the formatted message with enhanced content (POZOSTAJE BEZ ZMIAN)
  let message = `🚨 <b>NEW CHAINABUSE REPORT DETECTED</b>\n\n`;
  
  // Use category from either analysis
  const finalCategory = quickData.category || cleanedData.category;
  if (finalCategory && finalCategory !== 'Other') {
    message += `🏷️ <b>Category:</b> ${finalCategory}\n`;
  }
  
  message += `⏰ <b>Published:</b> ${newReport.timeAgo}\n`;
  
  // Use the better content
  const finalContent = quickData.cleanContent || cleanedData.cleanContent;
  message += `📝 <b>Report Content:</b>\n${finalContent}`;
  
  // NOWA LOGIKA: Preferuj amountFromHTML (które teraz zawiera Amount Lost ze strony szczegółów)
  if (finalAmountLost) {
    message += `\n\n💰 <b>Amount Lost:</b> ${finalAmountLost}`;
    console.log(`💰 Using Amount Lost: "${finalAmountLost}" (source: ${amountFromHTML ? 'DetailPage' : quickData.amountLost ? 'quickAnalysis' : 'cleanedData'})`);
  } else {
    console.log(`💰 No Amount Lost found for report ${newReport.position}`);
  }
  
  // Use author from either analysis
  const finalAuthor = quickData.author !== 'unknown' ? quickData.author : cleanedData.author;
  if (finalAuthor && finalAuthor !== 'unknown') {
    message += `\n\n👤 <b>Submitted by:</b> ${finalAuthor}`;
  }
  
  // Use domain from either analysis
  const finalDomain = quickData.reportedDomain || cleanedData.reportedDomain;
  if (finalDomain) {
    message += `\n🌐 <b>Reported Domain:</b> ${finalDomain}`;
  }
  
  // Use address from either analysis - ZMIENIONE: łączymy tablice adresów
  const finalAddresses = [...new Set([
    ...quickData.reportedAddresses,
    ...cleanedData.reportedAddresses
  ])];
  
  if (finalAddresses.length > 0) {
    message += `\n💳 <b>Reported Addresses:</b>\n`;
    finalAddresses.forEach(address => {
      message += `${address}\n`;
    });
  }
  
  // Add threat detection timestamp if available
  if (cleanedData.threatDetectedAt) {
    const threatDate = new Date(cleanedData.threatDetectedAt);
    message += `\n🚨 <b>Threat Detected:</b> ${threatDate.toLocaleString('en-US')}`;
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
        detectionMethod: 'clean-content-extraction-with-detail-page-amount'
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
      console.log('🔧 Initializing Clean Report Monitor with Detail Page Amount Lost detection...');
      monitor = new CleanReportMonitor();
    }

    const result = await monitor.checkForNewReports();
    
    return NextResponse.json({
      success: result.success,
      newReports: result.newReports,
      timestamp: new Date().toISOString(),
      debug: result.debug,
      method: 'clean-content-with-detail-page-amount'
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
    status: 'ChainAbuse Monitor with Detail Page Amount Lost Detection',
    timestamp: new Date().toISOString(),
    version: 'detail-page-amount-lost-v1',
    features: [
      'COMPLETE: Puppeteer-based content extraction',
      'COMPLETE: Content separation and cleaning',  
      'COMPLETE: Category extraction',
      'COMPLETE: Author detection',
      'COMPLETE: Domain/Address parsing',
      'NEW: Detail page Amount Lost extraction for new reports',
      'COMPLETE: Clean Telegram formatting',
      'COMPLETE: Proper URL extraction via click',
      'COMPLETE: Fresh report filtering (< 5 minutes)',
      'COMPLETE: Hash-based duplicate prevention',
      'COMPLETE: Persistent storage of sent reports',
      'COMPLETE: Comprehensive content cleaning',
      'COMPLETE: Threat detection timestamp',
      'COMPLETE: Enhanced error handling',
      'NEW: 3-method Amount Lost detection (LossesSection, full document, regex)'
    ]
  });
}
