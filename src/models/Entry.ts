/**
 * 条目数据结构接口
 * 用于定义被标记的条目属性和类型
 */
export interface Entry {
    /**
     * 条目唯一标识符，8位随机值
     */
    hash: string;
    
    /**
     * 条目的文本内容
     */
    value: string;
    
    /**
     * 条目的批注
     */
    comment: string;
    
    /**
     * 所属集合名称
     */
    set: string;
    
    /**
     * 条目标签
     */
    tag: string[];
    
    /**
     * 关联条目的哈希数组，用于建立条目间的关联关系
     */
    link: string[];
    
    /**
     * 条目创建时间，格式为 YYYY-MM-DD
     */
    addTime: string;
    
    /**
     * 条目到期时间，格式为 YYYY-MM-DD
     */
    expireTime: string;
    
    /**
     * 条目类型，可以是视频、PDF、Markdown或图片
     */
    type: "video" | "pdf" | "md" | "image";
    
    /**
     * 条目来源文件路径
     */
    sourceFile: string;
    
    /**
     * 条目附件文件路径数组，例如引用的图片等
     */
    attachmentFile: string[];
    
    /**
     * 条目索引或排序信息
     */
    index: string;
    
    /**
     * 熟练度 (proficiency) ，0~n 级，默认 0。
     * 为了向后兼容，仍使用字段名 reserve1 进行存储。
     */
    proficiency?: number;
    
    /**
     * 条目最后修改时间的时间戳，用于增量索引判断
     * 单位：毫秒
     */
    mtime?: number;
    
    /**
     * 
     */
    reserve2?: any;
}

/**
 * 创建新条目的默认参数
 */
export const DEFAULT_ENTRY: Omit<Entry, 'hash' | 'value' | 'set' | 'addTime' | 'expireTime' | 'sourceFile'> = {
    comment: "",
    tag: [],
    link: [],
    type: "md",
    attachmentFile: [],
    index: "",
    proficiency: 0,
    mtime: undefined, // 不设置默认值，让创建时动态设置
}; 