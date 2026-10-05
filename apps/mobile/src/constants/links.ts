/** Public pages on the Templog site (apps/web marketing routes). */
export const SITE_URL = 'https://gettemplog.vercel.app';

export const links = {
  privacy: `${SITE_URL}/privacy`,
  support: `${SITE_URL}/support`,
  terms: `${SITE_URL}/terms`,
  foodCode: `${SITE_URL}/food-code`,
} as const;

export const FOOD_SAFETY_DISCLAIMER =
  'Templog records what you measure and applies the FDA Food Code defaults you choose. It is not legal ' +
  'or food-safety advice: your local health authority and inspector have the final word.';
