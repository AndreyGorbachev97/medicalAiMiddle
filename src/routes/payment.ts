import express, { Request, Response } from 'express';
import { authenticateInternal } from '../middleware/internalAuth';
import { PaymentService } from '../services/payment.service';
import { TARIFFS, TariffName } from '../config/tariffs';

const router = express.Router();
const paymentService = new PaymentService();

// POST /api/payment/create — create payment (internal auth)
router.post('/create', authenticateInternal, async (req: Request, res: Response) => {
  try {
    const { tariff, returnUrl } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!tariff || !TARIFFS[tariff as TariffName]) {
      return res.status(400).json({ error: 'Invalid tariff' });
    }

    const result = await paymentService.createPayment(
      userId,
      tariff as TariffName,
      returnUrl || 'http://localhost:3000/account?payment=success'
    );

    return res.json({
      success: true,
      confirmationUrl: result.confirmationUrl,
      paymentId: result.paymentId,
      localPaymentId: result.localPaymentId,
    });
  } catch (error) {
    console.error('Create payment error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
});

// POST /api/payment/webhook — YooKassa webhook (NO auth)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    await paymentService.handleWebhook(req.body);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to prevent YooKassa retries on processing errors
    return res.status(200).json({ success: false });
  }
});

// GET /api/payment/status/:paymentId — check payment status (internal auth)
router.get('/status/:paymentId', authenticateInternal, async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const status = await paymentService.checkPaymentStatus(paymentId);
    return res.json({ status });
  } catch (error) {
    console.error('Check status error:', error);
    return res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// GET /api/payment/balance — get user credit balance (internal auth)
router.get('/balance', authenticateInternal, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const credits = await paymentService.getUserBalance(userId);
    return res.json({ credits });
  } catch (error) {
    console.error('Get balance error:', error);
    return res.status(500).json({ error: 'Failed to get balance' });
  }
});

// GET /api/payment/tariffs — get available tariffs (public)
router.get('/tariffs', (_req: Request, res: Response) => {
  return res.json({ tariffs: Object.values(TARIFFS) });
});

export { paymentService };
export default router;
