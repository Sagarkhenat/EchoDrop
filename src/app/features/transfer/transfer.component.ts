import { Component, inject, signal } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonCard,
  IonCardHeader, IonCardTitle, IonCardContent, IonButton,
  IonIcon, IonSpinner, IonToast, IonText,IonProgressBar} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { paperPlaneOutline, clipboardOutline, warningOutline, documentOutline, folderOpenOutline } from 'ionicons/icons';

import { TransferService } from '../../core/services/transfer.service';

@Component({
  selector: 'app-transfer',
  standalone: true,
  imports: [ IonHeader, IonToolbar, IonTitle, IonContent, IonCard,
    IonCardHeader, IonCardTitle, IonCardContent, IonButton,
    IonIcon, IonSpinner, IonToast, IonText, IonProgressBar],
  templateUrl: './transfer.component.html',
  styleUrls: ['./transfer.component.scss']
})
export class TransferComponent {

  // Local signal to manage dynamic UI error states
  public errorMessage = signal<string | null>(null);

  constructor( public transferService: TransferService) {
    addIcons({ paperPlaneOutline, clipboardOutline, warningOutline, documentOutline, folderOpenOutline });
  }

  /**
   * Safely attempts to read the device clipboard and handles edge cases.
   */
  async handleReadClipboard() {
    this.errorMessage.set(null); // Clear previous errors

    const text = await this.transferService.readFromClipboard();

    if (!text) {
      this.errorMessage.set('Clipboard is empty or contains unsupported data (e.g., an image).');
    }
  }

  /**
   * Initiates the P2P payload transfer with strict error handling.
   */
  async handleBeam() {
    const text = this.transferService.currentClipboardText();
    if (!text) return;

    this.errorMessage.set(null);

    try {
      await this.transferService.beamClipboardText(text);
      // NOTE: Success haptics will be implemented globally in the service later
    } catch (error) {
      this.errorMessage.set('Transfer failed. The peer may have disconnected.');
      this.transferService.isTransferring.set(false); // Ensure UI unlocks
    }
  }
}
