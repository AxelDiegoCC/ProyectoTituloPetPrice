import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.page.html',
  styleUrls: ['./product-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class ProductDetailPage implements OnInit {
  product: any = null;
  productId: string = '';
  tiendasOrdenadas: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private router: Router,
  ) {}

  async ngOnInit() {
    this.productId = this.route.snapshot.paramMap.get('id') || '';
    if (this.productId) {
      await this.loadProduct(this.productId);
    }
  }

  async loadProduct(id: string) {
    try {
      const docRef = doc(this.firestore, 'products', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        this.product = docSnap.data();

        // 🔹 Convertir el mapa de precios en arreglo
        const preciosMap = this.product.precios || {};
        this.tiendasOrdenadas = Object.entries(preciosMap)
          .map(([nombre, datos]: [string, any]) => ({
            nombre,
            precio: datos?.precio || 0,
            url: datos?.url || ''
          }))
          .filter(t => t.precio > 0 && t.url !== '') // Filtra valores válidos
          .sort((a, b) => a.precio - b.precio); // Ordenar por precio ascendente

        console.log("🛍️ Tiendas encontradas:", this.tiendasOrdenadas);
      } else {
        console.warn('Producto no encontrado');
      }
    } catch (error) {
      console.error('Error cargando producto:', error);
    }
  }

  onImageError(event: any) {
    event.target.src = 'assets/img/no-image.png';
  }

  goToProducts() { this.router.navigate(['/products']); }
}
