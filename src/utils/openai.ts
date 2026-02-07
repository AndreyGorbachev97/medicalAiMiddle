import OpenAI from 'openai';

let openai: OpenAI | null = null;

/**
 * Получает или создает экземпляр OpenAI клиента
 */
function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_KEY) {
      throw new Error('OPENAI_KEY is not set in environment variables');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY,
    });
  }
  return openai;
}

/**
 * Извлекает текст из изображений с помощью GPT-4 Vision
 */
export async function extractTextFromImages(images: string[]): Promise<string> {
  const client = getOpenAIClient();
  try {
    const imageMessages = images.map(base64Image => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:image/png;base64,${base64Image}`,
        detail: 'high' as const,
      },
    }));

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Пожалуйста, извлеките весь текст из этих изображений. Сохраните структуру и форматирование. Если это медицинские документы, будьте особенно внимательны к цифрам, датам и медицинским терминам.',
            },
            ...imageMessages,
          ],
        },
      ],
      max_tokens: 4000,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Error extracting text from images with OpenAI:', error);
    throw new Error('Failed to extract text from images');
  }
}

/**
 * Отправляет текст на анализ в OpenAI
 */
export async function analyzeWithOpenAI(
  extractedText: string,
  userDescription?: string
): Promise<string> {
  const client = getOpenAIClient();
  
  try {
    const systemPrompt = `Вы - медицинский ассистент, специализирующийся на анализе медицинских документов. 
Ваша задача - проанализировать предоставленные медицинские документы и дать подробное, структурированное резюме.

При анализе обращайте внимание на:
1. Диагнозы и заключения
2. Результаты анализов и исследований
3. Назначенное лечение и рекомендации
4. Важные даты и временные рамки
5. Критические показатели здоровья

Предоставьте ваш анализ в следующей структуре:
- Краткое резюме
- Основные выводы
- Рекомендации (если применимо)
- Важные замечания

Будьте точны, профессиональны и используйте медицинскую терминологию, но объясняйте сложные термины простым языком.`;

    let userPrompt = `Пожалуйста, проанализируйте следующие медицинские документы:\n\n${extractedText}`;
    
    if (userDescription) {
      userPrompt += `\n\nДополнительная информация от пациента: ${userDescription}`;
    }

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Error analyzing with OpenAI:', error);
    if (error instanceof Error) {
      throw new Error(`OpenAI analysis failed: ${error.message}`);
    }
    throw new Error('OpenAI analysis failed');
  }
}

