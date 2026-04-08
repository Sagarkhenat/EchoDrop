import { Injectable } from '@angular/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

@Injectable({
  providedIn: 'root'
})
export class HapticService {

  constructor() {}

  /**
   * Triggered when a user initiates an action (like tapping the scan button)
   */
  async playLightImpact() {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Catch silently for web browsers that don't support haptics
    }
  }

  /**
   * Triggered when a significant event occurs (like finding a device)
   */
  async playMediumImpact() {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {}
  }

  /**
   * Triggered on success states (like a completed file transfer)
   */
  async playSuccess() {
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch (e) {}
  }
}
