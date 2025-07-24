/**
 * 插件类型定义文件
 * 集中管理插件中使用到的各种类型定义
 */

/**
 * 条目操作类型枚举
 */
export enum EntryOperation {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    MOVE = 'move'
}

/**
 * 集合操作类型枚举
 */
export enum CollectionOperation {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    RENAME = 'rename'
}

/**
 * 条目视图模式
 */
export enum EntryViewMode {
    LIST = 'list',
    GRID = 'grid',
    CALENDAR = 'calendar',
    KANBAN = 'kanban'
}

/**
 * 条目排序方式
 */
export enum EntrySortMode {
    ADD_TIME_ASC = 'addTimeAsc',
    ADD_TIME_DESC = 'addTimeDesc',
    EXPIRE_TIME_ASC = 'expireTimeAsc',
    EXPIRE_TIME_DESC = 'expireTimeDesc',
    ALPHABETICAL = 'alphabetical',
    CUSTOM = 'custom'
}

/**
 * 条目过滤条件
 */
export interface EntryFilter {
    text?: string;
    types?: string[];
    tags?: string[];
    dateRange?: {
        start?: string;
        end?: string;
    };
    collections?: string[];
}

/**
 * 导出选项
 */
export interface ExportOptions {
    includeCollections: boolean;
    includeEntries: boolean;
    selectedCollections?: string[];
    selectedEntries?: string[];
    exportFormat: 'json' | 'markdown' | 'csv';
} 