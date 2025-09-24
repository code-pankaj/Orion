import { NextResponse } from 'next/server'
import { Aptos, AptosConfig, Network, Ed25519PrivateKey, Account } from '@aptos-labs/ts-sdk'
import { config } from '@/lib/config'

export async function POST(request: Request) {
  try {
    if (!config.keeper.privateKey) {
      return NextResponse.json(
        { error: 'Keeper private key not configured' },
        { status: 400 }
      )
    }

    const { roundId, userAddress } = await request.json()

    if (!roundId || !userAddress) {
      return NextResponse.json(
        { error: 'Missing roundId or userAddress' },
        { status: 400 }
      )
    }

    // Initialize Aptos client
    const aptosConfig = new AptosConfig({
      network: config.aptos.network as Network,
      fullnode: config.aptos.nodeUrl,
      clientConfig: {
        HEADERS: {
          Authorization: `Bearer ${config.aptos.apiKey}`,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        }
      },
    })
    const aptos = new Aptos(aptosConfig)

    // Create admin account from private key (admin claims for users)
    const privateKey = new Ed25519PrivateKey(config.keeper.privateKey)
    const admin = Account.fromPrivateKey({ privateKey })

    console.log('Claiming winnings for user:', userAddress, 'from round:', roundId)

    // Claim winnings for the user
    const claimTransaction = await aptos.transaction.build.simple({
      sender: admin.accountAddress,
      data: {
        function: `${config.aptos.moduleAddress}::betting::claim`,
        functionArguments: [
          roundId,
          userAddress,
        ],
      },
    })

    const claimCommittedTxn = await aptos.signAndSubmitTransaction({
      signer: admin,
      transaction: claimTransaction,
    })

    const claimExecutedTxn = await aptos.waitForTransaction({
      transactionHash: claimCommittedTxn.hash,
    })

    console.log('Winnings claimed:', claimExecutedTxn)

    return NextResponse.json({
      success: true,
      message: 'Winnings claimed successfully',
      roundId,
      userAddress,
      transactionHash: claimCommittedTxn.hash,
      transaction: claimExecutedTxn,
    })
  } catch (error: unknown) {
    console.error('Error claiming winnings:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    return NextResponse.json(
      { 
        error: 'Failed to claim winnings',
        details: errorMessage,
        stack: errorStack,
      },
      { status: 500 }
    )
  }
}
