import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, doc, getDoc, updateDoc, collection, CollectionReference } from '@angular/fire/firestore';
import { Auth, updateEmail, onAuthStateChanged } from '@angular/fire/auth';
import { collectionData } from '@angular/fire/firestore';

type Tab = 'home' | 'explore' | 'favorites' | 'profile';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ProfilePage implements OnInit {
  // Datos de usuario
  uid: string | null = null;
  fullName: string = '';
  email: string = '';
  phone: string = '';
  photoUrl: string | null = null;
  memberSince: string | null = null;

  // UI estado
  editing = false;

  // Footer
  activeTab: Tab = 'profile';

  // Favoritos
  favoritesCount = 0;
  private favsCol?: CollectionReference;
  private favSub?: any;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private toastCtrl: ToastController,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        this.uid = user.uid;
        this.email = user.email || '';
        this.photoUrl = user.photoURL || null;
        await this.loadUserData();
        this.bindFavoritesCount();
      } else {
        this.showToast('Debes iniciar sesión para ver tu perfil');
        this.safeNavigate('/login');
      }
    });
  }

  ionViewWillEnter() {
    this.activeTab = this.detectSectionFromUrl(this.router.url);
    this.cdr.detectChanges();
  }

  ionViewDidLeave() {
    this.favSub?.unsubscribe?.();
    this.favSub = null;
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

  private async loadUserData() {
    if (!this.uid) return;
    try {
      const userRef = doc(this.firestore, 'users', this.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data() as any;
        this.fullName = data.fullName || '';
        this.phone = data.phone || '';
        const createdAt: string | Date | undefined = data.createdAt;
        this.memberSince = this.formatMemberSince(createdAt);
      }
      this.cdr.detectChanges();
    } catch (error) {
      console.error(error);
      this.showToast('Error al cargar datos del usuario');
    }
  }

  private formatMemberSince(createdAt?: string | Date): string | null {
    if (!createdAt) return null;
    try {
      const d = new Date(createdAt);
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      return `${meses[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return null;
    }
  }

  private bindFavoritesCount() {
    if (!this.uid) return;
    try {
      const path = `users/${this.uid}/favorites`;
      this.favsCol = (collection(this.firestore, path) as CollectionReference);
      this.favSub?.unsubscribe?.();
      this.favSub = collectionData(this.favsCol, { idField: 'id' }).subscribe(items => {
        this.favoritesCount = (items || []).length;
        this.cdr.detectChanges();
      });
    } catch (e) {
      console.warn('No se pudo suscribir a favoritos:', e);
      this.favoritesCount = 0;
    }
  }

  enableEditing() { this.editing = true; }

  async saveChanges() {
    if (!this.uid) return;
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      if (this.email && user.email !== this.email) {
        await updateEmail(user, this.email);
      }
      const userRef = doc(this.firestore, 'users', this.uid);
      await updateDoc(userRef, {
        fullName: this.fullName || '',
        phone: this.phone || '',
        email: this.email || ''
      });

      this.editing = false;
      this.showToast('Datos actualizados correctamente');
      this.cdr.detectChanges();
    } catch (error: any) {
      console.error(error);
      const msg =
        error?.code === 'auth/requires-recent-login'
          ? 'Por seguridad, vuelve a iniciar sesión para actualizar estos datos.'
          : (error?.message || 'Error al guardar cambios');
      this.showToast(msg);
    }
  }

  cancelChanges() { this.editing = false; this.loadUserData(); }

  async logout() {
    try {
      await this.auth.signOut();
      this.safeNavigate('/login');
      this.showToast('Sesión cerrada correctamente');
    } catch (error) {
      console.error(error);
      this.showToast('Error al cerrar sesión');
    }
  }

  goToSettings() { this.safeNavigate('/configurations'); }

  // ===== Tabs Nav (rutas correctas) =====
  async goToHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goToExplore()   { this.activeTab = 'explore';   await this.safeNavigate('/products'); }
  async goToFavorites() { this.activeTab = 'favorites'; await this.safeNavigate('/favorites'); }
  async goToProfile()   { this.activeTab = 'profile';   await this.safeNavigate('/profile'); }

  private async safeNavigate(target: string) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target) {
      await this.router.navigate([target]);
    }
    this.cdr.detectChanges();
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color: 'primary',
    });
    await toast.present();
  }
}
