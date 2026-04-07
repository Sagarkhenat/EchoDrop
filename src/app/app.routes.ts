import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    // Default route
    path: '',
    redirectTo: 'discovery',
    pathMatch: 'full',
  },
  {
    path: 'discovery',
    loadComponent: () =>
      import('./features/discovery/discovery.component').then(m => m.DiscoveryComponent)
  },
  {
    path: 'transfer',
    loadComponent: () =>
      import('./features/transfer/transfer.component').then(m => m.TransferComponent)
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    // Wildcard Fallback Route (Catches typos and redirects to the safe default)
    path: '**',
    redirectTo: 'discovery'
  }
];
