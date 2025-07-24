/* -------------------------------------------------------------------------- */
/*                               cryptoUtils.ts                               */
/* -------------------------------------------------------------------------- */
/**
 * 通用二进制 / Base64 / Uint8Array 工具函数。
 * 独立于加密实现，方便在其他模块中复用。
 * AES 相关辅助如拼接 iv|cipher 也放在此文件，以保持高内聚、低耦合。
 */

/** 将 Uint8Array 编码为 base64 字符串 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** 将 base64 字符串解码为 Uint8Array */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 将两个 Uint8Array 依次拼接 */
export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const res = new Uint8Array(a.length + b.length);
  res.set(a, 0);
  res.set(b, a.length);
  return res;
}

/** CryptoKey -> base64(raw) */
export async function keyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

/** base64(raw) -> CryptoKey (根据算法名导入) */
export async function base64ToKey(b64: string, alg: 'AES-GCM' | 'AES-CBC', usages: KeyUsage[]): Promise<CryptoKey> {
  const bytes = base64ToBytes(b64);
  return crypto.subtle.importKey('raw', bytes, { name: alg }, false, usages);
} 