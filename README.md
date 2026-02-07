# Medical AI Middleware

Backend сервис для обработки медицинского анализа с использованием Express.js, TypeScript, Docker и Supabase.

## Технологии

- **Express.js** - веб-фреймворк
- **TypeScript** - типизация
- **Nodemon** - hot reload для разработки
- **Docker** - контейнеризация
- **Supabase** - облачная база данных
- **Passport.js** - аутентификация
- **Multer** - загрузка файлов
- **JWT** - токены аутентификации
- **bcryptjs** - хеширование паролей
- **OpenAI GPT-4** - анализ медицинских документов и OCR
- **pdf-parse** - извлечение текста из PDF
- **pdf-poppler** - конвертация PDF в изображения
- **sharp** - обработка изображений

## Возможности

1. **API Analysis** (`/api/analysis`) - загрузка и обработка файлов для анализа
2. **Регистрация** (`/api/auth/register`) - регистрация через email/password
3. **Логин** (`/api/auth/login`) - аутентификация через email/password
4. **OAuth** - аутентификация через Google

## Установка

1. Клонируйте репозиторий
2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env` на основе `.env.example` и заполните необходимые переменные

4. Создайте таблицу `users` в Supabase:
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  password TEXT,
  name TEXT,
  auth_provider TEXT NOT NULL,
  external_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_external_id ON users(external_id, auth_provider);
```

## Запуск

### Режим разработки
```bash
npm run dev
```

### Production режим
```bash
npm run build
npm start
```

### Docker
```bash
docker-compose up --build
```

## API Endpoints

### Health Check
- `GET /health` - проверка работоспособности сервера

### Analysis
- `POST /api/analysis` - загрузка и анализ медицинских документов
  - Form data:
    - `file_0`, `file_1`, `file_2` (optional) - файлы (binary)
      - Поддерживаемые форматы:
        - PDF (машиночитаемые)
        - PDF (отсканированные документы)
        - Изображения (JPEG, PNG, WebP, etc.)
    - `description` (optional) - дополнительная информация от пациента
  
  **Как работает обработка:**
  1. Система автоматически определяет тип файла
  2. Для машиночитаемых PDF - извлекается текст напрямую
  3. Для отсканированных PDF - конвертируются в изображения, затем обрабатываются через OCR
  4. Для изображений - текст извлекается с помощью GPT-4 Vision (OCR)
  5. Извлеченный текст анализируется GPT-4 для медицинского заключения
  6. Возвращается структурированный анализ с рекомендациями

  **Ответ:**
  ```json
  {
    "success": true,
    "analysis": "Детальный медицинский анализ документов...",
    "metadata": {
      "filesProcessed": 2,
      "textSourcesExtracted": 2,
      "imagesProcessed": 1
    }
  }
  ```

### Authentication

#### Регистрация
- `POST /api/auth/register`
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

#### Логин
- `POST /api/auth/login`
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### OAuth
- `GET /api/auth/google` - Google OAuth

## Переменные окружения

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# OpenAI Configuration
OPENAI_KEY=your-openai-api-key

# JWT Configuration
JWT_SECRET=your-secret-key-here

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

## Структура проекта

```
medicalAiMiddle/
├── src/
│   ├── config/
│   │   ├── auth.ts       # Passport конфигурация
│   │   └── database.ts   # Supabase клиент
│   ├── middleware/
│   │   ├── auth.ts       # JWT middleware
│   │   └── upload.ts     # Multer конфигурация
│   ├── routes/
│   │   ├── auth.ts       # Аутентификация
│   │   └── analysis.ts   # Анализ файлов
│   ├── utils/
│   │   ├── fileProcessor.ts  # Обработка файлов (PDF, изображения)
│   │   └── openai.ts         # Интеграция с OpenAI API
│   ├── types/
│   │   ├── index.ts          # TypeScript типы
│   │   └── pdf-poppler.d.ts  # Декларации типов для pdf-poppler
│   └── index.ts          # Главный файл
├── dist/                 # Скомпилированный JS
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Требования

- Node.js >= 18
- npm или yarn
- Poppler (для конвертации PDF в изображения)
  - macOS: `brew install poppler`
  - Ubuntu/Debian: `sudo apt-get install poppler-utils`
  - Windows: скачайте с [poppler для Windows](https://github.com/oschwartz10612/poppler-windows/releases/)
- OpenAI API ключ с доступом к GPT-4

