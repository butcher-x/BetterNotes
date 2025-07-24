/* -------------------------------------------------------------------------- */
/*                               license.ts                                   */
/* -------------------------------------------------------------------------- */
/**
 * 在线授权逻辑
 * --------------------------------------------------
 * 1. decryptLicense(licenseB64, code)  → 使用 code 派生的 AES-256-GCM 密钥解密服务器返回的 license
 * 2. verifyLicense(licenseB64, code, vaultPath) → 判断明文是否等于 vaultPath
 */

import { base64ToBytes } from './cryptoUtils';

/** 根据用户输入的激活码派生 256bit AES-GCM 密钥 */
async function deriveKeyFromCode(code: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
}

/**
 * 解密服务器返回的 license
 * license = base64( iv[12] | cipher+tag[16] )
 */
export async function decryptLicense(licenseB64: string, code: string): Promise<string | null> {
  if (!licenseB64 || !code) return null;
  try {
    const raw = base64ToBytes(licenseB64.trim());
    if (raw.length < 28) throw new Error('License 长度不足');

    const iv = raw.slice(0, 12);
    const cipherAndTag = raw.slice(12); // cipherText + 16-byte tag
    const key = await deriveKeyFromCode(code.trim());

    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherAndTag);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    console.error('[BetterNotes] License 解密失败:', e);
    return null;
  }
}

/**
 * 校验 license 是否有效
 */
export async function verifyLicense(licenseB64: string, code: string, vaultPath: string): Promise<boolean> {
  const plain = await decryptLicense(licenseB64, code);
  return plain === vaultPath;
} 