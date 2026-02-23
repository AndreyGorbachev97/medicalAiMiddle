import express, { Request, Response } from 'express';
import { authenticateInternal } from '../middleware/internalAuth';
import { getSupabaseClient } from '../config/database';

const router = express.Router();

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

export default router;
