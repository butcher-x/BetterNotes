/**
 * 集合数据结构接口
 * 用于定义笔记集合的属性和类型
 */
export interface Collection {
    /**
     * 集合名称
     */
    name: string;
    
    /**
     * 集合颜色，格式为十六进制颜色代码（例如 "#eeff00"）
     */
    color: string;
    
    /**
     * 集合计划或描述
     */
    plan: string;
    
    /**
     * 集合类型，可以是文件夹（folder）或普通集合（set）
     */
    type: "folder" | "set";
    
    /**
     * 父集合的名称，用于实现集合的嵌套
     */
    parent: string;
    
    /**
     * 预留字段，用于未来扩展
     */
    reserve?: any;
}

/**
 * 创建新集合的默认参数
 */
export const DEFAULT_COLLECTION: Omit<Collection, 'name'> = {
    color: "#3498db",
    type: "set",
    parent: "",
    plan: "default"
}; 