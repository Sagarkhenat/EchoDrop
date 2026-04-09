import { Injectable, signal, effect } from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ToastController } from '@ionic/angular/standalone';

import { BleService } from './ble.service';
import { HapticService } from './haptic.service';

export interface TransferMetadata {
  type: 'METADATA';
  fileName: string;
  mimeType: string;
  totalChunks: number;
}

export interface TransferChunk {
  type: 'CHUNK';
  index: number;
  data: string;
}

// Union type for our parser
export type TransferPayload = TransferMetadata | TransferChunk;
@Injectable({
  providedIn: 'root'
})

export class TransferService {

  // Reactive state for the UI
  public currentClipboardText = signal<string | null>(null);
  public isTransferring = signal<boolean>(false);

  // Signals for File Transfer UI
  public transferProgress = signal<number>(0); // 0 to 100
  public activeFileName = signal<string | null>(null);
  public transferStatusMessage = signal<string | null>(null);

  // Incoming File State
  private incomingMetadata: TransferMetadata | null = null;
  private incomingChunks: string[] = [];
  public receiveProgress = signal<number>(0);

  // The MTU size (Safe limit for BLE across iOS/Android)
  private readonly CHUNK_SIZE = 128;

  constructor( private bleService : BleService, private hapticService: HapticService, private toastController: ToastController) {
    // Reactively listen for incoming data from the BLE bridge
    effect(() => {
      const incomingText = this.bleService.incomingPayload();

      if (incomingText) {
        this.handleReceivedPayload(incomingText);
      } else {

      }
    });
  }
  /**
   * Reads the current text from the device clipboard.
   */
  async readFromClipboard(): Promise<string | null> {
    try {
      const { type, value } = await Clipboard.read();

      // Ensure we are only dealing with text payloads for now
      if (type === 'text/plain' && value) {
        this.currentClipboardText.set(value);
        return value;
      }
      return null;
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      return null;
    }
  }

  /**
   * Writes received text directly to the device clipboard.
   * This will be triggered when a payload is received via BLE.
   */
  async writeToClipboard(text: string): Promise<void> {
    try {
      await Clipboard.write({
        string: text
      });
      // Update our local signal to reflect the newly received text
      this.currentClipboardText.set(text);
    } catch (error) {
      console.error('Failed to write to clipboard:', error);
    }
  }

  /**
   * The bridge function to send data to the connected BLE peer.
   */
  async beamClipboardText(text: string): Promise<void> {
    this.isTransferring.set(true);

    console.log(`Preparing to beam over P2P: ${text}`);
    try {
      // We assume bleService holds the ID of the connected peer.
      // Ensure you have a way to track the connected device ID in BleService!
      const connectedDeviceId = this.bleService.activeConnectionId();

      if (!connectedDeviceId) {
        throw new Error('No peer connected');
      }

      await this.bleService.sendPayload(connectedDeviceId, text);

    // TODO: Trigger Success Haptics here
    } catch (error) {
      console.error('Beaming failed', error);
      throw error;
    } finally {
      this.isTransferring.set(false);
    }

  }

  /**
   * Processes incoming data, writes to clipboard, and provides physical feedback.
   */
  private async handleReceivedPayload(text: string) {
    try {
      // Attempt to parse as JSON (File Transfer)
      //const payload = JSON.parse(text);

      const payload = JSON.parse(text) as TransferPayload;

      if (payload.type === 'METADATA') {
        this.startFileAssembly(payload);
      } else if (payload.type === 'CHUNK') {
        await this.processFileChunk(payload);
      }

    } catch (e) {
      // JSON parsing failed, meaning this is standard Clipboard Text
      console.log('Received standard text payload for clipboard.');
      await this.writeToClipboard(text);
      await this.hapticService.playSuccess();
    } finally {
      // Always reset the incoming signal so we can catch the next packet
      this.bleService.incomingPayload.set(null);
    }
  }

  /**
   * Opens the native file picker and initiates the chunked transfer process.
   */
  async selectAndSendFile(): Promise<void> {
    try {
      // Open Native File Picker
      const result = await FilePicker.pickFiles({
        readData: true // Instructs Capacitor to return the base64 string directly
      });

      const file = result.files[0];
      if (!file || !file.data) return;

      // 2. Enforce File Size Limit (2MB = ~2,000,000 bytes)
      if (file.size && file.size > 2000000) {
        throw new Error('FILE_TOO_LARGE');
      }

      this.activeFileName.set(file.name);
      this.transferProgress.set(0);
      this.isTransferring.set(true);
      this.transferStatusMessage.set('Preparing payload...');

      // 3. Initiate the Chunking Protocol
      await this.transmitFileInChunks(file.name, file.mimeType || 'application/octet-stream', file.data);

    } catch (error: any) {
      if (error.message === 'User cancelled photos app' || error.message === 'pickFiles canceled') {
        console.log('User cancelled file selection.');
        return; // Silent fail
      }

      this.transferStatusMessage.set(error.message === 'FILE_TOO_LARGE'
        ? 'File exceeds the 2MB BLE limit.'
        : 'Failed to read the file.');
      console.error('File Pick Error:', error);

      // We will trigger a toast from the component based on this status message
    } finally {
      if (this.transferProgress() !== 100) {
        this.isTransferring.set(false); // Only unlock if it didn't finish successfully
      }
    }
  }

