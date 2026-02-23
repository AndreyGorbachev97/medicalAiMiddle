import OpenAI from 'openai';
import { IS_TEST_MODE, OPENAI_KEY } from '../config/env';

// ─────────────────────────────────────────────────────────
//  Типы
// ─────────────────────────────────────────────────────────

export type IndicatorStatus = 'OK' | 'BRD_LOW' | 'BRD_HIGH' | 'DEV_LOW' | 'DEV_HIGH';

export interface MedicalIndicator {
  name: string;
  value: string | null;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  status: IndicatorStatus;
  section: string;
}

export interface AttentionItem {
  name: string;
  status: 'DEV_LOW' | 'DEV_HIGH' | 'BRD_LOW' | 'BRD_HIGH';
  valueDisplay: string;
  meaning: string;
  causes: string[];
  recommendation: string;
}

export interface MedicalAnalysisResult {
  indicators: MedicalIndicator[];
  summary: {
    total: number;
    normal: number;
    borderline: number;
    deviation: number;
    text: string;
  };
  attention: AttentionItem[];
  correlations: string;
  recommendations: {
    urgent: string[];
    soon: string[];
    optional: string[];
  };
  specialists: string[];
  lifestyle: string;
  recheck: string;
  disclaimer: string;
}

// ─────────────────────────────────────────────────────────
//  Промты
// ─────────────────────────────────────────────────────────

/**
 * Промт для извлечения данных из изображений в структурированном JSON.
 * Используется в OCR-пайплайне как промежуточный шаг.
 */
const EXTRACTION_PROMPT = `Ты — медицинский ассистент. Извлеки ВСЕ данные из предоставленного изображения медицинских анализов.

ФОРМАТ ОТВЕТА — строго JSON, без markdown-обёртки, без пояснений:

{
  "patient": {
    "name": "ФИО",
    "birthDate": "дд.мм.гггг",
    "sex": "муж/жен",
    "sampleDate": "дд.мм.гггг чч:мм"
  },
  "indicators": [
    {
      "name": "Название показателя",
      "value": "значение (число или текст, как в документе)",
      "unit": "единица измерения",
      "refMin": "нижняя граница нормы (число или null)",
      "refMax": "верхняя граница нормы (число или null)",
      "section": "раздел исследования (напр. КЛИНИЧЕСКАЯ БИОХИМИЯ)"
    }
  ]
}

ПРАВИЛА:
- Извлеки КАЖДЫЙ показатель без исключения. Не пропускай ни одного.
- Если значение отсутствует (прочерк, "-"), укажи value: null.
- Числа записывай как числа, без пробелов: 3.44, а не "3,44" — используй точку.
- Если референсные значения указаны диапазоном (напр. "3,5-5,2"), разбей на refMin и refMax.
- Сохраняй оригинальные названия показателей.
- Не добавляй показатели, которых нет в документе.`;

/**
 * Основной аналитический промт.
 * Принимает текст или JSON с извлечёнными показателями.
 * Возвращает структурированный JSON согласно ANALYSIS_JSON_SCHEMA.
 *
 * Преимущества перед предыдущей версией:
 * - Нет эмодзи в промте (экономия входных токенов)
 * - Структура гарантирована Structured Outputs, а не инструкциями
 * - Добавлены разделы: specialists, lifestyle, recheck
 * - Таблица показателей с явным статусом для верификации OCR
 */
