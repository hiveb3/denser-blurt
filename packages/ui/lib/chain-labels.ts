/**
 * Display labels for the native coin. The Blurt port shows BLURT / Blurt Power
 * while internal logic keeps using the wax names (HIVE, VESTS...).
 * Set REACT_APP_CHAIN=hive to get the original Hive labels back.
 */
import env from '@beam-australia/react-env';

export const IS_BLURT = (env('CHAIN') || 'blurt').toLowerCase() === 'blurt';
export const COIN = IS_BLURT ? 'BLURT' : 'HIVE';
export const POWER = IS_BLURT ? 'BLURT POWER' : 'HIVE POWER';
export const POWER_SHORT = IS_BLURT ? 'BP' : 'HP';
/** HBD, internal market, RC, price feed, downvotes exist only on Hive */
export const HAS_HBD = !IS_BLURT;
export const HAS_RC = !IS_BLURT;
export const HAS_MARKET = !IS_BLURT;
export const HAS_DOWNVOTES = !IS_BLURT;
export const HAS_PRICE_FEED = !IS_BLURT;
