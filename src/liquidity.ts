// src/liquidity.ts
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import DLMM, { StrategyType } from '@meteora-ag/dlmm'
import BN from 'bn.js'
import { PoolInfo, PositionInfo, PositionInfoTrans } from './types'
import { log } from './utils'

import dotenv from 'dotenv'
dotenv.config({ path: 'config.txt' })

// 添加流动性
export async function addLiquidity(
  connection: Connection,
  wallet: Keypair,
  poolInfo: PoolInfo,
  positionKeypair: Keypair
): Promise<PositionInfo> {
  const { poolAddress, tokenX, tokenY } = poolInfo
  log(`为池子 ${poolAddress} | ${tokenX.symbol}-${tokenY.symbol} 添加流动性 | ${positionKeypair.publicKey}`)
  //log(`start`)

  try {
    // 创建DLMM实例
    const dlmm = await DLMM.create(connection, poolAddress, {
      cluster: 'mainnet-beta',
    })

    // 获取活跃bin
    const activeBin = await dlmm.getActiveBin()
    const activeBinPriceLamport = activeBin.price;
    const activeBinPricePerToken = dlmm.fromPricePerLamport(
      Number(activeBin.price)
    );
    log(`池子活跃bin ID: ${activeBin.binId}`)
    log(`池子Price: ${activeBinPriceLamport}`)
    log(`池子PricePerToken: ${activeBinPricePerToken}`)
    
    // 检查代币账户是否存在
    // const tokenXAccount = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: new PublicKey(tokenX.address) })
    // const tokenYAccount = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: new PublicKey(tokenY.address) })
    // if (tokenXAccount.value.length === 0) {
    //   throw new Error(`钱包 ${wallet.publicKey} 中的 ${tokenX.symbol} 账户不存在`)
    // }
    // if (tokenYAccount.value.length === 0) {
    //   throw new Error(`钱包 ${wallet.publicKey} 中的 ${tokenY.symbol} 账户不存在`)
    // }
    // // 获取代币余额
    // const tokenXBalance = await connection.getTokenAccountBalance(tokenXAccount.value[0].pubkey)
    // const tokenYBalance = await connection.getTokenAccountBalance(tokenYAccount.value[0].pubkey)
    // log(`钱包 ${wallet.publicKey} 余额: ${tokenX.symbol}: ${tokenXBalance.value.uiAmount}, ${tokenY.symbol}: ${tokenYBalance.value.uiAmount}`)

    // // 将环境变量转换为数字类型
    // const tokenXAmount = Number(process.env.TOKEN_X_AMOUNT)
    // const tokenYAmount = Number(process.env.TOKEN_Y_AMOUNT)

    // // 检查是否有足够的余额
    // if (tokenXBalance.value.uiAmount === null || tokenXBalance.value.uiAmount < tokenXAmount) {
    //   throw new Error(`钱包 ${wallet.publicKey} 中的 ${tokenX.symbol} 兑换 ${tokenXAmount}余额不足`)
    // }
    // if (tokenYBalance.value.uiAmount === null || tokenYBalance.value.uiAmount < tokenYAmount) {
    //   throw new Error(`钱包 ${wallet.publicKey} 中的 ${tokenY.symbol} 兑换 ${tokenYAmount} 余额不足`)
    // }

    // 使用小额流动性 (每个代币1个单位)
    // 根据代币小数位调整金额
    //const xAmount = new BN(0.3 * 10 ** tokenX.decimals)
    // const yAmount = new BN(0 ** tokenY.decimals)

    // USDC-SOL  0-0.05
    // 使用小额流动性 (每个代币1个单位)
    const xAmount = new BN(Number(process.env.TOKEN_X_AMOUNT) * 10 ** tokenX.decimals); // 确保xAmount也正确计算
    const yAmount = new BN(Number(process.env.TOKEN_Y_AMOUNT) * 10 ** tokenY.decimals); // 使用环境变量并考虑小数位

    log(`流动性LP: ${process.env.TOKEN_X_AMOUNT}${tokenX.symbol}-${process.env.TOKEN_Y_AMOUNT}${tokenY.symbol}`)

    // 添加流动性 - 使用平衡策略
    const addLiquidityTx =
      await dlmm.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionKeypair.publicKey,
        user: wallet.publicKey,
        totalXAmount: xAmount,
        totalYAmount: yAmount,
        strategy: {
          minBinId: activeBin.binId - 10, // 活跃bin左侧5个bin
          maxBinId: activeBin.binId + 10, // 活跃bin右侧5个bin
          strategyType: StrategyType.SpotDe, // 使用平衡策略
        },
      })

    // 发送并确认交易
    const signature = await sendAndConfirmTransaction(
      connection,
      addLiquidityTx,
      [wallet, positionKeypair]
    )

    log(`流动性添加成功! 交易: https://solscan.io/tx/${signature}`)

    // 返回position信息
    return {
      positionPublicKey: positionKeypair.publicKey,
      signature,
    }
  } catch (error: any) {
    log(`添加流动性失败: ${error.message}`)
    log(`完整错误信息: ${JSON.stringify(error)}`) // 打印完整的错误信息
    throw error
  }
}

