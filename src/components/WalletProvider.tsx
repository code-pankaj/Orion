'use client'

import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react'
import { Network } from '@aptos-labs/ts-sdk'
import { config } from '@/lib/config'
import { createAppKit } from '@reown/appkit'

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Initialize Reown AppKit once on client
  if (typeof window !== 'undefined') {
    try {
      const instance = createAppKit({
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
        // Basic EVM setup to satisfy AppKit deps; we are using it for modal only
        metadata: {
          name: 'Orion',
          description: 'APT/USD Binary Options',
          url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          icons: ['https://avatars.githubusercontent.com/u/37784886?s=200&v=4'],
        },
      } as any)
      ;(window as unknown as { __appkit?: any }).__appkit = instance
    } catch (e) {
      // swallow re-init errors on fast refresh
    }
  }
  return (
    <AptosWalletAdapterProvider
      plugins={[]}
      autoConnect={true}
      dappConfig={{
        network: config.aptos.network as Network,
        aptosConnectDappId: 'orion-betting-dapp'
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  )
}
