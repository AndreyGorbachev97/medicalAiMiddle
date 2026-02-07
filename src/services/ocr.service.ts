import { createWorker } from 'tesseract.js';
import { fromPath } from 'pdf2pic';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';
import { isReadable } from '../utils/isReadeble.utils';
// import { supabaseService } from '../config/bot.config';
import { OpenAIService } from '../services/openai.service';

interface Pdf2PicOutput {
  path: string;
  name: string;
  size: string | undefined;
  page: number;
}

export class OCRService {
  private worker: any;
  private initializationPromise: Promise<void>;
  private openaiService: OpenAIService;
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB в байтах

  constructor() {
    this.initializationPromise = this.initializeWorker();
    this.openaiService = new OpenAIService();
  }

  private async initializeWorker() {
    try {
      this.worker = await createWorker('rus', 1, {
        logger: (m: any) => console.log(m),
        errorHandler: (err: any) => console.error(err),
      });

      // Устанавливаем таймаут через глобальный объект
      (global as any).TESSERACT_TIMEOUT = 180000;

      // Устанавливаем параметры после инициализации
      await this.worker.setParameters({
        tessedit_char_whitelist:
          '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя.,:;!?()[]{}<>/\\|-_=+*&^%$#@ ',
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
    } catch (error) {
      console.error('Error initializing Tesseract worker:', error);
      throw new Error('Failed to initialize OCR service. Please try again later.');
    }
  }

  public async extractText(fileBuffer: Buffer, _userId: number): Promise<string> {
    try {
      // Проверяем размер файла
      if (fileBuffer.length > this.MAX_FILE_SIZE) {
        throw new Error(
          `Размер файла превышает максимально допустимый размер ${this.MAX_FILE_SIZE / (1024 * 1024)}МБ`,
        );
      }

      // Дожидаемся инициализации воркера
      await this.initializationPromise;

      if (this.isPDF(fileBuffer)) {
        const checkMachinTextPdf = await pdfParse(fileBuffer);

        if (isReadable(checkMachinTextPdf.text)) {
          console.log('PDF содержит машиночитаемый текст ✅');
          // Сохраняем в базу анализ машиночитаемого PDF
          // await supabaseService.createAnalysisLog({
          //   userId,
          //   type: 'DOCUMENT',
          // });
          return checkMachinTextPdf.text;
        }

        console.log('PDF, вероятно, является сканом (нет извлекаемого текста) 🖼️');
        // Сохраняем в базу анализ скана PDF
        // await supabaseService.createAnalysisLog({
        //   userId,
        //   type: 'DOCUMENT_SCAN',
        // });
        return await this.extractTextFromPDF(fileBuffer);
      } else {
        console.log('Фото');
        // Сохраняем в базу анализ фото
        // await supabaseService.createAnalysisLog({
        //   userId,
        //   type: 'PHOTO',
        // });
        const analysis = await this.openaiService.extractTextFromImage(
          fileBuffer.toString('base64'),
        );
        return analysis;
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      throw error;
    }
  }

  private isPDF(buffer: Buffer): boolean {
    return buffer.slice(0, 4).toString() === '%PDF';
  }

  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    return sharp(imageBuffer)
      .greyscale() // Конвертируем в оттенки серого
      .normalize() // Нормализуем контраст
      .sharpen() // Увеличиваем резкость
      .threshold(128) // Бинаризация
      .toBuffer();
  }

  private async extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
    try {
      const tempDir = os.tmpdir();
      const pdfPath = path.join(tempDir, `temp_${Date.now()}.pdf`);
      await fs.promises.writeFile(pdfPath, pdfBuffer);

      const options = {
        density: 300, // DPI для конвертации
        saveFilename: 'temp',
        savePath: tempDir,
        format: 'png',
        width: 1654, // A4 при 300 DPI
        height: 2339, // A4 при 300 DPI
        preserveAspectRatio: true,
        quality: 100,
      };

      const convert = fromPath(pdfPath, options);
      const images = (await convert.bulk(-1)) as unknown as Pdf2PicOutput[];

      let fullText = '';
      for (const image of images) {
        const imageBuffer = await fs.promises.readFile(image.path);
        const processedImage = await this.preprocessImage(imageBuffer);
        const text = await this.openaiService.extractTextFromImage(
          processedImage.toString('base64'),
        );
        fullText += text + '\n\n';

        await fs.promises.unlink(image.path);
      }

      await fs.promises.unlink(pdfPath);
      return fullText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw error;
    }
  }

  public async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
    }
  }
}
