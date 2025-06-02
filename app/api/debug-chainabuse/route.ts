// app/api/debug-chainabuse/route.ts - Final Working Debug
import { NextRequest, NextResponse } from 'next/server';

function countOccurrences(text: string, searchTerm: string): number {
  return (text.split(searchTerm).length - 1);
}

export async function GET() {
  const result: any = {
    timestamp: new Date().toISOString(),
    tests: {},
    analysis: {},
    success: false
  };

  try {
    console.log('🔍 Starting ChainAbuse debug...');

    // Test 1: Pobierz stronę ChainAbuse
    const response = await fetch('https://www.chainabuse.com/reports?sort=newest', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    result.tests.pageAccess = {
      success: response.ok,
      status: response.status,
      statusText: response.statusText
    };

    if (!response.ok) {
      result.error = `Cannot access ChainAbuse: ${response.status}`;
      return NextResponse.json(result);
    }

    const html = await response.text();
    console.log(`✅ Page loaded: ${html.length} characters`);

    // Podstawowa analiza
    result.analysis.basics = {
      htmlLength: html.length,
      hasNextData: html.includes('__NEXT_DATA__'),
      hasReactRoot: html.includes('__next'),
      hasReportsWord: html.includes('reports'),
      hasScamWord: html.includes('scam'),
      hasSubmittedBy: html.includes('Submitted by'),
      hasTimeAgo: html.includes(' ago'),
      hasChainAbuse: html.includes('chainabuse')
    };

    // Sprawdź Next.js data
    if (result.analysis.basics.hasNextData) {
      const nextDataStart = html.indexOf('__NEXT_DATA__');
      const scriptStart = html.indexOf('>', nextDataStart) + 1;
      const scriptEnd = html.indexOf('</script>', scriptStart);
      
      if (scriptStart > 0 && scriptEnd > scriptStart) {
        const jsonString = html.substring(scriptStart, scriptEnd);
        
        try {
          const nextData = JSON.parse(jsonString);
          result.analysis.nextData = {
            found: true,
            hasProps: !!nextData.props,
            hasPageProps: !!(nextData.props && nextData.props.pageProps),
            propsKeys: nextData.props ? Object.keys(nextData.props) : [],
            pagePropsKeys: (nextData.props && nextData.props.pageProps) ? Object.keys(nextData.props.pageProps) : []
          };

          // Szukaj raportów w różnych miejscach
          if (nextData.props && nextData.props.pageProps) {
            const pageProps = nextData.props.pageProps;
            
            if (pageProps.reports && Array.isArray(pageProps.reports)) {
              result.analysis.nextData.reportsFound = pageProps.reports.length;
              result.analysis.nextData.firstReport = pageProps.reports[0];
              result.success = true;
            }
            
            if (pageProps.initialData && pageProps.initialData.reports) {
              result.analysis.nextData.initialDataReports = pageProps.initialData.reports.length;
            }

            if (pageProps.data && pageProps.data.reports) {
              result.analysis.nextData.dataReports = pageProps.data.reports.length;
            }

            // Pokazuj wszystkie klucze dla debugowania
            result.analysis.nextData.allPagePropsKeys = Object.keys(pageProps);
          }
          
        } catch (parseError) {
          result.analysis.nextData = {
            found: true,
            parseError: 'Failed to parse JSON'
          };
        }
      }
    } else {
      result.analysis.nextData = { found: false };
    }

    // Liczenie wzorców
    result.analysis.patterns = {
      submittedByCount: countOccurrences(html, 'Submitted by'),
      scamCount: countOccurrences(html, 'Scam') + countOccurrences(html, 'scam'),
      phishingCount: countOccurrences(html, 'Phishing') + countOccurrences(html, 'phishing'),
      agoCount: countOccurrences(html, ' ago'),
      minutesAgoCount: countOccurrences(html, 'minutes ago'),
      hoursAgoCount: countOccurrences(html, 'hours ago')
    };

    // Próbki zawartości
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/);
    result.analysis.samples = {
      title: titleMatch ? titleMatch[1] : 'No title found',
      htmlStart: html.substring(0, 1000),
      hasApiData: html.includes('api.chainabuse.com'),
      bodyExists: html.includes('<body')
    };

    // Test 2: Sprawdź API
    try {
      const apiResponse = await fetch('https://api.chainabuse.com/reports', {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
      });

      result.tests.apiAccess = {
        success: apiResponse.ok,
        status: apiResponse.status
      };

      if (apiResponse.ok) {
        const apiText = await apiResponse.text();
        result.tests.apiAccess.responseLength = apiText.length;
        result.tests.apiAccess.sample = apiText.substring(0, 200);
      }
    } catch (apiError) {
      result.tests.apiAccess = {
        success: false,
        error: 'API not accessible'
      };
    }

    // Dodatkowe testy struktury
    result.analysis.structure = {
      hasJsonLd: html.includes('application/ld+json'),
      hasGraphQL: html.includes('graphql'),
      hasApollo: html.includes('apollo'),
      divCount: countOccurrences(html, '<div'),
      spanCount: countOccurrences(html, '<span'),
      hasScriptTags: countOccurrences(html, '<script')
    };

    // Rekomendacje
    result.recommendations = [];
    
    if (result.analysis.nextData && result.analysis.nextData.reportsFound > 0) {
      result.recommendations.push('✅ RAPORTY ZNALEZIONE w Next.js pageProps!');
    } else if (result.analysis.nextData && result.analysis.nextData.found) {
      result.recommendations.push('⚠️ Next.js data istnieje ale raporty w innej strukturze');
      result.recommendations.push(`🔍 Dostępne klucze: ${result.analysis.nextData.allPagePropsKeys?.join(', ')}`);
    } else {
      result.recommendations.push('❌ Brak Next.js data - client-side rendering');
    }

    if (result.analysis.patterns.submittedByCount === 0) {
      result.recommendations.push('🔍 Brak wzorców "Submitted by" - dane ładowane asynchronicznie');
    } else {
      result.recommendations.push(`✅ Znaleziono ${result.analysis.patterns.submittedByCount} wzorców "Submitted by"`);
    }

    if (result.tests.apiAccess && result.tests.apiAccess.success) {
      result.recommendations.push('✅ API dostępne');
    } else {
      result.recommendations.push('❌ API niedostępne');
    }

    // Dodaj szczegóły struktury strony
    if (result.analysis.basics.htmlLength < 10000) {
      result.recommendations.push('⚠️ Mała strona HTML - możliwe że nie zawiera pełnych danych');
    }

  } catch (error: any) {
    result.error = error.message;
    result.recommendations = ['💥 Błąd podczas analizy: ' + error.message];
  }

  return NextResponse.json(result, { status: 200 });
}