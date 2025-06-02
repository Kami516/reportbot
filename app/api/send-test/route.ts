// app/api/send-test/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Missing Telegram configuration',
        success: false
      }, { status: 500 });
    }

    const telegramMessage = message || `🧪 <b>Test wiadomość ChainAbuse Monitor</b>\n\nCzas: ${new Date().toLocaleString('pl-PL')}\n\nJeśli widzisz tę wiadomość, bot Telegram działa poprawnie! ✅`;

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: telegramMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ 
        error: 'Telegram API error',
        details: errorData,
        success: false
      }, { status: 400 });
    }

    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Test message sent successfully',
      telegram_response: result
    });

  } catch (error: any) {
    console.error('Test message error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error?.message,
      success: false
    }, { status: 500 });
  }
}