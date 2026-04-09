import { Injectable, signal } from '@angular/core';
import { BleClient, ScanResult, dataViewToText, textToDataView } from '@capacitor-community/bluetooth-le';
import { ToastController } from '@ionic/angular/standalone';

import { HapticService } from './haptic.service';

// Custom UUIDs for the EchoDrop data bridge
const ECHODROP_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const PAYLOAD_CHARACTERISTIC_UUID = 'abcdef01-1234-5678-1234-56789abcdef0';
@Injectable({
  providedIn: 'root'
})
export class BleService {
  // Reactive signals to drive the UI without RxJS subscriptions
  public discoveredDevices = signal<ScanResult[]>([]);
  public isScanning = signal<boolean>(false);

   // Track the ID of the currently connected peer
  public activeConnectionId = signal<string | null>(null);

  // Graceful error state logic
  public scanError = signal<string | null>(null);

  // Tracks incoming text payloads from the connected peer
  public incomingPayload = signal<string | null>(null);



  constructor(private hapticService: HapticService, private toastController: ToastController) {}

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

        this.activeConnectionId.set(null);
      });

      // Race them: whichever finishes first wins
      await Promise.race([connectPromise, timeoutPromise]);

      this.activeConnectionId.set(deviceId);

      // Store the ID so TransferService can access it later
      this.activeConnectionId.set(deviceId);

      // Start listening for incoming data immediately
      await this.startPayloadListener(deviceId);

      this.hapticService.playSuccess(); // Provide physical confirmation
      return true;

    } catch (error: any) {
      console.error('Connection Failed:', error);
      this.activeConnectionId.set(null);
      this.hapticService.playMediumImpact(); // Error thump
      throw error; // Rethrow to let the UI catch and display it
    }
  }

  async disconnectDevice(deviceId: string) {
    try {
      await BleClient.disconnect(deviceId);
      this.activeConnectionId.set(null);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  private async handleDisconnection(deviceId: string) {
    console.warn(`Device ${deviceId} disconnected.`);
    if (this.activeConnectionId() === deviceId) {
      this.activeConnectionId.set(null);
      await this.presentErrorToast('Peer disconnected unexpectedly.')
    } else {

    }
  }

  /**
   * Transmits a text payload to the currently connected BLE device.
   */
  async sendPayload(deviceId: string, textPayload: string): Promise<void> {
    try {
      // Convert standard string to BLE-compatible DataView
      const data = textToDataView(textPayload);

      await BleClient.write(deviceId,ECHODROP_SERVICE_UUID,PAYLOAD_CHARACTERISTIC_UUID,data);

      console.log('Payload transmitted successfully via BLE');
    } catch (error) {
      console.error('Failed to send payload over BLE:', error);
      await this.presentErrorToast('Connection lost. Device may be out of range.');
      throw error; // Re-throw so the UI component can catch and display the error toast
    }
  }

  /**
   * Subscribes to the payload characteristic to receive incoming data streams.
   */
  async startPayloadListener(deviceId: string) {
    try {
      await BleClient.startNotifications(deviceId, ECHODROP_SERVICE_UUID,PAYLOAD_CHARACTERISTIC_UUID,
        (value: DataView) => {
          // Decode the binary DataView back into a readable string
          const decodedText = dataViewToText(value);

          // Update the signal so the rest of the app can react
          this.incomingPayload.set(decodedText);
          console.log('Received payload:', decodedText);
        }
      );
    } catch (error) {
      console.error('Failed to subscribe to payload notifications:', error);
      // In a production app, we could set an error signal here to alert the UI
    }
  }

  // Helper method to trigger toasts
  async presentErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 4000,
      color: 'danger',
      icon: 'warning-outline',
      position: 'top'
    });
    await toast.present();
  }
}
