import { NextResponse } from 'next/server'
import { Aptos, AptosConfig, Network, Ed25519PrivateKey, Account } from '@aptos-labs/ts-sdk'
import { config } from '@/lib/config'

export async function POST() {
  try {
    if (!config.keeper.privateKey) {
      return NextResponse.json(
        { error: 'Keeper private key not configured' },
        { status: 400 }
      )
    }

    // Get current price directly from Pyth API
    let currentPrice
    try {
      const pythResponse = await fetch(
        `${config.pyth.endpoint}/api/latest_price_feeds?ids[]=${config.pyth.aptUsdPriceId}`,
        {
          next: { revalidate: 1 }, // Cache for 1 second
        }
      )

      if (!pythResponse.ok) {
        throw new Error(`Pyth API error: ${pythResponse.status}`)
      }

      const data = await pythResponse.json()
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('No price data received from Pyth')
      }

      const priceFeed = data[0]
      if (!priceFeed || !priceFeed.price) {
        throw new Error('Invalid price feed data')
      }

      const priceData = priceFeed.price
      currentPrice = parseFloat(priceData.price) * Math.pow(10, priceData.expo)
      
      console.log('Fetched contract start price directly from Pyth:', currentPrice)
    } catch (priceError) {
      console.error('Error fetching price from Pyth:', priceError)
      throw new Error(`Failed to fetch current price: ${priceError instanceof Error ? priceError.message : 'Unknown error'}`)
    }

    if (!currentPrice || currentPrice <= 0) {
      throw new Error('Invalid price data received')
    }

    // Convert price to micro-dollars (multiply by 1,000,000)
    const startPriceInMicroDollars = Math.floor(currentPrice * 1000000)

    console.log('Starting round with price:', currentPrice, 'micro-dollars:', startPriceInMicroDollars)

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

    // Start a new round
    const transaction = await aptos.transaction.build.simple({
      sender: keeper.accountAddress,
      data: {
        function: `${config.aptos.moduleAddress}::betting::start_round`,
        functionArguments: [
          startPriceInMicroDollars, // start_price in micro-dollars
          config.keeper.roundDuration, // duration_secs (default: 300 = 5 minutes)
        ],
      },
    })

    const committedTxn = await aptos.signAndSubmitTransaction({
      signer: keeper,
      transaction,
    })

    const executedTxn = await aptos.waitForTransaction({
      transactionHash: committedTxn.hash,
    })

    console.log('Round started:', executedTxn)

    return NextResponse.json({
      success: true,
      message: 'Round started successfully',
      transactionHash: committedTxn.hash,
      startPrice: currentPrice,
      startPriceInMicroDollars,
      duration: config.keeper.roundDuration,
      transaction: executedTxn,
    })
  } catch (error: unknown) {
    console.error('Error starting round:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    return NextResponse.json(
      { 
        error: 'Failed to start round',
        details: errorMessage,
        stack: errorStack,
      },
      { status: 500 }
    )
  }
}
