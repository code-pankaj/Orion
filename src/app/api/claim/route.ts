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

    // Check if user actually has winnings to claim
    try {
      const potentialPayout = await aptos.view({
        payload: {
          function: `${config.aptos.moduleAddress}::betting::calculate_potential_payout`,
          functionArguments: [config.aptos.moduleAddress, roundId, userAddress],
        },
      })

      const payoutAmount = parseInt(potentialPayout[0] as string)
      if (payoutAmount === 0) {
        return NextResponse.json({
          success: false,
          error: 'No winnings to claim',
          message: 'User has no claimable winnings for this round'
        }, { status: 400 })
      }

      console.log(`User has ${payoutAmount / 100000000} APT to claim`)
    } catch (viewError) {
      console.error('Error checking potential payout:', viewError)
    }

    // Build transaction with retry logic
    let claimTransaction = await aptos.transaction.build.simple({
      sender: admin.accountAddress,
      data: {
        function: `${config.aptos.moduleAddress}::betting::claim`,
        functionArguments: [
          roundId,
          userAddress,
        ],
      },
    })

    // Submit transaction with retry logic
    let claimCommittedTxn: any
    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      try {
        claimCommittedTxn = await aptos.signAndSubmitTransaction({
          signer: admin,
          transaction: claimTransaction,
        })
        break // Success, exit retry loop
      } catch (error: unknown) {
        retryCount++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        if (errorMessage.includes('SEQUENCE_NUMBER_TOO_OLD') && retryCount < maxRetries) {
          console.log(`Sequence number too old while claiming, retrying (${retryCount}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before retry
          
          // Rebuild transaction with fresh sequence number
          claimTransaction = await aptos.transaction.build.simple({
            sender: admin.accountAddress,
            data: {
              function: `${config.aptos.moduleAddress}::betting::claim`,
              functionArguments: [
                roundId,
                userAddress,
              ],
            },
          })
        } else {
          throw error // Re-throw if not a sequence number error or max retries reached
        }
      }
    }

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
