import { Component } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { ChangeDetectorRef } from '@angular/core';
import { doc, getDoc } from '@angular/fire/firestore';


@Component({
  selector: 'app-products',
  templateUrl: './products.page.html',
  styleUrls: ['./products.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ProductsPage {
  activeTab: 'search' | 'favorites' | 'profile' = 'search';
  products: any[] = [];
  filteredProducts: any[] = [];

  filtroCategoria: string | null = null;
  filtroMarca: string | null = null;
  filtroPrecio: 'asc' | 'desc' | null = null;
  searchTerm: string = '';

  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore,
    private cdr: ChangeDetectorRef,
    private popoverCtrl: PopoverController
  ) {}

  ionViewWillEnter() {
    this.activeTab = this.detectSectionFromUrl(this.router.url);
    this.loadProducts();
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

  async loadProducts() {
    try {
      const productsCol = collection(this.firestore, 'products');
      const productSnapshot = await getDocs(productsCol);

      this.products = productSnapshot.docs.map(doc => {
        const data: any = doc.data();
        const precioNumber = Number(data.precio_minimo) || 0; // 🔹 usar precio_minimo
        const precioFormateado = new Intl.NumberFormat('es-CL').format(precioNumber);

        return {
          id: doc.id,
          nombre: data.nombre || '',
          precio: precioFormateado,
          precioRaw: precioNumber,
          imagen: data.imagen || '',
          marca: (data.marca || '').toLowerCase(),
          categoria: (data.categoria || '').toLowerCase(),
          enlace: data.enlace || '',
          tienda_mas_barata: data.tienda_mas_barata || '',
        };
      });

      this.filteredProducts = [...this.products];
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  }

  async closePopover() {
    const popover = await this.popoverCtrl.getTop();
    if (popover) await popover.dismiss();
  }

  filtrarCategoria(event: any) {
    this.filtroCategoria = event.detail.value;
    this.aplicarFiltros();
    this.closePopover();
  }

  filtrarMarca(event: any) {
    this.filtroMarca = event.detail.value;
    this.aplicarFiltros();
    this.closePopover();
  }

  ordenar(criterio: string) {
    if (criterio === 'price_desc') {
      this.filtroPrecio = 'desc';
      this.filteredProducts.sort((a, b) => b.precioRaw - a.precioRaw);
    } else if (criterio === 'price_asc') {
      this.filtroPrecio = 'asc';
      this.filteredProducts.sort((a, b) => a.precioRaw - b.precioRaw);
    } else if (criterio === 'name_asc') {
      this.filteredProducts.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } else if (criterio === 'name_desc') {
      this.filteredProducts.sort((a, b) => b.nombre.localeCompare(a.nombre));
    }
    this.cdr.detectChanges();
  }

  aplicarFiltros() {
    const search = this.searchTerm.toLowerCase();

    this.filteredProducts = this.products.filter(p => {
      const matchCategoria = this.filtroCategoria ? p.categoria === this.filtroCategoria : true;
      const matchMarca = this.filtroMarca ? p.marca.includes(this.filtroMarca) : true;
      const matchSearch = search ? p.nombre.toLowerCase().includes(search) : true;
      return matchCategoria && matchMarca && matchSearch;
    });

    if (this.filtroPrecio === 'asc') {
      this.filteredProducts.sort((a, b) => a.precioRaw - b.precioRaw);
    } else if (this.filtroPrecio === 'desc') {
      this.filteredProducts.sort((a, b) => b.precioRaw - a.precioRaw);
    }

    this.cdr.detectChanges();
  }

  goToProducts() {
    this.activeTab = 'search';
    this.router.navigate(['/products']).then(() => this.cdr.detectChanges());
  }

  goToFavorites() {
    this.activeTab = 'favorites';
    this.router.navigate(['/favorites']).then(() => this.cdr.detectChanges());
  }

  async goToProfile() {
  const user = this.auth.currentUser;

  if (!user) {
    // No hay usuario logueado → ir a login
    this.activeTab = 'profile';
    await this.router.navigate(['/login']);
    this.cdr.detectChanges();
    return;
  }

  try {
    // Obtener el rol del usuario desde Firestore
    const userDocRef = doc(this.firestore, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const role = userData['role'] || 'user'; // 👈 ajusta el nombre del campo según tu colección

      this.activeTab = 'profile';

      if (role === 'admin') {
        await this.router.navigate(['/admin-panel']);
      } else {
        await this.router.navigate(['/profile']);
      }
    } else {
      console.warn('No se encontró el documento del usuario en Firestore');
      this.router.navigate(['/profile']); // fallback por si no hay datos
    }

    this.cdr.detectChanges();
  } catch (error) {
    console.error('Error obteniendo datos del usuario:', error);
  }
}


  goToHome() {
    this.goToProducts();
  }

  goToProductDetail(productId: string) {
  this.router.navigate(['/product-detail', productId]);
  }

}
