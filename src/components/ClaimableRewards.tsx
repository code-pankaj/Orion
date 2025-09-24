'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { Button } from '@/components/ui/Button'
import { viewFunctions } from '@/lib/aptos'
import { formatCurrency, cn } from '@/lib/utils'
import { Gift, Clock, TrendingUp, TrendingDown, Loader2, CheckCircle } from 'lucide-react'

interface ClaimableReward {
  roundId: number
  amount: number
  betAmount: number
  side: 'up' | 'down'
  profit: number
  claimed: boolean
  startPrice: number
  endPrice: number
}

export function ClaimableRewards() {
  const { connected, account } = useWallet()
  const [claimableRewards, setClaimableRewards] = useState<ClaimableReward[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState<{ [roundId: number]: boolean }>({})
  const [lastChecked, setLastChecked] = useState<number>(0)

  // Load claimable rewards
  const loadClaimableRewards = useCallback(async () => {
    if (!connected || !account) {
      setClaimableRewards([])
      return
    }

    setLoading(true)
    try {
      const rewards: ClaimableReward[] = []
      
      // Get current round ID to know how many rounds to check
      const currentRoundId = await viewFunctions.getCurrentRoundId()
      
      // Check last 20 rounds for claimable rewards
      const startRound = Math.max(1, currentRoundId - 20)
      
      for (let roundId = startRound; roundId <= currentRoundId; roundId++) {
        try {
          // Check if user has a bet in this round
          const userBet = await viewFunctions.getUserBet(roundId, account.address)
          if (!userBet) continue

          // Get round details
          const round = await viewFunctions.getRound(roundId)
          if (!round || !round.settled) continue

          // Calculate potential payout
          const potentialPayout = await viewFunctions.calculatePotentialPayout(roundId, account.address)
          
          // Only include if there's a payout and not claimed
          if (potentialPayout > 0 && !userBet.claimed) {
            rewards.push({
              roundId,
              amount: potentialPayout,
              betAmount: userBet.amount,
              side: userBet.sideUp ? 'up' : 'down',
              profit: potentialPayout - userBet.amount,
              claimed: userBet.claimed,
              startPrice: round.startPrice,
              endPrice: round.endPrice || 0,
            })
          }
        } catch (error) {
          // Skip rounds that error (likely don't exist or no bet)
          continue
        }
      }
      
      setClaimableRewards(rewards.sort((a, b) => b.roundId - a.roundId))
      setLastChecked(Date.now())
    } catch (error) {
      console.error('Error loading claimable rewards:', error)
    } finally {
      setLoading(false)
    }
  }, [connected, account])

  // Claim reward for a specific round
  const claimReward = async (roundId: number) => {
    if (!account) return

    setClaiming(prev => ({ ...prev, [roundId]: true }))
    
    try {
      const response = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId,
          userAddress: account.address,
        }),
      })

      const result = await response.json()

      if (result.success) {
        // Remove claimed reward from list
        setClaimableRewards(prev => prev.filter(r => r.roundId !== roundId))
        alert(`✅ Successfully claimed ${formatCurrency(claimableRewards.find(r => r.roundId === roundId)?.amount || 0, 8)} APT!`)
      } else {
        alert(`❌ Failed to claim: ${result.details || result.error}`)
      }
    } catch (error) {
      console.error('Error claiming reward:', error)
      alert(`❌ Error claiming reward: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setClaiming(prev => ({ ...prev, [roundId]: false }))
    }
  }

  // Claim all rewards at once
  const claimAllRewards = async () => {
    if (!account || claimableRewards.length === 0) return

    const allRoundIds = claimableRewards.map(r => r.roundId)
    setClaiming(Object.fromEntries(allRoundIds.map(id => [id, true])))

    try {
      // Claim each reward individually for better error handling
      let successCount = 0
      let totalAmount = 0

      for (const reward of claimableRewards) {
        try {
          const response = await fetch('/api/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roundId: reward.roundId,
              userAddress: account.address,
            }),
          })

          const result = await response.json()
          if (result.success) {
            successCount++
            totalAmount += reward.amount
          }
        } catch (error) {
          console.error(`Failed to claim round ${reward.roundId}:`, error)
        }
      }

      if (successCount > 0) {
        alert(`✅ Successfully claimed ${successCount} rewards totaling ${formatCurrency(totalAmount, 8)} APT!`)
        // Reload rewards to update the list
        loadClaimableRewards()
      } else {
        alert('❌ Failed to claim any rewards. Please try individual claiming.')
      }
    } catch (error) {
      console.error('Error claiming all rewards:', error)
      alert(`❌ Error claiming rewards: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setClaiming({})
    }
  }

  // Load rewards on mount and when wallet connects
  useEffect(() => {
    loadClaimableRewards()
  }, [connected, account, loadClaimableRewards])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!connected) return

    const interval = setInterval(loadClaimableRewards, 30000)
    return () => clearInterval(interval)
  }, [connected, account, loadClaimableRewards])

  if (!connected) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
        <div className="text-center">
          <Gift className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Claimable Rewards</h3>
          <p className="text-gray-400">Connect your wallet to view claimable rewards</p>
        </div>
      </div>
    )
  }

  const totalClaimable = claimableRewards.reduce((sum, reward) => sum + reward.amount, 0)
  const totalProfit = claimableRewards.reduce((sum, reward) => sum + reward.profit, 0)

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Gift className="w-6 h-6 text-yellow-400 mr-2" />
          <h3 className="text-lg font-semibold text-white">
            Claimable Rewards
          </h3>
        </div>
        
        <Button
          onClick={loadClaimableRewards}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Refresh'
          )}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Checking for claimable rewards...</p>
        </div>
      ) : claimableRewards.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h4 className="text-white font-semibold mb-2">All caught up!</h4>
          <p className="text-gray-400">No rewards to claim right now</p>
          <p className="text-xs text-gray-500 mt-2">
            Last checked: {new Date(lastChecked).toLocaleTimeString()}
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {formatCurrency(totalClaimable, 8)}
                </div>
                <div className="text-sm text-gray-400">Total Claimable</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  +{formatCurrency(totalProfit, 8)}
                </div>
                <div className="text-sm text-gray-400">Total Profit</div>
              </div>
            </div>
            
            <Button
              onClick={claimAllRewards}
              disabled={Object.values(claiming).some(Boolean)}
              className="w-full mt-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600"
            >
              {Object.values(claiming).some(Boolean) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Claiming All...
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-2" />
                  Claim All ({claimableRewards.length})
                </>
              )}
            </Button>
          </div>

          {/* Individual Rewards */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Individual Rewards
            </h4>
            
            {claimableRewards.map((reward) => (
              <div
                key={reward.roundId}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <span className="text-white font-semibold">
                        Round #{reward.roundId}
                      </span>
                      <div className={cn(
                        "ml-2 px-2 py-1 rounded text-xs font-semibold",
                        reward.side === 'up' 
                          ? 'bg-green-900 text-green-300' 
                          : 'bg-red-900 text-red-300'
                      )}>
                        {reward.side === 'up' ? (
                          <>
                            <TrendingUp className="w-3 h-3 inline mr-1" />
                            UP
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 inline mr-1" />
                            DOWN
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Bet:</span>
                        <span className="text-white ml-1">
                          {formatCurrency(reward.betAmount, 8)} APT
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Reward:</span>
                        <span className="text-yellow-400 ml-1 font-semibold">
                          {formatCurrency(reward.amount, 8)} APT
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500 mt-1">
                      Price: {formatCurrency(reward.startPrice, 6)} → {formatCurrency(reward.endPrice, 6)}
                      <span className="text-green-400 ml-2">
                        Profit: +{formatCurrency(reward.profit, 8)} APT
                      </span>
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => claimReward(reward.roundId)}
                    disabled={claiming[reward.roundId]}
                    size="sm"
                    className="ml-4 bg-yellow-600 hover:bg-yellow-700"
                  >
                    {claiming[reward.roundId] ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Claim'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
