import { NextResponse } from 'next/server'
import { viewFunctions } from '@/lib/aptos'
import { config } from '@/lib/config'

export async function POST() {
  try {
    // Get the current round
    const currentRoundId = await viewFunctions.getCurrentRoundId()
    
    if (currentRoundId === 0) {
      return NextResponse.json({
        error: 'No rounds exist',
        message: 'Please start the first round manually'
      }, { status: 400 })
    }

    // Get current round details
    const round = await viewFunctions.getRound(currentRoundId)
    
    if (!round) {
      return NextResponse.json({
        error: 'Round not found',
        message: `Round ${currentRoundId} not found`
      }, { status: 404 })
    }

    const now = Math.floor(Date.now() / 1000)
    
    // Check if round is expired and not settled
    if (now >= round.expiryTimeSecs && !round.settled) {
      console.log(`Round ${currentRoundId} has expired, settling and starting next round...`)
      
      // Get current price for settlement directly from Pyth API
      let currentPrice
      try {
        const pythResponse = await fetch(
          `${config.pyth.endpoint}/api/latest_price_feeds?ids[]=${config.pyth.aptUsdPriceId}`,
          {
            next: { revalidate: 1 }, // Cache for 1 second
          }
        )

        if (!pythResponse.ok) {
          throw new Error(`Pyth API error: ${pythResponse.status}`)
        }

        const data = await pythResponse.json()
        
        if (!data || !Array.isArray(data) || data.length === 0) {
          throw new Error('No price data received from Pyth')
        }

        const priceFeed = data[0]
        if (!priceFeed || !priceFeed.price) {
          throw new Error('Invalid price feed data')
        }

        const priceData = priceFeed.price
        currentPrice = parseFloat(priceData.price) * Math.pow(10, priceData.expo)
        
        console.log('Fetched price directly from Pyth:', currentPrice)
      } catch (priceError) {
        console.error('Error fetching price from Pyth:', priceError)
        throw new Error(`Failed to fetch current price: ${priceError instanceof Error ? priceError.message : 'Unknown error'}`)
      }

      // Settle the round directly instead of making HTTP call
      try {
        // Import the settle logic directly
        const { POST: settleHandler } = await import('../settle/route')
        
        // Create a mock request object for the settle handler
        const mockRequest = new Request('http://localhost:3000/api/keeper/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roundId: currentRoundId,
            endPrice: currentPrice,
          }),
        })

        const settleResponse = await settleHandler(mockRequest)
        const settleResult = await settleResponse.json()

        if (settleResult.success) {
          return NextResponse.json({
            success: true,
            message: 'Round auto-settled and next round started',
            action: 'settled_and_started',
            data: settleResult,
          })
        } else {
          throw new Error(settleResult.error || 'Failed to settle round')
        }
      } catch (settleError) {
        console.error('Error settling round directly:', settleError)
        throw new Error(`Failed to settle round: ${settleError instanceof Error ? settleError.message : 'Unknown error'}`)
      }
    } else if (round.settled) {
      return NextResponse.json({
        success: true,
        message: 'Round already settled',
        action: 'already_settled',
        roundId: currentRoundId,
      })
    } else {
      const timeRemaining = round.expiryTimeSecs - now
      return NextResponse.json({
        success: true,
        message: 'Round still active',
        action: 'still_active',
        roundId: currentRoundId,
        timeRemaining,
        expiryTimeSecs: round.expiryTimeSecs,
      })
    }
  } catch (error: unknown) {
    console.error('Error in auto-manage:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { 
        error: 'Failed to auto-manage rounds',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}
