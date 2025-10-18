import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { Auth, updateEmail, updatePassword, onAuthStateChanged } from '@angular/fire/auth';
import { UserService } from 'src/app/services/User.Service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ProfilePage implements OnInit {
  fullName: string = '';
  email: string = '';
  phone: string = '';
  password: string = '';
  uid: string | null = null;

  editing = false;
  showPassword = false;

  // Footer activo
  activeTab: 'search' | 'favorites' | 'profile' = 'profile';

  constructor(
    private userService: UserService,
    private auth: Auth,
    private firestore: Firestore,
    private toastCtrl: ToastController,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.uid = user.uid;
        this.email = user.email || '';
        this.loadUserData();
      } else {
        this.showToast('Debes iniciar sesión para ver tu perfil');
        this.router.navigate(['/login']);
      }
    });
  }

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

  async loadUserData() {
    if (!this.uid) return;
    try {
      const userRef = doc(this.firestore, 'users', this.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data() as any;
        this.fullName = data.fullName || '';
        this.phone = data.phone || '';
      }
    } catch (error) {
      console.error(error);
      this.showToast('Error al cargar datos del usuario');
    }
  }

  enableEditing() {
    this.editing = true;
    this.showPassword = true;
    this.password = '';
  }

  async saveChanges() {
    if (!this.uid) return;
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      if (user.email !== this.email) {
        await updateEmail(user, this.email);
      }
      if (this.password) {
        await updatePassword(user, this.password);
      }

      const userRef = doc(this.firestore, 'users', this.uid);
      await updateDoc(userRef, {
        fullName: this.fullName,
        phone: this.phone,
        email: this.email,
      });

      this.editing = false;
      this.showPassword = false;
      this.password = '';
      this.showToast('Datos actualizados correctamente');
    } catch (error: any) {
      console.error(error);
      this.showToast(error.message || 'Error al guardar cambios');
    }
  }

  cancelChanges() {
    this.editing = false;
    this.showPassword = false;
    this.password = '';
    this.loadUserData();
  }

  async logout() {
    try {
      await this.auth.signOut();
      this.router.navigate(['/login']);
      this.showToast('Sesión cerrada correctamente');
    } catch (error) {
      console.error(error);
      this.showToast('Error al cerrar sesión');
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color: 'primary',
    });
    await toast.present();
  }

  // ===== Navegación del footer (unificada por rol) =====
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

  async goToProfile() {
    await this.navigateToProfileByRole();
  }

  goToHome() {
    // compat: si tu template aún llama goToHome()
    this.goToProducts();
  }

  private async navigateToProfileByRole() {
    const user = this.auth.currentUser;
    if (!user) {
      await this.router.navigate(['/login']);
      return;
    }

    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      const target = role === 'admin' ? '/admin-panel' : '/profile';

      const current = this.router.url.split('?')[0].split('#')[0];
      if (current !== target) {
        await this.router.navigate([target]);
      }
      this.activeTab = 'profile';
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error obteniendo rol del usuario:', error);
      // Fallback seguro
      await this.router.navigate(['/profile']);
    }
  }
}
