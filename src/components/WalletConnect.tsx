'use client'

import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { Button } from '@/components/ui/Button'
import { useClaimableRewards } from '@/hooks/useClaimableRewards'
import { formatCurrency } from '@/lib/utils'
import { useBettingStore } from '@/store/betting'
import { Gift } from 'lucide-react'

export function WalletConnect() {
  const { connect, disconnect, account, connected, wallets } = useWallet()
  const { count: claimableCount, totalAmount: claimableAmount } = useClaimableRewards()
  const balance = useBettingStore((state) => state.balance)

  const handleConnect = async () => {
    if (wallets && wallets.length > 0) {
      try {
        await connect(wallets[0].name)
      } catch (error) {
        console.error('Failed to connect wallet:', error)
      }
    }
  }

  if (connected && account) {
    return (
      <div className="flex items-center gap-4">
        {/* Claimable Rewards Notification */}
        {claimableCount > 0 && (
          <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-500/30 rounded-lg px-3 py-2">
            <Gift className="w-4 h-4 text-yellow-400" />
            <div className="text-xs">
              <div className="text-yellow-400 font-semibold">
                {claimableCount} reward{claimableCount > 1 ? 's' : ''}
              </div>
              <div className="text-yellow-300">
                {formatCurrency(claimableAmount, 8)} APT
              </div>
            </div>
          </div>
        )}
        
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
      </div>
    )
  }

  return (
    <Button
      onClick={handleConnect}
      className="bg-blue-600 hover:bg-blue-700"
    >
      Connect Wallet
    </Button>
  )
}
