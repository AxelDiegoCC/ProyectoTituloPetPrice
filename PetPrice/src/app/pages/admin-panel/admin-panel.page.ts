import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.page.html',
  styleUrls: ['./admin-panel.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AdminPanelPage {
  activeTab: 'search' | 'favorites' | 'profile' = 'profile';

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private auth: Auth,
    private firestore: Firestore,
    private toastCtrl: ToastController
  ) {}

  ionViewWillEnter() {
    this.activeTab = this.detectSectionFromUrl(this.router.url);
    this.cdr.detectChanges();
  }

  private detectSectionFromUrl(url: string): 'search' | 'favorites' | 'profile' {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    const segs = clean.split('/').filter(Boolean);
    const business = segs.find(s =>
      s === 'products' || s === 'favorites' || s === 'profile' || s === 'admin-panel'
    );
    if (business === 'favorites') return 'favorites';
    if (business === 'profile' || business === 'admin-panel') return 'profile';
    return 'search';
  }

  // ===== Verificación de rol =====
  private async isAdmin(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;
    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      return role === 'admin';
    } catch {
      return false;
    }
  }

  // ===== Acciones de la sección "Área de Gestión" =====
  async goManageUsers() {
    if (await this.isAdmin()) {
      await this.router.navigate(['/admin-users-panel']);
    } else {
      this.presentMsg('No tienes permisos para gestionar usuarios', 'danger');
    }
  }

  async goManageProducts() {
    if (await this.isAdmin()) {
      await this.router.navigate(['/admin-products-panel']);
    } else {
      this.presentMsg('No tienes permisos para gestionar productos', 'danger');
    }
  }

  // ===== Footer nav =====
  async goToProducts() {
    this.activeTab = 'search';
    await this.router.navigate(['/products']);
    this.cdr.detectChanges();
  }

  async goToFavorites() {
    this.activeTab = 'favorites';
    await this.router.navigate(['/favorites']);
    this.cdr.detectChanges();
  }

  async goToProfile()  {
    await this.navigateToProfileByRole();
  }

  private async navigateToProfileByRole() {
    const user = this.auth.currentUser;
    if (!user) { await this.router.navigate(['/login']); return; }
    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      const target = role === 'admin' ? '/admin-panel' : '/profile';
      const current = this.router.url.split('?')[0].split('#')[0];
      if (current !== target) await this.router.navigate([target]);
      this.activeTab = 'profile';
      this.cdr.detectChanges();
    } catch {
      await this.router.navigate(['/profile']);
    }
  }

  // ===== Cerrar sesión =====
  async logout() {
    try {
      await this.auth.signOut();
      await this.presentMsg('Sesión cerrada correctamente', 'primary');
      await this.router.navigate(['/login']);
    } catch (e) {
      await this.presentMsg('Error al cerrar sesión', 'danger');
    }
  }

  private async presentMsg(message: string, color: 'primary' | 'danger' | 'success' = 'primary') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }
}
