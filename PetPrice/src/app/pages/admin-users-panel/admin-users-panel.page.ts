import { Component } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  Firestore, collection, query, orderBy as fbOrderBy, limit, startAfter, getDocs,
  DocumentData, doc, getDoc, updateDoc, deleteDoc, setDoc, getCountFromServer
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

import { initializeApp, FirebaseApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword as createUserTemp } from 'firebase/auth';

type UserDoc = {
  uid: string;
  fullName?: string;
  email: string;
  phone?: string;
  role?: 'admin' | 'user';
  createdAt?: string | number;
};

type ModalKind = 'create' | 'edit' | 'delete' | null;
type Tab = 'home' | 'explore' | 'favorites' | 'profile';

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

  activeTab: Tab = 'explore';

  modal: ModalKind = null;
  selectedUser: UserDoc | null = null;

  createForm = { name: '', email: '', phone: '', password: '' };
  editForm   = { id: '', name: '', email: '', phone: '' };

  creating = false;
  saving   = false;
  deleting = false;

  totalLabel = 'Cargando...';
  orderLabel = 'Recientes';

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
  ) {}

  async ionViewWillEnter() {
    this.activeTab = 'profile';
    await this.reload();
    await this.updateTotalLabel();
  }

  private async updateTotalLabel() {
    try {
      const cnt = await getCountFromServer(collection(this.fs, 'users'));
      const n = cnt.data().count || 0;
      this.totalLabel = `${n} usuario${n === 1 ? '' : 's'} registrado${n === 1 ? '' : 's'}`;
    } catch {
      this.totalLabel = `${this.users.length} usuarios listados`;
    }
  }

  cycleOrder() {
    this.orderBy = this.orderBy === 'createdAt' ? 'fullName' :
                   this.orderBy === 'fullName'  ? 'email' : 'createdAt';
    this.orderLabel = this.orderBy === 'createdAt' ? 'Recientes' :
                      this.orderBy === 'fullName'  ? 'Nombre'    : 'Correo';
    this.reload();
  }

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
    await this.updateTotalLabel();
    ev?.target?.complete();
  }

  private searchTimer?: any;
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 150);
  }

  openCreate() {
    this.modal = 'create';
    this.creating = false;
    this.createForm = { name: '', email: '', phone: '', password: '' };
  }

  openEdit(u: UserDoc) {
    this.modal = 'edit';
    this.selectedUser = u;
    this.saving = false;
    this.editForm = { id: u.uid, name: u.fullName || '', email: u.email, phone: u.phone || '' };
  }

  openDelete(u: UserDoc) {
    if (this.auth.currentUser?.uid === u.uid) {
      this.presentToast('No puedes eliminar tu propia cuenta desde aquí.', 'danger');
      return;
    }
    this.modal = 'delete';
    this.selectedUser = u;
    this.deleting = false;
  }

  closeModals() {
    this.modal = null;
    this.selectedUser = null;
  }

  async createUser() {
    const { name, email, phone, password } = this.createForm;
    if (!name || !email || !password) {
      this.presentToast('Completa nombre, correo y contraseña', 'danger'); return;
    }
    try {
      this.creating = true;

      const tempAppName = 'TempApp';
      let tempApp: FirebaseApp;
      if (!getApps().some(a => a.name === tempAppName)) {
        tempApp = initializeApp(this.firebaseConfig, tempAppName);
      } else {
        tempApp = getApps().find(a => a.name === tempAppName)!;
      }
      const tempAuth = getAuth(tempApp);

      const cred = await createUserTemp(tempAuth, email.trim(), password);
      const uid = cred.user.uid;

      await setDoc(doc(this.fs, `users/${uid}`), {
        uid,
        fullName: name.trim(),
        email: email.trim(),
        phone: (phone || '').trim(),
        role: 'user',
        createdAt: new Date().toISOString()
      });

      this.presentToast('Usuario agregado con éxito', 'success');
      this.closeModals();
      await this.reload();
      await this.updateTotalLabel();
      await deleteApp(tempApp);
    } catch (err: any) {
      console.error(err);
      this.presentToast(err?.message || 'Error al agregar usuario', 'danger');
    } finally {
      this.creating = false;
    }
  }

  async updateUser() {
    if (!this.editForm.id) return;
    try {
      this.saving = true;
      const payload = {
        fullName: (this.editForm.name || '').trim(),
        email: (this.editForm.email || '').trim(),
        phone: (this.editForm.phone || '').trim()
      };
      await updateDoc(doc(this.fs, 'users', this.editForm.id), payload);

      const i = this.users.findIndex(u => u.uid === this.editForm.id);
      if (i >= 0) this.users[i] = { ...this.users[i], ...payload };

      this.presentToast('Cambios guardados', 'primary');
      this.closeModals();
    } catch (e) {
      console.error(e);
      this.presentToast('No se pudo actualizar', 'danger');
    } finally {
      this.saving = false;
    }
  }

  async confirmDelete() {
    if (!this.selectedUser) return;
    try {
      this.deleting = true;
      await deleteDoc(doc(this.fs, 'users', this.selectedUser.uid));
      this.users = this.users.filter(x => x.uid !== this.selectedUser!.uid);
      this.presentToast('Usuario eliminado', 'primary');
      this.closeModals();
      await this.updateTotalLabel();
    } catch (e) {
      console.error(e);
      this.presentToast('No se pudo eliminar', 'danger');
    } finally {
      this.deleting = false;
    }
  }

  avatarFor(_u: UserDoc) { return 'assets/img/foto-perfil.png'; }

  sinceLabel(createdAt?: string | number) {
    if (!createdAt) return '—';
    const d = new Date(createdAt);
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ===== Navegación header/footer =====
  async goBack() {
    // Volver siempre al panel de administrador
    this.activeTab = 'profile';
    await this.safeNavigate('/admin-panel');
  }

  async goToHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goToExplore()   { this.activeTab = 'explore';   await this.safeNavigate('/products'); }
  async goToFavorites() { this.activeTab = 'favorites'; await this.safeNavigate('/favorites'); }
  async goToProfile() {
    const user = this.auth.currentUser;
    if (!user) { this.activeTab = 'profile'; await this.safeNavigate('/login'); return; }
    const snap = await getDoc(doc(this.fs, 'users', user.uid));
    const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
    this.activeTab = 'profile';
    await this.safeNavigate(role === 'admin' ? '/admin-panel' : '/profile');
  }

  private async safeNavigate(target: string) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target) {
      await this.router.navigate([target]);
    }
  }

  private async presentToast(message: string, color: 'primary' | 'danger' | 'success' = 'primary') {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color });
    await toast.present();
  }
}
