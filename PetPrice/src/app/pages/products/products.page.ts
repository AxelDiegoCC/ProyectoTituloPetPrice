import { Component, ChangeDetectorRef } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore, collection, getDocs, DocumentData, doc, getDoc,
  onSnapshot, setDoc, deleteDoc, CollectionReference, query, orderBy as fbOrderBy
} from '@angular/fire/firestore';
import { onAuthStateChanged } from 'firebase/auth';

type Tab = 'home' | 'explore' | 'favorites' | 'profile';

@Component({
  selector: 'app-products',
  templateUrl: './products.page.html',
  styleUrls: ['./products.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ProductsPage {
  activeTab: Tab = 'explore';

  products: any[] = [];
  filteredProducts: any[] = [];

  // ====== búsqueda / orden ======
  searchTerm = '';
  orderIdx = 0;

  // ====== sheet filtros ======
  filtersOpen = false;

  categories: string[] = ['perro', 'gato'];
  selectedCategories = new Set<string>();

  brands: string[] = [];
  selectedBrands = new Set<string>();

  priceMin = 0;
  priceMax = 0;
  priceStep = 100;
  priceRange = { lower: 0, upper: 0 };

  previewCount = 0;

  // ====== LOGIN / FAVORITOS ======
  isLoggedIn = false;
  private favIds = new Set<string>();
  private favUnsub?: () => void;
  private offAuth?: () => void;

  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore,
    private cdr: ChangeDetectorRef,
  ) {}

  ionViewWillEnter() {
    this.activeTab = 'explore';
    this.isLoggedIn = !!this.auth.currentUser;

    // Escucha de auth en vivo
    if (!this.offAuth) {
      this.offAuth = onAuthStateChanged(this.auth, (u) => {
        this.isLoggedIn = !!u;
        this.subscribeUserFavorites();   // re-suscribe según usuario
        this.markFavoritesOnLists();     // limpia/marca iconos en UI
        this.cdr.detectChanges();
      });
    }

    this.loadProducts();
    this.subscribeUserFavorites();
  }

  ionViewWillLeave() {
    if (this.favUnsub) { this.favUnsub(); this.favUnsub = undefined; }
  }

  // ====== carga ======
  async loadProducts() {
    try {
      const ref = collection(this.firestore, 'products');
      const snap = await getDocs(query(ref, fbOrderBy('last_updated', 'desc')));

      this.products = snap.docs.map(d => {
        const data: any = d.data() as DocumentData;
        const precioNumber = Number(data.precio_minimo) || 0;
        const tiendasCount = data.precios ? Object.keys(data.precios).length : 0;

        return {
          id: d.id,
          nombre: data.nombre || '',
          marca: (data.marca || '').toString(),
          categoria: (data.categoria || '').toString().toLowerCase(),
          imagen: data.imagen || '',
          precioRaw: precioNumber,
          precio: new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(precioNumber),
          tiendasCount,
          isFav: this.favIds.has(d.id),
          ratingAvg: 0,
          ratingCount: 0
        };
      });

      await this.loadRatingsForProducts(this.products);

      const catSet = new Set(this.products.map(p => p.categoria).filter(Boolean));
      if (catSet.size) this.categories = Array.from(catSet);

      const brandSet = new Set(this.products.map(p => (p.marca || '').toString()).filter(Boolean));
      this.brands = Array.from(brandSet).sort((a, b) => a.localeCompare(b));

      const precios = this.products.map(p => p.precioRaw).filter(n => Number.isFinite(n));
      this.priceMin = precios.length ? Math.min(...precios) : 0;
      this.priceMax = precios.length ? Math.max(...precios) : 0;

      const span = Math.max(1, this.priceMax - this.priceMin);
      this.priceStep = Math.max(100, Math.round(span / 100));
      this.priceRange = { lower: this.priceMin, upper: this.priceMax };

      this.applyAll();
    } catch (e) {
      console.error('Error cargando productos', e);
    }
  }

  // ⭐ ratings
  private async loadRatingsForProducts(list: any[]) {
    try {
      await Promise.all(list.map(async (p) => {
        const reviewsCol = collection(this.firestore, `products/${p.id}/reviews`);
        const reviewsSnap = await getDocs(reviewsCol);
        let sum = 0, count = 0;
        reviewsSnap.forEach(r => {
          const data = r.data() as any;
          const rating = Number(data.rating || 0);
          if (rating > 0) { sum += rating; count++; }
        });
        p.ratingCount = count;
        p.ratingAvg = count ? (sum / count) : 0;
      }));
    } catch (e) {
      console.warn('No se pudieron cargar algunos ratings:', e);
    }
  }

  starName(avg: number, index: number): 'star' | 'star-half' | 'star-outline' {
    if (avg >= index) return 'star';
    if (avg >= index - 0.5) return 'star-half';
    return 'star-outline';
  }

  // ====== FAVORITOS ======
  private subscribeUserFavorites() {
    // Limpia suscripción previa
    if (this.favUnsub) { this.favUnsub(); this.favUnsub = undefined; }

    const user = this.auth.currentUser;
    if (!user) {
      // no logueado → limpiar marcas
      this.favIds.clear();
      this.markFavoritesOnLists();
      return;
    }

    const col = collection(this.firestore, `users/${user.uid}/favorites`) as CollectionReference<DocumentData>;
    this.favUnsub = onSnapshot(col, (snap) => {
      this.favIds.clear();
      snap.forEach(d => this.favIds.add(d.id));
      this.markFavoritesOnLists();
      this.cdr.detectChanges();
    });
  }

  private markFavoritesOnLists() {
    const mark = (arr: any[]) => arr.forEach(p => p.isFav = this.favIds.has(p.id));
    mark(this.products);
    mark(this.filteredProducts);
  }

  async toggleFavorite(p: any) {
    const user = this.auth.currentUser;
    if (!user) { await this.safeNavigate('/login'); return; }

    const ref = doc(this.firestore, `users/${user.uid}/favorites/${p.id}`);
    const isFav = this.favIds.has(p.id);

    if (isFav) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        title: p.nombre,
        price: p.precioRaw,
        image: p.imagen,
        brand: p.marca,
        updatedAt: Date.now()
      });
    }
  }

  // ====== búsqueda / orden ======
  onSearchTermChange() { this.applyAll(); }

  cycleOrder() { this.orderIdx = (this.orderIdx + 1) % 4; this.applyAll(); }

  private sortCurrent(list: any[]) {
    switch (this.orderIdx) {
      case 0: return list.sort((a, b) => b.precioRaw - a.precioRaw);
      case 1: return list.sort((a, b) => a.precioRaw - b.precioRaw);
      case 2: return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      case 3: return list.sort((a, b) => b.nombre.localeCompare(a.nombre));
      default: return list;
    }
  }

  // ====== filtros ======
  openFilters() { this.filtersOpen = true; this.previewCount = this.computeFilteredPreview().length; }
  closeFilters() { this.filtersOpen = false; }
  onFilterChange() { this.previewCount = this.computeFilteredPreview().length; }

  toggleCategory(cat: string, ev: Event) {
    (ev.target as HTMLInputElement).checked ? this.selectedCategories.add(cat) : this.selectedCategories.delete(cat);
    this.onFilterChange();
  }
  toggleBrand(brand: string, ev: Event) {
    (ev.target as HTMLInputElement).checked ? this.selectedBrands.add(brand) : this.selectedBrands.delete(brand);
    this.onFilterChange();
  }

  applyFiltersAndClose() { this.applyAll(); this.closeFilters(); }

  private computeFilteredPreview() {
    const term = this.searchTerm.trim().toLowerCase();
    const hasCat = this.selectedCategories.size > 0;
    const hasBrand = this.selectedBrands.size > 0;

    return this.products.filter(p => {
      const matchTerm = term ? (p.nombre.toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term)) : true;
      const matchCat = hasCat ? this.selectedCategories.has(p.categoria) : true;
      const matchBrand = hasBrand ? this.selectedBrands.has(p.marca) : true;
      const matchPrice = p.precioRaw >= this.priceRange.lower && p.precioRaw <= this.priceRange.upper;
      return matchTerm && matchCat && matchBrand && matchPrice;
    });
  }

  private applyAll() {
    this.filteredProducts = this.computeFilteredPreview();
    this.sortCurrent(this.filteredProducts);
    this.markFavoritesOnLists();
    this.previewCount = this.filteredProducts.length;
    this.cdr.detectChanges();
  }

  // ====== Nav tabs ======
  async goToHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goToProducts()  { this.activeTab = 'explore';   await this.safeNavigate('/products'); }
  async goToFavorites() { this.activeTab = 'favorites'; await this.safeNavigate('/favorites'); }

  async goToProfile() {
    const user = this.auth.currentUser;
    if (!user) { this.activeTab = 'profile'; await this.safeNavigate('/login'); return; }
    const snap = await getDoc(doc(this.firestore, 'users', user.uid));
    const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
    this.activeTab = 'profile';
    await this.safeNavigate(role === 'admin' ? '/admin-panel' : '/profile');
  }

  // ⬇️ Pasamos state para que el detalle sepa volver al catálogo
  goToProductDetail(id: string) {
    this.router.navigate(['/product-detail', id], {
      state: { from: 'products' }
    });
  }

  private async safeNavigate(target: string) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target) {
      await this.router.navigate([target]);
      this.cdr.detectChanges();
    }
  }
}
