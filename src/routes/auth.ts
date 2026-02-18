import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getSupabaseClient } from '../config/database';
import { RegisterRequest, LoginRequest } from '../types';
import { generateVerificationCode, sendVerificationCode } from '../services/email.service';

const router = express.Router();

// Регистрация через email/password
router.post('/register', async (req: RegisterRequest, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const supabase = getSupabaseClient();

    // Проверяем, существует ли пользователь
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Генерируем код подтверждения
    const verificationCode = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

    // Создаем пользователя
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password: hashedPassword,
        name: name || null,
        auth_provider: 'email',
        email_verified: false,
        verification_code: verificationCode,
        verification_code_expires_at: codeExpiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create user', details: error.message });
    }

    // Отправляем код на email
    try {
      await sendVerificationCode(email, verificationCode);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Пользователь создан, но письмо не отправлено — можно повторить через resend-code
    }

    return res.status(201).json({
      message: 'User created successfully. Please verify your email.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Логин через email/password
router.post('/login', async (req: LoginRequest, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const supabase = getSupabaseClient();

    // Находим пользователя
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Проверяем пароль
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Проверяем подтверждение email
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Email не подтверждён. Проверьте почту.',
        emailVerified: false,
      });
    }

    // Генерируем JWT токен
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.email_verified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Подтверждение email по коду
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const supabase = getSupabaseClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email_verified) {
      return res.json({ message: 'Email already verified' });
    }

    if (user.verification_code !== code) {
      return res.status(400).json({ error: 'Неверный код подтверждения' });
    }

    if (new Date(user.verification_code_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Код подтверждения истёк. Запросите новый.' });
    }

    // Подтверждаем email
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        verification_code: null,
        verification_code_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to verify email' });
    }

    return res.json({
      message: 'Email успешно подтверждён',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Verify email error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Повторная отправка кода подтверждения
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const supabase = getSupabaseClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email_verified) {
      return res.json({ message: 'Email already verified' });
    }

    // Защита от спама: проверяем, прошла ли минута с последней отправки
    if (user.verification_code_expires_at) {
      const lastSentAt = new Date(user.verification_code_expires_at).getTime() - 15 * 60 * 1000;
      const oneMinuteAgo = Date.now() - 60 * 1000;
      if (lastSentAt > oneMinuteAgo) {
        return res.status(429).json({ error: 'Подождите минуту перед повторной отправкой' });
      }
    }

    const verificationCode = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        verification_code: verificationCode,
        verification_code_expires_at: codeExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update verification code' });
    }

    await sendVerificationCode(email, verificationCode);

    return res.json({ message: 'Код подтверждения отправлен повторно' });
  } catch (error) {
    console.error('Resend code error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth — создание/поиск пользователя по данным от NextAuth
router.post('/google-signin', async (req, res) => {
  try {
    const { email, name, googleId } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const supabase = getSupabaseClient();

    // Ищем пользователя по email
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      // Создаём нового пользователя
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email,
          name: name || null,
          auth_provider: 'google',
          external_id: googleId || null,
          email_verified: true,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create user' });
      }
      user = newUser;
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Google signin error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Yandex OAuth — создание/поиск пользователя по данным от NextAuth
router.post('/yandex-signin', async (req, res) => {
  try {
    const { email, name, yandexId } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const supabase = getSupabaseClient();

    // Ищем пользователя по email
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      // Создаём нового пользователя
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email,
          name: name || null,
          auth_provider: 'yandex',
          external_id: yandexId || null,
          email_verified: true,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create user' });
      }
      user = newUser;
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Yandex signin error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// VK OAuth — создание/поиск пользователя по данным от NextAuth
router.post('/vk-signin', async (req, res) => {
  try {
    const { email, name, vkId } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const supabase = getSupabaseClient();

    // Ищем пользователя по email
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      // Создаём нового пользователя
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email,
          name: name || null,
          auth_provider: 'vk',
          external_id: vkId || null,
          email_verified: true,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create user' });
      }
      user = newUser;
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('VK signin error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
