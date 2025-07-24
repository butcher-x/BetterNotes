import { Modal, setIcon, Notice } from 'obsidian';
import BetterNotesPlugin from '../main';
import { Preset } from '../models/Preset';
import { t } from '../i18n';

/**
 * PresetModal - 管理 AI 预设提示词
 * --------------------------------------------------
 * 提供灵动可爱的界面，左侧为预设列表，右侧为编辑区域
 * 支持添加、编辑、删除预设，并通过 DataManager 持久化到 data.json
 */
export default class PresetModal extends Modal {
  private plugin: BetterNotesPlugin;
  private presets: Preset[];
  private currentPresetIndex: number = -1;
  private contentArea: HTMLDivElement;
  private presetListEl: HTMLDivElement;
  private presetEditorEl: HTMLDivElement;
  private presetNameEl: HTMLInputElement;
  private presetContentEl: HTMLTextAreaElement;
  /** 是否在关闭时跳过自动保存 */
  private skipSaveOnClose: boolean = false;

  constructor(plugin: BetterNotesPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.presets = [...this.plugin.dataManager.getAllPresets()]; // 克隆，避免直接操作原数据
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.addClass('BetterNotes-preset-modal');
    
    // 创建标题
    this.createHeader(contentEl);
    
    // 创建主内容区域
    this.contentArea = contentEl.createDiv('BetterNotes-preset-content');
    
    // 创建左侧预设列表
    this.createPresetList();
    
    // 创建右侧编辑区域
    this.createPresetEditor();
    
    // 创建底部操作按钮
    this.createFooter(contentEl);
    
    // 默认选中第一个预设，如果存在的话
    if (this.presets.length > 0) {
      this.selectPreset(0);
    } else {
      // 空列表：禁用编辑区域，提示用户点击 + 创建
      this.disableEditor();
    }
  }
  
  /**
   * 创建模态框标题区域
   * @param parentEl - 父元素
   */
  private createHeader(parentEl: HTMLElement): void {
    const headerEl = parentEl.createDiv('BetterNotes-preset-header');
    
    const titleContainer = headerEl.createDiv('BetterNotes-preset-title-container');
    const titleIcon = titleContainer.createDiv('BetterNotes-preset-title-icon');
    setIcon(titleIcon, 'message-square');
    
    titleContainer.createEl('div', { 
      text: t('AI preset prompt'),
      cls: 'BetterNotes-preset-title'
    });
    
    const subtitle = headerEl.createEl('p', {
      text: t('create and manage your AI conversation preset prompts'),
      cls: 'BetterNotes-preset-subtitle'
    });
  }
  
  /**
   * 创建左侧预设列表
   */
  private createPresetList(): void {
    // 创建列表容器
    this.presetListEl = this.contentArea.createDiv('BetterNotes-preset-list-container');
    const listHeader = this.presetListEl.createDiv('BetterNotes-preset-list-header');
    listHeader.createEl('div', { text: t('preset list') });
    
    // 添加新预设按钮
    const addBtnContainer = listHeader.createDiv('BetterNotes-preset-add-btn-container');
    const addBtn = addBtnContainer.createDiv('BetterNotes-preset-add-btn');
    setIcon(addBtn, 'plus');
    addBtn.setAttribute('aria-label', t('add new preset'));
    addBtn.addEventListener('click', () => this.addNewPreset());
    
    // 创建预设列表
    const listEl = this.presetListEl.createDiv('BetterNotes-preset-list');
    this.renderPresetList(listEl);
  }
  
  /**
   * 渲染预设列表
   * @param listEl - 列表容器元素
   */
  private renderPresetList(listEl: HTMLElement): void {
    listEl.empty();
    
    // 创建列表项
    this.presets.forEach((preset, index) => {
      const itemEl = listEl.createDiv({
        cls: `BetterNotes-preset-item ${index === this.currentPresetIndex ? 'selected' : ''}`,
        attr: { 'data-index': index.toString() }
      });
      
      const itemIcon = itemEl.createDiv('BetterNotes-preset-item-icon');
      setIcon(itemIcon, 'message-circle');
      
      const itemContent = itemEl.createDiv('BetterNotes-preset-item-content');
      itemContent.createEl('div', { 
        text: preset.label || t('unnamed preset'),
        cls: 'BetterNotes-preset-item-title'
      });
      
      const previewText = preset.prompt.length > 30 
        ? preset.prompt.substring(0, 30) + '...' 
        : preset.prompt;
      itemContent.createEl('div', {
        text: previewText || t('empty preset'),
        cls: 'BetterNotes-preset-item-preview'
      });
      
      // 删除按钮
      const deleteBtn = itemEl.createDiv('BetterNotes-preset-item-delete');
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.setAttribute('aria-label', t('delete preset'));
      
      // 点击事件
      itemEl.addEventListener('click', (e) => {
        if (e.target === deleteBtn || deleteBtn.contains(e.target as Node)) {
          this.deletePreset(index);
        } else {
          this.selectPreset(index);
        }
      });
    });
  }
  
