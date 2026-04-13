import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {ModalController, IonHeader, IonToolbar, IonTitle, IonContent,
  IonIcon, IonButton, IonButtons, IonSegment, IonSegmentButton, IonLabel,IonItem,IonInput} from '@ionic/angular/standalone';


import { QRCodeComponent } from 'angularx-qrcode';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';

import { addIcons } from 'ionicons';
import { warning,closeCircle } from 'ionicons/icons';

/*------------------Providers----------------------*/
import { HapticService } from 'src/app/core/services/haptic.service';

@Component({
  selector: 'app-qr-pairing',
  templateUrl: './qr-pairing.component.html',
  styleUrls: ['./qr-pairing.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonButton,
      IonButtons, IonSegment, IonSegmentButton,IonLabel,IonItem,QRCodeComponent, FormsModule,IonInput]
})
export class QrPairingComponent implements OnInit, OnDestroy {

  // UI State Signals
  public segmentView = signal<'show' | 'scan'>('show');
  public roomCode = signal<string>('');
  public manualInput = signal<string>('');

  // Camera & Error States
  public isScanning = signal<boolean>(false);
  public scanError = signal<string | null>(null);
  public hasCameraPermission = signal<boolean>(false);

  constructor(private modalCtrl: ModalController, private hapticService: HapticService) {
    addIcons({warning,closeCircle });
  }

  ngOnInit() {
    // Generate a secure, 6-character alphanumeric Room ID
    this.roomCode.set(Math.random().toString(36).substring(2, 8).toUpperCase());
    this.checkCameraPermission();
  }

  ngOnDestroy() {
    // Safety net: Ensure the camera is always stopped if the modal is destroyed
    this.stopScanner();
  }

  async checkCameraPermission() {
    try {
      const status = await BarcodeScanner.checkPermission({ force: false });
      this.hasCameraPermission.set(status.granted ?? false);
    } catch (e) {
      this.hasCameraPermission.set(false);
    }
  }

  async requestCameraPermission() {
    try {
      this.scanError.set(null);
      const status = await BarcodeScanner.checkPermission({ force: true });

      if (status.granted) {
        this.hasCameraPermission.set(true);
        this.startScanner();
      } else if (status.denied) {
        // OS level denial requires the user to go to settings
        this.scanError.set('Camera access was denied. Please enable it in your device settings.');
        BarcodeScanner.openAppSettings();
      }
    } catch (error: any) {
      this.scanError.set('Failed to access the camera hardware.');
    }
  }

  async startScanner() {
    try {
      await this.hapticService.playLightImpact();
      this.isScanning.set(true);

      // Make the webview transparent so the native camera shows through
      await BarcodeScanner.hideBackground();
      document.body.classList.add('qrscanner-active');

      const result = await BarcodeScanner.startScan();

      if (result.hasContent) {
        this.handleSuccessfulScan(result.content);
      }
    } catch (error) {
      this.scanError.set('Scanner unexpectedly closed or is not supported on this device.');
      this.stopScanner();
    }
  }

  stopScanner() {
    BarcodeScanner.showBackground();
    BarcodeScanner.stopScan();
    document.body.classList.remove('qrscanner-active');
    this.isScanning.set(false);
  }

  handleSuccessfulScan(code: string) {
    this.stopScanner();
    this.hapticService.playSuccess();

    // Return the code back to the parent Discovery component to initiate the BLE handshake
    this.modalCtrl.dismiss({ roomCode: code });
  }

  submitManualCode() {
    if (this.manualInput().length === 6) {
      this.handleSuccessfulScan(this.manualInput().toUpperCase());
    } else {
      this.scanError.set('Room Code must be exactly 6 characters.');
      this.hapticService.playMediumImpact();
    }
  }

  segmentChanged(event: any) {
    this.segmentView.set(event.detail.value);
    if (event.detail.value === 'scan') {
      if (this.hasCameraPermission()) {
        this.startScanner();
      }
    } else {
      this.stopScanner();
    }
  }

  closeModal() {
    this.stopScanner();
    this.modalCtrl.dismiss();
  }
}
