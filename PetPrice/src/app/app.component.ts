import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';

import { PriceAlertService } from 'src/app/services/price_alert.service';
import { PriceLiveWatcherService } from 'src/app/services/price_live_watcher.service';
import { SettingsService } from 'src/app/services/settings.service';
import { BackgroundTask } from '@capawesome/capacitor-background-task';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private bgIntervalId?: any;

  constructor(
    private router: Router,
    private auth: Auth,
    private priceAlert: PriceAlertService,
    private priceLive: PriceLiveWatcherService,
    private settings: SettingsService
  ) {
    this.bootstrap();
  }

  private async bootstrap() {

    await this.requestNotificationPermission();
    this.setupLocalNotificationClickRouting();
    this.monitorUserSessionForPriceChecks();
    this.monitorSettingsChanges(); // <— escucha el toggle en caliente
  }

  private async requestNotificationPermission() {
    try { await LocalNotifications.requestPermissions(); }
    catch (e) { console.warn('No se pudo pedir permiso de notificaciones:', e); }
  }

  private setupLocalNotificationClickRouting() {
    LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      try {
        const productId = (event?.notification as any)?.extra?.productId;
        if (productId) this.router.navigate(['/product-detail', productId]);
      } catch (e) { console.warn('Error manejando click de notificación:', e); }
    });
  }

  // Reacciona a login/logout
  private monitorUserSessionForPriceChecks() {
    onAuthStateChanged(this.auth, async (user) => {

      if (user) {
        // si el toggle está activo al iniciar sesión
        if (this.settings.notificationsEnabled) {
          try {
            await this.priceAlert.checkPriceDrops(); // pendientes
            this.priceLive.start();                  // en vivo
            this.enableBackgroundPolling();          // background
          } catch (e) {
            console.warn('init notifications failed:', e);
          }
        }
      } else {
        // logout: apaga todo
        this.priceLive.stop();
        this.disableBackgroundPolling();
      }
    });
  }

  // Reacciona a cambios del toggle mientras la app está abierta
  private monitorSettingsChanges() {
    this.settings.notificationsEnabled$.subscribe((enabled) => {
      const user = this.auth.currentUser;

      if (!user) {
        // si no hay sesión, solo apagar por si acaso
        this.priceLive.stop();
        this.disableBackgroundPolling();
        return;
      }

      if (enabled) {
        // encendido: arranca todo
        this.priceLive.start();
        this.enableBackgroundPolling();
        // opcional: chequeo inmediato al encender
        this.priceAlert.checkPriceDrops().catch(() => {});
      } else {
        // apagado: para todo
        this.priceLive.stop();
        this.disableBackgroundPolling();
      }
    });
  }

  // ====== Background polling (best-effort sin Functions) ======
  private enableBackgroundPolling() {
    if (this.bgIntervalId) return; // evita duplicados

    this.bgIntervalId = setInterval(async () => {
      try {
        const user = this.auth.currentUser;
        if (!user) return;
        if (!this.settings.notificationsEnabled) return;

        const taskId = await BackgroundTask.beforeExit(async () => {
          try { await this.priceAlert.checkPriceDrops(); }
          finally { BackgroundTask.finish({ taskId }); }
        });
      } catch (e) {
        console.warn('background polling error:', e);
      }
    }, 15 * 60 * 1000);
  }

  private disableBackgroundPolling() {
    if (this.bgIntervalId) {
      clearInterval(this.bgIntervalId);
      this.bgIntervalId = undefined;
    }
  }
}
