import fs from 'fs';
import { OCRService } from '../services/ocr.service';

// Создаем единственный экземпляр OCRService
const ocrService = new OCRService();


/**
 * Обрабатывает один файл и извлекает из него текст
 */
export async function processFile(
  file: Express.Multer.File, 
  userId: string | number
): Promise<string> {
  try {
    // Читаем файл в буфер
    const fileBuffer = fs.readFileSync(file.path);
    
    // Используем OCRService для извлечения текста
    const extractedText = await ocrService.extractText(fileBuffer, userId);
    
    return extractedText;
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

/**
 * Обрабатывает массив файлов
 */
export async function processFiles(
  files: Express.Multer.File[], 
  userId: string | number
): Promise<string[]> {
  const extractedTexts: string[] = [];

  for (const file of files) {
    const text = await processFile(file, userId);
    extractedTexts.push(text);
  }

  return extractedTexts;
}

/**
 * Очистка ресурсов OCR сервиса
 */
export async function cleanupOCRService(): Promise<void> {
  await ocrService.cleanup();
}

