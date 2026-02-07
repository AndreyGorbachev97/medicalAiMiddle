import express from 'express';
import fs from 'fs';
import { upload } from '../middleware/upload';
import { AnalysisRequest } from '../types';
import { processFiles } from '../utils/fileProcessor';
import { OpenAIService } from '../services/openai.service';

const router = express.Router();
const openaiService = new OpenAIService();

// Обработка загрузки файлов для анализа
router.post('/analysis', upload.fields([{ name: 'file_0' }, { name: 'file_1' }, { name: 'file_2' }]), async (req: AnalysisRequest, res) => {
  const uploadedFiles: string[] = [];
  
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const { description } = req.body;

    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    // Собираем все файлы в один массив
    const allFiles: Express.Multer.File[] = [];
    Object.values(files).forEach(fileArray => {
      allFiles.push(...fileArray);
      fileArray.forEach(file => uploadedFiles.push(file.path));
    });

    console.log(`Processing ${allFiles.length} file(s)...`);

    // TODO: Получить userId из аутентификации (req.user.id)
    // Пока используем дефолтное значение
    const userId = 1;

    // Шаг 1: Обрабатываем все файлы и извлекаем текст
    // OCRService автоматически определяет тип файла и извлекает текст
    const extractedTexts = await processFiles(allFiles, userId);
    console.log(`Extracted ${extractedTexts.length} text(s)`);

    // Проверяем, что мы получили хоть какой-то текст
    if (extractedTexts.length === 0 || extractedTexts.every(text => !text.trim())) {
      return res.status(400).json({ 
        error: 'No text could be extracted from the provided files' 
      });
    }

    // Шаг 2: Объединяем весь извлеченный текст
    let combinedText = extractedTexts.join('\n\n---\n\n');
    
    // Добавляем описание пользователя, если есть
    if (description) {
      combinedText = `Дополнительная информация от пациента: ${description}\n\n---\n\n${combinedText}`;
    }
    
    console.log(`Combined text length: ${combinedText.length} characters`);

    // Шаг 3: Отправляем на анализ в OpenAI
    console.log('Sending to OpenAI for medical analysis...');
    const analysis = await openaiService.analyzeMedicalData(combinedText);

    // Шаг 4: Очищаем загруженные файлы
    uploadedFiles.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    });

    // Шаг 5: Возвращаем результат анализа
    return res.json({
      success: true,
      analysis,
      metadata: {
        filesProcessed: allFiles.length,
        textSourcesExtracted: extractedTexts.length,
      },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Очищаем файлы в случае ошибки
    uploadedFiles.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    });

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ 
      success: false,
      error: errorMessage 
    });
  }
});

export default router;

