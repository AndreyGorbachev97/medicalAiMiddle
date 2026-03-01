import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateInternal } from '../middleware/internalAuth';
import { getSupabaseClient } from '../config/database';
import { sendAppFeedback } from '../services/email.service';

const router = express.Router();

// Ограничение: 3 отзыва на пользователя в час
const appFeedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req: Request) => (req as any).user?.id || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте через час.' },
});

// POST /api/feedback/rating — сохранить/обновить рейтинг
router.post('/rating', authenticateInternal, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { analysisStatsId, rating } = req.body;

    if (!analysisStatsId) {
      return res.status(400).json({ error: 'analysisStatsId is required' });
    }

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }

    const supabase = getSupabaseClient();

    // Проверяем, что анализ принадлежит пользователю
    const { data: stats } = await supabase
      .from('analysis_stats')
      .select('id')
      .eq('id', analysisStatsId)
      .eq('user_id', userId)
      .single();

    if (!stats) {
      return res.status(403).json({ error: 'Analysis not found or access denied' });
    }

    // Проверяем, есть ли уже отзыв
    const { data: existing } = await supabase
      .from('analysis_reviews')
      .select('id')
      .eq('analysis_stats_id', analysisStatsId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('analysis_reviews')
        .update({ rating, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('analysis_reviews')
        .insert({
          analysis_stats_id: analysisStatsId,
          rating,
        });

      if (error) throw new Error(error.message);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Feedback rating error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

// POST /api/feedback/comment — сохранить/обновить комментарий
router.post('/comment', authenticateInternal, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { analysisStatsId, comment } = req.body;

    if (!analysisStatsId) {
      return res.status(400).json({ error: 'analysisStatsId is required' });
    }

    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    const supabase = getSupabaseClient();

    // Проверяем, что анализ принадлежит пользователю
    const { data: stats } = await supabase
      .from('analysis_stats')
      .select('id')
      .eq('id', analysisStatsId)
      .eq('user_id', userId)
      .single();

    if (!stats) {
      return res.status(403).json({ error: 'Analysis not found or access denied' });
    }

    // Проверяем, есть ли уже отзыв
    const { data: existing } = await supabase
      .from('analysis_reviews')
      .select('id')
      .eq('analysis_stats_id', analysisStatsId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('analysis_reviews')
        .update({ comment: comment.trim(), updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) throw new Error(error.message);
    } else {
      // Создаём новый отзыв с дефолтным рейтингом (потребуется рейтинг для создания)
      return res.status(400).json({ error: 'Please rate the analysis first' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Feedback comment error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

// POST /api/feedback/app — обратная связь по приложению
router.post('/app', authenticateInternal, appFeedbackLimiter, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subject, message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({ error: 'Сообщение должно содержать не менее 10 символов' });
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ error: 'Сообщение не должно превышать 2000 символов' });
    }
    if (subject && (typeof subject !== 'string' || subject.length > 100)) {
      return res.status(400).json({ error: 'Тема не должна превышать 100 символов' });
    }

    const supabase = getSupabaseClient();
    const { data: user } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single();

    sendAppFeedback(
      user?.email || 'unknown',
      user?.name || 'unknown',
      subject?.trim() || 'Без темы',
      message.trim(),
    ).catch((err) => {
      console.error('Failed to send app feedback email:', err);
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('App feedback error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
