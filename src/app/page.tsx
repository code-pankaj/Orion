'use client'

import { useEffect } from 'react'
import { WalletConnect } from '@/components/WalletConnect'
import { TradingChart } from '@/components/TradingChart'
import { BettingPanel } from '@/components/BettingPanel'
import { PastRounds } from '@/components/PastRounds'
import { ClaimableRewards } from '@/components/ClaimableRewards'
import { useBettingStore } from '@/store/betting'
import { viewFunctions } from '@/lib/aptos'
import { useWallet } from '@aptos-labs/wallet-adapter-react'

export default function Home() {
  const { account } = useWallet()
  const {
    setCurrentRound,
    setTimeRemaining,
    setPastRounds,
    setBalance,
    currentRound,
  } = useBettingStore()

  // Auto-manage rounds (start first round if needed, settle expired rounds)
  useEffect(() => {
    const autoManageRounds = async () => {
      try {
        const currentRoundId = await viewFunctions.getCurrentRoundId()
        
        if (currentRoundId === 0) {
          // No rounds exist, start first round
          console.log('No rounds exist, starting first round...')
          const startResponse = await fetch('/api/keeper/start', {
            method: 'POST',
          })
          const startResult = await startResponse.json()
          if (startResult.success) {
            console.log('First round started:', startResult.message)
          } else {
            console.error('Failed to start first round:', startResult.error)
          }
        } else {
          // Check if current round needs to be settled and next one started
          const manageResponse = await fetch('/api/keeper/auto-manage', {
            method: 'POST',
          })
          const manageResult = await manageResponse.json()
          
          if (manageResult.success) {
            console.log('Auto-manage result:', manageResult.message, manageResult.action)
          } else {
            console.error('Auto-manage failed:', manageResult.error)
          }
        }
      } catch (error) {
        console.error('Error in auto-manage rounds:', error)
      }
    }

    // Initial check when component mounts
    autoManageRounds()
    
    // Set up interval to check every 10 seconds for expired rounds
    const interval = setInterval(autoManageRounds, 10000)
    
    return () => clearInterval(interval)
  }, [])

  // Load current round and update countdown
  useEffect(() => {
    const loadCurrentRound = async () => {
      try {
        const currentRoundId = await viewFunctions.getCurrentRoundId()
        if (currentRoundId > 0) {
          const round = await viewFunctions.getRound(currentRoundId)
          if (round) {
            // Determine win side if settled
            let winSide: 'up' | 'down' | 'tie' | undefined
            if (round.settled && round.endPrice > 0) {
              if (round.endPrice > round.startPrice) {
                winSide = 'up'
              } else if (round.endPrice < round.startPrice) {
                winSide = 'down'
              } else {
                winSide = 'tie'
              }
            }

            setCurrentRound({
              id: round.id,
              startPrice: round.startPrice / 1000000, // Convert from micro-dollars
              endPrice: round.endPrice ? round.endPrice / 1000000 : undefined,
              expiryTimeSecs: round.expiryTimeSecs,
              settled: round.settled,
              upPool: round.upPool,
              downPool: round.downPool,
              totalPool: round.totalPool,
              winSide,
            })
          }
        }
      } catch (error) {
        console.error('Error loading current round:', error)
      }
    }

    loadCurrentRound()
    const interval = setInterval(loadCurrentRound, 10000) // Update every 10 seconds

    return () => clearInterval(interval)
  }, [setCurrentRound])

  // Update countdown timer
  useEffect(() => {
    if (!currentRound) return

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000)
      const timeLeft = Math.max(0, currentRound.expiryTimeSecs - now)
      setTimeRemaining(timeLeft)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [currentRound, setTimeRemaining])

  // Load user balance
  useEffect(() => {
    const loadBalance = async () => {
      if (!account) return

      try {
        const balance = await viewFunctions.getBalance(account.address)
        setBalance(balance)
      } catch (error) {
        console.error('Error loading balance:', error)
      }
    }

    loadBalance()
    const interval = setInterval(loadBalance, 15000) // Update every 15 seconds

    return () => clearInterval(interval)
  }, [account, setBalance])

  // Load past rounds
  useEffect(() => {
    const loadPastRounds = async () => {
      try {
        const currentRoundId = await viewFunctions.getCurrentRoundId()
        const pastRoundsData = []

        // Load last 10 rounds
        for (let i = Math.max(1, currentRoundId - 9); i < currentRoundId; i++) {
          const round = await viewFunctions.getRound(i)
          if (round && round.settled) {
            let winSide: 'up' | 'down' | 'tie'
            if (round.endPrice > round.startPrice) {
              winSide = 'up'
            } else if (round.endPrice < round.startPrice) {
              winSide = 'down'
            } else {
              winSide = 'tie'
            }

            pastRoundsData.push({
              id: round.id,
              startPrice: round.startPrice,
              endPrice: round.endPrice,
              expiryTimeSecs: round.expiryTimeSecs,
              settled: round.settled,
              upPool: round.upPool,
              downPool: round.downPool,
              totalPool: round.totalPool,
              winSide,
            })
          }
        }

        setPastRounds(pastRoundsData.reverse()) // Most recent first
      } catch (error) {
        console.error('Error loading past rounds:', error)
      }
    }

    loadPastRounds()
    const interval = setInterval(loadPastRounds, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [setPastRounds])

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Orion</h1>
            <p className="text-sm text-gray-400">APT/USD Binary Options</p>
          </div>
          <WalletConnect />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Chart */}
          <div className="lg:col-span-2">
            <TradingChart />
          </div>

          {/* Right Column - Betting Panel and Claimable Rewards */}
          <div className="space-y-8">
            <BettingPanel />
            <ClaimableRewards />
          </div>
        </div>

        {/* Past Rounds Section */}
        <div className="mt-8">
          <PastRounds />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-900/50 mt-16">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <div>
              <p>&copy; 2024 Orion. Built on Aptos.</p>
            </div>
            <div className="flex items-center gap-4">
              <span>Powered by Pyth Network</span>
              <span>•</span>
              <span>Testnet</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}