/**
 * SetSelectionService
 * -------------------------------------------------------
 * 维护"当前选中的 set-类型 Collection"状态，并提供事件订阅能力。
 * 注意：该服务并不直接依赖任何 UI，实现纯状态与事件管理，方便在多个组件中复用。
 */

export type SetSelectionListener = (selected: string | null) => void;

export class SetSelectionService {
  private selected: string | null = null;
  private readonly listeners = new Set<SetSelectionListener>();

  /**
   * 获取当前选中的 set 名称；若未选中则返回 null。
   */
  public getSelected(): string | null {
    return this.selected;
  }

  /**
   * 选择新的 set；重复选择同一 set 将取消选择（即切换为 null）。
   * 调用后会同步通知所有监听器。
   * @param setName 要选择的集合名称
   */
  public select(setName: string): void {
    const newVal = this.selected === setName ? null : setName;
    if (this.selected === newVal) return;
    this.selected = newVal;
    this.emit();
  }

  /**
   * 订阅选中变化事件。
   * 返回取消订阅函数。
   */
  public onChange(listener: SetSelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) {
      try {
        l(this.selected);
      } catch (e) {
        console.error('SetSelectionService listener error', e);
      }
    }
  }
} 