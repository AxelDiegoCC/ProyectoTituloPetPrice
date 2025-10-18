import { Component } from '@angular/core';
import { Firestore, collection, query, orderBy as fbOrderBy, limit, startAfter, getDocs, doc, updateDoc, deleteDoc, setDoc, DocumentData, getDoc} from '@angular/fire/firestore';
import { IonicModule, ToastController, AlertController, ModalController, ActionSheetController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, updateProfile } from '@angular/fire/auth';

@Component({
  standalone: true,
  selector: 'app-admin-products',
  templateUrl: './admin-products-panel.page.html',
  styleUrls: ['./admin-products-panel.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AdminProductsPanelPage {
  products: any[] = [];
  allProducts: any[] = []; // Mantener lista completa para búsqueda
  search = '';
  pageSize = 20;
  lastDocSnap: any = null;
  hasMore = true;
  activeTab: 'search' | 'favorites' | 'profile' = 'profile';
  // Modal agregar producto
  productModalOpen = false;
  editingProductModal = false;
  currentProduct: any = {};

  constructor(
    private fs: Firestore,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController,
    private actionSheetCtrl: ActionSheetController,
    private router: Router,
    private auth: Auth,

  ) {}

  ionViewWillEnter() {
    this.activeTab = 'profile';
    this.reload();
    
  }

  // ===== Cargar productos =====
  async reload() {
    this.products = [];
    this.allProducts = [];
    this.lastDocSnap = null;
    this.hasMore = true;

    try {
      const ref = collection(this.fs, 'products');
      const snap = await getDocs(ref);

      let batch: any[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) }));

      // Calcular precio_minimo y tienda_mas_barata
      batch = batch.map(p => {
        let minPrecio = Infinity;
        let tiendaBarata = '';
        if (p.precios) {
          for (const tienda in p.precios) {
            const precio = Number(p.precios[tienda]?.precio ?? Infinity);
            if (precio < minPrecio) {
              minPrecio = precio;
              tiendaBarata = tienda;
            }
          }
        }
        return {
          ...p,
          precio_minimo: minPrecio === Infinity ? 0 : minPrecio,
          tienda_mas_barata: tiendaBarata
        };
      });

      this.allProducts = batch;
      this.applySearch();

    } catch (err: any) {
      console.error('Error cargando productos:', err);
      this.presentToast('Error cargando productos', 'danger');
    }
  }

  // ===== Filtrar productos por búsqueda =====
  applySearch() {
    const s = this.search.trim().toLowerCase();
    if (!s) {
      this.products = [...this.allProducts];
    } else {
      this.products = this.allProducts.filter(p => {
        const nombre = (p.nombre || '').trim().toLowerCase();
        const marca = (p.marca || '').trim().toLowerCase();
        return nombre.includes(s) || marca.includes(s);
      });
    }
  }

  onSearch() {
    this.applySearch();
  }

  // ===== Modal agregar producto =====
  openAddProductModal() {
    this.editingProductModal = false;
    this.currentProduct = {
      nombre: '',
      marca: '',
      precio_minimo: 0,
      descripcion: '',
      tienda_mas_barata: '',
      imagen: '',
      precios: {}
    };
    this.productModalOpen = true;
  }

  closeProductModal() {
    this.productModalOpen = false;
    this.currentProduct = {};
  }

  async saveProduct() {
    const { nombre, marca, descripcion, imagen, precio_minimo: precioInput } = this.currentProduct;
    const precio = Number(precioInput);

    if (!nombre || !marca || !precio || isNaN(precio)) {
      this.presentToast('Completa los campos obligatorios', 'danger');
      return;
    }

    try {
      const preciosMap: any = this.currentProduct.precios || {};
      const tienda = this.currentProduct.tienda_mas_barata || 'Tienda1';
      preciosMap[tienda] = { precio, url: this.currentProduct.url || '' };

      // Calcular precio mínimo y tienda más barata
      let minPrecio = Infinity;
      let tiendaBarata = '';
      for (const t in preciosMap) {
        const p = Number(preciosMap[t]?.precio ?? Infinity);
        if (p < minPrecio) {
          minPrecio = p;
          tiendaBarata = t;
        }
      }

      const data = {
        nombre,
        marca,
        descripcion: descripcion || '',
        imagen: imagen || '',
        precio_minimo: minPrecio,
        tienda_mas_barata: tiendaBarata,
        precios: preciosMap,
        last_updated: new Date().toISOString()
      };

      if (this.editingProductModal) {
        await updateDoc(doc(this.fs, 'products', this.currentProduct.id), data);
        this.presentToast('Producto actualizado', 'primary');
      } else {
        const newDocRef = doc(collection(this.fs, 'products'));
        await setDoc(newDocRef, data);
        this.presentToast('Producto agregado', 'primary');
      }

      this.closeProductModal();
      await this.reload();

    } catch (err: any) {
      console.error(err);
      this.presentToast(err.message || 'Error al guardar producto', 'danger');
    }
  }

  onPrecioChange(event: any) {
    const value = event.detail.value;
    this.currentProduct.precio_minimo = value !== null ? Number(value) : 0;
  }

  // ===== Editar producto con AlertController =====
  async editProduct(p: any) {
    const alert = await this.alertCtrl.create({
      header: 'Editar Producto',
      inputs: [
        { name: 'nombre', type: 'text', value: p.nombre || '', placeholder: 'Nombre' },
        { name: 'marca', type: 'text', value: p.marca || '', placeholder: 'Marca' },
        { name: 'descripcion', type: 'text', value: p.descripcion || '', placeholder: 'Descripción' },
        { name: 'imagen', type: 'text', value: p.imagen || '', placeholder: 'URL Imagen' },
        { name: 'precio', type: 'number', value: p.precio_minimo || 0, placeholder: 'Precio mínimo' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (values: any) => {
            const nombre = (values.nombre ?? '').trim();
            const marca = (values.marca ?? '').trim();
            const descripcion = (values.descripcion ?? '').trim();
            const imagen = (values.imagen ?? '').trim();
            const precio = Number(values.precio ?? 0);

            if (!nombre || !marca || !precio || isNaN(precio)) {
              this.presentToast('Completa los campos obligatorios', 'danger');
              return false;
            }

            try {
              const preciosMap: any = p.precios || {};
              const tienda = p.tienda_mas_barata || 'Tienda1';
              preciosMap[tienda] = { precio, url: p.precios?.[tienda]?.url || '' };

              // Calcular precio mínimo y tienda más barata
              let minPrecio = Infinity;
              let tiendaBarata = '';
              for (const t in preciosMap) {
                const pr = Number(preciosMap[t]?.precio ?? Infinity);
                if (pr < minPrecio) {
                  minPrecio = pr;
                  tiendaBarata = t;
                }
              }

              const data = {
                nombre,
                marca,
                descripcion,
                imagen,
                precio_minimo: minPrecio,
                tienda_mas_barata: tiendaBarata,
                precios: preciosMap,
                last_updated: new Date().toISOString()
              };

              await updateDoc(doc(this.fs, 'products', p.id), data);

              // Actualizar en lista local
              const idx = this.products.findIndex(x => x.id === p.id);
              if (idx >= 0) this.products[idx] = { ...this.products[idx], ...data };

              this.presentToast('Producto actualizado', 'primary');
              return true;
            } catch (err: any) {
              console.error(err);
              this.presentToast(err.message || 'Error al actualizar producto', 'danger');
              return false;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  // ===== Eliminar producto =====
  async confirmDeleteProduct(p: any) {
    const sheet = await this.actionSheetCtrl.create({
      header: `Eliminar "${p.nombre}"`,
      buttons: [
        {
          text: 'Eliminar',
          icon: 'trash-outline',
          handler: async () => {
            try {
              await deleteDoc(doc(this.fs, 'products', p.id));
              this.products = this.products.filter(x => x.id !== p.id);
              this.presentToast('Producto eliminado', 'primary');
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

  // ===== Utils =====
  private async presentToast(message: string, color: 'primary' | 'danger' = 'primary') {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color });
    await toast.present();
  }
}
