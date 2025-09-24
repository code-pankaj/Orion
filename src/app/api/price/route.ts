import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export async function GET() {
  try {
    const response = await fetch(
      `${config.pyth.endpoint}/api/latest_price_feeds?ids[]=${config.pyth.aptUsdPriceId}`,
      {
        next: { revalidate: 1 }, // Cache for 1 second
      }
    )

    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No price data received from Pyth')
    }

    const priceFeed = data[0]
    if (!priceFeed || !priceFeed.price) {
      throw new Error('Invalid price feed data')
    }

    const priceData = priceFeed.price
    const price = parseFloat(priceData.price) * Math.pow(10, priceData.expo)
    const confidence = parseFloat(priceData.conf) * Math.pow(10, priceData.expo)
    const timestamp = parseInt(priceData.publish_time)

    return NextResponse.json({
      price,
      confidence,
      timestamp,
      symbol: 'APT/USD',
      raw: priceData, // Include raw data for debugging
    })
  } catch (error: unknown) {
    console.error('Error fetching price:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch price data', details: errorMessage },
      { status: 500 }
    )
  }
}
