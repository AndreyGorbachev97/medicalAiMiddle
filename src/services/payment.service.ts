import axios from 'axios';
import { randomUUID } from 'crypto';
import { getSupabaseClient } from '../config/database';
import { YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY } from '../config/env';
import { TARIFFS, TariffName } from '../config/tariffs';

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

interface YookassaPayment {
  id: string;
  status: string;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url: string };
  metadata?: Record<string, string>;
  created_at: string;
}

interface WebhookBody {
  event: string;
  object: YookassaPayment;
}

export class PaymentService {
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64');
  }

  async createPayment(
    userId: string,
    tariffName: TariffName,
    returnUrl: string
  ): Promise<{ confirmationUrl: string; paymentId: string; localPaymentId: string }> {
    const tariff = TARIFFS[tariffName];
    if (!tariff) {
      throw new Error(`Unknown tariff: ${tariffName}`);
    }

    const idempotenceKey = randomUUID();
    const supabase = getSupabaseClient();

    const { data: localPayment, error: insertError } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        tariff_name: tariffName,
        credits_amount: tariff.credits,
        amount_value: tariff.price,
        amount_currency: 'RUB',
        status: 'pending',
        idempotence_key: idempotenceKey,
      })
      .select()
      .single();

    if (insertError || !localPayment) {
      throw new Error('Failed to create local payment record');
    }

    const { data: yookassaPayment } = await axios.post<YookassaPayment>(
      `${YOOKASSA_API}/payments`,
      {
        amount: { value: tariff.price, currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: returnUrl },
        capture: true,
        description: `${tariff.label} — Медицинский AI Анализ`,
        metadata: {
          local_payment_id: localPayment.id,
          user_id: userId,
          tariff_name: tariffName,
        },
      },
      {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Idempotence-Key': idempotenceKey,
          'Content-Type': 'application/json',
        },
      }
    );

    await supabase
      .from('payments')
      .update({
        yookassa_payment_id: yookassaPayment.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', localPayment.id);

    this.startPolling(yookassaPayment.id);

    return {
      confirmationUrl: yookassaPayment.confirmation?.confirmation_url || '',
      paymentId: yookassaPayment.id,
      localPaymentId: localPayment.id,
    };
  }

  async handleWebhook(body: WebhookBody): Promise<void> {
    const { event, object: payment } = body;

    if (event === 'payment.succeeded') {
      await this.fulfillPayment(payment.id);
    } else if (event === 'payment.canceled') {
      await this.cancelPayment(payment.id);
    }
  }

  private async fulfillPayment(yookassaPaymentId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { data: localPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('yookassa_payment_id', yookassaPaymentId)
      .single();

    if (!localPayment) {
      console.error(`No local payment found for YooKassa ID: ${yookassaPaymentId}`);
      return;
    }

    if (localPayment.status === 'succeeded') {
      return;
    }

    await supabase
      .from('payments')
      .update({
        status: 'succeeded',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', localPayment.id);

    const { error: rpcError } = await supabase.rpc('increment_credits', {
      p_user_id: localPayment.user_id,
      p_amount: localPayment.credits_amount,
    });

    if (rpcError) {
      console.error('RPC increment_credits failed, using fallback:', rpcError);
      const { data: user } = await supabase
        .from('users')
        .select('analysis_credits')
        .eq('id', localPayment.user_id)
        .single();

      if (user) {
        await supabase
          .from('users')
          .update({
            analysis_credits: user.analysis_credits + localPayment.credits_amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', localPayment.user_id);
      }
    }

    this.stopPolling(yookassaPaymentId);
    console.log(`Payment ${yookassaPaymentId} fulfilled: +${localPayment.credits_amount} credits for user ${localPayment.user_id}`);
  }

  private async cancelPayment(yookassaPaymentId: string): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase
      .from('payments')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('yookassa_payment_id', yookassaPaymentId);

    this.stopPolling(yookassaPaymentId);
    console.log(`Payment ${yookassaPaymentId} canceled`);
  }

  startPolling(yookassaPaymentId: string): void {
    if (this.pollingIntervals.has(yookassaPaymentId)) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 120; // 30s * 120 = 1 hour

    const intervalId = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        this.stopPolling(yookassaPaymentId);
        return;
      }

      try {
        const { data: payment } = await axios.get<YookassaPayment>(
          `${YOOKASSA_API}/payments/${yookassaPaymentId}`,
          {
            headers: { 'Authorization': this.getAuthHeader() },
          }
        );

        if (payment.status === 'succeeded') {
          await this.fulfillPayment(yookassaPaymentId);
        } else if (payment.status === 'canceled') {
          await this.cancelPayment(yookassaPaymentId);
        }
      } catch (error) {
        console.error(`Polling error for ${yookassaPaymentId}:`, error instanceof Error ? error.message : error);
      }
    }, 30000);

    this.pollingIntervals.set(yookassaPaymentId, intervalId);
  }

  private stopPolling(yookassaPaymentId: string): void {
    const intervalId = this.pollingIntervals.get(yookassaPaymentId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(yookassaPaymentId);
    }
  }

  async checkPaymentStatus(yookassaPaymentId: string): Promise<string> {
    const { data: payment } = await axios.get<YookassaPayment>(
      `${YOOKASSA_API}/payments/${yookassaPaymentId}`,
      {
        headers: { 'Authorization': this.getAuthHeader() },
      }
    );
    return payment.status;
  }

  async getUserBalance(userId: string): Promise<number> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('analysis_credits')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error('Failed to get user balance');
    }
    return data.analysis_credits;
  }

  async recoverPendingPayments(): Promise<void> {
    const supabase = getSupabaseClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: pendingPayments } = await supabase
      .from('payments')
      .select('*')
      .eq('status', 'pending')
      .gt('created_at', oneHourAgo);

    if (pendingPayments && pendingPayments.length > 0) {
      for (const payment of pendingPayments) {
        if (payment.yookassa_payment_id) {
          this.startPolling(payment.yookassa_payment_id);
        }
      }
      console.log(`Recovered polling for ${pendingPayments.length} pending payment(s)`);
    }
  }
}
