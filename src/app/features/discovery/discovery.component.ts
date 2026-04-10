/*------------------Ionic Angular Components----------------------*/
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {IonHeader, IonToolbar, IonTitle, IonContent,
  IonLabel, IonIcon,IonSpinner,IonList,IonItem, IonButton,IonButtons,ModalController } from "@ionic/angular/standalone";

import { addIcons } from 'ionicons';
import { qrCodeOutline,warningOutline,stop,scan,phonePortraitOutline } from 'ionicons/icons'

/*------------------Common Components----------------------*/
import { PairingModalComponent } from 'src/app/shared/components/pairing-modal/pairing-modal.component';
import { QrPairingComponent } from 'src/app/shared/components/qr-pairing/qr-pairing.component';

/*------------------Providers----------------------*/
import { BleService } from '../../core/services/ble.service';


@Component({
  selector: 'app-discovery',
  templateUrl: './discovery.component.html',
  styleUrls: ['./discovery.component.scss'],
  standalone: true,
  imports: [CommonModule,IonHeader, IonToolbar, IonTitle, IonContent,
  IonLabel, IonIcon,IonSpinner,IonList,IonItem, IonButton,IonButtons]
})
export class DiscoveryComponent {

  constructor(public bleService: BleService, private modalCtrl: ModalController) {
    addIcons({ qrCodeOutline,warningOutline,stop,scan,phonePortraitOutline });
  }

  toggleScan() {
    if (this.bleService.isScanning()) {
      this.bleService.stopScan();
    } else {
      this.bleService.initializeAndScan();
    }
  }

  async onDeviceTap(deviceId: string, deviceName: string) {
    // Stop scanning before attempting to connect to save bandwidth/battery
    if (this.bleService.isScanning()) {
      await this.bleService.stopScan();
    }

    const modal = await this.modalCtrl.create({
      component: PairingModalComponent,
      componentProps: { deviceId, deviceName },
      initialBreakpoint: 0.5, // Creates a nice bottom-sheet effect
      breakpoints: [0, 0.5, 0.75]
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.connected) {
      // Proceed to Phase 3: Transfer UI
      console.log('Ready to transfer data to', deviceId);
    }else{}
  }

  async openQrPairing() {
    const modal = await this.modalCtrl.create({
      component: QrPairingComponent,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.roomCode) {
      console.log('Successfully paired via QR! Room Code:', data.roomCode);
      // This Room Code will be passed to the BLE Service in Phase 3 to establish the final data pipeline.
    }
  }
}
