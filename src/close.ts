// solana-account-recovery.ts
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  AccountLayout,
} from '@solana/spl-token'

// Meteora程序ID

// 定义账户信息接口
interface AccountInfo {
  pubkey: PublicKey
  type: string
  mint?: PublicKey
  balance: number
  lamports: number
  tokenIdentifier?: string
  closable: boolean
  signature?: string
  error?: string
}

// 定义结果接口
interface RecoveryResults {
  walletAddress: string
  initialBalance: number
  closableAccounts: AccountInfo[]
  closedAccounts: AccountInfo[]
  failedAccounts: AccountInfo[]
  totalRecovered: number
  newBalance: number
  error?: string
}

// 定义关闭账户操作的结果类型
interface CloseAccountResult {
  success: boolean
  account: AccountInfo
  error?: string
}

/**
 * Solana账户自动检测与批量并发回收工具
 * @param connection - Solana连接实例
 * @param wallet - 钱包密钥对
 * @param executeClosing - 是否执行关闭操作，默认false只扫描不执行
 * @param concurrency - 并发数量，默认10
 * @returns 操作结果对象
 */
export const recoverAccounts = async (
  connection: Connection,
  wallet: Keypair,
  executeClosing: boolean = false,
  concurrency: number = 10
): Promise<RecoveryResults> => {
  const results: RecoveryResults = {
    walletAddress: wallet.publicKey.toString(),
    initialBalance: 0,
    closableAccounts: [],
    closedAccounts: [],
    failedAccounts: [],
    totalRecovered: 0,
    newBalance: 0,
  }

  console.log(`===== Solana账户回收工具 =====`)
  console.log(`钱包地址: ${results.walletAddress}`)

  // 获取钱包SOL余额
  results.initialBalance = await connection.getBalance(wallet.publicKey)
  console.log(
    `钱包初始余额: ${results.initialBalance / LAMPORTS_PER_SOL} SOL\n`
  )

  // 查找所有可回收的账户
  console.log('正在查找所有可回收的账户...')

  // 查询SPL代币账户
  console.log('正在查询SPL代币账户...')
  try {
    const tokenAccountsResponse = await connection.getTokenAccountsByOwner(
      wallet.publicKey,
      { programId: TOKEN_PROGRAM_ID }
    )

    // 解析每个代币账户
    for (const { pubkey, account } of tokenAccountsResponse.value) {
      // 将Buffer转为Uint8Array以兼容AccountLayout.decode
      const data = Buffer.from(account.data)
      const accountData = AccountLayout.decode(data)

      // 确保tokenAmount是一个BigInt，并将其转换为数字
      // 注意：如果代币数量很大，这里可能会有精度问题
      const tokenBalance = Number(accountData.amount)
      const mint = new PublicKey(accountData.mint)

      // 获取代币简短标识
      const tokenIdentifier = mint.toString().substring(0, 8) + '...'

      // 确认账户是否可关闭（余额为0）
      const isClosable = tokenBalance === 0

      const accountInfo: AccountInfo = {
        pubkey,
        type: 'SPL代币账户',
        mint,
        balance: tokenBalance,
        lamports: account.lamports,
        tokenIdentifier,
        closable: isClosable,
      }

      // 如果账户可关闭，添加到可关闭账户列表
      if (isClosable) {
        results.closableAccounts.push(accountInfo)
      }
    }
  } catch (err) {
    const error = err as Error
    console.error('查询代币账户出错:', error.message)
    return { ...results, error: error.message }
  }

  // 显示可关闭的账户列表
  if (results.closableAccounts.length === 0) {
    console.log('\n未找到可关闭的账户')
    return results
  }

  console.log(`\n找到 ${results.closableAccounts.length} 个可关闭的账户:`)
  results.closableAccounts.forEach((account, index) => {
    console.log(
      `[${index + 1}] ${account.pubkey.toString()} - ${account.type} - ${
        account.tokenIdentifier
      } - ${account.lamports / LAMPORTS_PER_SOL} SOL可回收`
    )
  })

  // 如果不执行关闭操作，到此结束
  if (!executeClosing) {
    console.log('\n仅扫描模式完成，未执行任何关闭操作')
    return results
  }

  // 执行关闭操作 - 并发版本
  console.log(`\n开始并发关闭账户(最大并发数: ${concurrency})...`)

  // 关闭单个账户的函数
  const closeAccount = async (
    account: AccountInfo
  ): Promise<CloseAccountResult> => {
    try {
      console.log(`正在关闭账户: ${account.pubkey.toString()}`)

      if (account.type === 'SPL代币账户') {
        // 创建关闭SPL代币账户的交易
        const closeInstruction = createCloseAccountInstruction(
          account.pubkey,
          wallet.publicKey,
          wallet.publicKey
        )

        const transaction = new Transaction().add(closeInstruction)

        // 设置最近的区块哈希，用于避免交易重复问题
        const { blockhash } = await connection.getLatestBlockhash('confirmed')
        transaction.recentBlockhash = blockhash

        transaction.feePayer = wallet.publicKey

        // 发送交易
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [wallet],
          { commitment: 'confirmed' }
        )

        console.log(
          `✓ 账户已关闭: ${account.pubkey
            .toString()
            .substring(0, 8)}... 交易签名: ${signature.substring(0, 10)}...`
        )

        return {
          success: true,
          account: { ...account, signature },
        }
      }

      return {
        success: false,
        account,
        error: '不支持的账户类型',
      }
    } catch (err) {
      const error = err as Error
      console.error(
        `✗ 关闭失败: ${account.pubkey.toString().substring(0, 8)}... 错误: ${
          error.message
        }`
      )
      return {
        success: false,
        account,
        error: error.message,
      }
    }
  }

  // 分批处理账户关闭
  const totalAccounts = results.closableAccounts.length
  let processedCount = 0

  // 批量处理函数
  const processBatch = async (
    accounts: AccountInfo[]
  ): Promise<CloseAccountResult[]> => {
    const promises = accounts.map(closeAccount)
    return Promise.all(promises)
  }

  // 开始分批处理
  for (let i = 0; i < totalAccounts; i += concurrency) {
    const batch = results.closableAccounts.slice(i, i + concurrency)
    const batchResults = await processBatch(batch)

    // 记录结果
    for (const result of batchResults) {
      if (result.success) {
        results.closedAccounts.push(result.account)
      } else {
        results.failedAccounts.push({
          ...result.account,
          error: result.error,
        })
      }
    }

    // 更新进度
    processedCount += batch.length
    console.log(
      `进度: ${processedCount}/${totalAccounts} (${Math.round(
        (processedCount / totalAccounts) * 100
      )}%)`
    )
  }

  // 获取操作完成后的余额
  results.newBalance = await connection.getBalance(wallet.publicKey)
  results.totalRecovered = results.newBalance - results.initialBalance

  console.log(
    `\n操作完成! 成功: ${results.closedAccounts.length}, 失败: ${results.failedAccounts.length}`
  )
  console.log(`钱包当前余额: ${results.newBalance / LAMPORTS_PER_SOL} SOL`)
  console.log(`增加了: ${results.totalRecovered / LAMPORTS_PER_SOL} SOL`)

  return results
}
