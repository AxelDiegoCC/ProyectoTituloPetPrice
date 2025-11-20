import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, doc, getDoc, collection, getCountFromServer } from '@angular/fire/firestore';

type Tab = 'home' | 'explore' | 'favorites' | 'profile';

@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.page.html',
  styleUrls: ['./admin-panel.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AdminPanelPage implements OnInit {
  activeTab: Tab = 'profile';

  // Perfil
  email: string | null = null;
  displayName: string | null = null;
  photoUrl: string | null = null;
  role: 'admin' | 'user' | string = 'user';

  // KPIs
  kpiProducts = 0;
  kpiUsers = 0;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private auth: Auth,
    private firestore: Firestore,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        await this.presentMsg('Debes iniciar sesión', 'danger');
        await this.router.navigate(['/login']);
        return;
      }
      this.email = user.email;
      this.displayName = user.displayName || 'Administrador';
      this.photoUrl = user.photoURL || null;

      // Rol
      try {
        const snap = await getDoc(doc(this.firestore, 'users', user.uid));
        this.role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      } catch { this.role = 'user'; }

      if (this.role !== 'admin') {
        await this.presentMsg('No tienes permisos para ver el panel de admin', 'danger');
        await this.router.navigate(['/profile']);
        return;
      }

      this.loadKPIs();
      this.cdr.detectChanges();
    });
  }

  ionViewWillEnter() {
    this.activeTab = this.detectSectionFromUrl(this.router.url);
    this.cdr.detectChanges();
  }

  private detectSectionFromUrl(url: string): Tab {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    const segs = clean.split('/').filter(Boolean);
    const business = segs.find(s =>
      s === 'products' || s === 'favorites' || s === 'profile' || s === 'admin-panel' || s === 'home'
    );
    if (business === 'favorites') return 'favorites';
    if (business === 'profile' || business === 'admin-panel') return 'profile';
    if (business === 'home') return 'home';
    return 'explore';
  }

  // ===== Acciones Area de Gestión =====
  private async isAdmin(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;
    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      return role === 'admin';
    } catch { return false; }
  }

  async goManageUsers()    { (await this.isAdmin()) ? this.router.navigate(['/admin-users-panel'])    : this.presentMsg('No tienes permisos para gestionar usuarios', 'danger'); }
  async goManageProducts() { (await this.isAdmin()) ? this.router.navigate(['/admin-products-panel']) : this.presentMsg('No tienes permisos para gestionar productos', 'danger'); }
  goSystemSettings()       { this.router.navigate(['/configurations']); }

  // ===== KPIs =====
  private async loadKPIs() {
    try {
      const prodCount = await getCountFromServer(collection(this.firestore, 'products'));
      const userCount = await getCountFromServer(collection(this.firestore, 'users'));
      this.kpiProducts = prodCount.data().count || 0;
      this.kpiUsers = userCount.data().count || 0;
    } catch {
      this.kpiProducts = 0;
      this.kpiUsers = 0;
    }
  }

  // ===== Footer nav (rutas correctas) =====
  async goToHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goToExplore()   { this.activeTab = 'explore';   await this.safeNavigate('/products'); } // explore -> /products
  async goToFavorites() { this.activeTab = 'favorites'; await this.safeNavigate('/favorites'); }
  async goToProfile()   { await this.navigateToProfileByRole(); }

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

  async logout() {
    try {
      await this.auth.signOut();
      await this.presentMsg('Sesión cerrada correctamente', 'primary');
      await this.router.navigate(['/login']);
    } catch { await this.presentMsg('Error al cerrar sesión', 'danger'); }
  }

  private async presentMsg(message: string, color: 'primary' | 'danger' | 'success' = 'primary') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }

  private async safeNavigate(target: string) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target) await this.router.navigate([target]);
    this.cdr.detectChanges();
  }
}
