// app/api/debug-html/route.ts - Uproszczona wersja bez błędów TypeScript
import { NextRequest, NextResponse } from 'next/server';
import { parseProxyConfig, fetchWithProxy } from '../../../utils/proxy';

export async function GET() {
  try {
    const proxyConfig = process.env.PROXY_CONFIG ? parseProxyConfig(process.env.PROXY_CONFIG) : undefined;
    
    console.log('🔍 Pobieranie HTML do debugowania...');
    
    const url = `https://www.chainabuse.com/reports?sort=newest&_t=${Date.now()}`;
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };

    const response = await fetchWithProxy(url, { headers }, proxyConfig);
    
    if (!response.ok) {
      return NextResponse.json({
        error: `HTTP ${response.status}`,
        success: false
      });
    }

    const html = await response.text();
    
    console.log(`📄 Pobrano HTML (${html.length} znaków)`);

    // Podstawowa analiza wzorców
    const patterns = {
      // Różne wzorce klas raportów
      createScamReportCard: (html.match(/create-ScamReportCard/g) || []).length,
      scamReportCard: (html.match(/ScamReportCard/g) || []).length,
      reportCard: (html.match(/report.*card/gi) || []).length,
      
      // Wzorce "Submitted by"
      submittedBy: (html.match(/Submitted by/g) || []).length,
      
      // Adresy krypto
      bitcoinAddresses: (html.match(/\b(bc1|[13])[a-zA-Z0-9]{25,62}\b/g) || []).length,
      ethereumAddresses: (html.match(/\b0x[a-fA-F0-9]{40}\b/g) || []).length,
      
      // Inne wzorce
      divs: (html.match(/<div/g) || []).length,
      classAttributes: (html.match(/class="/g) || []).length
    };

    // Znajdź klasy związane z raportami
    const reportClasses: string[] = [];
    const classMatches = html.match(/class="([^"]*)"/g) || [];
    
    classMatches.forEach(match => {
      const classes = match.replace(/class="([^"]*)"/, '$1').split(/\s+/);
      classes.forEach(cls => {
        if (cls && (
          cls.toLowerCase().includes('report') || 
          cls.toLowerCase().includes('scam') || 
          cls.toLowerCase().includes('card')
        )) {
          if (!reportClasses.includes(cls)) {
            reportClasses.push(cls);
          }
        }
      });
    });

    // Próbki HTML
    const samples: any = {};
    
    // Pierwsza karta ScamReportCard
    const scamCardMatch = html.match(/create-ScamReportCard[^>]*>/);
    if (scamCardMatch) {
      const index = html.indexOf(scamCardMatch[0]);
      samples.firstScamCard = html.substring(Math.max(0, index - 200), index + 300);
    }

    // Pierwsze "Submitted by"
    const submittedMatch = html.match(/Submitted by[^<]{0,100}/);
    if (submittedMatch) {
      const index = html.indexOf(submittedMatch[0]);
      samples.firstSubmitted = html.substring(Math.max(0, index - 200), index + 300);
    }

    // Pierwszy adres Bitcoin
    const bitcoinMatch = html.match(/\b(bc1|[13])[a-zA-Z0-9]{25,62}\b/);
    if (bitcoinMatch) {
      const index = html.indexOf(bitcoinMatch[0]);
      samples.firstBitcoin = html.substring(Math.max(0, index - 200), index + 300);
    }

    const analysis = {
      htmlLength: html.length,
      timestamp: new Date().toISOString(),
      patterns,
      reportClasses: reportClasses.sort(),
      samples,
      htmlStart: html.substring(0, 1000),
      bodyStart: html.includes('<body') ? html.substring(html.indexOf('<body'), html.indexOf('<body') + 1000) : 'No body tag found'
    };

    return NextResponse.json({
      success: true,
      analysis,
      debugInfo: {
        totalReportClasses: reportClasses.length,
        hasScamReportCard: patterns.createScamReportCard > 0,
        hasSubmissions: patterns.submittedBy > 0,
        hasCryptoAddresses: patterns.bitcoinAddresses + patterns.ethereumAddresses > 0
      }
    });

  } catch (error: any) {
    console.error('💥 Debug error:', error);
    return NextResponse.json({
      error: error.message,
      success: false
    }, { status: 500 });
  }
}