// 移除流动性并关闭position
export async function removeLiquidity(
  connection: Connection,
  wallet: Keypair,
  poolInfo: PoolInfo,
  positionPublicKey: PublicKey
): Promise<string> {
  const { poolAddress, tokenX, tokenY } = poolInfo
  log(`从 ${poolAddress} | ${tokenX.symbol}-${tokenY.symbol} 池子移除流动性 | ${positionPublicKey}`)

  try {
    // 创建DLMM实例
    const dlmm = await DLMM.create(connection, poolAddress, {
      cluster: 'mainnet-beta',
    })

    // 获取position信息
    const position = await dlmm.getPosition(positionPublicKey)
    log(
      `找到Position，包含 ${position.positionData.positionBinData.length} 个bins`
    )

    // 获取所有binIds
    const binIds = position.positionData.positionBinData.map(bin => bin.binId)

    // 移除流动性交易
    const removeLiquidityTx = await dlmm.removeLiquidity({
      user: wallet.publicKey,
      position: positionPublicKey,
      binIds,
      bps: new BN(10000), // 移除100%流动性
      shouldClaimAndClose: true, // 同时关闭position
    })

    // 如果是事务数组，只执行第一个
    const txToSend = Array.isArray(removeLiquidityTx)
      ? removeLiquidityTx[0]
      : removeLiquidityTx

    // 发送并确认交易
    const signature = await sendAndConfirmTransaction(connection, txToSend, [
      wallet,
    ])

    log(
      `流动性已移除，Position已关闭! 交易: https://solscan.io/tx/${signature}`
    )
    return signature
  } catch (error: any) {
    log(`移除流动性失败: ${error.message}`)
    throw error
  }
}

