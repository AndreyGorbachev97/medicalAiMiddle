export type TariffName = 'TARIFF_1_CARD' | 'TARIFF_5_CARD' | 'TARIFF_10_CARD' | 'TARIFF_UNLIMITED_CARD';

export interface TariffConfig {
  name: TariffName;
  credits: number;
  price: string;
  label: string;
}

export const TARIFFS: Record<TariffName, TariffConfig> = {
  TARIFF_1_CARD: {
    name: 'TARIFF_1_CARD',
    credits: 1,
    price: '79.00',
    label: '1 расшифровка',
  },
  TARIFF_5_CARD: {
    name: 'TARIFF_5_CARD',
    credits: 5,
    price: '199.00',
    label: '5 расшифровок',
  },
  TARIFF_10_CARD: {
    name: 'TARIFF_10_CARD',
    credits: 10,
    price: '359.00',
    label: '10 расшифровок',
  },
  TARIFF_UNLIMITED_CARD: {
    name: 'TARIFF_UNLIMITED_CARD',
    credits: 30,
    price: '599.00',
    label: '30 расшифровок',
  },
};
