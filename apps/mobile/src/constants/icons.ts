// Icon vocabulary: every icon is an SF Symbol on iOS and a Material Symbol on Android (one family per
// platform). Names are checked at compile time by expo-symbols' types.
import type { CheckpointKind, CorrectiveActionKind } from '@templog/shared/schemas';
import type { SymbolViewProps } from 'expo-symbols';

export type SfName = Extract<SymbolViewProps['name'], string>;
export type MdName = NonNullable<Exclude<SymbolViewProps['name'], string>['android']>;
export type IconName = { sf: SfName; md: MdName };

export const icons = {
  today: { sf: 'thermometer.medium', md: 'thermostat' },
  log: { sf: 'plus.circle.fill', md: 'add_circle' },
  cooling: { sf: 'timer', md: 'timer' },
  history: { sf: 'calendar', md: 'calendar_month' },
  settings: { sf: 'gearshape.fill', md: 'settings' },
  pass: { sf: 'checkmark.circle.fill', md: 'check_circle' },
  fail: { sf: 'exclamationmark.octagon.fill', md: 'report' },
  check: { sf: 'checkmark', md: 'check' },
  overdue: { sf: 'alarm.fill', md: 'alarm' },
  due: { sf: 'bell.fill', md: 'notifications' },
  missed: { sf: 'minus.circle.fill', md: 'do_not_disturb_on' },
  upcoming: { sf: 'clock', md: 'schedule' },
  clock: { sf: 'clock', md: 'schedule' },
  pending: { sf: 'hourglass', md: 'hourglass_top' },
  backspace: { sf: 'delete.backward', md: 'backspace' },
  plusMinus: { sf: 'plus.forwardslash.minus', md: 'exposure' },
  snooze: { sf: 'moon.zzz', md: 'snooze' },
  undo: { sf: 'arrow.uturn.backward', md: 'undo' },
  add: { sf: 'plus', md: 'add' },
  close: { sf: 'xmark', md: 'close' },
  chevronForward: { sf: 'chevron.right', md: 'chevron_right' },
  chevronBack: { sf: 'chevron.left', md: 'chevron_left' },
  up: { sf: 'arrow.up', md: 'arrow_upward' },
  down: { sf: 'arrow.down', md: 'arrow_downward' },
  bell: { sf: 'bell.badge', md: 'notifications_active' },
  bellOff: { sf: 'bell.slash', md: 'notifications_off' },
  share: { sf: 'square.and.arrow.up', md: 'share' },
  pdf: { sf: 'doc.richtext', md: 'picture_as_pdf' },
  csv: { sf: 'tablecells', md: 'table_view' },
  json: { sf: 'curlybraces', md: 'data_object' },
  trash: { sf: 'trash', md: 'delete' },
  edit: { sf: 'pencil', md: 'edit' },
  archive: { sf: 'archivebox', md: 'archive' },
  unarchive: { sf: 'tray.and.arrow.up', md: 'unarchive' },
  kitchen: { sf: 'house.fill', md: 'storefront' },
  checkpoints: { sf: 'list.bullet.rectangle', md: 'list_alt' },
  team: { sf: 'person.2.fill', md: 'group' },
  account: { sf: 'person.crop.circle', md: 'account_circle' },
  personAdd: { sf: 'person.badge.plus', md: 'person_add' },
  initials: { sf: 'signature', md: 'draw' },
  warning: { sf: 'exclamationmark.triangle.fill', md: 'warning' },
  info: { sf: 'info.circle', md: 'info' },
  shield: { sf: 'lock.shield', md: 'shield_lock' },
  doc: { sf: 'doc.text', md: 'description' },
  book: { sf: 'book.closed', md: 'menu_book' },
  lifebuoy: { sf: 'lifepreserver', md: 'support' },
  streak: { sf: 'checkmark.seal.fill', md: 'verified' },
  sync: { sf: 'arrow.triangle.2.circlepath', md: 'sync' },
  key: { sf: 'key', md: 'key' },
  logout: { sf: 'rectangle.portrait.and.arrow.right', md: 'logout' },
  globe: { sf: 'globe', md: 'public' },
  moon: { sf: 'moon', md: 'dark_mode' },
  sparkles: { sf: 'sparkles', md: 'auto_awesome' },
  database: { sf: 'externaldrive.badge.exclamationmark', md: 'database' },
  calendar: { sf: 'calendar', md: 'calendar_month' },
  chart: { sf: 'chart.xyaxis.line', md: 'show_chart' },
  copy: { sf: 'doc.on.doc', md: 'content_copy' },
  timerStart: { sf: 'timer', md: 'timer' },
} as const satisfies Record<string, IconName>;

/** Kind icon per checkpoint kind (the colour comes from `checkpointTone`). */
export const kindIcons: Record<CheckpointKind, IconName> = {
  'cold-holding': { sf: 'snowflake', md: 'ac_unit' },
  'hot-holding': { sf: 'flame.fill', md: 'local_fire_department' },
  cooking: { sf: 'frying.pan.fill', md: 'skillet' },
  receiving: { sf: 'shippingbox.fill', md: 'local_shipping' },
  freezer: { sf: 'thermometer.snowflake', md: 'kitchen' },
};

/** Corrective action icons. */
export const actionIcons: Record<CorrectiveActionKind, IconName> = {
  discard: { sf: 'trash.fill', md: 'delete' },
  reheat: { sf: 'flame.fill', md: 'local_fire_department' },
  move: { sf: 'arrow.left.arrow.right', md: 'swap_horiz' },
  service: { sf: 'wrench.and.screwdriver.fill', md: 'build' },
  other: { sf: 'ellipsis.circle.fill', md: 'more_horiz' },
};
