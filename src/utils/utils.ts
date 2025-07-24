/**
 * 实用工具函数库
 */

/**
 * 生成8位随机哈希值
 * @returns 8位随机字符串
 */
export function generateHash(): string {
    // 生成8位随机字符串
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * 格式化日期为YYYY-MM-DD格式
 * @param date 日期对象，默认为当前日期
 * @returns 格式化的日期字符串
 */
export function formatDate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 检查字符串是否为有效的十六进制颜色代码
 * @param color 要检查的颜色字符串
 * @returns 是否为有效的颜色代码
 */
export function isValidHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * 生成随机的十六进制颜色
 * @returns 随机生成的颜色代码，格式为 #RRGGBB
 */
export function generateRandomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

/**
 * 将十六进制颜色转换为带透明度的RGBA
 * @param hex 十六进制颜色，如 #RRGGBB
 * @param alpha 透明度，0-1之间
 * @returns RGBA颜色字符串
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
    // 移除#前缀
    hex = hex.replace('#', '');
    
    // 获取RGB值
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 深度克隆对象
 * @param obj 要克隆的对象
 * @returns 克隆后的新对象
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 获取当前时间戳
 * @returns 毫秒级时间戳
 */
export function getTimestamp(): number {
    return Date.now();
}

/**
 * 从文件路径中提取文件名（不含路径）
 * @param path 文件路径
 * @returns 文件名
 */
export function extractFilenameFromPath(path: string): string {
    if (!path) return '';
    
    // 处理 Windows 和 Unix 路径
    const parts = path.split(/[\/\\]/);
    return parts[parts.length - 1];
} 