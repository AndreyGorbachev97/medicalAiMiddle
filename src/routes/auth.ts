import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { getSupabaseClient } from '../config/database';
import { RegisterRequest, LoginRequest } from '../types';

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

    // Создаем пользователя
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password: hashedPassword,
        name: name || null,
        auth_provider: 'email',
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create user', details: error.message });
    }

    // Генерируем JWT токен
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'User created successfully',
      token,
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
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
  try {
    const user = req.user as any;

    if (!user) {
      return res.status(401).json({ error: 'Authentication failed' });
    }

    const supabase = getSupabaseClient();

    // Проверяем или создаем пользователя
    let { data: dbUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', user.email)
      .single();

    if (!dbUser) {
      const { data: newUser } = await supabase
        .from('users')
        .insert({
          email: user.email,
          name: user.name,
          auth_provider: 'google',
          external_id: user.id,
        })
        .select()
        .single();
      dbUser = newUser;
    }

    const token = jwt.sign(
      { id: dbUser!.id, email: dbUser!.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.redirect(`/auth/callback?token=${token}`);
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

