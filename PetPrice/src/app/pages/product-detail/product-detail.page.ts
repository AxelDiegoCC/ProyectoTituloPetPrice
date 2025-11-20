import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore, doc, getDoc, collection, addDoc, serverTimestamp,
  query, orderBy, getDocs, DocumentData, setDoc, deleteDoc, onSnapshot
} from '@angular/fire/firestore';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule, NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { ReportService } from 'src/app/services/report.service';
import { Location } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { Timestamp as FBTimestamp } from 'firebase/firestore'; // ✅ para detectar Timestamp

Chart.register(...registerables);

type Oferta = { nombre: string; precio: number; url: string };
type Review = {
  id?: string;
  productId: string;
  rating: number;
  text: string;
  userUid?: string | null;
  userName?: string | null;
  createdAt: Date;
};
type Tab = 'home' | 'explore' | 'favorites' | 'profile';
type PricePoint = { date: Date; price: number }; // ⬅️ NUEVO

@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.page.html',
  styleUrls: ['./product-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, NgIf, NgFor, FormsModule]
})
export class ProductDetailPage implements OnInit, OnDestroy, AfterViewInit {
  // Tabs (footer activo)
  activeTab: Tab = 'explore';

  product: any = null;
  productId = '';
  tiendasOrdenadas: Oferta[] = [];

  // Favoritos / UI
  isFav = false;
  private unsubFav?: () => void;

  // Auth state
  isLoggedIn = false;
  private unsubAuth?: () => void;

  // Desde dónde llegué (para back correcto)
  private fromPage: 'favorites' | 'products' | 'home' | null = null;

  // Pestañas internas
  activeInnerTab: 'desc' | 'reviews' = 'desc';

  // Reviews
  reviews: Review[] = [];
  avgRating = 0;
  totalReviews = 0;
  reviewRating = 0;
  reviewText = '';
  isSubmitting = false;

  // ===== Gráfico histórico (Chart.js) =====
  @ViewChild('priceChart', { static: false }) priceChartRef?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;
  historicoCargado = false;
  historicoLabels: string[] = [];
  historicoPrecios: number[] = [];

  // ⬅️ NUEVO: puntos crudos para el PDF (fecha/precio)
  historyPoints: PricePoint[] = [];

  // 🔽 NUEVO: histórico completo crudo (una vez comprimido por día)
  private rawHistory: { fecha: Date; precio: number }[] = [];

