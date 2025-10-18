import { Component } from '@angular/core';
import {
  IonicModule,
  ToastController,
  AlertController,
  ActionSheetController,
  ModalController
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Firestore,
  collection,
  query,
  orderBy as fbOrderBy,
  limit,
  startAfter,
  getDocs,
  DocumentData,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc
} from '@angular/fire/firestore';
import { Auth, updateProfile } from '@angular/fire/auth';
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword as createUserTemp } from 'firebase/auth';

type UserDoc = {
  uid: string;
  fullName?: string;
  email: string;
  phone?: string;
  role?: 'admin' | 'user';
  createdAt?: string | number;
};

@Component({
  standalone: true,
  selector: 'app-admin-users',
  templateUrl: './admin-users-panel.page.html',
  styleUrls: ['./admin-users-panel.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AdminUsersPanelPage {
  users: UserDoc[] = [];
  search = '';
  orderBy: 'createdAt' | 'fullName' | 'email' = 'createdAt';

  pageSize = 20;
  lastDocSnap: any = null;
  hasMore = true;

  activeTab: 'search' | 'favorites' | 'profile' = 'profile';

  addUserModalOpen = false;
  showPassword = false;
  newUser = { name: '', email: '', phone: '', password: '' };

  // 🔹 Configuración Firebase principal (reusa tu config real)
  firebaseConfig = {
    apiKey: "AIzaSyBltot7EHGTlW6zxzLjRUWx6dEmoE5hKpw",
    authDomain: "petprice-99c09.firebaseapp.com",
    projectId: "petprice-99c09",
    storageBucket: "petprice-99c09.appspot.com",
    messagingSenderId: "524321882715",
    appId: "1:524321882715:android:94deaffcf98d9bc367f57e",
  };

  constructor(
    private fs: Firestore,
    private router: Router,
    private auth: Auth,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private actionSheetCtrl: ActionSheetController,
    private modalController: ModalController
  ) {}

  ionViewWillEnter() {
    this.activeTab = 'profile';
    this.reload();
  }

  // ===== Cargar usuarios =====
  async reload() {
    this.users = [];
    this.lastDocSnap = null;
    this.hasMore = true;
    await this.loadPage();
  }

  async loadPage() {
    const ref = collection(this.fs, 'users');
    let q = query(ref, fbOrderBy(this.orderBy, this.orderBy === 'createdAt' ? 'desc' : 'asc'), limit(this.pageSize));
    if (this.lastDocSnap) q = query(q, startAfter(this.lastDocSnap));
    const snap = await getDocs(q);

    let batch: UserDoc[] = snap.docs.map(d => ({ uid: d.id, ...(d.data() as DocumentData) })) as any;

    const s = this.search.trim().toLowerCase();
    batch = s
      ? batch.filter(u => (u.fullName || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s))
      : batch;

    const currentUid = this.auth.currentUser?.uid;
    batch = batch.filter(u => u.uid !== currentUid);

    this.users.push(...batch);
    if (snap.docs.length < this.pageSize) this.hasMore = false;
    this.lastDocSnap = snap.docs[snap.docs.length - 1] || null;
  }

  async loadMore(ev: any) {
    await this.loadPage();
    ev?.target?.complete();
  }

  async refresh(ev: any) {
    await this.reload();
    ev?.target?.complete();
  }

  onSearch() {
    this.reload();
  }

  // ========= Editar usuario =========
  async editUser(u: UserDoc) {
    const alert = await this.alertCtrl.create({
      header: 'Editar usuario',
      inputs: [
        { name: 'fullName', type: 'text', value: u.fullName || '', placeholder: 'Nombre completo' },
        { name: 'email', type: 'email', value: u.email, placeholder: 'Correo' },
        { name: 'phone', type: 'text', value: u.phone || '', placeholder: 'Teléfono' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (values: any) => {
            const payload = {
              fullName: (values.fullName ?? '').trim(),
              email: (values.email ?? '').trim(),
              phone: (values.phone ?? '').trim()
            };

            if (!payload.email || !payload.email.includes('@')) {
              this.presentToast('Correo inválido', 'danger');
              return false;
            }
            if (payload.phone && !/^\+?\d[\d\s-]{7,}$/.test(payload.phone)) {
              this.presentToast('Teléfono inválido', 'danger');
              return false;
            }

            try {
              await updateDoc(doc(this.fs, 'users', u.uid), payload);

              const idx = this.users.findIndex(x => x.uid === u.uid);
              if (idx >= 0) this.users[idx] = { ...this.users[idx], ...payload };

              this.presentToast('Usuario actualizado', 'primary');
              return true;
            } catch (e) {
              console.error(e);
              this.presentToast('No se pudo actualizar', 'danger');
              return false;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  // ========= Borrar usuario =========
  async confirmDeleteUser(u: UserDoc) {
    const currentUid = this.auth.currentUser?.uid;
    if (currentUid === u.uid) {
      this.presentToast('No puedes eliminar tu propia cuenta desde aquí.', 'danger');
      return;
    }

    const sheet = await this.actionSheetCtrl.create({
      header: `Eliminar a ${u.fullName || u.email}?`,
      subHeader: 'Esto eliminará su documento en Firestore. La cuenta de Auth NO se elimina.',
      buttons: [
        {
          text: 'Eliminar',
          icon: 'trash-outline',
          cssClass: 'delete-circle-btn',
          handler: async () => {
            try {
              await deleteDoc(doc(this.fs, 'users', u.uid));
              this.users = this.users.filter(x => x.uid !== u.uid);
              this.presentToast('Usuario eliminado (Firestore)', 'primary');
            } catch (e) {
              console.error(e);
              this.presentToast('No se pudo eliminar', 'danger');
            }
          }
        },
        { text: 'Cancelar', role: 'cancel', icon: 'close-outline' }
      ]
    });

    await sheet.present();
  }

  // ========= Agregar usuario =========
  openAddUserModal() {
    this.resetNewUser();
    this.addUserModalOpen = true;
  }

  closeAddUserModal() {
    this.addUserModalOpen = false;
    this.resetNewUser();
  }

  private resetNewUser() {
    this.newUser = { name: '', email: '', phone: '', password: '' };
    this.showPassword = false;
  }

  async addUser() {
    const { name, email, phone, password } = this.newUser;

    if (!name || !email || !phone || !password) {
      this.presentToast('Completa todos los campos', 'danger');
      return;
    }

    try {
      // 🔹 Crear usuario en app temporal para no afectar la sesión actual
      const tempAppName = 'TempApp';
      let tempApp: FirebaseApp;
      if (!getApps().some(a => a.name === tempAppName)) {
        tempApp = initializeApp(this.firebaseConfig, tempAppName);
      } else {
        tempApp = getApps().find(a => a.name === tempAppName)!;
      }
      const tempAuth = getAuth(tempApp);

      const userCred = await createUserTemp(tempAuth, email, password);
      const uid = userCred.user.uid;

      // Guardar en Firestore
      await setDoc(doc(this.fs, `users/${uid}`), {
        uid,
        fullName: name,
        email,
        phone,
        role: 'user',
        createdAt: new Date().toISOString()
      });

      this.presentToast('Usuario agregado con éxito', 'primary');
      this.closeAddUserModal();
      await this.reload();

      // 🔹 Borrar app temporal
      deleteApp(tempApp);

    } catch (err: any) {
      console.error(err);
      this.presentToast(err.message || 'Error al agregar usuario', 'danger');
    }
  }

  // ========= Navegación footer =========
  async goToProducts() {
    await this.router.navigate(['/products']);
  }

  async goToFavorites() {
    await this.router.navigate(['/favorites']);
  }

  async goToProfile() {
    const user = this.auth.currentUser;
    if (!user) {
      await this.router.navigate(['/login']);
      return;
    }
    const snap = await getDoc(doc(this.fs, 'users', user.uid));
    const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
    const target = role === 'admin' ? '/admin-panel' : '/profile';
    await this.router.navigate([target]);
  }

  // ========= Utils =========
  private async presentToast(message: string, color: 'primary' | 'danger' | 'success' = 'primary') {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color });
    await toast.present();
  }
}
