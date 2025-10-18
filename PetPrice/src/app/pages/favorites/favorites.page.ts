import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.page.html',
  styleUrls: ['./favorites.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class FavoritesPage implements OnInit {
  activeTab: 'search' | 'favorites' | 'profile' = 'favorites';

  constructor(
    private router: Router,
    private auth: Auth,
    private firestore: Firestore,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {}

  ionViewWillEnter() {
    this.activeTab = 'favorites';
    this.cdr.detectChanges();
  }

  async goToProducts() {
    this.activeTab = 'search';
    await this.router.navigate(['/products']);
    this.cdr.detectChanges();
  }

  async goToFavorites() {
    // ya estás aquí; no navega
    this.activeTab = 'favorites';
    this.cdr.detectChanges();
  }

  async goToProfile() {
    await this.navigateToProfileByRole();
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
    } catch (e) {
      // fallback seguro
      await this.router.navigate(['/profile']);
    }
  }
}
