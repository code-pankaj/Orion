'use client'

import { useEffect } from 'react'
import { WalletConnect } from '@/components/WalletConnect'
import { TradingChart } from '@/components/TradingChart'
import { BettingPanel } from '@/components/BettingPanel'
import { PastRounds } from '@/components/PastRounds'
import { useBettingStore } from '@/store/betting'
import { viewFunctions } from '@/lib/aptos'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { config } from '@/lib/config'

export default function Home() {
  const { account } = useWallet()
  const {
    setCurrentRound,
    setTimeRemaining,
    setPastRounds,
    setBalance,
    currentRound,
  } = useBettingStore()

  const isContractConfigured = Boolean(
    config.aptos.moduleAddress && config.aptos.moduleAddress !== '0x1'
  )

  // Initialize contract if needed
  useEffect(() => {
    if (!isContractConfigured) return
    const initializeContract = async () => {
      try {
        const response = await fetch('/api/contract/init', {
          method: 'POST',
        })
        const result = await response.json()
        
        if (result.success) {
          console.log('Contract initialized:', result.message)
          
          // Start a round if no current round exists
          if (!currentRound) {
            setTimeout(async () => {
              try {
                const startResponse = await fetch('/api/contract/start-round', {
                  method: 'POST',
                })
                const startResult = await startResponse.json()
                if (startResult.success) {
                  console.log('Round started:', startResult.message)
                } else {
                  console.error('Failed to start round:', startResult.error)
                }
              } catch (error) {
                console.error('Error starting round:', error)
              }
            }, 2000)
          }
        } else {
          console.error('Failed to initialize contract:', result.error)
        }
      } catch (error) {
        console.error('Error initializing contract:', error)
      }
    }

    // Only initialize once when the component mounts
    initializeContract()
  }, [isContractConfigured]) // Run only when contract is configured

  // Load current round and update countdown
  useEffect(() => {
    if (!isContractConfigured) {
      // Use demo round if contract not configured
      setCurrentRound({
        id: 1,
        startPrice: 12.5000,
        expiryTimeSecs: Math.floor(Date.now() / 1000) + 300,
        settled: false,
        upPool: 50000000,
        downPool: 75000000,
        totalPool: 125000000,
      })
      return
    }
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
        } else {
          // No rounds yet - create a demo round for UI testing
          setCurrentRound({
            id: 1,
            startPrice: 12.5000,
            expiryTimeSecs: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
            settled: false,
            upPool: 50000000, // 0.5 APT in octas
            downPool: 75000000, // 0.75 APT in octas
            totalPool: 125000000,
          })
        }
      } catch (error) {
        console.warn('Contract not deployed yet, using demo data:', error)
        // Create a demo round for UI testing
        setCurrentRound({
          id: 1,
          startPrice: 12.5000,
          expiryTimeSecs: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
          settled: false,
          upPool: 50000000, // 0.5 APT in octas
          downPool: 75000000, // 0.75 APT in octas
          totalPool: 125000000,
        })
      }
    }

    loadCurrentRound()
    const interval = setInterval(loadCurrentRound, 10000) // Update every 10 seconds

    return () => clearInterval(interval)
  }, [setCurrentRound, isContractConfigured])

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
    if (!isContractConfigured) {
      // Use demo past rounds if contract not configured
      const demoPastRounds = [
        {
          id: 3,
          startPrice: 12000000,
          endPrice: 12500000,
          expiryTimeSecs: Math.floor(Date.now() / 1000) - 600,
          settled: true,
          upPool: 80000000,
          downPool: 40000000,
          totalPool: 120000000,
          winSide: 'up' as const,
        },
        {
          id: 2,
          startPrice: 11800000,
          endPrice: 11600000,
          expiryTimeSecs: Math.floor(Date.now() / 1000) - 900,
          settled: true,
          upPool: 30000000,
          downPool: 70000000,
          totalPool: 100000000,
          winSide: 'down' as const,
        },
      ]
      setPastRounds(demoPastRounds)
      return
    }
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
        console.warn('Contract not deployed yet, using demo past rounds:', error)
        // Create demo past rounds for UI testing
        const demoPastRounds = [
          {
            id: 3,
            startPrice: 12000000, // $12.00
            endPrice: 12500000,   // $12.50 (UP won)
            expiryTimeSecs: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
            settled: true,
            upPool: 80000000,     // 0.8 APT
            downPool: 40000000,   // 0.4 APT
            totalPool: 120000000,
            winSide: 'up' as const,
          },
          {
            id: 2,
            startPrice: 11800000, // $11.80
            endPrice: 11600000,   // $11.60 (DOWN won)
            expiryTimeSecs: Math.floor(Date.now() / 1000) - 900, // 15 minutes ago
            settled: true,
            upPool: 30000000,     // 0.3 APT
            downPool: 70000000,   // 0.7 APT
            totalPool: 100000000,
            winSide: 'down' as const,
          },
        ]
        setPastRounds(demoPastRounds)
      }
    }

    loadPastRounds()
    const interval = setInterval(loadPastRounds, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [setPastRounds, isContractConfigured])

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

          {/* Right Column - Betting Panel */}
          <div>
            <BettingPanel />
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