  /**
   * 创建右侧编辑区域
   */
  private createPresetEditor(): void {
    this.presetEditorEl = this.contentArea.createDiv('BetterNotes-preset-editor');
    
    // 预设名称输入框
    const nameContainer = this.presetEditorEl.createDiv('BetterNotes-preset-name-container');
    nameContainer.createEl('label', { 
      text: t('preset name'),
      cls: 'BetterNotes-preset-label',
      attr: { for: 'preset-name-input' }
    });
    
    this.presetNameEl = nameContainer.createEl('input', {
      type: 'text',
      cls: 'BetterNotes-preset-name-input',
      attr: { 
        id: 'preset-name-input',
        placeholder: t('input preset name')
      }
    });
    
    // 预设内容文本框
    const contentContainer = this.presetEditorEl.createDiv('BetterNotes-preset-content-container');
    contentContainer.createEl('label', {
      text: t('preset content'),
      cls: 'BetterNotes-preset-label',
      attr: { for: 'preset-content-input' }
    });
    
    this.presetContentEl = contentContainer.createEl('textarea', {
      cls: 'BetterNotes-preset-content-input',
      attr: {
        id: 'preset-content-input',
        placeholder: t('input preset content'),
        rows: '10'
      }
    });
    
    // 添加输入事件监听
    this.presetNameEl.addEventListener('input', () => this.updateCurrentPreset());
    this.presetContentEl.addEventListener('input', () => this.updateCurrentPreset());
  }
  
  /**
   * 创建底部操作按钮
   * @param parentEl - 父元素
   */
  private createFooter(parentEl: HTMLElement): void {
    const footer = parentEl.createDiv('BetterNotes-modal-footer');
    
    // 保存按钮
    const saveBtn = footer.createEl('button', { 
      text: t('save'),
      cls: 'BetterNotes-btn BetterNotes-btn-primary'
    });
    saveBtn.addEventListener('click', () => this.savePresets(true /*shouldClose*/, true /*showNotice*/));
    
    // 取消按钮
    const cancelBtn = footer.createEl('button', {
      text: t('cancel'),
      cls: 'BetterNotes-btn'
    });
    cancelBtn.addEventListener('click', () => {
      // 标记跳过自动保存
      this.skipSaveOnClose = true;
      this.close();
    });
  }
  
  /**
   * 选择预设
   * @param index - 预设索引
   */
  private selectPreset(index: number): void {
    if (index < 0 || index >= this.presets.length) return;
    
    // 更新当前选中的预设索引
    this.currentPresetIndex = index;
    
    // 更新列表选中状态
    const listItems = this.presetListEl.querySelectorAll('.BetterNotes-preset-item');
    listItems.forEach(item => item.classList.remove('selected'));
    listItems[index]?.classList.add('selected');
    
    // 更新编辑区域内容
    const preset = this.presets[index];
    this.presetNameEl.value = preset.label;
    this.presetContentEl.value = preset.prompt;
    
    // 启用编辑区域
    this.enableEditor();
  }
  
  /**
   * 添加新预设
   */
  private addNewPreset(): void {
    // 创建新预设
    const newPreset: Preset = {
      label: t('new preset'),
      prompt: ''
    };
    
    // 添加到预设列表
    this.presets.push(newPreset);
    
    // 重新渲染列表
    this.renderPresetList(this.presetListEl.querySelector('.BetterNotes-preset-list') as HTMLElement);
    
    // 选中新添加的预设
    this.selectPreset(this.presets.length - 1);
    
    // 聚焦到名称输入框
    this.presetNameEl.focus();
    this.presetNameEl.select();
  }
  
