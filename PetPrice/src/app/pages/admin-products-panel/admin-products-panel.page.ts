import { Component } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, DocumentData, Firestore, getCountFromServer, getDoc, getDocs, setDoc, updateDoc } from '@angular/fire/firestore';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';

type ModalKind = 'create' | 'edit' | 'delete' | null;
type Categoria = 'Perro' | 'Gato' | '';

@Component({
  standalone: true,
  selector: 'app-admin-products',
  templateUrl: './admin-products-panel.page.html',
  styleUrls: ['./admin-products-panel.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AdminProductsPanelPage {
  products: any[] = [];
  allProducts: any[] = [];
  search = '';
  orderBy: 'last_updated' | 'nombre' | 'marca' = 'last_updated';
  orderLabel = 'Recientes';

  pageSize = 30;
  lastDocSnap: any = null;
  hasMore = true;

  // Footer
  activeTab: 'home' | 'explore' | 'favorites' | 'profile' = 'profile';

  // Modal state y flags
  modal: ModalKind = null;
  creating = false;
  saving = false;
  deleting = false;

  // Forms
  createForm = {
    nombre: '',
    marca: '',
    categoria: '' as Categoria,
    descripcion: '',
    imagen: '',
    tiendas: [{ nombre: '', url: '', precio: null as number | null }]
  };

  editForm = {
    id: '',
    nombre: '',
    marca: '',
    categoria: '' as Categoria,
    descripcion: '',
    imagen: '',
    tiendas: [{ nombre: '', url: '', precio: null as number | null }]
  };

  selectedProduct: any = null;

  totalLabel = 'Cargando…';
  placeholder = 'assets/img/placeholder.png';

  constructor(
    private fs: Firestore,
    private toastCtrl: ToastController,
    private router: Router,
    private auth: Auth,
  ) {}

  async ionViewWillEnter() {
    this.activeTab = 'profile';
    await this.reload();
    await this.updateTotalLabel();
  }

  // ===== Totales =====
  private async updateTotalLabel() {
    try {
      const cnt = await getCountFromServer(collection(this.fs, 'products'));
      const n = cnt.data().count || 0;
      this.totalLabel = `${n} producto${n === 1 ? '' : 's'} registrado${n === 1 ? '' : 's'}`;
    } catch {
      this.totalLabel = `${this.products.length} productos listados`;
    }
  }

  // ===== Orden cíclico =====
  cycleOrder() {
    this.orderBy = this.orderBy === 'last_updated' ? 'nombre' :
                   this.orderBy === 'nombre' ? 'marca' : 'last_updated';
    this.orderLabel = this.orderBy === 'last_updated' ? 'Recientes' :
                      this.orderBy === 'nombre' ? 'Nombre' : 'Marca';
    this.reload();
  }

  // ===== Carga y búsqueda =====
  async reload() {
    this.products = [];
    this.allProducts = [];
    this.lastDocSnap = null;
    this.hasMore = true;

    const ref = collection(this.fs, 'products');
    const snap = await getDocs(ref);
    let batch: any[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) }));
    batch = batch.map(p => this.withMinPrice(p));
    this.allProducts = this.sortList(batch);
    this.applySearch();
  }

  private sortList(list: any[]) {
    if (this.orderBy === 'last_updated') {
      return [...list].sort((a,b) => (new Date(b.last_updated || 0).getTime()) - (new Date(a.last_updated || 0).getTime()));
    }
    return [...list].sort((a,b) => (''+(a[this.orderBy]||'')).localeCompare((''+(b[this.orderBy]||''))));
  }

  private withMinPrice(p: any) {
    let minPrecio = Number(p.precio_minimo ?? 0);
    let tiendaBarata = p.tienda_mas_barata || '';
    if (p.precios) {
      minPrecio = Infinity; tiendaBarata = '';
      for (const t in p.precios) {
        const val = Number(p.precios[t]?.precio ?? Infinity);
        if (val < minPrecio) { minPrecio = val; tiendaBarata = t; }
      }
      if (minPrecio === Infinity) minPrecio = 0;
    }
    return { ...p, precio_minimo: minPrecio, tienda_mas_barata: tiendaBarata };
  }

  applySearch() {
    const s = this.search.trim().toLowerCase();
    const base = this.sortList(this.allProducts);
    this.products = !s ? base : base.filter(p =>
      (p.nombre || '').toLowerCase().includes(s) ||
      (p.marca  || '').toLowerCase().includes(s)
    );
  }
  private searchTimer?: any;
  onSearch() { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(()=>this.applySearch(), 140); }

  async refresh(ev: any) { await this.reload(); await this.updateTotalLabel(); ev?.target?.complete(); }
  async loadMore(ev: any) { ev?.target?.complete(); this.hasMore = false; }

  // ===== Modales =====
  openCreate() {
    this.modal = 'create';
    this.creating = false;
    this.createForm = {
      nombre: '',
      marca: '',
      categoria: '' as Categoria,
      descripcion: '',
      imagen: '',
      tiendas: [{ nombre: '', url: '', precio: null }]
    };
  }

  openEdit(p: any) {
    const withMin = this.withMinPrice(p);
    this.selectedProduct = withMin;
    this.modal = 'edit';
    this.saving = false;

    const tiendas: any[] = [];
    if (withMin.precios) {
      for (const t in withMin.precios) {
        tiendas.push({
          nombre: t,
          precio: Number(withMin.precios[t]?.precio ?? null),
          url: withMin.precios[t]?.url || ''
        });
      }
    }
    if (tiendas.length === 0) {
      tiendas.push({ nombre: '', url: '', precio: null });
    }

    this.editForm = {
      id: withMin.id,
      nombre: withMin.nombre || '',
      marca: withMin.marca || '',
      categoria: (withMin.categoria as Categoria) || '' as Categoria,
      descripcion: withMin.descripcion || '',
      imagen: withMin.imagen || '',
      tiendas
    };
  }

  openDelete(p: any) { this.modal = 'delete'; this.selectedProduct = p; this.deleting = false; }

  closeModals(force = false) {
    if (!force && (this.creating || this.saving || this.deleting)) return;
    this.modal = null;
    this.selectedProduct = null;
  }

  // ===== Chips categoría =====
  setCategory(form: 'create' | 'edit', value: Categoria) {
    (this as any)[form + 'Form'].categoria = value;
  }

  // ===== Crear =====
  async createProduct() {
    const { nombre, marca, categoria, descripcion, imagen, tiendas } = this.createForm;

    if (!nombre?.trim() || !marca?.trim()) {
      this.present('Completa nombre y marca', 'danger'); return;
    }
    if (!categoria) {
      this.present('Selecciona la categoría (Perro o Gato)', 'danger'); return;
    }
    if (tiendas.some(t => !t.nombre?.trim() || t.precio === null || t.precio === undefined)) {
      this.present('Completa precios y nombre de tiendas', 'danger'); return;
    }

    try {
      this.creating = true;

      const precios: any = {};
      for (const t of tiendas) {
        precios[t.nombre.trim()] = {
          precio: Number(t.precio),
          url: (t.url || '').trim()
        };
      }

      let min = Infinity, barata = '';
      for (const k in precios) {
        if (precios[k].precio < min) { min = precios[k].precio; barata = k; }
      }
      if (!isFinite(min)) min = 0;

      const data = {
        nombre: nombre.trim(),
        marca: marca.trim(),
        categoria,
        descripcion: (descripcion || '').trim(),
        imagen: (imagen || '').trim(),
        precios,
        precio_minimo: min,
        tienda_mas_barata: barata,
        last_updated: new Date().toISOString()
      };

      const newRef = doc(collection(this.fs, 'products'));
      await setDoc(newRef, data);

      const historicoRef = collection(newRef, 'historico_precios');
      await addDoc(historicoRef, {
        fecha: new Date().toISOString(),
        precio_minimo: min
      });

      this.present('Producto agregado', 'primary');
      this.closeModals(true);
      await this.reload();
      await this.updateTotalLabel();

    } catch (e: any) {
      console.error('ERROR REAL:', e);
      this.present(`Error al guardar: ${e?.message || e}`, 'danger');
    } finally {
      this.creating = false;
    }
  }

  // ===== Actualizar =====
  async updateProduct() {
    if (!this.editForm.id) return;

    const { nombre, marca, categoria, descripcion, imagen, tiendas } = this.editForm;

    if (!nombre?.trim() || !marca?.trim()) {
      this.present('Completa nombre y marca', 'danger'); return;
    }
    if (!categoria) {
      this.present('Selecciona la categoría (Perro o Gato)', 'danger'); return;
    }
    if (tiendas.some(t => !t.nombre?.trim() || t.precio === null || t.precio === undefined)) {
      this.present('Completa precios y nombre de tiendas', 'danger'); return;
    }

    try {
      this.saving = true;

      const productRef = doc(this.fs, 'products', this.editForm.id);

      // Obtener precio anterior
      const snapshot = await getDoc(productRef);
      const oldData = snapshot.data();
      const oldPrice = oldData?.['precio_minimo'] ?? null;

      // Array -> objeto precios
      const precios: any = {};
      for (const t of tiendas) {
        precios[t.nombre.trim()] = {
          precio: Number(t.precio),
          url: (t.url || '').trim()
        };
      }

      // Calcular mínimo
      let min = Infinity, barata = '';
      for (const k in precios) {
        if (precios[k].precio < min) { min = precios[k].precio; barata = k; }
      }
      if (!isFinite(min)) min = 0;

      const data = {
        nombre: nombre.trim(),
        marca: marca.trim(),
        categoria,
        descripcion: (descripcion || '').trim(),
        imagen: (imagen || '').trim(),
        precios,
        precio_minimo: min,
        tienda_mas_barata: barata,
        last_updated: new Date().toISOString()
      };

      await updateDoc(productRef, data);

      // Guardar histórico si cambió
      if (oldPrice !== min) {
        const historicoRef = collection(productRef, 'historico_precios');
        await addDoc(historicoRef, {
          fecha: new Date().toISOString(),
          precio_minimo: min
        });
      }

      this.present('Producto actualizado', 'primary');
      this.closeModals(true);
      await this.reload();

    } catch (e: any) {
      console.error(e);
      this.present(`Error al actualizar: ${e?.message || e}`, 'danger');
    } finally {
      this.saving = false;
    }
  }

  // ===== Eliminar =====
  async confirmDelete() {
    if (!this.selectedProduct?.id) return;
    try {
      this.deleting = true;
      await deleteDoc(doc(this.fs, 'products', this.selectedProduct.id));
      this.products = this.products.filter(x => x.id !== this.selectedProduct.id);

      await this.present('Producto eliminado', 'primary');

      this.deleting = false;
      this.closeModals(true);

      await this.updateTotalLabel();
    } catch (e) {
      console.error(e);
      this.present('No se pudo eliminar', 'danger');
    } finally {
      this.deleting = false;
    }
  }

  // ===== Nav =====
  goBack() { this.router.navigate(['/admin-panel']); }

  async goToHome()      { this.activeTab = 'home';      await this.router.navigate(['/home']); }
  async goToExplore()   { this.activeTab = 'explore';   await this.router.navigate(['/products']); }
  async goToFavorites() { this.activeTab = 'favorites'; await this.router.navigate(['/favorites']); }

  async goToProfile() {
    const user = this.auth.currentUser;
    this.activeTab = 'profile';
    if (!user) { await this.router.navigate(['/login']); return; }
    const snap = await getDoc(doc(this.fs, 'users', user.uid));
    const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
    await this.router.navigate([role === 'admin' ? '/admin-panel' : '/profile'] );
  }

  // ===== Toast =====
  private async present(message: string, color: 'primary'|'danger'|'success'='primary') {
    const t = await this.toastCtrl.create({ message, duration: 2200, color });
    await t.present();
  }

  addStore(form: 'create' | 'edit') {
    (this as any)[form + 'Form'].tiendas.push({ nombre: '', url: '', precio: null });
  }

  removeStore(form: 'create' | 'edit', index: number) {
    (this as any)[form + 'Form'].tiendas.splice(index, 1);
  }
}
