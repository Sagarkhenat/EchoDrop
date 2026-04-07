/*------------------Ionic Angular Components----------------------*/
import { Component, Input, signal, OnInit } from '@angular/core';

import {IonHeader, IonToolbar, IonTitle, IonContent,IonIcon, IonSpinner, IonButton, IonButtons, ModalController
} from "@ionic/angular/standalone";

import { addIcons } from 'ionicons';
import { checkmarkCircle,warning } from 'ionicons/icons';

/*------------------Providers----------------------*/
import { BleService } from '../../../core/services/ble.service';

@Component({
  selector: 'app-pairing-modal',
  templateUrl: './pairing-modal.component.html',
  styleUrls: ['./pairing-modal.component.scss'],
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent,IonIcon, IonSpinner, IonButton, IonButtons]
})
export class PairingModalComponent implements OnInit {
  @Input() deviceId!: string;
  @Input() deviceName!: string;


  // Local UI States
  public connectionState = signal<'connecting' | 'success' | 'error'>('connecting');
  public errorMessage = signal<string>('');

  constructor(public bleService:BleService , public modalCtrl: ModalController) {
    addIcons({checkmarkCircle,warning });
  }

  async ngOnInit() {
    await this.attemptConnection();
  }

  async attemptConnection() {
    this.connectionState.set('connecting');
    this.errorMessage.set('');

    try {
      await this.bleService.connectToDevice(this.deviceId);
      this.connectionState.set('success');

      // Auto-dismiss the modal on success after a short delay
      setTimeout(() => this.dismiss(true), 1500);
    } catch (error: any) {
      this.connectionState.set('error');
      this.errorMessage.set(error.message || 'Failed to establish a secure connection.');
    }
  }

  async cancelAndDismiss() {
    if (this.connectionState() === 'connecting') {
      // If user cancels mid-connection, ensure we cleanly severe the tie
      await this.bleService.disconnectDevice(this.deviceId);
    }else{}
    this.dismiss(false);
  }

  private dismiss(connected: boolean) {
    this.modalCtrl.dismiss({ connected });
  }
}
