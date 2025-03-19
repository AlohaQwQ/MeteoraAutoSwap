// src/types.ts
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { Connection, Keypair,   Transaction,
  TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js'

// 代币接口
export interface Token {
  symbol: string
  address: string
  decimals: number
}

// 池子信息接口
export interface PoolInfo {
  poolAddress: PublicKey
  tokenX: Token
  tokenY: Token
  binStep: BN
  isNew: boolean
}

// Position信息接口
export interface PositionInfo {
  positionPublicKey: PublicKey
  signature: string
}

// Position信息接口
export interface PositionInfoTrans {
  positionKeypair: Keypair
  positionPublicKey: PublicKey
  transactions: TransactionInstruction[]
}