  // 🔽 NUEVO: estado del filtro
  filterMode: 'all' | 'custom' = 'all';
  rangeStart = ''; // 'YYYY-MM-DD'
  rangeEnd = '';

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private router: Router,
    private toastCtrl: ToastController,
    private auth: Auth,
    private report: ReportService,
    private location: Location,
    private cdr: ChangeDetectorRef // ✅ para forzar render tras *ngIf
  ) {}

  async ngOnInit() {
    this.activeTab = 'explore';

    // Guarda el "origen" (state) para decidir a dónde volver
    const navState = this.router.getCurrentNavigation()?.extras?.state as any;
    this.fromPage = (navState?.from || history.state?.from || null) as any;

    this.productId = this.route.snapshot.paramMap.get('id') || '';
    if (this.productId) {
      await this.loadProduct(this.productId);
      await this.loadReviews(this.productId);
      await this.cargarHistoricoPrecios(); // ✅ carga del histórico
    }

    // Estado de autenticación en vivo
    this.isLoggedIn = !!this.auth.currentUser;
    this.unsubAuth = onAuthStateChanged(this.auth, (user) => {
      this.isLoggedIn = !!user;

      // (Re)conectar watcher de favorito si hay sesión; cortarlo si se cerró sesión
      if (user && this.productId) {
        this.startFavWatcher();
      } else {
        if (this.unsubFav) this.unsubFav();
        this.unsubFav = undefined;
        this.isFav = false;
      }
    });

    // Si ya hay sesión en el arranque y tenemos productId, conectar watcher de fav
    if (this.isLoggedIn && this.productId) {
      await this.startFavWatcher();
    }
  }

  ngAfterViewInit() {
    // Espera a que Angular materialice el canvas controlado por *ngIf
    this.renderizarGraficoIfReady();
  }

  ngOnDestroy() {
    if (this.unsubFav) this.unsubFav();
    if (this.unsubAuth) this.unsubAuth();
    this.chart?.destroy();
  }

  // 👉 Getter para el template (botón de enviar reseña)
  get isReviewInvalid(): boolean {
    return this.isSubmitting || this.reviewRating === 0 || !this.reviewText.trim();
  }

  get bestOffer(): Oferta | null {
    return this.tiendasOrdenadas.length ? this.tiendasOrdenadas[0] : null;
  }

  async loadProduct(id: string) {
    try {
      const docRef = doc(this.firestore, 'products', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        this.product = snap.data() as DocumentData;

        const preciosMap = (this.product as any).precios || {};
        this.tiendasOrdenadas = Object.entries(preciosMap)
          .map(([nombre, datos]: [string, any]) => ({
            nombre,
            precio: Number(datos?.precio ?? 0),
            url: String(datos?.url ?? '')
          }))
          .filter(t => t.precio > 0 && !!t.url)
          .sort((a, b) => a.precio - b.precio);
      } else {
        console.warn('Producto no encontrado');
      }
    } catch (error) {
      console.error('Error cargando producto:', error);
    }
  }

  // 🔎 watcher en tiempo real del doc users/{uid}/favorites/{productId}
  private async startFavWatcher() {
    const user = this.auth.currentUser;
    if (!user || !this.productId) { this.isFav = false; return; }

    const favRef = doc(this.firestore, `users/${user.uid}/favorites/${this.productId}`);

    if (this.unsubFav) this.unsubFav();

    this.unsubFav = onSnapshot(
      favRef,
      snap => { this.isFav = snap.exists(); },
      err => { console.warn('Watcher favoritos error:', err); }
    );
  }

  async loadReviews(productId: string) {
    try {
      const colRef = collection(this.firestore, `products/${productId}/reviews`);
      const qy = query(colRef, orderBy('createdAt', 'desc'));
      const qs = await getDocs(qy);

      this.reviews = qs.docs.map(d => {
        const data = d.data() as any;
        const createdAt =
          (data.createdAt?.toDate?.() as Date) ||
          (typeof data.createdAt === 'string' ? new Date(data.createdAt) : new Date());

        return {
          id: d.id,
          productId,
          rating: Number(data.rating ?? 0),
          text: String(data.text ?? ''),
          userUid: data.userUid ?? null,
          userName: data.userName ?? null,
          createdAt
        } as Review;
      });

      this.totalReviews = this.reviews.length;
      this.avgRating = this.totalReviews > 0
        ? this.reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / this.totalReviews
        : 0;
    } catch (error) {
      console.error('Error cargando reseñas:', error);
    }
  }

  // ======= HISTÓRICO DE PRECIOS (escalonado día a día) =======

  // ✅ Asegura convertir correctamente Timestamp | string | Date a Date
  private coerceDate(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (val instanceof FBTimestamp) return val.toDate();
    // Timestamp-like (tiene toDate)
    if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Helper: devuelve inicio del día (midnight local)
  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  // Helper: parse <input type="date"> value ('YYYY-MM-DD') as local midnight Date
  private parseDateInput(isoDate: string | null): Date | null {
    if (!isoDate) return null;
    const parts = isoDate.split('-').map(n => Number(n));
    if (parts.length < 3) return null;
    const [y, m, d] = parts;
    if (!y || !m || !d) return null;
    // Construir fecha en horario local (00:00:00)
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  // Helper: devuelve fin del día (23:59:59.999)
  private endOfDay(d: Date): Date {
    const e = new Date(d);
    e.setHours(23, 59, 59, 999);
    return e;
  }

  private async cargarHistoricoPrecios() {
    try {
      if (!this.productId) return;

      const colRef = collection(this.firestore, `products/${this.productId}/historico_precios`);
      const qy = query(colRef, orderBy('fecha', 'asc'));
      const qs = await getDocs(qy);

      if (qs.empty) {
        console.warn('[Histórico] Sin documentos');
        this.rawHistory = [];
        this.historyPoints = [];
        this.historicoLabels = [];
        this.historicoPrecios = [];
        this.historicoCargado = true;
        this.cdr.detectChanges();
        this.renderizarGraficoIfReady();
        return;
      }

      const gathered: { fecha: Date; precio: number }[] = [];
      qs.forEach(snap => {
        const data = snap.data() as any;

        const fechaVal  = data.fecha ?? data.recordedAt ?? data.recorded_at;
        const precioVal = data.precio_minimo ?? data.precio ?? data.price;

        const fecha  = this.coerceDate(fechaVal);
        const precio = Number(precioVal);

        if (!fecha || !(precio > 0)) return;
        gathered.push({ fecha, precio });
      });

      // Orden ascendente (por si acaso)
      gathered.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

      // --- COMPRESIÓN POR DÍA ---
      // Si hay varios documentos el mismo día, conservamos el último (más reciente) de ese día.
      const byDay = new Map<string, { fecha: Date; precio: number }>();
      for (const r of gathered) {
        const key = this.startOfDay(r.fecha).toISOString().slice(0, 10); // 'YYYY-MM-DD'
        // Al iterar ascendente, reemplazamos hasta quedarnos con el último del día
        byDay.set(key, r);
      }
      const compressed = Array.from(byDay.values()).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

      // 👇 Guardamos el histórico completo (comprimido por día)
      this.rawHistory = compressed;

      // Por defecto, mostrar todo
      this.filterMode = 'all';
      this.rangeStart = '';
      this.rangeEnd = '';
      this.rebuildHistoryFrom(this.rawHistory);
    } catch (err) {
      console.error('Error cargando historial:', err);
      this.rawHistory = [];
      this.historyPoints = [];
      this.historicoLabels = [];
      this.historicoPrecios = [];
      this.historicoCargado = true;
      this.cdr.detectChanges();
    }
  }

  // Construye labels + precios (escalonado día a día) a partir de un arreglo filtrado
  private rebuildHistoryFrom(raw: { fecha: Date; precio: number }[]) {
    this.chart?.destroy(); // rehacer gráfico desde cero

    if (!raw.length) {
      this.historicoLabels = [];
      this.historicoPrecios = [];
      this.historyPoints = [];
      this.historicoCargado = true;
      this.cdr.detectChanges();
      return;
    }

    const labels: string[] = [];
    const precios: number[] = [];

    for (let i = 0; i < raw.length; i++) {
      const current = raw[i];
      const next = raw[i + 1];

      // start del día del punto actual
      const startDate = this.startOfDay(current.fecha);

      // si existe next, tomamos su startOfDay y rellenamos hasta el día anterior
      const nextStart = next ? this.startOfDay(next.fecha) : null;

      // fillEnd será:
      // - si existe nextStart => day before nextStart
      // - si no existe nextStart => startDate (incluye el propio día final)
      let fillEnd: Date;
      if (nextStart) {
        fillEnd = new Date(nextStart);
        fillEnd.setDate(fillEnd.getDate() - 1);
      } else {
        fillEnd = startDate;
      }

      // Si fillEnd < startDate (ej: nextStart === startDate), no iteramos (evita duplicados)
      if (fillEnd < startDate) {
        // still push the startDate once (siempre queremos ver el día actual si no se ha añadido)
        const formatted = startDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
        if (!labels.length || labels[labels.length - 1] !== formatted) {
          labels.push(formatted);
          precios.push(current.precio);
        }
        continue;
      }

      // Iterar día a día desde startDate hasta fillEnd inclusive
      let iterDate = new Date(startDate);
      while (iterDate <= fillEnd) {
        const formatted = iterDate.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
        // evitar duplicar la misma etiqueta si por alguna razón ya fue añadida
        if (!labels.length || labels[labels.length - 1] !== formatted) {
          labels.push(formatted);
          precios.push(current.precio);
        }
        iterDate.setDate(iterDate.getDate() + 1);
      }
    }

    this.historicoLabels = labels;
    this.historicoPrecios = precios;

    // para el PDF usamos solo los puntos “reales” (sin relleno)
    this.historyPoints = raw.map(r => ({ date: r.fecha, price: r.precio }));

    this.historicoCargado = true;
    this.cdr.detectChanges();
    setTimeout(() => this.renderizarGraficoIfReady());
  }

  // Botón "Todo" / modo
  applyHistoryFilter(mode: 'all' | 'custom') {
    this.filterMode = mode;

    if (mode === 'all') {
      this.rangeStart = '';
      this.rangeEnd = '';
      this.rebuildHistoryFrom(this.rawHistory);
    } else {
      // si el usuario entra a "Rango" y ya tiene fechas, aplicamos
      this.applyCustomRange();
    }
  }

  // Se llama al cambiar cualquiera de los <input type="date">
  applyCustomRange() {
    if (!this.rawHistory.length) return;
    if (!this.rangeStart || !this.rangeEnd) return;

    // Parseamos fecha como LOCAL midnight para evitar problemas timezone
    const start = this.parseDateInput(this.rangeStart);
    const endDate = this.parseDateInput(this.rangeEnd);

    if (!start || !endDate) return;

    // Convertir end al fin del día para incluir todos los timestamps de esa fecha
    const end = this.endOfDay(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      // rango inválido → no hacemos nada
      return;
    }

    // Filtrar entre start (incluido) y end (incluido fin de día)
    const filtered = this.rawHistory.filter(p =>
      p.fecha >= start && p.fecha <= end
    );

    if (!filtered.length) {
      // Rango sin datos: vaciamos gráfico
      this.rebuildHistoryFrom([]);
      return;
    }

    // Asegurar orden cronológico y reconstruir
    filtered.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    this.rebuildHistoryFrom(filtered);
  }

  private renderizarGraficoIfReady() {
    if (!this.historicoCargado) return;
    const canvas = this.priceChartRef?.nativeElement;
    if (!canvas) return;
    if (!this.historicoLabels.length || !this.historicoPrecios.length) {
      // No hay datos válidos -> no dibujar
      return;
    }
    this.renderizarGrafico(canvas);
  }

  private renderizarGrafico(canvas: HTMLCanvasElement) {
    if (this.chart) this.chart.destroy();

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: this.historicoLabels,
        datasets: [{
          label: 'Precio mínimo histórico (CLP)',
          data: this.historicoPrecios,
          borderColor: '#10b3a6',
          backgroundColor: 'rgba(16, 179, 166, 0.18)',
          tension: 0,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          stepped: 'before'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed?.y;
                return v == null ? 'Sin datos' : `Precio: $${Number(v).toLocaleString('es-CL')}`;
              }
            }
          },
          decimation: { enabled: true, algorithm: 'lttb', samples: 200 }
        },
        scales: {
          x: { title: { display: true, text: 'Fecha' } },
          y: {
            title: { display: true, text: 'Precio (CLP)' },
            ticks: { callback: (v) => '$' + Number(v).toLocaleString('es-CL') }
          }
        }
      }
    });
  }
  // ======= FIN HISTÓRICO =======

  // Bloquear selección de rating si no hay sesión
  setRating(v: number) {
    if (!this.isLoggedIn) return;
    this.reviewRating = v;
  }

  async submitReview() {
    if (!this.isLoggedIn) {
      (await this.toastCtrl.create({ message: 'Inicia sesión para comentar', duration: 1400, position: 'bottom' })).present();
      await this.safeNavigate('/login');
      return;
    }
    if (!this.productId) return;

    const text = (this.reviewText || '').trim();
    if (this.reviewRating <= 0 || !text) {
      const t = await this.toastCtrl.create({ message: 'Selecciona una calificación y escribe tu opinión.', duration: 1400, position: 'bottom' });
      t.present(); return;
    }

    this.isSubmitting = true;
    try {
      const user = this.auth.currentUser!;
      const colRef = collection(this.firestore, `products/${this.productId}/reviews`);

      await addDoc(colRef, {
        productId: this.productId,
        rating: this.reviewRating,
        text,
        userUid: user.uid,
        userName: user.displayName || user.email || 'Usuario',
        createdAt: serverTimestamp()
      });

      this.reviewRating = 0;
      this.reviewText = '';
      (await this.toastCtrl.create({ message: '¡Gracias! Tu opinión fue publicada.', duration: 1400, position: 'bottom' })).present();
      await this.loadReviews(this.productId);
    } catch (error) {
      console.error('Error publicando opinión:', error);
      (await this.toastCtrl.create({ message: 'No se pudo publicar. Intenta nuevamente.', duration: 1600, position: 'bottom', color: 'danger' })).present();
    } finally {
      this.isSubmitting = false;
    }
  }

  onImageError(event: any) { event.target.src = 'assets/img/no-image.png'; }

  // === BACK inteligente
  goBack() {
    if (this.fromPage === 'favorites') {
      this.safeNavigate('/favorites'); return;
    }
    if (window.history.length > 1) { this.location.back(); return; }
    this.safeNavigate('/products');
  }

  goToProducts() { this.goBack(); }
  setInnerTab(tab: 'desc' | 'reviews') { this.activeInnerTab = tab; }

  async toggleFavorite() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        (await this.toastCtrl.create({ message: 'Inicia sesión para usar favoritos', duration: 1400, position: 'bottom' })).present();
        await this.safeNavigate('/login');
        return;
      }
      if (!this.productId || !this.product) return;

      const favRef = doc(this.firestore, `users/${user.uid}/favorites/${this.productId}`);

      if (!this.isFav) {
        await setDoc(favRef, {
          title: this.product?.nombre || 'Producto',
          price: this.bestOffer?.precio ?? 0,
          image: this.product?.imagen || 'assets/img/no-image.png',
          productId: this.productId,
          createdAt: serverTimestamp()
        }, { merge: true });

        (await this.toastCtrl.create({ message: 'Agregado a favoritos', duration: 1200, position: 'bottom' })).present();
      } else {
        await deleteDoc(favRef);
        (await this.toastCtrl.create({ message: 'Eliminado de favoritos', duration: 1200, position: 'bottom' })).present();
      }
      // isFav se actualizará por onSnapshot
    } catch (e) {
      console.error('Error al alternar favorito:', e);
      (await this.toastCtrl.create({ message: 'No se pudo actualizar favorito', duration: 1500, position: 'bottom', color: 'danger' })).present();
    }
  }

  async goToLogin() { await this.safeNavigate('/login'); }

  async goToHome()      { this.activeTab = 'home';      await this.safeNavigate('/home'); }
  async goToExplore()   { this.activeTab = 'explore';   await this.safeNavigate('/products'); }
  async goToFavorites() { this.activeTab = 'favorites'; await this.safeNavigate('/favorites'); }
  async goToProfile()   {
    this.activeTab = 'profile';
    const user = (this.auth as any)?.currentUser;
    if (!user) { await this.safeNavigate('/login'); return; }
    try {
      const snap = await getDoc(doc(this.firestore, 'users', user.uid));
      const role = snap.exists() ? ((snap.data() as any).role || 'user') : 'user';
      await this.safeNavigate(role === 'admin' ? '/admin-panel' : '/profile');
    } catch {
      await this.safeNavigate('/profile');
    }
  }

  private async safeNavigate(target: string, queryParams?: Record<string, any>) {
    const current = this.router.url.split('?')[0].split('#')[0];
    if (current !== target || queryParams) {
      await this.router.navigate([target], queryParams ? { queryParams } : undefined);
    }
  }

  async downloadReport() {
    try {
      if (!this.productId || !this.product) {
        (await this.toastCtrl.create({ message: 'No hay producto cargado.', duration: 1200, position: 'bottom', color: 'warning' })).present();
        return;
      }
      const blob = await this.report.generateProductReport({
        product: this.product,
        bestOffer: this.bestOffer,
        tiendas: this.tiendasOrdenadas,
        avgRating: this.avgRating,
        totalReviews: this.totalReviews,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        history: this.historyPoints // ⬅️ NUEVO: historial para el gráfico del PDF
      });

      const fileName = `Reporte_${(this.product?.nombre || 'producto').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}.pdf`;

      if (Capacitor.getPlatform() === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        (await this.toastCtrl.create({ message: 'Reporte descargado.', duration: 1200, position: 'bottom' })).present();
        return;
      }

      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const base64 = await this.blobToBase64(blob);
      await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Documents });
      (await this.toastCtrl.create({ message: 'Reporte guardado en Documentos.', duration: 1400, position: 'bottom' })).present();
    } catch (error) {
      console.error('Error generando/guardando reporte:', error);
      (await this.toastCtrl.create({ message: 'No se pudo generar el reporte.', duration: 1600, position: 'bottom', color: 'danger' })).present();
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }
}
