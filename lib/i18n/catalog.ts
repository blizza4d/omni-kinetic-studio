/**
 * Internationalization (i18n) & Live Narration System (Pack P — F-016)
 *
 * Implements typed multilingual message catalogs and accessible live-region narration.
 */

export type LocaleKey = 'en' | 'es' | 'de' | 'ja' | 'zh' | 'hi' | 'ta';

export interface UIStringCatalog {
  studioTitle: string;
  teleopLabel: string;
  autonomousLabel: string;
  manualLabel: string;
  restartTooltip: string;
  goalReachedNotice: string;
  edgeWarningNotice: string;
  hopLaunchedNotice: string;
  batteryLowNotice: string;
}

export const LOCALES: Record<LocaleKey, { name: string; catalog: UIStringCatalog }> = {
  en: {
    name: 'English',
    catalog: {
      studioTitle: 'Omni-Kinetic: Sim-to-Real Embodied AI Studio',
      teleopLabel: 'Teleop',
      autonomousLabel: 'Autonomous Policy',
      manualLabel: 'Manual Control',
      restartTooltip: 'Restart Episode [R]',
      goalReachedNotice: 'Objective reached successfully.',
      edgeWarningNotice: 'Warning: Approaching arena boundary.',
      hopLaunchedNotice: 'Ballistic hop maneuver launched.',
      batteryLowNotice: 'Caution: Battery level below 20%.',
    },
  },
  es: {
    name: 'Español',
    catalog: {
      studioTitle: 'Omni-Kinetic: Estudio de IA para Robótica',
      teleopLabel: 'Teleoperación',
      autonomousLabel: 'Política Autónoma',
      manualLabel: 'Control Manual',
      restartTooltip: 'Reiniciar Episodio [R]',
      goalReachedNotice: 'Objetivo alcanzado con éxito.',
      edgeWarningNotice: 'Advertencia: Acercándose al límite del terreno.',
      hopLaunchedNotice: 'Maniobra de salto balístico iniciada.',
      batteryLowNotice: 'Atención: Nivel de batería inferior al 20%.',
    },
  },
  de: {
    name: 'Deutsch',
    catalog: {
      studioTitle: 'Omni-Kinetic: Sim-to-Real KI-Studio',
      teleopLabel: 'Teleoperation',
      autonomousLabel: 'Autonome Richtlinie',
      manualLabel: 'Manuelle Steuerung',
      restartTooltip: 'Episode neu starten [R]',
      goalReachedNotice: 'Ziel erfolgreich erreicht.',
      edgeWarningNotice: 'Warnung: Annäherung an Arenagrenze.',
      hopLaunchedNotice: 'Ballistischer Sprung gestartet.',
      batteryLowNotice: 'Achtung: Batteriestand unter 20%.',
    },
  },
  ja: {
    name: '日本語',
    catalog: {
      studioTitle: 'Omni-Kinetic: 実世界ロボティクスAIスタジオ',
      teleopLabel: '遠隔操作',
      autonomousLabel: '自律ポリシー',
      manualLabel: 'マニュアル操作',
      restartTooltip: 'エピソードを再開 [R]',
      goalReachedNotice: '目標地点に到達しました。',
      edgeWarningNotice: '警告：アリーナ境界に接近しています。',
      hopLaunchedNotice: '跳躍マニューバを実行中。',
      batteryLowNotice: '警告：バッテリー残量が20%未満です。',
    },
  },
  zh: {
    name: '中文',
    catalog: {
      studioTitle: 'Omni-Kinetic: 具身智能模拟训练工作室',
      teleopLabel: '遥操作',
      autonomousLabel: '自主策略',
      manualLabel: '手动控制',
      restartTooltip: '重置仿真 [R]',
      goalReachedNotice: '目标点已成功到达。',
      edgeWarningNotice: '警告：正在接近场地边缘。',
      hopLaunchedNotice: '正在执行低重力跳跃。',
      batteryLowNotice: '提示：电池电量低于20%。',
    },
  },
  hi: {
    name: 'हिन्दी',
    catalog: {
      studioTitle: 'ओम्नी-काइनेटिक: रोबोटिक्स एआई स्टूडियो',
      teleopLabel: 'टेलीऑप',
      autonomousLabel: 'स्वायत्त नियंत्रण',
      manualLabel: 'मैनुअल नियंत्रण',
      restartTooltip: 'पुनः आरंभ करें [R]',
      goalReachedNotice: 'लक्ष्य सफलतापूर्वक पूरा हुआ।',
      edgeWarningNotice: 'चेतावनी: मैदान की सीमा निकट है।',
      hopLaunchedNotice: 'उछाल गति शुरू की गई।',
      batteryLowNotice: 'सावधान: बैटरी 20% से कम है।',
    },
  },
  ta: {
    name: 'தமிழ்',
    catalog: {
      studioTitle: 'ஓம்னி-கைனடிக்: ரோபோடிக்ஸ் ஏஐ ஸ்டுடியோ',
      teleopLabel: 'தொலைவியக்கம்',
      autonomousLabel: 'தன்னாட்சி இயக்கம்',
      manualLabel: 'கையேடு கட்டுப்பாடு',
      restartTooltip: 'மீண்டும் தொடங்கு [R]',
      goalReachedNotice: 'இலக்கு வெற்றிகரமாக எட்டப்பட்டது.',
      edgeWarningNotice: 'எச்சரிக்கை: எல்லைக்கு அருகில் செல்கிறது.',
      hopLaunchedNotice: 'பாய்வு இயக்கம் தொடங்கப்பட்டது.',
      batteryLowNotice: 'எச்சரிக்கை: மின்கலன் 20% க்கும் குறைவாக உள்ளது.',
    },
  },
};

export class NarrationManager {
  private lastAnnouncedMs = 0;
  private readonly minIntervalMs = 2500;

  public announce(text: string, force = false): void {
    if (typeof document === 'undefined') return;
    const now = performance.now();
    if (!force && now - this.lastAnnouncedMs < this.minIntervalMs) return;

    this.lastAnnouncedMs = now;
    let liveRegion = document.getElementById('omni-aria-announcer');
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'omni-aria-announcer';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      document.body.appendChild(liveRegion);
    }

    liveRegion.textContent = text;
  }
}

export const globalNarrator = new NarrationManager();
