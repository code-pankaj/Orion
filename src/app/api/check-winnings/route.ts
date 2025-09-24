import { NextResponse } from 'next/server'
import { viewFunctions } from '@/lib/aptos'

export async function POST(request: Request) {
  try {
    const { userAddress, roundId } = await request.json()

    if (!userAddress || !roundId) {
      return NextResponse.json(
        { error: 'Missing userAddress or roundId' },
        { status: 400 }
      )
    }

    // Get round information
    const round = await viewFunctions.getRound(roundId)
    if (!round) {
      return NextResponse.json(
        { error: 'Round not found' },
        { status: 404 }
      )
    }

    // Get user bet information
    const userBet = await viewFunctions.getUserBet(roundId, userAddress)
    if (!userBet) {
      return NextResponse.json({
        hasWinnings: false,
        message: 'No bet found for this user in this round'
      })
    }

    // Calculate potential payout
    const potentialPayout = await viewFunctions.calculatePotentialPayout(roundId, userAddress)

    return NextResponse.json({
      hasWinnings: potentialPayout > 0 && !userBet.claimed,
      round: {
        id: round.id,
        settled: round.settled,
        startPrice: round.startPrice,
        endPrice: round.endPrice,
        winSide: round.endPrice > round.startPrice ? 'up' : 
                 round.endPrice < round.startPrice ? 'down' : 'tie'
      },
      userBet: {
        sideUp: userBet.sideUp,
        amount: userBet.amount,
        claimed: userBet.claimed
      },
      potentialPayout,
      canClaim: round.settled && potentialPayout > 0 && !userBet.claimed
    })
  } catch (error: unknown) {
    console.error('Error checking winnings:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { 
        error: 'Failed to check winnings',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}
