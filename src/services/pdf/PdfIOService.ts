import { App, TFile } from 'obsidian';
import { PDFDocument, PDFHexString, PDFString, PDFRef, PDFName } from 'pdf-lib';
import { mergeRects } from '../../utils/pdfUtils';
import { capturePdfViewerState, restorePdfViewerState, PdfViewerState } from '../../utils/pdfViewState';
/**
 * 负责在 PDF 文件中写入 Highlight 注释。
 * 依赖 Obsidian 的文件系统与 pdf-lib，将纯粹的几何计算交由 pdfUtils 处理。
 */
export class PdfIOService {
  constructor(private readonly app: App) {}

  /**
   * 在指定 PDF 页面写入 Highlight 注释。
   * @param file PDF 文件 (TFile)
   * @param pageNumber 从 1 开始的页码
   * @param rects 选区矩形数组 `[l,b,r,t]`
   * @param quadPoints PDF QuadPoints (rectsToQuadPoints 生成)
   * @param child 当前 PDF 视图的 child（用于恢复滚动位置，可为空）
   * @param viewerState 在重新载入文件后需恢复的视图状态
   * @param color 颜色字符串（如 #ffcc00）
   * @param opacity 透明度（0-1）
   */
  public async writeHighlightAnnotation(
    file: TFile,
    pageNumber: number,
    rects: number[][],
    quadPoints: number[],
    color: string = '#ffff00',
    opacity: number = 0.7,
    child?: any
  ): Promise<number | null> {
    try {
      const pdfBytes = await this.app.vault.readBinary(file);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(pageNumber - 1);

      const ctx = page.doc.context;
      // 颜色转换: #rrggbb => [r,g,b] (0-1)
      let rgb: [number, number, number] = [1, 1, 0];
      if (/^#([0-9a-fA-F]{6})$/.test(color)) {
        rgb = [
          parseInt(color.slice(1, 3), 16) / 255,
          parseInt(color.slice(3, 5), 16) / 255,
          parseInt(color.slice(5, 7), 16) / 255
        ];
      }
      const annotRef = ctx.register(
        ctx.obj({
          Type: 'Annot',
          Subtype: 'Highlight',
          Rect: mergeRects(rects),
          QuadPoints: quadPoints,
          C: rgb,
          CA: opacity,
          Contents: PDFHexString.fromText(''),
          T: PDFHexString.fromText('Obsidian'),
          M: PDFString.fromDate(new Date()),
          Border: [0, 0, 0]
        })
      );
      page.node.addAnnot(annotRef);

      // 保存当前视图状态
      const viewerState = child ? capturePdfViewerState(child) : undefined;

      await this.app.vault.modifyBinary(file, await pdfDoc.save());

      // 恢复视图状态
      if (child && viewerState) {
        restorePdfViewerState(child, viewerState);
      }

      //console.log('Annotation written', `${annotRef.objectNumber}R`);
      return annotRef.objectNumber;
    } catch (e) {
      console.error('Failed to write annotation', e);
      return null;
    }
  }

  /**
   * 删除指定页面上 objectNumber 的高亮注释。
   */
  public async deleteHighlightAnnotation(file: TFile, pageNumber: number, objectNumber: number, child?: any): Promise<void> {
    try {
      const pdfBytes = await this.app.vault.readBinary(file);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(pageNumber - 1);

      const annots = page.node.Annots?.();
      if (annots) {
        const arr = annots.asArray();
        for (const ref of arr) {
          if (ref instanceof PDFRef && (ref as any).objectNumber === objectNumber) {
            page.node.removeAnnot(ref);
            break;
          }
        }
      }
      
      // 保存当前视图状态
      const viewerState = child ? capturePdfViewerState(child) : undefined;

      await this.app.vault.modifyBinary(file, await pdfDoc.save());

      // 恢复视图状态
      if (child && viewerState) {
        restorePdfViewerState(child, viewerState);
      }
      
      //console.log('Annotation deleted', `${objectNumber}R`);
    } catch (e) {
      console.error('Failed to delete annotation', e);
    }
  }

  /**
   * 批量删除同一PDF文件中的多个注释
   * @param file PDF文件
   * @param annotationsToDelete 要删除的注释数组，每项包含页码和对象编号
   * @param child PDF视图child对象，用于保存和恢复视图状态
   */
  public async batchDeleteAnnotations(
    file: TFile, 
    annotationsToDelete: Array<{pageNumber: number, objectNumber: number}>,
    child?: any
  ): Promise<void> {
    if (annotationsToDelete.length === 0) return;

    try {
      const pdfBytes = await this.app.vault.readBinary(file);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // 保存页面到删除注释的映射
      const pageAnnotMap = new Map<number, number[]>();
      
      // 收集每个页面要删除的注释对象编号
      for (const anno of annotationsToDelete) {
        if (!pageAnnotMap.has(anno.pageNumber)) {
          pageAnnotMap.set(anno.pageNumber, []);
        }
        pageAnnotMap.get(anno.pageNumber)?.push(anno.objectNumber);
      }
      
      // 遍历每个页面，删除注释
      for (const [pageNumber, objectNumbers] of pageAnnotMap.entries()) {
        const page = pdfDoc.getPage(pageNumber - 1);
        const annots = page.node.Annots?.();
        
        if (annots) {
          const arr = annots.asArray();
          const toRemove: PDFRef[] = [];
          
          // 收集要删除的引用
          for (const ref of arr) {
            if (ref instanceof PDFRef && objectNumbers.includes((ref as any).objectNumber)) {
              toRemove.push(ref);
            }
          }
          
          // 删除收集到的引用
          for (const ref of toRemove) {
            page.node.removeAnnot(ref);
          }
          
          //console.log(`Deleted ${toRemove.length} annotations on page ${pageNumber}`);
        }
      }
      
      // 保存当前视图状态
      const viewerState = child ? capturePdfViewerState(child) : undefined;

      // 一次性保存修改后的PDF
      await this.app.vault.modifyBinary(file, await pdfDoc.save());

      // 恢复视图状态
      if (child && viewerState) {
        restorePdfViewerState(child, viewerState);
      }
      
      //console.log(`Batch deleted ${annotationsToDelete.length} annotations from ${file.path}`);
    } catch (e) {
      console.error('Failed to batch delete annotations', e);
    }
  }

  /**
   * 更新pdf条目的comment字段
   */
  public async updateHighlightAnnotationContent(
    file: TFile,
    pageNumber: number,
    objectNumber: number,
    comment: string,
    child?: any
  ): Promise<void> {
    try {
      const pdfBytes = await this.app.vault.readBinary(file);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPage(pageNumber - 1);

      const annots = page.node.Annots?.();
      if (annots) {
        const arr = annots.asArray();
        for (const ref of arr) {
          if (ref instanceof PDFRef && (ref as any).objectNumber === objectNumber) {
            const annot: any = pdfDoc.context.lookup(ref);
            annot.set(PDFName.of('Contents'), PDFHexString.fromText(comment));
            break;
          }
        }
      }

      // 保存当前视图状态
      const viewerState = child ? capturePdfViewerState(child) : undefined;

      await this.app.vault.modifyBinary(file, await pdfDoc.save());
      
      // 恢复视图状态
      if (child && viewerState) {
        restorePdfViewerState(child, viewerState);
      }
      
      //console.log('Annotation content updated', `${objectNumber}R`);
    } catch (e) {
      console.error('Failed to update annotation content', e);
    }
  }
} 