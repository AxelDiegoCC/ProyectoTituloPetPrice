import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SettingsService } from 'src/app/services/settings.service';

type Theme = 'light' | 'dark' | 'system';
type ModalKind = 'changepw' | null;
type Tab = 'home' | 'explore' | 'favorites' | 'profile';

@Component({
  selector: 'app-configurations',
  templateUrl: './configurations.page.html',
  styleUrls: ['./configurations.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ConfigurationsPage implements OnDestroy {
  // Tabs
  activeTab: Tab = 'profile';

  // Apariencia
  theme: Theme = 'system';
  resolvedTheme: 'light' | 'dark' | null = null;
  private mql?: MediaQueryList;
  private onMqlChange?: (this: MediaQueryList, ev: MediaQueryListEvent) => any;

  // Notificaciones
  notificationsEnabled = true;

  // Seguridad
  canChangePassword = true;
  modal: ModalKind = null;
  showPw = false;
  changing = false;
  pwForm = { current: '', next: '', confirm: '' };

  constructor(
    private router: Router,
    private toast: ToastController,
    private auth: Auth,
    private fs: Firestore,
    private settings: SettingsService
  ) {
    // Estado inicial de notificaciones
    this.notificationsEnabled = this.settings.notificationsEnabled;

    // Tema
    const savedTheme = (localStorage.getItem('settings.theme') as Theme) || 'system';
    this.theme = savedTheme;
    this.bindSystemWatcher();     // crea el watcher primero
    this.applyEffectiveTheme();   // aplica el tema efectivo
    // Tab activa
    this.activeTab = this.detectSectionFromUrl(this.router.url);

    // Seguridad
    this.checkRole();
  }

  ngOnDestroy(): void {
    if (this.mql && this.onMqlChange) {
      // Limpia el listener si aplica
      // @ts-ignore - compatibilidad con distintos navegadores
      this.mql.removeEventListener ? this.mql.removeEventListener('change', this.onMqlChange) : this.mql.removeListener?.(this.onMqlChange);
    }
  }

  // ===== Navegación para footer =====
  private detectSectionFromUrl(url: string): Tab {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    const segs = clean.split('/').filter(Boolean);
    const business = segs.find(s => s === 'home' || s === 'products' || s === 'favorites' || s === 'profile' || s === 'admin-panel' || s === 'configurations');
    if (business === 'home') return 'home';
    if (business === 'products') return 'explore';
    if (business === 'favorites') return 'favorites';
    return 'profile';
  }

  // ===== Rol para habilitar cambio de contraseña =====
  private async checkRole() {
    const user = this.auth.currentUser;
    if (!user) return;
    try {
      const snap = await getDoc(doc(this.fs, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      this.canChangePassword = role !== 'admin';
    } catch {
      this.canChangePassword = true;
    }
  }

  // ===== Tema =====
  get themeLabel() {
    return this.theme === 'light' ? 'Claro' : this.theme === 'dark' ? 'Oscuro' : 'Según el sistema';
  }

  async setTheme(t: Theme, notify = true) {
    this.theme = t;
    localStorage.setItem('settings.theme', t);
    this.applyEffectiveTheme();   // <-- aplica clase .dark y attrs según el tema efectivo
    if (notify) this.present('Tema actualizado');
  }

  private bindSystemWatcher() {
    if (!window.matchMedia) {
      // Sin matchMedia: asume claro a menos que se elija 'dark'
      this.resolvedTheme = this.theme === 'dark' ? 'dark' : 'light';
      return;
    }
    this.mql = window.matchMedia('(prefers-color-scheme: dark)');
    // Mantén una referencia al handler para poder desuscribir
    this.onMqlChange = () => {
      // Solo re-aplica si el usuario eligió 'system'
      if (this.theme === 'system') this.applyEffectiveTheme();
    };
    // @ts-ignore - compatibilidad con distintos navegadores
    this.mql.addEventListener ? this.mql.addEventListener('change', this.onMqlChange) : this.mql.addListener?.(this.onMqlChange);
  }

  /** Aplica el *tema efectivo* (light/dark) y sincroniza:
   *  - this.resolvedTheme
   *  - body.classList: añade/quita `.dark`
   *  - atributos data-theme (selección) y data-theme-effective (resultado)
   *  Esto hace que tus SCSS con `:host-context(.dark)` funcionen al forzar oscuro.
   */
  private applyEffectiveTheme() {
    const body = document.body;
    const systemIsDark = this.mql ? this.mql.matches : false;
    const effective: 'light' | 'dark' =
      this.theme === 'system' ? (systemIsDark ? 'dark' : 'light') : this.theme;

    this.resolvedTheme = effective;

    // 1) Clase para tus SCSS existentes
    body.classList.toggle('dark', effective === 'dark');
    body.classList.toggle('light', effective === 'light'); // opcional, por claridad

    // 2) Atributos útiles (por si en el futuro quieres apuntar a ellos en CSS)
    body.setAttribute('data-theme', this.theme);                // 'light' | 'dark' | 'system'
    body.setAttribute('data-theme-effective', effective);       // 'light' | 'dark'
  }

  // ===== Notificaciones =====
  async toggleNotifications(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const checked = input.checked;

    if (checked) {
      const ok = await this.ensureLocalNotifPermission();
      if (!ok) {
        input.checked = false;
        this.notificationsEnabled = false;
        this.settings.setNotificationsEnabled(false);
        this.present('Permiso de notificaciones denegado', 'danger');
        return;
      }
    }

    this.notificationsEnabled = checked;
    this.settings.setNotificationsEnabled(checked);
    this.present(checked ? 'Notificaciones activadas' : 'Notificaciones desactivadas');
  }

  private async ensureLocalNotifPermission(): Promise<boolean> {
    try {
      const cur = await LocalNotifications.checkPermissions();
      if (cur.display === 'granted') return true;
      const req = await LocalNotifications.requestPermissions();
      return req.display === 'granted';
    } catch {
      return false;
    }
  }

  // ===== Cambiar contraseña =====
  openChangePassword() {
    if (!this.canChangePassword) return;
    this.modal = 'changepw';
    this.showPw = false;
    this.changing = false;
    this.pwForm = { current: '', next: '', confirm: '' };
  }
  closeModal() { this.modal = null; }

  async submitChangePassword() {
    if (this.changing) return;
    const user = this.auth.currentUser;
    if (!user || !user.email) { this.present('Debes iniciar sesión', 'danger'); return; }

    const { current, next, confirm } = this.pwForm;
    if (!current || !next || !confirm) { this.present('Completa todos los campos', 'danger'); return; }
    if (next.length < 6) { this.present('La nueva contraseña debe tener al menos 6 caracteres', 'danger'); return; }
    if (next !== confirm) { this.present('Las contraseñas no coinciden', 'danger'); return; }

    try {
      this.changing = true;
      const cred = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      this.present('Contraseña actualizada', 'primary');
      this.closeModal();
    } catch (e: any) {
      console.error(e);
      const msg = e?.code === 'auth/wrong-password'
        ? 'La contraseña actual es incorrecta'
        : (e?.message || 'No se pudo cambiar la contraseña');
      this.present(msg, 'danger');
    } finally {
      this.changing = false;
    }
  }

  // ===== Navegación =====
  async goBack() { await this.navigateToProfileByRole(); }
  async goHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goExplore()   { this.activeTab = 'explore';   await this.safeNavigate('/products'); }
  async goFavorites() { this.activeTab = 'favorites'; await this.safeNavigate('/favorites'); }
  async goProfile()   { this.activeTab = 'profile';   await this.navigateToProfileByRole(); }

  private async navigateToProfileByRole() {
    const user = this.auth.currentUser;
    if (!user) { await this.safeNavigate('/login'); return; }
    try {
      const snap = await getDoc(doc(this.fs, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      const target = role === 'admin' ? '/admin-panel' : '/profile';
      await this.safeNavigate(target);
    } catch {
      await this.safeNavigate('/profile');
    }
  }

  private async safeNavigate(target: string) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target) await this.router.navigate([target]);
  }

  private async present(message: string, color: 'primary'|'danger'='primary') {
    const t = await this.toast.create({ message, duration: 1800, color });
    await t.present();
  }

  // ===== Utilidad: limpiar caché efímera =====
  async clearCache() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      try { sessionStorage.clear(); } catch {}
      this.present('Caché de la aplicación limpiada');
    } catch {
      this.present('No se pudo limpiar la caché', 'danger');
    }
  }
}
