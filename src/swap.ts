// src/swap.ts
import { Connection, Keypair,   Transaction,
  TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js'
import DLMM from '@meteora-ag/dlmm'
import BN from 'bn.js'
import { PoolInfo } from './types'
import { log } from './utils'

// 执行交易
export async function executeSwap(
  connection: Connection,
  wallet: Keypair,
  poolInfo: PoolInfo,
  swapForY: boolean, // 交易方向
  swapAmount: number // 交易数量
): Promise<{ signature: string, receivedAmount: number }> {
  const { poolAddress, tokenX, tokenY } = poolInfo
  log(`在 ${tokenX.symbol}-${tokenY.symbol} 池子执行交易...`)

  try {
    // 创建DLMM实例
    const dlmm = await DLMM.create(connection, poolAddress, {
      cluster: 'mainnet-beta',
    })

    // 随机决定交易方向 (X->Y 或 Y->X)
    //const swapForY = true; // 设置为 false 表示从 Y 交易到 X
    const tokenFrom = swapForY ? tokenX : tokenY
    const tokenTo = swapForY ? tokenY : tokenX

    log(`交易方向: ${tokenFrom.symbol} -> ${tokenTo.symbol}`)

    // 使用较小的交易量 (0.1个代币单位)
    const swapAmountBN = new BN(swapAmount * 10 **  tokenFrom.decimals)

    log(`交易数量: ${swapAmount}${tokenFrom.symbol}`)

    // 获取交易所需的bin arrays
    const binArraysForSwap = await dlmm.getBinArrayForSwap(swapForY)

    // 检查流动性是否足够
    if (binArraysForSwap.length === 0) {
      throw new Error('Insufficient liquidity in binArrays for swapQuote');
    }

    // 获取交易报价
    const swapQuote = await dlmm.swapQuote(
      swapAmountBN,
      swapForY,
      new BN(50), // 允许5%的滑点
      binArraysForSwap
    )

    // 创建交易
    const inToken = swapForY ? dlmm.tokenX.publicKey : dlmm.tokenY.publicKey
    const outToken = swapForY ? dlmm.tokenY.publicKey : dlmm.tokenX.publicKey

    const swapTx = await dlmm.swap({
      inToken,
      outToken,
      inAmount: swapAmountBN,
      minOutAmount: swapQuote.minOutAmount,
      lbPair: poolAddress,
      user: wallet.publicKey,
      binArraysPubkey: swapQuote.binArraysPubkey,
    })

    // 发送并确认交易
    const signature = await sendAndConfirmTransaction(connection, swapTx, [
      wallet,
    ])
    const receivedAmount = swapQuote.minOutAmount.toNumber() / (10 ** tokenTo.decimals)
    log(`交易成功! 获得 ${receivedAmount}:${tokenTo.symbol}  交易: https://solscan.io/tx/${signature}`)
    return { signature, receivedAmount }
  } catch (error: any) {
    log(`交易失败: ${error.message}`)
    throw error
  }
}

export async function executeSwapTrans(
  connection: Connection,
  wallet: Keypair,
  poolInfo: PoolInfo
): Promise<TransactionInstruction[]> {
  const { poolAddress, tokenX, tokenY } = poolInfo
  log(`在 ${tokenX.symbol}-${tokenY.symbol} 池子执行交易...`)

  try {
    // 创建DLMM实例
    const dlmm = await DLMM.create(connection, poolAddress, {
      cluster: 'mainnet-beta',
    })

    // 随机决定交易方向 (X->Y 或 Y->X)
    const swapForY = false; // 设置为 false 表示从 Y 交易到 X
    const tokenFrom = swapForY ? tokenX : tokenY
    const tokenTo = swapForY ? tokenY : tokenX

    log(`交易方向: ${tokenFrom.symbol} -> ${tokenTo.symbol}`)

    // 使用较小的交易量 (0.1个代币单位)
    const swapAmount = new BN(Number(process.env.SWAP_AMOUNT) * 10 ** tokenFrom.decimals)

    // 获取交易所需的bin arrays
    const binArraysForSwap = await dlmm.getBinArrayForSwap(swapForY)

    log(`交易数量: ${swapAmount} | ${process.env.SWAP_AMOUNT}:${tokenFrom.symbol}`)

    // 获取交易报价
    const swapQuote = await dlmm.swapQuote(
      swapAmount,
      swapForY,
      new BN(50), // 允许5%的滑点
      binArraysForSwap
    )

    // 创建交易
    const inToken = swapForY ? dlmm.tokenX.publicKey : dlmm.tokenY.publicKey
    const outToken = swapForY ? dlmm.tokenY.publicKey : dlmm.tokenX.publicKey

    const swapTx = await dlmm.swap({
      inToken,
      outToken,
      inAmount: swapAmount,
      minOutAmount: swapQuote.minOutAmount,
      lbPair: poolAddress,
      user: wallet.publicKey,
      binArraysPubkey: swapQuote.binArraysPubkey,
    })

    // 发送并确认交易
    // const signature = await sendAndConfirmTransaction(connection, swapTx, [
      // wallet,
    // ])

    // 提取指令
    const instructions: TransactionInstruction[] = [];
    instructions.push(...swapTx.instructions);

    log(`预交易成功: ${swapTx}`)
    return instructions
  } catch (error: any) {
    log(`预交易失败: ${error.message}`)
    throw error
  }
}
