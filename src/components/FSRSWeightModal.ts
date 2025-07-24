import { Modal, Setting } from 'obsidian';
import BetterNotesPlugin from '../main';
import { DEFAULT_FSRS_PARAMETERS } from '../services/fsrs/FSRSTypes';
import { t } from '../i18n';
export class FSRSWeightModal extends Modal {
  private plugin: BetterNotesPlugin;
  private weights: number[];

  constructor(plugin: BetterNotesPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    // clone current weights or default
    const cur = plugin.settings.fsrsParams.w;
    this.weights = cur && cur.length === 17 ? [...cur] : [...DEFAULT_FSRS_PARAMETERS.w];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('div', { text: t('FSRS 17 weights adjustment') });
    contentEl.createEl('p', { text: t('each item corresponds to w0-w16 in the paper. click save to take effect immediately.') });

    // grid container
    const table = contentEl.createEl('table');
    table.style.width = '100%';
    table.style.borderSpacing = '8px 6px';

    const cols = 3;
    for (let i = 0; i < this.weights.length; i += cols) {
      const row = table.createEl('tr');
      for (let j = 0; j < cols; j++) {
        const idx = i + j;
        const cell = row.createEl('td');
        if (idx >= this.weights.length) continue;

        const label = cell.createEl('div', { text: `w${idx}` });
        label.style.marginBottom = '4px';

        const input = cell.createEl('input', { type: 'number', value: String(this.weights[idx]) }) as HTMLInputElement;
        input.style.width = '100%';
        input.addEventListener('change', () => {
          const num = parseFloat(input.value);
          if (!isNaN(num)) this.weights[idx] = num;
        });
      }
    }

    // buttons
    new Setting(contentEl)
      .addButton(b => b.setButtonText(t('reset default')).onClick(() => {
        this.weights = [...DEFAULT_FSRS_PARAMETERS.w];
        this.onOpen();
      }))
      .addButton(b => b.setButtonText(t('save')).setCta().onClick(() => {
        this.plugin.settings.fsrsParams.w = [...this.weights];
        this.plugin.fsrsService.setParameters({ w: this.weights });
        this.plugin.saveData(this.plugin.settings);
        this.close();
      }))
      .addButton(b => b.setButtonText(t('cancel')).onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
} 