const MEDICAL_ANALYSIS_PROMPT = `Ты — опытный врач-диагност. Проанализируй данные медицинских анализов и верни результат строго в формате JSON согласно заданной схеме.

На входе могут быть: обычный текст, JSON с извлечёнными показателями, или их комбинация.

═══ СИСТЕМА ОЦЕНКИ ПОКАЗАТЕЛЕЙ ═══

Для каждого числового показателя вычисли его позицию в референсном диапазоне:
  позиция = (значение − refMin) / (refMax − refMin) × 100

Статусы:
  DEV_LOW  — значение НИЖЕ refMin (позиция < 0)
  DEV_HIGH — значение ВЫШЕ refMax (позиция > 100)
  BRD_LOW  — в норме, но в нижних 15% диапазона (позиция 0–15%)
  BRD_HIGH — в норме, но в верхних 15% диапазона (позиция 85–100%)
  OK       — уверенно в пределах нормы (позиция 15–85%)
  Нет границ нормы или качественный (текстовый) результат → OK.

═══ ПРАВИЛА ═══

- Внеси ВСЕ показатели из документа в indicators без исключения.
- В attention включай ТОЛЬКО показатели DEV_LOW / DEV_HIGH / BRD_LOW / BRD_HIGH.
- Показатели со статусом OK в attention НЕ включай.
- Числовые значения записывай через точку: 3.44, не 3,44.
- Используй ТОЛЬКО данные из предоставленных документов.
- Если предоставлены данные из нескольких документов — анализируй совместно.
- Если пользователь указал жалобы, возраст, препараты — учитывай в интерпретации.
- Диагностические предположения — конкретные: не "анемия", а "железодефицитная анемия".
- Язык: понятный пациенту, без потери медицинского смысла.

═══ ПОЛЯ ОТВЕТА ═══

indicators: Все показатели — name, value(строкой или null), unit, refMin, refMax, status, section.
summary: {total, normal, borderline, deviation, text(2–3 предл. об общей картине, сколько показателей в норме)}.
attention: Для каждого отклонения/пограничного — name, status, valueDisplay("X ед (норма: A–B)"), meaning(простым языком), causes(список конкретных причин), recommendation.
correlations: Как отклонения связаны. Единый патофизиологический механизм?
recommendations: {urgent(срочные), soon(в ближайшее время), optional(при возможности)} — конкретные действия, анализы.
specialists: Список специалистов для консультации.
lifestyle: Рекомендации по питанию, режиму, добавкам.
recheck: Когда повторно сдать анализы.
disclaimer: Всегда точно: "Данный анализ является предварительным и не заменяет консультацию квалифицированного врача. Все рекомендации носят информационный характер. При наличии отклонений обязательно проконсультируйтесь с врачом."`;

// ─────────────────────────────────────────────────────────
//  JSON Schema для Structured Outputs (гарантирует структуру)
// ─────────────────────────────────────────────────────────

const ANALYSIS_JSON_SCHEMA: { name: string; strict: boolean; schema: Record<string, unknown> } = {
  name: 'medical_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      indicators: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            unit: { type: 'string' },
            refMin: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            refMax: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            status: { type: 'string', enum: ['OK', 'BRD_LOW', 'BRD_HIGH', 'DEV_LOW', 'DEV_HIGH'] },
            section: { type: 'string' },
          },
          required: ['name', 'value', 'unit', 'refMin', 'refMax', 'status', 'section'],
          additionalProperties: false,
        },
      },
      summary: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          normal: { type: 'integer' },
          borderline: { type: 'integer' },
          deviation: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['total', 'normal', 'borderline', 'deviation', 'text'],
        additionalProperties: false,
      },
      attention: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: {
              type: 'string',
              enum: ['DEV_LOW', 'DEV_HIGH', 'BRD_LOW', 'BRD_HIGH'],
            },
            valueDisplay: { type: 'string' },
            meaning: { type: 'string' },
            causes: { type: 'array', items: { type: 'string' } },
            recommendation: { type: 'string' },
          },
          required: ['name', 'status', 'valueDisplay', 'meaning', 'causes', 'recommendation'],
          additionalProperties: false,
        },
      },
      correlations: { type: 'string' },
      recommendations: {
        type: 'object',
        properties: {
          urgent: { type: 'array', items: { type: 'string' } },
          soon: { type: 'array', items: { type: 'string' } },
          optional: { type: 'array', items: { type: 'string' } },
        },
        required: ['urgent', 'soon', 'optional'],
        additionalProperties: false,
      },
      specialists: { type: 'array', items: { type: 'string' } },
      lifestyle: { type: 'string' },
      recheck: { type: 'string' },
      disclaimer: { type: 'string' },
    },
    required: [
      'indicators',
      'summary',
      'attention',
      'correlations',
      'recommendations',
      'specialists',
      'lifestyle',
      'recheck',
      'disclaimer',
    ],
    additionalProperties: false,
  },
};

