import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { viewFunctions } from '@/lib/aptos'

interface ClaimableRewardsSummary {
  count: number
  totalAmount: number
  loading: boolean
}

export function useClaimableRewards() {
  const { connected, account } = useWallet()
  const [summary, setSummary] = useState<ClaimableRewardsSummary>({
    count: 0,
    totalAmount: 0,
    loading: false,
  })

  const checkClaimableRewards = useCallback(async () => {
    if (!connected || !account) {
      setSummary({ count: 0, totalAmount: 0, loading: false })
      return
    }

    setSummary(prev => ({ ...prev, loading: true }))

    try {
      let count = 0
      let totalAmount = 0
      
      // Get current round ID to know how many rounds to check
      const currentRoundId = await viewFunctions.getCurrentRoundId()
      
      // Check last 10 rounds for claimable rewards (lighter check)
      const startRound = Math.max(1, currentRoundId - 10)
      
      for (let roundId = startRound; roundId <= currentRoundId; roundId++) {
        try {
          // Check if user has a bet in this round
          const userBet = await viewFunctions.getUserBet(roundId, account.address)
          if (!userBet || userBet.claimed) continue

          // Get round details (only if user has a bet)
          const round = await viewFunctions.getRound(roundId)
          if (!round || !round.settled) continue

          // Calculate potential payout
          const potentialPayout = await viewFunctions.calculatePotentialPayout(roundId, account.address)
          
          // Only count if there's a payout
          if (potentialPayout > 0) {
            count++
            totalAmount += potentialPayout
          }
        } catch (error) {
          // Skip rounds that error
          continue
        }
      }
      
      setSummary({ count, totalAmount, loading: false })
    } catch (error) {
      console.error('Error checking claimable rewards:', error)
      setSummary({ count: 0, totalAmount: 0, loading: false })
    }
  }, [connected, account])

  // Check on mount and wallet changes
  useEffect(() => {
    checkClaimableRewards()
  }, [connected, account, checkClaimableRewards])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!connected) return

    const interval = setInterval(checkClaimableRewards, 60000)
    return () => clearInterval(interval)
  }, [connected, account, checkClaimableRewards])

  return {
    ...summary,
    refresh: checkClaimableRewards,
  }
}
