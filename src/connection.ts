// src/connection.ts
import { Connection, Keypair } from '@solana/web3.js'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import dotenv from 'dotenv'

// 加载指定的配置文件
dotenv.config({ path: 'config.txt' })

// 加载钱包私钥
const walletPrivateKeys = process.env.WALLET_PRIVATE_KEYS?.split(',') || []

// 将私钥列表转换为 Keypair 对象
export const wallets = walletPrivateKeys.map(privateKey => {
  const wallet = new Uint8Array(bs58.decode(privateKey.trim()))
  return Keypair.fromSecretKey(wallet)
})

// 循环遍历钱包数组的方法
let walletIndex = 0
function getNextWallet(): Keypair {
  const wallet = wallets[walletIndex]
  walletIndex = (walletIndex + 1) % wallets.length
  return wallet
}

// 初始化连接和钱包
export const initConnection = (): {
  connection: Connection
  wallet: Keypair
} => {
  const privateKeys = process.env.WALLET_PRIVATE_KEYS
  if (!privateKeys) {
    throw new Error('请在.env文件中设置WALLET_PRIVATE_KEYS环境变量')
  }
  const wallet = getNextWallet();

  // const privateKey = process.env.WALLET_PRIVATE_KEY
  // if (!privateKey) {
  //   throw new Error('请在.env文件中设置WALLET_PRIVATE_KEY环境变量')
  // }
  // const wallet = Keypair.fromSecretKey(new Uint8Array(bs58.decode(privateKey)))
  // const connection = new Connection(
  //   process.env.RPC_URL || 'https://api.mainnet-beta.com',
  //   'confirmed'
  // )
  const connection = new Connection(
    process.env.RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=ecff580b-4374-f225b5bbd3df',
    'confirmed'
  )
  
  return { connection, wallet }
}
