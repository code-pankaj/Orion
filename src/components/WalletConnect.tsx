'use client'

import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { useBettingStore } from '@/store/betting'
import { useEffect, useMemo } from 'react'
import { viewFunctions } from '@/lib/aptos'
// AppKit modal instance is stored on window by WalletProvider

export function WalletConnect() {
  const { connect, disconnect, account, connected, wallets } = useWallet()
  const balance = useBettingStore((state) => state.balance)
  const setBalance = useBettingStore((state) => state.setBalance)

  const walletList = useMemo(() => wallets ?? [], [wallets])
  const nightlyWallet = useMemo(() => {
    return walletList.find((w) => w.name.toLowerCase().includes('nightly'))
  }, [walletList])

  const handleConnect = async () => {
    // Prefer Reown AppKit modal for WalletConnect
    try {
      const appkit = (window as unknown as { __appkit?: { open: () => Promise<void> } }).__appkit
      if (appkit?.open) {
        await appkit.open()
      }
    } catch {}
    if (connected) return
    if (walletList.length > 0) {
      try {
        const target = nightlyWallet ?? walletList[0]
        await connect(target.name)
      } catch (error) {
        console.error('Failed to connect wallet:', error)
      }
    }
  }

  // Fetch APT balance (testnet by config) when connected/account changes
  useEffect(() => {
    let cancelled = false
    const fetchBalance = async () => {
      if (connected && account?.address) {
        try {
          console.debug('[WalletConnect] fetching balance for', account.address)
          const value = await viewFunctions.getBalance(account.address)
          if (!cancelled) {
            setBalance(value)
            console.debug('[WalletConnect] balance (octas):', value)
          }
        } catch (e) {
          console.error('Failed to fetch balance:', e)
          if (!cancelled) setBalance(0)
        }
      } else {
        setBalance(0)
      }
    }
    fetchBalance()
    return () => {
      cancelled = true
    }
  }, [connected, account?.address, setBalance])

  if (connected && account) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <div className="text-white/60">Balance</div>
          <div className="font-mono">{formatCurrency(balance)} APT</div>
        </div>
        <div className="text-sm">
          <div className="text-white/60">Address</div>
          <div className="font-mono">
            {account.address.slice(0, 6)}...{account.address.slice(-4)}
          </div>
        </div>
        <Button
          onClick={disconnect}
          variant="outline"
          size="sm"
        >
          Disconnect
        </Button>
        <Button
          onClick={async () => {
            if (!account?.address) return
            console.debug('[WalletConnect] manual balance refresh')
            try {
              const value = await viewFunctions.getBalance(account.address)
              setBalance(value)
              console.debug('[WalletConnect] manual balance (octas):', value)
            } catch (e) {
              console.error('Manual balance refresh failed:', e)
            }
          }}
          variant="outline"
          size="sm"
        >
          Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleConnect}
        className="bg-blue-600 hover:bg-blue-700"
      >
        {nightlyWallet ? 'Connect Nightly' : 'Connect Wallet'}
      </Button>
    </div>
  )
}