// 添加流动性
export async function addLiquidityTrans(
  connection: Connection,
  wallet: Keypair,
  poolInfo: PoolInfo,
  positionKeypair: Keypair
): Promise<PositionInfoTrans> { // 返回 TransactionInstruction
  const { poolAddress, tokenX, tokenY } = poolInfo
  log(`为池子 ${poolAddress} | ${tokenX.symbol}-${tokenY.symbol} 添加流动性 | ${positionKeypair.publicKey}`)
  log(`start`)

  try {
    // 创建DLMM实例
    const dlmm = await DLMM.create(connection, poolAddress, {
      cluster: 'mainnet-beta',
    })

    // 获取活跃bin
    const activeBin = await dlmm.getActiveBin()
    const activeBinPriceLamport = activeBin.price;
    const activeBinPricePerToken = dlmm.fromPricePerLamport(
      Number(activeBin.price)
    );
    log(`池子活跃bin ID: ${activeBin.binId}`)
    log(`池子Price: ${activeBinPriceLamport}`)
    log(`池子PricePerToken: ${activeBinPricePerToken}`)

    // 使用小额流动性 (每个代币1个单位)
    // 根据代币小数位调整金额
    //const xAmount = new BN(0.3 * 10 ** tokenX.decimals)
    // const yAmount = new BN(0 ** tokenY.decimals)

    // USDC-SOL  0-0.05
    // 使用小额流动性 (每个代币1个单位)
    const xAmount = new BN(Number(process.env.TOKEN_X_AMOUNT) * 10 ** tokenX.decimals); // 确保xAmount也正确计算
    const yAmount = new BN(Number(process.env.TOKEN_Y_AMOUNT) * 10 ** tokenY.decimals); // 使用环境变量并考虑小数位

    log(`流动性LP:${tokenX.symbol}:${xAmount}-${tokenY.symbol}:${yAmount}`)
    log(`xAmount: ${xAmount}`)
    log(`yAmount: ${yAmount}`)

    // 添加流动性 - 使用平衡策略
    const addLiquidityTx =
      await dlmm.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionKeypair.publicKey,
        user: wallet.publicKey,
        totalXAmount: xAmount,
        totalYAmount: yAmount,
        strategy: {
          minBinId: activeBin.binId - 10, // 活跃bin左侧5个bin
          maxBinId: activeBin.binId + 10, // 活跃bin右侧5个bin
          strategyType: StrategyType.Spot, // 使用平衡策略
        },
      })

    // 发送并确认交易
    // const signature = await sendAndConfirmTransaction(
    //   connection,
    //   addLiquidityTx,
    //   [wallet, positionKeypair]
    // )

    // 提取指令
    const instructions: TransactionInstruction[] = [];
    instructions.push(...addLiquidityTx.instructions);


    log(`预添加流动性: ${addLiquidityTx}`)

    // 返回position信息
    // return {
    //  positionPublicKey: positionKeypair.publicKey,
    //  signature,
    //}
    return {
      positionKeypair: positionKeypair,
      positionPublicKey: positionKeypair.publicKey,
      transactions: instructions,
    }
  } catch (error: any) {
    log(`预添加流动性失败: ${error.message}`)
    log(`完整错误信息: ${JSON.stringify(error)}`) // 打印完整的错误信息
    throw error
  }
}

// 移除流动性并关闭position
export async function removeLiquidityTrans(
  connection: Connection,
  wallet: Keypair,
  poolInfo: PoolInfo,
  positionPublicKey: PublicKey
): Promise<TransactionInstruction[]> { // 返回 TransactionInstruction
  const { poolAddress, tokenX, tokenY } = poolInfo
  log(`从 ${poolAddress} | ${tokenX.symbol}-${tokenY.symbol} 池子移除流动性 | ${positionPublicKey}`)
  try {
    // 创建DLMM实例
    const dlmm = await DLMM.create(connection, poolAddress, {
      cluster: 'mainnet-beta',
    })

    // 获取position信息
    const position = await dlmm.getPosition(positionPublicKey)
    log(
      `找到Position，包含 ${position.positionData.positionBinData.length} 个bins`
    )

    // 获取所有binIds
    const binIds = position.positionData.positionBinData.map(bin => bin.binId)

    // 移除流动性交易
    const removeLiquidityTx = await dlmm.removeLiquidity({
      user: wallet.publicKey,
      position: positionPublicKey,
      binIds,
      bps: new BN(10000), // 移除100%流动性
      shouldClaimAndClose: true, // 同时关闭position
    })
    log(`预移除流动性提取事务: ${removeLiquidityTx}`)
    
    // 提取所有指令
    const instructions: TransactionInstruction[] = [];

    if (Array.isArray(removeLiquidityTx)) {
      // 处理事务数组
      removeLiquidityTx.forEach(tx => {
        instructions.push(...tx.instructions);
      });
    } else {
      // 处理单个事务
      instructions.push(...removeLiquidityTx.instructions);
    }


    // 如果是事务数组，只执行第一个
    // const txToSend = Array.isArray(removeLiquidityTx)
    //   ? removeLiquidityTx[0]
    //   : removeLiquidityTx

    // // 发送并确认交易
    // const signature = await sendAndConfirmTransaction(connection, txToSend, [
    //   wallet,
    // ])

    log(
      `预移除流动性: ${instructions}`
    )
    return instructions
  } catch (error: any) {
    log(`预移除流动性失败: ${error.message}`)
    throw error
  }
}