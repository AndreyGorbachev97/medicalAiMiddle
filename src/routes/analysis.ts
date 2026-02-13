import express from 'express';
import fs from 'fs';
import { upload } from '../middleware/upload';
import { authenticateInternal } from '../middleware/internalAuth';
import { processFiles } from '../utils/fileProcessor';
import { OpenAIService } from '../services/openai.service';
import { getSupabaseClient } from '../config/database';

const router = express.Router();
const openaiService = new OpenAIService();

// Обработка загрузки файлов для анализа
router.post('/analysis', authenticateInternal, upload.fields([{ name: 'file_0' }, { name: 'file_1' }, { name: 'file_2' }]), async (req, res) => {
  const uploadedFiles: string[] = [];
  const startTime = Date.now();

  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const { description } = req.body;
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    // Проверяем кредиты перед обработкой
    const supabase = getSupabaseClient();
    const { data: user } = await supabase
      .from('users')
      .select('analysis_credits')
      .eq('id', userId)
      .single();

    if (!user || user.analysis_credits <= 0) {
      return res.status(402).json({
        error: 'Insufficient credits',
        message: 'У вас недостаточно кредитов для анализа. Пожалуйста, пополните баланс.',
        credits: user?.analysis_credits || 0,
      });
    }

    // Собираем все файлы в один массив
    const allFiles: Express.Multer.File[] = [];
    Object.values(files).forEach(fileArray => {
      allFiles.push(...fileArray);
      fileArray.forEach(file => uploadedFiles.push(file.path));
    });

    console.log(`Processing ${allFiles.length} file(s) for user ${userId}...`);

    // Шаг 1: Обрабатываем все файлы и извлекаем текст
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

    // Шаг 4: Списываем 1 кредит
    await supabase.rpc('increment_credits', {
      p_user_id: userId,
      p_amount: -1,
    });

    // Шаг 5: Записываем статистику
    const processingTime = Date.now() - startTime;
    await supabase.from('analysis_stats').insert({
      user_id: userId,
      files_count: allFiles.length,
      document_types: [],
      text_length: combinedText.length,
      processing_time_ms: processingTime,
      status: 'completed',
    });

    // Шаг 6: Очищаем загруженные файлы
    uploadedFiles.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    });

    // Шаг 7: Получаем обновлённый баланс
    const { data: updatedUser } = await supabase
      .from('users')
      .select('analysis_credits')
      .eq('id', userId)
      .single();

    // Шаг 8: Возвращаем результат анализа
    return res.json({
      success: true,
      analysis,
      metadata: {
        filesProcessed: allFiles.length,
        textSourcesExtracted: extractedTexts.length,
      },
      credits: updatedUser?.analysis_credits ?? 0,
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