export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: OPENAI_KEY,
    });
  }

  // ═══════════════════════════════════════════════════════
  //  Основной метод: анализ текстовых данных анализов
  // ═══════════════════════════════════════════════════════

  /**
   * Анализирует текстовые данные медицинских анализов.
   * Возвращает структурированный объект MedicalAnalysisResult.
   *
   * @param text - Извлечённый текст или JSON из документов
   * @param userContext - Дополнительный контекст от пользователя (жалобы, возраст, препараты)
   * @param isTestMode - Использовать ли тестовый режим (gpt-4o-mini)
   */
  public async analyzeMedicalData(
    text: string,
    userContext?: string,
    isTestMode?: boolean,
  ): Promise<MedicalAnalysisResult> {
    try {
      const useTestMode = isTestMode !== undefined ? isTestMode : IS_TEST_MODE;

      let userMessage = `Данные анализов:\n\n${text}`;
      if (userContext) {
        userMessage += `\n\n📝 Дополнительная информация от пациента:\n${userContext}`;
      }

      console.log('useTestMode', useTestMode);
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: 'system', content: MEDICAL_ANALYSIS_PROMPT },
          { role: 'user', content: userMessage },
        ],
        model: useTestMode ? 'gpt-4o-mini' : 'gpt-4o',
        temperature: 0.15,
        max_tokens: useTestMode ? 4000 : 10000,
        response_format: {
          type: 'json_schema',
          json_schema: ANALYSIS_JSON_SCHEMA,
        },
      });

      const rawContent = completion.choices[0].message.content;
      if (!rawContent) {
        throw new Error('Empty response from OpenAI');
      }

      return JSON.parse(rawContent) as MedicalAnalysisResult;
    } catch (error) {
      console.error('Error analyzing medical data:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Извлечение текста из изображений (структурированное)
  // ═══════════════════════════════════════════════════════

  /**
   * Извлекает данные из изображения в структурированном JSON-формате.
   * Промежуточный шаг OCR-пайплайна — результат затем передаётся в analyzeMedicalData.
   *
   * @param base64Image - Base64-закодированное изображение
   * @returns JSON-строка с извлечёнными данными
   */
  public async extractTextFromImage(base64Image: string): Promise<string> {
    try {
      const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: EXTRACTION_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Извлеки все данные из этого медицинского документа в JSON-формате.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${cleanBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.05,
        response_format: { type: 'json_object' },
      });

      return completion.choices[0].message.content || '{"error": "Не удалось извлечь данные"}';
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Комбинированный анализ: изображение → анализ (1 запрос)
  // ═══════════════════════════════════════════════════════

  /**
   * Отправляет изображения напрямую в аналитическую модель, минуя шаг извлечения.
   * Объединяет OCR и анализ в один запрос.
   *
   * @param base64Images - Массив base64-изображений (до 3 штук)
   * @param userContext - Контекст от пользователя
   */
  public async analyzeImagesDirectly(
    base64Images: string[],
    userContext?: string,
  ): Promise<MedicalAnalysisResult> {
    try {
      const imageContents = base64Images.map((img) => {
        const cleanBase64 = img.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        return {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/jpeg;base64,${cleanBase64}`,
            detail: 'high' as const,
          },
        };
      });

      const textParts: Array<{ type: 'text'; text: string }> = [
        {
          type: 'text' as const,
          text: userContext
            ? `Проанализируй медицинские анализы на изображениях.\n\n📝 Дополнительная информация от пациента:\n${userContext}`
            : 'Проанализируй медицинские анализы на изображениях.',
        },
      ];

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: MEDICAL_ANALYSIS_PROMPT,
          },
          {
            role: 'user',
            content: [...textParts, ...imageContents],
          },
        ],
        max_tokens: 10000,
        temperature: 0.15,
        response_format: {
          type: 'json_schema',
          json_schema: ANALYSIS_JSON_SCHEMA,
        },
      });

      const rawContent = completion.choices[0].message.content;
      if (!rawContent) {
        throw new Error('Empty response from OpenAI');
      }

      return JSON.parse(rawContent) as MedicalAnalysisResult;
    } catch (error) {
      console.error('Error analyzing images directly:', error);
      throw error;
    }
  }
}
