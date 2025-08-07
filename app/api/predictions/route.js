'use server'
import { NextResponse } from 'next/server';

// Make sure to define CONFIG here or import it
const CONFIG = {
  ML_ENDPOINT: process.env.ML_ENDPOINT,
  ML_API_KEY: process.env.ML_API_KEY
};

export async function POST(request) {
  try {
    const inputData = await request.json();    
    const response = await fetch(CONFIG.ML_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.ML_API_KEY}`
      },
      body: JSON.stringify(inputData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ML API Error:', response.status, errorText);
      throw new Error(`ML API error: ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get prediction' }, 
      { status: 500 }
    );
  }
}