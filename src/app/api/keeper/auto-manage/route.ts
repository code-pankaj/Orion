import { NextResponse } from 'next/server'
import { viewFunctions } from '@/lib/aptos'

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
      
      // Get current price for settlement
      const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL 
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` 
        : 'http://localhost:3000'
      const priceResponse = await fetch(`${baseUrl}/api/price`)
      if (!priceResponse.ok) {
        throw new Error('Failed to fetch current price')
      }
      const priceData = await priceResponse.json()
      const currentPrice = priceData.price

      // Call the settle endpoint to settle current round and start next
      const settleResponse = await fetch(`${baseUrl}/api/keeper/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roundId: currentRoundId,
          endPrice: currentPrice,
        }),
      })

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
