// 导入必要的库
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import * as token from '@solana/spl-token'
import dotenv from 'dotenv'

// 加载环境变量
dotenv.config({ path: 'config.txt' })

// 创建并铸造代币的主函数
export const mintToken = async (connection: Connection, wallet: Keypair) => {
  try {
    // 检查账户余额
    const balance = await connection.getBalance(wallet.publicKey)
    console.log(`账户余额: ${balance / LAMPORTS_PER_SOL} SOL`)

    if (balance === 0) {
      throw new Error('您的账户没有SOL。请充值以创建代币。')
    }

    // 创建代币铸造账户
    console.log('创建代币铸造账户...')
    const mintKeypair = Keypair.generate()
    const tokenDecimals = 9 // 代币精度，与SOL相同

    // 计算创建代币所需的租金豁免费用
    const mintRent = await connection.getMinimumBalanceForRentExemption(
      token.MINT_SIZE
    )

    // 创建代币铸造指令
    const createMintAccountIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: token.MINT_SIZE,
      lamports: mintRent,
      programId: token.TOKEN_PROGRAM_ID,
    })

    // 初始化代币铸造指令
    const initializeMintIx = token.createInitializeMintInstruction(
      mintKeypair.publicKey,
      tokenDecimals,
      wallet.publicKey,
      wallet.publicKey,
      token.TOKEN_PROGRAM_ID
    )

    // 创建关联代币账户
    const associatedTokenAccount = await token.getAssociatedTokenAddress(
      mintKeypair.publicKey,
      wallet.publicKey
    )

    // 创建关联代币账户指令
    const createAssociatedTokenAccountIx =
      token.createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        associatedTokenAccount,
        wallet.publicKey,
        mintKeypair.publicKey
      )

    // 铸造代币指令
    const initialSupply = 1000000000000 // 1,000,000 代币（考虑精度）
    const mintTokensIx = token.createMintToInstruction(
      mintKeypair.publicKey,
      associatedTokenAccount,
      wallet.publicKey,
      initialSupply
    )

    // 组合所有指令到一个交易中
    const transaction = new Transaction().add(
      createMintAccountIx,
      initializeMintIx,
      createAssociatedTokenAccountIx,
      mintTokensIx
    )

    // 发送并确认交易
    const signature = await sendAndConfirmTransaction(connection, transaction, [
      wallet,
      mintKeypair,
    ])

    console.log('交易已确认！')
    console.log(`交易签名: ${signature}`)
    console.log(`代币铸造地址: ${mintKeypair.publicKey.toString()}`)
    console.log(`代币账户地址: ${associatedTokenAccount.toString()}`)
    console.log(
      `初始供应量: ${initialSupply / Math.pow(10, tokenDecimals)} 代币`
    )

    return {
      transactionSignature: signature,
      tokenMint: mintKeypair.publicKey.toString(),
      tokenAccount: associatedTokenAccount.toString(),
      tokenSupply: initialSupply / Math.pow(10, tokenDecimals),
    }
  } catch (error) {
    console.error('铸造代币时出错:', error)
    throw error
  }
}
