/* -------------------------------------------------------------------------- */
/*                         encAlgorithms.ts                                   */
/* -------------------------------------------------------------------------- */
/**
 * 根据示例代码实现的对称加密算法封装：
 * - AES-GCM（Algorithm A）
 * - AES-CBC（Algorithm B）
 *
 * 每个 encrypt函数返回 {cipher, key}，其中：
 *   cipher : base64(iv|ciphertext)
 *   key    : CryptoKey 对象（直接返回，供内部调用）
 *
 * decrypt函数需要 EncResult（含 key），返回明文字符串。
 *
 * 加解密过程中依赖 src/utils/cryptoUtils.ts 中的 Base64/拼接工具。
 */
import { bytesToBase64, base64ToBytes, concatBytes } from './cryptoUtils';

export interface EncResult {
  cipher: string; // base64(iv+ciphertext)
  key: CryptoKey;
}

/********************* AES-GCM (Algorithm A) ************************/ 
export async function encryptWithA(plaintext: string): Promise<EncResult> {
  const alg = 'AES-GCM';
  const key = await crypto.subtle.generateKey({ name: alg, length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: alg, iv }, key, encoded);
  const combined = concatBytes(iv, new Uint8Array(cipherBuf));
  return { cipher: bytesToBase64(combined), key };
}

export async function decryptWithA(enc: EncResult): Promise<string> {
  const bytes = base64ToBytes(enc.cipher);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, enc.key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

/********************* AES-CBC (Algorithm B) ************************/ 
export async function encryptWithB(plaintext: string): Promise<EncResult> {
  const alg = 'AES-CBC';
  const key = await crypto.subtle.generateKey({ name: alg, length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(plaintext);
  const padLen = 16 - (encoded.length % 16);
  const padded = new Uint8Array(encoded.length + padLen);
  padded.set(encoded);
  padded.fill(padLen, encoded.length);
  const cipherBuf = await crypto.subtle.encrypt({ name: alg, iv }, key, padded);
  const combined = concatBytes(iv, new Uint8Array(cipherBuf));
  return { cipher: bytesToBase64(combined), key };
}

export async function decryptWithB(enc: EncResult): Promise<string> {
  const bytes = base64ToBytes(enc.cipher);
  const iv = bytes.slice(0, 16);
  const ciphertext = bytes.slice(16);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, enc.key, ciphertext);
  let plain = new Uint8Array(plainBuf);
  const padLen = plain[plain.length - 1];
  plain = plain.slice(0, plain.length - padLen);
  return new TextDecoder().decode(plain);
} 