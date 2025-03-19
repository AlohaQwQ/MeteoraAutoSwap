// src/main.ts
import { Keypair, PublicKey } from '@solana/web3.js'
import { initConnection } from './connection'
import { createPool } from './pool'
import { addLiquidity, addLiquidityTrans, removeLiquidity, removeLiquidityTrans } from './liquidity'
import { executeSwap, executeSwapTrans } from './swap'
import { mintToken } from './mint'
import { recoverAccounts } from './close'
import { CONFIG, POOL_ADDRESS, POOL_TOKENS, BIN_STEPS } from './config'
import BN from 'bn.js'
import { getRandomInt, getRandomWaitTime, log, sleep } from './utils'
import { PoolInfo, Token } from './types'
import { Transaction,  sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import dotenv from 'dotenv'
dotenv.config({ path: 'config.txt' })

// 定义固定的池子信息
// const fixedPoolInfo: PoolInfo = {
//   poolAddress: new PublicKey('3SFQjmDsi5NsjJeZfz7fgJ6VddX3TcuZkv2eUibWJN8N'), // 替换为实际的池子地址
//   tokenX: {
//     address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // 替换为实际的代币X地址
//     symbol: 'USDC', // 替换为实际的代币X符号
//     decimals: 6,
//   },
//   tokenY: {
//     address: 'So11111111111111111111111111111111111111112', // 替换为实际的代币Y地址
//     symbol: 'SOL', // 替换为实际的代币Y符号
//     decimals: 9,
//   },
//   binStep: new BN(20), // 替换为实际的步长
//   isNew: false, // 根据需要设置为true或false
// }

// 定义LP池子信息
const fixedPoolInfo: PoolInfo = {
  poolAddress: POOL_ADDRESS ? new PublicKey(POOL_ADDRESS) : new PublicKey('91Q7G5n6Ux2qYo8vMMiuPGY5bJrjbuMucc8kmncAuqqn'),
  tokenX: {
    address: POOL_TOKENS[0].address,
    symbol: POOL_TOKENS[0].symbol,
    decimals: POOL_TOKENS[0].decimals,
  },
  tokenY: {
    address: POOL_TOKENS[1].address,
    symbol: POOL_TOKENS[1].symbol,
    decimals: POOL_TOKENS[1].decimals,
  },
  binStep: new BN(BIN_STEPS[0]),
  isNew: false,
}

// 自动化积分挖掘主循环
async function automatePointsFarming(): Promise<void> {
  // 初始化连接和钱包
  //const { connection, wallet } = initConnection()
  log(`开始Meteora积分挖掘`)
  
  // 追踪周期数
  let cycleCount = 0

  // 无限循环
  while (true) {
    cycleCount++
    log(`\n======== 开始第 ${cycleCount} 轮循环 ========`)

    try {
      // 1. 创建新池子或使用现有池子
      //log('步骤1: 创建或使用现有池子')
      //const poolInfo = await createPool(connection, wallet)

      // 获取下一个钱包
      // const wallet = getNextWallet()
      const { connection, wallet } = initConnection()
      log(`使用钱包地址: ${wallet.publicKey.toString()}`)
      // 初始化连接
      // const { connection } = initConnection(wallet)
      // 1. 创建新池子或使用现有池子
      // log('步骤1: 创建或使用现有池子')
      // const poolInfo = await createPool(connection, wallet)

      //log('步骤1: 使用固定池子')
      // const poolInfo = fixedPoolInfo; 

      // 1. 创建新池子或使用现有池子
      let poolInfo: PoolInfo
      if (POOL_ADDRESS) {
        // 使用固定池子
        log('步骤1: 使用固定池子') // 使用固定的池子信息
        poolInfo = fixedPoolInfo
      } else {
        log('步骤1: 创建或使用现有池子')
        poolInfo = await createPool(connection, wallet) 
      }

      log('步骤1: 使用固定池子')
      //const poolInfo = fixedPoolInfo; // 使用固定的池子信息
      log(JSON.stringify(poolInfo))
      if (poolInfo.isNew) {
        log(
          `成功创建新池子: ${poolInfo.tokenX.symbol}-${poolInfo.tokenY.symbol}`
        )
      } else {
        log(`使用现有池子: ${poolInfo.tokenX.symbol}-${poolInfo.tokenY.symbol}`)

        // 对于现有池子，等待一小段时间确保池子可用
        // await sleep(3000)
      }

      // 2. 添加流动性
      log('步骤2: 添加流动性')
      const posKeypair = new Keypair()
      const positionInfo = await addLiquidity(
        connection,
        wallet,
        poolInfo,
        posKeypair
      )

      // 3. 执行几笔交易
      log('步骤3: 执行几笔交易')
      const [minSwaps, maxSwaps] = CONFIG.SWAPS_PER_CYCLE
      const numSwaps = getRandomInt(minSwaps, maxSwaps) // 执行配置的笔数交易
      // for (let i = 0; i < numSwaps; i++) {
      //   log(`执行第 ${i + 1}/${numSwaps} 笔交易`)
      //   const swapForY = i % 2 === 0 // 偶数或0时从X兑换到Y，奇数时从Y兑换到X
      //   const swapAmount = swapForY 
      //   ? parseFloat(process.env.TOKEN_X_SWAP_AMOUNT || '0.01') 
      //   : parseFloat(process.env.TOKEN_Y_SWAP_AMOUNT || '0.01')
      //   await executeSwap(connection, wallet, poolInfo, swapForY, swapAmount)

      //   // 随机等待配置的时间模拟真实行为
      //   //const [minWait, maxWait] = CONFIG.WAIT_BETWEEN_SWAPS
      //   //const waitTime = getRandomWaitTime(minWait, maxWait)
      //   //log(`等待 ${Math.round(waitTime / 1000)} 秒...`)
      //   //await sleep(waitTime)
      // }

      let currentAmount = parseFloat(process.env.TOKEN_X_SWAP_AMOUNT || '0.01')
      for (let i = 0; i < numSwaps; i++) {
        log(`执行第 ${i + 1}/${numSwaps1} 笔交易`)
        const swapForY = i % 2 === 0
        const { receivedAmount } = await executeSwap(connection, wallet, poolInfo, swapForY, currentAmount)
        currentAmount = receivedAmount

        // const [minWait, maxWait] = CONFIG.WAIT_BETWEEN_SWAPS
        // const waitTime = getRandomWaitTime(minWait, maxWait)
        // log(`等待 ${Math.round(waitTime / 1000)} 秒...`)
        // await sleep(waitTime)
      }

      // 4. 移除流动性
      log('步骤4: 移除流动性')
      await removeLiquidity(
        connection,
        wallet,
        poolInfo,
        positionInfo.positionPublicKey
      )

      // 5. 等待一段时间再开始下一轮
      const [minCycleWait, maxCycleWait] = CONFIG.WAIT_BETWEEN_CYCLES
      const waitBetweenCycles = getRandomWaitTime(minCycleWait, maxCycleWait)
      log(
        `本轮完成! 等待 ${Math.round(
          waitBetweenCycles / 1000
        )} 秒后开始下一轮...`
      )
      await sleep(waitBetweenCycles)
    } catch (err: any) {
      log(`循环中出错: ${err.message}`)
      log(`等待 ${CONFIG.WAIT_AFTER_ERROR / 1000} 秒后重试...`)
      await sleep(CONFIG.WAIT_AFTER_ERROR) // 出错后等待配置的时间
    }
  }
}


// 自动化积分挖掘主循环
// async function automatePointsFarmingTransaction(): Promise<void> {
//   // 初始化连接和钱包
//   const { connection, wallet } = initConnection()
//   log(`开始Meteora积分挖掘，钱包地址: ${wallet.publicKey.toString()}`)

//   // 追踪周期数
//   let cycleCount = 0
  
//   // 无限循环
//   while (true) {
//     cycleCount++
//     log(`\n======== 开始第 ${cycleCount} 轮循环 ========`)

//     try {
//       // 1. 创建新池子或使用现有池子
//       //log('步骤1: 创建或使用现有池子')
//       //const poolInfo = await createPool(connection, wallet)

//       // 创建交易
//       const transaction = new Transaction();

//       log('步骤1: 使用固定池子')
//       const poolInfo = fixedPoolInfo; // 使用固定的池子信息
//       log(JSON.stringify(poolInfo))
//       if (poolInfo.isNew) {
//         log(
//           `成功创建新池子: ${poolInfo.tokenX.symbol}-${poolInfo.tokenY.symbol}`
//         )
//       } else {
//         log(`使用现有池子: ${poolInfo.tokenX.symbol}-${poolInfo.tokenY.symbol}`)

//         // 对于现有池子，等待一小段时间确保池子可用
//         // await sleep(3000)
//       }

//       // 2. 添加流动性
//       log('步骤2: 添加流动性')
//       const posKeypair = new Keypair()
//       const positionInfo = await addLiquidityTrans(
//         connection,
//         wallet,
//         poolInfo,
//         posKeypair
//       )
//       transaction.add(...positionInfo.transactions);

//       // 3. 执行几笔交易
//       log('步骤3: 执行几笔交易')
//       const [minSwaps, maxSwaps] = CONFIG.SWAPS_PER_CYCLE
//       const numSwaps = getRandomInt(minSwaps, maxSwaps) // 执行配置的笔数交易

//       for (let i = 0; i < numSwaps; i++) {
//         log(`执行第 ${i + 1}/${numSwaps} 笔交易`)
//         const swapTransaction = await executeSwapTrans(connection, wallet, poolInfo)
//         // transaction.add(...swapTransaction);

//         swapTransaction.forEach(instruction => {
//           if (!transaction.instructions.includes(instruction)) {
//             transaction.add(instruction);
//           }
//         });
//         // 随机等待配置的时间模拟真实行为
//         //const [minWait, maxWait] = CONFIG.WAIT_BETWEEN_SWAPS
//         //const waitTime = getRandomWaitTime(minWait, maxWait)
//         //log(`等待 ${Math.round(waitTime / 1000)} 秒...`)
//         //await sleep(waitTime)
//       }
//       log(`发起批量交易`);
      
//       // 发送并确认交易
//       const signature = await sendAndConfirmTransaction(connection, transaction, [wallet, positionInfo.positionKeypair]);
//       log(`批量交易成功! 交易: https://solscan.io/tx/${signature}`);

//       // 4. 移除流动性
//       log('步骤4: 移除流动性')
//       const removeLiquidityTransaction = await removeLiquidity(
//         connection,
//         wallet,
//         poolInfo,
//         positionInfo.positionPublicKey
//       )
//       //transaction.add(...removeLiquidityTransaction);
//       // 如果removeLiquidityTransaction是一个数组，取第一个
//       // if (Array.isArray(removeLiquidityTransaction)) {
//       //   transaction.add(removeLiquidityTransaction[0]);
//       // } else {
//       //   transaction.add(removeLiquidityTransaction);
//       // }

//       // 随机等待配置的时间模拟真实行为
//       // const [minWait, maxWait] = CONFIG.WAIT_BETWEEN_SWAPS
//       // const waitTime = getRandomWaitTime(minWait, maxWait)
//       // log(`等待 ${Math.round(waitTime / 1000)} 秒...`)
//       // await sleep(waitTime)
      
//       //log(`发起批量交易`);
      
//       // 发送并确认交易
//       //const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
//       //log(`批量交易成功! 交易: https://solscan.io/tx/${signature}`);

//       // 5. 等待一段时间再开始下一轮
//       const [minCycleWait, maxCycleWait] = CONFIG.WAIT_BETWEEN_CYCLES
//       const waitBetweenCycles = getRandomWaitTime(minCycleWait, maxCycleWait)
//       log(
//         `本轮完成! 等待 ${Math.round(
//           waitBetweenCycles / 1000
//         )} 秒后开始下一轮...`
//       )
//       await sleep(waitBetweenCycles)
//     } catch (err: any) {
//       log(`循环中出错: ${err.message}`)
//       log(`等待 ${CONFIG.WAIT_AFTER_ERROR / 1000} 秒后重试...`)
//       await sleep(CONFIG.WAIT_AFTER_ERROR) // 出错后等待配置的时间
//     }
//   }
// }


// 主函数
async function main(): Promise<void> {
  await automatePointsFarming()
  // await automatePointsFarmingTransaction()
}

// 启动程序
main().catch((err: Error) => {
  console.error('程序出错:', err)
})
