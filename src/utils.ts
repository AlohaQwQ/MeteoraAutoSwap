// src/utils.ts
import * as fs from 'node:fs'
import { CONFIG } from './config'
import { Token } from './types'
import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'

// 工具函数：休眠指定毫秒数
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 记录日志的函数，同时写入到文件和控制台
export function log(message: string): void {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\n')
}

// 随机选择两个不同的代币
export function selectRandomTokenPair(tokens: Token[]): {
  tokenX: Token
  tokenY: Token
} {
  const index1 = Math.floor(Math.random() * tokens.length)
  let index2 = Math.floor(Math.random() * tokens.length)

  // 确保两个代币不同
  while (index2 === index1) {
    index2 = Math.floor(Math.random() * tokens.length)
  }

  return {
    tokenX: tokens[index1],
    tokenY: tokens[index2],
  }
}

// 随机选择binStep
export function selectRandomBinStep(binSteps: number[]): number {
  return binSteps[Math.floor(Math.random() * binSteps.length)]
}

// 随机选择等待时间
export function getRandomWaitTime(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

// 从范围内获取随机整数
export function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