  /**
   * Slices the base64 file data and transmits it securely over BLE.
   */
  private async transmitFileInChunks(fileName: string, mimeType: string, base64Data: string) {
    const connectedDeviceId = this.bleService.activeConnectionId();
    if (!connectedDeviceId) throw new Error('No peer connected');

    // Calculate Chunks
    const totalChunks = Math.ceil(base64Data.length / this.CHUNK_SIZE);

    // Send Metadata Header first
    const metadata = JSON.stringify({
      type: 'METADATA',
      fileName: fileName,
      mimeType: mimeType,
      totalChunks: totalChunks
    });
    await this.bleService.sendPayload(connectedDeviceId, metadata);

    // Give the receiver 500ms to parse the metadata before flooding with data
    await new Promise(resolve => setTimeout(resolve, 500));

    // Stream the Chunks
    this.transferStatusMessage.set(`Sending ${fileName}...`);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = start + this.CHUNK_SIZE;
      const chunkData = base64Data.substring(start, end);

      // Wrap chunk in a JSON structure so the receiver knows the order
      const payload = JSON.stringify({
        type: 'CHUNK',
        index: i,
        data: chunkData
      });

      await this.bleService.sendPayload(connectedDeviceId, payload);

      // Update UI Progress
      const percent = Math.round(((i + 1) / totalChunks) * 100);
      this.transferProgress.set(percent);

      // CRITICAL: Prevent native buffer overflow by pausing between packets
      await new Promise(resolve => setTimeout(resolve, 40));
    }

    // Finalize
    this.transferStatusMessage.set('Transfer Complete!');
    this.isTransferring.set(false);
    await this.hapticService.playSuccess();

    // Reset after 3 seconds
    setTimeout(() => {
      this.transferProgress.set(0);
      this.activeFileName.set(null);
      this.transferStatusMessage.set(null);
    }, 3000);
  }


  /**
   * Prepares the app to receive a stream of file chunks.
   */
  private startFileAssembly(metadata: TransferMetadata) {
    this.incomingMetadata = metadata;
    this.incomingChunks = new Array(metadata.totalChunks);
    this.receiveProgress.set(0);
    this.activeFileName.set(metadata.fileName);
    this.transferStatusMessage.set(`Receiving ${metadata.fileName}...`);
    this.isTransferring.set(true);

    console.log(`Expecting ${metadata.totalChunks} chunks for ${metadata.fileName}`);
  }

  /**
   * Stores an incoming chunk and checks if the file is fully assembled.
    */
  private async processFileChunk(payload: TransferChunk) {
    if (!this.incomingMetadata) return;

    // Store chunk in the exact correct index
    this.incomingChunks[payload.index] = payload.data;

    // Calculate and update receiving progress
    const receivedCount = this.incomingChunks.filter(Boolean).length;
    const percent = Math.round((receivedCount / this.incomingMetadata.totalChunks) * 100);
    this.receiveProgress.set(percent);

    // Check if assembly is complete
    if (receivedCount === this.incomingMetadata.totalChunks) {
      await this.finalizeFileAssembly();
    }
  }

  /**
   * Joins all chunks into a single Base64 string and writes it to the device.
   */
  private async finalizeFileAssembly() {

    // Add this guard clause to satisfy strict null checks
    if (!this.incomingMetadata) {
      console.error('Cannot finalize: Metadata is missing.');
      this.transferStatusMessage.set('Transfer failed: Missing file details.');
      return;
    }else{}
    this.transferStatusMessage.set('Saving to device...');

    try {
      // Reconstruct the full base64 string
      const completeBase64 = this.incomingChunks.join('');

      // Save natively via Capacitor Filesystem
      await Filesystem.writeFile({
        path: `EchoDrop_${this.incomingMetadata.fileName}`,
        data: completeBase64,
        directory: Directory.Documents,
      });

      this.transferStatusMessage.set('File saved to Documents!');
      await this.hapticService.playSuccess(); // Double-pulse success

    } catch (error) {
      console.error('Failed to save assembled file:', error);
      this.transferStatusMessage.set('Failed to save file.');
      this.hapticService.playMediumImpact();
    } finally {
      // Cleanup state
      setTimeout(() => {
        this.isTransferring.set(false);
        this.receiveProgress.set(0);
        this.activeFileName.set(null);
        this.transferStatusMessage.set(null);
        this.incomingMetadata = null;
        this.incomingChunks = [];
      }, 3000);
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
