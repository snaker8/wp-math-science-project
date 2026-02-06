import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        success: true,
        data: {
            isRunning: true,
            lastRun: new Date().toISOString(),
        }
    });
}