  /**
   * 删除预设
   * @param index - 预设索引
   */
  private deletePreset(index: number): void {
    if (index < 0 || index >= this.presets.length) return;
    
    // 从列表中删除
    this.presets.splice(index, 1);
    
    // 重新渲染列表
    this.renderPresetList(this.presetListEl.querySelector('.BetterNotes-preset-list') as HTMLElement);
    
    // 调整当前索引 / 禁用编辑区域
    if (this.currentPresetIndex === index) {
      if (this.presets.length > 0) {
        this.selectPreset(Math.min(index, this.presets.length - 1));
      } else {
        this.currentPresetIndex = -1;
        this.disableEditor();
      }
    } else if (this.currentPresetIndex > index) {
      this.currentPresetIndex--;
    }
    
    // 删除后立即保存变更，保持数据同步
    this.savePresets(false /* shouldClose */, false /* showNotice */);
  }
  
  /**
   * 更新当前预设
   */
  private updateCurrentPreset(): void {
    if (this.currentPresetIndex < 0) return;
    
    // 更新当前预设的内容
    const preset = this.presets[this.currentPresetIndex];
    preset.label = this.presetNameEl.value;
    preset.prompt = this.presetContentEl.value;
    
    // 更新列表中的预设项
    const listEl = this.presetListEl.querySelector('.BetterNotes-preset-list') as HTMLElement;
    const itemEl = listEl.querySelector(`.BetterNotes-preset-item[data-index="${this.currentPresetIndex}"]`);
    if (itemEl) {
      const titleEl = itemEl.querySelector('.BetterNotes-preset-item-title') as HTMLElement;
      const previewEl = itemEl.querySelector('.BetterNotes-preset-item-preview') as HTMLElement;
      
      titleEl.textContent = preset.label || t('unnamed preset');
      
      const previewText = preset.prompt.length > 30 
        ? preset.prompt.substring(0, 30) + '...' 
        : preset.prompt;
      previewEl.textContent = previewText || t('empty preset');
    }
  }
  
  /**
   * 保存所有预设
   */
  private async savePresets(shouldClose: boolean = true, showNotice: boolean = true): Promise<void> {
    // 过滤掉 label 为空的预设（可能是误添加后未填写）
    const cleanedPresets = this.presets.filter(p => p.label.trim());

    // 校验名称唯一性
    const seen = new Set<string>();
    for (const preset of cleanedPresets) {
      if (!preset.label.trim()) {
        new Notice(t('empty preset name'));
        return;
      }
      
      if (seen.has(preset.label)) {
        new Notice(t('duplicate preset name') + ': ' + preset.label);
        return;
      }
      
      seen.add(preset.label);
    }
    
    // 清空旧数据
    this.plugin.dataManager.getAllPresets().forEach(preset => 
      this.plugin.dataManager.deletePreset(preset.label)
    );
    
    // 保存新数据
    cleanedPresets.forEach(preset => {
      this.plugin.dataManager.upsertPreset(preset.label, preset.prompt);
    });
    
    // 持久化到存储
    const success = await this.plugin.storageManager.saveData(this.plugin.settings);
    if (success) {
      if (showNotice) new Notice(t('presets saved'));
      if (shouldClose) {
        // 避免 onClose 再次触发保存
        this.skipSaveOnClose = true;
        this.close();
      }
    } else {
      if (showNotice) new Notice(t('save presets failed'));
    }
  }
  
  /**
   * 禁用编辑区域
   */
  private disableEditor(): void {
    this.presetNameEl.value = '';
    this.presetContentEl.value = '';
    this.presetNameEl.disabled = true;
    this.presetContentEl.disabled = true;
    
    // 添加禁用样式
    this.presetEditorEl.classList.add('disabled');
  }
  
  /**
   * 启用编辑区域
   */
  private enableEditor(): void {
    this.presetNameEl.disabled = false;
    this.presetContentEl.disabled = false;
    
    // 移除禁用样式
    this.presetEditorEl.classList.remove('disabled');
  }

  onClose(): void {
    // 如果未被标记跳过，则自动保存当前预设列表
    if (!this.skipSaveOnClose) {
      // 异步保存但不弹提示
      this.savePresets(false /* shouldClose */, false /* showNotice */);
    }
    this.contentEl.empty();
  }
} 