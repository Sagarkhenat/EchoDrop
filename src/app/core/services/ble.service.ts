import { Injectable, signal } from '@angular/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { HapticService } from './haptic.service';

@Injectable({
  providedIn: 'root'
})
export class BleService {
  // Reactive signals to drive the UI without RxJS subscriptions
  public discoveredDevices = signal<ScanResult[]>([]);
  public isScanning = signal<boolean>(false);

  public activeConnection = signal<string | null>(null);

  // Graceful error state logic
  public scanError = signal<string | null>(null);

  constructor(private hapticService: HapticService) {}

  async initializeAndScan() {
    try {
      this.scanError.set(null);

      // Initialize the native bridge
      await BleClient.initialize();

      // Trigger a light tap when scanning begins
      await this.hapticService.playLightImpact();

      // Start scanning flow
      this.isScanning.set(true);

      // Clear any previous results
      this.discoveredDevices.set([]);

      await BleClient.requestLEScan(
        {
          // Note: In Phase 3, we will add a specific 'services' UUID here
          // so we only scan for other EchoDrop apps, not random smart TVs.
        },
        (result) => {
          this.updateDiscoveredDevices(result);
        }
      );

      // Auto-stop scanning after 10 seconds to preserve battery
      setTimeout(async () => {
        if (this.isScanning()) {
          await this.stopScan();
        }else{}
      }, 10000);

    } catch (error: any) {

      // Cleanly catch permission denials or disabled Bluetooth
      this.scanError.set(error.message || 'Failed to initialize Bluetooth scan.');
      this.isScanning.set(false);
      console.error('BLE Scan Error:', error);

    }
  }

  private updateDiscoveredDevices(newDevice: ScanResult) {
    this.discoveredDevices.update(currentDevices => {
      // Prevent UI flickering by filtering out duplicate broadcasts from the same device
      const exists = currentDevices.find(d => d.device.deviceId === newDevice.device.deviceId);
      if (exists) {
        return currentDevices;
      }

      // Trigger a medium thump when a NEW device is found
      this.hapticService.playMediumImpact();
      return [...currentDevices, newDevice];
    });
  }

  async stopScan() {
    this.isScanning.set(false);
    await BleClient.stopLEScan();
  }

  /**
   * Attempts to connect to a device with a strict 10-second timeout
   */
  async connectToDevice(deviceId: string): Promise<boolean> {
    const timeoutDuration = 10000;

    try {
      // Creating a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timed out. Device may be out of range.')), timeoutDuration);
      });

      // Create the connection promise
      const connectPromise = BleClient.connect(deviceId, (disconnectedId) => {
        this.handleDisconnection(disconnectedId);
      });

      // Race them: whichever finishes first wins
      await Promise.race([connectPromise, timeoutPromise]);

      this.activeConnection.set(deviceId);
      this.hapticService.playSuccess(); // Provide physical confirmation
      return true;

    } catch (error: any) {
      console.error('Connection Failed:', error);
      this.activeConnection.set(null);
      this.hapticService.playMediumImpact(); // Error thump
      throw error; // Rethrow to let the UI catch and display it
    }
  }

  async disconnectDevice(deviceId: string) {
    try {
      await BleClient.disconnect(deviceId);
      this.activeConnection.set(null);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  private handleDisconnection(deviceId: string) {
    console.warn(`Device ${deviceId} disconnected.`);
    if (this.activeConnection() === deviceId) {
      this.activeConnection.set(null);
      // In Phase 3, we will add a Toast notification here to alert the user
    }
  }
}
