export interface Tag {
    /** 标签名称，统一使用小写并去除首尾空格作为主键 */
    tagName: string;
 
    /** 被多少条 Entry 引用 */
    count: number;
} 