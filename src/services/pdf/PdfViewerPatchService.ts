import { around } from 'monkey-around';
import { TFile, WorkspaceLeaf } from 'obsidian';
import BetterNotesPlugin from '../../main';
import { RectHighlightManager } from './RectHighlightManager';
import { Entry } from '../../models/Entry';
import { hexToRgba } from '../../utils/utils';
import { PdfSelectionService, TextSelectionRange } from './PdfSelectionService';
/**
 * PdfViewerPatchService
 * --------------------------------------------------
 * 使用 monkey-around 对 pdf.js Viewer 的 `loadFile` 方法进行一次性补丁，
 * 仅在调用成功后输出调试信息到控制台。
 *
 * 设计：
 * 1. 当工作区出现第一个 PDF Leaf 时，获取其 `view.viewer` 对象；
 * 2. 若原型未被打补丁，则通过 `around` 包装 `loadFile`；
 * 3. 使用插件的 `register` 机制确保卸载时自动恢复。
 */
export class PdfViewerPatchService {
  private patched = false;
  private applySubpathPatched = false;

  constructor(private readonly plugin: BetterNotesPlugin) {
    // 当有文件被打开（可能创建新的 PDF 视图）时尝试补丁
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', () => {
        if (!this.patched) {
          this.patchAllPdfLeaves();
        }
      })
    );
  }

  /**
   * 已补丁的原型集合，避免重复补丁
   */

  /**
   * 若给定 leaf 是 PDF 视图且其 viewer.prototype 未被补丁，则执行补丁。
   */
  private tryPatchPdfViewer(leaf: WorkspaceLeaf) {
    // @ts-ignore Obsidian 私有属性
    const viewer = (leaf)?.view?.viewer;
    const proto = viewer.constructor?.prototype as any;
    const pluginRef = this.plugin;
    // 使用 monkey-around 包装pdf.js的loadFile（对象写法）
    const unpatch = around(proto, {
      loadFile(old: any) {
        if (typeof old !== 'function') return old;
        return async function (this: any, file: TFile, subpath?: string) {
          const ret = await (old as Function).call(this, file, subpath);

          pluginRef.pdfViewerPatchService.injectHighlights(this, file);
          return ret;
        };
      },
    });
    //console.log("loadFile patched");
    // 第一次打开PDF文件只会patch不会执行高亮, 所以需要立刻手动绘制高亮
    const initFile: TFile | undefined = (leaf as any).view?.file;
    if (initFile) this.injectHighlights(viewer, initFile);

    // 为 child 添加 applySubpath 补丁，以支持 rect 参数定位
    this.patchPdfViewerChildApplySubpath(viewer);


    this.patched = true;
    this.plugin.register(unpatch);
  }

  /**
   * 为 PDF.js 的 ViewerChild 添加 applySubpath 补丁，支持 rect 参数
   * 当链接包含 rect=x,y,w,h 参数时，将使用 FitR 目标类型进行精确定位
   * @param viewer PDF Viewer 对象
   */
  private patchPdfViewerChildApplySubpath(viewer: any) {
    if (this.applySubpathPatched) return;

    viewer.then?.((child: any) => {
      if (!child || typeof child.applySubpath !== 'function') return;

      const childProto = Object.getPrototypeOf(child);
      if (!childProto) return;

      const pluginRef = this.plugin;
      const unpatch = around(childProto, {
        applySubpath(old: any) {
          if (typeof old !== 'function') return old;

          return function (this: any, subpath?: string) {
            //console.log('BetterNotes: applySubpath called with', subpath);

            try {
              //console.log('BetterNotes: applySubpath called with', subpath);
              // 解析子路径参数
              const params = new URLSearchParams(subpath?.startsWith('#') ? subpath.slice(1) : subpath);

              // ----- FitR 矩形或文本选区定位 -----
              if (params.has('page') && (params.has('rect') || params.has('selection'))) {
                const page = parseInt(params.get('page') || '1', 10);

                // ------ 1) rect 参数：直接使用坐标 ------
                if (params.has('rect')) {
                  const rect = (params.get('rect') || '')
                    .split(',')
                    .map((n) => parseFloat(n));
                  const hash = params.get('hash');

                  if (rect.length === 4 && rect.every((n) => !isNaN(n))) {
                    const dest = [page - 1, { name: 'FitR' }, ...rect];
                    const pdfViewer = this.pdfViewer?.pdfViewer;
                    if (pdfViewer?.pdfDocument) {
                      const performScroll = () => {
                        try {
                          pdfViewer.scrollPageIntoView({
                            pageNumber: page,
                            destArray: dest,
                            ignoreDestinationZoom: false,
                          });
                          if (hash && typeof pluginRef.entryNavigation?.highlightPdfRect === 'function') {
                            setTimeout(() => {
                              pluginRef.entryNavigation.highlightPdfRect(hash.replace(/^'|'$/g, ''));
                            }, 200);
                          }
                        } catch (err) {
                          console.error('BetterNotes: scrollPageIntoView error', err);
                        }
                      };

                      if (pdfViewer._pages?.length) {
                        performScroll();
                      } else {
                        const onPagesInit = () => {
                          pdfViewer.eventBus.off('pagesloaded', onPagesInit);
                          setTimeout(performScroll, 0);
                        };
                        pdfViewer.eventBus.on('pagesloaded', onPagesInit);
                      }
                    }
                  }
                }
                // ------ 2) selection 参数：文本层索引 → 坐标 待修复！------
                else if (params.has('selection')) {
                  const selStr = params.get('selection') || '';
                  const selArr = selStr.split(',').map((n) => parseInt(n, 10));
                  const hash = params.get('hash');

                  if (selArr.length === 4 && selArr.every((n) => !isNaN(n))) {
                    const [beginIndex, beginOffset, endIndex, endOffset] = selArr;
                    // 1. 先滚动到目标页顶部，确保 PageView 实例化
                    const pdfViewer = this.pdfViewer?.pdfViewer;
                    if (pdfViewer?.pdfDocument) {
                      const scrollToPage = () => {
                        try {
                          pdfViewer.scrollPageIntoView({
                            pageNumber: page - 1,
                            destArray: [page - 1, { name: 'FitH' }, 0],
                            ignoreDestinationZoom: false,
                          });
                        } catch (err) {
                          console.error('BetterNotes: selection page scroll error', err);
                        }
                      };
                      if (pdfViewer._pages?.length) {
                        scrollToPage();
                      } else {
                        const onPagesLoaded = () => {
                          pdfViewer.eventBus.off('textlayerrendered', onPagesLoaded);
                          setTimeout(scrollToPage, 0);
                        };
                        pdfViewer.eventBus.on('textlayerrendered', onPagesLoaded);
                      }

                      // 2. 滚动后高亮 selection 矩形（支持跨行）
                      if (hash && typeof pluginRef.entryNavigation?.highlightPdfRect === 'function') {
                        setTimeout(() => {
                          pluginRef.entryNavigation.highlightPdfRect(hash.replace(/^'|'$/g, ''));
                        }, 200);
                      }
                    }
                  }
                }

                // 处理完毕后 return
                return;
              }
              // ----- 内嵌注释定位 -----
              else if (params.has('page') && params.has('annotation')) {

                const page = parseInt(params.get('page') || '1', 10);
                const annotationId = params.get('annotation');

                //console.log('BetterNotes: Parsed annotation parameters', { page, annotationId });

                // 创建一个基本的定位数组，默认使用 XYZ 类型
                // [pageIndex, {name: 'XYZ'}, left, top, zoom]，null 表示保持当前值不变
                const dest = [page - 1, { name: 'FitH' }, 0];
                //console.log('BetterNotes: Created XYZ destination for annotation', dest);

                // 确保 PDF 已加载
                const pdfViewer = this.pdfViewer?.pdfViewer;
                if (pdfViewer?.pdfDocument) {
                  const performScroll = () => {
                    try {
                      //console.log('BetterNotes: Performing scrollPageIntoView to annotation page');
                      pdfViewer.scrollPageIntoView({
                        pageNumber: page,
                        destArray: dest,
                        ignoreDestinationZoom: false
                      });

                      // 先跳转到页面，然后等待注释层渲染完成后再高亮注释
                      const highlightAnnotationWhenReady = () => {
                        // 获取目标页面视图
                        const pageView = pdfViewer.getPageView(page - 1);

                        if (pageView?.annotationLayer?.div) {
                          // 注释层已渲染，可以执行高亮
                          setTimeout(() => this.highlightAnnotation(page, annotationId), 100);
                        } else {
                          // 注册事件监听，等待注释层渲染完成
                          const onAnnotLayerRendered = (data: any) => {
                            if (data.pageNumber === page) {
                              pdfViewer.eventBus.off('annotationlayerrendered', onAnnotLayerRendered);
                              setTimeout(() => this.clearAnnotationHighlight(), 0);
                              setTimeout(() => this.highlightAnnotation(page, annotationId), 100);

                            }
                          };

                          pdfViewer.eventBus.on('annotationlayerrendered', onAnnotLayerRendered);
                        }
                      };

                      // 页面已跳转，尝试高亮注释
                      highlightAnnotationWhenReady();
                    } catch (err) {
                      console.error('BetterNotes: scrollPageIntoView error', err);
                    }
                  };

                  // 若页面尚未初始化，等待 pagesloaded 事件后再滚动
                  if (pdfViewer._pages?.length) {
                    performScroll();
                  } else {
                    const onPagesInit = () => {
                      pdfViewer.eventBus.off('pagesloaded', onPagesInit);
                      setTimeout(performScroll, 0); // 确保渲染完成后再滚动
                    };
                    pdfViewer.eventBus.on('pagesloaded', onPagesInit);
                  }

                  // 存储高亮信息，以便后续处理
                  this.annotationHighlightInfo = {
                    page,
                    annotationId
                  };
                }
                else {
                  //console.log('BetterNotes: PDF document not loaded yet');
                }


              }
              else {
                return old.call(this, subpath);
              }
            } catch (error) {
              console.error('BetterNotes: PDF applySubpath patch error', error);
              // 出错时回退到原始方法
              return old.call(this, subpath);
            }



          };
        }
      });

      //console.log("applySubpath patched");
      this.applySubpathPatched = true;
      this.plugin.register(unpatch);
    });
  }

  /** 遍历全部 leaf，找出 pdf 视图进行补丁 */
  private patchAllPdfLeaves() {
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType && leaf.view.getViewType() === 'pdf') {
        this.tryPatchPdfViewer(leaf);
      }
    });
  }

  private injectHighlights(viewer: any, file: TFile) {
    const pluginRef = this.plugin;
    viewer.then?.((child: any) => {
      try {
        const pdfViewer = child.pdfViewer?.pdfViewer;
        if (!pdfViewer) return;

        const mgr = pluginRef.rectHighlightManager;
        mgr.setActiveFilePath(file.path);
        // 仅将 viewer 附着到全局管理器，矩形数据已在插件 onload 阶段加载
        mgr.attachViewer(file.path, pdfViewer);

        // ------------- 处理 selection = 文本索引 的高亮 -------------
        const selectionEntries = pluginRef.dataManager
          .getAllEntries()
          .filter(
            (e: Entry) =>
              e.type === 'pdf' &&
              typeof e.index === 'string' &&
              e.index.includes('selection=') &&
              e.sourceFile === file.path
          );

        if (selectionEntries.length) {
          const processed = new Set<string>();

          pdfViewer.eventBus.on('textlayerrendered', (ev: any) => {
            const pageNumber = ev.pageNumber;
            const pageView = pdfViewer.getPageView(pageNumber - 1);
            if (!pageView) return;

            const pss = new PdfSelectionService();

            selectionEntries.forEach((entry) => {
              if (processed.has(entry.hash)) return;
              const m = entry.index.match(/page=(\d+)&selection=([\d,]+)/);
              if (!m) return;
              const page = Number(m[1]);
              if (page !== pageNumber) return;
              const parts = m[2].split(',').map((n) => parseInt(n, 10));
              if (parts.length !== 4 || parts.some((n) => isNaN(n))) return;
              const [beginIndex, beginOffset, endIndex, endOffset] = parts;
              const selRange: TextSelectionRange = {
                beginIndex,
                beginOffset,
                endIndex,
                endOffset,
              };

              // 计算所有 selection 区间的 rects，若缓存命中则直接使用缓存
              // ---------- 新增缓存逻辑 ----------
              let rects: number[][] | undefined = mgr.getRects(file.path, page, entry.hash);

              if (!rects || rects.length === 0) {
                // 缓存未命中 → 计算 rects 并写入缓存（addRect 内部会缓存）
                rects = pss.computeRectsForSelection(pageView.div, selRange, pageView);
                if (!rects.length) return;
                // 选择填充颜色：取集合颜色，若无则默认黄色半透明
                const opacity = pluginRef.settings?.highlightOpacity ?? 0.7;
                let fillColor: string | undefined;
                const collection = pluginRef.dataManager?.getCollection?.(entry.set);
                if (collection?.color) {
                  fillColor = hexToRgba(collection.color, opacity);
                } else {
                  fillColor = hexToRgba('#FFFF00', opacity);
                }
                rects.forEach((rect) => {
                  mgr.addRect(file.path, page, rect as [number, number, number, number], entry.hash, pageView, fillColor);
                });
              } else {
                mgr.renderPage(file.path, page, pageView);
              }
              processed.add(entry.hash);
            });
          });
        }
      } catch (err) {
        console.error('PdfViewerPatchService highlight error', err);
      }
    });
  }

} 