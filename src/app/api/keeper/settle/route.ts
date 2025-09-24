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

    const { roundId, endPrice } = await request.json()

    if (!roundId || !endPrice) {
      return NextResponse.json(
        { error: 'Missing roundId or endPrice' },
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

    // Create keeper account from private key
    const privateKey = new Ed25519PrivateKey(config.keeper.privateKey)
    const keeper = Account.fromPrivateKey({ privateKey })

    console.log('Settling round:', roundId, 'with end price:', endPrice)

    // Convert price to micro-dollars (multiply by 1,000,000)
    const endPriceInMicroDollars = Math.floor(endPrice * 1000000)

    // Settle the current round
    let settleTransaction = await aptos.transaction.build.simple({
      sender: keeper.accountAddress,
      data: {
        function: `${config.aptos.moduleAddress}::betting::settle`,
        functionArguments: [
          roundId,
          endPriceInMicroDollars,
        ],
      },
    })

    // Submit settle transaction with retry logic for sequence number issues
    let settleCommittedTxn: any
    let retryCount = 0
    const maxRetries = 3
    
    while (retryCount < maxRetries) {
      try {
        settleCommittedTxn = await aptos.signAndSubmitTransaction({
          signer: keeper,
          transaction: settleTransaction,
        })
        break // Success, exit retry loop
      } catch (error: unknown) {
        retryCount++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        if (errorMessage.includes('SEQUENCE_NUMBER_TOO_OLD') && retryCount < maxRetries) {
          console.log(`Sequence number too old, retrying (${retryCount}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before retry
          
          // Rebuild transaction with fresh sequence number
          settleTransaction = await aptos.transaction.build.simple({
            sender: keeper.accountAddress,
            data: {
              function: `${config.aptos.moduleAddress}::betting::settle`,
              functionArguments: [
                roundId,
                endPriceInMicroDollars,
              ],
            },
          })
        } else {
          throw error // Re-throw if not a sequence number error or max retries reached
        }
      }
    }

    const settleExecutedTxn = await aptos.waitForTransaction({
      transactionHash: settleCommittedTxn.hash,
    })

    console.log('Round settled:', settleExecutedTxn)

    // Wait 5 seconds cooldown before starting next round
    console.log('Starting 5-second cooldown...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Get current price for next round
    const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL 
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` 
      : 'http://localhost:3000'
    const priceResponse = await fetch(`${baseUrl}/api/price`)
    if (!priceResponse.ok) {
      throw new Error('Failed to fetch current price for next round')
    }
    const priceData = await priceResponse.json()
    const nextStartPrice = priceData.price

    if (!nextStartPrice || nextStartPrice <= 0) {
      throw new Error('Invalid price data for next round')
    }

    // Convert price to micro-dollars for next round
    const nextStartPriceInMicroDollars = Math.floor(nextStartPrice * 1000000)

    console.log('Starting next round with price:', nextStartPrice, 'micro-dollars:', nextStartPriceInMicroDollars)

    // Start the next round
    let startTransaction = await aptos.transaction.build.simple({
      sender: keeper.accountAddress,
      data: {
        function: `${config.aptos.moduleAddress}::betting::start_round`,
        functionArguments: [
          nextStartPriceInMicroDollars,
          config.keeper.roundDuration,
        ],
      },
    })

    // Submit start transaction with retry logic
    let startCommittedTxn: any
    retryCount = 0
    
    while (retryCount < maxRetries) {
      try {
        startCommittedTxn = await aptos.signAndSubmitTransaction({
          signer: keeper,
          transaction: startTransaction,
        })
        break // Success, exit retry loop
      } catch (error: unknown) {
        retryCount++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        if (errorMessage.includes('SEQUENCE_NUMBER_TOO_OLD') && retryCount < maxRetries) {
          console.log(`Sequence number too old on start round, retrying (${retryCount}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before retry
          
          // Rebuild transaction with fresh sequence number
          startTransaction = await aptos.transaction.build.simple({
            sender: keeper.accountAddress,
            data: {
              function: `${config.aptos.moduleAddress}::betting::start_round`,
              functionArguments: [
                nextStartPriceInMicroDollars,
                config.keeper.roundDuration,
              ],
            },
          })
        } else {
          throw error // Re-throw if not a sequence number error or max retries reached
        }
      }
    }

    const startExecutedTxn = await aptos.waitForTransaction({
      transactionHash: startCommittedTxn.hash,
    })

    console.log('Next round started:', startExecutedTxn)

    return NextResponse.json({
      success: true,
      message: 'Round settled and next round started successfully',
      settledRound: {
        roundId,
        endPrice,
        endPriceInMicroDollars,
        transactionHash: settleCommittedTxn.hash,
      },
      nextRound: {
        startPrice: nextStartPrice,
        startPriceInMicroDollars: nextStartPriceInMicroDollars,
        duration: config.keeper.roundDuration,
        transactionHash: startCommittedTxn.hash,
      },
      cooldownSeconds: 5,
    })
  } catch (error: unknown) {
    console.error('Error settling round and starting next:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    return NextResponse.json(
      { 
        error: 'Failed to settle round and start next',
        details: errorMessage,
        stack: errorStack,
      },
      { status: 500 }
    )
  }
}
