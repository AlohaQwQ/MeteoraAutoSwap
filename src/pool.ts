// src/pool.ts
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import DLMM, { deriveLbPair2 } from '@meteora-ag/dlmm'
import BN from 'bn.js'
import { PoolInfo, Token } from './types'
import { log, selectRandomBinStep, selectRandomTokenPair } from './utils'
import { BIN_STEPS, CONFIG, METEORA_PROGRAM_ID, POOL_TOKENS } from './config'
import { derivePresetParameter2 } from '@meteora-ag/dlmm' // 确保导入此函数

/**
 * 检查池子是否已存在
 */
export async function checkPoolExists(
  connection: Connection,
  tokenX: Token,
  tokenY: Token,
  binStep: BN,
  baseFactor: BN
): Promise<{ exists: boolean; poolAddress?: PublicKey }> {
  try {
    const programId = new PublicKey(METEORA_PROGRAM_ID)
    // 指定2个代币创建池子
    const [poolAddress] = deriveLbPair2(
      new PublicKey(tokenX.address),
      new PublicKey(tokenY.address),
      binStep,
      baseFactor,
      programId
    )

    log(`检查池子地址: ${poolAddress.toString()}`)

    // 首先直接检查账户是否存在
    const accountInfo = await connection.getAccountInfo(poolAddress)
    if (!accountInfo) {
      log(`池子账户不存在`)
      return { exists: false }
    }

    // 额外尝试创建DLMM实例确认
    try {
      await DLMM.create(connection, poolAddress, { cluster: 'mainnet-beta' })
      log(`池子存在并且是有效的DLMM池子`)
      return { exists: true, poolAddress }
    } catch (error: any) {
      // 账户存在但不是有效的DLMM池子
      log(`池子账户存在但不是有效的DLMM池子: ${error.message}`)
      return { exists: false }
    }
  } catch (error: any) {
    log(`检查池子存在性时出错: ${error.message}`)
    return { exists: false }
  }
}

/**
 * 创建新池子或使用现有池子
 */
export async function createPool(
  connection: Connection,
  wallet: Keypair,
  maxRetries: number = CONFIG.MAX_RETRIES_CREATE_POOL
): Promise<PoolInfo> {
  let retryCount = 0
  let lastError = null
  // 从配置中读取代币信息
  const tokenX = POOL_TOKENS[0]
  const tokenY = POOL_TOKENS[1]
  const binStep = new BN(BIN_STEPS[0])
  const baseFactor = new BN(CONFIG.BASE_FACTOR)

  while (retryCount < maxRetries) {
    try {
      // 选择随机代币对和参数
      //const { tokenX, tokenY } = selectRandomTokenPair(TOKENS)
      //const binStep = new BN(selectRandomBinStep(BIN_STEPS))
      //const baseFactor = new BN(CONFIG.BASE_FACTOR)

      log(
        `尝试创建/使用池子: ${tokenX.symbol}-${
          tokenY.symbol
        } 步长: ${binStep} (尝试 ${retryCount + 1}/${maxRetries})`
      )

      // 检查池子是否已存在
      const tokenXPubkey = new PublicKey(tokenX.address)
      const tokenYPubkey = new PublicKey(tokenY.address)

      const { exists, poolAddress } = await checkPoolExists(
        connection,
        tokenX,
        tokenY,
        binStep,
        baseFactor
      )

      if (exists && poolAddress) {
        log(
          `池子 ${tokenX.symbol}-${tokenY.symbol} 步长 ${binStep} 已存在，将使用现有池子`
        )
        return {
          poolAddress,
          tokenX,
          tokenY,
          binStep,
          isNew: false,
        }
      }

      // 重要修改：正确派生预设参数账户
      const programId = new PublicKey(METEORA_PROGRAM_ID)
      const [presetParamAddress] = derivePresetParameter2(
        binStep,
        baseFactor,
        programId
      )

      log(`使用预设参数地址: ${presetParamAddress.toString()}`)

      // 池子不存在，尝试创建
      const activeId = new BN(0) // 使用0作为初始active bin

      log(`开始创建新池子...`)
      const createPoolTx = await DLMM.createLbPair(
        connection,
        wallet.publicKey,
        tokenXPubkey,
        tokenYPubkey,
        binStep,
        baseFactor,
        presetParamAddress, // 使用正确的预设参数地址
        activeId,
        { cluster: 'mainnet-beta' }
      )

      // 发送并确认交易
      const signature = await sendAndConfirmTransaction(
        connection,
        createPoolTx,
        [wallet],
        { commitment: 'confirmed' }
      )

      log(`池子创建成功! 交易: https://solscan.io/tx/${signature}`)

      // 获取池子地址
      const [newPoolAddress] = deriveLbPair2(
        tokenXPubkey,
        tokenYPubkey,
        binStep,
        baseFactor,
        programId
      )

      // 等待确保池子创建成功
      await new Promise(resolve => setTimeout(resolve, 2000))

      return {
        poolAddress: newPoolAddress,
        tokenX,
        tokenY,
        binStep,
        isNew: true,
      }
    } catch (error: any) {
      lastError = error

      // 增强错误处理
      const errorMsg = error.message || ''
      log(`创建池子失败: ${errorMsg}`)

      // 检查是否是"池子已存在"错误
      if (errorMsg.includes('Pool already exists')) {
        log(`虽然之前检查不存在，但池子已存在。将尝试使用不同组合...`)
      } else if (errorMsg.includes('preset_parameter')) {
        log(`预设参数错误，可能需要使用正确的预设参数账户。`)
      }

      retryCount++

      if (retryCount >= maxRetries) {
        log(`已达到最大重试次数，不再尝试`)
      } else {
        // 增加不同的代币对选择，避免反复尝试相同组合
        log(`将尝试不同的代币对/binStep组合...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  throw new Error(
    `已达到最大重试次数 (${maxRetries})，无法创建池子: ${
      lastError?.message || 'Unknown error'
    }`
  )
}
