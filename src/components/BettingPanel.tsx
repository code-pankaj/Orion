'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { Button } from '@/components/ui/Button'
import { useBettingStore } from '@/store/betting'
import { viewFunctions } from '@/lib/aptos'
import { config } from '@/lib/config'
import { formatTime, formatCurrency, cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react'

export function BettingPanel() {
  const { connected, account, signAndSubmitTransaction } = useWallet()
  const {
    currentRound,
    timeRemaining,
    betAmount,
    setBetAmount,
    isPlacingBet,
    setIsPlacingBet,
    currentPrice,
    addUserBet,
  } = useBettingStore()

  const [selectedSide, setSelectedSide] = useState<'up' | 'down' | null>(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [userBet, setUserBet] = useState<{sideUp: boolean, amount: number, claimed: boolean} | null>(null)
  const [potentialPayout, setPotentialPayout] = useState<number>(0)

  // Load user bet information for current round
  useEffect(() => {
    const loadUserBet = async () => {
      if (!connected || !account || !currentRound) {
        setUserBet(null)
        setPotentialPayout(0)
        return
      }

      try {
        // Get user bet for current round
        const bet = await viewFunctions.getUserBet(currentRound.id, account.address)
        if (bet) {
          setUserBet(bet)
          
          // Get potential payout
          const payout = await viewFunctions.calculatePotentialPayout(currentRound.id, account.address)
          setPotentialPayout(payout)
        } else {
          setUserBet(null)
          setPotentialPayout(0)
        }
      } catch {
        console.log('No bet found for user in current round')
        setUserBet(null)
        setPotentialPayout(0)
      }
    }

    loadUserBet()
  }, [connected, account, currentRound])

  // Handle bet placement
  const handlePlaceBet = async (side: 'up' | 'down') => {
    if (!connected || !account || !currentRound || isPlacingBet || !signAndSubmitTransaction) return

    const amount = parseFloat(betAmount)
    if (amount <= 0) return

    setIsPlacingBet(true)
    setSelectedSide(side)

    try {
      console.log(`Placing ${side} bet of ${amount} APT on round ${currentRound.id}`)
      
      // Convert APT to octas (1 APT = 100,000,000 octas)
      const amountInOctas = Math.floor(amount * 100000000)
      
      // Submit transaction
      const response = await signAndSubmitTransaction({
        sender: account.address,
        data: {
          function: `${config.aptos.moduleAddress}::betting::place_bet`,
          functionArguments: [
            config.aptos.moduleAddress,
            currentRound.id,
            side === 'up',
            amountInOctas,
          ],
        },
      })

      console.log('Transaction submitted:', response)

      // Add bet to local state
      addUserBet({
        roundId: currentRound.id,
        side,
        amount: amountInOctas,
        timestamp: Date.now(),
      })

      // Add marker to chart
      if (typeof window !== 'undefined' && (window as unknown as { addBetMarker?: (side: string, price: number) => void }).addBetMarker) {
        (window as unknown as { addBetMarker: (side: string, price: number) => void }).addBetMarker(side, currentPrice)
      }

      console.log('Bet placed successfully:', response.hash)
      
      // Reset bet amount after successful bet
      setBetAmount('0.1')
      
    } catch (error: unknown) {
      console.error('Error placing bet:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to place bet: ${errorMessage}`)
    } finally {
      setIsPlacingBet(false)
      setSelectedSide(null)
    }
  }

  // Handle claiming winnings
  const handleClaimWinnings = async () => {
    if (!connected || !account || !currentRound || isClaiming) return

    setIsClaiming(true)

    try {
      console.log(`Claiming winnings for round ${currentRound.id}`)
      
      const response = await fetch('/api/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roundId: currentRound.id,
          userAddress: account.address,
        }),
      })

      const result = await response.json()

      if (result.success) {
        console.log('Winnings claimed successfully:', result.transactionHash)
        alert(`Winnings claimed! Transaction: ${result.transactionHash}`)
        
        // Refresh user bet information
        if (userBet) {
          setUserBet({...userBet, claimed: true})
        }
      } else {
        console.error('Failed to claim winnings:', result.error)
        alert(`Failed to claim: ${result.details || result.error}`)
      }
    } catch (error: unknown) {
      console.error('Error claiming winnings:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Error claiming: ${errorMessage}`)
    } finally {
      setIsClaiming(false)
    }
  }

  // Format pool display
  const formatPool = (pool: number) => {
    return formatCurrency(pool, 8) + ' APT'
  }

  // Calculate potential 1.8x payout
  const calculatePotentialPayout = (betAmount: number) => {
    return betAmount * 1.8
  }

  if (!currentRound) {
    return (
      <div className="bg-gray-900 rounded-lg p-6">
        <div className="text-center text-gray-400">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No active round</p>
          <p className="text-sm">Waiting for next round to start...</p>
        </div>
      </div>
    )
  }

  const isRoundExpired = timeRemaining <= 0
  const totalPool = currentRound.upPool + currentRound.downPool
  const upPercentage = totalPool > 0 ? (currentRound.upPool / totalPool) * 100 : 50
  const downPercentage = totalPool > 0 ? (currentRound.downPool / totalPool) * 100 : 50

  return (
    <div className="bg-gray-900 rounded-lg p-6 space-y-6">
      {/* Round Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">
          Round #{currentRound.id}
        </h2>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <Clock className="w-4 h-4" />
          <span>
            {isRoundExpired ? 'Round Ended' : `Time Remaining: ${formatTime(timeRemaining)}`}
          </span>
        </div>
      </div>

      {/* Pool Information */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Total Pool</span>
          <span className="text-white font-mono">{formatPool(totalPool)}</span>
        </div>
        
        {/* Pool Distribution Bar */}
        <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-300"
            style={{ width: `${upPercentage}%` }}
          />
          <div 
            className="absolute right-0 top-0 h-full bg-red-500 transition-all duration-300"
            style={{ width: `${downPercentage}%` }}
          />
        </div>
        
        <div className="flex justify-between text-xs">
          <span className="text-green-400">UP: {formatPool(currentRound.upPool)}</span>
          <span className="text-red-400">DOWN: {formatPool(currentRound.downPool)}</span>
        </div>
      </div>

      {/* User Bet Information */}
      {connected && userBet && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-white mb-3">Your Bet</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Side:</span>
              <span className={cn(
                "font-semibold",
                userBet.sideUp ? 'text-green-400' : 'text-red-400'
              )}>
                {userBet.sideUp ? '📈 UP' : '📉 DOWN'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Amount:</span>
              <span className="text-white font-mono">
                {formatCurrency(userBet.amount, 8)} APT
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Potential Payout:</span>
              <span className="text-green-400 font-mono font-bold">
                {formatCurrency(potentialPayout, 8)} APT
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Potential Profit:</span>
              <span className="text-yellow-400 font-mono">
                +{formatCurrency(potentialPayout - userBet.amount, 8)} APT
              </span>
            </div>
            {userBet.claimed && (
              <div className="text-center text-green-400 text-sm font-semibold mt-2">
                ✅ Already Claimed
              </div>
            )}
          </div>
        </div>
      )}

      {/* Betting Interface */}
      {!isRoundExpired && connected ? (
        <div className="space-y-4">
          {/* Amount Input */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Bet Amount (APT)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="0.1"
                min="0.01"
                step="0.01"
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isPlacingBet}
              />
            </div>
            {/* Potential Payout Display */}
            {parseFloat(betAmount) > 0 && (
              <div className="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Potential Payout (1.8x):</span>
                  <span className="text-green-400 font-mono font-bold">
                    {calculatePotentialPayout(parseFloat(betAmount)).toFixed(2)} APT
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                  <span>Your Profit:</span>
                  <span className="text-yellow-400">
                    +{(calculatePotentialPayout(parseFloat(betAmount)) - parseFloat(betAmount)).toFixed(2)} APT
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bet Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="up"
              size="lg"
              onClick={() => handlePlaceBet('up')}
              disabled={isPlacingBet || parseFloat(betAmount) <= 0}
              className={cn(
                "h-14 text-lg font-bold transition-all duration-200",
                isPlacingBet && selectedSide === 'up' && "opacity-50 cursor-not-allowed"
              )}
            >
              <TrendingUp className="w-5 h-5 mr-2" />
              {isPlacingBet && selectedSide === 'up' ? 'Placing...' : 'UP'}
            </Button>
            
            <Button
              variant="down"
              size="lg"
              onClick={() => handlePlaceBet('down')}
              disabled={isPlacingBet || parseFloat(betAmount) <= 0}
              className={cn(
                "h-14 text-lg font-bold transition-all duration-200",
                isPlacingBet && selectedSide === 'down' && "opacity-50 cursor-not-allowed"
              )}
            >
              <TrendingDown className="w-5 h-5 mr-2" />
              {isPlacingBet && selectedSide === 'down' ? 'Placing...' : 'DOWN'}
            </Button>
          </div>

          {/* Quick Amount Buttons */}
          <div className="flex gap-2">
            {['0.1', '0.5', '1.0', '2.0'].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                className="flex-1 py-2 px-3 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors"
                disabled={isPlacingBet}
              >
                {amount} APT
              </button>
            ))}
          </div>
        </div>
      ) : !connected ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">Connect your wallet to place bets</p>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-400">Betting closed for this round</p>
        </div>
      )}

      {/* Claiming Section */}
      {connected && currentRound && currentRound.settled && userBet && !userBet.claimed && potentialPayout > 0 && (
        <div className="border-t border-gray-700 pt-4">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white text-center">
              Round #{currentRound.id} Results
            </h3>
            
            {/* Round Result */}
            <div className="text-center p-3 bg-gray-800 rounded-lg">
              <div className="text-sm text-gray-400 mb-1">Winner:</div>
              <div className={cn(
                "text-lg font-bold",
                currentRound.winSide === 'up' ? 'text-green-400' : 
                currentRound.winSide === 'down' ? 'text-red-400' : 'text-yellow-400'
              )}>
                {currentRound.winSide === 'up' ? '📈 UP' : 
                 currentRound.winSide === 'down' ? '📉 DOWN' : '⚖️ TIE'}
              </div>
            </div>

            {/* Claim Button */}
            <Button
              onClick={handleClaimWinnings}
              disabled={isClaiming}
              className="w-full h-12 text-lg font-bold bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white"
            >
              <DollarSign className="w-5 h-5 mr-2" />
              {isClaiming ? 'Claiming...' : 'Claim Winnings (1.8x)'}
            </Button>
            
            <p className="text-xs text-gray-500 text-center">
              Click to claim your winnings if you won this round
            </p>
          </div>
        </div>
      )}

      {/* Current Price Display */}
      <div className="border-t border-gray-700 pt-4">
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-1">Current APT Price</p>
          <p className="text-2xl font-mono font-bold text-white">
            ${currentPrice.toFixed(4)}
          </p>
        </div>
      </div>
    </div>
  )
}
