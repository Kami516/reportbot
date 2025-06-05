// startup/monitor.ts - Server-side auto-start monitor
import { parseProxyConfig, fetchWithProxy } from '../utils/proxy';

class ServerSideMonitor {
  private telegramBotToken: string;
  private telegramChatId: string;
  private isRunning: boolean = false;
  private interval: NodeJS.Timeout | null = null;
  private lastPageSignature: string = '';
  private checkCount: number = 0;
  private proxyConfig: any;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID!;
    this.proxyConfig = parseProxyConfig(process.env.PROXY_CONFIG!);
  }

  private log(message: string) {
    const timestamp = new Date().toLocaleTimeString('en-US');
    console.log(`[${timestamp}] 🤖 Monitor: ${message}`);
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
      
      this.log('✅ Telegram message sent successfully');
    } catch (error: any) {
      this.log(`❌ Telegram error: ${error.message}`);
      throw error;
    }
  }

  private async fetchPageData(): Promise<{ content: string; signature: string }> {
    const timestamp = Date.now();
    const url = `https://www.chainabuse.com/reports?sort=newest&_cachebust=${timestamp}`;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };

    const response = await fetchWithProxy(url, { headers }, this.proxyConfig);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();
    const signature = this.createPageSignature(content);
    
    return { content, signature };
  }

  private createPageSignature(content: string): string {
    const length = content.length;
    const startHash = this.simpleHash(content.substring(0, 1000));
    const middleHash = this.simpleHash(content.substring(Math.floor(content.length / 2), Math.floor(content.length / 2) + 1000));
    const endHash = this.simpleHash(content.substring(Math.max(0, content.length - 1000)));
    const signature = `${length}_${startHash}_${middleHash}_${endHash}_${Date.now()}`;
    return this.simpleHash(signature);
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private async checkForChanges(): Promise<void> {
    try {
      this.checkCount++;
      this.log(`🔍 Check #${this.checkCount} - Fetching ChainAbuse...`);

      const { content, signature } = await this.fetchPageData();

      // First check - establish baseline
      if (this.checkCount === 1) {
        this.lastPageSignature = signature;
        
        await this.sendTelegramMessage(
          `🚀 <b>Server-Side Monitor Started!</b>\n\n⚡ <b>Auto-started on server launch</b>\n📊 Check #${this.checkCount}\n📄 Content length: ${content.length} chars\n🔒 Baseline signature: ${signature.substring(0, 12)}\n\n✅ <b>Monitoring active</b>\n🔄 Checking every 30 seconds\n🤖 <b>No browser required!</b>\n\n💡 <i>This monitor runs on the server and doesn't need a browser window open.</i>`
        );
        
        this.log('✅ Baseline established');
        return;
      }

      // Check for changes
      if (signature !== this.lastPageSignature) {
        this.log('🚨 CHANGE DETECTED!');
        
        await this.sendTelegramMessage(
          `🚨 <b>NEW REPORT DETECTED!</b>\n\n⏰ <b>Time:</b> ${new Date().toLocaleString('en-US')}\n📊 <b>Check #${this.checkCount}</b>\n\n🆕 <b>New signature:</b> ${signature.substring(0, 12)}\n📄 <b>Content length:</b> ${content.length} chars\n\n🔄 <b>Change detected via server monitoring</b>\n✅ <b>Likely new ChainAbuse report!</b>\n\n🔗 https://www.chainabuse.com/reports\n\n💡 <i>Check the website for the new report details</i>`
        );
        
        this.lastPageSignature = signature;
        this.log('✅ New signature saved');
      } else {
        this.log('ℹ️ No changes detected');
      }

    } catch (error: any) {
      this.log(`💥 Check failed: ${error.message}`);
      // Don't spam Telegram with errors, just log them
    }
  }

  public start(): void {
    if (this.isRunning) {
      this.log('⚠️ Monitor already running');
      return;
    }

    this.log('🚀 Starting server-side monitor...');
    this.isRunning = true;

    // Initial check
    this.checkForChanges();

    // Set up 30-second interval
    this.interval = setInterval(() => {
      this.checkForChanges();
    }, 30000);

    this.log('✅ Monitor started - checking every 30 seconds');
  }

  public stop(): void {
    if (!this.isRunning) {
      this.log('⚠️ Monitor not running');
      return;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    this.log('🛑 Monitor stopped');
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      checkCount: this.checkCount,
      lastSignature: this.lastPageSignature.substring(0, 12)
    };
  }
}

// Global monitor instance
let globalMonitor: ServerSideMonitor | null = null;

export function startServerMonitor(): void {
  // Check if we have required environment variables
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID || !process.env.PROXY_CONFIG) {
    console.log('⚠️ Server monitor not started - missing environment variables');
    console.log('Required: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, PROXY_CONFIG');
    return;
  }

  if (!globalMonitor) {
    globalMonitor = new ServerSideMonitor();
  }

  // Start with a delay to allow Next.js to fully initialize
  setTimeout(() => {
    globalMonitor!.start();
  }, 5000); // 5 second delay
}

export function stopServerMonitor(): void {
  if (globalMonitor) {
    globalMonitor.stop();
  }
}

export function getServerMonitorStatus() {
  return globalMonitor ? globalMonitor.getStatus() : { isRunning: false, checkCount: 0, lastSignature: 'none' };
}