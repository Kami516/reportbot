// app/api/monitor-chainabuse/route.ts - Working Monitor Final
import { NextRequest, NextResponse } from 'next/server';
import { parseProxyConfig, fetchWithProxy } from '../../../utils/proxy';

class WorkingMonitorFinal {
  private telegramBotToken: string;
  private telegramChatId: string;
  private lastPageSignature: string = '';
  private lastModified: string = '';
  private lastEtag: string = '';
  private checkCount: number = 0;
  private proxyConfig: any;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID!;
    this.proxyConfig = parseProxyConfig(process.env.PROXY_CONFIG!);
  }

  private async fetchPageWithHeaders(): Promise<{ 
    content: string; 
    length: number; 
    lastModified: string; 
    etag: string;
    signature: string;
  }> {
    // Użyj cache-busting URL
    const timestamp = Date.now();
    const urls = [
      `https://www.chainabuse.com/reports?sort=newest&_cachebust=${timestamp}`,
      `https://www.chainabuse.com/reports?t=${timestamp}&refresh=1`,
      `https://www.chainabuse.com/reports?nocache=${Math.random()}`
    ];

    for (const url of urls) {
      try {
        console.log(`🔄 Próba: ${url.substring(0, 60)}...`);
        
        const headers: any = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'If-None-Match': '', // Force fresh content
          'If-Modified-Since': '' // Force fresh content
        };

        const response = await fetchWithProxy(url, { headers }, this.proxyConfig);
        
        if (response.ok) {
          const content = await response.text();
          const lastModified = response.headers.get('last-modified') || '';
          const etag = response.headers.get('etag') || '';
          
          // Stwórz sygnaturę strony (kombinacja długości, hash i czasów)
          const signature = this.createPageSignature(content, lastModified, etag);
          
          console.log(`✅ Pobrano: ${content.length} znaków, signature: ${signature.substring(0, 12)}`);
          
          return {
            content,
            length: content.length,
            lastModified,
            etag,
            signature
          };
        } else {
          console.log(`❌ HTTP ${response.status}`);
        }
      } catch (error: any) {
        console.log(`💥 Error: ${error.message}`);
      }
      
      // Przerwa między próbami
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Nie udało się pobrać strony');
  }

  private createPageSignature(content: string, lastModified: string, etag: string): string {
    // Stwórz unikalną sygnaturę na podstawie:
    // 1. Długości contentu
    // 2. Hash z fragmentów contentu
    // 3. Last-Modified header
    // 4. ETag header
    // 5. Obecnego czasu dla cache-busting
    
    const length = content.length;
    
    // Hash z początkowych, środkowych i końcowych fragmentów
    const startHash = this.simpleHash(content.substring(0, 1000));
    const middleHash = this.simpleHash(content.substring(Math.floor(content.length / 2), Math.floor(content.length / 2) + 1000));
    const endHash = this.simpleHash(content.substring(Math.max(0, content.length - 1000)));
    
    // Kombinuj wszystko w jedną sygnaturę
    const signature = `${length}_${startHash}_${middleHash}_${endHash}_${lastModified}_${etag}_${Date.now()}`;
    
    return this.simpleHash(signature);
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
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
      
      console.log('✅ Wiadomość Telegram wysłana');
    } catch (error: any) {
      console.error('❌ Błąd Telegram:', error.message);
      throw error;
    }
  }

  private extractQuickInfo(content: string): any {
    // Szybka analiza contentu dla dodatkowych informacji
    const info = {
      contentLength: content.length,
      
      // Wzorce które mogą wskazywać na raporty
      submittedByMatches: (content.match(/submitted by/gi) || []).length,
      timeAgoMatches: (content.match(/\d+\s+(minutes?|hours?|days?)\s+ago/gi) || []).length,
      reportWordCount: (content.match(/report/gi) || []).length,
      scamWordCount: (content.match(/scam/gi) || []).length,
      
      // Sprawdź czy są jakieś adresy
      hasBitcoinAddresses: /\b(bc1|[13])[a-zA-Z0-9]{25,62}\b/.test(content),
      hasEthereumAddresses: /\b0x[a-fA-F0-9]{40}\b/.test(content),
      
      // Sprawdź struktury
      hasReportStructure: content.includes('ScamReportCard') || content.includes('reportcard'),
      hasApiData: content.includes('__NEXT_DATA__') && content.includes('api.chainabuse.com'),
      
      // Hash dla szybkiego porównania
      quickHash: this.simpleHash(content.substring(0, 5000))
    };
    
    return info;
  }

  public async checkForNewReports(): Promise<{ newReports: number; success: boolean; debug?: any }> {
    try {
      const currentTime = new Date();
      this.checkCount++;
      
      console.log(`🚀 Working Monitor Final check #${this.checkCount}: ${currentTime.toLocaleTimeString('pl-PL')}`);
      
      // Pobierz stronę z nagłówkami
      const pageData = await this.fetchPageWithHeaders();
      
      // Szybka analiza
      const quickInfo = this.extractQuickInfo(pageData.content);
      
      // Sprawdź czy strona się zmieniła
      const pageChanged = pageData.signature !== this.lastPageSignature;
      const modifiedChanged = pageData.lastModified !== this.lastModified;
      const etagChanged = pageData.etag !== this.lastEtag;
      
      console.log(`🔍 Zmiany: signature=${pageChanged}, modified=${modifiedChanged}, etag=${etagChanged}`);
      
      const debug = {
        checkNumber: this.checkCount,
        pageData: {
          length: pageData.length,
          signature: pageData.signature.substring(0, 12),
          lastModified: pageData.lastModified,
          etag: pageData.etag
        },
        quickInfo,
        changes: {
          pageChanged,
          modifiedChanged,
          etagChanged
        },
        previous: {
          signature: this.lastPageSignature.substring(0, 12),
          lastModified: this.lastModified,
          etag: this.lastEtag
        }
      };

      // Pierwsze sprawdzenie - zapisz stan bazowy
      if (this.checkCount === 1) {
        this.lastPageSignature = pageData.signature;
        this.lastModified = pageData.lastModified;
        this.lastEtag = pageData.etag;
        
        await this.sendTelegramMessage(
          `🔍 <b>Working Monitor Final uruchomiony!</b>\n\nStan bazowy:\n📄 Długość: ${pageData.length} znaków\n📊 "submitted by": ${quickInfo.submittedByMatches}\n⏰ Wzorce czasu: ${quickInfo.timeAgoMatches}\n📋 "report": ${quickInfo.reportWordCount}\n🚨 "scam": ${quickInfo.scamWordCount}\n\n🔗 Struktura: ${quickInfo.hasReportStructure ? '✅' : '❌'}\n📡 API data: ${quickInfo.hasApiData ? '✅' : '❌'}\n₿ Bitcoin adresy: ${quickInfo.hasBitcoinAddresses ? '✅' : '❌'}\n\nKonfiguracja:\n✅ Proxy: state.decodo.com:17200\n✅ Telegram: działa\n✅ Cache-busting: aktywny\n\nMonitoruję zmiany sygnatur!\n\n⚡ <i>Working Final - wykrywa każdą zmianę</i>`
        );
        
        return { newReports: 0, success: true, debug };
      }

      // Sprawdź czy są jakiekolwiek zmiany
      const anyChange = pageChanged || modifiedChanged || etagChanged;
      
      if (anyChange) {
        console.log(`🚨 ZMIANA WYKRYTA!`);
        
        // Określ typ zmiany
        let changeType = [];
        if (pageChanged) changeType.push('treść strony');
        if (modifiedChanged) changeType.push('Last-Modified');
        if (etagChanged) changeType.push('ETag');
        
        const changeDescription = changeType.join(', ');
        
        await this.sendTelegramMessage(
          `🚨 <b>ZMIANA na ChainAbuse wykryta!</b>\n\n⏰ <b>Czas:</b> ${currentTime.toLocaleString('pl-PL')}\n📊 <b>Sprawdzenie #${this.checkCount}</b>\n\n🔄 <b>Typ zmian:</b> ${changeDescription}\n📄 <b>Długość:</b> ${pageData.length} znaków\n📊 <b>"submitted by":</b> ${quickInfo.submittedByMatches}\n⏰ <b>Wzorce czasu:</b> ${quickInfo.timeAgoMatches}\n\n🆕 <b>Sygnatura:</b> ${pageData.signature.substring(0, 12)}\n📅 <b>Last-Modified:</b> ${pageData.lastModified || 'brak'}\n🏷️ <b>ETag:</b> ${pageData.etag.substring(0, 20) || 'brak'}\n\n✅ <b>Prawdopodobnie nowy raport!</b>\n\n🔗 https://www.chainabuse.com/reports\n\n💡 <i>Sprawdź stronę dla szczegółów nowego raportu</i>`
        );
        
        // Zaktualizuj zapisane wartości
        this.lastPageSignature = pageData.signature;
        this.lastModified = pageData.lastModified;
        this.lastEtag = pageData.etag;
        
        return { newReports: 1, success: true, debug };
      } else {
        console.log('ℹ️ Brak zmian');
        return { newReports: 0, success: true, debug };
      }

    } catch (error: any) {
      console.error('💥 Working Monitor Final error:', error);
      return { newReports: 0, success: false, debug: { error: error.message, checkNumber: this.checkCount } };
    }
  }
}

// Globalna instancja
let monitor: WorkingMonitorFinal | null = null;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID || !process.env.PROXY_CONFIG) {
      return NextResponse.json({ 
        error: 'Brak konfiguracji - sprawdź TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID i PROXY_CONFIG w .env.local',
        success: false,
        newReports: 0
      }, { status: 500 });
    }

    if (!monitor) {
      console.log('🔧 Inicjalizacja Working Monitor Final...');
      monitor = new WorkingMonitorFinal();
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
    status: 'Working Monitor Final - Change Detection',
    timestamp: new Date().toISOString(),
    version: 'working-final-v1',
    features: [
      'Multi-URL cache busting',
      'Page signature detection', 
      'Last-Modified monitoring',
      'ETag change detection',
      'Content hash comparison',
      'Immediate change alerts',
      'Proxy support',
      'Reliable change detection'
    ]
  });
}